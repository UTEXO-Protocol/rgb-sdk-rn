import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { encodeTronBurnRecipient, normalizeBurnRecipient } from './recipient';

export interface BurnDestination {
  version: 1;
  destinationChainId: number;
  dstEid: number;
  recipient: string;
}

/** Verified dev routes. Endpoint IDs are not inferred from EVM chain IDs. */
export const LOCAL_BFA_BURN_ROUTES = [
  { chainId: 'eip155:42161', dstEid: 0 },
  { chainId: 'eip155:1', dstEid: 30101 },
  { chainId: 'eip155:137', dstEid: 30109 },
  { chainId: 'eip155:9745', dstEid: 30383 },
  { chainId: 'tron:728126428', dstEid: 30420 },
] as const;

/** hashStruct shared with bridge/enclave UtexoBurnDestinationV1 vectors. */
export function burnDestinationHash(value: BurnDestination): string {
  if (
    value?.version !== 1 ||
    !Number.isSafeInteger(value.destinationChainId) ||
    value.destinationChainId <= 0 ||
    !Number.isInteger(value.dstEid) ||
    value.dstEid < 0 ||
    value.dstEid > 0xffffffff ||
    !/^0x(?:[0-9a-fA-F]{2}){1,32}$/.test(value.recipient) ||
    (value.dstEid === 0 && value.recipient.length !== 42)
  )
    throw new Error('Invalid V1 burn destination');
  const encoded = new Uint8Array(128);
  const type =
    'UtexoBurnDestinationV1(uint64 destinationChainId,uint32 dstEid,bytes recipient)';
  encoded.set(keccak_256(Uint8Array.from(type, (char) => char.charCodeAt(0))));
  const view = new DataView(encoded.buffer);
  view.setBigUint64(56, BigInt(value.destinationChainId));
  view.setUint32(92, value.dstEid);
  encoded.set(keccak_256(hexToBytes(value.recipient.slice(2))), 96);
  return bytesToHex(keccak_256(encoded));
}

/** Routes verified for the isolated dev build; never guess an endpoint ID. */
export function localBfaBurnDestination(payout: {
  chainId: string;
  address: string;
}): BurnDestination {
  const normalized = normalizeBurnRecipient(payout);
  const route = LOCAL_BFA_BURN_ROUTES.find(
    (item) => item.chainId === normalized.chainId
  );
  if (!route)
    throw new Error(
      'This BFA build supports payouts to Arbitrum One, Ethereum, Polygon, Plasma and Tron mainnet.'
    );
  return {
    version: 1,
    destinationChainId: Number(route.chainId.split(':')[1]),
    dstEid: route.dstEid,
    // V1 commits to the full native Tron payload, including its 0x41 prefix.
    recipient: normalized.chainId.startsWith('tron:')
      ? '0x41' + encodeTronBurnRecipient(normalized.address).slice(-40)
      : normalized.address,
  };
}
