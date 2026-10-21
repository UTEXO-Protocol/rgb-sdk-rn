import type {
  AssignmentType,
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
  BfaCapabilities,
  BurnParams,
  BurnResult,
  ListAssets,
  Transfer,
} from './types';
import type { RefreshTransfersResult } from './refresh-types';

/** Public wallet mode, using the same vocabulary as WebRGB. */
export type WalletProtocol = 'RGB_L1' | 'RGB_LN';
export interface WalletIdentity {
  id: string;
  protocol: WalletProtocol;
  network: Network;
}
/** Additions in RGB 0.11.2 without changing the legacy RLN/core declarations. */
export interface WalletAssignment {
  type: AssignmentType | 'MintRight';
  amount?: number;
  amountBaseUnits?: string;
}
export type WalletTransfer = Omit<
  Transfer,
  'kind' | 'assignments' | 'requestedAssignment'
> & {
  kind: TransferKind | 'Mint';
  assignments: WalletAssignment[];
  requestedAssignment?: WalletAssignment;
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
  listTransactions: IRgbAssets['listTransactions'];
  listTransactionsByTxid(
    txid: string,
    skipSync?: boolean
  ): ReturnType<IRgbAssets['listTransactions']>;
  refreshWallet(): Promise<void>;
  refreshTransfers(skipSync?: boolean): Promise<RefreshTransfersResult>;
  syncWallet(): Promise<void>;
}
export interface WalletBackup {
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
export interface WalletBitcoin extends Omit<IBitcoinWallet, 'listUnspents'> {
  listUnspents(): Promise<WalletUnspent[]>;
  rotateVanillaAddress(): Promise<string>;
}
export interface WalletRgb
  extends
    Omit<
      IRgbAssets,
      'listAssets' | 'listTransfers' | 'listTransactions' | 'decodeRGBInvoice'
    >,
    Pick<IOnchainTransfers, 'onchainReceive' | 'onchainSend'> {
  listAssets(): Promise<ListAssets>;
  decodeRGBInvoice(params: { invoice: string }): Promise<WalletInvoiceData>;
}
export interface WalletNetwork {
  getNetwork(): Network;
  getNetworkInfo(): Promise<{ network: string; blockHeight?: number }>;
  getWalletIdentity(): Promise<WalletIdentity>;
}
export interface WalletLifecycle<T> extends IWalletLifecycle<T> {
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
  lifecycle: WalletLifecycle<T>;
  bitcoin: WalletBitcoin;
  rgb: WalletRgb;
  history: WalletHistory;
  backup: WalletBackup;
  bfa: WalletBfa;
  network: WalletNetwork;
}
