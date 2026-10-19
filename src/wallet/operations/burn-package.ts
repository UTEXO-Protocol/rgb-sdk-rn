import { base64 } from '@scure/base';
import { burnDestinationHash, type BurnDestination } from './burn-destination';

/** Same envelope as receive_wallet_v1 pack-burn. Never invokes a wallet or burns. */
export function createBurnPackage(
  data: string,
  destination: BurnDestination
): string {
  const limit = 10 * 1024 * 1024;
  if (!data || data.length > 4 * Math.ceil(limit / 3))
    throw new Error('The RGB proof must be nonempty and 10 MiB or smaller.');
  const bytes = base64.decode(data);
  const header = [0x52, 0x47, 0x42, 0, 0x54, 0x46, 0x52];
  if (
    bytes.length <= header.length ||
    bytes.length > limit ||
    base64.encode(bytes) !== data ||
    !header.every((byte, index) => bytes[index] === byte)
  )
    throw new Error('Invalid RGB transfer proof for burn export.');
  burnDestinationHash(destination);
  return JSON.stringify({
    format: 'utexo-burn',
    version: 1,
    consignment: { encoding: 'base64', byteLength: bytes.length, data },
    burnDestination: {
      version: 1,
      destinationChainId: destination.destinationChainId,
      dstEid: destination.dstEid,
      recipient: destination.recipient.toLowerCase(),
    },
  });
}
