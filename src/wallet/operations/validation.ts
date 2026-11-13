import { ValidationError } from '@utexo/rgb-sdk-core';
import type { AssetSchemaName, ReceiveAssignmentKind } from '../types';

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
  // Own keys only: `toString` or `__proto__` must not pass as a kind.
  const rule = Object.prototype.hasOwnProperty.call(RECEIVE_KINDS, resolved)
    ? RECEIVE_KINDS[resolved]
    : undefined;
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
