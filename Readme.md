# @utexo/rgb-lib-rn

[![npm](https://img.shields.io/npm/v/@utexo/rgb-lib-rn)](https://www.npmjs.com/package/@utexo/rgb-lib-rn)
[![license](https://img.shields.io/npm/l/@utexo/rgb-lib-rn)](LICENSE)

An RGB wallet for React Native, powered by native [rgb-lib](https://github.com/UTEXO-Protocol/rgb-lib) on iOS and Android. Hold Bitcoin and RGB assets (NIA, CFA, UDA, IFA, BFA), create invoices, send and receive on-chain, and back up the wallet.

`RgbLibWallet` implements the shared wallet API from `@utexo/rgb-sdk-core`. Use it directly, or wrap it in `UTEXOWallet` from [`@utexo/rgb-sdk`](https://www.npmjs.com/package/@utexo/rgb-sdk).

> [!NOTE]
> This is a beta. The API may change between beta releases; read [CHANGELOG.md](CHANGELOG.md) before upgrading.

> [!WARNING]
> Open each wallet in **one place at a time**. Running the same wallet in two apps or devices at once can spend the same UTXOs twice and lose RGB assets. Within one app the engine locks the wallet directory while a session is open.

## Requirements

|              | Minimum                                                        |
| ------------ | -------------------------------------------------------------- |
| React Native | New Architecture (TurboModules) enabled                        |
| iOS          | 16.0                                                           |
| Android      | `minSdk` 24; ABIs `arm64-v8a` and `x86_64`                     |
| Expo         | A development build (`expo prebuild`, `expo run`); not Expo Go |

## Installation

```bash
npm install @utexo/rgb-lib-rn @utexo/rgb-sdk-core
npm install react-native-get-random-values buffer
cd ios && pod install
```

Set the iOS deployment target in `ios/Podfile` (templates default lower, and `pod install` fails):

```ruby
platform :ios, '16.0'
```

Limit Android to the supported ABIs in `android/gradle.properties` (rgb-lib does not load on `armeabi-v7a` or `x86`):

```properties
reactNativeArchitectures=arm64-v8a,x86_64
```

Load the polyfills at the top of the entry file, before anything imports the SDK:

```ts
// index.js
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
globalThis.Buffer ??= Buffer;
```

Rebuild the app after installing or upgrading: each release pins its native rgb-lib version.

## Quick start

```ts
import { RgbLibWallet, generateKeys } from '@utexo/rgb-lib-rn';
import * as SecureStore from 'expo-secure-store';

// 1. Create a mnemonic once and keep it in secure storage.
const { mnemonic } = await generateKeys('signet'); // or 'mainnet', 'utexo', 'regtest'
await SecureStore.setItemAsync('mnemonic', mnemonic);

// 2. Create the wallet. Each wallet needs its own directory.
const wallet = new RgbLibWallet(
  { network: 'signet', storageDirPath: `${documentDir}/rgb-wallet` },
  () => SecureStore.getItemAsync('mnemonic') // read only when needed
);

// 3. Open it. This makes no network call.
await wallet.init();

// 4. Use it. The first online call connects by itself.
const address = await wallet.getAddress(); // fund it with BTC
const { vanilla } = await wallet.getBtcBalance();
const assets = await wallet.listAssets();

// 5. Close it. The data stays on disk; reopen with a new instance and init().
await wallet.destroy();
```

## Receive RGB assets

Create an invoice and give `invoice` to the sender:

```ts
const { invoice, expirationTimestamp } = await wallet.onchainReceive({
  assetId, // omit to accept any asset
  amount: 100, // omit to accept any amount
  minConfirmations: 1,
  durationSeconds: 86_400,
  // witness: false, // receive on a blinded UTXO of this wallet instead
});

// Same invoice types, as shortcuts:
// await wallet.witnessReceive({ ... }); // = onchainReceive({ witness: true })
// await wallet.blindReceive({ ... });   // = onchainReceive({ witness: false })
```

By default the invoice is a witness invoice: the asset arrives on a new output of the sender's transaction, so the wallet needs no free UTXOs, and the sender pays the fee and that output's sats (`witnessData` in `onchainSend`).

A blinded invoice (`witness: false`) receives on a UTXO of this wallet. Create a few first; this spends a little BTC:

```ts
await wallet.createUtxos({ num: 4, feeRate: 2 });
```

Once the sender has paid, call `refresh()` until the transfer settles:

```ts
await wallet.refresh();
const transfers = await wallet.listTransfers(assetId);
```

## Send RGB assets

```ts
const { txid } = await wallet.onchainSend({
  invoice,
  amount: 100,
  feeRate: 2,
  minConfirmations: 1,
  witnessData: { amountSat: 1000 }, // only for a witness invoice
});
await wallet.refresh(); // settles the transfer after the receiver accepts it
```

## Send Bitcoin

```ts
const txid = await wallet.sendBtc({ address, amount: 10_000, feeRate: 2 });
```

## Issue an asset

```ts
const asset = await wallet.issueAssetNia({
  ticker: 'USDT',
  name: 'Tether',
  amounts: [1_000_000],
  precision: 6,
});
```

`issueAssetCfa`, `issueAssetUda` and `issueAssetIfa` issue the other schemas.

## Back up and restore

The mnemonic recovers bitcoin only. RGB assets also need the wallet's data (contracts and transfer history), so make an encrypted backup after each transfer:

```ts
await wallet.createBackup({ backupPath, password });
```

To restore, unpack the backup into a new, empty directory before `init()`, then open the wallet there with the same mnemonic:

```ts
import { restoreFromBackup } from '@utexo/rgb-lib-rn';

await restoreFromBackup({ backupFilePath, password, dataDir: storageDirPath });
```

## Configuration

Each network has default endpoints. Override them once in the constructor, or per call with `goOnline(params)`:

```ts
const wallet = new RgbLibWallet(
  {
    network: 'utexo',
    storageDirPath,
    online: {
      indexerUrl: 'https://esplora.example.com', // Esplora (https://) or Electrum (tcp://, ssl://)
      proxyEndpoint: 'rpcs://proxy.example.com/json-rpc',
      evmRpcUrls: { '42161': 'https://arb1.arbitrum.io/rpc' },
    },
  },
  keys
);
```

| Option                   | Default                                | Notes                                                            |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------------- |
| `indexerUrl` / `indexer` | `DEFAULT_INDEXER_URLS[network]`        | `indexer` also accepts `bitcoind` with credentials               |
| `proxyEndpoint`          | `DEFAULT_TRANSPORT_ENDPOINTS[network]` | RGB proxy, protocol 1.0                                          |
| `evmRpcUrls`             | none                                   | Needed to receive BFA assets minted on an EVM chain, by chain ID |
| `evmMintLockBlocks`      | `{ min: 1200, max: 28800 }` per chain  | Mint lock window the wallet accepts, in blocks of that chain     |
| `proxyAuthKeys`          | none                                   | Proxy endpoint → 32-byte hex key                                 |

`regtest` has no defaults: set `online`, or call `goOnline(params)` first.

Wallet options: `witnessVersion` (`'taproot'` by default, or `'segwit-v0'`), `maxAllocationsPerUtxo` (default 5) and `reuseAddresses`.

The second constructor argument is the keys: a mnemonic string, a sync or async reader, an object with `getMnemonic()`, or account public keys alone for a watch-only wallet.

## Error handling

Every wallet method rejects with an engine error that has a stable `code`. Check it with `isEngineError`:

```ts
import { isEngineError } from '@utexo/rgb-sdk-core';

try {
  await wallet.onchainSend({ invoice, amount: 100, feeRate: 2 });
} catch (error) {
  if (isEngineError(error, 'INSUFFICIENT_FUNDS')) {
    // fund the wallet or create UTXOs
  } else if (isEngineError(error)) {
    console.warn(error.code, error.operation, error.cause);
  } else {
    throw error;
  }
}
```

| Code                                       | Meaning                                                               |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `INVALID_PARAMS`, `INVALID_CONFIG`         | A parameter or the configuration is invalid                           |
| `INSUFFICIENT_FUNDS`                       | Not enough BTC, free UTXOs or asset balance                           |
| `ASSET_NOT_FOUND`                          | The wallet does not hold this asset                                   |
| `WALLET_NOT_INITIALIZED`, `WALLET_OFFLINE` | Call `init()` first; on `regtest`, configure endpoints                |
| `WALLET_STORAGE_IN_USE`                    | The directory is open in another session or belongs to another wallet |
| `KEYS_UNAVAILABLE`                         | The mnemonic reader failed; see `cause`                               |
| `UNSUPPORTED_CAPABILITY`                   | Not possible here, for example sending from a watch-only wallet       |
| `NATIVE_ERROR`                             | rgb-lib rejected the call; `cause` holds the rgb-lib error            |

Prefer `isEngineError` to `instanceof`: it also works when the app bundles two copies of the SDK.

## Troubleshooting

**`required a higher minimum deployment target`** during `pod install`: set `platform :ios, '16.0'` in `ios/Podfile`.

**`pod install` asks you to run `npm run bindings:rgb-lib`**: the iOS frameworks are downloaded during `npm install`. If that ran offline, run the command in `node_modules/@utexo/rgb-lib-rn`, then `pod install` again.

**`NATIVE_BACKEND_UNAVAILABLE`**: the native module is not in the app. Rebuild it after installing (`pod install` on iOS), and check that the New Architecture is enabled.

**`NATIVE_VERSION_MISMATCH`**: the JavaScript bundle and the native build come from different versions of this package. Rebuild the app.

**`generateKeys()` rejects with `CRYPTO_ERROR`**: the polyfills are missing or load too late. Import them at the top of the entry file (see Installation).

**A BFA transfer stays pending** and the rgb-lib log says `no EVM RPC URL configured for chain ID …`: add that chain to `evmRpcUrls`, then call `refresh()`.

## Related packages

- [`@utexo/rgb-sdk`](https://www.npmjs.com/package/@utexo/rgb-sdk): the `UTEXOWallet` facade and the WebRGB provider for dApps.
- [`@utexo/rgb-sdk-core`](https://www.npmjs.com/package/@utexo/rgb-sdk-core): shared types, errors and key helpers.

## License

[MIT](LICENSE)
