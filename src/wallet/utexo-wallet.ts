import { RlnWallet } from './rln/rln-wallet';
import type { UTEXOWalletNodeParams } from './rln/rln-wallet';
import { RgbLibWallet } from './rgb-lib/rgb-lib-wallet';
import type { RgbLibUnlockParams } from './rgb-lib/config';
import type { IRLNSigner } from './rln/rln-signers';
import type { WalletProtocol } from './wallet-api';
import type { WalletInit, UTEXOWalletOptions } from './wallet-options';
import { WalletBackendError } from './wallet-errors';
import type { BfaCapabilities, BurnParams, BurnResult } from './types';
import { snapshot } from './runtime/snapshot';

export type { UTEXOWalletNodeParams } from './rln/rln-wallet';
export type { UTEXOWalletOptions } from './wallet-options';

/** A wallet with either protocol; narrow protocol before protocol-specific calls. */
export type AnyUtexoWallet = UTEXOWallet<'RGB_LN'> | UTEXOWallet<'RGB_L1'>;

// A union generic loses the correlation between an engine and its unlock params.
// Keep shared operations available, but require a concrete protocol to unlock.
type ConcreteWallet<P extends WalletProtocol> = WalletProtocol extends P
  ? never
  : UTEXOWallet<P>;

type Engine<P extends WalletProtocol> = P extends 'RGB_LN'
  ? RlnWallet
  : RgbLibWallet;
type SharedMethod = {
  [K in keyof RgbLibWallet]: RgbLibWallet[K] extends (
    ...args: never[]
  ) => unknown
    ? K
    : never;
}[keyof RgbLibWallet] &
  keyof RlnWallet;
type Method<P extends WalletProtocol, K extends SharedMethod> = Extract<
  Engine<P>[K],
  (...args: never[]) => unknown
>;
// Both engines share these zero-argument signatures; the generic Method<>
// types cannot be resolved inside the class body.
type VirtualAliases = {
  init(): Promise<void>;
  destroy(): Promise<void>;
  refreshTransfers(): Promise<unknown>;
};

/**
 * One public wallet constructor. The legacy two-argument form always selects RLN.
 * The options form infers the protocol, including its unlock and on-chain DTO types.
 * Each instance owns exactly one implementation for its entire lifetime.
 */
export class UTEXOWallet<TProtocol extends WalletProtocol = 'RGB_LN'> {
  readonly psbt = undefined;
  readonly beginEnd = undefined;
  private readonly engine: RlnWallet | RgbLibWallet;

  constructor(
    params: [TProtocol] extends ['RGB_LN'] ? UTEXOWalletNodeParams : never,
    signer: IRLNSigner
  );
  constructor(options: UTEXOWalletOptions<TProtocol>);
  constructor(input: UTEXOWalletNodeParams | WalletInit, signer?: IRLNSigner) {
    if (!input || typeof input !== 'object') {
      throw new WalletBackendError(
        'INVALID_CONFIG',
        'Wallet configuration is required'
      );
    }
    if ('backend' in input) {
      throw new WalletBackendError(
        'INVALID_CONFIG',
        'Use protocol: RGB_L1 or RGB_LN to select the wallet mode'
      );
    }
    if ('protocol' in input) {
      if (signer !== undefined) {
        throw new WalletBackendError(
          'INVALID_CONFIG',
          'Pass credentials inside the protocol options'
        );
      }
      if (input.protocol === 'RGB_L1') {
        if (input.signer !== undefined) {
          throw new WalletBackendError(
            'INVALID_CONFIG',
            'RGB Lib requires a key provider',
            undefined,
            'RGB_L1'
          );
        }
        this.engine = new RgbLibWallet(input.params, input.keys);
      } else if (input.protocol === 'RGB_LN') {
        if (input.keys !== undefined || !input.signer) {
          throw new WalletBackendError(
            'INVALID_CONFIG',
            'RLN requires an RLN signer',
            undefined,
            'RGB_LN'
          );
        }
        this.engine = new RlnWallet(input.params, input.signer);
      } else {
        throw new WalletBackendError(
          'INVALID_CONFIG',
          'Unknown wallet protocol'
        );
      }
    } else {
      if (!signer) {
        throw new WalletBackendError(
          'INVALID_CONFIG',
          'RLN requires an RLN signer',
          undefined,
          'RGB_LN'
        );
      }
      this.engine = new RlnWallet(input, signer);
    }
  }

  get protocol(): TProtocol {
    return this.engine.protocol as TProtocol;
  }

  get capabilities() {
    return this.engine.capabilities;
  }

  private invoke<K extends SharedMethod>(
    method: K,
    ...args: Parameters<Method<TProtocol, K>>
  ): ReturnType<Method<TProtocol, K>> {
    // The constructor ties TProtocol to this implementation. Both implementations
    // are checked against the common on-chain contract; no native data is cast here.
    const call = this.engine[method] as (
      ...args: Parameters<Method<TProtocol, K>>
    ) => ReturnType<Method<TProtocol, K>>;
    return call.apply(this.engine, args);
  }

  private requireRln(operation: string): RlnWallet {
    if (this.engine.protocol !== 'RGB_LN') {
      throw new WalletBackendError(
        'UNSUPPORTED_CAPABILITY',
        operation + ' requires the RGB_LN protocol',
        operation,
        this.engine.protocol
      );
    }
    return this.engine;
  }

  getWalletIdentity(
    ...args: Parameters<Method<TProtocol, 'getWalletIdentity'>>
  ): ReturnType<Method<TProtocol, 'getWalletIdentity'>> {
    return this.invoke('getWalletIdentity', ...args);
  }

  init(
    ...args: Parameters<Method<TProtocol, 'init'>>
  ): ReturnType<Method<TProtocol, 'init'>> {
    return this.invoke('init', ...args);
  }

  unlock(
    this: ConcreteWallet<TProtocol>,
    ...args: Parameters<Method<TProtocol, 'unlock'>>
  ): ReturnType<Method<TProtocol, 'unlock'>> {
    return this.invoke('unlock', ...args);
  }

  /** Connect an initialized RGB_L1 wallet; alias for unlock(params). */
  async goOnline(
    this: UTEXOWallet<'RGB_L1'>,
    params: RgbLibUnlockParams
  ): Promise<void> {
    if (this.engine.protocol !== 'RGB_L1') {
      throw new WalletBackendError(
        'UNSUPPORTED_CAPABILITY',
        'goOnline requires the RGB_L1 protocol',
        'goOnline',
        this.engine.protocol
      );
    }
    return this.unlock(params);
  }

  reinit(
    this: ConcreteWallet<TProtocol>,
    ...args: Parameters<Method<TProtocol, 'reinit'>>
  ): ReturnType<Method<TProtocol, 'reinit'>> {
    return this.invoke('reinit', ...args);
  }

  shutdown(
    ...args: Parameters<Method<TProtocol, 'shutdown'>>
  ): ReturnType<Method<TProtocol, 'shutdown'>> {
    return this.invoke('shutdown', ...args);
  }

  destroy(
    ...args: Parameters<Method<TProtocol, 'destroy'>>
  ): ReturnType<Method<TProtocol, 'destroy'>> {
    return this.invoke('destroy', ...args);
  }

  /** Backward-compat alias for init(); dispatches through `this` so subclass overrides run. */
  async initialize(): Promise<void> {
    return (this as unknown as VirtualAliases).init();
  }

  getNetwork(
    ...args: Parameters<Method<TProtocol, 'getNetwork'>>
  ): ReturnType<Method<TProtocol, 'getNetwork'>> {
    return this.invoke('getNetwork', ...args);
  }

  /** Backward-compat alias for destroy(); dispatches through `this` so subclass overrides run. */
  async dispose(): Promise<void> {
    return (this as unknown as VirtualAliases).destroy();
  }

  isDisposed(
    ...args: Parameters<Method<TProtocol, 'isDisposed'>>
  ): ReturnType<Method<TProtocol, 'isDisposed'>> {
    return this.invoke('isDisposed', ...args);
  }

  getBtcBalance(
    ...args: Parameters<Method<TProtocol, 'getBtcBalance'>>
  ): ReturnType<Method<TProtocol, 'getBtcBalance'>> {
    return this.invoke('getBtcBalance', ...args);
  }

  getAddress(
    ...args: Parameters<Method<TProtocol, 'getAddress'>>
  ): ReturnType<Method<TProtocol, 'getAddress'>> {
    return this.invoke('getAddress', ...args);
  }

  rotateVanillaAddress(
    ...args: Parameters<Method<TProtocol, 'rotateVanillaAddress'>>
  ): ReturnType<Method<TProtocol, 'rotateVanillaAddress'>> {
    return this.invoke('rotateVanillaAddress', ...args);
  }

  listUnspents(
    ...args: Parameters<Method<TProtocol, 'listUnspents'>>
  ): ReturnType<Method<TProtocol, 'listUnspents'>> {
    return this.invoke('listUnspents', ...args);
  }

  createUtxos(
    ...args: Parameters<Method<TProtocol, 'createUtxos'>>
  ): ReturnType<Method<TProtocol, 'createUtxos'>> {
    return this.invoke('createUtxos', ...args);
  }

  getBfaCapabilities(): Promise<BfaCapabilities> {
    return this.engine.getBfaCapabilities();
  }

  async burn(params: BurnParams): Promise<BurnResult> {
    // Preserve the request while an application's capability override awaits.
    const owned = snapshot(params);
    if (
      this.getBfaCapabilities !== UTEXOWallet.prototype.getBfaCapabilities &&
      !(await this.getBfaCapabilities()).burn
    ) {
      throw new WalletBackendError(
        'UNSUPPORTED_CAPABILITY',
        'Burn is disabled by this wallet',
        'burn',
        this.engine.protocol
      );
    }
    return this.engine.burn(owned);
  }

  getConsignment(
    ...args: Parameters<Method<TProtocol, 'getConsignment'>>
  ): ReturnType<Method<TProtocol, 'getConsignment'>> {
    return this.invoke('getConsignment', ...args);
  }

  getConsignmentPath(
    ...args: Parameters<Method<TProtocol, 'getConsignmentPath'>>
  ): ReturnType<Method<TProtocol, 'getConsignmentPath'>> {
    return this.invoke('getConsignmentPath', ...args);
  }

  listAssets(
    ...args: Parameters<Method<TProtocol, 'listAssets'>>
  ): ReturnType<Method<TProtocol, 'listAssets'>> {
    return this.invoke('listAssets', ...args);
  }

  getAssetBalance(
    ...args: Parameters<Method<TProtocol, 'getAssetBalance'>>
  ): ReturnType<Method<TProtocol, 'getAssetBalance'>> {
    return this.invoke('getAssetBalance', ...args);
  }

  issueAssetNia(
    ...args: Parameters<Method<TProtocol, 'issueAssetNia'>>
  ): ReturnType<Method<TProtocol, 'issueAssetNia'>> {
    return this.invoke('issueAssetNia', ...args);
  }

  issueAssetIfa(
    ...args: Parameters<Method<TProtocol, 'issueAssetIfa'>>
  ): ReturnType<Method<TProtocol, 'issueAssetIfa'>> {
    return this.invoke('issueAssetIfa', ...args);
  }

  inflate(
    ...args: Parameters<Method<TProtocol, 'inflate'>>
  ): ReturnType<Method<TProtocol, 'inflate'>> {
    return this.invoke('inflate', ...args);
  }

  sendBtc(
    ...args: Parameters<Method<TProtocol, 'sendBtc'>>
  ): ReturnType<Method<TProtocol, 'sendBtc'>> {
    return this.invoke('sendBtc', ...args);
  }

  blindReceive(
    ...args: Parameters<Method<TProtocol, 'blindReceive'>>
  ): ReturnType<Method<TProtocol, 'blindReceive'>> {
    return this.invoke('blindReceive', ...args);
  }

  witnessReceive(
    ...args: Parameters<Method<TProtocol, 'witnessReceive'>>
  ): ReturnType<Method<TProtocol, 'witnessReceive'>> {
    return this.invoke('witnessReceive', ...args);
  }

  decodeRGBInvoice(
    ...args: Parameters<Method<TProtocol, 'decodeRGBInvoice'>>
  ): ReturnType<Method<TProtocol, 'decodeRGBInvoice'>> {
    return this.invoke('decodeRGBInvoice', ...args);
  }

  listTransactions(
    ...args: Parameters<Method<TProtocol, 'listTransactions'>>
  ): ReturnType<Method<TProtocol, 'listTransactions'>> {
    return this.invoke('listTransactions', ...args);
  }

  listTransactionsByTxid(
    ...args: Parameters<Method<TProtocol, 'listTransactionsByTxid'>>
  ): ReturnType<Method<TProtocol, 'listTransactionsByTxid'>> {
    return this.invoke('listTransactionsByTxid', ...args);
  }

  listTransfers(
    ...args: Parameters<Method<TProtocol, 'listTransfers'>>
  ): ReturnType<Method<TProtocol, 'listTransfers'>> {
    return this.invoke('listTransfers', ...args);
  }

  listTransfersByTxid(
    ...args: Parameters<Method<TProtocol, 'listTransfersByTxid'>>
  ): ReturnType<Method<TProtocol, 'listTransfersByTxid'>> {
    return this.invoke('listTransfersByTxid', ...args);
  }

  failTransfers(
    ...args: Parameters<Method<TProtocol, 'failTransfers'>>
  ): ReturnType<Method<TProtocol, 'failTransfers'>> {
    return this.invoke('failTransfers', ...args);
  }

  /** Refreshes transfers through `this` so a subclass refreshTransfers() override runs. */
  async refreshWallet(): Promise<void> {
    await (this as unknown as VirtualAliases).refreshTransfers();
  }

  refreshTransfers(
    ...args: Parameters<Method<TProtocol, 'refreshTransfers'>>
  ): ReturnType<Method<TProtocol, 'refreshTransfers'>> {
    return this.invoke('refreshTransfers', ...args);
  }

  syncWallet(
    ...args: Parameters<Method<TProtocol, 'syncWallet'>>
  ): ReturnType<Method<TProtocol, 'syncWallet'>> {
    return this.invoke('syncWallet', ...args);
  }

  estimateFeeRate(
    ...args: Parameters<Method<TProtocol, 'estimateFeeRate'>>
  ): ReturnType<Method<TProtocol, 'estimateFeeRate'>> {
    return this.invoke('estimateFeeRate', ...args);
  }

  createBackup(
    ...args: Parameters<Method<TProtocol, 'createBackup'>>
  ): ReturnType<Method<TProtocol, 'createBackup'>> {
    return this.invoke('createBackup', ...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async signMessage(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['signMessage']>
  ): ReturnType<RlnWallet['signMessage']> {
    return this.requireRln('signMessage').signMessage(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async verifyMessage(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['verifyMessage']>
  ): ReturnType<RlnWallet['verifyMessage']> {
    return this.requireRln('verifyMessage').verifyMessage(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async createLightningInvoice(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['createLightningInvoice']>
  ): ReturnType<RlnWallet['createLightningInvoice']> {
    return this.requireRln('createLightningInvoice').createLightningInvoice(
      ...args
    );
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async createHodlInvoice(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['createHodlInvoice']>
  ): ReturnType<RlnWallet['createHodlInvoice']> {
    return this.requireRln('createHodlInvoice').createHodlInvoice(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async claimHodlInvoice(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['claimHodlInvoice']>
  ): ReturnType<RlnWallet['claimHodlInvoice']> {
    return this.requireRln('claimHodlInvoice').claimHodlInvoice(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async cancelHodlInvoice(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['cancelHodlInvoice']>
  ): ReturnType<RlnWallet['cancelHodlInvoice']> {
    return this.requireRln('cancelHodlInvoice').cancelHodlInvoice(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async listPayments(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['listPayments']>
  ): ReturnType<RlnWallet['listPayments']> {
    return this.requireRln('listPayments').listPayments(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async apayNew(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['apayNew']>
  ): ReturnType<RlnWallet['apayNew']> {
    return this.requireRln('apayNew').apayNew(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async apayNewWithAddress(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['apayNewWithAddress']>
  ): ReturnType<RlnWallet['apayNewWithAddress']> {
    return this.requireRln('apayNewWithAddress').apayNewWithAddress(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async createLsp(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['createLsp']>
  ): ReturnType<RlnWallet['createLsp']> {
    return this.requireRln('createLsp').createLsp(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  getLspConfig(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['getLspConfig']>
  ): ReturnType<RlnWallet['getLspConfig']> {
    return this.requireRln('getLspConfig').getLspConfig(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async getLightningReceiveStatus(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['getLightningReceiveStatus']>
  ): ReturnType<RlnWallet['getLightningReceiveStatus']> {
    return this.requireRln(
      'getLightningReceiveStatus'
    ).getLightningReceiveStatus(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async getLightningSendStatus(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['getLightningSendStatus']>
  ): ReturnType<RlnWallet['getLightningSendStatus']> {
    return this.requireRln('getLightningSendStatus').getLightningSendStatus(
      ...args
    );
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async payLightningInvoice(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['payLightningInvoice']>
  ): ReturnType<RlnWallet['payLightningInvoice']> {
    return this.requireRln('payLightningInvoice').payLightningInvoice(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async listLightningPayments(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['listLightningPayments']>
  ): ReturnType<RlnWallet['listLightningPayments']> {
    return this.requireRln('listLightningPayments').listLightningPayments(
      ...args
    );
  }

  onchainReceive(
    ...args: Parameters<Method<TProtocol, 'onchainReceive'>>
  ): ReturnType<Method<TProtocol, 'onchainReceive'>> {
    return this.invoke('onchainReceive', ...args);
  }

  onchainSend(
    ...args: Parameters<Method<TProtocol, 'onchainSend'>>
  ): ReturnType<Method<TProtocol, 'onchainSend'>> {
    return this.invoke('onchainSend', ...args);
  }

  listOnchainTransfers(
    ...args: Parameters<Method<TProtocol, 'listOnchainTransfers'>>
  ): ReturnType<Method<TProtocol, 'listOnchainTransfers'>> {
    return this.invoke('listOnchainTransfers', ...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async getNodeInfo(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['getNodeInfo']>
  ): ReturnType<RlnWallet['getNodeInfo']> {
    return this.requireRln('getNodeInfo').getNodeInfo(...args);
  }

  getNetworkInfo(
    ...args: Parameters<Method<TProtocol, 'getNetworkInfo'>>
  ): ReturnType<Method<TProtocol, 'getNetworkInfo'>> {
    return this.invoke('getNetworkInfo', ...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async connectPeer(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['connectPeer']>
  ): ReturnType<RlnWallet['connectPeer']> {
    return this.requireRln('connectPeer').connectPeer(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async listPeers(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['listPeers']>
  ): ReturnType<RlnWallet['listPeers']> {
    return this.requireRln('listPeers').listPeers(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async disconnectPeer(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['disconnectPeer']>
  ): ReturnType<RlnWallet['disconnectPeer']> {
    return this.requireRln('disconnectPeer').disconnectPeer(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async listChannels(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['listChannels']>
  ): ReturnType<RlnWallet['listChannels']> {
    return this.requireRln('listChannels').listChannels(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async openChannel(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['openChannel']>
  ): ReturnType<RlnWallet['openChannel']> {
    return this.requireRln('openChannel').openChannel(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async closeChannel(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['closeChannel']>
  ): ReturnType<RlnWallet['closeChannel']> {
    return this.requireRln('closeChannel').closeChannel(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async getChannelId(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['getChannelId']>
  ): ReturnType<RlnWallet['getChannelId']> {
    return this.requireRln('getChannelId').getChannelId(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async keysend(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['keysend']>
  ): ReturnType<RlnWallet['keysend']> {
    return this.requireRln('keysend').keysend(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async decodeLnInvoice(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['decodeLnInvoice']>
  ): ReturnType<RlnWallet['decodeLnInvoice']> {
    return this.requireRln('decodeLnInvoice').decodeLnInvoice(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async invoiceStatus(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['invoiceStatus']>
  ): ReturnType<RlnWallet['invoiceStatus']> {
    return this.requireRln('invoiceStatus').invoiceStatus(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async checkIndexerUrl(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['checkIndexerUrl']>
  ): ReturnType<RlnWallet['checkIndexerUrl']> {
    return this.requireRln('checkIndexerUrl').checkIndexerUrl(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async checkProxyEndpoint(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['checkProxyEndpoint']>
  ): ReturnType<RlnWallet['checkProxyEndpoint']> {
    return this.requireRln('checkProxyEndpoint').checkProxyEndpoint(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async vssClearFence(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['vssClearFence']>
  ): ReturnType<RlnWallet['vssClearFence']> {
    return this.requireRln('vssClearFence').vssClearFence(...args);
  }

  /** RLN only; narrow a mixed wallet with wallet.protocol before calling. */
  async backupNow(
    this: UTEXOWallet<'RGB_LN'>,
    ...args: Parameters<RlnWallet['backupNow']>
  ): ReturnType<RlnWallet['backupNow']> {
    return this.requireRln('backupNow').backupNow(...args);
  }
}
