/* eslint no-unused-vars: "off", "@typescript-eslint/no-unused-vars": "error" -- TypeScript signatures. */
import { isProviderError } from '@utexo/webrgb';
import type { ProviderErrorCode } from '@utexo/webrgb';

export class WebRgbError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'WebRgbError';
  }
}

/** Native errors are implementation details; expose only the WebRGB contract. */
export async function walletCall<T>(
  action: () => Promise<T>,
  context?: 'asset-balance'
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isProviderError(error)) throw error;
    const native = error as {
      code?: string | { type?: string };
      message?: string;
    } | null;
    const code =
      typeof native?.code === 'string' ? native.code : native?.code?.type;
    let mapped: ProviderErrorCode = 'INTERNAL_ERROR';
    // UniFFI groups missing assets, payments and channels under NotFound.
    // Only an asset-balance lookup makes that generic code an absent asset.
    if (
      code === 'AssetNotFound' ||
      code === 'UnknownAsset' ||
      (context === 'asset-balance' &&
        (code === 'NotFound' || code === 'UnknownContractId'))
    )
      mapped = 'ASSET_NOT_FOUND';
    else if (
      code === 'InvalidAssetId' ||
      code === 'InvalidInvoice' ||
      code === 'InvalidAmount'
    )
      mapped = 'INVALID_PARAMS';
    else if (
      code === 'METHOD_NOT_SUPPORTED' ||
      code === 'UnsupportedInExternalSignerMode'
    )
      mapped = 'METHOD_NOT_SUPPORTED';
    throw new WebRgbError(
      mapped,
      mapped === 'ASSET_NOT_FOUND' && context === 'asset-balance'
        ? 'This asset is not in this wallet yet. Receive it first, then refresh your balance.'
        : (native?.message ?? 'Wallet operation failed')
    );
  }
}
