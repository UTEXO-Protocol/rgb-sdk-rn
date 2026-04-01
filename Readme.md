
# SDK Overview

This is the **React Native SDK** for RGB client applications. It provides a complete set of TypeScript/React Native bindings for managing RGB-based transfers using **local rgb-lib** (native bindings).

> **Note**: This is the React Native version of the [original RGB SDK for Node.js](https://github.com/UTEXO-Protocol/rgb-sdk). If you're building a Node.js application, use the original SDK instead.


⚠️ **Security Notice**  
If you're migrating from the legacy `rgb-sdk-rn` (which relied on a remote RGB Node server), be aware that wallet metadata such as xpubs may have been exposed and this cannot be undone.

If you're upgrading from `rgb-sdk-rn` to `@utexo/rgb-sdk-rn`, see the **[Migration Guide](./MIGRATION.md)** for step-by-step instructions on moving your wallet state to local storage.

For full details on security implications and recommended actions, please read **[SECURITY.md](./SECURITY.md)**.

> **RGB Protocol**: This SDK uses the [`rgb-lib`](https://github.com/RGB-Tools/rgb-lib) binding library to interact with the RGB protocol. All operations are performed locally, providing full control over wallet data and operations.

---

## 🧰 What You Can Do with This Library

With this SDK, developers can:

- Generate RGB invoices
- Create and manage UTXOs
- Sign PSBTs using local private keys or hardware signing flows
- Fetch asset balances, transfer status, and other RGB-related state

---

## ⚙️ Capabilities of `rgb-sdk-rn` (via `UTEXOWallet`)

The primary wallet class is **`UTEXOWallet`**: construct it with a mnemonic (or seed) and optional `{ network, dataDir, vssServerUrl }`, then call `await wallet.initialize()` before use. It manages **two** underlying RGB wallets (Bitcoin L1 / “layer1” and the UTEXO layer) and combines standard RGB operations with UTEXO features (Lightning, on-chain bridge), matching the Node.js [`@utexo/rgb-sdk`](https://github.com/UTEXO-Protocol/rgb-sdk) API shape.

**Network preset:** `options.network` must be **`'mainnet'`** or **`'testnet'`** only (`UtxoNetworkPreset` in `@utexo/rgb-sdk-core`). There is no `regtest` / `signet` preset for `UTEXOWallet`. If you omit options, **`network` defaults to `'mainnet'`** (same as `new UTEXOWallet(mnemonic)` with no second argument). For **regtest**, **signet**, or **testnet4** RGB development, use **`WalletManager`** with the usual `network` string for rgb-lib.

| Method / function | Description |
|-------------------|-------------|
| `generateKeys(network?)` | Generate new wallet keys (mnemonic, xpubs, master fingerprint) – top-level function |
| `deriveKeysFromMnemonic(network, mnemonic)` | Derive wallet keys from an existing mnemonic |
| `deriveKeysFromSeed(network, seed)` | Derive wallet keys from a BIP39 seed |
| `getAddress()` | Get deposit address (async) |
| `getBtcBalance()` | Get on-chain BTC balance (async) |
| `getXpub()` | Get vanilla and colored xpubs |
| `getNetwork()` | Get current network |
| `listUnspents()` | List unspent UTXOs |
| `listAssets()` | List RGB assets held |
| `getAssetBalance(assetId)` | Get balance for a specific asset |
| `createUtxos({ num?, size?, upTo?, feeRate? })` | Create UTXOs (begin → sign → end; fee rate defaults apply) |
| `createUtxosBegin` / `createUtxosEnd` | Split UTXO creation for custom signing |
| `blindReceive` / `witnessReceive` | Receive flows |
| `issueAssetNia({...})` | Issue a Non-Inflationary Asset |
| `send` / `sendBegin` / `sendEnd` | RGB transfers |
| `signPsbt(psbt, mnemonic?)` | Sign PSBT |
| `signMessage` / `verifyMessage` | Schnorr message signing |
| `refreshWallet()` / `syncWallet()` | Sync and refresh |
| `listTransactions()` / `listTransfers(assetId?)` | History |
| `failTransfers(...)` | Mark waiting transfers as failed |
| `sendBtc` / `sendBtcBegin` / `sendBtcEnd` | BTC sends |
| `estimateFeeRate` / `estimateFee` | Fees |
| `decodeRGBInvoice` | Decode RGB invoice |
| `createBackup({ backupPath, password })` | Encrypted file backup (**layer1 + UTEXO** stores) |
| `vssBackup(config?, mnemonic?)` | VSS backup for **both** stores (config optional; derived from mnemonic + default server when omitted) |
| `vssBackupInfo(config?, mnemonic?)` | VSS backup status |
| `configureVssBackup(config)` | Auto VSS after state-changing operations (configures both stores) |
| `disableVssAutoBackup()` | Disable auto VSS on both stores |
| `UTEXOWallet.restoreFromVss(mnemonicOrSeed, targetDir, config?)` | **Static:** restore **both** stores from VSS before constructing a new `UTEXOWallet` |
| *On-chain bridge* | `onchainReceive`, `onchainSend` / `Begin` / `End`, `getOnchainSendStatus`, `listOnchainTransfers` |
| *Lightning* | `createLightningInvoice`, `payLightningInvoice` / `Begin` / `End`, `getLightningSendRequest`, `getLightningReceiveRequest`, `listLightningPayments`, etc. |

### `WalletManager` (low-level, single RGB wallet)

Use **`WalletManager`** when you only need one RGB wallet instance (one network) without UTEXO Bridge features. It exposes the same RGB/PSBT/VSS **per wallet** methods, but VSS and backups apply to **that** instance only—not the full layer1 + UTEXO pair. Prefer **`UTEXOWallet`** for production UTEXO apps and for VSS/file backup that must cover both stores.

### Standalone helpers

| Function | Description |
|----------|-------------|
| `generateKeys(network?)` | Generate keys (same role as `generateKeys` in `@utexo/rgb-sdk`) |
| `createWalletManager(params)` | `WalletManager` factory (advanced) |
| `restoreFromBackup({ backupFilePath, password, dataDir })` | Restore from a **single** encrypted backup file |
| `restoreFromVss(config, targetDir)` | Restore **one** wallet from VSS (used internally; full UTEXO restore uses `UTEXOWallet.restoreFromVss`) |

---

## 🧩 Notes for Custom Integration

- All RGB operations are handled **locally** using native `rgb-lib` bindings. No external RGB Node server is required.
- The SDK connects to Bitcoin indexers (Electrum servers) for blockchain data synchronization.
- Use **`UTEXOWallet`** for the same high-level model as [`@utexo/rgb-sdk`](https://github.com/UTEXO-Protocol/rgb-sdk) (Node): one mnemonic, two coordinated RGB wallets, VSS/backup across both, plus optional Lightning and on-chain bridge when the UTEXO Bridge API is configured.
- The `signPsbt` method is async and demonstrates how to integrate a signing flow using `bdk-rn`. This can be replaced with your own HSM or hardware wallet integration if needed.
- By using this SDK, developers have full control over:
  - Transfer orchestration
  - UTXO selection
  - Invoice lifecycle
  - Signing policy
  - Indexer and transport endpoint configuration

This pattern enables advanced use cases, such as:

- Integrating with third-party identity/auth layers
- Applying custom fee logic or batching
- Implementing compliance and audit tracking
- Self-hosting indexer and transport services

---

## 🌉 UTEXO Bridge Integration

**Lightning Network** and **Onchain bridge** features (available via `UTEXOWallet`) require the UTEXO Bridge API for cross-network transfers between Bitcoin L1, Lightning Network, and UTEXO layer.

### Bridge Configuration

- **Default endpoint**: `http://localhost:8081/`
- **Configure URL**:
  ```typescript
  import { bridgeAPI } from '@utexo/rgb-sdk-rn';
  
  bridgeAPI.setBaseUrl('https://bridge.example.com');
  ```

### Requirements

Lightning and onchain bridge methods depend on:
- UTEXO Bridge API service running and accessible
- Proper network configuration (mainnet, Lightning, UTEXO layer mappings)
- Supported asset mappings across networks

### Bridge-Dependent Methods

The following `UTEXOWallet` methods require UTEXO Bridge API:

**Lightning:**
- `createLightningInvoice()` - Create Lightning invoices
- `payLightningInvoice()` / `payLightningInvoiceBegin()` / `payLightningInvoiceEnd()` - Pay Lightning invoices
- `getLightningReceiveRequest()` - Track Lightning receives
- `getLightningSendRequest()` - Track Lightning sends

**Onchain (cross-network):**
- `onchainReceive()` - Receive assets via mainnet-to-UTEXO bridge
- `onchainSend()` / `onchainSendBegin()` / `onchainSendEnd()` - Send assets via UTEXO-to-mainnet bridge
- `getOnchainSendStatus()` - Track on-chain send status
- `listOnchainTransfers()` - List on-chain transfers

### Local-Only Methods

All RGB operations (asset issuance, transfers, UTXO management, etc.) work without the bridge and run entirely locally using native `rgb-lib` bindings—whether you use `WalletManager` or `UTEXOWallet`.

---

## Getting Started

### Prerequisites

This SDK uses local RGB library bindings and requires:

- **Bitcoin indexer**: Default URLs per network are defined in `@utexo/rgb-sdk-core` as `DEFAULT_INDEXER_URLS` (Electrum `ssl://` for most networks; Signet uses Esplora). You can override via **`WalletManager`** `indexerUrl`.
- **RGB transport**: Defaults per network are `DEFAULT_TRANSPORT_ENDPOINTS` in `@utexo/rgb-sdk-core`. Override via **`WalletManager`** `transportEndpoint`.

No external RGB Node server is required - all RGB operations run locally in your application.

### Installation

```bash
npm install @utexo/rgb-sdk-rn
```

### iOS Setup

The native Rust framework (`rgb_libFFI.xcframework`) is automatically downloaded during `postinstall`. 

```bash
cd ios && pod install
```

### Android Setup

The library requires `minSdkVersion` 24. Make sure your `android/build.gradle` includes JitPack if necessary for transitive dependencies:

```gradle
allprojects {
    repositories {
        maven { url 'https://jitpack.io' }
    }
}
```

### React Native Setup

This SDK is designed for React Native applications and uses native modules (via `bdk-rn`).

**Important Notes**:
- This is the **React Native counterpart** of [`@utexo/rgb-sdk`](https://github.com/UTEXO-Protocol/rgb-sdk) (Node.js). For Node backends or scripts, use that package.
- This library is not compatible with browser environments. It requires React Native's native module system.

### Basic Usage

Same pattern as [`@utexo/rgb-sdk`](https://github.com/UTEXO-Protocol/rgb-sdk) (Node), but import from `@utexo/rgb-sdk-rn`:

```javascript
const { UTEXOWallet, generateKeys } = require('@utexo/rgb-sdk-rn');

// Keys for the same Bitcoin network family as the UTEXO preset (here: testnet)
const keys = await generateKeys('testnet');
const wallet = new UTEXOWallet(keys.mnemonic, {
  network: 'testnet', // required: 'testnet' | 'mainnet' for UTEXOWallet
  // Optional: dataDir, vssServerUrl — see `ConfigOptions` in `@utexo/rgb-sdk-core`
});
await wallet.initialize();

const address = await wallet.getAddress();
const balance = await wallet.getBtcBalance();
await wallet.dispose();
```

Minimal form (defaults to **mainnet** preset):

```javascript
const wallet = new UTEXOWallet(mnemonic);
await wallet.initialize();
```

For a **single** RGB wallet, custom `indexerUrl` / `transportEndpoint`, or **regtest** / **signet** / **testnet4**, use **`WalletManager`** (see **WalletManager (low-level, single RGB wallet)** under Capabilities above).

### Example (matches typical app smoke tests)

`UTEXOWallet` with only a mnemonic uses the **mainnet** preset by default (`ConfigOptions.network` defaults to `'mainnet'`):

```javascript
const wallet = new UTEXOWallet(mnemonic);
await wallet.initialize();
```

Use `{ network: 'testnet' }` for the testnet preset. A full app may combine this with `generateKeys`, `WalletManager`, and VSS helpers—see your integration test screen (e.g. a `flows` / SDK test tab that imports `UTEXOWallet`, `generateKeys`, and `createWalletManager` from `@utexo/rgb-sdk-rn`).

---

## Configuration

### Default Indexer URLs

These match **`DEFAULT_INDEXER_URLS`** in `@utexo/rgb-sdk-core` (used when **`WalletManager`** does not set `indexerUrl`):

| Network | Default indexer URL |
|--------|---------------------|
| **mainnet** | `ssl://electrum.iriswallet.com:50003` |
| **testnet** | `ssl://electrum.iriswallet.com:50013` |
| **testnet4** | `ssl://electrum.iriswallet.com:50053` |
| **signet** | `https://esplora-api.utexo.com` |
| **regtest** | `tcp://regtest.thunderstack.org:50001` |

**`UTEXOWallet`** does **not** pick from this table directly; it uses the **`mainnet`** or **`testnet`** preset from `getUtxoNetworkConfig` in `@utexo/rgb-sdk-core`. To use the defaults above explicitly, or to override them, use **`WalletManager`** and pass `indexerUrl` / `transportEndpoint` in its constructor.

### Default RGB transport endpoints

These match **`DEFAULT_TRANSPORT_ENDPOINTS`** in `@utexo/rgb-sdk-core` (used when **`WalletManager`** does not set `transportEndpoint`):

| Network | Default transport URL |
|--------|------------------------|
| **mainnet** | `rpcs://rgb-proxy-mainnet.utexo.com/json-rpc` |
| **testnet** | `rpcs://rgb-proxy-testnet3.utexo.com/json-rpc` |
| **testnet4** | `rpcs://proxy.iriswallet.com/0.2/json-rpc` |
| **signet** | `rpcs://rgb-proxy-utexo.utexo.com/json-rpc` |
| **regtest** | `rpcs://proxy.iriswallet.com/0.2/json-rpc` |

---

## Core Workflows

### Wallet Initialization

```javascript
const { UTEXOWallet, generateKeys, deriveKeysFromMnemonic } = require('@utexo/rgb-sdk-rn');

// Generate keys and open UTEXO (preset: testnet or mainnet only)
const keys = await generateKeys('testnet');
const wallet = new UTEXOWallet(keys.mnemonic, { network: 'testnet' });
await wallet.initialize();

// From an existing mnemonic
const restoredKeys = await deriveKeysFromMnemonic('testnet', 'abandon abandon abandon...');
const restoredWallet = new UTEXOWallet(restoredKeys.mnemonic, { network: 'testnet' });
await restoredWallet.initialize();

// Second instance (same mnemonic, same preset)
const wallet2 = new UTEXOWallet(keys.mnemonic, { network: 'testnet' });
await wallet2.initialize();
```

### UTXO Management

```javascript
// Step 1: Begin UTXO creation
const psbt = await wallet.createUtxosBegin({
    upTo: true,
    num: 5,
    size: 1000,
    feeRate: 1
});

// Step 2: Sign the PSBT (async operation)
const signedPsbt = await wallet.signPsbt(psbt);

// Step 3: Finalize UTXO creation
const utxosCreated = await wallet.createUtxosEnd({ signedPsbt });
console.log(`Created ${utxosCreated} UTXOs`);
```

### Asset Issuance

```javascript
// Issue a new NIA
const asset = await wallet.issueAssetNia({
    ticker: "USDT",
    name: "Tether USD",
    amounts: [1000, 500],
    precision: 6
});

console.log('Asset issued:', asset.asset?.assetId);
```

### Asset Transfers

```javascript
// Create blind receive for receiving wallet
const receiveData = await receiverWallet.blindReceive({
    assetId: assetId,
    amount: 100
});

// Step 1: Begin asset transfer
const sendPsbt = await senderWallet.sendBegin({
    invoice: receiveData.invoice,
    feeRate: 1,
    minConfirmations: 1
});

// Step 2: Sign the PSBT (async operation)
const signedSendPsbt = await senderWallet.signPsbt(sendPsbt);

// Step 3: Finalize transfer
const sendResult = await senderWallet.sendEnd({ 
    signedPsbt: signedSendPsbt 
});

// Alternative: Complete send in one call
const sendResult2 = await senderWallet.send({
    invoice: receiveData.invoice,
    feeRate: 1,
    minConfirmations: 1
});

// Refresh both wallets to sync the transfer
await senderWallet.refreshWallet();
await receiverWallet.refreshWallet();
```

### BTC Transfers

```javascript
// Send BTC using the complete flow
const txid = await wallet.sendBtc({
    recipient: 'bc1q...',
    amount: 10000, // satoshis
    feeRate: 1,
    minConfirmations: 1
});

// Or use the step-by-step approach
const btcPsbt = await wallet.sendBtcBegin({
    recipient: 'bc1q...',
    amount: 10000,
    feeRate: 1,
    minConfirmations: 1
});
const signedBtcPsbt = await wallet.signPsbt(btcPsbt);
const btcTxid = await wallet.sendBtcEnd({ signedPsbt: signedBtcPsbt });
```

### Fee Estimation

```javascript
// Get fee rate estimation for target block confirmation
const feeEstimate = await wallet.estimateFeeRate(6); // 6 blocks
console.log('Fee rate:', feeEstimate.feeRate);

// Estimate fee for a specific PSBT
const psbtFee = await wallet.estimateFee(psbtBase64);
console.log('Estimated fee:', psbtFee.fee, 'satoshis');
```

### Invoice Decoding

```javascript
// Decode an RGB invoice to see transfer parameters
const decoded = await wallet.decodeRGBInvoice({
    invoice: 'rgb1:...'
});
console.log('Transfer details:', decoded);
```

### Wallet Information

```javascript
// Get wallet's extended public keys
const xpubs = wallet.getXpub();
console.log('Vanilla xpub:', xpubs.xpubVan);
console.log('Colored xpub:', xpubs.xpubCol);

// Get wallet's network
const network = wallet.getNetwork();
console.log('Network:', network);
```

### Simplified UTXO Creation

```javascript
// Create UTXOs in one call (begin → sign → end)
const utxosCreated = await wallet.createUtxos({
    upTo: true,
    num: 5,
    size: 1000,
    feeRate: 1
});
console.log(`Created ${utxosCreated} UTXOs`);
```

### Balance and Asset Management

```javascript
// Get BTC balance
const btcBalance = await wallet.getBtcBalance();

// List all assets
const assets = await wallet.listAssets();

// Get specific asset balance
const assetBalance = await wallet.getAssetBalance(assetId);

// List unspent UTXOs
const unspents = await wallet.listUnspents();

// List transactions
const transactions = await wallet.listTransactions();

// List transfers for specific asset
const transfers = await wallet.listTransfers(assetId);
```

---

## Setup wallet and issue asset

```javascript
const { UTEXOWallet, generateKeys } = require('@utexo/rgb-sdk-rn');

async function demo() {
    // 1. Generate and initialize wallet (UTEXOWallet: 'testnet' | 'mainnet' only)
    const keys = await generateKeys('testnet');
    const wallet = new UTEXOWallet(keys.mnemonic, { network: 'testnet' });

    // 2. Initialize and connect to indexer
    await wallet.initialize();

    // 3. Get address and balance
    const address = await wallet.getAddress();

    // TODO: Send some BTC to this address for fees and UTXO creation
    const balance = await wallet.getBtcBalance();

    // 4. Create UTXOs 
    const psbt = await wallet.createUtxosBegin({
        upTo: true,
        num: 5,
        size: 1000,
        feeRate: 1
    });
    const signedPsbt = await wallet.signPsbt(psbt); // Async operation
    const utxosCreated = await wallet.createUtxosEnd({ signedPsbt });

    // 5. Issue asset
    const asset = await wallet.issueAssetNia({
        ticker: "DEMO",
        name: "Demo Token",
        amounts: [1000],
        precision: 2
    });

    // 6. List assets and balances
    const assets = await wallet.listAssets();
    const assetBalance = await wallet.getAssetBalance(asset.asset?.assetId);

    // Wallet is ready to send/receive RGB assets
    await wallet.dispose();
}
```

---

## Security

### Key Management

```javascript
const {
  UTEXOWallet,
  generateKeys,
  deriveKeysFromMnemonic,
  signMessage,
  verifyMessage,
} = require('@utexo/rgb-sdk-rn');

// Generate new wallet keys
const keys = await generateKeys('testnet');
const mnemonic = keys.mnemonic;
const xpub = keys.xpub; // Extended public key

// Store mnemonic securely for later restoration
// Use environment variables for production
const storedMnemonic = process.env.WALLET_MNEMONIC;

// Restore keys from mnemonic
const restoredKeys = await deriveKeysFromMnemonic('testnet', storedMnemonic);

// Sign and verify arbitrary messages (Schnorr signatures)
// Option 1: Using UTEXOWallet (mnemonic string or Uint8Array BIP39 seed)
const wallet = new UTEXOWallet(keys.mnemonic, { network: 'testnet' });
await wallet.initialize();
const signature = await wallet.signMessage('Hello RGB!');
const okFromWallet = await wallet.verifyMessage('Hello RGB!', signature);

// Option 2: Using standalone functions (no wallet instance)
const seedHex = process.env.WALLET_SEED_HEX; // 64-byte hex string
const { signature: sig2, accountXpub } = await signMessage({
  message: 'Hello RGB!',
  seed: seedHex,
  network: 'testnet',
});
const okStandalone = await verifyMessage({
  message: 'Hello RGB!',
  signature: sig2,
  accountXpub,
  network: 'testnet',
});
```

### Backup and Restore

> **Backup modes:** **`UTEXOWallet`** supports **local (file) backups** (encrypted files on disk) and **VSS backups** (state persisted to a remote Versioned Storage Service). For UTEXO, both the layer1 and UTEXO RGB stores are included—same idea as [`@utexo/rgb-sdk`](https://github.com/UTEXO-Protocol/rgb-sdk). The recommended strategy is to use VSS and invoke `vssBackup()` after any state-changing operation (e.g. UTXO creation, asset issuance, transfers) so the latest state is recoverable.
>
> **Concurrency constraint:** Do **not** run restores while any wallet instance is online. At most one instance of a given wallet should ever be connected to the indexer/VSS; before calling any restore function, ensure all instances for that wallet are offline.

#### File backup

```javascript
import RNFS from 'react-native-fs';
import { UTEXOWallet, generateKeys } from '@utexo/rgb-sdk-rn';

const keys = await generateKeys('testnet');
const wallet = new UTEXOWallet(keys.mnemonic, { network: 'testnet' });
await wallet.initialize();

// Encrypted backups for layer1 + UTEXO (both stores written under backupPath; rgb-lib file names)
const backup = await wallet.createBackup({
  backupPath: `${RNFS.DocumentDirectoryPath}/backups`,
  password: 'secure-password',
});
console.log('Backup folder:', backup.backupPath);
```

Restoring those files into app storage and opening the wallet again follows the same **layer1 + UTEXO** layout as the Node SDK; see the **Backup and Restore** section in [`@utexo/rgb-sdk` Readme](https://github.com/UTEXO-Protocol/rgb-sdk/blob/dev/Readme.md) for the full file-restore flow. For a **single** `WalletManager` backup file, use `restoreFromBackup` and a `WalletManager` with matching `dataDir`, as in earlier releases.

#### VSS cloud backup (`UTEXOWallet`)

This mirrors the VSS examples in [`@utexo/rgb-sdk`](https://github.com/UTEXO-Protocol/rgb-sdk): optional VSS `config` is derived from the mnemonic and default server when you omit it.

```javascript
import RNFS from 'react-native-fs';
import { UTEXOWallet, generateKeys } from '@utexo/rgb-sdk-rn';

const keys = await generateKeys('testnet');
const wallet = new UTEXOWallet(keys.mnemonic, {
  network: 'testnet',
  // Optional override; otherwise the default from `@utexo/rgb-sdk-core` is used
  vssServerUrl: 'https://vss-server.utexo.com/vss',
});
await wallet.initialize();

// Upload both stores (layer1 + UTEXO) — config optional when using the wallet mnemonic
const version = await wallet.vssBackup();
console.log('VSS backup version:', version);

const info = await wallet.vssBackupInfo();
console.log('Backup exists:', info.backupExists);
console.log('Server version:', info.serverVersion);
console.log('Backup required:', info.backupRequired);

// Optional: full `VssBackupConfig` if you manage server URL / store / signing key yourself
// (TypeScript: `signingKey` in `@utexo/rgb-sdk-core`; native layer maps it as needed)
// await wallet.vssBackup({ serverUrl, storeId, signingKey, encryptionEnabled: true, backupMode: 'Async' });

// Auto-backup: pass a full `VssBackupConfig` with `autoBackup: true` (same fields as `vssBackup` when not using defaults)
// await wallet.configureVssBackup({ ...vssConfig, autoBackup: true });

await wallet.disableVssAutoBackup();

// Restore from VSS — call before creating a new UTEXOWallet that should load this data
const vssBaseDir = `${RNFS.DocumentDirectoryPath}/vss-restore`;
await UTEXOWallet.restoreFromVss(keys.mnemonic, vssBaseDir);

const restored = new UTEXOWallet(keys.mnemonic, {
  network: 'testnet',
  dataDir: vssBaseDir,
});
await restored.initialize();
```

`UTEXOWallet.restoreFromVss` writes into `vssBaseDir/layer1` and `vssBaseDir/utexo`. Pass the **same** `dataDir` (`vssBaseDir`) when constructing `UTEXOWallet` so both stores load consistently (see `ConfigOptions` in `@utexo/rgb-sdk-core`).

---

## Demo App

A full working demo app is available at **[rgb-sdk-rn-demo](https://github.com/RGB-OS/rgb-sdk-rn-demo)**. It demonstrates the complete SDK functionality in an Expo/React Native application, including:

- **Wallet flow**: Key generation, wallet initialization, UTXO creation, NIA/IFA asset issuance, blind/witness transfers, BTC sends, and backup/restore
- **UTEXO flow**: Lightning Network payments (`createLightningInvoice`, `payLightningInvoice`) and on-chain bridge transfers (`onchainReceive`, `onchainSend`)
- **VSS cloud backup flow**: Full lifecycle — upload backup, query status, configure auto-backup, restore from VSS, and verify restored state
- **Key derivation**: `generateKeys`, `deriveKeysFromMnemonic`, `deriveKeysFromSeed`, `signMessage`/`verifyMessage`

### Running the Demo

```bash
git clone https://github.com/RGB-OS/rgb-sdk-rn-demo.git
cd rgb-sdk-rn-demo
npm install
npm run prebuild
cd ios && LANG=en_US.UTF-8 pod install && cd ..
npm run ios:release    # or npm run android:release
```

---

