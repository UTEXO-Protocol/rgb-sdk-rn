// RGB PSBT Signer Library using bdk-rn
// Signs both create_utxo_begin and send_begin PSBTs from rgb-lib

import {
  Network as BDKNetwork,
  Mnemonic,
  DescriptorSecretKey,
  Descriptor,
  Wallet,
  Persister,
  KeychainKind,
  Psbt,
  DerivationPath,
} from 'bdk-rn';
import { ValidationError, CryptoError } from '../errors';
import { validateMnemonic, validatePsbt, normalizeNetwork } from '../utils/validation';
import { COIN_RGB_TESTNET, COIN_RGB_MAINNET } from '../constants';
import type { Network } from './types';
import { normalizeSeedInput, accountDerivationPath } from './keys';
import { sha256 } from '../utils/crypto-browser';
import { signSchnorr, verifySchnorr, xOnlyPointFromPoint, bip32Factory } from './dependencies';
import { getNetworkVersions } from '../utils/bip32-helpers';
import { logger } from '../utils/logger';

export type { Network } from './types';

export interface SignPsbtOptions {
  // Reserved for future options
}

/**
 * Convert Network string to BDK Network enum
 */
function toBDKNetwork(network: Network): BDKNetwork {
  const NetworkEnum = BDKNetwork as any;
  switch (network) {
    case 'mainnet':
      return NetworkEnum.Mainnet;
    case 'testnet':
      return NetworkEnum.Testnet;
    case 'signet':
      return NetworkEnum.Signet;
    case 'regtest':
      return NetworkEnum.Regtest;
    default:
      return NetworkEnum.Testnet;
  }
}

/**
 * Detect PSBT type by examining derivation paths in PSBT inputs
 * Checks for RGB coin types (827167 for testnet, 827166 for mainnet) in derivation paths
 * @returns {'create_utxo'|'send'} PSBT type
 */
function detectPsbtType(psbtBase64: string): 'create_utxo' | 'send' {
  const psbtStr = psbtBase64.trim();
  try {
    const decoded = Buffer.from(psbtStr, 'base64');
    const hex = decoded.toString('hex');
    
    const patterns = [
      '6f9f0c80', // 827167' little-endian hardened
      '6e9f0c80', // 827166' little-endian hardened
      '800c9f6f', // 827167' big-endian hardened
      '800c9f6e', // 827166' big-endian hardened
      '6f9f0c00', // 827167 little-endian (non-hardened, less likely)
      '6e9f0c00', // 827166 little-endian (non-hardened, less likely)
    ];
    
    for (const pattern of patterns) {
      if (hex.includes(pattern)) {
        return 'send';
      }
    }
    
    // Also check for ASCII representation
    const rgbTestnetStr = COIN_RGB_TESTNET.toString();
    const rgbMainnetStr = COIN_RGB_MAINNET.toString();
    const testnetHex = Buffer.from(rgbTestnetStr).toString('hex');
    const mainnetHex = Buffer.from(rgbMainnetStr).toString('hex');
    
    if (hex.includes(testnetHex) || hex.includes(mainnetHex)) {
      const testnetWithApostrophe = Buffer.from(rgbTestnetStr + "'").toString('hex');
      const mainnetWithApostrophe = Buffer.from(rgbMainnetStr + "'").toString('hex');
      const testnetWithSlash = Buffer.from('/' + rgbTestnetStr).toString('hex');
      const mainnetWithSlash = Buffer.from('/' + rgbMainnetStr).toString('hex');
      
      if (hex.includes(testnetWithApostrophe) || hex.includes(mainnetWithApostrophe) ||
          hex.includes(testnetWithSlash) || hex.includes(mainnetWithSlash)) {
        return 'send';
      }
    }
    
    return 'create_utxo';
  } catch (e) {
    logger.debug('PSBT type detection failed, defaulting to create_utxo:', e);
    return 'create_utxo';
  }
}

/**
 * Create descriptors for create_utxo PSBTs (standard BIP86)
 */
function createStandardDescriptors(
  mnemonic: any,
  network: Network
): { external: any; internal: any } {
  const bdkNetwork = toBDKNetwork(network);
  const secretKey = new DescriptorSecretKey(bdkNetwork, mnemonic, undefined);
  
  const externalDescriptor = Descriptor.newBip86(
    secretKey,
    KeychainKind.External,
    bdkNetwork,
  );
  
  const internalDescriptor = Descriptor.newBip86(
    secretKey,
    KeychainKind.Internal,
    bdkNetwork,
  );
  
  return { external: externalDescriptor, internal: internalDescriptor };
}

/**
 * Create descriptors for send PSBTs (custom coin type 827167)
 */
function createCustomCoinTypeDescriptors(
  mnemonic: any,
  network: Network
): { external: any; internal: any } {
  const bdkNetwork = toBDKNetwork(network);
  const customCoinType = COIN_RGB_TESTNET;
  const secretKey = new DescriptorSecretKey(bdkNetwork, mnemonic, undefined);
  
  const tempDesc = Descriptor.newBip86(secretKey, KeychainKind.External, bdkNetwork);
  const tempDescString = tempDesc.toStringWithSecret();
  const fingerprintMatch = tempDescString.match(/\[([a-f0-9]+)\//);
  const originFingerprint = fingerprintMatch ? fingerprintMatch[1] : '';
  
  const accountPath = new DerivationPath(`86'/${customCoinType}'/0'`);
  const accountKey = secretKey.derive(accountPath);
  const accountKeyString = accountKey.toString();
  
  const extractKeyAndOrigin = (keyString: string): { origin: string; key: string } => {
    const bracketEnd = keyString.indexOf(']');
    if (bracketEnd === -1) {
      const keyOnly = keyString.endsWith('/*') ? keyString.slice(0, -2) : keyString;
      return { origin: '', key: keyOnly };
    }
    const origin = keyString.substring(0, bracketEnd + 1);
    let key = keyString.substring(bracketEnd + 1);
    if (key.endsWith('/*')) {
      key = key.slice(0, -2);
    }
    return { origin, key };
  };
  
  const { origin: accountOrigin, key: accountKeyOnly } = extractKeyAndOrigin(accountKeyString);
  
  const externalOrigin = accountOrigin || `[${originFingerprint}/86'/${customCoinType}'/0']`;
  const internalOrigin = accountOrigin || `[${originFingerprint}/86'/${customCoinType}'/0']`;
  
  const externalDescString = `tr(${externalOrigin}${accountKeyOnly}/0/*)`;
  const internalDescString = `tr(${internalOrigin}${accountKeyOnly}/1/*)`;
  
  const externalDescriptor = new Descriptor(externalDescString, bdkNetwork);
  const internalDescriptor = new Descriptor(internalDescString, bdkNetwork);
  
  return { external: externalDescriptor, internal: internalDescriptor };
}


/**
 * Sign a PSBT using bdk-rn
 * 
 * @param mnemonic - BIP39 mnemonic phrase (12 or 24 words)
 * @param psbtBase64 - Base64 encoded PSBT string
 * @param network - Bitcoin network ('mainnet' | 'testnet' | 'signet' | 'regtest')
 * @param options - Optional signing options
 * @returns Base64 encoded signed PSBT
 * @throws {ValidationError} If mnemonic or PSBT format is invalid
 * @throws {CryptoError} If signing fails
 * 
 * @example
 * ```typescript
 * const signedPsbt = signPsbt(
 *   'abandon abandon abandon...',
 *   'cHNidP8BAIkBAAAAA...',
 *   'testnet'
 * );
 * ```
 */
export async function signPsbt(
  mnemonic: string,
  psbtBase64: string,
  network: Network = 'testnet',
): Promise<string> {
  try {
    validateMnemonic(mnemonic, 'mnemonic');
    validatePsbt(psbtBase64, 'psbtBase64');
    
    const normalizedNetwork = normalizeNetwork(network);
    const bdkNetwork = toBDKNetwork(normalizedNetwork);
    const mnemonicObj = Mnemonic.fromString(mnemonic.trim());
    let psbtType = detectPsbtType(psbtBase64);
    
    let externalDescriptor: any;
    let internalDescriptor: any;
    let wallet: any;
    let psbt: any;
    let isSigned = false;
    
    if (psbtType === 'create_utxo') {
      const descriptors = createStandardDescriptors(mnemonicObj, normalizedNetwork);
      externalDescriptor = descriptors.external;
      internalDescriptor = descriptors.internal;
    } else {
      const descriptors = createCustomCoinTypeDescriptors(mnemonicObj, normalizedNetwork);
      externalDescriptor = descriptors.external;
      internalDescriptor = descriptors.internal;
    }
    
    const persister = Persister.newInMemory();
    wallet = new Wallet(
      internalDescriptor,
      externalDescriptor,
      bdkNetwork,
      persister
    );
    
    psbt = new Psbt(psbtBase64.trim());
    isSigned = wallet.sign(psbt);
    
    if (!isSigned && psbtType === 'create_utxo') {
      logger.debug('Signing with create_utxo descriptors failed, trying send descriptors');
      const descriptors = createCustomCoinTypeDescriptors(mnemonicObj, normalizedNetwork);
      const sendPersister = Persister.newInMemory();
      wallet = new Wallet(
        descriptors.internal,
        descriptors.external,
        bdkNetwork,
        sendPersister
      );
      psbt = new Psbt(psbtBase64.trim());
      isSigned = wallet.sign(psbt);
      if (isSigned) {
        psbtType = 'send';
        externalDescriptor = descriptors.external;
        internalDescriptor = descriptors.internal;
      }
    } else if (!isSigned && psbtType === 'send') {
      logger.debug('Signing with send descriptors failed, trying create_utxo descriptors');
      const descriptors = createStandardDescriptors(mnemonicObj, normalizedNetwork);
      const utxoPersister = Persister.newInMemory();
      wallet = new Wallet(
        descriptors.internal,
        descriptors.external,
        bdkNetwork,
        utxoPersister
      );
      psbt = new Psbt(psbtBase64.trim());
      isSigned = wallet.sign(psbt);
      if (isSigned) {
        psbtType = 'create_utxo';
        externalDescriptor = descriptors.external;
        internalDescriptor = descriptors.internal;
      }
    }
    
    const externalDescriptorString = externalDescriptor.toStringWithSecret();
    const internalDescriptorString = internalDescriptor.toStringWithSecret();
    logger.debug('PSBT Type:', psbtType);
    logger.debug('External Descriptor (with secret):', externalDescriptorString);
    logger.debug('Internal Descriptor (with secret):', internalDescriptorString);
    
    if (!isSigned) {
      throw new CryptoError('Failed to sign PSBT - wallet.sign returned false for both descriptor types');
    }
    
    return psbt.serialize();
  } catch (error) {
    if (error instanceof ValidationError || error instanceof CryptoError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new CryptoError(`Unexpected error during PSBT signing: ${errorMessage}`, error as Error);
  }
}

/**
 * Legacy sync-named wrapper (still async under the hood).
 */
export async function signPsbtSync(
  mnemonic: string,
  psbtBase64: string,
  network: Network = 'testnet',
): Promise<string> {
  return signPsbt(mnemonic, psbtBase64, network);
}

/**
 * Sign a PSBT using a raw BIP39 seed (hex string or Uint8Array)
 * Note: This requires converting seed to mnemonic, which is not always possible.
 * Prefer using signPsbt with mnemonic directly.
 */
// @ts-ignore
export async function signPsbtFromSeed(seed: string | Uint8Array,psbtBase64: string, network: Network = 'testnet', options: SignPsbtOptions = {}
): Promise<string> {
  throw new CryptoError(
    'signPsbtFromSeed is not supported. Please use signPsbt with a mnemonic phrase instead.'
  );
}

function ensureMessageInput(message: string | Uint8Array): Uint8Array {
  if (typeof message === 'string') {
    if (!message.length) {
      throw new ValidationError('message must not be empty', 'message');
    }
    return Buffer.from(message, 'utf8');
  }
  if (message instanceof Uint8Array) {
    if (!message.length) {
      throw new ValidationError('message must not be empty', 'message');
    }
    return Buffer.from(message);
  }
  throw new ValidationError('message must be a string or Uint8Array', 'message');
}



const DEFAULT_RELATIVE_PATH = '0/0';

export interface SignMessageParams {
  message: string | Uint8Array;
  seed: string | Uint8Array;
  network?: Network;
}

export interface SignMessageResult {
  signature: string;
  accountXpub: string;
}

export interface VerifyMessageParams {
  message: string | Uint8Array;
  signature: string;
  accountXpub: string;
  network?: Network;
}

export interface EstimateFeeResult {
  fee: number;
  vbytes: number;
  feeRate: number;
}
export async function signMessage(params: SignMessageParams): Promise<string> {
  const { message, seed } = params;
  if (!seed) {
    throw new ValidationError('seed is required', 'seed');
  }
  
  const normalizedNetwork = normalizeNetwork(params.network ?? 'regtest');
  const relativePath = DEFAULT_RELATIVE_PATH;
  const accountPath = accountDerivationPath(normalizedNetwork, false);

  const messageBytes = ensureMessageInput(message);
  const normalizedSeed = normalizeSeedInput(seed, 'seed');
  const versions = getNetworkVersions(normalizedNetwork);
  const bip32 = bip32Factory();
  
  const root = bip32.fromSeed(normalizedSeed, versions);
  const accountNode = root.derivePath(accountPath);
  const child = accountNode.derivePath(relativePath);
  const privateKey = child.privateKey;

  if (!privateKey) {
    throw new CryptoError('Derived node does not contain a private key');
  }

  const messageHash = await sha256(messageBytes);
  const signature = Buffer.from(signSchnorr(messageHash, privateKey)).toString('base64');
  return signature;
}

export async function verifyMessage(params: VerifyMessageParams): Promise<boolean> {
  const { message, signature, accountXpub } = params;
  const messageBytes = ensureMessageInput(message);
  const relativePath = DEFAULT_RELATIVE_PATH;
  const signatureBytes = Buffer.from(signature, 'base64');

  const normalizedNetwork = normalizeNetwork(params.network ?? 'regtest');
  const versions = getNetworkVersions(normalizedNetwork);
  const bip32 = bip32Factory();

  let accountNode;
  try {
    accountNode = bip32.fromBase58(accountXpub, versions);
  } catch (error) {
    throw new ValidationError('Invalid account xpub provided', 'accountXpub');
  }

  const child = accountNode.derivePath(relativePath);
  const pubkeyBuffer = child.publicKey instanceof Buffer ? child.publicKey : Buffer.from(child.publicKey);
  const xOnlyPubkey = xOnlyPointFromPoint(pubkeyBuffer);

  const messageHash = await sha256(messageBytes);
  try {
    return verifySchnorr(messageHash, xOnlyPubkey, signatureBytes);
  } catch {
    return false;
  }
}

export async function estimatePsbt(psbtBase64: string): Promise<EstimateFeeResult> {
  if (!psbtBase64) {
    throw new ValidationError('psbt is required', 'psbt');
  }

  throw new CryptoError('PSBT estimation not yet implemented. Use BDK or another library for fee estimation.');
}







