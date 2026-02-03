
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

## ⚙️ Capabilities of `rgb-sdk-rn` (via `WalletManager`)

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize wallet and connect to indexer |
| `goOnline(indexerUrl, skipConsistencyCheck?)` | Connect wallet to an indexer service |
| `getBtcBalance()` | Get on-chain BTC balance |
| `getAddress()` | Get a derived deposit address |
| `getXpub()` | Get wallet's extended public keys (xpubVan, xpubCol) |
| `getNetwork()` | Get wallet's network |
| `listUnspents()` | List unspent UTXOs |
| `listAssets()` | List RGB assets held |
| `getAssetBalance(assetId)` | Get balance for a specific asset |
| `createUtxosBegin({ upTo, num, size, feeRate })` | Start creating new UTXOs |
| `createUtxosEnd({ signedPsbt })` | Finalize UTXO creation with a signed PSBT |
| `createUtxos({ upTo, num, size, feeRate })` | Complete UTXO creation: begin → sign → end |
| `blindReceive({ assetId, amount })` | Generate blinded UTXO for receiving |
| `witnessReceive({ assetId, amount })` | Generate witness UTXO for receiving |
| `issueAssetNia({...})` | Issue a new Non-Inflationary Asset |
| `signPsbt(psbt, mnemonic?)` | Sign PSBT using mnemonic/seed (async) |
| `signMessage(message)` | Produce a Schnorr signature for an arbitrary message (requires seed) |
| `verifyMessage(message, signature, accountXpub?)` | Verify Schnorr message signatures |
| `refreshWallet()` | Sync and refresh wallet state |
| `syncWallet()` | Trigger wallet sync without additional refresh logic |
| `listTransactions()` | List BTC-level transactions |
| `listTransfers(assetId)` | List RGB transfer history for asset |
| `failTransfers(...)` | Mark expired transfers as failed |
| `sendBegin(...)` | Prepare an RGB asset transfer (build unsigned PSBT) |
| `sendEnd(...)` | Submit signed PSBT to complete RGB asset transfer |
| `send(...)` | Complete RGB asset send operation: begin → sign → end |
| `sendBtcBegin(...)` | Prepare a BTC send (build unsigned PSBT) |
| `sendBtcEnd({ signedPsbt })` | Submit signed PSBT to complete BTC send |
| `sendBtc(...)` | Complete BTC send operation: begin → sign → end |
| `estimateFeeRate(blocks)` | Get fee estimation for target block confirmation |
| `estimateFee(psbtBase64)` | Estimate fee for a PSBT |
| `decodeRGBInvoice({ invoice })` | Decode RGB invoice to transfer parameters |
| `createBackup(password, backupPath)` | Create an encrypted wallet backup file |
| `restoreFromBackup({ backupFilePath, password, dataDir })` | Restore wallet state from a backup file |

### Standalone Functions (not WalletManager methods)

| Function | Description |
|----------|-------------|
| `createWallet(network)` | Generate new wallet keypair with mnemonic/xpub/master fingerprint |
| `createWalletManager(params)` | Factory function to create WalletManager instance |
| `generateKeys(network)` | Generate new wallet keypair (same as createWallet) |
| `deriveKeysFromMnemonic(network, mnemonic)` | Derive wallet keys (xpub) from existing mnemonic |
| `deriveKeysFromSeed(network, seed)` | Derive wallet keys (xpub) directly from a BIP39 seed |

---

## 🧩 Notes for Custom Integration

- All RGB operations are handled **locally** using native `rgb-lib` bindings. No external RGB Node server is required.
- The SDK connects to Bitcoin indexers (Electrum servers) for blockchain data synchronization.
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

## Getting Started

### Prerequisites

This SDK uses local RGB library bindings and requires:

- **Bitcoin Indexer**: The SDK connects to Electrum servers for blockchain data. Default indexer URLs are provided for each network, but you can configure custom ones.
- **Transport Endpoint**: For RGB protocol communication (default: `rpcs://proxy.iriswallet.com/0.2/json-rpc`)

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
- This is the **React Native version** of the [RGB SDK](https://github.com/RGB-OS/rgb-sdk). For Node.js applications, use the original SDK.
- This library is not compatible with browser environments. It requires React Native's native module system.

### Basic Usage

```javascript
const { WalletManager, createWallet } = require('@utexo/rgb-sdk-rn');

// 1. Generate wallet keys
const keys = await createWallet('regtest');
console.log('Master Fingerprint:', keys.masterFingerprint);
console.log('Master XPub:', keys.xpub); // Store securely!

// 2. Initialize wallet (constructor-based)
const wallet = new WalletManager({
    xpubVan: keys.accountXpubVanilla,
    xpubCol: keys.accountXpubColored,
    masterFingerprint: keys.masterFingerprint,
    mnemonic: keys.mnemonic,
    network: 'regtest',
    // Optional: customize indexer URL (defaults provided per network)
    indexerUrl: 'tcp://regtest.thunderstack.org:50001',
    // Optional: customize transport endpoint
    transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc'
});

// 3. Initialize and connect to indexer
await wallet.initialize();

// 4. Get wallet address
const address = await wallet.getAddress();
console.log('Wallet address:', address);

// 5. Check balance
const balance = await wallet.getBtcBalance();
console.log('BTC Balance:', balance);
```

---

## Configuration

### Default Indexer URLs

The SDK provides default Electrum indexer URLs for each network:

- **mainnet**: `ssl://electrum.iriswallet.com:50003`
- **testnet**: `ssl://electrum.iriswallet.com:50013`
- **testnet4**: `ssl://electrum.iriswallet.com:50053`
- **signet**: `tcp://46.224.75.237:50001`
- **regtest**: `tcp://regtest.thunderstack.org:50001`

You can override these by providing a custom `indexerUrl` when creating a `WalletManager` instance.

### Default Transport Endpoint

The default transport endpoint for RGB protocol communication is:
- `rpcs://proxy.iriswallet.com/0.2/json-rpc`

You can override this by providing a custom `transportEndpoint` when creating a `WalletManager` instance.

---

## Core Workflows

### Wallet Initialization

```javascript
const { WalletManager, createWallet } = require('@utexo/rgb-sdk-rn');

// Generate new wallet keys
const keys = await createWallet('regtest');

// Initialize wallet with keys (constructor-based - recommended)
const wallet = new WalletManager({
    xpubVan: keys.accountXpubVanilla,
    xpubCol: keys.accountXpubColored,
    masterFingerprint: keys.masterFingerprint,
    mnemonic: keys.mnemonic,
    network: 'regtest', // 'mainnet', 'testnet', 'signet', or 'regtest'
    // Optional: customize indexer URL
    indexerUrl: 'tcp://regtest.thunderstack.org:50001',
    // Optional: customize transport endpoint
    transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc'
});

// Initialize and connect to indexer
await wallet.initialize();

// Alternative: Derive keys from existing mnemonic
const { deriveKeysFromMnemonic } = require('@utexo/rgb-sdk-rn');
const restoredKeys = await deriveKeysFromMnemonic('testnet', 'abandon abandon abandon...');
const restoredWallet = new WalletManager({
    xpub_van: restoredKeys.account_xpub_vanilla,
    xpub_col: restoredKeys.account_xpub_colored,
    master_fingerprint: restoredKeys.master_fingerprint,
    mnemonic: restoredKeys.mnemonic,
    network: 'testnet',
    // Uses default testnet indexer: 'ssl://electrum.iriswallet.com:50013'
});
await restoredWallet.initialize();

// Alternative: Using factory function
const { createWalletManager } = require('@utexo/rgb-sdk-rn');
const wallet2 = createWalletManager({
    xpubVan: keys.accountXpubVanilla,
    xpubCol: keys.accountXpubColored,
    masterFingerprint: keys.masterFingerprint,
    mnemonic: keys.mnemonic,
    network: 'regtest',
});
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
const { WalletManager, createWallet } = require('@utexo/rgb-sdk-rn');

async function demo() {
    // 1. Generate and initialize wallet
    const keys = await createWallet('regtest');
    const wallet = new WalletManager({
        xpubVan: keys.accountXpubVanilla,
        xpubCol: keys.accountXpubColored,
        masterFingerprint: keys.masterFingerprint,
        mnemonic: keys.mnemonic,
        network: 'regtest',
        indexerUrl: 'tcp://regtest.thunderstack.org:50001'
    });

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
}
```

---

## Security

### Key Management

```javascript
const { createWallet, deriveKeysFromMnemonic } = require('@utexo/rgb-sdk-rn');

// Generate new wallet keys
const keys = await createWallet('testnet');
const mnemonic = keys.mnemonic;
const xpub = keys.xpub; // Extended public key

// Store mnemonic securely for later restoration
// Use environment variables for production
const storedMnemonic = process.env.WALLET_MNEMONIC;

// Restore keys from mnemonic
const restoredKeys = await deriveKeysFromMnemonic('testnet', storedMnemonic);

// Sign and verify arbitrary messages (Schnorr signatures)
// Option 1: Using WalletManager (requires wallet initialized with seed)
const wallet = new WalletManager({
  xpubVan: keys.accountXpubVanilla,
  xpubCol: keys.accountXpubColored,
  masterFingerprint: keys.masterFingerprint,
  seed: seedBytes, // Uint8Array seed
  network: 'testnet',
  indexerUrl: 'ssl://electrum.iriswallet.com:50013'
});
await wallet.initialize();
const signature = await wallet.signMessage('Hello RGB!');
const isValid = await wallet.verifyMessage('Hello RGB!', signature);

// Option 2: Using standalone functions
const { signMessage, verifyMessage } = require('@utexo/rgb-sdk-rn');
const seedHex = process.env.WALLET_SEED_HEX; // 64-byte hex string
const { signature, accountXpub } = await signMessage({
  message: 'Hello RGB!',
  seed: seedHex,
  network: 'testnet',
});
const isValid = await verifyMessage({
  message: 'Hello RGB!',
  signature,
  accountXpub,
  network: 'testnet',
});
```

---


