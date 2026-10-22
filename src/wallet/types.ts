import type {
  Assignment as CoreAssignment,
  Balance,
  ListAssets as CoreListAssets,
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
