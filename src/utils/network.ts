import type { Network } from '../crypto/types';
import { NETWORK_MAP } from '../constants';
import { validateNetwork } from './validation';

/**
 * @deprecated Use `normalizeNetwork` from `validation.ts` instead
 */
export function normalizeNetwork(network: string | number): Network {
  validateNetwork(network);
  const key = String(network);
  return NETWORK_MAP[key as keyof typeof NETWORK_MAP] as Network;
}

export function isNetwork(value: unknown): value is Network {
  if (typeof value !== 'string') return false;
  const normalized = NETWORK_MAP[value as keyof typeof NETWORK_MAP];
  return !!normalized && (normalized === 'mainnet' || normalized === 'testnet' || normalized === 'signet' || normalized === 'regtest');
}

