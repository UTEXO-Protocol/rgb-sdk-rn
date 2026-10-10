import { ValidationError } from '@utexo/rgb-sdk-core';
import type { BurnParams } from '../types';

export function validateConsignmentLookup(assetId: string, txid: string): void {
  if (
    typeof assetId !== 'string' ||
    !assetId.startsWith('rgb:') ||
    assetId.length > 256 ||
    typeof txid !== 'string' ||
    !/^[a-fA-F0-9]{64}$/.test(txid)
  )
    throw new Error('Invalid assetId or txid');
}
export function validateBurnParams(params: BurnParams): void {
  if (
    !params ||
    typeof params.assetId !== 'string' ||
    !params.assetId.startsWith('rgb:') ||
    params.assetId.length > 256
  )
    throw new Error('Invalid assetId');
  if (
    typeof params.amount !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(params.amount) ||
    BigInt(params.amount) > 18446744073709551615n
  )
    throw new Error('Burn amount must be a positive u64 decimal string');
  if (
    params.burnRecipient !== undefined &&
    !/^[a-fA-F0-9]{64}$/.test(params.burnRecipient)
  )
    throw new Error('burnRecipient must be 32-byte hex without 0x');
  if (!Number.isSafeInteger(params.feeRate) || params.feeRate < 1)
    throw new Error('feeRate must be a positive safe integer in sat/vB');
  if (
    !Number.isInteger(params.minConfirmations) ||
    params.minConfirmations < 1 ||
    params.minConfirmations > 255
  )
    throw new Error('minConfirmations must be between 1 and 255');
}

/**
 * Convert a `number | bigint` amount to the double the TurboModule bridge
 * carries. The shared contract invites bigint inputs (RGB amounts are u64
 * base units, realistically above 2^53 for high-precision tokens), but
 * `Number()` silently rounds those — the node would then fund, push or
 * invoice a different amount than requested. Fail closed instead, the same
 * way transfer amounts and BFA balances already do.
 */
export function toSafeBridgeNumber(
  value: number | bigint | null | undefined,
  field: string
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER))
      throw new ValidationError(
        `${field} exceeds the exact integer range of the native bridge`
      );
    return Number(value);
  }
  if (!Number.isSafeInteger(value))
    throw new ValidationError(
      `${field} must be a safe integer for the native bridge`
    );
  return value;
}
