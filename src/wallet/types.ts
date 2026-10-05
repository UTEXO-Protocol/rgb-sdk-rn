import type { ListAssets as CoreListAssets } from '@utexo/rgb-sdk-core';
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
