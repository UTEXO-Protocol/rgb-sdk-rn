import { ValidationError } from '@utexo/rgb-sdk-core';
import type {
  AssetSchemaName,
  BurnParams,
  ReceiveAssignmentKind,
} from '../types';

/**
 * Accepts an absolute path or a `file://` URI, as React Native file APIs
 * often return, and gives the absolute path both engines read from.
 */
export function localFilePath(value: unknown, field: string): string {
  const invalid = () =>
    new ValidationError(
      `${field} must be an absolute path or a file:// URI`,
      field
    );
  if (typeof value !== 'string') throw invalid();
  let path = value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    const uri = /^file:\/\/(?:localhost)?(\/[^?#]*)$/i.exec(value);
    if (!uri) throw invalid();
    try {
      path = decodeURIComponent(uri[1]!);
    } catch {
      throw invalid();
    }
  }
  if (!path.startsWith('/') || path.includes('\0')) throw invalid();
  return path;
}

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
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
      throw new ValidationError(
        `${field} must be a non-negative safe integer for the native bridge`
      );
    return Number(value);
  }
  if (!Number.isSafeInteger(value) || value < 0)
    throw new ValidationError(
      `${field} must be a non-negative safe integer for the native bridge`
    );
  return value;
}

const RECEIVE_KINDS: Record<ReceiveAssignmentKind, 'amount' | 'none'> = {
  Fungible: 'amount',
  InflationRight: 'amount',
  NonFungible: 'none',
  MintRight: 'none',
  Any: 'none',
};

/**
 * Resolves the invoice assignment for a receive. Both engines share these
 * rules, so a request means the same thing on RGB_L1 and RGB_LN.
 */
export function resolveReceiveAssignment(
  kind: ReceiveAssignmentKind | undefined,
  amount: number | undefined
): ReceiveAssignmentKind {
  const resolved = kind ?? (amount === undefined ? 'Any' : 'Fungible');
  const rule = RECEIVE_KINDS[resolved];
  if (rule === undefined)
    throw new ValidationError(
      `Unknown assignmentKind: ${String(kind)}`,
      'assignmentKind'
    );
  if (rule === 'amount' && amount === undefined)
    throw new ValidationError(`${resolved} receive requires amount`, 'amount');
  if (rule === 'none' && amount !== undefined)
    throw new ValidationError(`${resolved} receive takes no amount`, 'amount');
  return resolved;
}

const ASSET_SCHEMAS: readonly AssetSchemaName[] = [
  'Nia',
  'Cfa',
  'Uda',
  'Ifa',
  'Bfa',
];

export function validateAssetSchemas(
  schemas: readonly AssetSchemaName[] | undefined
): AssetSchemaName[] {
  const list = schemas ?? [];
  for (const schema of list)
    if (!ASSET_SCHEMAS.includes(schema))
      throw new ValidationError(
        `Unknown asset schema: ${String(schema)}`,
        'filterAssetSchemas'
      );
  return [...list];
}
