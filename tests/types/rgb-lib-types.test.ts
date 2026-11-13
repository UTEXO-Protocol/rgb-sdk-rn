// Compile-only checks for the public engine API (checked by `npm run typecheck`).
import {
  RgbLibRn,
  restoreBackupFromFile,
  restoreFromBackup,
  type OnchainWalletApi,
  type RgbLibRnKeys,
  type RgbLibRnPublicKeys,
  type RgbLibRnUnlockParams,
  type RgbLibRnParams,
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
  params: RgbLibRnParams,
  keys: RgbLibRnKeys,
  unlock: RgbLibRnUnlockParams
) {
  const wallet = new RgbLibRn(params, keys);
  const shared: SharedWalletApi<RgbLibRnUnlockParams> = wallet;
  const extensions: [
    RestartableWalletApi<RgbLibRnUnlockParams>,
    FileBackupApi,
    WalletMaintenanceApi,
    BurnApi,
    ConsignmentApi,
    ConsignmentFileApi,
  ] = [wallet, wallet, wallet, wallet, wallet, wallet];
  const onchain: OnchainWalletApi<RgbLibRnUnlockParams> = wallet;
  const version: '1' = wallet.contractVersion;
  const protocol: 'RGB_L1' = wallet.protocol;
  const publicProtocol: WalletProtocol = protocol;
  const canSign: boolean = wallet.capabilities.canSignTransactions;
  const transfers: WalletTransfer[] = await wallet.listTransfers();
  await wallet.unlock(unlock);
  // A missing indexer and proxy use the network defaults.
  await wallet.unlock({});
  // @ts-expect-error The engine is not the legacy RLN-shaped contract.
  const legacy: IUTEXOProtocol<RgbLibRnUnlockParams> = wallet;
  // @ts-expect-error Lightning belongs to the RLN engine.
  void wallet.createLightningInvoice({ amountSats: 1 });
  // @ts-expect-error RLN node identity is not an RGB Lib capability.
  void wallet.getNodeInfo();
  // @ts-expect-error No message signing extension on RGB Lib.
  void wallet.signMessage('message');
  // goOnline is a deprecated alias of unlock(); both take optional params.
  void wallet.goOnline(unlock);
  void wallet.goOnline();
  void wallet.unlock();
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

export const restoredFromFile: Promise<WalletRestoreResponse> =
  restoreBackupFromFile({
    filePath: '/backups/w.rgb',
    password: 'pw',
    dataDir: '/wallets/restored',
  });
const oldFields = { backupFilePath: '/b', password: 'pw', dataDir: '/w' };
// @ts-expect-error restoreBackupFromFile takes filePath, not backupFilePath.
void restoreBackupFromFile(oldFields);

// Compile-only coverage of every `keys` form.
declare const SecureStore: {
  getItemAsync(key: string): Promise<string | null>;
};
export function keysForms(
  params: RgbLibRnParams,
  publicKeys: RgbLibRnPublicKeys
) {
  const forms: RgbLibRnKeys[] = [
    'mnemonic words',
    () => SecureStore.getItemAsync('mnemonic'),
    () => 'mnemonic words',
    { mnemonic: 'mnemonic words' },
    { getMnemonic: () => SecureStore.getItemAsync('mnemonic') },
    { mnemonic: 'mnemonic words', ...publicKeys },
    publicKeys,
  ];
  const wallets = forms.map((keys) => new RgbLibRn(params, keys));
  // @ts-expect-error A mnemonic source must not be given twice.
  new RgbLibRn(params, { mnemonic: 'a', getMnemonic: () => 'b' });
  // @ts-expect-error Without a mnemonic, all public keys are required.
  new RgbLibRn(params, { accountXpubVanilla: 'tpub' });
  // @ts-expect-error The reader returns the mnemonic as text.
  new RgbLibRn(params, () => 42);
  return wallets;
}

// Connection settings sit next to the wallet settings, like `goOnline(params)`.
export function flatConstructorParams(keys: RgbLibRnKeys) {
  new RgbLibRn(
    {
      network: 'utexo',
      storageDirPath: '/wallets/a',
      indexerUrl: 'https://esplora.example.com',
      proxyEndpoint: 'rpcs://proxy.example.com/json-rpc',
      evmRpcUrls: { '42161': 'https://arb1.arbitrum.io/rpc' },
      evmMintLockBlocks: { '42161': { min: 1200, max: 28800 } },
    },
    keys
  );
  new RgbLibRn(
    {
      network: 'regtest',
      storageDirPath: '/wallets/b',
      indexerUrl: 'http://localhost:3000',
      // @ts-expect-error: indexer and indexerUrl are exclusive
      indexer: { type: 'esplora', url: 'http://localhost:3000' },
    },
    keys
  );
  new RgbLibRn(
    {
      network: 'signet',
      storageDirPath: '/wallets/c',
      // @ts-expect-error: no nested `online` object
      online: { indexerUrl: 'https://esplora.example.com' },
    },
    keys
  );
}
