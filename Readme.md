# @utexo/rgb-lib-rn

The RGB_L1 wallet engine for React Native: native [rgb-lib](https://github.com/UTEXO-Protocol/rgb-lib) on iOS and Android, exposed as `RgbLibWallet`, which implements the `SharedWalletApi` contract from `@utexo/rgb-sdk-core`.

This is an engine package. It has no Lightning (RLN) code, no `UTEXOWallet` facade and no `createWallet()`. A facade over several engines is planned as `@utexo/rgb-sdk`; it does not exist in this form yet.

> Status: local development build. Neither this package nor `@utexo/rgb-sdk-core` is published; install them from local tarballs (below).

## Requirements

- React Native with the New Architecture (TurboModules).
- iOS 16.0 or later (the minimum of the pinned rgb-lib release). React Native templates default to a lower target, so set it in the app's `ios/Podfile`, or `pod install` fails with "required a higher minimum deployment target":

  ```ruby
  platform :ios, '16.0'
  ```
- Android `minSdk` 24. The rgb-lib AAR ships `arm64-v8a` and `x86_64` only; set `reactNativeArchitectures=arm64-v8a,x86_64` in the app's `android/gradle.properties` (the template also builds `armeabi-v7a` and `x86`, where rgb-lib would not load).
- Peer dependency: `@utexo/rgb-sdk-core`.

## Install (local tarballs)

Build both packages into tarballs, then add them to the app:

```bash
(cd rgb-sdk-core && npm run build && npm pack --pack-destination ../.local-packages)
(cd rgb-lib-rn && npm pack --pack-destination ../.local-packages)
```

```bash
cd my-app
npm install ../.local-packages/utexo-rgb-sdk-core-0.1.0.tgz ../.local-packages/utexo-rgb-lib-rn-1.0.0-beta.40.tgz
npm install react-native-get-random-values buffer
cd ios && pod install
```

`postinstall` downloads the pinned rgb-lib iOS frameworks into the installed package's `ios/RgbLibBindings`. If that fails (offline, for example), `npm install` still succeeds, but `pod install` stops and prints the command to run. Run it **in the installed package**, not in the app or `ios/`:

```bash
cd my-app/node_modules/@utexo/rgb-lib-rn && npm run bindings:rgb-lib
```

Android resolves `com.utexo:rgb-lib-bfa-android` from Maven Central at the version in `src/bindings/rgb-lib/manifest.json`.

## App setup

The app provides two JavaScript globals before any wallet code runs. This package does not install them:

- a secure `crypto.getRandomValues` (used by `generateKeys()` and burn operation IDs), for example `react-native-get-random-values`;
- `Buffer`, used by the core key helpers, for example from the `buffer` package.

```typescript
// index.js, before anything imports @utexo/rgb-lib-rn
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
globalThis.Buffer ??= Buffer;
```

Without them `generateKeys()` rejects with `CRYPTO_ERROR` (`crypto.getRandomValues must be defined` or `Buffer is not defined`).

## Quick start

```typescript
import { RgbLibWallet, generateKeys } from '@utexo/rgb-lib-rn';

// First use only: save the mnemonic in secure storage before init().
const { mnemonic } = await generateKeys('utexo');

const wallet = new RgbLibWallet(
  { network: 'utexo', storageDirPath: '/path/to/wallet-storage' },
  () => SecureStore.getItemAsync('mnemonic') // or the mnemonic string
);

await wallet.init(); // opens local storage; works offline
const address = await wallet.getAddress();

await wallet.unlock({}); // connects with the network defaults
await wallet.createUtxos({ upTo: false, num: 4, feeRate: 1 });
const { invoice } = await wallet.onchainReceive({ witness: false, minConfirmations: 1 });

await wallet.shutdown(); // keeps data; reopen with init()
await wallet.destroy();  // releases the instance; data is kept
```

Keys: a mnemonic string, a sync or async reader, an object with `getMnemonic()`, or public keys alone for a watch-only wallet (`capabilities.canSignTransactions` is then `false`). See [`RgbLibKeys`](src/wallet/rgb-lib/key-provider.ts).

Connection: `unlock(params)` takes an indexer (Electrum, Esplora or bitcoind) and a proxy endpoint; omitted values use `DEFAULT_INDEXER_URLS` and `DEFAULT_TRANSPORT_ENDPOINTS`. See [`RgbLibUnlockParams`](src/wallet/rgb-lib/config.ts).

Storage: each wallet needs its own directory. The engine refuses a directory that belongs to another wallet or engine, and holds a lock while a session is open.

## Errors

Operations on a `RgbLibWallet` instance reject with an `EngineError`: an object with a stable `code`, the public `operation` and `protocol: 'RGB_L1'`. Recognize it with `isEngineError()` from core, not with `instanceof`; errors from this package are `WalletBackendError` instances.

- `cause` is set when the error wraps another one (a native rejection, a failed key reader, a core validation error). Errors raised by this package's own checks may have none.
- An engine error from another copy of the SDK that already carries the same `operation` and `protocol` is passed through unchanged, as the same object. It need not be an `Error` instance. Otherwise it is wrapped in a new `WalletBackendError` with the original as `cause`.

Outside wallet instances:

- `restoreFromBackup()` rejects invalid parameters with `WalletBackendError` `INVALID_CONFIG` without an `operation`.
- Helpers re-exported from core (`generateKeys()`, `deriveKeysFromMnemonic()` and others) throw core's own errors, such as `CryptoError`.

## WebRGB

`@utexo/rgb-lib-rn/webrgb` exposes `WebRgbProvider` over this engine. It moves to `@utexo/rgb-sdk` with the facade.

## Native modules

| | iOS | Android |
| --- | --- | --- |
| TurboModule | `RgbLib` | `RgbLib` |
| Pod / package | `RgbLib` | `com.utexo.rgblibrn.RgbLibPackage` |
| Module / namespace | `UtexoRgbLib` (not `RgbLib`: it would clash with the vendored `RGBLib.framework` on case-insensitive disks) | `com.utexo.rgblibrn` |
| Codegen | `RgbLibSpec` | `RgbLibSpec` |

## Tests

```bash
npm test
```

Runs the type check, the engine conformance suite, the rgb-lib tests and the WebRGB tests in Node with a stubbed native module. `npm run test:rgb-lib:ios` and `npm run test:rgb-lib:android` run native checks that need Xcode or `kotlinc`.
