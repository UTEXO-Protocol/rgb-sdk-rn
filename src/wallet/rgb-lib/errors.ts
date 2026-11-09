import { isEngineError } from '@utexo/rgb-sdk-core';
import type { EngineError } from '@utexo/rgb-sdk-core';
import { asCause, WalletBackendError, withOperation } from '../wallet-errors';
import type { WalletBackendErrorCode } from '../wallet-errors';
import type { Spec } from '../../native/NativeRgbLib';

export { NativeRejection } from '../wallet-errors';

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
  if (variant === 'WatchOnly') return 'UNSUPPORTED_CAPABILITY';
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
export function toBackendError(error: unknown, operation: string): EngineError {
  if (isEngineError(error)) return error;
  const native = error as { code?: unknown; message?: unknown } | null;
  if (native?.code === 'RGB_LIB_WatchOnly') {
    return new WalletBackendError(
      'UNSUPPORTED_CAPABILITY',
      `${operation} needs the mnemonic; this RGB_L1 wallet was opened watch-only from public keys`,
      operation,
      'RGB_L1',
      asCause(error)
    );
  }
  return new WalletBackendError(
    rgbLibErrorCode(native?.code),
    typeof native?.message === 'string' && native.message
      ? native.message
      : 'RGB Lib operation failed',
    operation,
    'RGB_L1',
    asCause(error)
  );
}

/**
 * The error a public operation rejects with. Applied once, at the public
 * boundary:
 *   - a wallet backend error (any copy): see withOperation(), with RGB_L1;
 *   - a validation error (core `ValidationError`, any copy) → `INVALID_PARAMS`;
 *   - anything else is mapped like a native rejection.
 * The original is never mutated.
 */
export function toPublicError(error: unknown, operation: string): EngineError {
  if (isEngineError(error)) return withOperation(error, operation, 'RGB_L1');
  const value = error as { code?: unknown; message?: unknown } | null;
  if (value?.code === 'VALIDATION_ERROR' && typeof value.message === 'string') {
    return new WalletBackendError(
      'INVALID_PARAMS',
      value.message,
      operation,
      'RGB_L1',
      asCause(error)
    );
  }
  return toBackendError(error, operation);
}

/**
 * A synchronous throw while a public operation reads its arguments (before
 * admission, so nothing has run). Errors that already carry a code go through
 * toPublicError; anything else (a `TypeError` from a malformed argument, a
 * throwing getter) is an `INVALID_PARAMS` with the original as cause.
 */
export function toArgumentError(
  error: unknown,
  operation: string
): EngineError {
  const value = error as { code?: unknown } | null;
  if (isEngineError(error) || value?.code === 'VALIDATION_ERROR')
    return toPublicError(error, operation);
  return new WalletBackendError(
    'INVALID_PARAMS',
    `Invalid arguments for ${operation}`,
    operation,
    'RGB_L1',
    asCause(error)
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
