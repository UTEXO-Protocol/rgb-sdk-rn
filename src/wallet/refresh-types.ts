import type { TransferStatus } from '@utexo/rgb-sdk-core';

export interface RefreshFailure {
  name: string;
  message: string;
}

export interface RefreshedTransfer {
  updatedStatus?: TransferStatus;
  failure?: RefreshFailure;
}

export interface RefreshTransfersResult {
  /** Keys are batch transfer IDs from rgb-lib, not the individual Transfer.idx. */
  transfers: Record<number, RefreshedTransfer>;
}
