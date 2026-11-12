import type {
  AssetCFA,
  AssetUDA,
  AssignmentType,
  BtcBalance,
  IBitcoinWallet,
  IRgbAssets,
  IOnchainTransfers,
  IWalletLifecycle,
  InvoiceData,
  Network,
  TransferKind,
  Unspent,
  WalletBackupResponse,
  WalletCapabilities,
} from '@utexo/rgb-sdk-core';
import type {
  AssetMetadata,
  AssetSchemaName,
  BfaCapabilities,
  BurnParams,
  BurnResult,
  IssueAssetCfaParams,
  IssueAssetUdaParams,
  ListAssets,
  OnchainReceiveParams,
  ReadOptions,
  ReceiveParams,
  Transfer,
} from './types';
import type { RefreshTransfersResult } from './refresh-types';
import type { IndexerUrlInfo } from '@utexo/rgb-sdk-core';

/** Public wallet mode, using the same vocabulary as WebRGB. */
export type WalletProtocol = 'RGB_L1' | 'RGB_LN';
export interface WalletIdentity {
  id: string;
  protocol: WalletProtocol;
  network: Network;
}
/** Additions in RGB 0.11.2 without changing the legacy RLN/core declarations. */
export interface WalletAssignment {
  type: AssignmentType | 'MintRight' | 'LinkRight';
  amount?: number;
  amountBaseUnits?: string;
}
export type WalletTransfer = Omit<
  Transfer,
  'kind' | 'assignments' | 'requestedAssignment' | 'changeUtxo'
> & {
  kind: TransferKind | 'Mint' | 'Link';
  assignments: WalletAssignment[];
  requestedAssignment?: WalletAssignment;
  /** Every change output of the transfer; empty when it has none. */
  changeUtxos: NonNullable<Transfer['changeUtxo']>[];
  /** @deprecated A transfer can have several change outputs; use `changeUtxos`. This is its first element. */
  changeUtxo?: Transfer['changeUtxo'];
};
export type WalletUnspent = Omit<Unspent, 'rgbAllocations'> & {
  rgbAllocations: {
    assetId?: string;
    assignment: WalletAssignment;
    settled: boolean;
  }[];
};
export type WalletInvoiceData = Omit<
  InvoiceData,
  'assignment' | 'assetSchema'
> & {
  assignment: WalletAssignment;
  assetSchema?: InvoiceData['assetSchema'] | 'Bfa';
  publicKey?: string;
  encryption?: 'Required' | 'Optional' | 'Unsupported';
  unknownQueryParams?: Readonly<Record<string, string>>;
};

export interface WalletHistory {
  listTransfers(assetId?: string): Promise<WalletTransfer[]>;
  listTransfersByTxid(txid: string): Promise<WalletTransfer[]>;
  listOnchainTransfers(assetId?: string): Promise<WalletTransfer[]>;
  listTransactions(
    options?: ReadOptions
  ): ReturnType<IRgbAssets['listTransactions']>;
  /** A boolean second argument is the old `skipSync` form; still accepted. */
  listTransactionsByTxid(
    txid: string,
    options?: ReadOptions | boolean
  ): ReturnType<IRgbAssets['listTransactions']>;
  refresh(options?: ReadOptions): Promise<RefreshTransfersResult>;
  refreshWallet(): Promise<void>;
  refreshTransfers(skipSync?: boolean): Promise<RefreshTransfersResult>;
  syncWallet(): Promise<void>;
}
export interface WalletBackup {
  /** Writes the encrypted backup archive to an absolute `filePath`. */
  exportBackupToFile(params: {
    filePath: string;
    password: string;
  }): Promise<WalletBackupResponse>;
  /** The encrypted backup archive as bytes; the app stores them where it wants. */
  exportBackup(params: { password: string }): Promise<Uint8Array>;
  /** @deprecated Use `exportBackupToFile({ filePath, password })`. */
  createBackup(params: {
    backupPath: string;
    password: string;
  }): Promise<WalletBackupResponse>;
}
export interface WalletBfa {
  getBfaCapabilities(): Promise<BfaCapabilities>;
  burn(params: BurnParams): Promise<BurnResult>;
  getConsignment(assetId: string, txid: string): Promise<string>;
  getConsignmentPath(assetId: string, txid: string): Promise<string>;
}
export interface WalletBitcoin extends Omit<
  IBitcoinWallet,
  'getBtcBalance' | 'listUnspents' | 'createUtxos'
> {
  getBtcBalance(options?: ReadOptions): Promise<BtcBalance>;
  listUnspents(options?: ReadOptions): Promise<WalletUnspent[]>;
  createUtxos(
    params: Parameters<IBitcoinWallet['createUtxos']>[0] & ReadOptions
  ): Promise<number>;
  rotateVanillaAddress(): Promise<string>;
  /** Detects the indexer protocol behind `url`. */
  checkIndexerUrl(url: string): Promise<IndexerUrlInfo>;
}
/** rgb-lib operations RLN has no equivalent for. Not part of the shared contract. */
export interface WalletMaintenance {
  /** Sends the whole vanilla BTC balance to `address`; returns the txid. */
  drainTo(params: { address: string; feeRate?: number }): Promise<string>;
  /** Removes failed transfers from the local database. */
  deleteTransfers(params?: {
    batchTransferIdx?: number;
    noAssetOnly?: boolean;
  }): Promise<boolean>;
}
export interface WalletRgb
  extends
    Omit<
      IRgbAssets,
      | 'listAssets'
      | 'listTransfers'
      | 'listTransactions'
      | 'decodeRGBInvoice'
      | 'blindReceive'
      | 'witnessReceive'
    >,
    Pick<IOnchainTransfers, 'onchainSend'> {
  listAssets(options?: {
    filterAssetSchemas?: AssetSchemaName[];
  }): Promise<ListAssets>;
  getAssetMetadata(assetId: string): Promise<AssetMetadata>;
  issueAssetCfa(params: IssueAssetCfaParams): Promise<AssetCFA>;
  issueAssetUda(params: IssueAssetUdaParams): Promise<AssetUDA>;
  blindReceive(params: ReceiveParams): ReturnType<IRgbAssets['blindReceive']>;
  witnessReceive(
    params: ReceiveParams
  ): ReturnType<IRgbAssets['witnessReceive']>;
  onchainReceive(
    params: OnchainReceiveParams
  ): ReturnType<IOnchainTransfers['onchainReceive']>;
  decodeRGBInvoice(params: { invoice: string }): Promise<WalletInvoiceData>;
}
export interface WalletNetwork {
  getNetwork(): Network;
  getNetworkInfo(): Promise<{ network: string; blockHeight?: number }>;
  getWalletIdentity(): Promise<WalletIdentity>;
}
export interface WalletLifecycle<T> extends IWalletLifecycle<T> {
  /** Without params: the constructor's connection settings, then the network defaults. */
  goOnline(params?: T): Promise<void>;
  /** The shared contract's name for `goOnline`; same call. */
  unlock(params?: T): Promise<void>;
  initialize(): Promise<void>;
  reinit(params?: T): Promise<void>;
  shutdown(): Promise<void>;
  destroy(): Promise<void>;
}
export interface OnchainWalletApi<TUnlockParams>
  extends
    WalletBitcoin,
    WalletRgb,
    WalletHistory,
    WalletBackup,
    WalletBfa,
    WalletNetwork,
    WalletLifecycle<TUnlockParams> {
  readonly protocol: WalletProtocol;
  readonly capabilities: WalletCapabilities;
}

/** Backend ports are composed once; facades do not branch on backend per operation. */
export interface OnchainWalletBackend<T> {
  lifecycle: Omit<WalletLifecycle<T>, 'initialize' | 'dispose'>;
  bitcoin: WalletBitcoin;
  rgb: WalletRgb;
  history: WalletHistory;
  backup: WalletBackup;
  bfa: WalletBfa;
  network: WalletNetwork;
  maintenance: WalletMaintenance;
}
