// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * RGB Key Generation and Derivation
 * 
 * This module provides RGB-specific cryptographic key operations including:
 * - RGB wallet key generation (vanilla and colored keychains)
 * - BIP86 Taproot key derivation for RGB protocol
 * - Account-level key derivation with RGB coin types
 * - Master fingerprint calculation for RGB wallets
 */

import type { BIP32Interface } from './types';
import type { Network } from './types';
import { ValidationError, CryptoError } from '../errors';
import { validateMnemonic, normalizeNetwork } from '../utils/validation';
import {
  DERIVATION_PURPOSE,
  DERIVATION_ACCOUNT,
  COIN_RGB_MAINNET,
  COIN_RGB_TESTNET,
} from '../constants';
import { calculateMasterFingerprint } from '../utils/fingerprint';
import { normalizeSeedBuffer, toNetworkName, getNetworkVersions } from '../utils/bip32-helpers';
import { bip39, bip32Factory } from './dependencies';

export type SeedInput = string | Uint8Array;

export function normalizeSeedInput(seed: SeedInput, field: string = 'seed'): Uint8Array {
  if (typeof seed === 'string') {
    const trimmed = seed.trim();
    if (!trimmed) {
      throw new ValidationError(`${field} must be a non-empty hex string`, field);
    }
    const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (hex.length % 2 !== 0) {
      throw new ValidationError(`${field} hex string must have even length`, field);
    }
    if (hex.length !== 128) {
      throw new ValidationError(`${field} must be 64 bytes (128 hex characters)`, field);
    }
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
      throw new ValidationError(`${field} must be a valid hex string`, field);
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      const byte = hex.slice(i * 2, i * 2 + 2);
      bytes[i] = parseInt(byte, 16);
    }
    return bytes;
  }

  if (seed instanceof Uint8Array) {
    if (seed.length === 0) {
      throw new ValidationError(`${field} must not be empty`, field);
    }
    return new Uint8Array(seed);
  }

  throw new ValidationError(`${field} must be a 64-byte hex string or Uint8Array`, field);
}

export interface GeneratedKeys {
  mnemonic: string;
  xpub: string;
  accountXpubVanilla: string;
  accountXpubColored: string;
  masterFingerprint: string;
  xpriv: string;
}

export interface AccountXpubs {
  account_xpub_vanilla: string;
  account_xpub_colored: string;
}

/**
 * Get coin type for derivation path
 */
function getCoinType(bitcoinNetwork: string | number, rgb: boolean): number {
  const net = toNetworkName(bitcoinNetwork);
  if (rgb) return net === 'mainnet' ? COIN_RGB_MAINNET : COIN_RGB_TESTNET;
  return net === 'mainnet' ? 0 : 1;
}


/**
 * Generate account derivation path: m / 86' / coinType' / 0'
 */
export function accountDerivationPath(bitcoinNetwork: string | number, rgb: boolean): string {
  const coinType = getCoinType(bitcoinNetwork, rgb);
  return `m/${DERIVATION_PURPOSE}'/${coinType}'/${DERIVATION_ACCOUNT}'`;
}

/**
 * Calculate master fingerprint from BIP32 node
 * Alias for shared fingerprint calculation utility
 */
async function masterFingerprintFromNode(node: BIP32Interface): Promise<string> {
  return calculateMasterFingerprint(node);
}

/**
 * Convert mnemonic to root BIP32 node
 */
async function mnemonicToRoot(mnemonic: string, bitcoinNetwork: string | number): Promise<BIP32Interface> {
  if (!bip39 || typeof bip39.mnemonicToSeedSync !== 'function') {
    throw new CryptoError('bip39 module not loaded correctly');
  }

  const seedBuffer = normalizeSeedBuffer(bip39.mnemonicToSeedSync(mnemonic));
  const versions = getNetworkVersions(bitcoinNetwork);
  const bip32 = bip32Factory();

  try {
    return bip32.fromSeed(seedBuffer, versions);
  } catch (error) {
    throw new CryptoError(
      `Failed to create BIP32 root node from seed: ${error instanceof Error ? error.message : String(error)}`,
      error as Error
    );
  }
}

/**
 * Get account extended public key from mnemonic
 */
async function getAccountXpub(mnemonic: string, bitcoinNetwork: string | number, rgb: boolean): Promise<string> {
  const root = await mnemonicToRoot(mnemonic, bitcoinNetwork);
  const path = accountDerivationPath(bitcoinNetwork, rgb);
  const acct = root.derivePath(path);
  return acct.neutered().toBase58();
}

/**
 * Get master extended public key from mnemonic
 */
// async function getMasterXpub(mnemonic: string, bitcoinNetwork: string | number): Promise<string> {
//   const root = await mnemonicToRoot(mnemonic, bitcoinNetwork);
//   return root.neutered().toBase58();
// }

/**
 * Get master extended private key (xpriv) from mnemonic
 */
async function getMasterXpriv(mnemonic: string, bitcoinNetwork: string | number): Promise<string> {
  const root = await mnemonicToRoot(mnemonic, bitcoinNetwork);
  return root.toBase58();
}

function deriveAccountXpubsFromRoot(root: BIP32Interface, network: Network) {
  const vanillaPath = accountDerivationPath(network, false);
  const coloredPath = accountDerivationPath(network, true);

  return {
    account_xpub_vanilla: root.derivePath(vanillaPath).neutered().toBase58(),
    account_xpub_colored: root.derivePath(coloredPath).neutered().toBase58(),
  };
}

async function buildGeneratedKeysFromRoot(
  root: BIP32Interface,
  network: Network,
  mnemonic: string
): Promise<GeneratedKeys> {
  const xpub = root.neutered().toBase58();
  const xpriv = root.toBase58();
  const master_fingerprint = await masterFingerprintFromNode(root);
  const { account_xpub_vanilla, account_xpub_colored } = deriveAccountXpubsFromRoot(root, network);

  return {
    mnemonic,
    xpub,
    accountXpubVanilla: account_xpub_vanilla,
    accountXpubColored: account_xpub_colored,
    masterFingerprint: master_fingerprint,
    xpriv,
  };
}

/**
 * Get extended public key (xpub) from extended private key (xpriv)
 * Internal helper function
 */
async function getXpubFromXprivInternal(xpriv: string, bitcoinNetwork?: string | number): Promise<string> {
  try {
    // BIP32Factory is a factory function that returns BIP32 interface
    // Use it to create a BIP32 instance from the xpriv
    const bip32 = bip32Factory();
    
    // fromBase58 requires network versions for validation
    // If network is not provided, try to infer from xpriv prefix (xprv/tprv for mainnet/testnet)
    let node;
    if (bitcoinNetwork) {
      const versions = getNetworkVersions(bitcoinNetwork);
      node = bip32.fromBase58(xpriv, versions);
    } else {
      // Try to infer network from xpriv prefix
      // xprv = mainnet, tprv = testnet/regtest
      const inferredNetwork = xpriv.startsWith('xprv') ? 'mainnet' : 'testnet';
      const versions = getNetworkVersions(inferredNetwork);
      node = bip32.fromBase58(xpriv, versions);
    }
    
    return node.neutered().toBase58();
  } catch (error) {
    throw new CryptoError('Failed to derive xpub from xpriv', error as Error);
  }
}

/**
 * Build complete keys output object from mnemonic
 */
async function buildKeysOutput(mnemonic: string, bitcoinNetwork: string | number): Promise<GeneratedKeys> {
  const normalizedNetwork = normalizeNetwork(bitcoinNetwork);
  const root = await mnemonicToRoot(mnemonic, normalizedNetwork);
  return buildGeneratedKeysFromRoot(root, normalizedNetwork, mnemonic);
}

async function buildKeysOutputFromSeed(seed: Uint8Array | Buffer, bitcoinNetwork: string | number): Promise<GeneratedKeys> {
  const normalizedNetwork = normalizeNetwork(bitcoinNetwork);
  const seedBuffer = normalizeSeedBuffer(seed);
  const versions = getNetworkVersions(bitcoinNetwork);
  const bip32 = bip32Factory();

  let root: BIP32Interface;
  try {
    root = bip32.fromSeed(seedBuffer, versions);
  } catch (error) {
    throw new CryptoError('Failed to create BIP32 root node from seed', error as Error);
  }

  return buildGeneratedKeysFromRoot(root, normalizedNetwork, '');
}

/**
 * Build complete keys output object from xpriv
 */
async function buildKeysOutputFromXpriv(xpriv: string): Promise<GeneratedKeys> {
  try {
    // Detect network from xpriv prefix first
    // tprv/tpub = testnet, xprv/xpub = mainnet
    const isTestnet = xpriv.startsWith('tprv') || xpriv.startsWith('tpub');
    const detectedNetwork = isTestnet ? 'testnet' : 'mainnet';
    const normalizedNetwork = normalizeNetwork(detectedNetwork);
    
    // Get the correct network versions for parsing
    const versions = getNetworkVersions(detectedNetwork);
    
    // BIP32Factory is a factory function that returns BIP32 interface
    const bip32 = bip32Factory();
    
    // Parse with the correct versions to match the xpriv's encoded version bytes
    const root = bip32.fromBase58(xpriv, versions);
    
    return buildGeneratedKeysFromRoot(root, normalizedNetwork, '');
  } catch (error) {
    // Preserve the original error message for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new CryptoError(`Failed to derive keys from xpriv: ${errorMessage}`, error as Error);
  }
}

/**
 * Generate new wallet keys with a random mnemonic
 * Mirrors rgb_lib::generate_keys (creates new 12-word mnemonic)
 * 
 * @param bitcoinNetwork - Network string or number (default: 'regtest')
 * @returns Promise resolving to generated keys including mnemonic, xpubs, and master fingerprint
 * @throws {CryptoError} If key generation fails
 * 
 * @example
 * ```typescript
 * const keys = await generateKeys('testnet');
 * console.log('Mnemonic:', keys.mnemonic);
 * console.log('Master Fingerprint:', keys.master_fingerprint);
 * ```
 */
export async function generateKeys(bitcoinNetwork: string | number = 'regtest'): Promise<GeneratedKeys> {
  try {
    // bip39 is already imported
    if (!bip39 || typeof (bip39 as any).generateMnemonic !== 'function') {
      throw new Error('bip39 not loaded. Dependencies may not have initialized correctly.');
    }
    const mnemonic = (bip39 as any).generateMnemonic(128);
    return await buildKeysOutput(mnemonic, bitcoinNetwork);
  } catch (error) {
    if (error instanceof Error && error.message.includes('bip39 not loaded')) {
      throw new CryptoError('Failed to load dependencies', error);
    }
    // Log the actual error for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new CryptoError(`Failed to generate mnemonic: ${errorMessage}`, error as Error);
  }
}

/**
 * Derive wallet keys from existing mnemonic
 * Takes a mnemonic phrase and derives all keys (xpubs, master fingerprint)
 * 
 * This function is the counterpart to `generateKeys()` - instead of generating
 * a new mnemonic, it derives keys from an existing one.
 * 
 * @param bitcoinNetwork - Network string or number (default: 'regtest')
 * @param mnemonic - BIP39 mnemonic phrase
 * @returns Promise resolving to derived keys including mnemonic, xpubs, and master fingerprint
 * @throws {ValidationError} If mnemonic is invalid
 * @throws {CryptoError} If key derivation fails
 * 
 * @example
 * ```typescript
 * const keys = await deriveKeysFromMnemonic('testnet', 'abandon abandon abandon...');
 * console.log('Account XPub:', keys.account_xpub_vanilla);
 * ```
 */
export async function deriveKeysFromMnemonic(
  bitcoinNetwork: string | number = 'regtest',
  mnemonic: string
): Promise<GeneratedKeys> {
  validateMnemonic(mnemonic, 'mnemonic');
  
  const normalizedNetwork = normalizeNetwork(bitcoinNetwork);
  
  try {
    // bip39 is already imported
    const trimmedMnemonic = mnemonic.trim();
    if (!bip39 || !bip39.validateMnemonic(trimmedMnemonic)) {
      throw new ValidationError('Invalid mnemonic format - failed BIP39 validation', 'mnemonic');
    }
    
    return await buildKeysOutput(trimmedMnemonic, normalizedNetwork);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new CryptoError('Failed to derive keys from mnemonic', error as Error);
  }
}

/**
 * Derive wallet keys directly from a BIP39 seed (hex string or Uint8Array)
 */
export async function deriveKeysFromSeed(
  bitcoinNetwork: string | number = 'regtest',
  seed: string | Uint8Array
): Promise<GeneratedKeys> {
  const normalizedNetwork = normalizeNetwork(bitcoinNetwork);

  try {
    const normalizedSeed = normalizeSeedInput(seed, 'seed');
    return await buildKeysOutputFromSeed(normalizedSeed, normalizedNetwork);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new CryptoError('Failed to derive keys from seed', error as Error);
  }
}

/**
 * Restore wallet keys from existing mnemonic (backward compatibility alias)
 * @deprecated Use `deriveKeysFromMnemonic()` instead. This alias will be removed in a future version.
 * @see deriveKeysFromMnemonic
 */
export async function restoreKeys(
  bitcoinNetwork: string | number = 'regtest',
  mnemonic: string
): Promise<GeneratedKeys> {
  return deriveKeysFromMnemonic(bitcoinNetwork, mnemonic);
}

/**
 * Get account xpubs from mnemonic (convenience function)
 * 
 * @param bitcoinNetwork - Network string or number (default: 'regtest')
 * @param mnemonic - BIP39 mnemonic phrase
 * @returns Promise resolving to account xpubs for vanilla and colored keychains
 * @throws {ValidationError} If mnemonic is invalid
 * @throws {CryptoError} If key derivation fails
 * 
 * @example
 * ```typescript
 * const xpubs = await accountXpubsFromMnemonic('testnet', 'abandon abandon abandon...');
 * console.log('Vanilla XPub:', xpubs.account_xpub_vanilla);
 * console.log('Colored XPub:', xpubs.account_xpub_colored);
 * ```
 */
/**
 * Get master extended private key (xpriv) from mnemonic
 * 
 * @param bitcoinNetwork - Network string or number (default: 'regtest')
 * @param mnemonic - BIP39 mnemonic phrase (12 or 24 words)
 * @returns Promise resolving to master xpriv (extended private key)
 * @throws {ValidationError} If mnemonic is invalid
 * @throws {CryptoError} If key derivation fails
 * 
 * @example
 * ```typescript
 * const xpriv = await getXprivFromMnemonic('testnet', 'your mnemonic phrase here');
 * console.log('Master xpriv:', xpriv);
 * ```
 */
export async function getXprivFromMnemonic(
  bitcoinNetwork: string | number = 'regtest',
  mnemonic: string
): Promise<string> {
  validateMnemonic(mnemonic, 'mnemonic');
  const normalizedNetwork = normalizeNetwork(bitcoinNetwork);
  
  try {
    return await getMasterXpriv(mnemonic, normalizedNetwork);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new CryptoError('Failed to derive xpriv from mnemonic', error as Error);
  }
}

/**
 * Get extended public key (xpub) from extended private key (xpriv)
 * 
 * @param xpriv - Extended private key (base58 encoded)
 * @returns Promise resolving to xpub (extended public key)
 * @throws {CryptoError} If xpriv is invalid or derivation fails
 * 
 * @example
 * ```typescript
 * const xpub = await getXpubFromXpriv('xprv...');
 * console.log('xpub:', xpub);
 * ```
 */
export async function getXpubFromXpriv(xpriv: string, bitcoinNetwork?: string | number): Promise<string> {
  if (!xpriv || typeof xpriv !== 'string') {
    throw new ValidationError('xpriv must be a non-empty string', 'xpriv');
  }
  
  try {
    return await getXpubFromXprivInternal(xpriv, bitcoinNetwork);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new CryptoError('Failed to derive xpub from xpriv', error as Error);
  }
}

/**
 * Derive wallet keys from extended private key (xpriv)
 * Similar to deriveKeysFromMnemonic but starts from xpriv instead of mnemonic
 * 
 * @param bitcoinNetwork - Network string or number (default: 'regtest')
 * @param xpriv - Extended private key (base58 encoded)
 * @returns Promise resolving to generated keys (without mnemonic)
 * @throws {ValidationError} If xpriv is invalid
 * @throws {CryptoError} If key derivation fails
 * 
 * @example
 * ```typescript
 * const keys = await deriveKeysFromXpriv('testnet', 'xprv...');
 * console.log('Master Fingerprint:', keys.master_fingerprint);
 * console.log('Account xpub vanilla:', keys.account_xpub_vanilla);
 * ```
 */
export async function deriveKeysFromXpriv(
  xpriv: string
): Promise<GeneratedKeys> {
  if (!xpriv || typeof xpriv !== 'string') {
    throw new ValidationError('xpriv must be a non-empty string', 'xpriv');
  }
  
  try {
    return await buildKeysOutputFromXpriv(xpriv);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new CryptoError('Failed to derive keys from xpriv', error as Error);
  }
}

export async function accountXpubsFromMnemonic(
  bitcoinNetwork: string | number = 'regtest',
  mnemonic: string
): Promise<AccountXpubs> {
  validateMnemonic(mnemonic, 'mnemonic');
  
  try {
    // bip39 is already imported
    if (!bip39 || !bip39.validateMnemonic(mnemonic)) {
      throw new ValidationError('Invalid mnemonic format - failed BIP39 validation', 'mnemonic');
    }
    return {
      account_xpub_vanilla: await getAccountXpub(mnemonic, bitcoinNetwork, false),
      account_xpub_colored: await getAccountXpub(mnemonic, bitcoinNetwork, true)
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new CryptoError('Failed to derive account xpubs from mnemonic', error as Error);
  }
}
