export type WalletBackendErrorCode =
  | 'NATIVE_BACKEND_UNAVAILABLE'
  | 'NATIVE_VERSION_MISMATCH'
  | 'WALLET_NOT_INITIALIZED'
  | 'WALLET_OFFLINE'
  | 'WALLET_STOPPING'
  | 'WALLET_DISPOSED'
  | 'WALLET_CONFIG_MISMATCH'
  | 'INVALID_CONFIG'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_OVERFLOW'
  | 'FEE_RATE_UNSUPPORTED'
  | 'INVALID_NATIVE_RESPONSE'
  | 'UNSUPPORTED_CAPABILITY';

export class WalletBackendError extends Error {
  constructor(
    readonly code: WalletBackendErrorCode,
    message: string,
    readonly operation?: string,
    readonly backend: 'rln' | 'rgb-lib' = 'rgb-lib'
  ) {
    super(message);
    this.name = 'WalletBackendError';
  }
}
