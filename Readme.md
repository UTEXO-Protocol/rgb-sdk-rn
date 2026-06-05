
# RGB SDK for React Native

React Native SDK for RGB client applications. Provides TypeScript/React Native bindings for managing RGB assets and Lightning payments through the **RGB Lightning Node (RLN)** — a native LDK-based node that runs directly on-device.

> **Note**: This is the React Native version of the [original RGB SDK for Node.js](https://github.com/UTEXO-Protocol/rgb-sdk). If you're building a Node.js application, use the original SDK instead.

---

## What You Can Do

- Run a full Lightning node on-device (iOS and Android) via RLN
- Open Lightning channels and send/receive BTC or RGB asset payments
- LSP integration: receive RGB via Lightning, send RGB to on-chain recipients, Lightning Address — see [docs/lsp.md](./docs/lsp.md)
- Async payments (APay): hash pool + Lightning Address via utexo-lsp — see [docs/async-payments.md](./docs/async-payments.md)
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
| `vssUrl` | `string?` | VSS server URL for encrypted remote backup |
| `vssAllowHttp` | `boolean?` | Allow plain HTTP VSS endpoint (default `false`) |
| `vssAllowEmptyRestore` | `boolean?` | Allow restoring from VSS when no backup exists yet (default `false`) |
| `lspBaseUrl` | `string?` | LSP base URL — required for `createLsp()` and APay |
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
| `send({ invoice, assetId?, amount, donation?, feeRate?, minConfirmations?, skipSync?, witnessData? })` | RGB transfer — decodes invoice and sends. `witnessData: { amountSat, blinding? }` required for witness sends |
| `blindReceive({ assetId?, amount?, durationSeconds?, minConfirmations? })` | Create a blinded RGB invoice. Omit `assetId`/`amount` if the receiver doesn't own the asset yet |
| `witnessReceive({ assetId?, amount?, durationSeconds?, minConfirmations? })` | Create a witness RGB invoice. Omit `assetId`/`amount` if the receiver doesn't own the asset yet |
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

#### IUTEXOProtocol — LSP & Async payments (APay)

| Method | Description |
|--------|-------------|
| `createLsp(peer?)` | Create an `UtexoLsp` session. No-arg: discovers peer from `lspBaseUrl` + `GET /get_info`. Pass `LspPeer` to override. |
| `getLspConfig()` | Return `{ baseUrl, bearerToken }` this node was initialized with |
| `apayNew(hostNodeId)` | Register a hash pool with the host LSP node |
| `createHodlInvoice(params)` | Create a HODL invoice tied to a specific payment hash |
| `claimHodlInvoice(paymentHash, preimage)` | Claim an inbound HODL payment by revealing the preimage |
| `cancelHodlInvoice(paymentHash)` | Cancel a HODL invoice |
| `listPaymentsRaw()` | Return all payments including `InboundHodl` with preimage |

See **[docs/lsp.md](./docs/lsp.md)** for `UtexoLsp` composed flows and full examples.

---

#### Async payments (APay) — detailed reference

Async payments let a recipient receive RGB Lightning payments while their wallet is offline. The payer sends a BOLT11 invoice; the LSP holds the HTLC until the recipient comes online and claims it.

**Flow overview:**

```
Recipient                    LSP (Host RLN)              Sender
    │                              │                        │
    │── apayNew(hostNodeId) ──────►│ registers hash pool    │
    │◄─ ApayNewResponse ───────────│ creates Lightning Addr  │
    │                              │                        │
    │   (goes offline)             │                        │
    │                              │◄── payLightningInvoice ─│
    │                              │    HTLC held            │
    │                              │                        │
    │   (comes back online)        │                        │
    │── listPaymentsRaw() ─────────┤ finds InboundHodl      │
    │── claimHodlInvoice() ───────►│ reveals preimage        │
    │                              │──── settles HTLC ──────►│
```

##### `apayNew(hostNodeId)`

Register a payment hash pool with the LSP host node. The host node (LSP) stores the hashes and uses them to create HODL invoices when senders pay the recipient's Lightning Address. Must be called with a live P2P connection to the host.

```typescript
const pool = await wallet.apayNew(lspPeerPubkey);
```

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

The `hashes` array contains the payment hashes sent to the LSP. The LSP uses them to create HODL invoices for each incoming payment to the recipient's Lightning Address. Once `unusedHashes` drops below a threshold the pool should be refilled by calling `apayNew` again.

---

##### `createHodlInvoice(params)`

Create a BOLT11 HODL invoice tied to a specific `paymentHash`. The invoice will not auto-settle when paid — the HTLC is held at the payer's node until `claimHodlInvoice` is called with the matching preimage.

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

Reveal the preimage for an inbound HODL payment. The node verifies `sha256(preimage) === paymentHash`, then settles the held HTLC — releasing the funds to the recipient and completing the payment from the sender's perspective.

```typescript
const result = await wallet.claimHodlInvoice(
  hodlPayment.paymentHash,
  hodlPayment.preimage,
);
// result.changed — true if the invoice state was updated
```

Call this after `listPaymentsRaw()` finds a payment with `status === 'Claimable'`.

---

##### `cancelHodlInvoice(paymentHash)`

Cancel a pending HODL invoice. The held HTLC is failed back to the sender. Use when the recipient decides not to accept the payment or when the invoice expires.

```typescript
const result = await wallet.cancelHodlInvoice(paymentHash);
// result.changed — true if the invoice was cancelled
```

---

##### `listPaymentsRaw()`

Return all payments the node knows about, including held inbound HODL payments. Use this after coming online to find payments that arrived while offline.

```typescript
const payments = await wallet.listPaymentsRaw();

const claimable = payments.filter(
  p => p.paymentType === 'InboundHodl' && p.status === 'Claimable'
);
```

**Each payment (`RlnPayment`):**

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

##### Full async payment example

```typescript
// ── Recipient: register once after unlock ────────────────────────────────────
const pool = await wallet.apayNew(lspPeerPubkey);
console.log(`Hash pool registered — ${pool.hashes.length} hashes issued`);
console.log(`Unused: ${pool.unusedHashes}  Order: ${pool.orderId}`);

// ── Recipient: come online and claim ────────────────────────────────────────
await wallet.syncWallet();
const payments = await wallet.listPaymentsRaw();

for (const p of payments) {
  if (p.paymentType !== 'InboundHodl' || p.status !== 'Claimable') continue;
  if (!p.preimage) continue;

  const result = await wallet.claimHodlInvoice(p.paymentHash, p.preimage);
  if (result.changed) {
    console.log(`Claimed payment: ${p.amtMsat} msat  hash=${p.paymentHash}`);
  }
}
```

> **Note:** `UtexoLsp.claimPendingPayments()` encapsulates the filter + loop above. Use it when you don't need per-payment result inspection.

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

## Getting Started

### Installation

```bash
npm install @utexo/rgb-sdk-rn
```

### iOS Setup

The native framework (`RGBLightningNode.xcframework`) is automatically downloaded and extracted during `postinstall`.

```bash
cd ios && pod install
```

### Android Setup

The library requires `minSdkVersion` 24. The native binding (`com.utexo:rgb-lightning-node-android`) is published to Maven Central and resolved by Gradle automatically — no extra repository configuration needed.

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
  },
  new NativeExternalRLNSigner(keys.mnemonic, network),
);

const unlockParams = {
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

> **Note:** `configureVssBackup`, `disableVssAutoBackup`, `vssBackup`, and `vssBackupInfo` from the `IWalletManager` interface exist on `UTEXOWallet` but are not yet implemented and will throw.

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

## LSP Integration

`utexo-lsp` bridges on-chain RGB assets with Lightning payments. The SDK exposes it through `UtexoLsp` — a composed flow class created from the wallet.

### Setup

```typescript
// Wallet must include lspBaseUrl — required for no-arg createLsp() and APay
const wallet = new UTEXOWallet({
  ...nodeParams,
  lspBaseUrl:     'https://lsp-signet.utexo.com',
  lspBearerToken: 'bearer-token', // only required for APay
}, signer);

await wallet.init();
await wallet.unlock(unlockParams);

// No-arg form — discovers peer pubkey from GET /get_info,
// host from lspBaseUrl, port defaults to 9735
const lsp = await wallet.createLsp();

// Or pass explicit peer to override any field
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
// 4. Wait for settlement
await lsp.awaitReceiveSettlement(lnInvoice, {
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

### Lightning Address (offline receive)

```typescript
const { address } = await lsp.enableLightningAddress();
// → 'username@lsp-signet.utexo.com'

// On every unlock — claim payments received while offline
const claimed = await lsp.claimPendingPayments();
```

### Pay a Lightning Address

```typescript
await lsp.payAddress({
  address: 'alice@lsp-signet.utexo.com',
  amtMsat: 3_000_000,
  asset:   { assetId: ASSET_ID, assetAmount: 1 },
});
```

**Full reference → [docs/lsp.md](./docs/lsp.md)**

---

## Further reading

| Doc | Description |
|-----|-------------|
| [docs/lsp.md](./docs/lsp.md) | Full LSP reference: `UtexoLsp`, `LspPeer`, all methods, examples |
| [docs/async-payments.md](./docs/async-payments.md) | Async payment (APay) protocol, six-step flow diagrams, SDK usage |

---

## Demo App

A full working demo is available at **[rgb-sdk-rn-playground](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo)**. It demonstrates:

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
