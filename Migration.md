# Migration guide

## From `@utexo/rgb-sdk-rn` 1.0.0-beta.40 to `@utexo/rgb-lib-rn` + `@utexo/rgb-sdk` (RGB_L1)

`@utexo/rgb-sdk-rn` was one package with the wallet facade, the rgb-lib engine, RLN and WebRGB. It is split into:

| Package | Role |
| --- | --- |
| `@utexo/rgb-lib-rn` | The RGB_L1 engine: native rgb-lib, `RgbLibWallet`, `generateKeys()`, `restoreFromBackup()` |
| `@utexo/rgb-sdk` | The facade `UTEXOWallet({ engine })`, plus `@utexo/rgb-sdk/webrgb` (`WebRgbProvider`, `BurnOperations`). No native code. Optional: an app can use `RgbLibWallet` directly |
| `@utexo/rgb-sdk-core` | Shared types, the engine contract and errors; a peer dependency of both |

RLN (`RGB_LN`) is not part of this split yet. An app that needs Lightning stays on `@utexo/rgb-sdk-rn` for now.

> Status: local development builds; nothing is published. Versions are in [the compatibility table](../docs/05-compatibility.md).

### Wallet data carries over

No data migration is needed. The new engine opens a wallet directory written by `@utexo/rgb-sdk-rn@1.0.0-beta.40` as is, with the same identity, addresses, balances and transfers, and it restores beta.40 backup files. Both versions use the same native rgb-lib release and the same storage files (`rgb-sdk-profile.json`, `.rgb-sdk.lock`, the rgb-lib data directory). This was verified on iOS and Android by creating a wallet and a backup with beta.40, then opening both with the new packages (see `docs/04-rn-migration.md` in the workspace). A funded wallet (settled BTC, an issued asset, allocations) was verified on iOS against a local regtest.

Keep the same `storageDirPath`, mnemonic (or key reader) and `network`. Keep `reuseAddresses` as it was, or `getAddress()` behaves differently.

`listTransfers()` reports four additional fields: `txid`, `receiveUtxo`, `changeUtxo` and `consignmentPath`. The existing fields keep their values.

### 1. Dependencies

```bash
npm uninstall @utexo/rgb-sdk-rn @utexo/webrgb-walletconnect
npm install @utexo/rgb-sdk-core @utexo/rgb-lib-rn @utexo/rgb-sdk   # local tarballs for now
npm install @utexo/webrgb                                          # only if you use WebRGB
```

- **iOS:** the pod is now `RgbLib` (was `Rgb`), with Swift module `UtexoRgbLib`. Set `platform :ios, '16.0'` in the Podfile, then run `pod install`. A missing or mismatched rgb-lib binding stops `pod install` with the command to fix it.
- **Android:** the package is `com.utexo.rgblibrn.RgbLibPackage` (was `com.rgbsdkrn.RgbPackage`); autolinking handles it. rgb-lib ships `arm64-v8a` and `x86_64` only, so set `reactNativeArchitectures=arm64-v8a,x86_64`.
- **Rebuild the native app** after the swap. A JS reload is not enough: the old and new native modules share the TurboModule name `RgbLib`, so JS from one package can run against the other's native code without an error.
- **App setup is unchanged.** Install a secure `crypto.getRandomValues` (for example `react-native-get-random-values`) and `globalThis.Buffer` before any wallet code.

### 2. Construction

```typescript
// Before (@utexo/rgb-sdk-rn)
import { UTEXOWallet } from '@utexo/rgb-sdk-rn';
const wallet = new UTEXOWallet({ params, keys });            // RGB_L1 was the default
// or: new UTEXOWallet({ protocol: 'RGB_L1', params, keys })

// After, with the facade
import { UTEXOWallet } from '@utexo/rgb-sdk';
import { RgbLibWallet } from '@utexo/rgb-lib-rn';
const wallet = new UTEXOWallet({ engine: new RgbLibWallet(params, keys) });

// After, engine only (no facade)
const wallet = new RgbLibWallet(params, keys);
```

`params` (`RgbLibWalletParams`) and `keys` (`RgbLibKeys`: a mnemonic, a reader, `getMnemonic()`, or public keys for watch-only) have the same shape as before. `createWallet()`, the `protocol` option, `RgbLibWalletInit` and `WalletInit` are gone.

### 3. Methods

| Before | After |
| --- | --- |
| `init()`, `initialize()`, `destroy()`, `dispose()`, `shutdown()`, `reinit()` | unchanged |
| `goOnline(params)` | `unlock(params)` (same `RgbLibUnlockParams`). `goOnline` still works as a deprecated alias on `RgbLibWallet` and the facade |
| endpoints passed on every connect | optionally once, as `online` in the constructor params; `unlock()`, `goOnline()` and the lazy connect use them, explicit fields override them |
| shared wallet methods (`getAddress`, `getBtcBalance`, `listAssets`, `sendBtc`, `onchainReceive`, `onchainSend`, `listTransfers`, `refreshWallet`, `syncWallet`, …) | unchanged, except the behaviour changes below |
| `refreshTransfers(skipSync?)` | `refresh({ skipSync? })` on the facade or the engine (same `RefreshTransfersResult`); `refreshTransfers` stays on `RgbLibWallet` |
| `createBackup`, `drainTo`, `deleteTransfers`, `getBfaCapabilities`, `burn`, `getConsignment`, `getConsignmentPath` | unchanged (rgb-lib extensions, present on the facade) |
| `rotateVanillaAddress`, `checkIndexerUrl`, `getAssetMetadata`, `issueAssetCfa`, `issueAssetUda`, `listTransfersByTxid` | unchanged (core extensions, present on the facade) |
| `listTransactionsByTxid(txid, skipSync?)` | `listTransactionsByTxid(txid, { skipSync? })` on the facade or the engine; the positional boolean still works on `RgbLibWallet` |
| `listOnchainTransfers` | `wallet.engine.listOnchainTransfers()`, or `listTransfers()` (same result) |
| `signMessage`, `verifyMessage`, `backupNow`, `vssClearFence` and every Lightning method | not available on RGB_L1 (they were RLN-only) |
| `wallet.protocol`, `wallet.capabilities` | unchanged; read from the engine |

The facade owns the engine's session. Do not call `init`, `unlock`, `shutdown` or `destroy` on `wallet.engine` yourself.

Behaviour changes in the same methods:

- **Offline reads.** `getBtcBalance`, `listUnspents`, `listTransactions` and `listTransactionsByTxid` with `skipSync: true` read the stored state without connecting. beta.40 connected first: lazily with the network defaults, or rejected with `WALLET_OFFLINE` before `unlock()` on regtest. An app that relied on such a read to connect must call `unlock()` (or a read without `skipSync`) itself.
- **`skipSync` must be a boolean.** Any `skipSync` (options field or positional argument) that is not a boolean, `undefined` or `null` rejects with `INVALID_PARAMS` before anything runs. beta.40 passed such values on to native.
- **`restoreFromBackup()` errors** carry `operation: 'restoreFromBackup'` and `protocol: 'RGB_L1'` (beta.40: the bridge name `restoreBackup`, or none).

### 4. WebRGB and the burn journal

```typescript
// Before
import { BurnOperations } from '@utexo/rgb-sdk-rn';
import { WebRgbProvider } from '@utexo/rgb-sdk-rn/webrgb';
// After
import { BurnOperations, WebRgbProvider } from '@utexo/rgb-sdk/webrgb';
```

Both accept the facade or `RgbLibWallet`. Stored burn journal records (version 1 and 2) are read as before. Passing `burn` options with a wallet that has no `burn()` or `getConsignment()` now throws `INVALID_PARAMS` from the constructor.

### 5. Errors

Codes are the same as in beta.40, plus `WALLET_INVALID_STATE` (for example `reinit()` while a session is open) and core's `VALIDATION_ERROR`. What changed is how errors are shaped:

- Every rejection from a wallet method carries `code`, the public `operation` (`'sendBtc'`, …) and `protocol: 'RGB_L1'`. Synchronous argument errors are now rejections.
- Recognize them with `isEngineError(error, code?)` from `@utexo/rgb-sdk` or `@utexo/rgb-sdk-core`, not with `instanceof`.
- The facade adds `ENGINE_CONTRACT_MISMATCH` (an engine with another contract version) and `UTEXOWalletError` `INVALID_CONFIG` (no engine).

### 6. Checklist

- [ ] Dependencies swapped, `pod install` run, iOS target 16.0, Android ABIs `arm64-v8a,x86_64`
- [ ] Native app rebuilt and reinstalled
- [ ] Same `storageDirPath`, keys, `network` and `reuseAddresses`
- [ ] `goOnline` → `unlock` (the alias still works, deprecated); custom endpoints can move to the constructor's `online`
- [ ] `listOnchainTransfers` via `wallet.engine` (or `listTransfers()`); the other engine methods are on the facade
- [ ] WebRGB imports moved to `@utexo/rgb-sdk/webrgb`
- [ ] Error handling uses `code` and `isEngineError()`
- [ ] On first launch, the identity (`getWalletIdentity().id`) matches the one stored before the update

## Appendix: `rgb-sdk-rn` (RGB Node) to `@utexo/rgb-sdk-rn`

> Historical. This is the earlier migration, from the RGB Node package to `@utexo/rgb-sdk-rn`; its code targets `@utexo/rgb-sdk-rn`, not this package. Wallets that went through it migrate further with the guide above.

This guide explains how to migrate from the `rgb-sdk-rn` package to `@utexo/rgb-sdk-rn`. The new package uses local `rgb-lib` instead of requiring an RGB Node server.

### 🔐 Privacy Recommendation (Important)

If you are migrating from `rgb-sdk-rn` to `@utexo/rgb-sdk-rn` it is important to understand the privacy implications of the legacy architecture.

Version 1 relied on an RGB Node server, which means that wallet metadata (such as extended public keys and transaction graph information) may have been exposed to the node operator. This exposure is permanent and cannot be reversed by upgrading software alone.

### Recommended approach (if privacy matters)

If wallet privacy is important to you, we strongly recommend:
- Creating a brand new wallet with a new seed phrase in  `@utexo/rgb-sdk-rn`
- Migrating assets from the old wallet to the new wallet using standard RGB transfers
- Discontinuing use of the old seed phrase and xpubs

This is the only way to fully eliminate historical metadata exposure.

### Alternative (state migration)

The migration steps below restore wallet state using the same seed phrase and preserve balances and history. This approach is safe from a funds perspective, but it does not remove prior privacy exposure.

Choose the approach that best matches your threat model.

### Overview

`@utexo/rgb-sdk-rn` uses `rgb-lib` directly via native bindings, eliminating the need for an RGB Node server. All wallet data is now stored locally. To migrate, you need to:

1. Create a backup of your wallet state using `rgb-sdk-rn`
2. Restore the backup using `@utexo/rgb-sdk-rn` to a local directory
3. Initialize your wallet in `@utexo/rgb-sdk-rn` pointing to the restored directory

### Step 1: Backup Wallet State

First, create a backup of your wallet state using `rgb-sdk-rn`:

```javascript
const { WalletManager } = require('rgb-sdk-rn');

const wallet = new WalletManager({
    xpub_van: keys.account_xpub_vanilla,
    xpub_col: keys.account_xpub_colored,
    master_fingerprint: keys.master_fingerprint,
    mnemonic: keys.mnemonic,
    network: 'testnet',
    rgb_node_endpoint: 'http://127.0.0.1:8000' // RGB Node endpoint
});

// Create backup
const backupPassword = 'rgb-demo-password';
const backupResponse = await wallet.createBackup(backupPassword);

// backupResponse structure:
// {
//   message: string;
//   download_url: string;
// }

// Download and save the backup file
// In React Native, use a file system library like react-native-fs
import RNFS from 'react-native-fs';

const backupDir = `${RNFS.DocumentDirectoryPath}/backups`;
await RNFS.mkdir(backupDir);

const backupFilePath = `${backupDir}/wallet.backup`;

// Download backup from download_url
const downloadResult = await RNFS.downloadFile({
    fromUrl: backupResponse.download_url,
    toFile: backupFilePath,
}).promise;

console.log('Backup saved to:', backupFilePath);
```

**Important**: Save the backup file securely.

### Step 2: Restore Wallet

Restore the backup using `@utexo/rgb-sdk-rn`:

```javascript
const { WalletManager, restoreFromBackup } = require('@utexo/rgb-sdk-rn');
import RNFS from 'react-native-fs';

const backupFilePath = `${RNFS.DocumentDirectoryPath}/backups/wallet.backup`;
const password = 'rgb-demo-password';
const dataDir = `${RNFS.DocumentDirectoryPath}/restored-wallet`;

// Ensure restore directory exists
await RNFS.mkdir(dataDir);

// Restore wallet from backup
// This must be called BEFORE creating the WalletManager instance
const responseMsg = await restoreFromBackup({
    backupFilePath,
    password,
    dataDir
});

console.log(responseMsg.message);
```

### Step 3: Initialize Wallet

After restoring, create your wallet instance pointing to the restored directory:

```javascript
// Note: Property names changed from snake_case to camelCase in v2
const walletV2 = new WalletManager({
    xpubVan: keys.accountXpubVanilla,        // was: xpub_van
    xpubCol: keys.accountXpubColored,        // was: xpub_col
    masterFingerprint: keys.masterFingerprint, // was: master_fingerprint
    mnemonic: keys.mnemonic,
    network: 'testnet',
    dataDir: dataDir,                        // Point to restored directory
    transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
    indexerUrl: 'ssl://electrum.iriswallet.com:50013'
});

// Initialize wallet and connect to indexer (now async in v2)
await walletV2.initialize();

// Get wallet address
const address = await walletV2.getAddress();
console.log('Wallet address:', address);

// Your RGB state is now stored locally!
```

### Complete Migration Example

Here's a complete example showing the full migration process:

```javascript
const { WalletManager, restoreFromBackup } = require('@utexo/rgb-sdk-rn');
import RNFS from 'react-native-fs';

async function migrateFromRgbSdkRnToUtexo() {
    // ============================================
    // STEP 1: Backup using rgb-sdk-rn (run this first)
    // ============================================
    console.log('Step 1: Creating backup using rgb-sdk-rn...');
    
    // Use rgb-sdk-rn for this step
    const { WalletManager: WalletManagerOld } = require('rgb-sdk-rn');
    
    const walletOld = new WalletManagerOld({
        xpub_van: keys.account_xpub_vanilla,
        xpub_col: keys.account_xpub_colored,
        master_fingerprint: keys.master_fingerprint,
        mnemonic: keys.mnemonic,
        network: 'testnet',
        rgb_node_endpoint: 'http://127.0.0.1:8000'
    });
    
    const backupPassword = 'rgb-demo-password';
    const backupResponse = await walletOld.createBackup(backupPassword);
    
    // Save backup file
    const backupDir = `${RNFS.DocumentDirectoryPath}/backups`;
    await RNFS.mkdir(backupDir);
    
    const backupFilePath = `${backupDir}/wallet.backup`;
    
    // Download backup
    await RNFS.downloadFile({
        fromUrl: backupResponse.download_url,
        toFile: backupFilePath,
    }).promise;
    
    console.log('Backup saved to:', backupFilePath);
    
    // ============================================
    // STEP 2: Restore using @utexo/rgb-sdk-rn
    // ============================================
    console.log('Step 2: Restoring backup using @utexo/rgb-sdk-rn...');
    
    const dataDir = `${RNFS.DocumentDirectoryPath}/restored-wallet`;
    await RNFS.mkdir(dataDir);
    
    await restoreFromBackup({
        backupFilePath,
        password: backupPassword,
        dataDir
    });
    
    console.log('Wallet restored to:', dataDir);
    
    // ============================================
    // STEP 3: Initialize wallet using @utexo/rgb-sdk-rn
    // ============================================
    console.log('Step 3: Initializing wallet using @utexo/rgb-sdk-rn...');
    
    const wallet = new WalletManager({
        xpubVan: keys.accountXpubVanilla,
        xpubCol: keys.accountXpubColored,
        masterFingerprint: keys.masterFingerprint,
        mnemonic: keys.mnemonic,
        network: 'testnet',
        dataDir: dataDir,
        transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
        indexerUrl: 'ssl://electrum.iriswallet.com:50013'
    });
    
    // Initialize wallet (async)
    await wallet.initialize();
    
    // Get wallet address
    const address = await wallet.getAddress();
    console.log('Wallet address:', address);
    
    // Get BTC balance (async)
    const btcBalance = await wallet.getBtcBalance();
    console.log('BTC Balance:', btcBalance);
    
    // List assets (async)
    const assets = await wallet.listAssets();
    console.log('Assets:', assets);
    
    console.log('Migration complete! Your RGB state is now stored locally.');
}

migrateFromRgbSdkRnToUtexo().catch(console.error);
```

### Key Changes Summary

#### Breaking Changes

1. **Package Name**: Changed from `rgb-sdk-rn` to `@utexo/rgb-sdk-rn`

2. **Property Names**: Changed from `snake_case` to `camelCase`:
   - `xpub_van` → `xpubVan`
   - `xpub_col` → `xpubCol`
   - `master_fingerprint` → `masterFingerprint`
   - `account_xpub_vanilla` → `accountXpubVanilla`
   - `account_xpub_colored` → `accountXpubColored`
   - `rgb_node_endpoint` → removed (no longer needed)

3. **Method Parameters**: Changed from `snake_case` to `camelCase`:
   - `up_to` → `upTo`
   - `fee_rate` → `feeRate`
   - `signed_psbt` → `signedPsbt`
   - `min_confirmations` → `minConfirmations`
   - `asset_id` → `assetId`

4. **Method Changes**:
   - `registerWallet()` → `initialize()` (now async, must be called explicitly)
   - All methods remain async (unlike Node.js version)

5. **Backup/Restore**:
   - `createBackup()` now requires `backupPath` parameter
   - `restoreFromBackup()` is now a top-level async function (must be called before creating wallet)
   - Backup filename automatically includes master fingerprint

6. **New Required Parameters**:
   - `transportEndpoint` - RGB transport endpoint (optional, has default)
   - `indexerUrl` - Bitcoin indexer URL (optional, has defaults per network)
   - `dataDir` - Local directory for wallet data (optional, defaults to app data directory)

7. **Return Values**: Changed from `snake_case` to `camelCase`:
   - `getXpub()` returns `{ xpubVan, xpubCol }` instead of `{ xpub_van, xpub_col }`
   - `estimateFeeRate()` returns `feeRate` instead of `fee_rate`

#### What Stays the Same

- Wallet keys (mnemonic, xpubs, master fingerprint) remain the same
- Asset balances and transfer history are preserved
- All RGB assets and allocations are maintained
- All methods remain async (React Native requirement)

### Troubleshooting

#### Backup file not found
- Ensure you've downloaded the backup file from the `download_url` when using `rgb-sdk-rn`
- Verify the file path is correct
- In React Native, use `react-native-fs` or similar library for file operations

#### Restore directory doesn't exist
- Create the directory before calling `restoreFromBackup()`
- Ensure you have write permissions to the directory
- Use `RNFS.mkdir()` or similar to create directories in React Native

#### Wallet not found after restore
- Verify the `dataDir` in `WalletManager` matches the `dataDir` used in `restoreFromBackup()`
- Check that the restore completed successfully
- Ensure `initialize()` is called after creating the wallet instance

#### Indexer connection issues
- Verify the `indexerUrl` is correct for your network
- Check network connectivity
- Default indexer URLs are provided, but you can override them

### Next Steps

After migration:

1. Test your wallet by checking balances and listing assets
2. Verify all your RGB assets are present
3. Test a transfer to ensure everything works correctly
4. Remove the old RGB Node server dependency if no longer needed
5. Update your app to use the new package name in all imports

For more information, see the [README.md](./Readme.md).
