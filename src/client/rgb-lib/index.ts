import Rgb from './NativeRgb';
import * as Interfaces from './Interfaces';
import { Wallet } from './Wallet';

export * from './Interfaces';
export * from './Wallet';
export * from './RgbError';

export { Interfaces, Wallet };

/**
 * Generates new keys for a wallet.
 * @param bitcoinNetwork - The Bitcoin network to use (mainnet, testnet, testnet4, regtest, signet)
 * @returns Promise resolving to Keys containing mnemonic, xpub, accountXpubVanilla, accountXpubColored, and masterFingerprint
 * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
 *   - Invalid Bitcoin network
 *   - Key generation fails
 */
export async function generateKeys(
  bitcoinNetwork: Interfaces.BitcoinNetwork
): Promise<Interfaces.Keys> {
  return Rgb.generateKeys(bitcoinNetwork);
}

/**
 * Restores a wallet from a mnemonic.
 * @param bitcoinNetwork - The Bitcoin network to use (mainnet, testnet, testnet4, regtest, signet)
 * @param mnemonic - The mnemonic to restore the wallet from
 * @returns Promise resolving to Keys containing mnemonic, xpub, accountXpubVanilla, accountXpubColored, and masterFingerprint
 * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
 *   - Invalid Bitcoin network
 *   - Invalid mnemonic
 *   - Key restoration fails
 */
export async function restoreKeys(
  bitcoinNetwork: Interfaces.BitcoinNetwork,
  mnemonic: string
): Promise<Interfaces.Keys> {
  return Rgb.restoreKeys(bitcoinNetwork, mnemonic);
}

/**
 * Restores a wallet from a backup file.
 * @param path - The path to the backup file
 * @param password - The password to decrypt the backup
 * @returns Promise resolving to void on success
 * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
 *   - Invalid backup path
 *   - Invalid password
 *   - Backup restoration fails
 */
export async function restoreBackup(
  path: string,
  password: string
): Promise<void> {
  return Rgb.restoreBackup(path, password);
}

export async function decodeInvoice(
  invoice: string
): Promise<Interfaces.InvoiceData> {
  return Rgb.decodeInvoice(invoice) as Promise<Interfaces.InvoiceData>;
}
