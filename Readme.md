# RGB SDK for React Native

[`@utexo/rgb-sdk-rn`](https://www.npmjs.com/package/@utexo/rgb-sdk-rn)

> **Beta release** — APIs may change between releases. 
> Report issues on [GitHub](https://github.com/UTEXO-Protocol/rgb-sdk-rn/issues).

React Native SDK for on-device RGB assets and Lightning payments via the **RGB Lightning Node (RLN)** — a native LDK-based node that runs directly on iOS and Android.

[![npm version](https://img.shields.io/npm/v/@utexo/rgb-sdk-rn)](https://www.npmjs.com/package/@utexo/rgb-sdk-rn)
[![license](https://img.shields.io/npm/l/@utexo/rgb-sdk-rn)](https://www.npmjs.com/package/@utexo/rgb-sdk-rn)

> **Note**: React Native port of the [original RGB SDK for Node.js](https://github.com/UTEXO-Protocol/rgb-sdk). Use that SDK for Node.js applications.

## Requirements

- React Native with **New Architecture** enabled (TurboModule `Rgb`)
- iOS and Android
- Android `minSdkVersion` 24
- At unlock time: an Electrum indexer and/or bitcoind RPC, plus an RGB proxy endpoint (known networks get defaults — see [`IRLNUnlockParams`](#irlnunlockparams))

## Install

```bash
npm install @utexo/rgb-sdk-rn
```

**iOS** — the native framework (`RGBLightningNode.xcframework`) is downloaded automatically during `postinstall`:

```bash
cd ios && pod install
```

**Android** — the native binding (`com.utexo:rgb-lightning-node-android`) resolves from Maven Central via Gradle; no extra repository configuration needed.

## Quick start

```typescript
import {
  UTEXOWallet,
  PasswordRLNSigner,
  generateKeys,
} from '@utexo/rgb-sdk-rn';

const network = 'utexo';
const keys = await generateKeys(network);

const wallet = new UTEXOWallet(
  {
    storageDirPath: '/path/to/node-storage',
    daemonListeningPort: 9735,
    ldkPeerListeningPort: 9736,
    network,
  },
  new PasswordRLNSigner('my-secure-password', keys.mnemonic),
);

// All fields optional — omit any that should use network defaults
const unlockParams = {
  // indexerUrl: '...',        // optional, falls back to network default
  // proxyEndpoint: '...',     // optional
};

await wallet.init();
await wallet.unlock(unlockParams);

// Fund the wallet, then carve out colored UTXOs for RGB
const address = await wallet.getAddress();
// ... send BTC to `address` ...

await wallet.syncWallet();
await wallet.createUtxos({ upTo: false, num: 4, feeRate: 1 });

// RGB invoice — share with the sender (omit assetId/amount if you don't hold the asset yet).
// witness: false gives a blinded invoice; omit or pass true for a witness invoice.
const { invoice } = await wallet.onchainReceive({ witness: false, minConfirmations: 1 });
console.log('RGB invoice:', invoice);
```

After shutdown, restart on the same instance with `await wallet.reinit(unlockParams)` — no new `UTEXOWallet` needed.

---

## What You Can Do

- Run a full Lightning node on-device (iOS and Android) via RLN
- Open Lightning channels and send/receive BTC or RGB asset payments
- LSP integration: receive RGB via Lightning, send RGB to on-chain recipients, Lightning Address — see [docs/lsp.md](./docs/lsp.md)
- Async payments (APay): hash pool + Lightning Address via utexo-lsp — see [docs/async-payments.md](./docs/async-payments.md)
- Virtual channels: instant-usable channels with no on-chain footprint via trusted `no-broadcast` mode — see [docs/virtual-channels.md](./docs/virtual-channels.md)
- Issue, transfer, and manage RGB assets (NIA, CFA, IFA, UDA)
- Manage UTXOs and BTC on-chain sends
- Use a hardware-wallet–style **external signer** or a simple **password signer**
- Restart the node on the same `UTEXOWallet` instance without recreating anything

---

## Primary Class: `UTEXOWallet`

`UTEXOWallet` implements the shared `IUTEXOProtocol` contract and is backed by an on-device RLN node. It owns the node lifecycle, abstracts signer authentication, and exposes the full RGB Lightning API surface.

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
| `network` | `string` | Bitcoin network (`'utexo'`, `'regtest'`, `'testnet'`, `'mainnet'`, …) |
| `maxMediaUploadSizeMb` | `number?` | Max media upload size in MB (default 20) |
| `enableVirtualChannelsV0` | `boolean?` | Enable virtual channel support (required on both host and client) |
| `virtualPeerPubkeys` | `string[]?` | Host pubkeys allowed to open inbound virtual channels. `null`/`[]` = accept from anyone |
| `vssUrl` | `string?` | VSS server URL for encrypted remote backup |
| `vssAllowHttp` | `boolean?` | Allow plain HTTP VSS endpoint (default `false`) |
| `vssAllowEmptyRestore` | `boolean?` | Allow restoring from VSS when no backup exists yet (default `false`) |
| `lspBaseUrl` | `string?` | LSP base URL for `createLsp()` and APay. Optional on networks with a default (e.g. `utexo` → `https://lsp-signet.utexo.com`); required otherwise |
| `lspBearerToken` | `string?` | LSP bearer token — required for APay |

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
// All fields are optional — omit any that should use network defaults
const unlockParams = {
  indexerUrl: '127.0.0.1:50001',        // optional, falls back to network default
  proxyEndpoint: 'rpc://127.0.0.1:3000/json-rpc', // optional
  // bitcoindRpcUsername: 'user',        // optional (electrum mode doesn't need these)
  // bitcoindRpcPassword: 'password',
  // bitcoindRpcHost: '127.0.0.1',
  // bitcoindRpcPort: 18443,
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
| `bitcoindRpcUsername` | `string?` | Bitcoin RPC username (optional, falls back to network default) |
| `bitcoindRpcPassword` | `string?` | Bitcoin RPC password |
| `bitcoindRpcHost` | `string?` | Bitcoin RPC host |
| `bitcoindRpcPort` | `number?` | Bitcoin RPC port |
| `indexerUrl` | `string?` | Electrum indexer URL (e.g. `'127.0.0.1:50001'`) |
| `proxyEndpoint` | `string?` | RGB proxy endpoint (e.g. `'rpc://host:3000/json-rpc'`) |
| `announceAddresses` | `string[]?` | Public addresses to announce to the network |
| `announceAlias` | `string \| null?` | Node alias |
| `gossipRgsServerUrl` | `string \| null?` | RGS server URL for rapid gossip sync |

---

### Method Reference

#### Balance & Address

| Method | Description |
|--------|-------------|
| `getBtcBalance()` | BTC balance (vanilla + colored) |
| `getAddress()` | Current on-chain deposit address |
| `rotateVanillaAddress()` | Derive a fresh on-chain (vanilla/BTC) address |
| `getNetwork()` | Configured network string |

#### UTXO Management

| Method | Description |
|--------|-------------|
| `createUtxos({ upTo?, num?, size?, feeRate? })` | Create UTXOs (all-in-one) |
| `listUnspents()` | List unspent UTXOs with RGB allocations |

#### Assets

| Method | Description |
|--------|-------------|
| `listAssets()` | All RGB assets (NIA, CFA, IFA, UDA) |
| `getAssetBalance(assetId)` | Balance for one asset |
| `issueAssetNia({ ticker, name, precision, amounts })` | Issue a Non-Inflationary Asset |
| `issueAssetIfa({ ticker, name, precision, amounts, inflationAmounts, rejectListUrl })` | Issue an Inflatable Asset |
| `blindReceive({ assetId?, amount?, durationSeconds?, minConfirmations? })` | Create a blinded RGB invoice. Omit `assetId`/`amount` if the receiver doesn't own the asset yet |
| `witnessReceive({ assetId?, amount?, durationSeconds?, minConfirmations? })` | Create a witness RGB invoice. Omit `assetId`/`amount` if the receiver doesn't own the asset yet |
| `decodeRGBInvoice({ invoice })` | Decode an RGB invoice |

#### BTC Sends

| Method | Description |
|--------|-------------|
| `sendBtc({ address, amount, feeRate, skipSync? })` | On-chain BTC send |

#### Transactions & Transfers

| Method | Description |
|--------|-------------|
| `listTransactions()` | On-chain transaction history |
| `listTransfers(assetId?)` | RGB transfer history |
| `failTransfers(params)` | Mark pending transfers as failed |
| `refreshWallet()` | Refresh RGB transfer state |
| `syncWallet()` | Sync blockchain state |

#### Fees & Backup

| Method | Description |
|--------|-------------|
| `estimateFeeRate(blocks)` | Fee rate estimate for target confirmation |
| `createBackup({ backupPath, password })` | Encrypted local backup (file) |
| `backupNow()` | Replicate state to VSS now; returns the new backup version |

#### IUTEXOProtocol — Lightning

| Method | Description |
|--------|-------------|
| `createLightningInvoice({ amountSats?, asset, expirySeconds? })` | Create a Lightning invoice |
| `payLightningInvoice({ lnInvoice, amount?, assetId? })` | Pay a Lightning invoice |
| `getLightningSendStatus(paymentHash)` | Poll send status — `RlnPaymentStatus` (`'Pending'` \| `'Claimable'` \| `'Claiming'` \| `'Succeeded'` \| `'Cancelled'` \| `'Failed'`); `null` if the hash is unknown |
| `getLightningReceiveStatus(invoice)` | Poll receive status (`RlnInvoiceStatus`) |
| `listLightningPayments()` | List all Lightning payments |

#### IUTEXOProtocol — LSP & Async payments (APay)

| Method | Description |
|--------|-------------|
| `createLsp(peer?)` | Create an `UtexoLsp` session. No-arg: discovers peer from `lspBaseUrl` (or the network default) + `GET /get_info`, and auto-enables virtual channels (`enableVirtualChannelsV0: true` + adds the LSP pubkey to `virtualPeerPubkeys`). Pass `LspPeer` to override. **Must be called before `init()`/`reinit()`.** |
| `getLspConfig()` | Return `{ baseUrl, bearerToken }` this node was initialized with |
| `apayNewWithAddress(hostNodeId, username, domain)` | Register an attested hash pool (signs `address_sig`) — hash-substitution resistant |
| `apayNew(hostNodeId)` | Register a hash pool without an address attestation |
| `createHodlInvoice(params)` | Create a HODL invoice tied to a specific payment hash |
| `claimHodlInvoice(paymentHash, preimage)` | Reveal preimage to claim an inbound HODL payment |
| `cancelHodlInvoice(paymentHash)` | Cancel a HODL invoice |
| `listPayments()` | Return all payments including `InboundHodl` with preimage |

See **[docs/lsp.md](./docs/lsp.md)** for `UtexoLsp` composed flows and full examples.


#### IUTEXOProtocol — Onchain (RGB)

| Method | Description |
|--------|-------------|
| `onchainReceive({ assetId?, amount?, durationSeconds?, minConfirmations?, witness? })` | RGB invoice — witness by default (`witness: true`). Pass `witness: false` for a blinded invoice |
| `onchainSend({ invoice, assetId?, amount?, donation?, feeRate?, minConfirmations?, skipSync?, witnessData? })` | RGB send via decoded invoice |
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

## Core Workflows

### First-Time Wallet Init

```typescript
import {
  UTEXOWallet,
  NativeExternalRLNSigner,
  generateKeys,
} from '@utexo/rgb-sdk-rn';
import * as FileSystem from 'expo-file-system/legacy';

const network = 'utexo';
const keys = await generateKeys(network);

const storageDir = `${FileSystem.documentDirectory}my-node`.replace('file://', '');
await FileSystem.makeDirectoryAsync(storageDir, { intermediates: true });

const wallet = new UTEXOWallet(
  {
    storageDirPath: storageDir,
    daemonListeningPort: 9735,
    ldkPeerListeningPort: 9736,
    network,
  },
  new NativeExternalRLNSigner(keys.mnemonic, network),
);

// All fields optional — omit any that should use network defaults
const unlockParams = {
  // indexerUrl: '...',        // optional, falls back to network default
  // proxyEndpoint: '...',     // optional
  // bitcoindRpcUsername: 'user',        // optional (electrum mode doesn't need these)
  // bitcoindRpcPassword: 'password',
  // bitcoindRpcHost: '127.0.0.1',
  // bitcoindRpcPort: 18443,
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
while (status !== 'Succeeded') {
  await senderWallet.syncWallet();
  status = await senderWallet.getLightningSendStatus(paymentHash);
  if (status === 'Failed') throw new Error('Payment failed');
  if (status !== 'Succeeded') await new Promise(r => setTimeout(r, 2000));
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


## VSS — Encrypted Remote Backup

VSS (Versioned Storage Service) keeps an encrypted remote copy of the node's LDK state. When a device is lost or the local storage is wiped, you can restore a fully-functional node from the VSS server using only the mnemonic (or seed) and the password.

### Enabling VSS

Set `vssUrl` (and optionally the two flags) in the `UTEXOWalletNodeParams` constructor. VSS state is synced automatically as the node runs — no extra calls needed during normal operation.

```typescript
const wallet = new UTEXOWallet(
  {
    storageDirPath: storageDir,
    daemonListeningPort: 9735,
    ldkPeerListeningPort: 9736,
    network: 'regtest',
    vssUrl: 'https://vss.example.com',
    vssAllowHttp: false,           // set true if vssUrl starts with http://
    vssAllowEmptyRestore: false,   // set true to allow first-time restore with no backup yet
  },
  new PasswordRLNSigner('my-password', keys.mnemonic),
);

await wallet.init();
await wallet.unlock(unlockParams);
// VSS syncs automatically while the node is running
```

### Restoring from VSS

To restore on a new device (or after wiping local storage), create a fresh wallet pointing at the **same** VSS URL with the **same** credentials, then call `vssClearFence()` between `init()` and `unlock()`. The fence is a single-writer lock the old node left on the VSS — clearing it allows the new node to take ownership and pull the latest state.

```typescript
const walletRestored = new UTEXOWallet(
  {
    storageDirPath: newEmptyStorageDir,   // fresh directory — no existing node state
    daemonListeningPort: 9735,
    ldkPeerListeningPort: 9736,
    network: 'regtest',
    vssUrl: 'https://vss.example.com',
    vssAllowHttp: false,
    vssAllowEmptyRestore: false,
  },
  new PasswordRLNSigner('my-password', keys.mnemonic),
);

await walletRestored.init();
await walletRestored.vssClearFence('my-password');  // release stale lock before unlock
await walletRestored.unlock(unlockParams);           // pulls LDK state from VSS
```

### `vssClearFence(password)`

Clears the VSS single-writer fence lock. Must be called **after `init()` but before `unlock()`** in the restore path. Requires the same password used to init the original node.

### `backupNow()`

Uploads a snapshot now instead of waiting for the node's own schedule, and returns the new backup version. Requires `vssUrl`.

The imperative `configureVssBackup` / `disableVssAutoBackup` / `vssBackup` / `vssBackupInfo` quartet is **not** part of the contract: the node owns its single state store and configures its VSS client at `init()` from `vssUrl`. Web has those methods because it also runs an rgb-lib wallet with a second store to replicate.

A full end-to-end example (fund → channel → simulate device loss → restore → verify channels recovered) is in the demo app: [`flows/vss/runRlnVssFlow.ts`](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo/blob/main/flows/vss/runRlnVssFlow.ts).

---

## Standalone helpers

| Function | Description |
|----------|-------------|
| `generateKeys(network?)` | Generate mnemonic, xpubs, master fingerprint |
| `createWallet(network?)` | Alias for `generateKeys` |
| `deriveKeysFromMnemonic(network, mnemonic)` | Derive keys from existing mnemonic |
| `deriveKeysFromSeed(network, seed)` | Derive keys from BIP39 seed |
| `signMessage` / `verifyMessage` | Schnorr message signing (standalone, no wallet) |

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
  },
  new NativeExternalRLNSigner(keysB.mnemonic, network),
);

const unlockParams = {
  indexerUrl: '127.0.0.1:50001',
  proxyEndpoint: 'rpc://127.0.0.1:3000/json-rpc',
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

// poll nodeA.getLightningSendStatus(paymentHash) until 'Succeeded'

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
const invoice = await nodeA.onchainReceive({ witness: false, minConfirmations: 1 });
await nodeB.onchainSend({
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

## Virtual Channels

Virtual channels are Lightning channels that become usable immediately — the funding UTXO is never broadcast to Bitcoin. The LSP opens a `trusted_no_broadcast` channel directly to the client wallet; no block confirmations required, no on-chain footprint.

### Setup

```typescript
// Client wallet — enable virtual channels and optionally restrict to a specific LSP
const wallet = new UTEXOWallet({
  ...nodeParams,
  enableVirtualChannelsV0: true,
  virtualPeerPubkeys: ['02lspPubkey…'],  // omit or pass null/[] to accept from any host
  lspBaseUrl: 'https://lsp-signet.utexo.com',
}, signer);

await wallet.init();
await wallet.unlock(unlockParams);
```

### Receiving a virtual channel (client side)

The LSP opens the channel — nothing extra needed on the client. Once `enableVirtualChannelsV0: true` is set and the LSP pubkey is in `virtualPeerPubkeys` (or the list is empty), the channel is accepted automatically.

```typescript
// Poll until the virtual channel is ready
let ready = false;
while (!ready) {
  const channels = await wallet.listChannels();
  ready = channels.some(
    c => c.virtualOpenMode === 'trusted_no_broadcast' && c.ready && c.isUsable
  );
  if (!ready) await new Promise(r => setTimeout(r, 1000));
}
```

### Payments over a virtual channel

Virtual channels are transparent to the payment APIs — use the same `createLightningInvoice` / `payLightningInvoice` calls as for regular channels.

```typescript
// Receive
const { lnInvoice } = await wallet.createLightningInvoice({
  amountSats: 3_000,
  expirySeconds: 900,
  asset: { assetId: ASSET_ID, amount: 1 },
});

// Send
const { txid: paymentHash } = await wallet.payLightningInvoice({ lnInvoice });
```

**Full reference → [docs/virtual-channels.md](./docs/virtual-channels.md)**

---

## LSP Integration

`utexo-lsp` bridges on-chain RGB assets with Lightning payments. The SDK exposes it through `UtexoLsp` — a composed flow class created from the wallet.

### Setup

```typescript
// lspBaseUrl is optional on networks with a default (utexo → https://lsp-signet.utexo.com);
// set it explicitly for other networks or to override.
const wallet = new UTEXOWallet({
  ...nodeParams,
  network:        'utexo',
  lspBearerToken: 'bearer-token', // only required for APay
  // lspBaseUrl: 'https://lsp-signet.utexo.com', // optional on utexo
}, signer);

// createLsp() MUST be called before init(): it discovers the LSP pubkey
// (GET /get_info) and auto-wires virtual channels (enableVirtualChannelsV0 +
// virtualPeerPubkeys) into the node params, which are baked in at init().
const lsp = await wallet.createLsp();

await wallet.init();
await wallet.unlock(unlockParams);

// Or pass an explicit peer to override any field (also before init())
const lsp = await wallet.createLsp({
  baseUrl:    'https://lsp-signet.utexo.com',
  peerPubkey: '02abc...',
  peerHost:   'lsp-signet.utexo.com',
  peerPort:   9735,
});
```

### Receive RGB over Lightning

On-chain sender sends RGB to the LSP; LSP delivers it to the user's channel once it settles.

```typescript
// 1. Connect + wait for usable channel
await lsp.connect();
await lsp.waitForChannel(ASSET_ID, {
  onProgress:  (msg) => console.log(msg),
  onEachPoll:  () => mine(1),   // regtest only — omit on signet/mainnet
});

// 2. Create invoices — expiry synchronized automatically
const { lnInvoice, rgbInvoice } = await lsp.receiveAsset({
  assetId:    ASSET_ID,
  amountSats: 3_000,
  amountRgb:  1,
});

// 3. Share rgbInvoice with the on-chain sender
// 4. Wait for settlement ('settled' | 'timed_out')
const outcome = await lsp.awaitReceiveSettlement(lnInvoice, {
  onProgress: (s) => console.log('status:', s),
});
```

### Send RGB to an on-chain recipient

User pays Lightning; LSP sends RGB on-chain.

```typescript
const { sendResult } = await lsp.sendAsset({
  rgbInvoice: recipientRgbInvoice,
  ln: { amtMsat: 3_000_000 },
});
```

### Lightning Address (APay / offline receive)

```typescript
await lsp.connect();
await lsp.waitForChannel(ASSET_ID, { … });

const { address } = await lsp.enableLightningAddress();
// → 'username@lsp-signet.utexo.com'

// While app is foreground: lsp.connect() periodically so LSP outbox can reach you.
// Settlement is automatic — see docs/async-payments.md.
```

### Pay a Lightning Address

```typescript
await lsp.payAddress({
  address: 'alice@lsp-signet.utexo.com',
  amtMsat: 3_000_000,
  asset:   { assetId: ASSET_ID, assetAmount: 1 },
});
```

Omit `assetId` and the SDK chooses one, reading the address's payout and
accepted assets off LNURL discovery and checking local liquidity:

```typescript
const { assetSelection } = await lsp.payAddress({
  address: 'alice@lsp-signet.utexo.com',
  amtMsat: 3_000_000,
  asset:   { assetAmount: 500_000 },   // always base units
});
// assetSelection.converted → the LSP converts between the two legs
```

### Paying across two assets

Where an LSP serves one asset over Lightning (say `LNUSDT`) but accepts a
canonical on-chain one (`BUSDT`), it can convert 1:1 between the two legs of a
single payment. Three methods build on that, and none of them require the other
side to know anything about this SDK:

| Method | Flow |
|--------|------|
| `requestExternalInvoice()` | Quote a hosted BOLT11 for someone else to pay. Any RGB Lightning node with the right channel settles it with a bare `POST /sendpayment`. |
| `payExternalInvoice()` | Pay a plain third-party BOLT11 out of an asset you do not hold. The LSP quotes a HODL invoice carrying that invoice's own payment hash; the SDK verifies the two legs bind before paying. |
| `receiveAsset({ onchainAsset: 'convertible' })` | Be paid on-chain in the canonical asset and delivered the Lightning one. The LSP resolves the on-chain asset, so its contract id is never configured client-side. |

`listPayableAssets()` returns what an address can be paid in — payout asset plus
convertible ones, with tickers and precisions — so a picker needs no config.

**Worked examples → [examples/lsp-two-assets](./examples/lsp-two-assets)**

**Full reference → [docs/lsp.md](./docs/lsp.md)**

---

#### Async payments (APay)

Async payments let a recipient receive RGB Lightning while **offline at payment time**. The payer pays a HODL BOLT11 via LNURL; the LSP holds the HTLC until the recipient is **reachable over P2P**, then the **LSP outbox** settles automatically.

**Flow overview:**

```
Recipient                    LSP (Host RLN)              Sender
    │                              │                        │
    │── enableLightningAddress ───►│ hash pool + LN Address │
    │── lsp.connect() (online)     │                        │
    │                              │◄── payLightningInvoice ─│
    │                              │    HTLC held            │
    │                              │                        │
    │   (lsp.connect when online)  │ outbox: pay merchant   │
    │                              │ auto-claim → preimage  │
    │                              │──── settles payer HTLC ►│
    │◄── RGB delivered ────────────│                        │
```

Full reference → **[docs/async-payments.md](./docs/async-payments.md)**

##### `apayNewWithAddress(hostNodeId, username, domain)`

Registers a hash pool together with an attestation tying it to the wallet's Lightning Address. Alongside the hashes, the node signs `username`+`domain` (`address_sig`); this signature prevents hash substitution against the address and works for both password and external signers. Resolve the username/domain from the LSP first, and keep a live P2P connection to the host during the call.

```typescript
const { username, domain } = await lsp.http.getLightningAddressByPubkey(walletPubkey);
const pool = await wallet.apayNewWithAddress(lspPeerPubkey, username, domain);
```

Most apps reach this through the `lsp.enableLightningAddress()` / `lsp.refillHashPool()` wrappers, which handle the address lookup. Returns the same `ApayNewResponse` as `apayNew` (below).

##### `apayNew(hostNodeId)`

Registers the same hash pool without the address attestation. The host stores the hashes and uses them to build HODL invoices when a sender pays the recipient's Lightning Address. As with `apayNewWithAddress`, it requires a live P2P connection to the host.

```typescript
const pool = await wallet.apayNew(lspPeerPubkey);
```

> Both calls register a hash pool. Use `apayNewWithAddress` when the batch should carry the attestation that guards against hash substitution; `apayNew` registers without it.

**Returns:** `ApayNewResponse`

```typescript
interface ApayNewResponse {
  requestId:            string;
  hostNodeId:           string;
  protocolVersion:      number;
  orderId:              string;
  status:               string;         // 'active'
  acceptedThroughIndex: number;
  nextIndexExpected:    number;
  unusedHashes:         number;
  refillBatchSize:      number;
  firstHashIndex:       number;
  lastHashIndex:        number;
  hashes: Array<{
    hashIndex:    number;
    paymentHash:  string;
  }>;
}
```

`hashes` holds the payment hashes the LSP now has on file; it turns each one into a HODL invoice when a sender pays the recipient's Lightning Address. When `unusedHashes` runs low, top the pool back up with `lsp.refillHashPool()`.

---

##### `createHodlInvoice(params)`

Create a BOLT11 HODL invoice tied to a specific `paymentHash`. Use when your app issues the invoice directly (APay Lightning Address checkout uses LNURL → Host `/lninvoice` instead).

```typescript
const invoice = await wallet.createHodlInvoice({
  paymentHash:              '6fb3720c…',  // 32-byte hex
  amtMsat:                  3_000_000,    // optional — omit for any-amount invoice
  expirySec:                3_600,
  assetId:                  'rgb:abc…',   // optional — RGB asset
  assetAmount:              1,            // optional
  minFinalCltvExpiryDelta:  null,         // optional — LDK default used if null
});
// invoice.bolt11      — the BOLT11 invoice string
// invoice.paymentHash — echoed back for convenience
```

**Params:**

| Field | Type | Description |
|-------|------|-------------|
| `paymentHash` | `string` | 32-byte hex. Must be the SHA-256 of the preimage you will reveal at claim time |
| `amtMsat` | `number \| null` | Amount in millisatoshis. `null` = any-amount invoice |
| `expirySec` | `number` | Invoice expiry in seconds |
| `assetId` | `string \| null` | RGB asset ID — omit for sats-only |
| `assetAmount` | `number \| null` | RGB asset amount |
| `minFinalCltvExpiryDelta` | `number \| null` | CLTV delta for the final hop. `null` uses LDK default (min 42) |

**Returns:** `{ bolt11: string; paymentHash: string }`

---

##### `claimHodlInvoice(paymentHash, preimage)`

Reveal the preimage for an inbound HODL payment created with `createHodlInvoice`.

```typescript
const result = await wallet.claimHodlInvoice(
  hodlPayment.paymentHash,
  hodlPayment.preimage,
);
// result.changed — true if the invoice state was updated
```

Call after `listPayments()` finds a payment with `status === 'Claimable'`.

---

##### `cancelHodlInvoice(paymentHash)`

Cancel a pending HODL invoice. The held HTLC is failed back to the sender. Use when the recipient decides not to accept the payment or when the invoice expires.

```typescript
const result = await wallet.cancelHodlInvoice(paymentHash);
// result.changed — true if the invoice was cancelled
```

---

##### `listPayments()`

Return all payments the node knows about. Monitor inbound `INBOUND_HODL` → `Succeeded` for APay receive; filter `Claimable` + call `claimHodlInvoice` for HODL invoices you issued.

```typescript
const payments = await wallet.listPayments();

const claimable = payments.filter(
  p => p.paymentType === 'InboundHodl' && p.status === 'Claimable'
);
```

**Each payment (`LightningPayment`):**

| Field | Type | Description |
|-------|------|-------------|
| `paymentHash` | `string` | Payment identifier |
| `paymentType` | `'Outbound' \| 'InboundAutoClaim' \| 'InboundHodl'` | `InboundHodl` = held, waiting for claim |
| `status` | `'Pending' \| 'Claimable' \| 'Claiming' \| 'Succeeded' \| 'Cancelled' \| 'Failed'` | |
| `preimage` | `string?` | Present when `status === 'Claimable'` — pass to `claimHodlInvoice` |
| `amtMsat` | `number?` | Payment amount |
| `assetId` | `string?` | RGB asset ID if RGB payment |
| `assetAmount` | `number?` | RGB asset amount |
| `payeePubkey` | `string` | Sender's pubkey |
| `createdAt` | `number` | Unix timestamp |

---

##### Full APay example

See **[docs/async-payments.md](./docs/async-payments.md)** and the demo [`useApayFlow.ts`](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo/blob/main/screens/apay/useApayFlow.ts).

```typescript
// ── Recipient ────────────────────────────────────────────────────────────────
await lsp.connect();
await lsp.waitForChannel(ASSET_ID, { … });
const { address } = await lsp.enableLightningAddress();

// ── Sender ───────────────────────────────────────────────────────────────────
await senderLsp.connect();
await senderLsp.waitForChannel(ASSET_ID, { … });
await senderLsp.waitForOutboundLiquidity(3_000_000, { … });

const { pr } = await senderLsp.http.resolveAddress(username, 3_000_000, ASSET_ID, 1);
const { txid: paymentHash, status } = await senderWallet.payLightningInvoice({
  lnInvoice: pr, assetId: ASSET_ID, assetAmount: 1,
});

// ── Settlement (recipient online: lsp.connect()) ─────────────────────────────
await lsp.connect();
// Poll until sender Settled + recipient inbound SUCCEEDED
let settled = false;
while (!settled) {
  await senderWallet.syncWallet();
  await wallet.syncWallet();
  const sendSt = await senderWallet.getLightningSendStatus(paymentHash!);
  const inbound = (await wallet.listPayments())
    .find(p => p.paymentHash === paymentHash);
  if (sendSt === 'Succeeded' && inbound?.status === 'Succeeded') settled = true;
}
```

##### Claim pending HODL payments

```typescript
for (const p of await wallet.listPayments()) {
  if (p.paymentType !== 'InboundHodl' || p.status !== 'Claimable') continue;
  if (!p.preimage) continue;
  await wallet.claimHodlInvoice(p.paymentHash, p.preimage);
}
// Or: await lsp.claimPendingPayments();
```

## Further reading

| Doc | Description |
|-----|-------------|
| [docs/lsp.md](./docs/lsp.md) | Full LSP reference: `UtexoLsp`, `LspPeer`, all methods, examples |
| [examples/lsp-two-assets](./examples/lsp-two-assets) | Four annotated flows for an LSP serving one asset and converting another |
| [docs/async-payments.md](./docs/async-payments.md) | Async payment (APay) protocol, six-step flow diagrams, SDK usage |
| [docs/virtual-channels.md](./docs/virtual-channels.md) | Virtual channels: trusted no-broadcast, host-key allowlist, `virtualPeerPubkeys`, SDK usage |

---

## Demo App

A full working demo is available at **[rgb-sdk-rn-demo](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo)**. It demonstrates:

- `UTEXOWallet` full lifecycle: `init()` → `unlock()` → fund → `createUtxos()` → issue asset → channel → payment → `reinit()` → second payment → `destroy()`
- Both signer types: `NativeExternalRLNSigner` (nodeA) and `PasswordRLNSigner` (nodeB)
- Node restart on the same `UTEXOWallet` instance via `reinit()`
- Raw `RLNManager` flows for comparison
- **Async Payment** tab: full six-step APay flow — see [docs/async-payments.md](./docs/async-payments.md)

### Running the Demo

```bash
git clone https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo
cd rgb-sdk-rn-demo
npm install
npm run prebuild
cd ios && LANG=en_US.UTF-8 pod install && cd ..
npm run ios:release    # or npm run android:release
```
