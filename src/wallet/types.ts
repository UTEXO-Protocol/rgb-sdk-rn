import type {
  Assignment as CoreAssignment,
  ListAssets as CoreListAssets,
  Transfer as CoreTransfer,
} from '@utexo/rgb-sdk-core';
import type {
  RlnAssetBfa,
  RlnBfaCapabilities,
  RlnBurnParams,
  RlnBurnResult,
} from '../binding/rln-types';

export type BurnParams = RlnBurnParams;
export type BurnResult = RlnBurnResult;
export type BfaCapabilities = RlnBfaCapabilities;
/** BFA collection until the shared SDK model includes this schema. */
export type AssetBfa = RlnAssetBfa;
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
