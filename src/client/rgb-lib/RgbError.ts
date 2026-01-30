import { RgbLibErrors } from './Interfaces';

/**
 * Custom error class for RGB library errors.
 * Provides structured error information with error codes and messages.
 */
export class RgbError extends Error {
  /**
   * Error code from the native module.
   * This helps identify which operation failed.
   */
  public readonly code: RgbLibErrors;

  /**
   * Original error message from the native module.
   */
  public readonly nativeMessage: string;

  constructor(
    code: RgbLibErrors,
    message: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'RgbError';
    this.code = code;
    this.nativeMessage = message;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RgbError);
    }
  }

  public isCode(code: RgbLibErrors): boolean {
    if (typeof this.code === 'string' && typeof code === 'string') {
      return this.code === code;
    }
    if (
      typeof this.code === 'object' &&
      typeof code === 'object' &&
      code !== null
    ) {
      return (
        'type' in this.code && 'type' in code && this.code.type === code.type
      );
    }
    return false;
  }

  public toString(): string {
    const codeStr =
      typeof this.code === 'string'
        ? this.code
        : `[${this.code.type}] ${JSON.stringify(this.code)}`;
    return `[${codeStr}] ${this.message}`;
  }

  /**
   * Converts a React Native error to an RgbError.
   * React Native errors from native modules typically have a code and message.
   * @param error - The error from React Native
   * @returns An RgbError instance, or the original error if it cannot be converted
   */
  public static fromReactNativeError(error: unknown): RgbError | Error {
    // Check if it's already an RgbError
    if (error instanceof RgbError) {
      return error;
    }

    if (error instanceof Error && 'code' in error) {
      const code = (error as any).code;
      const message = error.message || 'Unknown error';
      if (typeof code === 'string') {
        return new RgbError(code as RgbLibErrors, message, error);
      }
    }

    if (error instanceof Error) {
      return error;
    }

    return new Error(String(error));
  }
}

