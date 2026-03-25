/**
 * UTEXOWallet — React Native implementation of UTEXOWalletCore.
 *
 * Extends UTEXOWalletCore (shared business logic in core) and provides
 * the platform-specific initialize() that creates WalletManager instances
 * backed by the RN TurboModule binding.
 */
import { UTEXOWalletCore, getVssConfigs, deriveKeysFromMnemonicOrSeed, utexoNetworkMap } from '@utexo/rgb-sdk-core';
import type { ConfigOptions, VssBackupConfig, VssBackupInfo } from '@utexo/rgb-sdk-core';
import { WalletManager, restoreFromVss as walletManagerRestoreFromVss } from '../wallet/wallet-manager';

export type { ConfigOptions };

const DEFAULT_VSS_SERVER_URL = 'https://vss-server.utexo.com/vss';

function buildDefaultVssConfigFromFingerprint(
  masterFingerprint: string
): VssBackupConfig {
  const fpHex = masterFingerprint;
  const signingKey = fpHex.repeat(Math.ceil(64 / fpHex.length)).slice(0, 64);
  return {
    serverUrl: DEFAULT_VSS_SERVER_URL,
    storeId: `utexo_${masterFingerprint}`,
    signingKey,
    encryptionEnabled: true,
    autoBackup: false,
    backupMode: 'Async',
  };
}

export class UTEXOWallet extends UTEXOWalletCore {
  async initialize(): Promise<void> {
    const layer1Keys = await this.derivePublicKeys(this.networkMap.mainnet);
    const utexoKeys = await this.derivePublicKeys(this.networkMap.utexo);

    const commonParams = {
      ...(this.mnemonicOrSeed instanceof Uint8Array
        ? { seed: this.mnemonicOrSeed }
        : { mnemonic: this.mnemonicOrSeed }),
    };

    this.utexoWallet = new WalletManager({
      xpubVan: utexoKeys.accountXpubVanilla,
      xpubCol: utexoKeys.accountXpubColored,
      masterFingerprint: utexoKeys.masterFingerprint,
      network: this.networkMap.utexo,
      ...commonParams,
    });

    this.layer1Wallet = new WalletManager({
      xpubVan: layer1Keys.accountXpubVanilla,
      xpubCol: layer1Keys.accountXpubColored,
      masterFingerprint: layer1Keys.masterFingerprint,
      network: this.networkMap.mainnet,
      ...commonParams,
    });

    await Promise.all([
      this.utexoWallet.initialize(),
      this.layer1Wallet.initialize(),
    ]);
  }

  async configureVssBackup(config: VssBackupConfig): Promise<void> {
    this.ensureInitialized();
    const { layer1, utexo } = getVssConfigs(config);
    await this.layer1Wallet!.configureVssBackup(layer1);
    await this.utexoWallet!.configureVssBackup(utexo);
  }

  async vssBackup(config: VssBackupConfig): Promise<number> {
    this.ensureInitialized();
    const { layer1, utexo } = getVssConfigs(config);
    await this.layer1Wallet!.vssBackup(layer1);
    return this.utexoWallet!.vssBackup(utexo);
  }

  async vssBackupInfo(config: VssBackupConfig): Promise<VssBackupInfo> {
    this.ensureInitialized();
    return this.utexoWallet!.vssBackupInfo(config);
  }

  async disableVssAutoBackup(): Promise<void> {
    this.ensureInitialized();
    await this.layer1Wallet!.disableVssAutoBackup();
    await this.utexoWallet!.disableVssAutoBackup();
  }

  // ==========================================
  // Static helpers
  // ==========================================

  /**
   * Restores both the layer1 and UTEXO wallet stores from a VSS cloud backup.
   *
   * This must be called **before** creating a new `UTEXOWallet` instance, so that the
   * native layer can find the restored data when `initialize()` is called.
   *
   * @param mnemonicOrSeed - The same mnemonic or seed used when the backup was created
   * @param targetDir - Local directory where the restored data should be written
   * @param config - Optional overrides for the VSS config (defaults are derived from the mnemonic)
   * @returns Paths to the restored layer1 and utexo wallet directories
   */
  static async restoreFromVss(
    mnemonicOrSeed: string | Uint8Array,
    targetDir: string,
    config?: Partial<VssBackupConfig>
  ): Promise<{ layer1Path: string; utexoPath: string }> {
    const utexoKeys = await deriveKeysFromMnemonicOrSeed(
      utexoNetworkMap.utexo,
      mnemonicOrSeed
    );

    const baseConfig: VssBackupConfig = {
      ...buildDefaultVssConfigFromFingerprint(utexoKeys.masterFingerprint),
      ...config,
    };

    const { layer1, utexo } = getVssConfigs(baseConfig);

    const [layer1Path, utexoPath] = await Promise.all([
      walletManagerRestoreFromVss(layer1, targetDir),
      walletManagerRestoreFromVss(utexo, targetDir),
    ]);

    return { layer1Path, utexoPath };
  }
}
