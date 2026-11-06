// Compile-only checks for the public engine API (checked by `npm run typecheck`).
import {
  RgbLibWallet,
  restoreFromBackup,
  type OnchainWalletApi,
  type RgbLibKeys,
  type RgbLibPublicKeys,
  type RgbLibUnlockParams,
  type RgbLibWalletParams,
  type WalletProtocol,
  type WalletRestoreResponse,
  type WalletTransfer,
} from '../../src';
import type {
  BurnApi,
  ConsignmentApi,
  ConsignmentFileApi,
  FileBackupApi,
  IUTEXOProtocol,
  RestartableWalletApi,
  SharedWalletApi,
  WalletMaintenanceApi,
} from '@utexo/rgb-sdk-core';

// The engine implements the core contract and the extensions it declares.
export async function engineContract(
  params: RgbLibWalletParams,
  keys: RgbLibKeys,
  unlock: RgbLibUnlockParams
) {
  const wallet = new RgbLibWallet(params, keys);
  const shared: SharedWalletApi<RgbLibUnlockParams> = wallet;
  const extensions: [
    RestartableWalletApi<RgbLibUnlockParams>,
    FileBackupApi,
    WalletMaintenanceApi,
    BurnApi,
    ConsignmentApi,
    ConsignmentFileApi,
  ] = [wallet, wallet, wallet, wallet, wallet, wallet];
  const onchain: OnchainWalletApi<RgbLibUnlockParams> = wallet;
  const version: '1' = wallet.contractVersion;
  const protocol: 'RGB_L1' = wallet.protocol;
  const publicProtocol: WalletProtocol = protocol;
  const canSign: boolean = wallet.capabilities.canSignTransactions;
  const transfers: WalletTransfer[] = await wallet.listTransfers();
  await wallet.unlock(unlock);
  // A missing indexer and proxy use the network defaults.
  await wallet.unlock({});
  // @ts-expect-error The engine is not the legacy RLN-shaped contract.
  const legacy: IUTEXOProtocol<RgbLibUnlockParams> = wallet;
  // @ts-expect-error Lightning belongs to the RLN engine.
  void wallet.createLightningInvoice({ amountSats: 1 });
  // @ts-expect-error RLN node identity is not an RGB Lib capability.
  void wallet.getNodeInfo();
  // @ts-expect-error No message signing extension on RGB Lib.
  void wallet.signMessage('message');
  // @ts-expect-error goOnline was a facade alias; the engine uses unlock().
  void wallet.goOnline(unlock);
  // @ts-expect-error The protocol is fixed.
  wallet.protocol = 'RGB_L1';
  // @ts-expect-error A URL alone is not an RGB Lib connection config.
  void wallet.unlock('tcp://localhost:50001');
  return [
    shared,
    extensions,
    onchain,
    version,
    publicProtocol,
    canSign,
    transfers,
    legacy,
  ];
}

// The pre-beta.10 restore shape is the public one again.
export const restoreShape: Promise<WalletRestoreResponse> = restoreFromBackup({
  backupFilePath: '/backups/w.rgb',
  password: 'pw',
  dataDir: '/wallets/restored',
});
const renamed = { backupPath: '/b', password: 'pw', storageDirPath: '/w' };
// @ts-expect-error The old field names are required.
void restoreFromBackup(renamed);

// Compile-only coverage of every `keys` form.
declare const SecureStore: {
  getItemAsync(key: string): Promise<string | null>;
};
export function keysForms(
  params: RgbLibWalletParams,
  publicKeys: RgbLibPublicKeys
) {
  const forms: RgbLibKeys[] = [
    'mnemonic words',
    () => SecureStore.getItemAsync('mnemonic'),
    () => 'mnemonic words',
    { mnemonic: 'mnemonic words' },
    { getMnemonic: () => SecureStore.getItemAsync('mnemonic') },
    { mnemonic: 'mnemonic words', ...publicKeys },
    publicKeys,
  ];
  const wallets = forms.map((keys) => new RgbLibWallet(params, keys));
  // @ts-expect-error A mnemonic source must not be given twice.
  new RgbLibWallet(params, { mnemonic: 'a', getMnemonic: () => 'b' });
  // @ts-expect-error Without a mnemonic, all public keys are required.
  new RgbLibWallet(params, { accountXpubVanilla: 'tpub' });
  // @ts-expect-error The reader returns the mnemonic as text.
  new RgbLibWallet(params, () => 42);
  return wallets;
}
