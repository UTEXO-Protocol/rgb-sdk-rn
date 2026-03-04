/**
 * Unit conversion utilities for asset amounts
 *
 * These functions convert between human-readable decimal amounts
 * and integer amounts based on asset precision.
 */

/**
 * Converts a decimal amount string to integer units based on precision
 *
 * @param value - Decimal amount as string (e.g., "123.456")
 * @param precision - Number of decimal places for the asset (e.g., 6 for USDT)
 * @returns Integer amount in smallest units (e.g., 123456000 for "123.456" with precision 6)
 * @throws Error if the result exceeds Number.MAX_SAFE_INTEGER
 *
 * @example
 * ```typescript
 * // Convert 123.456 USDT (precision 6) to units
 * const units = toUnitsNumber("123.456", 6); // 123456000
 *
 * // Convert 1.5 BTC (precision 8) to satoshis
 * const sats = toUnitsNumber("1.5", 8); // 150000000
 * ```
 */
export function toUnitsNumber(value: string, precision: number): number {
  const s = String(value).trim();
  const neg = s.startsWith('-');
  const [iRaw, fRaw = ''] = (neg ? s.slice(1) : s).split('.');
  const frac = (fRaw + '0'.repeat(precision)).slice(0, precision);

  const unitsStr = (iRaw || '0') + frac;
  const units = Number(unitsStr);

  if (!Number.isSafeInteger(units)) {
    throw new Error(
      `Amount exceeds MAX_SAFE_INTEGER. Use BigInt instead. got=${unitsStr}`
    );
  }

  return neg ? -units : units;
}

/**
 * Converts integer units to a decimal amount based on precision
 *
 * @param units - Integer amount in smallest units (e.g., 123456000)
 * @param precision - Number of decimal places for the asset (e.g., 6)
 * @returns Decimal amount (e.g., 123.456)
 *
 * @example
 * ```typescript
 * // Convert 123456000 units to USDT (precision 6)
 * const usdt = fromUnitsNumber(123456000, 6); // 123.456
 *
 * // Convert 150000000 satoshis to BTC (precision 8)
 * const btc = fromUnitsNumber(150000000, 8); // 1.5
 * ```
 */
export function fromUnitsNumber(units: number, precision: number): number {
  const neg = units < 0;
  const base = 10 ** precision;

  const value = Math.abs(units) / base;
  return neg ? -value : value;
}
