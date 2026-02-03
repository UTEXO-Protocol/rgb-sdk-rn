// React Native only - no environment checks needed
import { CryptoError } from '../errors';
import type { Network, NetworkVersions, BufferLike } from '../crypto/types';
import { BIP32_VERSIONS } from '../constants/network';

function getWifVersion(network: Network): number {
  return network === 'mainnet' ? 0x80 : 0xef;
}

function getNetworkVersionsFromConstants(network: Network): NetworkVersions {
  const bip32Versions = BIP32_VERSIONS[network];
  return {
    bip32: bip32Versions,
    wif: getWifVersion(network),
  };
}

/**
 * Normalize seed to Buffer/Uint8Array for BIP32 operations
 * Handles Buffer, Uint8Array, ArrayBuffer, and buffer-like objects
 */
export function normalizeSeedBuffer(seed: BufferLike): Buffer | Uint8Array {
  if (!seed) {
    throw new CryptoError('Failed to generate seed - seed is undefined');
  }

  let seedBuffer: Buffer | Uint8Array;

  if (seed instanceof Uint8Array) {
    seedBuffer = seed;
  } else if (seed instanceof ArrayBuffer) {
    seedBuffer = new Uint8Array(seed);
  } else if (seed && typeof seed === 'object') {
    if ('buffer' in seed && seed.buffer) {
      const bufferValue = seed.buffer;

      if (bufferValue instanceof ArrayBuffer) {
        // React Native: always use Uint8Array (Buffer is polyfill)
        const byteOffset = seed.byteOffset || 0;
        const byteLength =
          seed.byteLength ||
          (seed as { length?: number }).length ||
          bufferValue.byteLength;
        seedBuffer = new Uint8Array(bufferValue, byteOffset, byteLength);
      } else {
        try {
          seedBuffer = new Uint8Array(seed as ArrayLike<number>);
        } catch (error) {
          throw new CryptoError(
            `Failed to convert seed to Uint8Array (buffer property invalid): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    } else {
      try {
        seedBuffer = new Uint8Array(seed as ArrayLike<number>);
      } catch (error) {
        throw new CryptoError(
          `Failed to convert seed to Uint8Array: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  } else {
    throw new CryptoError(`Invalid seed type: ${typeof seed}`);
  }

  return seedBuffer;
}

export function toNetworkName(bitcoinNetwork: string | number): Network {
  const n = String(bitcoinNetwork).toLowerCase();
  if (n.includes('main')) return 'mainnet';
  if (n.includes('reg')) return 'regtest';
  if (n.includes('sig')) return 'signet';
  return 'testnet';
}

export function getNetworkVersions(
  bitcoinNetwork: string | number
): NetworkVersions {
  const net = toNetworkName(bitcoinNetwork);
  return getNetworkVersionsFromConstants(net);
}
