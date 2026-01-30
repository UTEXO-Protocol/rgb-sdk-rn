// Main wallet exports
export { createWallet, WalletManager, createWalletManager } from './wallet/index';
export type { WalletInitParams } from './wallet/index';


// Type exports
export * from './types/rgb-model';
export type { Network, PsbtType, SignPsbtOptions, NetworkVersions, Descriptors } from './crypto';
export type { GeneratedKeys, AccountXpubs } from './crypto';

// Function exports
export { signPsbt, signPsbtSync, signPsbtFromSeed, signMessage, verifyMessage } from './crypto';
export { 
  generateKeys, 
  deriveKeysFromMnemonic, 
  deriveKeysFromSeed,
  restoreKeys, 
  accountXpubsFromMnemonic,
  getXprivFromMnemonic,
  getXpubFromXpriv,
  deriveKeysFromXpriv
} from './crypto';

// Error exports
export {
  SDKError,
  NetworkError,
  ValidationError,
  WalletError,
  CryptoError,
  ConfigurationError,
} from './errors';

// Utility exports
export { logger, configureLogging, LogLevel } from './utils/logger';
// Environment utilities removed - React Native only
export {
  validateNetwork,
  normalizeNetwork,
  validateMnemonic,
  validatePsbt,
  validateBase64,
  validateHex,
  validateRequired,
  validateString,
} from './utils/validation';
// normalizeNetwork is exported from validation.ts above
// network.ts is kept for backward compatibility but normalizeNetwork from validation.ts is preferred

// Constants exports
export * from './constants';