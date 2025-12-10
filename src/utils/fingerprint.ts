import { ripemd160Sync, sha256Sync } from './crypto-browser';
import type { BIP32Interface } from '../crypto/types';
import { CryptoError } from '../errors';

/**
 * Calculate master fingerprint from BIP32 node
 * fingerprint = first 4 bytes of HASH160(pubkey)
 */
export async function calculateMasterFingerprint(node: BIP32Interface): Promise<string> {
  const pubkey = node.publicKey;
  if (!pubkey) {
    throw new CryptoError('Public key is undefined');
  }
  
  const pubkeyData = pubkey instanceof Uint8Array ? pubkey : new Uint8Array(pubkey);
  const sha = await sha256Sync(pubkeyData);
  const ripemd160Fn = ripemd160Sync as (data: Uint8Array | Buffer) => Promise<Uint8Array>;
  const ripe = await ripemd160Fn(sha as Uint8Array);
  
  // Convert to Array first to avoid Buffer/Uint8Array serialization differences between Node.js and browser
  const fingerprintBytes = Array.from(ripe.subarray(0, 4));
  
  return fingerprintBytes
    .map(b => {
      const hex = b.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    })
    .join('');
}

