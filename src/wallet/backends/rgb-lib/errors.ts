import { WalletBackendError } from '../../backend-errors';
import type { WalletBackendErrorCode } from '../../backend-errors';
import type { Spec } from '../../../binding/NativeRgbLib';

// Both bridges reject with these codes; see RgbLibSessionStore.kt and RgbLibSwiftHelper.swift.
const BRIDGE_CODES: readonly WalletBackendErrorCode[] = [
  'NATIVE_BACKEND_UNAVAILABLE',
  'WALLET_NOT_INITIALIZED',
  'WALLET_DISPOSED',
  'INVALID_CONFIG',
  'INVALID_NATIVE_RESPONSE',
  'WALLET_PROFILE_MISMATCH',
  'WALLET_STORAGE_IN_USE',
  'WALLET_STORAGE_NOT_EMPTY',
  'CONSIGNMENT_NOT_FOUND',
  'INVALID_CONSIGNMENT_PATH',
];

/** rgb-lib error variants, without the `RGB_LIB_` bridge prefix. */
function libraryCode(variant: string): WalletBackendErrorCode {
  if (variant === 'AssetNotFound') return 'ASSET_NOT_FOUND';
  if (variant.startsWith('Invalid')) return 'INVALID_PARAMS';
  if (variant.startsWith('Insufficient')) return 'INSUFFICIENT_FUNDS';
  return 'NATIVE_ERROR';
}

/** Stable SDK code for an rgb-lib variant name such as `RGB_LIB_InvalidInvoice`. */
export function rgbLibErrorCode(code: unknown): WalletBackendErrorCode {
  if (typeof code !== 'string') return 'NATIVE_ERROR';
  if (code.startsWith('RGB_LIB_'))
    return libraryCode(code.slice('RGB_LIB_'.length));
  return (BRIDGE_CODES as readonly string[]).includes(code)
    ? (code as WalletBackendErrorCode)
    : 'NATIVE_ERROR';
}

/** Platform rejections never reach callers; only WalletBackendError does. */
export function toBackendError(
  error: unknown,
  operation: string
): WalletBackendError {
  if (error instanceof WalletBackendError) return error;
  const native = error as { code?: unknown; message?: unknown } | null;
  return new WalletBackendError(
    rgbLibErrorCode(native?.code),
    typeof native?.message === 'string' && native.message
      ? native.message
      : 'RGB Lib operation failed',
    operation,
    'RGB_L1',
    error instanceof Error ? error : undefined
  );
}

/** The native transport, with every rejection translated by toBackendError. */
export function guardNative(native: Spec): Spec {
  return new Proxy(native, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      const operation = String(key);
      return (...args: unknown[]) => {
        try {
          return Promise.resolve(value.apply(target, args)).catch(
            (error: unknown) => {
              throw toBackendError(error, operation);
            }
          );
        } catch (error) {
          return Promise.reject(toBackendError(error, operation));
        }
      };
    },
  });
}
