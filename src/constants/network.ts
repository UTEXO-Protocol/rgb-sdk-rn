/**
 * Network-related constants
 */

import type { Network } from '../crypto/types';

/**
 * Coin type constants
 */
export const COIN_RGB_MAINNET = 827166;
export const COIN_RGB_TESTNET = 827167;
export const COIN_BITCOIN_MAINNET = 0;
export const COIN_BITCOIN_TESTNET = 1;

/**
 * Network string/number to Network type mapping
 */
export const NETWORK_MAP = {
  '0': 'mainnet' as const,
  '1': 'testnet' as const,
  '2': 'testnet' as const, // Alternative testnet number (also maps to testnet)
  '3': 'regtest' as const,
  'signet': 'signet' as const,
  'mainnet': 'mainnet' as const,
  'testnet': 'testnet' as const,
  'regtest': 'regtest' as const,
} as const;

/**
 * BIP32 network version constants
 */
export const BIP32_VERSIONS = {
  mainnet: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  testnet: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  signet: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  regtest: {
    public: 0x043587cf,
    private: 0x04358394,
  },
} as const satisfies Record<Network, { public: number; private: number }>;

