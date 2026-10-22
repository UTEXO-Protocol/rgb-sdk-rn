import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import type { RgbBurnRecipient } from '@utexo/webrgb';
import { encodeTronBurnRecipient, normalizeBurnRecipient } from './recipient';

/** Public metadata whose hash is committed as the native BFA burn reason. */
export interface BurnDestination {
  version: 1;
  destinationChainId: number;
  dstEid: number;
  recipient: `0x${string}`;
}

/** Deployment-owned payout routes; never accept route configuration from a dApp. */
export interface BurnDestinationRoute {
  chainId: string;
  dstEid: number;
}

export function parseBurnDestination(value: unknown): BurnDestination {
  const record = value as Partial<BurnDestination> | null;
  if (
    !record ||
    record.version !== 1 ||
    !Number.isSafeInteger(record.destinationChainId) ||
    record.destinationChainId! <= 0 ||
    !Number.isSafeInteger(record.dstEid) ||
    record.dstEid! < 0 ||
    record.dstEid! > 0xffffffff ||
    typeof record.recipient !== 'string' ||
    !/^0x(?:[\da-f]{2}){1,32}$/i.test(record.recipient) ||
    (record.dstEid === 0 && record.recipient.length !== 42)
  )
    throw new Error('Invalid V1 burn destination');
  return {
    version: 1,
    destinationChainId: record.destinationChainId!,
    dstEid: record.dstEid!,
    recipient: record.recipient.toLowerCase() as `0x${string}`,
  };
}

/** Validate that a stored/requested destination describes the approved payout. */
export function validateBurnDestination(
  value: unknown,
  payout: RgbBurnRecipient
): BurnDestination {
  const destination = parseBurnDestination(value);
  const normalized = normalizeBurnRecipient(payout);
  const recipient = normalized.chainId.startsWith('tron:')
    ? `0x41${encodeTronBurnRecipient(normalized.address).slice(24)}`
    : normalized.address;
  if (
    destination.destinationChainId !==
      Number(normalized.chainId.split(':')[1]) ||
    destination.recipient !== recipient
  )
    throw new Error(
      'Burn destination does not match the payout chain and address'
    );
  return destination;
}

export function createBurnDestination(
  payout: RgbBurnRecipient,
  routes: readonly BurnDestinationRoute[]
): BurnDestination {
  const normalized = normalizeBurnRecipient(payout);
  const route = routes.find(({ chainId }) => chainId === normalized.chainId);
  if (!route) throw new Error('Unsupported V1 payout route');
  return validateBurnDestination(
    {
      version: 1,
      destinationChainId: Number(normalized.chainId.split(':')[1]),
      dstEid: route.dstEid,
      recipient: normalized.chainId.startsWith('tron:')
        ? `0x41${encodeTronBurnRecipient(normalized.address).slice(24)}`
        : normalized.address,
    },
    normalized
  );
}

/** keccak256(abi.encode(typeHash, uint64 chain, uint32 eid, keccak256(recipient))). */
export function burnDestinationHash(value: BurnDestination): `0x${string}` {
  const record = parseBurnDestination(value);
  const encoded = new Uint8Array(128);
  encoded.set(
    keccak_256(
      utf8ToBytes(
        'UtexoBurnDestinationV1(uint64 destinationChainId,uint32 dstEid,bytes recipient)'
      )
    )
  );
  const view = new DataView(encoded.buffer);
  view.setBigUint64(56, BigInt(record.destinationChainId));
  view.setUint32(92, record.dstEid);
  encoded.set(keccak_256(hexToBytes(record.recipient.slice(2))), 96);
  return `0x${bytesToHex(keccak_256(encoded))}`;
}
