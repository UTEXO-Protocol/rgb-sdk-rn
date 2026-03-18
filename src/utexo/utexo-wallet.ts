/**
 * UTEXOWallet — React Native implementation of UTEXOWalletCore.
 *
 * Extends UTEXOWalletCore (shared business logic in core) and provides
 * the platform-specific initialize() that creates WalletManager instances
 * backed by the RN TurboModule binding.
 */
import { UTEXOWalletCore, utexoNetworkMap } from '@utexo/rgb-sdk-core';
import type { ConfigOptions } from '@utexo/rgb-sdk-core';
import { WalletManager } from '../wallet/wallet-manager';

export type { ConfigOptions };

export class UTEXOWallet extends UTEXOWalletCore {
  async initialize(): Promise<void> {
    const layer1Keys = await this.derivePublicKeys(utexoNetworkMap.mainnet);
    const utexoKeys = await this.derivePublicKeys(utexoNetworkMap.utexo);

    const commonParams = {
      xpubCol: utexoKeys.accountXpubColored,
      masterFingerprint: utexoKeys.masterFingerprint,
      network: utexoNetworkMap.utexo,
      ...(this.mnemonicOrSeed instanceof Uint8Array
        ? { seed: this.mnemonicOrSeed }
        : { mnemonic: this.mnemonicOrSeed }),
    };

    this.utexoWallet = new WalletManager({
      xpubVan: utexoKeys.accountXpubVanilla,
      ...commonParams,
    });

    this.layer1Wallet = new WalletManager({
      xpubVan: layer1Keys.accountXpubVanilla,
      xpubCol: layer1Keys.accountXpubVanilla,
      masterFingerprint: layer1Keys.masterFingerprint,
      network: utexoNetworkMap.mainnet,
      ...(this.mnemonicOrSeed instanceof Uint8Array
        ? { seed: this.mnemonicOrSeed }
        : { mnemonic: this.mnemonicOrSeed }),
    });
  }
}
