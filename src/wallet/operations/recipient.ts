import { base58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { RgbBurnRecipient } from '@utexo/webrgb';

const tronBase58 = base58check(sha256);
const tronChains = new Set([
  'tron:728126428',
  'tron:2494104990',
  'tron:3448148188',
]);

export function encodeEvmBurnRecipient(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/i.test(address))
    throw new Error('A nonzero 20-byte EVM recipient address is required');
  return address.slice(2).toLowerCase().padStart(64, '0');
}

/** Strip the Tron version byte and checksum; BFA commits to a 32-byte account. */
export function encodeTronBurnRecipient(address: string): string {
  if (
    typeof address !== 'string' ||
    !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)
  )
    throw new Error('A Tron Base58Check recipient address is required');
  const payload = tronBase58.decode(address);
  if (
    payload.length !== 21 ||
    payload[0] !== 0x41 ||
    payload.subarray(1).every((byte) => byte === 0)
  )
    throw new Error('A nonzero Tron recipient address is required');
  return bytesToHex(payload.subarray(1)).padStart(64, '0');
}

export function normalizeBurnRecipient(
  recipient: RgbBurnRecipient
): RgbBurnRecipient {
  if (
    typeof recipient?.chainId !== 'string' ||
    typeof recipient.address !== 'string'
  )
    throw new Error('Invalid payout chain or address');
  if (/^eip155:[1-9][0-9]*$/.test(recipient.chainId)) {
    encodeEvmBurnRecipient(recipient.address);
    return {
      chainId: recipient.chainId,
      address: recipient.address.toLowerCase(),
    };
  }
  if (tronChains.has(recipient.chainId)) {
    encodeTronBurnRecipient(recipient.address);
    return { ...recipient };
  }
  throw new Error('Unsupported payout chain');
}

export function encodeBurnRecipient(recipient: RgbBurnRecipient): string {
  const normalized = normalizeBurnRecipient(recipient);
  return normalized.chainId.startsWith('tron:')
    ? encodeTronBurnRecipient(normalized.address)
    : encodeEvmBurnRecipient(normalized.address);
}
