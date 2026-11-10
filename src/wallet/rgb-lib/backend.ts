import { isEngineError } from '@utexo/rgb-sdk-core';
import type { Network, RefreshTransfersResult } from '@utexo/rgb-sdk-core';
import type { ReceiveParams } from '../types';
import { getRgbLibBinding, assertRuntime } from './native';
import type { NativeRuntimeInfo, Spec } from '../../native/NativeRgbLib';
import { toNativeNetwork } from '../../native/network-name';
import { readRgbLibMnemonic, resolveRgbLibKeys } from './key-provider';
import type { ResolvedRgbLibKeys, RgbLibKeys } from './key-provider';
import type { OnchainWalletBackend, WalletIdentity } from '../wallet-api';
import { CleanupFailure, WalletBackendError } from '../wallet-errors';
import {
  ValidationError,
  validateBurnParams,
  validateConsignmentLookup,
} from '@utexo/rgb-sdk-core';
import { SerialExecutor } from '../runtime/serial-executor';
import { snapshot } from '../runtime/snapshot';
import {
  resolveReceiveAssignment,
  validateAssetSchemas,
  localFilePath,
} from '../operations/validation';
import {
  configEquals,
  integer,
  resolveRgbLibConfig,
  validateWalletParams,
} from './config';
import type {
  ResolvedRgbLibConfig,
  RgbLibUnlockParams,
  RgbLibWalletParams,
} from './config';
import { feeRate, issuanceAmounts, u64 } from './amounts';
import * as map from './mappers';
import { guardNative, toArgumentError, toPublicError } from './errors';

/** A handle already removed by native needs no further close call. */
async function closeHandle(native: Spec, handle: string): Promise<void> {
  try {
    await native.closeWallet(handle);
  } catch (error) {
    // Checked by shape: the error may come from another copy of the SDK.
    if (!isEngineError(error, 'WALLET_NOT_INITIALIZED')) throw error;
  }
}

/** One backend owns one native handle, one queue, and one immutable wallet profile. */
/**
 * Reads that sync first need a connection. With `skipSync: true` they read
 * the stored state, which native rgb-lib allows without one: so they work
 * offline, also on networks without default endpoints (regtest).
 */
const syncs = (options: { skipSync?: boolean } | null | undefined) =>
  !skipSyncOf(options?.skipSync);

/**
 * The one reading of a `skipSync` flag: omitted or null is `false`; anything
 * but a boolean is an INVALID_PARAMS before admission, so the same value
 * decides the connection and reaches native.
 */
function skipSyncOf(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'boolean')
    throw new ValidationError('skipSync must be a boolean', 'skipSync');
  return value;
}

/** Drops fields set to `undefined`, so they do not override a configured value. */
function definedOnly<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

/** One native refresh, mapped; shared by `refresh` and its compat aliases. */
async function refreshed(
  native: Spec,
  handle: string,
  skipSync: boolean
): Promise<RefreshTransfersResult> {
  return {
    transfers: Object.fromEntries(
      (await native.refresh(handle, skipSync)).map((item) => [
        item.batchTransferIdx,
        {
          updatedStatus:
            item.updatedStatus === null
              ? undefined
              : map.transferStatus(item.updatedStatus),
          failure:
            item.failure === null
              ? undefined
              : map.refreshFailure(item.failure),
        },
      ])
    ),
  };
}

export class RgbLibWalletBackend implements OnchainWalletBackend<RgbLibUnlockParams> {
  private readonly queue = new SerialExecutor();
  private readonly params: Readonly<Omit<RgbLibWalletParams, 'online'>>;
  /** The constructor's `online`, owned and validated; read on every connect. */
  private readonly configuredOnline?: Readonly<RgbLibUnlockParams>;
  private handle?: string;
  private native?: Spec;
  private runtime?: NativeRuntimeInfo;
  private online?: ResolvedRgbLibConfig;
  private identity?: WalletIdentity;
  private opening?: Promise<void>;
  private connecting?: { config: ResolvedRgbLibConfig; promise: Promise<void> };
  private stopping?: Promise<void>;
  /**
   * Operations accepted but not yet settled. A close waits for all of them,
   * including an accepted operation's own lazy connect step.
   */
  private readonly accepted = new Set<Promise<unknown>>();
  private stopRequested = false;
  /**
   * init() failed and so did closing its handle. The handle is kept only so
   * that shutdown()/destroy() can retry the close; no operation may use it.
   */
  private sessionFailed = false;
  private disposeRequested = false;
  private disposed = false;
  private readonly keys: ResolvedRgbLibKeys;

  constructor(
    params: RgbLibWalletParams,
    keys: RgbLibKeys,
    private readonly loadBinding: () => Spec = getRgbLibBinding
  ) {
    validateWalletParams(params);
    this.keys = resolveRgbLibKeys(keys, params.network);
    const { online, ...rest } = params;
    this.params = Object.freeze(rest);
    if (online !== undefined) {
      if (online === null || typeof online !== 'object')
        throw new WalletBackendError(
          'INVALID_CONFIG',
          'online must be an object',
          undefined,
          'RGB_L1'
        );
      const owned = Object.freeze(definedOnly(snapshot(online)));
      // Invalid endpoints fail here, not on the first online operation.
      resolveRgbLibConfig(owned, params.network);
      this.configuredOnline = owned;
    }
  }

  /** Opened from public keys alone: it cannot sign. */
  private get watchOnly(): boolean {
    return !this.keys.readMnemonic;
  }

  /**
   * The wallet configuration can sign transactions (it has a mnemonic
   * source). It does not promise that a signing call succeeds.
   */
  get canSignTransactions(): boolean {
    return !this.watchOnly;
  }

  private assertAccepting() {
    if (this.disposeRequested || this.disposed) {
      throw new WalletBackendError(
        'WALLET_DISPOSED',
        'This wallet session is disposed',
        undefined,
        'RGB_L1'
      );
    }
    if (this.stopRequested) {
      throw new WalletBackendError(
        'WALLET_STOPPING',
        'Wallet cleanup is in progress',
        undefined,
        'RGB_L1'
      );
    }
  }

  /** Accepted work that reaches a session whose init() failed. */
  private failedSessionError(operation: string): WalletBackendError {
    return new WalletBackendError(
      'WALLET_STOPPING',
      'Wallet initialization failed; call shutdown() or destroy() to release it',
      operation,
      'RGB_L1'
    );
  }

  /** Registers an accepted operation until it settles; see `close()`. */
  private track<T>(promise: Promise<T>): Promise<T> {
    this.accepted.add(promise);
    const settle = () => {
      this.accepted.delete(promise);
    };
    void promise.then(settle, settle);
    return promise;
  }

  /**
   * A public operation group whose methods never throw synchronously: a throw
   * while reading arguments (destructuring, snapshot, a throwing getter)
   * becomes a rejection, normalized under the method name. The methods in
   * `sync` return plain values and are left as they are.
   */
  private guarded<G extends object>(group: G, sync: readonly string[] = []): G {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(group)) {
      out[key] =
        typeof value !== 'function' || sync.includes(key)
          ? value
          : (...args: unknown[]) => {
              try {
                return value(...args);
              } catch (error) {
                return Promise.reject(toArgumentError(error, key));
              }
            };
    }
    return out as G;
  }

  /** Every rejection of a public operation goes through toPublicError once. */
  private publicly<T>(operation: string, promise: Promise<T>): Promise<T> {
    return promise.catch((error: unknown) => {
      throw toPublicError(error, operation);
    });
  }

  /** Public entry: admission check, then the tracked operation. */
  private run<T>(
    operation: string,
    requiresOnline: boolean,
    action: (native: Spec, handle: string) => Promise<T>
  ): Promise<T> {
    try {
      this.assertAccepting();
    } catch (error) {
      return Promise.reject(toPublicError(error, operation));
    }
    return this.publicly(
      operation,
      this.track(this.execute(operation, requiresOnline, action))
    );
  }

  /** The operation itself, without an admission check. Callers are already accepted. */
  private execute<T>(
    operation: string,
    requiresOnline: boolean,
    action: (native: Spec, handle: string) => Promise<T>
  ): Promise<T> {
    // Connect before entering the queue: the connect step queues its own native call.
    const ready = requiresOnline
      ? this.connectLazily(operation)
      : Promise.resolve();
    return ready.then(() =>
      this.queue.run(async () => {
        if (this.sessionFailed) throw this.failedSessionError(operation);
        if (!this.handle || !this.native) {
          throw new WalletBackendError(
            'WALLET_NOT_INITIALIZED',
            'Call init() before this operation',
            operation,
            'RGB_L1'
          );
        }
        if (requiresOnline && !this.online) {
          throw new WalletBackendError(
            'WALLET_OFFLINE',
            'Call goOnline() before this operation',
            operation,
            'RGB_L1'
          );
        }
        return action(this.native, this.handle);
      })
    );
  }

  /**
   * goOnline() is optional: the first operation that needs a connection makes
   * one with the network defaults. An explicit goOnline(params) that is
   * already connecting is awaited instead.
   */
  private async connectLazily(operation: string): Promise<void> {
    // Read through a function: the state changes across the await below.
    const pending = () => this.connecting?.promise;
    if (this.online) return;
    if (pending()) return pending();
    // An init() in progress is awaited; without one, the queue reports
    // WALLET_NOT_INITIALIZED for the operation itself.
    if (this.opening) await this.opening.catch(() => undefined);
    if (this.sessionFailed) throw this.failedSessionError(operation);
    if (this.online || !this.handle) return;
    if (pending()) return pending();
    // Regtest stacks are local and differ per setup, so they are never guessed:
    // only the constructor's `online` connects a regtest wallet lazily.
    let defaults: ResolvedRgbLibConfig | undefined;
    if (this.configuredOnline) {
      defaults = resolveRgbLibConfig(
        this.configuredOnline,
        this.params.network
      );
    } else if (this.params.network !== 'regtest') {
      try {
        defaults = resolveRgbLibConfig({}, this.params.network);
      } catch {
        defaults = undefined;
      }
    }
    if (!defaults) {
      throw new WalletBackendError(
        'WALLET_OFFLINE',
        `${operation} needs a connection; on ${this.params.network} call goOnline(params) with the indexer and proxy first, or pass them as \`online\` to the constructor`,
        operation,
        'RGB_L1'
      );
    }
    // Part of the accepted operation: a close requested meanwhile must not
    // reject this step as new work.
    return this.connect(defaults);
  }

  /** Like input(), for an optional options object (may be undefined). */
  private withOptions<O, T>(
    operation: string,
    // A function decides from the owned options, so a getter is read once.
    requiresOnline: boolean | ((owned: O | undefined) => boolean),
    options: O | undefined,
    action: (native: Spec, handle: string, owned: O | undefined) => Promise<T>
  ): Promise<T> {
    if (
      // null was always read like "no options"; keep accepting it.
      options != null &&
      typeof options !== 'object'
    )
      throw new ValidationError(
        `${operation} options must be an object`,
        'options'
      );
    const owned = snapshot(options);
    const online =
      typeof requiresOnline === 'function'
        ? requiresOnline(owned)
        : requiresOnline;
    return this.run(operation, online, (native, handle) =>
      action(native, handle, owned)
    );
  }

  /**
   * A public operation with a params object. Before admission, and so before
   * any lazy connect or native call (decision 7): the params are owned
   * (snapshot), a signing operation on a watch-only wallet is refused, and
   * `prepare` validates them once and converts what it can. The action gets
   * both the owned params and the prepared values.
   */
  private input<P, T>(
    operation: string,
    requiresOnline: boolean,
    params: P,
    action: (native: Spec, handle: string, owned: P) => Promise<T>
  ): Promise<T> {
    return this.checked(operation, requiresOnline, params, {}, action);
  }

  /** input() with rules; they come before the action so `R` is inferred. */
  private checked<P, T, R = undefined>(
    operation: string,
    requiresOnline: boolean,
    params: P,
    rules: { signs?: boolean; prepare?: (owned: P) => R },
    action: (native: Spec, handle: string, owned: P, prepared: R) => Promise<T>
  ): Promise<T> {
    if (typeof params !== 'object' || params === null)
      throw new ValidationError(`${operation} needs a params object`, 'params');
    const owned = snapshot(params);
    // Before admission and any connect; actions read it with skipSyncOf again.
    skipSyncOf((owned as { skipSync?: unknown }).skipSync);
    if (rules.signs && this.watchOnly) throw this.watchOnlyError(operation);
    const prepared = rules.prepare?.(owned) as R;
    return this.run(operation, requiresOnline, (native, handle) =>
      action(native, handle, owned, prepared)
    );
  }

  private watchOnlyError(operation: string): WalletBackendError {
    return new WalletBackendError(
      'UNSUPPORTED_CAPABILITY',
      `${operation} needs the mnemonic; this RGB_L1 wallet was opened watch-only from public keys`,
      operation,
      'RGB_L1'
    );
  }

  private init(): Promise<void> {
    try {
      this.assertAccepting();
    } catch (error) {
      return Promise.reject(error);
    }
    return this.open();
  }

  /**
   * Stop, then start again, as one accepted operation: admission is checked
   * and the config resolved once, here. The open is queued at once and the
   * connect after it runs without a second admission check, so a shutdown
   * requested meanwhile waits for the whole restart instead of cutting it off.
   */
  private reinit(params?: RgbLibUnlockParams): Promise<void> {
    let config: ResolvedRgbLibConfig | undefined;
    try {
      config = params ? this.readConfig(params, 'reinit') : undefined;
    } catch (error) {
      return Promise.reject(error);
    }
    // From the admission check to track() no caller code runs, so a shutdown
    // can never fall between them.
    try {
      this.assertAccepting();
      if (this.handle || this.opening) {
        throw new WalletBackendError(
          'WALLET_INVALID_STATE',
          'Call shutdown() before reinit()',
          undefined,
          'RGB_L1'
        );
      }
    } catch (error) {
      return Promise.reject(error);
    }
    const opening = this.open();
    const resolved = config;
    return this.track(
      resolved ? opening.then(() => this.connect(resolved)) : opening
    );
  }

  /** Opens the native wallet. No admission check: callers are accepted. */
  private open(): Promise<void> {
    if (this.opening) return this.opening;
    if (this.handle) return Promise.resolve();
    const opening = this.queue.run(async () => {
      // Native rejections become WalletBackendError before any caller sees them.
      const native = guardNative(this.loadBinding());
      const runtime = await native.getRuntimeInfo();
      assertRuntime(runtime);
      // Keep the public deployment name, but use the same chain mapping as RLN.
      // Passing "utexo" directly selects custom signet (sbc) in these bindings.
      const nativeNetwork = toNativeNetwork(this.params.network);
      // Without a mnemonic source the wallet opens watch-only from public keys.
      // The reader's result is not cached between sessions.
      let mnemonic: string | null = this.keys.readMnemonic
        ? await readRgbLibMnemonic(this.keys.readMnemonic, 'init')
        : null;
      const publicKeys = this.keys.publicKeys;
      let handle: string;
      try {
        handle = await native.openWallet(
          this.params.storageDirPath,
          nativeNetwork,
          mnemonic,
          publicKeys?.accountXpubVanilla ?? null,
          publicKeys?.accountXpubColored ?? null,
          publicKeys?.masterFingerprint ?? null,
          this.params.witnessVersion ?? 'taproot',
          this.params.maxAllocationsPerUtxo ?? 5,
          this.params.reuseAddresses ?? false
        );
      } finally {
        mnemonic = null;
      }
      this.native = native;
      this.handle = handle;
      try {
        const identity = await native.getWalletIdentity(handle);
        if (!identity.id || identity.network !== nativeNetwork) {
          throw new WalletBackendError(
            'WALLET_CONFIG_MISMATCH',
            'Native wallet identity does not match the profile',
            undefined,
            'RGB_L1'
          );
        }
        this.identity = {
          id: identity.id,
          network: this.params.network as Network,
          protocol: 'RGB_L1',
        };
        this.runtime = runtime;
      } catch (error) {
        // Keep ownership if cleanup fails. A subsequent dispose/shutdown can retry it.
        try {
          await closeHandle(native, handle);
          this.handle = undefined;
          this.native = undefined;
        } catch (cleanupError) {
          this.stopRequested = true;
          this.sessionFailed = true;
          // Keep both errors (§5 #7): the code says what to do next.
          const failure = new CleanupFailure(error, cleanupError);
          throw new WalletBackendError(
            'WALLET_STOPPING',
            `init failed (${failure.message}); call shutdown() or destroy() to retry the cleanup`,
            'init',
            'RGB_L1',
            failure
          );
        }
        throw error;
      }
    });
    this.opening = opening;
    void opening.then(
      () => {
        if (this.opening === opening) this.opening = undefined;
      },
      () => {
        if (this.opening === opening) this.opening = undefined;
      }
    );
    return opening;
  }

  /** rgb-lib's goOnline; the contract's unlock() is the same call. */
  private goOnline(
    params: RgbLibUnlockParams | undefined,
    operation: 'goOnline' | 'unlock'
  ): Promise<void> {
    let config: ResolvedRgbLibConfig;
    try {
      // Caller code (getters) runs here, before admission; see reinit().
      config = this.readConfig(params, operation);
      this.assertAccepting();
    } catch (error) {
      return Promise.reject(error);
    }
    return this.track(this.connect(config));
  }

  /**
   * Reads a caller's online config once, before admission. A failure without
   * a code (a throwing getter) is an argument error, not a native one.
   */
  private readConfig(
    params: RgbLibUnlockParams | undefined,
    operation: string
  ): ResolvedRgbLibConfig {
    try {
      return resolveRgbLibConfig(
        this.withConfigured(params === undefined ? {} : snapshot(params)),
        this.params.network
      );
    } catch (error) {
      throw toArgumentError(error, operation);
    }
  }
  /**
   * Explicit fields override the constructor's `online` one by one; an
   * explicit indexer (either form) replaces both indexer fields.
   */
  private withConfigured(owned: RgbLibUnlockParams): RgbLibUnlockParams {
    // null keeps failing validation as before.
    if (!this.configuredOnline || owned === null) return owned;
    const explicit = definedOnly(owned);
    const base: Record<string, unknown> = { ...this.configuredOnline };
    if ('indexer' in explicit || 'indexerUrl' in explicit) {
      delete base.indexer;
      delete base.indexerUrl;
    }
    return { ...base, ...explicit } as RgbLibUnlockParams;
  }

  /** Connects with a resolved config. No admission check: callers are accepted. */
  private connect(config: ResolvedRgbLibConfig): Promise<void> {
    if (this.connecting) {
      return configEquals(this.connecting.config, config)
        ? this.connecting.promise
        : Promise.reject(
            new WalletBackendError(
              'WALLET_CONFIG_MISMATCH',
              'A different online configuration is already connecting',
              undefined,
              'RGB_L1'
            )
          );
    }
    if (this.online) {
      return configEquals(this.online, config)
        ? Promise.resolve()
        : Promise.reject(
            new WalletBackendError(
              'WALLET_CONFIG_MISMATCH',
              'Restart the wallet to change its online configuration',
              undefined,
              'RGB_L1'
            )
          );
    }
    const connecting = this.execute(
      'goOnline',
      false,
      async (native, handle) => {
        const auth =
          config.indexer.type === 'bitcoind' ? config.indexer.auth : undefined;
        await native.goOnline(
          handle,
          config.indexer.type,
          config.indexer.url,
          auth?.username ?? null,
          auth?.password ?? null,
          auth?.cookieFile ?? null,
          Object.keys(config.evmRpcUrls),
          Object.keys(config.evmRpcUrls).map((id) => config.evmRpcUrls[id]!),
          Object.keys(config.evmRpcUrls).map((id) =>
            String(config.evmMintLockBlocks[id]!.min)
          ),
          Object.keys(config.evmRpcUrls).map((id) =>
            String(config.evmMintLockBlocks[id]!.max)
          ),
          Object.keys(config.proxyAuthKeys),
          Object.values(config.proxyAuthKeys)
        );
        this.online = config;
      }
    );
    this.connecting = { config, promise: connecting };
    void connecting.then(
      () => {
        if (this.connecting?.promise === connecting)
          this.connecting = undefined;
      },
      () => {
        if (this.connecting?.promise === connecting)
          this.connecting = undefined;
      }
    );
    return connecting;
  }

  private close(terminal: boolean): Promise<void> {
    if (terminal) this.disposeRequested = true;
    if (this.disposed) return Promise.resolve();
    this.stopRequested = true;
    if (this.stopping) return this.stopping;
    // New work is rejected from here on. Work accepted before this call may
    // not have reached the queue yet (it can be waiting for its connect step),
    // so wait for it to settle before queueing the close.
    const accepted = [...this.accepted];
    const stopping = Promise.allSettled(accepted).then(() =>
      this.queue.run(async () => {
        if (this.handle && this.native)
          await closeHandle(this.native, this.handle);
        this.handle = undefined;
        this.native = undefined;
        this.runtime = undefined;
        this.identity = undefined;
        this.online = undefined;
        this.disposed = this.disposeRequested;
        this.stopRequested = false;
        this.sessionFailed = false;
      })
    );
    this.stopping = stopping;
    void stopping.then(
      () => {
        if (this.stopping === stopping) this.stopping = undefined;
      },
      () => {
        if (this.stopping === stopping) this.stopping = undefined;
      }
    );
    return stopping;
  }

  readonly lifecycle: OnchainWalletBackend<RgbLibUnlockParams>['lifecycle'] =
    this.guarded(
      {
        init: () => this.publicly('init', this.init()),
        goOnline: (params) =>
          this.publicly('goOnline', this.goOnline(params, 'goOnline')),
        unlock: (params) =>
          this.publicly('unlock', this.goOnline(params, 'unlock')),
        reinit: (params) => this.publicly('reinit', this.reinit(params)),
        shutdown: () => this.publicly('shutdown', this.close(false)),
        destroy: () => this.publicly('destroy', this.close(true)),
        isDisposed: () => this.disposed,
      },
      ['isDisposed']
    );

  readonly network: OnchainWalletBackend<RgbLibUnlockParams>['network'] =
    this.guarded(
      {
        getNetwork: () => this.params.network as Network,
        getWalletIdentity: () =>
          this.run('getWalletIdentity', false, async () => ({
            ...this.identity!,
          })),
        getNetworkInfo: () =>
          this.run('getNetworkInfo', true, async (native, handle) => {
            const info = await native.getNetworkInfo(handle);
            if (info.blockHeight === null)
              return { network: this.params.network };
            integer(info.blockHeight, 'blockHeight', 0, 0xffffffff);
            return {
              network: this.params.network,
              blockHeight: info.blockHeight,
            };
          }),
      },
      ['getNetwork']
    );

  readonly bitcoin: OnchainWalletBackend<RgbLibUnlockParams>['bitcoin'] =
    this.guarded({
      getAddress: () =>
        this.run('getAddress', false, (native, handle) =>
          native.getAddress(handle, false)
        ),
      rotateVanillaAddress: () =>
        this.run('rotateVanillaAddress', false, (native, handle) =>
          native.getAddress(handle, true)
        ),
      getBtcBalance: (options) =>
        this.withOptions(
          'getBtcBalance',
          syncs,
          options,
          async (native, handle, options) => {
            const value = await native.getBtcBalance(
              handle,
              skipSyncOf(options?.skipSync)
            );
            return {
              vanilla: map.balance(value.vanilla),
              colored: map.balance(value.colored),
            };
          }
        ),
      listUnspents: (options) =>
        this.withOptions(
          'listUnspents',
          syncs,
          options,
          async (native, handle, options) =>
            (
              await native.listUnspents(handle, skipSyncOf(options?.skipSync))
            ).map(map.unspent)
        ),
      checkIndexerUrl: (url) =>
        this.run('checkIndexerUrl', false, async (native, handle) => ({
          indexerProtocol: await native.checkIndexerUrl(handle, url),
        })),
      createUtxos: (params) =>
        this.checked(
          'createUtxos',
          true,
          params,
          {
            signs: true,
            prepare: (params) => ({
              num:
                params.num === undefined
                  ? null
                  : integer(params.num, 'num', 1, 255),
              size:
                params.size === undefined
                  ? null
                  : integer(params.size, 'size', 1, 0xffffffff),
              feeRate: feeRate(params.feeRate),
            }),
          },
          (native, handle, params, v) =>
            native.createUtxos(
              handle,
              params.upTo ?? true,
              v.num,
              v.size,
              v.feeRate,
              skipSyncOf(params.skipSync)
            )
        ),
      sendBtc: (params) =>
        this.checked(
          'sendBtc',
          true,
          params,
          {
            signs: true,
            prepare: (params) => ({
              amount: u64(params.amount, 'amount', true),
              feeRate: feeRate(params.feeRate),
            }),
          },
          (native, handle, params, v) =>
            native.sendBtc(
              handle,
              params.address,
              v.amount,
              v.feeRate,
              skipSyncOf(params.skipSync)
            )
        ),
      estimateFeeRate: (blocks) =>
        this.run('estimateFeeRate', true, async (native, handle) => {
          const estimate = await native.estimateFeeRate(
            handle,
            integer(blocks, 'blocks', 1, 0xffff)
          );
          if (
            !Number.isFinite(estimate) ||
            estimate <= 0 ||
            estimate > Number.MAX_SAFE_INTEGER
          ) {
            throw new WalletBackendError(
              'INVALID_NATIVE_RESPONSE',
              'Invalid fee estimation',
              undefined,
              'RGB_L1'
            );
          }
          // Estimation is a recommendation. Explicit send inputs are never rounded.
          return { feeRate: Math.ceil(estimate) };
        }),
    });

  private receive(
    operation: 'blindReceive' | 'witnessReceive' | 'onchainReceive',
    witness: boolean,
    params: ReceiveParams
  ) {
    return this.checked(
      operation,
      true,
      params,
      {
        prepare: (params) => ({
          duration: integer(
            params.durationSeconds ?? 86400,
            'durationSeconds',
            1,
            0xffffffff
          ),
          assignmentKind: resolveReceiveAssignment(
            params.assignmentKind,
            params.amount
          ),
          amount:
            params.amount === undefined
              ? null
              : u64(params.amount, 'amount', true),
          minConfirmations: integer(
            params.minConfirmations ?? 0,
            'minConfirmations',
            0,
            255
          ),
        }),
      },
      async (native, handle, params, v) => {
        const result = await native.receive(
          handle,
          witness,
          params.assetId ?? null,
          v.amount,
          // The expiry starts when the invoice is made, not when it was asked for.
          u64(
            Math.floor(Date.now() / 1000) + v.duration,
            'expirationTimestamp'
          ),
          [this.online!.proxyEndpoint],
          v.minConfirmations,
          v.assignmentKind
        );
        return map.receive(result);
      }
    );
  }

  readonly rgb: OnchainWalletBackend<RgbLibUnlockParams>['rgb'] = this.guarded({
    listAssets: (options) =>
      this.withOptions(
        'listAssets',
        false,
        options,
        async (native, handle, options) =>
          map.assets(
            await native.listAssets(
              handle,
              validateAssetSchemas(options?.filterAssetSchemas)
            )
          )
      ),
    getAssetMetadata: (assetId) =>
      this.run('getAssetMetadata', false, async (native, handle) =>
        map.assetMetadata(await native.getAssetMetadata(handle, assetId))
      ),
    issueAssetCfa: (params) =>
      this.input(
        'issueAssetCfa',
        false,
        params,
        async (native, handle, params) => {
          const { amounts } = issuanceAmounts(params.amounts);
          return map.cfa(
            await native.issueAssetCfa(
              handle,
              params.name,
              params.details ?? null,
              integer(params.precision, 'precision', 0, 18),
              amounts,
              params.filePath
                ? localFilePath(params.filePath, 'filePath')
                : null
            )
          );
        }
      ),
    issueAssetUda: (params) =>
      this.input(
        'issueAssetUda',
        false,
        params,
        async (native, handle, params) =>
          map.uda(
            await native.issueAssetUda(
              handle,
              params.ticker,
              params.name,
              params.details ?? null,
              integer(params.precision, 'precision', 0, 18),
              params.mediaFilePath
                ? localFilePath(params.mediaFilePath, 'mediaFilePath')
                : null,
              (params.attachmentsFilePaths ?? []).map((path) =>
                localFilePath(path, 'attachmentsFilePaths')
              )
            )
          )
      ),
    getAssetBalance: (assetId) =>
      this.run('getAssetBalance', false, async (native, handle) =>
        map.balance(await native.getAssetBalance(handle, assetId))
      ),
    issueAssetNia: (params) =>
      this.input(
        'issueAssetNia',
        false,
        params,
        async (native, handle, params) => {
          const { amounts } = issuanceAmounts(params.amounts);
          return map.nia(
            await native.issueAssetNia(
              handle,
              params.ticker,
              params.name,
              integer(params.precision, 'precision', 0, 18),
              amounts
            )
          );
        }
      ),
    issueAssetIfa: (params) =>
      this.input(
        'issueAssetIfa',
        false,
        params,
        async (native, handle, params) => {
          const { amounts, inflationAmounts } = issuanceAmounts(
            params.amounts,
            params.inflationAmounts
          );
          return map.ifa(
            await native.issueAssetIfa(
              handle,
              params.ticker,
              params.name,
              integer(params.precision, 'precision', 0, 18),
              amounts,
              inflationAmounts,
              params.rejectListUrl
            )
          );
        }
      ),
    inflate: (params) =>
      this.checked(
        'inflate',
        true,
        params,
        {
          signs: true,
          prepare: (params) => ({
            amounts: params.inflationAmounts.map((n) =>
              u64(n, 'inflationAmount', true)
            ),
            feeRate: feeRate(params.feeRate),
            minConfirmations: integer(
              params.minConfirmations ?? 1,
              'minConfirmations',
              1,
              255
            ),
          }),
        },
        async (native, handle, params, v) =>
          map.operation(
            await native.inflate(
              handle,
              params.assetId,
              v.amounts,
              v.feeRate,
              v.minConfirmations
            )
          )
      ),
    blindReceive: (params) => this.receive('blindReceive', false, params),
    witnessReceive: (params) => this.receive('witnessReceive', true, params),
    onchainReceive: (params) =>
      this.receive('onchainReceive', params.witness ?? true, params),
    decodeRGBInvoice: ({ invoice }) =>
      this.run('decodeRGBInvoice', false, async (native, handle) =>
        map.invoice(await native.decodeInvoice(handle, invoice), invoice)
      ),
    onchainSend: (params) =>
      this.checked(
        'onchainSend',
        true,
        params,
        {
          signs: true,
          prepare: (params) => {
            // rgb-lib-bfa send always syncs, so skipSync: true cannot be
            // honored; it is refused instead of ignored (decision 5).
            if (params.skipSync === true)
              throw new WalletBackendError(
                'UNSUPPORTED_CAPABILITY',
                'onchainSend always syncs on RGB_L1; skipSync: true is not supported',
                'onchainSend',
                'RGB_L1'
              );
            return {
              amount:
                params.amount === undefined
                  ? null
                  : u64(params.amount, 'amount', true),
              witnessAmount: params.witnessData
                ? u64(params.witnessData.amountSat, 'witness amount', true)
                : null,
              blinding:
                params.witnessData?.blinding === undefined
                  ? null
                  : u64(params.witnessData.blinding, 'blinding'),
              feeRate: feeRate(params.feeRate),
              minConfirmations: integer(
                params.minConfirmations ?? 1,
                'minConfirmations',
                1,
                255
              ),
            };
          },
        },
        (native, handle, params, v) =>
          native.send(
            handle,
            params.invoice,
            params.assetId ?? null,
            v.amount,
            v.witnessAmount,
            v.blinding,
            params.donation ?? false,
            v.feeRate,
            v.minConfirmations,
            // The bridge still takes the flag; only false reaches it (see prepare).
            false,
            this.online!.proxyEndpoint
          )
      ),
    failTransfers: (params) =>
      this.checked(
        'failTransfers',
        true,
        params,
        {
          prepare: (params) =>
            params.batchTransferIdx === undefined
              ? null
              : integer(
                  params.batchTransferIdx,
                  'batchTransferIdx',
                  1,
                  0x7fffffff
                ),
        },
        (native, handle, params, batchTransferIdx) =>
          native.failTransfers(
            handle,
            batchTransferIdx,
            params.noAssetOnly ?? false,
            skipSyncOf(params.skipSync)
          )
      ),
  });

  readonly history: OnchainWalletBackend<RgbLibUnlockParams>['history'] =
    this.guarded({
      listTransactions: (options) =>
        this.withOptions(
          'listTransactions',
          syncs,
          options,
          async (native, handle, options) =>
            (
              await native.listTransactions(
                handle,
                skipSyncOf(options?.skipSync)
              )
            ).map(map.transaction)
        ),
      listTransactionsByTxid: (txid, options) => {
        // An object is the contract form; anything else the old positional flag.
        const skip = skipSyncOf(
          typeof options === 'object' && options !== null
            ? snapshot(options).skipSync
            : options
        );
        return this.run(
          'listTransactionsByTxid',
          !skip,
          async (native, handle) =>
            (await native.listTransactions(handle, skip))
              .filter((t) => t.txid === txid)
              .map(map.transaction)
        );
      },
      listTransfers: (assetId) => this.listTransfers('listTransfers', assetId),
      listTransfersByTxid: (txid) =>
        this.run('listTransfersByTxid', false, async (native, handle) =>
          (await native.listTransfers(handle, null, txid)).map(map.transfer)
        ),
      listOnchainTransfers: (assetId) =>
        this.listTransfers('listOnchainTransfers', assetId),
      syncWallet: () =>
        this.run('syncWallet', true, (native, handle) => native.sync(handle)),
      refresh: (options) =>
        this.withOptions(
          'refresh',
          // Always online; the flag is checked here, before any connect.
          (owned) => (skipSyncOf(owned?.skipSync), true),
          options,
          (native, handle, owned) =>
            refreshed(native, handle, skipSyncOf(owned?.skipSync))
        ),
      refreshWallet: () =>
        this.run('refreshWallet', true, (native, handle) =>
          refreshed(native, handle, false)
        ).then(() => undefined),
      refreshTransfers: (skipSync) => {
        const skip = skipSyncOf(skipSync);
        return this.run('refreshTransfers', true, (native, handle) =>
          refreshed(native, handle, skip)
        );
      },
    });

  // Shared by a method and its alias; each normalizes under its own name, once.
  private listTransfers(operation: string, assetId?: string) {
    return this.run(operation, false, async (native, handle) =>
      (await native.listTransfers(handle, assetId ?? null, null)).map(
        map.transfer
      )
    );
  }

  readonly backup: OnchainWalletBackend<RgbLibUnlockParams>['backup'] =
    this.guarded({
      createBackup: (params) =>
        this.input(
          'createBackup',
          false,
          params,
          async (native, handle, params) => {
            if (
              !params.backupPath?.startsWith('/') ||
              typeof params.password !== 'string' ||
              !params.password
            ) {
              throw new WalletBackendError(
                'INVALID_CONFIG',
                'Backup requires an absolute path and a nonempty password',
                undefined,
                'RGB_L1'
              );
            }
            await native.backup(handle, params.backupPath, params.password);
            return {
              message: 'Backup created successfully',
              backupPath: params.backupPath,
            };
          }
        ),
    });

  readonly maintenance: OnchainWalletBackend<RgbLibUnlockParams>['maintenance'] =
    this.guarded({
      drainTo: (params) =>
        this.checked(
          'drainTo',
          true,
          params,
          { signs: true, prepare: (params) => feeRate(params.feeRate) },
          (native, handle, params, rate) =>
            native.drainTo(handle, params.address, rate)
        ),
      deleteTransfers: (params = {}) =>
        this.input('deleteTransfers', false, params, (native, handle, params) =>
          native.deleteTransfers(
            handle,
            params.batchTransferIdx === undefined
              ? null
              : integer(
                  params.batchTransferIdx,
                  'batchTransferIdx',
                  1,
                  0x7fffffff
                ),
            params.noAssetOnly ?? false
          )
        ),
    });

  readonly bfa: OnchainWalletBackend<RgbLibUnlockParams>['bfa'] = this.guarded({
    getBfaCapabilities: async () => ({
      // Burning signs a transaction: a watch-only wallet cannot do it.
      burn:
        !this.disposed &&
        !this.stopRequested &&
        !this.watchOnly &&
        (this.runtime?.burn ?? false),
      consignment:
        !this.disposed &&
        !this.stopRequested &&
        (this.runtime?.consignment ?? false),
      bfa:
        !this.disposed && !this.stopRequested && (this.runtime?.bfa ?? false),
    }),
    burn: (params) =>
      this.checked(
        'burn',
        true,
        params,
        {
          signs: true,
          prepare: (params) => {
            validateBurnParams(params);
            if (this.runtime && !this.runtime.burn)
              throw new WalletBackendError(
                'UNSUPPORTED_CAPABILITY',
                'This native build does not support burn',
                'burn',
                'RGB_L1'
              );
          },
        },
        async (native, handle, params) => {
          // The runtime is known only after init(); checked again here.
          if (!this.runtime?.burn)
            throw new WalletBackendError(
              'UNSUPPORTED_CAPABILITY',
              'This native build does not support burn',
              undefined,
              'RGB_L1'
            );
          return native.burn(
            handle,
            params.assetId,
            params.amount,
            params.burnRecipient ?? null,
            feeRate(params.feeRate),
            params.minConfirmations
          );
        }
      ),
    getConsignment: (assetId, txid) =>
      this.run('getConsignment', false, (native, handle) => {
        validateConsignmentLookup(assetId, txid);
        return native.getConsignment(handle, assetId, txid);
      }),
    getConsignmentPath: (assetId, txid) =>
      this.run('getConsignmentPath', false, (native, handle) => {
        validateConsignmentLookup(assetId, txid);
        return native.getConsignmentPath(handle, assetId, txid);
      }),
  });
}
