import {
  BaseWalletManager,
  ValidationError,
  normalizeNetwork,
} from '@utexo/rgb-sdk-core';
import type {
  WalletInitParams,
  BtcBalance,
  WalletRestoreResponse,
  RestoreWalletRequestModel,
  VssBackupConfig,
  VssBackupInfo,
} from '@utexo/rgb-sdk-core';
import { RNRgbLibBinding } from '../binding/RNRgbLibBinding';
import { RNSigner } from '../signer/RNSigner';
import { BitcoinNetwork } from '../binding/Interfaces';
import {
  generateKeys,
  restoreBackup,
  restoreFromVss as nativeRestoreFromVss,
} from '../binding';

export type { WalletInitParams };

export const restoreFromBackup = async (
  params: RestoreWalletRequestModel
): Promise<WalletRestoreResponse> => {
  const { backupFilePath, password, dataDir } = params;
  if (!backupFilePath)
    throw new ValidationError('backup file is required', 'backup');
  if (!password) throw new ValidationError('password is required', 'password');
  if (!dataDir)
    throw new ValidationError('restore directory is required', 'restoreDir');
  await restoreBackup(backupFilePath, password);
  return { message: 'Wallet restored successfully' };
};

export const createWallet = async (network: string = 'regtest') => {
  normalizeNetwork(network ?? 'regtest');
  return generateKeys(BitcoinNetwork.REGTEST);
};

/**
 * Restore a wallet from a VSS cloud backup into targetDir.
 * This should be called before creating a WalletManager instance.
 * @param config - VSS backup configuration (server URL, store ID, signing key, etc.)
 * @param targetDir - Directory where the wallet will be restored
 * @returns Absolute path to the restored wallet directory
 */
export const restoreFromVss = async (
  config: VssBackupConfig,
  targetDir: string
): Promise<string> => {
  if (!targetDir) {
    throw new ValidationError('target directory is required', 'targetDir');
  }
  return nativeRestoreFromVss(config, targetDir);
};

export class WalletManager extends BaseWalletManager {
  private readonly rnBinding: RNRgbLibBinding;

  constructor(params: WalletInitParams) {
    const binding = new RNRgbLibBinding(params);
    super(params, binding, new RNSigner());
    this.rnBinding = binding;
  }

  async initialize(): Promise<void> {
    await this.rnBinding.goOnline(this.rnBinding.indexerUrl, false);
  }

  async goOnline(
    indexerUrl: string,
    skipConsistencyCheck: boolean = false
  ): Promise<void> {
    await this.rnBinding.goOnline(indexerUrl, skipConsistencyCheck);
  }

  public async registerWallet(): Promise<{
    address: string;
    btcBalance: BtcBalance;
  }> {
    const [address, btcBalance] = await Promise.all([
      this.getAddress(),
      this.getBtcBalance(),
    ]);
    return { address, btcBalance };
  }

  /**
   * Configures automatic VSS cloud backup for the open wallet.
   * @param config - VSS backup configuration
   */
  public async configureVssBackup(config: VssBackupConfig): Promise<void> {
    await this.rnBinding.configureVssBackup(config);
  }

  /**
   * Uploads a VSS cloud backup of the current wallet state.
   * @param config - VSS backup configuration
   * @returns Server-side version number after successful upload
   */
  public async vssBackup(config: VssBackupConfig): Promise<number> {
    return this.rnBinding.vssBackup(config);
  }

  /**
   * Queries the VSS server for this wallet's backup status.
   * @param config - VSS backup configuration
   * @returns Backup info: backupExists, serverVersion, backupRequired
   */
  public async vssBackupInfo(config: VssBackupConfig): Promise<VssBackupInfo> {
    return this.rnBinding.vssBackupInfo(config);
  }

  /**
   * Disables automatic VSS backup for the open wallet.
   */
  public async disableVssAutoBackup(): Promise<void> {
    await this.rnBinding.disableVssAutoBackup();
  }
}

let _wallet: WalletManager | null = null;

export const wallet = new Proxy({} as WalletManager, {
  get(_target, prop) {
    if (!_wallet) {
      throw new Error(
        'The legacy singleton wallet instance is not initialised. ' +
          'Please use `new WalletManager(params)` or `createWalletManager(params)` instead.'
      );
    }
    const value = (_wallet as any)[prop];
    return typeof value === 'function' ? value.bind(_wallet) : value;
  },
});

export function createWalletManager(params: WalletInitParams): WalletManager {
  return new WalletManager(params);
}
