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
export async function walletCall<T>(action: () => Promise<T>): Promise<T> {
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
    // RLN codes, then WalletBackendError codes (rgb-lib errors are normalized to these).
    if (
      code === 'AssetNotFound' ||
      code === 'UnknownAsset' ||
      code === 'ASSET_NOT_FOUND'
    )
      mapped = 'ASSET_NOT_FOUND';
    else if (
      code === 'InvalidAssetId' ||
      code === 'InvalidInvoice' ||
      code === 'InvalidAmount' ||
      code === 'INVALID_PARAMS' ||
      code === 'INVALID_AMOUNT' ||
      code === 'AMOUNT_OVERFLOW' ||
      code === 'FEE_RATE_UNSUPPORTED'
    )
      mapped = 'INVALID_PARAMS';
    else if (
      code === 'METHOD_NOT_SUPPORTED' ||
      code === 'UnsupportedInExternalSignerMode' ||
      code === 'UNSUPPORTED_CAPABILITY'
    )
      mapped = 'METHOD_NOT_SUPPORTED';
    throw new WebRgbError(mapped, native?.message ?? 'Wallet operation failed');
  }
}
