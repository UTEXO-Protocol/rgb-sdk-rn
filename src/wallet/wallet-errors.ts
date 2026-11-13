import { SDKError } from '@utexo/rgb-sdk-core';
import type { EngineError } from '@utexo/rgb-sdk-core';
import type { WalletProtocol } from './wallet-api';

export type WalletBackendErrorCode =
  | 'NATIVE_BACKEND_UNAVAILABLE'
  | 'NATIVE_VERSION_MISMATCH'
  | 'WALLET_NOT_INITIALIZED'
  | 'WALLET_OFFLINE'
  | 'WALLET_STOPPING'
  | 'WALLET_INVALID_STATE'
  | 'WALLET_DISPOSED'
  | 'WALLET_CONFIG_MISMATCH'
  | 'INVALID_CONFIG'
  | 'KEYS_UNAVAILABLE'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_OVERFLOW'
  | 'FEE_RATE_UNSUPPORTED'
  | 'INVALID_NATIVE_RESPONSE'
  | 'UNSUPPORTED_CAPABILITY'
  | 'ASSET_NOT_FOUND'
  | 'INVALID_PARAMS'
  | 'INSUFFICIENT_FUNDS'
  | 'WALLET_PROFILE_MISMATCH'
  | 'WALLET_STORAGE_IN_USE'
  | 'WALLET_STORAGE_NOT_EMPTY'
  | 'CONSIGNMENT_NOT_FOUND'
  | 'INVALID_CONSIGNMENT_PATH'
  | 'NATIVE_ERROR';

/**
 * Errors are recognized by shape with core's `isEngineError()` (`EngineError`),
 * never by class: `instanceof` fails across duplicated SDK copies.
 */
export class WalletBackendError extends SDKError implements EngineError {
  // Always own properties, even when undefined: isEngineError() checks them.
  readonly operation: string | undefined;
  readonly protocol: WalletProtocol | undefined;

  constructor(
    readonly code: WalletBackendErrorCode,
    message: string,
    operation?: string,
    protocol?: WalletProtocol,
    cause?: Error
  ) {
    super(message, code, undefined, cause);
    this.operation = operation;
    this.protocol = protocol;
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'WalletBackendError';
  }
}

/** A rejection value that is not an `Error`, kept whole as `rejection`. */
export class NativeRejection extends Error {
  constructor(readonly rejection: unknown) {
    const message = (rejection as { message?: unknown } | null)?.message;
    super(typeof message === 'string' ? message : 'Native rejection');
    this.name = 'NativeRejection';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * A failure followed by a failed cleanup: both are kept, neither replaces the
 * other. Used as the `cause` of the error the caller gets.
 */
export class CleanupFailure extends Error {
  constructor(
    readonly error: unknown,
    readonly cleanupError: unknown
  ) {
    super(
      `${messageOf(error)}; cleanup also failed: ${messageOf(cleanupError)}`
    );
    this.name = 'CleanupFailure';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function messageOf(value: unknown): string {
  const message = (value as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : String(value);
}

/** Any rejection value as an `Error` cause; nothing is dropped. */
export function asCause(value: unknown): Error | undefined {
  if (value === undefined) return undefined;
  return value instanceof Error ? value : new NativeRejection(value);
}

/**
 * A wallet backend error in the context of a public operation:
 *   - returned as is (same object, stack and extra fields) when its operation
 *     and protocol already match;
 *   - otherwise a new error with the public operation and protocol, keeping
 *     the code and message. The cause is the original error, except for this
 *     package's own WalletBackendError, a lossless wrapper whose own cause is
 *     used instead (when it has one).
 * The original is never mutated.
 */
export function withOperation(
  error: EngineError,
  operation: string,
  protocol: WalletProtocol
): EngineError {
  if (error.operation === operation && error.protocol === protocol)
    return error;
  const cause =
    error instanceof WalletBackendError && error.cause instanceof Error
      ? error.cause
      : asCause(error);
  return new WalletBackendError(
    // A code from another copy is kept even if this copy does not list it.
    error.code as WalletBackendErrorCode,
    error.message,
    operation,
    protocol,
    cause
  );
}
