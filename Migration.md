# Migration Guide: rgb-sdk-rn to @utexo/rgb-sdk-rn

This guide explains how to migrate from the `rgb-sdk-rn` package to `@utexo/rgb-sdk-rn`. The new package uses local `rgb-lib` instead of requiring an RGB Node server.

## 🔐 Privacy Recommendation (Important)

If you are migrating from `rgb-sdk-rn` to `@utexo/rgb-sdk-rn` it is important to understand the privacy implications of the legacy architecture.

Version 1 relied on an RGB Node server, which means that wallet metadata (such as extended public keys and transaction graph information) may have been exposed to the node operator. This exposure is permanent and cannot be reversed by upgrading software alone.

## Recommended approach (if privacy matters)

If wallet privacy is important to you, we strongly recommend:
- Creating a brand new wallet with a new seed phrase in  `@utexo/rgb-sdk-rn`
- Migrating assets from the old wallet to the new wallet using standard RGB transfers
- Discontinuing use of the old seed phrase and xpubs

This is the only way to fully eliminate historical metadata exposure.

## Alternative (state migration)

The migration steps below restore wallet state using the same seed phrase and preserve balances and history. This approach is safe from a funds perspective, but it does not remove prior privacy exposure.

Choose the approach that best matches your threat model.

## Overview

`@utexo/rgb-sdk-rn` uses `rgb-lib` directly via native bindings, eliminating the need for an RGB Node server. All wallet data is now stored locally. To migrate, you need to:

1. Create a backup of your wallet state using `rgb-sdk-rn`
2. Restore the backup using `@utexo/rgb-sdk-rn` to a local directory
3. Initialize your wallet in `@utexo/rgb-sdk-rn` pointing to the restored directory

## Step 1: Backup Wallet State

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

## Step 2: Restore Wallet

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

## Step 3: Initialize Wallet

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

## Complete Migration Example

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

## Key Changes Summary

### Breaking Changes

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

### What Stays the Same

- Wallet keys (mnemonic, xpubs, master fingerprint) remain the same
- Asset balances and transfer history are preserved
- All RGB assets and allocations are maintained
- All methods remain async (React Native requirement)

## Troubleshooting

### Backup file not found
- Ensure you've downloaded the backup file from the `download_url` when using `rgb-sdk-rn`
- Verify the file path is correct
- In React Native, use `react-native-fs` or similar library for file operations

### Restore directory doesn't exist
- Create the directory before calling `restoreFromBackup()`
- Ensure you have write permissions to the directory
- Use `RNFS.mkdir()` or similar to create directories in React Native

### Wallet not found after restore
- Verify the `dataDir` in `WalletManager` matches the `dataDir` used in `restoreFromBackup()`
- Check that the restore completed successfully
- Ensure `initialize()` is called after creating the wallet instance

### Indexer connection issues
- Verify the `indexerUrl` is correct for your network
- Check network connectivity
- Default indexer URLs are provided, but you can override them

## Next Steps

After migration:

1. Test your wallet by checking balances and listing assets
2. Verify all your RGB assets are present
3. Test a transfer to ensure everything works correctly
4. Remove the old RGB Node server dependency if no longer needed
5. Update your app to use the new package name in all imports

For more information, see the [README.md](./Readme.md).
