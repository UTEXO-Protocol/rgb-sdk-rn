import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';
import { ripemd160 as nobleRipemd160 } from '@noble/hashes/legacy.js';

export async function sha256(data: Uint8Array | Buffer): Promise<Uint8Array> {
  if (!data) {
    throw new Error('sha256: data is undefined or null');
  }
  const dataArray = data instanceof Buffer ? new Uint8Array(data) : data;
  return new Uint8Array(nobleSha256(dataArray));
}

export async function ripemd160(data: Uint8Array | Buffer): Promise<Uint8Array> {
  if (!data) {
    throw new Error('ripemd160: data is undefined or null');
  }
  const dataArray = data instanceof Buffer ? new Uint8Array(data) : data;
  return new Uint8Array(nobleRipemd160(dataArray));
}

export async function sha256Sync(data: Uint8Array | Buffer): Promise<Uint8Array> {
  return sha256(data);
}

export const ripemd160Sync: (data: Uint8Array | Buffer) => Promise<Uint8Array> = async (data: Uint8Array | Buffer): Promise<Uint8Array> => {
  return ripemd160(data);
};
