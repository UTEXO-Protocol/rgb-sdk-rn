/**
 * RGB Crypto module types
 * 
 * Type definitions for RGB-specific cryptographic operations including
 * PSBT signing and key derivation for RGB protocol
 */

/**
 * Bitcoin network type
 */
export type Network = 'mainnet' | 'testnet' |'testnet4' | 'signet' | 'regtest';

/**
 * PSBT type (create_utxo or send)
 */
export type PsbtType = 'create_utxo' | 'send';

/**
 * Network versions for BIP32
 */
export interface NetworkVersions {
  bip32: {
    public: number;
    private: number;
  };
  wif: number;
}

/**
 * Descriptors for wallet derivation
 */
export interface Descriptors {
  external: string;
  internal: string;
}

/**
 * Buffer-like object that can be converted to Buffer or Uint8Array
 */
export type BufferLike = Buffer | Uint8Array | ArrayBuffer | {
  buffer?: ArrayBuffer;
  byteOffset?: number;
  byteLength?: number;
  length?: number;
} | number[];

export type BIP32Interface = {
  derivePath(path: string): BIP32Interface;
  publicKey: Buffer;
  privateKey?: Buffer;
  neutered: () => BIP32Interface;
  toBase58: () => string;
};

/**
 * BIP32 Factory function type
 */
export type BIP32Factory = () => {
  fromSeed: (seed: Buffer | Uint8Array, versions?: NetworkVersions) => BIP32Interface;
  fromBase58: (base58: string, versions?: NetworkVersions) => BIP32Interface;
};

