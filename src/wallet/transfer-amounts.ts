import { ValidationError } from '@utexo/rgb-sdk-core';
import type { Transfer, TransferAmount, TransferAssignment } from './types';

const MAX_U64 = 18_446_744_073_709_551_615n;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function baseUnits(value: string): bigint {
  if (!/^(0|[1-9]\d{0,19})$/.test(value) || BigInt(value) > MAX_U64)
    throw new ValidationError(
      'Invalid transfer amount: expected u64 base units'
    );
  return BigInt(value);
}

function exactAmount(value: bigint): TransferAmount {
  return {
    amountBaseUnits: value.toString(),
    amount: value <= MAX_SAFE ? Number(value) : undefined,
  };
}

/** Parse native transfer allocations before any potentially lossy Number cast. */
export function parseTransferAssignment(value: string): TransferAssignment {
  const match = /^(Fungible|InflationRight)\((\d+)\)$/.exec(value);
  if (match) {
    return {
      type: match[1] as 'Fungible' | 'InflationRight',
      ...exactAmount(baseUnits(match[2]!)),
    };
  }
  if (/^(Fungible|InflationRight)\b/.test(value))
    throw new ValidationError('Invalid native transfer assignment');
  for (const type of ['NonFungible', 'ReplaceRight', 'Any'] as const) {
    if (value === type) return { type };
  }
  return { type: 'Any' };
}

/**
 * Outgoing assignments describe change or a whole batch, not this recipient.
 * Incoming/issuance history uses actual allocations, never an invoice request.
 */
export function getTransferAmount(
  transfer: Pick<Transfer, 'kind' | 'requestedAssignment' | 'assignments'>
): TransferAmount {
  let assignments: TransferAssignment[];
  switch (transfer.kind) {
    case 'Burn':
    case 'Send':
    case 'Inflation':
      assignments = transfer.requestedAssignment
        ? [transfer.requestedAssignment]
        : [];
      break;
    case 'ReceiveBlind':
    case 'ReceiveWitness':
    case 'Issuance':
      assignments = transfer.assignments;
      break;
    default:
      return {};
  }
  const fungible = assignments.filter((item) => item.type === 'Fungible');
  if (!fungible.length || fungible.some((a) => a.amountBaseUnits === undefined))
    return {};
  // Allocations have already been validated by parseTransferAssignment.
  const total = fungible.reduce(
    (sum, a) => sum + BigInt(a.amountBaseUnits!),
    0n
  );
  if (total > MAX_U64) throw new ValidationError('Transfer amount exceeds u64');
  return exactAmount(total);
}
