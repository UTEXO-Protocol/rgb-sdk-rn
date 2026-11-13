import type {
  Assignment as CoreAssignment,
  Balance,
  InvoiceRequest,
  ListAssets as CoreListAssets,
  OnchainReceiveRequestModel,
  Transfer as CoreTransfer,
} from '@utexo/rgb-sdk-core';
export interface BurnParams {
  assetId: string;
  /** Exact decimal base units. */
  amount: string;
  /** 32-byte commitment encoded as 64 hex characters, without 0x. */
  burnRecipient?: string;
  /** Positive integer sat/vB. */
  feeRate: number;
  minConfirmations: number;
}
export interface BurnResult {
  txid: string;
  batchTransferIdx: number;
  /** Exact native entropy when supplied by the backend. */
  entropy?: string;
}
export interface BfaCapabilities {
  burn: boolean;
  consignment: boolean;
  bfa: boolean;
}
/** BFA collection until the shared SDK model includes this schema. */
export interface AssetBfa {
  assetId: string;
  ticker: string;
  name: string;
  details?: string;
  precision: number;
  initialSupply: number;
  /** Supply known to circulate, as read from the bridge contract. */
  knownCirculatingSupply: number;
  timestamp: number;
  addedAt: number;
  balance: Balance & { offchainOutbound?: number; offchainInbound?: number };
  media?: { filePath: string; digest: string; mime: string };
  rejectListUrl?: string;
}
export type ListAssets = CoreListAssets & { bfa: AssetBfa[] };

/** Exact native amount; the legacy number is absent outside the safe range. */
export type TransferAssignment = CoreAssignment & { amountBaseUnits?: string };
export interface TransferAmount {
  /** Decimal base units, safe to serialize over JSON/WalletConnect. */
  amountBaseUnits?: string;
  /** Present only when the exact amount fits Number.MAX_SAFE_INTEGER. */
  amount?: number;
}
/** Core-compatible history with requested allocations and an exact amount. */
export type Transfer = CoreTransfer &
  TransferAmount & {
    requestedAssignment?: TransferAssignment;
    assignments: TransferAssignment[];
  };

/** Asset schema names as both native engines report them. */
export type AssetSchemaName = 'Nia' | 'Cfa' | 'Uda' | 'Ifa' | 'Bfa';

/**
 * Assignment an RGB invoice requests. `Fungible` and `InflationRight` need
 * `amount`; the others take none. RGB_LN does not support `MintRight`.
 * Omitted: `Fungible` when `amount` is set, otherwise `Any`.
 */
export type ReceiveAssignmentKind =
  | 'Fungible'
  | 'NonFungible'
  | 'InflationRight'
  | 'MintRight'
  | 'Any';
export type ReceiveParams = InvoiceRequest & {
  assignmentKind?: ReceiveAssignmentKind;
};
export type OnchainReceiveParams = OnchainReceiveRequestModel & {
  assignmentKind?: ReceiveAssignmentKind;
};

/** Read options shared by balance, unspent and transaction listings. */
export interface ReadOptions {
  /** Use the local wallet state without syncing first. Default `false`. */
  skipSync?: boolean;
}

// Issuance and metadata models live in core with the extensions that use them.
export type {
  AssetMetadata,
  IssueAssetCfaParams,
  IssueAssetUdaParams,
} from '@utexo/rgb-sdk-core';

/** `restoreBackupFromFile()` input. Both paths are absolute. */
export interface RestoreBackupFromFileParams {
  /** Archive written by RGB_L1 `exportBackupToFile()`. */
  filePath: string;
  password: string;
  /** New, empty directory; pass it as `storageDirPath` to the wallet. */
  dataDir: string;
}

/** @deprecated `restoreFromBackup()` input; use `RestoreBackupFromFileParams`. */
export interface RestoreFromBackupParams {
  /** Archive written by RGB_L1 `createBackup()`. */
  backupFilePath: string;
  password: string;
  /** New, empty directory; pass it as `storageDirPath` to the wallet. */
  dataDir: string;
}
export interface WalletRestoreResponse {
  message: string;
}
