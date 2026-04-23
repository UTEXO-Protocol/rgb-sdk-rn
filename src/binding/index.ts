import Rgb from './NativeRgb';
import type { Keys, BitcoinNetwork as RNBitcoinNetwork } from './Interfaces';
import { toNativeNetwork } from './Interfaces';
import type { InvoiceData } from '@utexo/rgb-sdk-core';
export { RLNRgbLibBinding } from './RLNRgbLibBinding';
export type * from './rln-types';

// ── Standalone functions (mirrors NodeRgbLibBinding exports) ─────────────────

export async function generateKeys(network: RNBitcoinNetwork): Promise<Keys> {
  return Rgb.generateKeys(toNativeNetwork(network));
}

export async function restoreKeys(
  network: RNBitcoinNetwork,
  mnemonic: string
): Promise<Keys> {
  return Rgb.restoreKeys(toNativeNetwork(network), mnemonic);
}

export async function restoreBackup(
  path: string,
  password: string
): Promise<void> {
  return Rgb.restoreBackup(path, password);
}

export async function decodeInvoice(invoice: string): Promise<InvoiceData> {
  return Rgb.decodeInvoice(invoice) as unknown as InvoiceData;
}

/**
 * Restores a wallet from a VSS cloud backup into targetDir.
 * This should be called before creating a Wallet instance (no wallet ID needed).
 * @param config - VSS backup configuration (server URL, store ID, signing key hex, etc.)
 * @param targetDir - Directory where the wallet data will be restored
 * @returns Absolute path to the restored wallet directory
 */
export async function restoreFromVss(
  config: {
    serverUrl: string;
    storeId: string;
    signingKey: string;
    encryptionEnabled?: boolean;
    autoBackup?: boolean;
    backupMode?: 'Async' | 'Blocking';
  },
  targetDir: string
): Promise<string> {
  return Rgb.restoreFromVss(
    {
      serverUrl: config.serverUrl,
      storeId: config.storeId,
      signingKeyHex: config.signingKey,
      encryptionEnabled: config.encryptionEnabled ?? true,
      autoBackup: config.autoBackup ?? false,
      backupMode: config.backupMode ?? 'Async',
    },
    targetDir
  );
}
