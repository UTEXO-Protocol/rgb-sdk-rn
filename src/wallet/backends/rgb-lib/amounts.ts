import { WalletBackendError } from '../../backend-errors';

const U64_MAX = 0xffffffffffffffffn;
export function u64(
  value: number | bigint | string,
  field: string,
  positive = false
): string {
  if (
    (typeof value === 'number' &&
      (!Number.isSafeInteger(value) || value < 0)) ||
    (typeof value !== 'number' &&
      typeof value !== 'bigint' &&
      typeof value !== 'string') ||
    !/^(0|[1-9]\d{0,19})$/.test(String(value))
  ) {
    throw new WalletBackendError(
      'INVALID_AMOUNT',
      `${field} must be an exact unsigned integer`
    );
  }
  const n = BigInt(value);
  if (n > U64_MAX || (positive && n === 0n)) {
    throw new WalletBackendError(
      'INVALID_AMOUNT',
      `${field} is outside the supported u64 range`
    );
  }
  return n.toString();
}

export function safeNumber(value: string, field: string): number {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d*)$/.test(value)) {
    throw new WalletBackendError(
      'INVALID_NATIVE_RESPONSE',
      `Invalid native ${field}`
    );
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new WalletBackendError(
      'AMOUNT_OVERFLOW',
      `${field} cannot be represented by the numeric SDK field`
    );
  }
  return number;
}

export function safeAmount(value: string, field: string): number {
  u64(value, field);
  return safeNumber(value, field);
}

export function feeRate(value: number = 2): string {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new WalletBackendError(
      'FEE_RATE_UNSUPPORTED',
      'RGB Lib requires a positive integer feeRate in sat/vB'
    );
  }
  return String(value);
}
