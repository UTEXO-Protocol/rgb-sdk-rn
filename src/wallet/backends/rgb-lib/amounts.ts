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
      `${field} must be an exact unsigned integer`,
      undefined,
      'RGB_L1'
    );
  }
  const n = BigInt(value);
  if (n > U64_MAX || (positive && n === 0n)) {
    throw new WalletBackendError(
      'INVALID_AMOUNT',
      `${field} is outside the supported u64 range`,
      undefined,
      'RGB_L1'
    );
  }
  return n.toString();
}

/**
 * Converts issuance allocations and checks, before any native call, that the
 * resulting supply (and max supply including inflation) fits the numeric
 * public asset model. Balances never exceed the max supply, so this also
 * bounds every balance field the issued asset can later report.
 */
export function issuanceAmounts(
  amounts: readonly (number | bigint | string)[],
  inflationAmounts: readonly (number | bigint | string)[] = []
): { amounts: string[]; inflationAmounts: string[] } {
  const native = amounts.map((n) => u64(n, 'amount', true));
  const inflation = inflationAmounts.map((n) =>
    u64(n, 'inflationAmount', true)
  );
  const total = [...native, ...inflation].reduce(
    (sum, n) => sum + BigInt(n),
    0n
  );
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new WalletBackendError(
      'AMOUNT_OVERFLOW',
      'Total issued and inflatable supply cannot be represented by the numeric SDK fields',
      undefined,
      'RGB_L1'
    );
  }
  return { amounts: native, inflationAmounts: inflation };
}

export function safeNumber(value: string, field: string): number {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d*)$/.test(value)) {
    throw new WalletBackendError(
      'INVALID_NATIVE_RESPONSE',
      `Invalid native ${field}`,
      undefined,
      'RGB_L1'
    );
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new WalletBackendError(
      'AMOUNT_OVERFLOW',
      `${field} cannot be represented by the numeric SDK field`,
      undefined,
      'RGB_L1'
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
      'RGB Lib requires a positive integer feeRate in sat/vB',
      undefined,
      'RGB_L1'
    );
  }
  return String(value);
}
