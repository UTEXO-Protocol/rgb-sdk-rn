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
} from '@utexo/rgb-sdk-core';
import { RNRgbLibBinding } from '../binding/RNRgbLibBinding';
import { RNSigner } from '../signer/RNSigner';
import { BitcoinNetwork } from '../binding/Interfaces';
import { generateKeys, restoreBackup } from '../binding/RNRgbLibBinding';

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
