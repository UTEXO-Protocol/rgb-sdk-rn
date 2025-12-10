import { ValidationError } from '../errors';
import type { Network } from '../crypto/types';
import { NETWORK_MAP } from '../constants';

const VALID_NETWORKS: Network[] = ['mainnet', 'testnet', 'signet', 'regtest'];

export function validateNetwork(network: string | number): asserts network is Network {
  const key = String(network);
  const normalized = NETWORK_MAP[key as keyof typeof NETWORK_MAP];
  
  if (!normalized || !VALID_NETWORKS.includes(normalized)) {
    throw new ValidationError(
      `Invalid network: ${network}. Must be one of: ${VALID_NETWORKS.join(', ')}`,
      'network'
    );
  }
}

export function normalizeNetwork(network: string | number): Network {
  validateNetwork(network);
  const key = String(network);
  return NETWORK_MAP[key as keyof typeof NETWORK_MAP] as Network;
}

export function validateMnemonic(mnemonic: unknown, field: string = 'mnemonic'): asserts mnemonic is string {
  if (!mnemonic || typeof mnemonic !== 'string' || mnemonic.trim().length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`, field);
  }
  
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) {
    throw new ValidationError(
      `${field} must be 12 or 24 words, got ${words.length} words`,
      field
    );
  }
}

export function validateBase64(base64: unknown, field: string = 'data'): asserts base64 is string {
  if (!base64 || typeof base64 !== 'string' || base64.trim().length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`, field);
  }
  
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  if (!base64Regex.test(base64.trim())) {
    throw new ValidationError(`Invalid base64 format for ${field}`, field);
  }
  
  try {
    Buffer.from(base64.trim(), 'base64');
  } catch (error) {
    throw new ValidationError(`Invalid base64 encoding for ${field}`, field);
  }
}

export function validatePsbt(psbt: unknown, field: string = 'psbt'): asserts psbt is string {
  validateBase64(psbt, field);
  
  const psbtString = String(psbt).trim();
  if (psbtString.length < 50) {
    throw new ValidationError(`${field} appears to be too short to be a valid PSBT`, field);
  }
}

export function validateHex(hex: unknown, field: string = 'data'): asserts hex is string {
  if (!hex || typeof hex !== 'string' || hex.trim().length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`, field);
  }
  
  const hexRegex = /^[0-9a-fA-F]+$/;
  if (!hexRegex.test(hex.trim())) {
    throw new ValidationError(`Invalid hex format for ${field}`, field);
  }
}

export function validateRequired<T>(
  value: T | null | undefined,
  field: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new ValidationError(`${field} is required`, field);
  }
}

export function validateString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`, field);
  }
}

