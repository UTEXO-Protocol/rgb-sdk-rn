/**
 * Wallet module exports
 *
 * This module provides the WalletManager class and related functionality for
 * managing RGB wallets, combining RGB Node API client and cryptographic operations.
 */

export {
  wallet,
  WalletManager,
  createWalletManager,
  createWallet,
  restoreFromBackup,
  restoreFromVss,
} from './wallet-manager';
export type { WalletInitParams } from './wallet-manager';
