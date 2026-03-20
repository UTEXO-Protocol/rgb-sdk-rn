/**
 * UTEXOWallet — React Native implementation of UTEXOWalletCore.
 *
 * Extends UTEXOWalletCore (shared business logic in core) and provides
 * the platform-specific initialize() that creates WalletManager instances
 * backed by the RN TurboModule binding.
 */
import { UTEXOWalletCore, getVssConfigs } from '@utexo/rgb-sdk-core';
import type { ConfigOptions, VssBackupConfig, VssBackupInfo } from '@utexo/rgb-sdk-core';
import { WalletManager } from '../wallet/wallet-manager';

export type { ConfigOptions };

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
}
