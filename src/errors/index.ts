/**
 * Custom error classes for the RGB SDK
 */

/**
 * Base SDK error class with error codes and context
 */
export class SDKError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly cause?: Error;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    cause?: Error
  ) {
    super(message);
    this.name = 'SDKError';
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
    Object.setPrototypeOf(this, SDKError.prototype);
    
    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SDKError);
    }
  }

  /**
   * Convert error to JSON for logging
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }
}

/**
 * Network-related errors (API calls, connectivity)
 */
export class NetworkError extends SDKError {
  constructor(message: string, statusCode?: number, cause?: Error) {
    super(message, 'NETWORK_ERROR', statusCode, cause);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Validation errors (invalid input parameters)
 */
export class ValidationError extends SDKError {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.field = field;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Wallet-related errors (initialization, operations)
 */
export class WalletError extends SDKError {
  constructor(message: string, code?: string, cause?: Error) {
    super(message, code || 'WALLET_ERROR', undefined, cause);
    this.name = 'WalletError';
    Object.setPrototypeOf(this, WalletError.prototype);
  }
}

/**
 * Cryptographic errors (signing, key derivation)
 */
export class CryptoError extends SDKError {
  constructor(message: string, cause?: Error) {
    super(message, 'CRYPTO_ERROR', undefined, cause);
    this.name = 'CryptoError';
    Object.setPrototypeOf(this, CryptoError.prototype);
  }
}

/**
 * Configuration errors (missing or invalid configuration)
 */
export class ConfigurationError extends SDKError {
  constructor(message: string, field?: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

