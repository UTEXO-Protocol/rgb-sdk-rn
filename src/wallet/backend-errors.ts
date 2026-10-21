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
