/**
 * UTEXOWallet — React Native implementation of UTEXOWalletCore.
 *
 * Extends UTEXOWalletCore (shared business logic in core) and provides
 * the platform-specific initialize() that creates WalletManager instances
 * backed by the RN TurboModule binding.
 */
import { UTEXOWalletCore, getVssConfigs, buildVssConfigFromMnemonic, ValidationError } from '@utexo/rgb-sdk-core';
import type { ConfigOptions, VssBackupConfig } from '@utexo/rgb-sdk-core';
import { WalletManager, restoreFromVss as walletManagerRestoreFromVss } from '../wallet/wallet-manager';

export type { ConfigOptions };

const DEFAULT_VSS_SERVER_URL = 'https://vss-server.utexo.com/vss';

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
    let baseConfig: VssBackupConfig;

    if (typeof mnemonicOrSeed === 'string') {
      const serverUrl = config?.serverUrl ?? DEFAULT_VSS_SERVER_URL;
      baseConfig = {
        ...await buildVssConfigFromMnemonic(mnemonicOrSeed, serverUrl),
        ...config,
      };
    } else {
      if (!config?.storeId || !config?.signingKey || !config?.serverUrl) {
        throw new ValidationError(
          'A complete VssBackupConfig (serverUrl, storeId, signingKey) must be provided when restoring with a seed',
          'config'
        );
      }
      baseConfig = config as VssBackupConfig;
    }

    const { layer1, utexo } = getVssConfigs(baseConfig);

    // Both wallets share the same master fingerprint (same mnemonic), so
    // rgb-lib would try to create the same targetDir/<fingerprint>/ subdirectory
    // for both calls — the second would fail with "already exists". Use separate
    // layer1/ and utexo/ subdirectories so each restore gets its own namespace.
    const layer1Path = await walletManagerRestoreFromVss(
      layer1,
      `${targetDir}/layer1`
    );
    const utexoPath = await walletManagerRestoreFromVss(
      utexo,
      `${targetDir}/utexo`
    );

    return { layer1Path, utexoPath };
  }
}
