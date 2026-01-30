import * as bip39Scure from '@scure/bip39';
// @ts-ignore - wordlist import path issue with TypeScript module resolution
import { wordlist } from '@scure/bip39/wordlists/english.js';
import * as secp256k1 from '@noble/secp256k1';
import { HDKey } from '@scure/bip32';
import type { NetworkVersions, BIP32Interface, BIP32Factory } from './types';

export const bip39 = {
  mnemonicToSeedSync: (mnemonic: string): Buffer => {
    const seed = bip39Scure.mnemonicToSeedSync(mnemonic);
    return Buffer.from(seed);
  },
  validateMnemonic: (mnemonic: string): boolean => {
    return bip39Scure.validateMnemonic(mnemonic, wordlist);
  },
  generateMnemonic: (strength: number = 128): string => {
    return bip39Scure.generateMnemonic(wordlist, strength);
  },
};

export function xOnlyPointFromPoint(point: Uint8Array | Buffer): Uint8Array {
  const pointArray = point instanceof Buffer ? new Uint8Array(point) : point;
  if (pointArray.length === 33) {
    return pointArray.slice(1, 33);
  } else if (pointArray.length === 65) {
    return pointArray.slice(1, 33);
  } else if (pointArray.length === 32) {
    return pointArray;
  }
  throw new Error(`Invalid public key length: ${pointArray.length}`);
}

export function signSchnorr(message: Uint8Array | Buffer, privateKey: Uint8Array | Buffer, auxRand?: Uint8Array | Buffer): Uint8Array {
  const msg = message instanceof Buffer ? new Uint8Array(message) : message;
  const priv = privateKey instanceof Buffer ? new Uint8Array(privateKey) : privateKey;
  const aux = auxRand ? (auxRand instanceof Buffer ? new Uint8Array(auxRand) : auxRand) : undefined;
  return secp256k1.schnorr.sign(msg, priv, aux);
}

export function verifySchnorr(message: Uint8Array | Buffer, publicKey: Uint8Array | Buffer, signature: Uint8Array | Buffer): boolean {
  const msg = message instanceof Buffer ? new Uint8Array(message) : message;
  const pub = publicKey instanceof Buffer ? new Uint8Array(publicKey) : publicKey;
  const sig = signature instanceof Buffer ? new Uint8Array(signature) : signature;
  return secp256k1.schnorr.verify(sig, msg, pub);
}

function createBIP32Node(hdkey: HDKey): BIP32Interface {
  if (!hdkey.publicKey) {
    throw new Error('HDKey publicKey is null');
  }
  const pubKey = hdkey.publicKey instanceof Uint8Array ? hdkey.publicKey : new Uint8Array(hdkey.publicKey);
  
  return {
    derivePath: (path: string) => {
      const derived = hdkey.derive(path);
      return createBIP32Node(derived);
    },
    publicKey: Buffer.from(pubKey),
    privateKey: hdkey.privateKey ? Buffer.from(hdkey.privateKey) : undefined,
    neutered: () => {
      const publicKey = hdkey.publicExtendedKey;
      if (!publicKey) {
        throw new Error('Cannot create neutered key: no public extended key available');
      }
      const neuteredKey = hdkey.versions
        ? HDKey.fromExtendedKey(publicKey, hdkey.versions)
        : HDKey.fromExtendedKey(publicKey);
      return createBIP32Node(neuteredKey);
    },
    toBase58: () => {
      try {
        return hdkey.privateExtendedKey || hdkey.publicExtendedKey || '';
      } catch {
        return hdkey.publicExtendedKey || '';
      }
    },
  };
}

export const bip32Factory: BIP32Factory = () => {
  return {
    fromSeed: (seed: Buffer | Uint8Array, versions?: NetworkVersions) => {
      const seedArray = seed instanceof Buffer ? new Uint8Array(seed) : seed;
      const hdkey = versions?.bip32
        ? HDKey.fromMasterSeed(seedArray, {
            private: versions.bip32.private,
            public: versions.bip32.public,
          })
        : HDKey.fromMasterSeed(seedArray);
      return createBIP32Node(hdkey);
    },
    fromBase58: (base58Key: string, versions?: NetworkVersions) => {
      const hdkey = versions?.bip32
        ? HDKey.fromExtendedKey(base58Key, {
            private: versions.bip32.private,
            public: versions.bip32.public,
          })
        : HDKey.fromExtendedKey(base58Key);
      return createBIP32Node(hdkey);
    },
  };
};
