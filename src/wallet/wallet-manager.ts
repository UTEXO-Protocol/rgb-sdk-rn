import { BaseWalletManager, ValidationError, generateKeys as coreGenerateKeys } from '@utexo/rgb-sdk-core';
import type {
  WalletInitParams,
  WalletRestoreResponse,
  RestoreWalletRequestModel,
  VssBackupConfig,
  GeneratedKeys,
} from '@utexo/rgb-sdk-core';

export type { WalletInitParams };
export type WalletManagerInitParams = WalletInitParams;

export const restoreFromBackup = async (
  params: RestoreWalletRequestModel
): Promise<WalletRestoreResponse> => {
  const { backupFilePath, password, dataDir } = params;
  if (!backupFilePath)
    throw new ValidationError('backup file is required', 'backup');
  if (!password) throw new ValidationError('password is required', 'password');
  if (!dataDir)
    throw new ValidationError('restore directory is required', 'restoreDir');
  throw new Error('restoreFromBackup is not supported in the RLN-only build');
};

export const createWallet = async (network: string = 'regtest'): Promise<GeneratedKeys> => {
  return coreGenerateKeys(network);
};

export const restoreFromVss = async (
  _config: VssBackupConfig,
  _targetDir: string
): Promise<string> => {
  throw new Error('restoreFromVss is not supported in the RLN-only build');
};

export class WalletManager extends BaseWalletManager {
  constructor(params: WalletManagerInitParams) {
    super(params, null as any, null as any);
  }

  async initialize(): Promise<void> {
    throw new Error('WalletManager is not supported in the RLN-only build');
  }

  async goOnline(_indexerUrl: string, _skipConsistencyCheck?: boolean): Promise<void> {
    throw new Error('WalletManager is not supported in the RLN-only build');
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

export function createWalletManager(
  params: WalletManagerInitParams
): WalletManager {
  return new WalletManager(params);
}
