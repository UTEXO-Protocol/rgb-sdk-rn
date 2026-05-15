
# RGB SDK for React Native

React Native SDK for RGB client applications. Provides TypeScript/React Native bindings for managing RGB assets and Lightning payments through the **RGB Lightning Node (RLN)** — a native LDK-based node that runs directly on-device.

> **Note**: This is the React Native version of the [original RGB SDK for Node.js](https://github.com/UTEXO-Protocol/rgb-sdk). If you're building a Node.js application, use the original SDK instead.

---

## What You Can Do

- Run a full Lightning node on-device (iOS and Android) via RLN
- Open Lightning channels and send/receive BTC or RGB asset payments
- Issue, transfer, and manage RGB assets (NIA, CFA, IFA, UDA)
- Manage UTXOs and BTC on-chain sends
- Use a hardware-wallet–style **external signer** or a simple **password signer**
- Restart the node on the same `UTEXOWallet` instance without recreating anything

---

## Primary Class: `UTEXOWallet`

`UTEXOWallet` implements `IWalletManager` + `IUTEXOProtocol` and is backed by an on-device RLN node. It owns the node lifecycle, abstracts signer authentication, and exposes the full RGB Lightning API surface.

### Construction

```typescript
import {
  UTEXOWallet,
  NativeExternalRLNSigner,
  PasswordRLNSigner,
  generateKeys,
  type UTEXOWalletNodeParams,
} from '@utexo/rgb-sdk-rn';

const keys = await generateKeys('regtest');

const wallet = new UTEXOWallet(
  {
    storageDirPath: '/path/to/node-storage',
    daemonListeningPort: 9735,
    ldkPeerListeningPort: 9736,
    network: 'regtest',           // any Bitcoin network string
    maxMediaUploadSizeMb: 20,     // optional, default 20
    enableVirtualChannelsV0: false, // optional
    xpubVan: keys.accountXpubVanilla,
    xpubCol: keys.accountXpubColored,
    masterFingerprint: keys.masterFingerprint,
  },
  new NativeExternalRLNSigner(keys.mnemonic, 'regtest'),
);
```

#### `UTEXOWalletNodeParams`

| Field | Type | Description |
|-------|------|-------------|
| `storageDirPath` | `string` | Directory where the node persists its data |
| `daemonListeningPort` | `number` | RLN daemon HTTP port |
| `ldkPeerListeningPort` | `number` | LDK peer-to-peer port |
| `network` | `string` | Bitcoin network (`'regtest'`, `'testnet'`, `'mainnet'`, …) |
| `maxMediaUploadSizeMb` | `number?` | Max media upload size in MB (default 20) |
| `enableVirtualChannelsV0` | `boolean?` | Enable virtual channel support |
| `xpubVan` | `string` | Vanilla (BTC) account xpub |
| `xpubCol` | `string` | Colored (RGB) account xpub |
| `masterFingerprint` | `string` | BIP32 master fingerprint |

---

### Signers

A signer encapsulates how keys are provided to the node. Pass one to the `UTEXOWallet` constructor; the wallet calls `initNode` on first use and `unlockNode` on every subsequent start automatically.

#### `NativeExternalRLNSigner` (recommended)

Uses a native hardware-style external signer. Keys never leave the device key store. Accepts a mnemonic string **or** raw BIP39 seed bytes.

```typescript
import { NativeExternalRLNSigner } from '@utexo/rgb-sdk-rn';

// From mnemonic
const signer = new NativeExternalRLNSigner(keys.mnemonic, 'regtest');

// From raw seed bytes
const signer = new NativeExternalRLNSigner(seedBytes, 'regtest');

// Optional: relax policy checks (useful for testing)
const signer = new NativeExternalRLNSigner(keys.mnemonic, 'regtest', true);
```

#### `PasswordRLNSigner`

Classic password-based auth. The mnemonic is only needed for first-time `init()` (written to disk), then cleared from memory.

```typescript
import { PasswordRLNSigner } from '@utexo/rgb-sdk-rn';

// mnemonic needed for first init; omit on subsequent unlock-only calls
const signer = new PasswordRLNSigner('my-secure-password', keys.mnemonic);

// Unlock only (no mnemonic — node already initialized)
const signer = new PasswordRLNSigner('my-secure-password');
```

---

### Lifecycle

A `UTEXOWallet` goes through four phases:

1. **`init()`** — First-time setup: starts the RLN node and writes key material to `storageDirPath`. Call once per new wallet.
2. **`unlock(params)`** — Every start (first time and restarts): connects the node to bitcoind, electrum, and the proxy. Must follow `init()` on the first run.
3. **`shutdown()`** — Graceful stop. Node state is preserved; the same instance can call `reinit()` later.
4. **`destroy()`** — Full teardown: shutdown + destroy node + release signer. Use in `finally` blocks or on logout.

`initialize()` is a backward-compatible alias for `init()`.

```typescript
const unlockParams = {
  bitcoindRpcUsername: 'user',
  bitcoindRpcPassword: 'password',
  bitcoindRpcHost: '127.0.0.1',
  bitcoindRpcPort: 18443,
  indexerUrl: '127.0.0.1:50001',
  proxyEndpoint: 'rpc://127.0.0.1:3000/json-rpc',
};

// First run
await wallet.init();
await wallet.unlock(unlockParams);

// ... use the wallet ...

// Graceful restart (same instance — no new UTEXOWallet needed)
await wallet.shutdown();
await wallet.reinit(unlockParams);   // restarts the RLN node + unlocks

// Final cleanup
await wallet.destroy();
```

#### `IRLNUnlockParams`

| Field | Type | Description |
|-------|------|-------------|
| `bitcoindRpcUsername` | `string` | Bitcoin RPC username |
| `bitcoindRpcPassword` | `string` | Bitcoin RPC password |
| `bitcoindRpcHost` | `string` | Bitcoin RPC host |
| `bitcoindRpcPort` | `number` | Bitcoin RPC port |
| `indexerUrl` | `string?` | Electrum indexer URL (e.g. `'127.0.0.1:50001'`) |
| `proxyEndpoint` | `string?` | RGB proxy endpoint (e.g. `'rpc://host:3000/json-rpc'`) |
| `announceAddresses` | `string[]?` | Public addresses to announce to the network |
| `announceAlias` | `string \| null?` | Node alias |

---

### Method Reference

#### IWalletManager — Balance & Address

| Method | Description |
|--------|-------------|
| `getBtcBalance()` | BTC balance (vanilla + colored) |
| `getAddress()` | Current on-chain deposit address |
| `getXpub()` | `{ xpubVan, xpubCol }` |
| `getNetwork()` | Configured network string |

#### IWalletManager — UTXO Management

| Method | Description |
|--------|-------------|
| `createUtxos({ upTo?, num?, size?, feeRate? })` | Create UTXOs (all-in-one) |
| `listUnspents()` | List unspent UTXOs with RGB allocations |

#### IWalletManager — Assets

| Method | Description |
|--------|-------------|
| `listAssets()` | All RGB assets (NIA, CFA, IFA, UDA) |
| `getAssetBalance(assetId)` | Balance for one asset |
| `issueAssetNia({ ticker, name, precision, amounts })` | Issue a Non-Inflationary Asset |
| `issueAssetIfa({ ticker, name, precision, amounts, inflationAmounts, rejectListUrl })` | Issue an Inflatable Asset |
| `send(params)` | RGB transfer (decodes invoice + sends) |
| `blindReceive(params)` | Create blinded RGB invoice |
| `witnessReceive(params)` | Create witness RGB invoice |
| `decodeRGBInvoice({ invoice })` | Decode an RGB invoice |

#### IWalletManager — BTC Sends

| Method | Description |
|--------|-------------|
| `sendBtc({ address, amount, feeRate, skipSync? })` | On-chain BTC send |

#### IWalletManager — Transactions & Transfers

| Method | Description |
|--------|-------------|
| `listTransactions()` | On-chain transaction history |
| `listTransfers(assetId?)` | RGB transfer history |
| `failTransfers(params)` | Mark pending transfers as failed |
| `refreshWallet()` | Refresh RGB transfer state |
| `syncWallet()` | Sync blockchain state |

#### IWalletManager — Fees & Backup

| Method | Description |
|--------|-------------|
| `estimateFeeRate(blocks)` | Fee rate estimate for target confirmation |
| `createBackup({ backupPath, password })` | Encrypted local backup |

#### IUTEXOProtocol — Lightning

| Method | Description |
|--------|-------------|
| `createLightningInvoice({ amountSats?, asset, expirySeconds? })` | Create a Lightning invoice |
| `payLightningInvoice({ lnInvoice, amount?, assetId? })` | Pay a Lightning invoice |
| `getLightningSendRequest(paymentHash)` | Poll send status (`'WaitingCounterparty'` → `'Settled'` \| `'Failed'`) |
| `getLightningReceiveRequest(invoice)` | Poll receive status |
| `listLightningPayments()` | List all Lightning payments |

#### IUTEXOProtocol — Onchain (RGB)

| Method | Description |
|--------|-------------|
| `onchainReceive({ assetId, amount, durationSeconds?, minConfirmations? })` | RGB witness invoice |
| `onchainSend({ invoice, assetId?, amount? })` | RGB send via decoded invoice |
| `listOnchainTransfers(assetId?)` | RGB transfer history |

#### RLN Extras — Node Info

| Method | Description |
|--------|-------------|
| `getNodeInfo()` | Node pubkey, channel counts, sync status |
| `getNetworkInfo()` | Network-level info |

#### RLN Extras — Peers

| Method | Description |
|--------|-------------|
| `connectPeer(peerPubkeyAndAddr)` | Connect to a peer (`pubkey@host:port`) |
| `disconnectPeer(peerPubkey)` | Disconnect a peer |
| `listPeers()` | List connected peers |

#### RLN Extras — Channels

| Method | Description |
|--------|-------------|
| `openChannel({ peerPubkeyAndOptAddr, capacitySat, pushMsat, public, withAnchors, assetId?, assetAmount? })` | Open a channel |
| `closeChannel(channelId, peerPubkey, force)` | Close a channel |
| `listChannels()` | List open channels |
| `getChannelId(temporaryChannelId)` | Resolve temporary → permanent channel ID |

#### RLN Extras — Payments

| Method | Description |
|--------|-------------|
| `keysend(destPubkey, amtMsat, assetId?, assetAmount?)` | Spontaneous keysend payment |
| `decodeLnInvoice(invoice)` | Decode a Lightning invoice |
| `invoiceStatus(invoice)` | Raw invoice status |

#### RLN Extras — Utility

| Method | Description |
|--------|-------------|
| `checkIndexerUrl(url)` | Validate an electrum URL |
| `checkProxyEndpoint(endpoint)` | Validate a proxy endpoint |

---

## Getting Started

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

---

## Core Workflows

### First-Time Wallet Init

```typescript
import {
  UTEXOWallet,
  NativeExternalRLNSigner,
  generateKeys,
} from '@utexo/rgb-sdk-rn';
import * as FileSystem from 'expo-file-system/legacy';

const network = 'regtest';
const keys = await generateKeys(network);

const storageDir = `${FileSystem.documentDirectory}my-node`.replace('file://', '');
await FileSystem.makeDirectoryAsync(storageDir, { intermediates: true });

const wallet = new UTEXOWallet(
  {
    storageDirPath: storageDir,
    daemonListeningPort: 9735,
    ldkPeerListeningPort: 9736,
    network,
    xpubVan: keys.accountXpubVanilla,
    xpubCol: keys.accountXpubColored,
    masterFingerprint: keys.masterFingerprint,
  },
  new NativeExternalRLNSigner(keys.mnemonic, network),
);

const unlockParams = {
  bitcoindRpcUsername: 'user',
  bitcoindRpcPassword: 'password',
  bitcoindRpcHost: '127.0.0.1',
  bitcoindRpcPort: 18443,
  indexerUrl: '127.0.0.1:50001',
  proxyEndpoint: 'rpc://127.0.0.1:3000/json-rpc',
};

// First run: write keys + connect
await wallet.init();
await wallet.unlock(unlockParams);
```

### App Restart (Existing Node)

```typescript
// The node was previously init'd and shut down. Call reinit() — no new wallet needed.
await wallet.reinit(unlockParams);
```

### Issue an RGB Asset and Create UTXOs

```typescript
// Fund the node address first, then:
const address = await wallet.getAddress();
// ... send BTC to address, mine blocks ...

await wallet.syncWallet();
await wallet.createUtxos({ upTo: false, num: 10, feeRate: 1.5 });

const asset = await wallet.issueAssetNia({
  ticker: 'DEMO',
  name: 'Demo Token',
  precision: 2,
  amounts: [1000],
});
console.log('Asset ID:', asset.assetId);
```

### Open a Lightning Channel

```typescript
// Connect to a peer
await wallet.connectPeer(`${peerPubkey}@127.0.0.1:9736`);

// Open a 500k sat BTC channel
const { temporaryChannelId } = await wallet.openChannel({
  peerPubkeyAndOptAddr: `${peerPubkey}@127.0.0.1:9736`,
  capacitySat: 500_000,
  pushMsat: 0,
  public: false,
  withAnchors: true,
  assetId: null,
  assetAmount: null,
});

// Wait for channel to become usable (mine 6 blocks, then poll)
let usable = false;
while (!usable) {
  await wallet.syncWallet();
  const info = await wallet.getNodeInfo();
  usable = (info.numUsableChannels ?? 0) >= 1;
  if (!usable) await new Promise(r => setTimeout(r, 2000));
}
```

### Lightning Payment

```typescript
// Receiver creates invoice (3000 sat BTC, no RGB asset)
const { lnInvoice } = await receiverWallet.createLightningInvoice({
  amountSats: 3000,
  expirySeconds: 900,
  asset: { assetId: '', amount: 0 }, // BTC-only: empty assetId
});

// Sender pays
const { txid: paymentHash } = await senderWallet.payLightningInvoice({ lnInvoice });

// Poll until settled
let status = null;
while (status !== 'Settled') {
  await senderWallet.syncWallet();
  status = await senderWallet.getLightningSendRequest(paymentHash);
  if (status === 'Failed') throw new Error('Payment failed');
  if (status !== 'Settled') await new Promise(r => setTimeout(r, 2000));
}
```

### RGB Asset Payment over Lightning

```typescript
const assetId = asset.assetId;

// Receiver creates invoice for 10 asset units
const { lnInvoice } = await receiverWallet.createLightningInvoice({
  expirySeconds: 900,
  asset: { assetId, amount: 10 },
});

// Sender pays
const { txid: paymentHash } = await senderWallet.payLightningInvoice({
  lnInvoice,
  assetId,
});
```

### Node Restart

```typescript
// Graceful shutdown (node state on disk is preserved)
await wallet.shutdown();

// Same instance — no new UTEXOWallet(), no new signer needed
await wallet.reinit(unlockParams);

// Verify channels recovered
const info = await wallet.getNodeInfo();
console.log('Usable channels after restart:', info.numUsableChannels);
```

### Full Cleanup

```typescript
try {
  // ... wallet operations ...
} finally {
  await wallet.destroy(); // shutdown + destroyNode + signer.dispose
}
```

---

## `WalletManager` (low-level, single RGB wallet)

Use `WalletManager` when you only need a plain RGB wallet without a Lightning node. It exposes the same per-wallet RGB/PSBT/VSS methods but does not include Lightning, channels, or peers. Suitable for **regtest**, **signet**, **testnet4**, or **mainnet** RGB development where you control the indexer and transport endpoint directly.

```typescript
import { WalletManager, generateKeys } from '@utexo/rgb-sdk-rn';

const keys = await generateKeys('regtest');
const wm = new WalletManager({
  mnemonic: keys.mnemonic,
  xpubVan: keys.accountXpubVanilla,
  xpubCol: keys.accountXpubColored,
  masterFingerprint: keys.masterFingerprint,
  network: 'regtest',
  indexerUrl: 'tcp://127.0.0.1:50001',
});
await wm.initialize();
await wm.goOnline('tcp://127.0.0.1:50001');
```

### Standalone helpers

| Function | Description |
|----------|-------------|
| `generateKeys(network?)` | Generate mnemonic, xpubs, master fingerprint |
| `createWallet(network?)` | Alias for `generateKeys` |
| `deriveKeysFromMnemonic(network, mnemonic)` | Derive keys from existing mnemonic |
| `deriveKeysFromSeed(network, seed)` | Derive keys from BIP39 seed |
| `createWalletManager(params)` | `WalletManager` factory |
| `restoreFromBackup({ backupFilePath, password, dataDir })` | Restore from encrypted backup file |
| `signMessage` / `verifyMessage` | Schnorr message signing (standalone, no wallet) |

---

## Configuration

### Default Indexer URLs (`DEFAULT_INDEXER_URLS`)

Used by `WalletManager` when `indexerUrl` is not set:

| Network | Default |
|---------|---------|
| `mainnet` | `ssl://electrum.iriswallet.com:50003` |
| `testnet` | `ssl://electrum.iriswallet.com:50013` |
| `testnet4` | `ssl://electrum.iriswallet.com:50053` |
| `signet` | `ssl://electrum.iriswallet.com:50033` |
| `regtest` | `tcp://regtest.thunderstack.org:50001` |

### Default RGB Transport Endpoints (`DEFAULT_TRANSPORT_ENDPOINTS`)

| Network | Default |
|---------|---------|
| `mainnet` | `rpcs://rgb-proxy-mainnet.utexo.com/json-rpc` |
| `testnet` | `rpcs://rgb-proxy-testnet3.utexo.com/json-rpc` |
| `regtest` | `rpcs://proxy.iriswallet.com/0.2/json-rpc` |

---

## RLN Manager (advanced)

`RLNManager` and `createRLNManager` expose the raw RLN node API for advanced use cases where you need full control of the node lifecycle and don't want `UTEXOWallet`'s opinionated wrapper. All methods map 1:1 to the native module calls.

```typescript
import { createRLNManager } from '@utexo/rgb-sdk-rn';

const rln = createRLNManager();
await rln.rlnCreateNode({ storageDirPath, daemonListeningPort, ldkPeerListeningPort, network });
await rln.rlnInitNode(password, mnemonic);
await rln.rlnUnlockNode({ password, ...connectionParams });
// ...
await rln.rlnShutdown();
await rln.rlnDestroyNode();
```

### External Signer — RGB Asset Channel

Two nodes, each a `UTEXOWallet`. **nodeA** uses `PasswordRLNSigner` and acts as the channel funder and payer. **nodeB** uses `NativeExternalRLNSigner` and creates invoices.

```typescript
import {
  UTEXOWallet,
  NativeExternalRLNSigner,
  PasswordRLNSigner,
  generateKeys,
} from '@utexo/rgb-sdk-rn';
import * as FileSystem from 'expo-file-system/legacy';

const network = 'regtest';
const keysA = await generateKeys(network);
const keysB = await generateKeys(network);

const storageDirA = `${FileSystem.documentDirectory}node-a`.replace('file://', '');
const storageDirB = `${FileSystem.documentDirectory}node-b`.replace('file://', '');
await FileSystem.makeDirectoryAsync(storageDirA, { intermediates: true });
await FileSystem.makeDirectoryAsync(storageDirB, { intermediates: true });

// nodeA — password signer: issues asset, opens channel, pays
const nodeA = new UTEXOWallet(
  {
    storageDirPath: storageDirA,
    daemonListeningPort: 9735,
    ldkPeerListeningPort: 9736,
    network,
    xpubVan: keysA.accountXpubVanilla,
    xpubCol: keysA.accountXpubColored,
    masterFingerprint: keysA.masterFingerprint,
  },
  new PasswordRLNSigner('nodeApass', keysA.mnemonic),
);

// nodeB — external signer: creates invoices, receives payments
const nodeB = new UTEXOWallet(
  {
    storageDirPath: storageDirB,
    daemonListeningPort: 9835,
    ldkPeerListeningPort: 9836,
    network,
    xpubVan: keysB.accountXpubVanilla,
    xpubCol: keysB.accountXpubColored,
    masterFingerprint: keysB.masterFingerprint,
  },
  new NativeExternalRLNSigner(keysB.mnemonic, network),
);

const unlockParams = {
  bitcoindRpcUsername: 'user',
  bitcoindRpcPassword: 'password',
  bitcoindRpcHost: '127.0.0.1',
  bitcoindRpcPort: 18443,
  indexerUrl: '127.0.0.1:50001',
  proxyEndpoint: 'rpc://127.0.0.1:3000/json-rpc',
  announceAddresses: [],
  announceAlias: null,
};

// ── Start both nodes ──────────────────────────────────────────────────────────
await nodeA.init();
await nodeA.unlock(unlockParams);
await nodeB.init();
await nodeB.unlock(unlockParams);

// ── Fund & create UTXOs ───────────────────────────────────────────────────────
// send BTC to each node's address, mine 6 blocks, syncWallet, then:
await nodeA.createUtxos({ upTo: false, num: 10, feeRate: 7 });
await nodeB.createUtxos({ upTo: false, num: 10, feeRate: 7 });
// mine 1 block + syncWallet after each createUtxos

// ── Issue RGB asset on nodeA ──────────────────────────────────────────────────
const { assetId } = await nodeA.issueAssetNia({
  ticker: 'USDT',
  name: 'Tether',
  precision: 0,
  amounts: [1000],
});

// ── Open RGB asset channel (nodeA → nodeB) ────────────────────────────────────
const { pubkey: pubkeyB } = await nodeB.getNodeInfo();
const peerUriB = `${pubkeyB}@127.0.0.1:9836`;

await nodeA.connectPeer(peerUriB);
await nodeA.openChannel({
  peerPubkeyAndOptAddr: peerUriB,
  capacitySat: 100_000,
  pushMsat: 3_500_000,   // initial BTC push to nodeB to enable bidirectional payments
  public: false,
  withAnchors: true,
  assetId,
  assetAmount: 600,      // 600 of 1000 units placed in the channel
});

// poll nodeA.listChannels() until funding tx appears, then mine 6 blocks
// poll nodeA/nodeB.getNodeInfo().numUsableChannels >= 1

// ── Lightning payment: nodeB creates invoice, nodeA pays ──────────────────────
const { lnInvoice } = await nodeB.createLightningInvoice({
  amountSats: 3000,
  expirySeconds: 900,
  asset: { assetId, amount: 100 },
});

const { txid: paymentHash } = await nodeA.payLightningInvoice({ lnInvoice });

// poll nodeA.getLightningSendRequest(paymentHash) until 'Settled'

// ── Cooperative close ─────────────────────────────────────────────────────────
// After two payments (100 + 50 units), channel balances: nodeA=450, nodeB=150
// nodeA off-chain RGB balance: 400 (= 1000 − 600 issued to channel)
// Expected on-chain after close: nodeA=850 (400+450), nodeB=150
await nodeA.closeChannel(channelId, pubkeyB, false);
// mine blocks and call refreshWallet() on both nodes while polling

// Poll until both on-chain balances settle (can take ~3 minutes for sweep txs)
const deadline = Date.now() + 300_000;
while (Date.now() < deadline) {
  const balA = await nodeA.getAssetBalance(assetId).catch(() => null);
  const balB = await nodeB.getAssetBalance(assetId).catch(() => null);
  if (Number(balA?.spendable) === 850 && Number(balB?.spendable) === 150) break;
  await nodeA.refreshWallet().catch(() => {});
  await nodeB.refreshWallet().catch(() => {});
  await new Promise(r => setTimeout(r, 12_000));
}

// ── RGB on-chain send: nodeB returns 150 units to nodeA ──────────────────────
const invoice = await nodeA.blindReceive({ minConfirmations: 1 });
await nodeB.send({
  invoice: invoice.invoice,
  assetId,
  amount: 150,
  donation: true,
  feeRate: 1,
  minConfirmations: 1,
});
// mine 1 block, syncWallet + refreshWallet on both nodes
// final balances: nodeA=1000, nodeB=0

// ── Cleanup ───────────────────────────────────────────────────────────────────
try {
  // wallet operations
} finally {
  await nodeA.destroy();
  await nodeB.destroy();
}
```

---

## Demo App

A full working demo is available at **[rgb-sdk-rn-playground](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo)**. It demonstrates:

- `UTEXOWallet` full lifecycle: `init()` → `unlock()` → fund → `createUtxos()` → issue asset → channel → payment → `reinit()` → second payment → `destroy()`
- Both signer types: `NativeExternalRLNSigner` (nodeA) and `PasswordRLNSigner` (nodeB)
- Node restart on the same `UTEXOWallet` instance via `reinit()`
- Raw `RLNManager` flows for comparison

### Running the Demo

```bash
git clone https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo
cd rgb-sdk-rn-demo
npm install
npm run prebuild
cd ios && LANG=en_US.UTF-8 pod install && cd ..
npm run ios:release    # or npm run android:release
```
