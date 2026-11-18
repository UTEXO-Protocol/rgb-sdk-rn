import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { EstimateFeeResult } from '@utexo/rgb-sdk-core';
import { decodeNativeBase64 } from './base64';
import { WalletBackendError } from '../wallet-errors';

/**
 * Reads what a wallet shows before approval from a PSBT (BIP-174 version 0):
 * the txid, the exact fee and the size once signed. It signs nothing and
 * needs no wallet. The same reading as `@utexo/rgb-sdk-web`, plus the
 * SegWit v0 inputs a wallet opened with `witnessVersion: 'segwit-v0'` builds.
 */
export interface PsbtSummary extends EstimateFeeResult {
  txid: string;
}

const MAGIC = [0x70, 0x73, 0x62, 0x74, 0xff];
/** Witness of a Taproot key spend: item count, length, 64-byte signature. */
const TAPROOT_WITNESS_WEIGHT = 66;
/**
 * Witness of a P2WPKH spend with the longest signature (72 bytes): item count,
 * two lengths and a 33-byte key. The size of such an input is an upper bound.
 */
const P2WPKH_WITNESS_WEIGHT = 108;
/** The segwit marker and flag, which count once per transaction. */
const SEGWIT_HEADER_WEIGHT = 2;

function invalid(detail: string): never {
  throw new WalletBackendError(
    'INVALID_PARAMS',
    `Invalid PSBT: ${detail}`,
    undefined,
    'RGB_L1'
  );
}

class Reader {
  offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get done(): boolean {
    return this.offset === this.bytes.length;
  }

  take(length: number): Uint8Array {
    const end = this.offset + length;
    if (end > this.bytes.length) invalid('it ends too early');
    const taken = this.bytes.subarray(this.offset, end);
    this.offset = end;
    return taken;
  }

  /** Bitcoin's CompactSize; sizes of 2^32 and above never fit a PSBT here. */
  size(): number {
    const first = this.take(1)[0]!;
    if (first < 0xfd) return first;
    if (first === 0xff) invalid('a size is too large');
    const wide = this.take(first === 0xfd ? 2 : 4);
    return wide.reduceRight((sum, byte) => sum * 256 + byte, 0);
  }

  /** A little-endian u64. */
  amount(): bigint {
    let value = 0n;
    const bytes = this.take(8);
    for (let i = 7; i >= 0; i--) value = value * 256n + BigInt(bytes[i]!);
    return value;
  }
}

/** One key-value map: the first byte of each key is its type. */
function readMap(reader: Reader): Map<number, Uint8Array> {
  const map = new Map<number, Uint8Array>();
  for (;;) {
    const keyLength = reader.size();
    if (keyLength === 0) return map;
    const key = reader.take(keyLength);
    const value = reader.take(reader.size());
    // Only keys without key data are read; repeats of those are malformed.
    if (keyLength === 1) {
      if (map.has(key[0]!)) invalid('a key is repeated');
      map.set(key[0]!, value);
    }
  }
}

function decode(psbt: unknown): Uint8Array {
  if (typeof psbt !== 'string' || psbt.length === 0)
    invalid('it must be a base64 string');
  let bytes: Uint8Array;
  try {
    bytes = decodeNativeBase64(psbt, 'PSBT');
  } catch {
    invalid('it must be a base64 string');
  }
  if (!MAGIC.every((byte, i) => bytes[i] === byte))
    invalid('the header is wrong');
  return bytes;
}

/** The input and output counts and the output total of the unsigned TX. */
function readUnsignedTx(tx: Uint8Array) {
  const reader = new Reader(tx);
  reader.take(4);
  const inputs = reader.size();
  if (inputs === 0) invalid('the transaction has no inputs');
  for (let i = 0; i < inputs; i++) {
    reader.take(36);
    if (reader.size() !== 0) invalid('an input is already signed');
    reader.take(4);
  }
  const outputs = reader.size();
  let outputTotal = 0n;
  for (let i = 0; i < outputs; i++) {
    outputTotal += reader.amount();
    reader.take(reader.size());
  }
  reader.take(4);
  if (!reader.done) invalid('the transaction has trailing data');
  return { inputs, outputs, outputTotal };
}

/** The amount and signed witness weight of an input, from its `witness_utxo`. */
function readInput(input: Map<number, Uint8Array>) {
  const utxo = input.get(0x01);
  if (!utxo) invalid('an input has no witness UTXO');
  const reader = new Reader(utxo);
  const amount = reader.amount();
  const script = reader.take(reader.size());
  if (!reader.done) invalid('a witness UTXO has trailing data');
  if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20)
    return { amount, witnessWeight: TAPROOT_WITNESS_WEIGHT };
  if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14)
    return { amount, witnessWeight: P2WPKH_WITNESS_WEIGHT };
  return invalid('an input does not pay to Taproot or P2WPKH');
}

function unsignedTx(reader: Reader): Uint8Array {
  reader.take(MAGIC.length);
  const tx = readMap(reader).get(0x00);
  if (!tx) invalid('it has no unsigned transaction');
  return tx;
}

function txidOf(tx: Uint8Array): string {
  return bytesToHex(sha256(sha256(tx)).reverse());
}

/** The txid of a PSBT, signed or not, whatever its inputs pay to. */
export function psbtTxid(psbt: unknown): string {
  const tx = unsignedTx(new Reader(decode(psbt)));
  readUnsignedTx(tx);
  return txidOf(tx);
}

/** The txid, fee (sat), size (vB) and fee rate (sat/vB) of a PSBT. */
export function summarizePsbt(psbt: unknown): PsbtSummary {
  const reader = new Reader(decode(psbt));
  const tx = unsignedTx(reader);
  const { inputs, outputs, outputTotal } = readUnsignedTx(tx);

  let inputTotal = 0n;
  let witnessWeight = 0;
  for (let i = 0; i < inputs; i++) {
    const input = readInput(readMap(reader));
    inputTotal += input.amount;
    witnessWeight += input.witnessWeight;
  }
  for (let i = 0; i < outputs; i++) readMap(reader);
  if (!reader.done) invalid('it has trailing data');

  if (inputTotal < outputTotal) invalid('the outputs exceed the inputs');
  const fee = Number(inputTotal - outputTotal);
  if (!Number.isSafeInteger(fee)) invalid('the fee is out of range');

  const weight = tx.length * 4 + SEGWIT_HEADER_WEIGHT + witnessWeight;
  const vbytes = Math.ceil(weight / 4);
  return { txid: txidOf(tx), fee, vbytes, feeRate: fee / vbytes };
}
