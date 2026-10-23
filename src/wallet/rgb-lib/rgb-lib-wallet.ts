import type {
  OnchainWalletApi,
  OnchainWalletBackend,
  WalletBitcoin,
  WalletRgb,
  WalletHistory,
  WalletBackup,
  WalletBfa,
  WalletMaintenance,
} from '../wallet-api';

import { RgbLibWalletBackend } from './backend';
import type { RgbLibUnlockParams, RgbLibWalletParams } from './config';
import type { IRgbLibKeyProvider } from './key-provider';
import { getRgbLibBinding } from './native';

/** Internal on-chain adapter; the backend owns native sessions and serialization. */
export class RgbLibWallet
  implements OnchainWalletApi<RgbLibUnlockParams>, WalletMaintenance
{
  readonly psbt = undefined;
  readonly beginEnd = undefined;
  readonly messageSigning = undefined;

  readonly protocol = 'RGB_L1' as const;
  private readonly ports: OnchainWalletBackend<RgbLibUnlockParams>;

  constructor(
    params: RgbLibWalletParams,
    keys: IRgbLibKeyProvider,
    loadBinding: typeof getRgbLibBinding = getRgbLibBinding
  ) {
    this.ports = new RgbLibWalletBackend(params, keys, loadBinding);
  }

  get capabilities() {
    return {
      psbtSigning: this.psbt !== undefined,
      beginEndFlows: this.beginEnd !== undefined,
    };
  }

  init() {
    return this.ports.lifecycle.init();
  }
  initialize() {
    return this.init();
  }
  unlock(params: RgbLibUnlockParams) {
    return this.ports.lifecycle.unlock(params);
  }
  reinit(params?: RgbLibUnlockParams) {
    return this.ports.lifecycle.reinit(params);
  }
  shutdown() {
    return this.ports.lifecycle.shutdown();
  }
  destroy() {
    return this.ports.lifecycle.destroy();
  }
  dispose() {
    return this.destroy();
  }
  isDisposed() {
    return this.ports.lifecycle.isDisposed();
  }
  getNetwork() {
    return this.ports.network.getNetwork();
  }
  getNetworkInfo() {
    return this.ports.network.getNetworkInfo();
  }
  getWalletIdentity() {
    return this.ports.network.getWalletIdentity();
  }

  getBtcBalance(...args: Parameters<WalletBitcoin['getBtcBalance']>) {
    return this.ports.bitcoin.getBtcBalance(...args);
  }
  getAddress() {
    return this.ports.bitcoin.getAddress();
  }
  rotateVanillaAddress() {
    return this.ports.bitcoin.rotateVanillaAddress();
  }
  listUnspents(...args: Parameters<WalletBitcoin['listUnspents']>) {
    return this.ports.bitcoin.listUnspents(...args);
  }
  checkIndexerUrl(...args: Parameters<WalletBitcoin['checkIndexerUrl']>) {
    return this.ports.bitcoin.checkIndexerUrl(...args);
  }
  /** RGB_L1 only. */
  drainTo(...args: Parameters<WalletMaintenance['drainTo']>) {
    return this.ports.maintenance.drainTo(...args);
  }
  /** RGB_L1 only. */
  deleteTransfers(...args: Parameters<WalletMaintenance['deleteTransfers']>) {
    return this.ports.maintenance.deleteTransfers(...args);
  }
  createUtxos(...args: Parameters<WalletBitcoin['createUtxos']>) {
    return this.ports.bitcoin.createUtxos(...args);
  }
  sendBtc(...args: Parameters<WalletBitcoin['sendBtc']>) {
    return this.ports.bitcoin.sendBtc(...args);
  }
  estimateFeeRate(...args: Parameters<WalletBitcoin['estimateFeeRate']>) {
    return this.ports.bitcoin.estimateFeeRate(...args);
  }

  listAssets(...args: Parameters<WalletRgb['listAssets']>) {
    return this.ports.rgb.listAssets(...args);
  }
  getAssetMetadata(...args: Parameters<WalletRgb['getAssetMetadata']>) {
    return this.ports.rgb.getAssetMetadata(...args);
  }
  issueAssetCfa(...args: Parameters<WalletRgb['issueAssetCfa']>) {
    return this.ports.rgb.issueAssetCfa(...args);
  }
  issueAssetUda(...args: Parameters<WalletRgb['issueAssetUda']>) {
    return this.ports.rgb.issueAssetUda(...args);
  }
  getAssetBalance(...args: Parameters<WalletRgb['getAssetBalance']>) {
    return this.ports.rgb.getAssetBalance(...args);
  }
  issueAssetNia(...args: Parameters<WalletRgb['issueAssetNia']>) {
    return this.ports.rgb.issueAssetNia(...args);
  }
  issueAssetIfa(...args: Parameters<WalletRgb['issueAssetIfa']>) {
    return this.ports.rgb.issueAssetIfa(...args);
  }
  inflate(...args: Parameters<WalletRgb['inflate']>) {
    return this.ports.rgb.inflate(...args);
  }
  blindReceive(...args: Parameters<WalletRgb['blindReceive']>) {
    return this.ports.rgb.blindReceive(...args);
  }
  witnessReceive(...args: Parameters<WalletRgb['witnessReceive']>) {
    return this.ports.rgb.witnessReceive(...args);
  }
  onchainReceive(...args: Parameters<WalletRgb['onchainReceive']>) {
    return this.ports.rgb.onchainReceive(...args);
  }
  onchainSend(...args: Parameters<WalletRgb['onchainSend']>) {
    return this.ports.rgb.onchainSend(...args);
  }
  decodeRGBInvoice(...args: Parameters<WalletRgb['decodeRGBInvoice']>) {
    return this.ports.rgb.decodeRGBInvoice(...args);
  }
  failTransfers(...args: Parameters<WalletRgb['failTransfers']>) {
    return this.ports.rgb.failTransfers(...args);
  }

  listTransactions(...args: Parameters<WalletHistory['listTransactions']>) {
    return this.ports.history.listTransactions(...args);
  }
  listTransactionsByTxid(
    ...args: Parameters<WalletHistory['listTransactionsByTxid']>
  ) {
    return this.ports.history.listTransactionsByTxid(...args);
  }
  listTransfers(...args: Parameters<WalletHistory['listTransfers']>) {
    return this.ports.history.listTransfers(...args);
  }
  listTransfersByTxid(
    ...args: Parameters<WalletHistory['listTransfersByTxid']>
  ) {
    return this.ports.history.listTransfersByTxid(...args);
  }
  listOnchainTransfers(
    ...args: Parameters<WalletHistory['listOnchainTransfers']>
  ) {
    return this.ports.history.listOnchainTransfers(...args);
  }
  refreshWallet() {
    return this.ports.history.refreshWallet();
  }
  refreshTransfers(...args: Parameters<WalletHistory['refreshTransfers']>) {
    return this.ports.history.refreshTransfers(...args);
  }
  syncWallet() {
    return this.ports.history.syncWallet();
  }

  createBackup(...args: Parameters<WalletBackup['createBackup']>) {
    return this.ports.backup.createBackup(...args);
  }
  getBfaCapabilities() {
    return this.ports.bfa.getBfaCapabilities();
  }
  burn(...args: Parameters<WalletBfa['burn']>) {
    return this.ports.bfa.burn(...args);
  }
  getConsignment(...args: Parameters<WalletBfa['getConsignment']>) {
    return this.ports.bfa.getConsignment(...args);
  }
  getConsignmentPath(...args: Parameters<WalletBfa['getConsignmentPath']>) {
    return this.ports.bfa.getConsignmentPath(...args);
  }
}
