import type { Network } from '@utexo/rgb-sdk-core';
import type { ReceiveParams } from '../types';
import { getRgbLibBinding, assertRuntime } from './native';
import type { NativeRuntimeInfo, Spec } from '../../binding/NativeRgbLib';
import { toNativeNetwork } from '../../binding/Interfaces';
import { readRgbLibMnemonic, resolveRgbLibKeys } from './key-provider';
import type { ResolvedRgbLibKeys, RgbLibKeys } from './key-provider';
import type { OnchainWalletBackend, WalletIdentity } from '../wallet-api';
import { WalletBackendError } from '../wallet-errors';
import { SerialExecutor } from '../runtime/serial-executor';
import { snapshot } from '../runtime/snapshot';
import {
  resolveReceiveAssignment,
  validateAssetSchemas,
  validateBurnParams,
  validateConsignmentLookup,
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
import { guardNative } from './errors';

/** A handle already removed by native needs no further close call. */
async function closeHandle(native: Spec, handle: string): Promise<void> {
  try {
    await native.closeWallet(handle);
  } catch (error) {
    if (
      !(error instanceof WalletBackendError) ||
      error.code !== 'WALLET_NOT_INITIALIZED'
    ) {
      throw error;
    }
  }
}

/** One backend owns one native handle, one queue, and one immutable wallet profile. */
export class RgbLibWalletBackend implements OnchainWalletBackend<RgbLibUnlockParams> {
  private readonly queue = new SerialExecutor();
  private readonly params: Readonly<RgbLibWalletParams>;
  private handle?: string;
  private native?: Spec;
  private runtime?: NativeRuntimeInfo;
  private online?: ResolvedRgbLibConfig;
  private identity?: WalletIdentity;
  private opening?: Promise<void>;
  private connecting?: { config: ResolvedRgbLibConfig; promise: Promise<void> };
  private stopping?: Promise<void>;
  private stopRequested = false;
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
    this.params = Object.freeze({ ...params });
  }

  /** Opened from public keys alone: it cannot sign. */
  private get watchOnly(): boolean {
    return !this.keys.readMnemonic;
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

  private run<T>(
    operation: string,
    requiresOnline: boolean,
    action: (native: Spec, handle: string) => Promise<T>
  ): Promise<T> {
    try {
      this.assertAccepting();
    } catch (error) {
      return Promise.reject(error);
    }
    return this.queue.run(async () => {
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
          'Call goOnline() or unlock() before this operation',
          operation,
          'RGB_L1'
        );
      }
      return action(this.native, this.handle);
    });
  }

  private input<P, T>(
    operation: string,
    requiresOnline: boolean,
    params: P,
    action: (native: Spec, handle: string, owned: P) => Promise<T>
  ): Promise<T> {
    const owned = snapshot(params);
    return this.run(operation, requiresOnline, (native, handle) =>
      action(native, handle, owned)
    );
  }

  private init(): Promise<void> {
    try {
      this.assertAccepting();
    } catch (error) {
      return Promise.reject(error);
    }
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
          throw cleanupError;
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

  private unlock(params: RgbLibUnlockParams): Promise<void> {
    let config: ResolvedRgbLibConfig;
    try {
      this.assertAccepting();
      config = resolveRgbLibConfig(params, this.params.network);
    } catch (error) {
      return Promise.reject(error);
    }
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
    const connecting = this.run('unlock', false, async (native, handle) => {
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
        Object.values(config.evmRpcUrls),
        Object.keys(config.proxyAuthKeys),
        Object.values(config.proxyAuthKeys)
      );
      this.online = config;
    });
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
    const stopping = this.queue.run(async () => {
      if (this.handle && this.native)
        await closeHandle(this.native, this.handle);
      this.handle = undefined;
      this.native = undefined;
      this.runtime = undefined;
      this.identity = undefined;
      this.online = undefined;
      this.disposed = this.disposeRequested;
      this.stopRequested = false;
    });
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

  readonly lifecycle: OnchainWalletBackend<RgbLibUnlockParams>['lifecycle'] = {
    init: () => this.init(),
    unlock: (params) => this.unlock(params),
    reinit: async (params) => {
      if (this.handle || this.opening) {
        throw new WalletBackendError(
          'WALLET_CONFIG_MISMATCH',
          'Call shutdown() before reinit()',
          undefined,
          'RGB_L1'
        );
      }
      if (params) resolveRgbLibConfig(params, this.params.network);
      await this.init();
      if (params) await this.unlock(params);
    },
    shutdown: () => this.close(false),
    destroy: () => this.close(true),
    isDisposed: () => this.disposed,
  };

  readonly network: OnchainWalletBackend<RgbLibUnlockParams>['network'] = {
    getNetwork: () => this.params.network as Network,
    getWalletIdentity: () =>
      this.run('getWalletIdentity', false, async () => ({ ...this.identity! })),
    getNetworkInfo: () =>
      this.run('getNetworkInfo', true, async (native, handle) => {
        const info = await native.getNetworkInfo(handle);
        if (info.blockHeight === null) return { network: this.params.network };
        integer(info.blockHeight, 'blockHeight', 0, 0xffffffff);
        return { network: this.params.network, blockHeight: info.blockHeight };
      }),
  };

  readonly bitcoin: OnchainWalletBackend<RgbLibUnlockParams>['bitcoin'] = {
    getAddress: () =>
      this.run('getAddress', false, (native, handle) =>
        native.getAddress(handle, false)
      ),
    rotateVanillaAddress: () =>
      this.run('rotateVanillaAddress', false, (native, handle) =>
        native.getAddress(handle, true)
      ),
    getBtcBalance: (options) =>
      this.run('getBtcBalance', true, async (native, handle) => {
        const value = await native.getBtcBalance(
          handle,
          options?.skipSync ?? false
        );
        return {
          vanilla: map.balance(value.vanilla),
          colored: map.balance(value.colored),
        };
      }),
    listUnspents: (options) =>
      this.run('listUnspents', true, async (native, handle) =>
        (await native.listUnspents(handle, options?.skipSync ?? false)).map(
          map.unspent
        )
      ),
    checkIndexerUrl: (url) =>
      this.run('checkIndexerUrl', false, async (native, handle) => ({
        indexerProtocol: await native.checkIndexerUrl(handle, url),
      })),
    createUtxos: (params) =>
      this.input('createUtxos', true, params, (native, handle, params) =>
        native.createUtxos(
          handle,
          params.upTo ?? true,
          params.num === undefined ? null : integer(params.num, 'num', 1, 255),
          params.size === undefined
            ? null
            : integer(params.size, 'size', 1, 0xffffffff),
          feeRate(params.feeRate),
          params.skipSync ?? false
        )
      ),
    sendBtc: (params) =>
      this.input('sendBtc', true, params, (native, handle, params) =>
        native.sendBtc(
          handle,
          params.address,
          u64(params.amount, 'amount', true),
          feeRate(params.feeRate),
          params.skipSync ?? false
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
  };

  private receive(witness: boolean, params: ReceiveParams) {
    return this.input(
      'receive',
      true,
      params,
      async (native, handle, params) => {
        const duration = integer(
          params.durationSeconds ?? 86400,
          'durationSeconds',
          1,
          0xffffffff
        );
        const assignmentKind = resolveReceiveAssignment(
          params.assignmentKind,
          params.amount
        );
        const result = await native.receive(
          handle,
          witness,
          params.assetId ?? null,
          params.amount === undefined
            ? null
            : u64(params.amount, 'amount', true),
          u64(Math.floor(Date.now() / 1000) + duration, 'expirationTimestamp'),
          [this.online!.proxyEndpoint],
          integer(params.minConfirmations ?? 0, 'minConfirmations', 0, 255),
          assignmentKind
        );
        return map.receive(result);
      }
    );
  }

  readonly rgb: OnchainWalletBackend<RgbLibUnlockParams>['rgb'] = {
    listAssets: (options) =>
      this.run('listAssets', false, async (native, handle) =>
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
      this.input('inflate', true, params, async (native, handle, params) =>
        map.operation(
          await native.inflate(
            handle,
            params.assetId,
            params.inflationAmounts.map((n) => u64(n, 'inflationAmount', true)),
            feeRate(params.feeRate),
            integer(params.minConfirmations ?? 1, 'minConfirmations', 1, 255)
          )
        )
      ),
    blindReceive: (params) => this.receive(false, params),
    witnessReceive: (params) => this.receive(true, params),
    onchainReceive: (params) => this.receive(params.witness ?? true, params),
    decodeRGBInvoice: ({ invoice }) =>
      this.run('decodeRGBInvoice', false, async (native, handle) =>
        map.invoice(await native.decodeInvoice(handle, invoice), invoice)
      ),
    onchainSend: (params) =>
      this.input('onchainSend', true, params, (native, handle, params) =>
        native.send(
          handle,
          params.invoice,
          params.assetId ?? null,
          params.amount === undefined
            ? null
            : u64(params.amount, 'amount', true),
          params.witnessData
            ? u64(params.witnessData.amountSat, 'witness amount', true)
            : null,
          params.witnessData?.blinding === undefined
            ? null
            : u64(params.witnessData.blinding, 'blinding'),
          params.donation ?? false,
          feeRate(params.feeRate),
          integer(params.minConfirmations ?? 1, 'minConfirmations', 1, 255),
          // Kept for bridge compatibility; rgb-lib-bfa send has no skip-sync option.
          params.skipSync ?? false,
          this.online!.proxyEndpoint
        )
      ),
    failTransfers: (params) =>
      this.input('failTransfers', true, params, (native, handle, params) =>
        native.failTransfers(
          handle,
          params.batchTransferIdx === undefined
            ? null
            : integer(
                params.batchTransferIdx,
                'batchTransferIdx',
                1,
                0x7fffffff
              ),
          params.noAssetOnly ?? false,
          params.skipSync ?? false
        )
      ),
  };

  readonly history: OnchainWalletBackend<RgbLibUnlockParams>['history'] = {
    listTransactions: (options) =>
      this.run('listTransactions', true, async (native, handle) =>
        (await native.listTransactions(handle, options?.skipSync ?? false)).map(
          map.transaction
        )
      ),
    listTransactionsByTxid: (txid, skipSync = false) =>
      this.run('listTransactionsByTxid', true, async (native, handle) =>
        (await native.listTransactions(handle, skipSync))
          .filter((t) => t.txid === txid)
          .map(map.transaction)
      ),
    listTransfers: (assetId) =>
      this.run('listTransfers', false, async (native, handle) =>
        (await native.listTransfers(handle, assetId ?? null, null)).map(
          map.transfer
        )
      ),
    listTransfersByTxid: (txid) =>
      this.run('listTransfersByTxid', false, async (native, handle) =>
        (await native.listTransfers(handle, null, txid)).map(map.transfer)
      ),
    listOnchainTransfers: (assetId) => this.history.listTransfers(assetId),
    syncWallet: () =>
      this.run('syncWallet', true, (native, handle) => native.sync(handle)),
    refreshWallet: async () => {
      await this.history.refreshTransfers();
    },
    refreshTransfers: (skipSync = false) =>
      this.run('refreshTransfers', true, async (native, handle) => ({
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
      })),
  };

  readonly backup: OnchainWalletBackend<RgbLibUnlockParams>['backup'] = {
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
  };

  readonly maintenance: OnchainWalletBackend<RgbLibUnlockParams>['maintenance'] =
    {
      drainTo: (params) =>
        this.input('drainTo', true, params, (native, handle, params) =>
          native.drainTo(handle, params.address, feeRate(params.feeRate))
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
    };

  readonly bfa: OnchainWalletBackend<RgbLibUnlockParams>['bfa'] = {
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
      this.input('burn', true, params, async (native, handle, params) => {
        validateBurnParams(params);
        if (this.watchOnly)
          throw new WalletBackendError(
            'UNSUPPORTED_CAPABILITY',
            'burn needs the mnemonic; this RGB_L1 wallet was opened watch-only from public keys',
            'burn',
            'RGB_L1'
          );
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
      }),
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
  };
}
