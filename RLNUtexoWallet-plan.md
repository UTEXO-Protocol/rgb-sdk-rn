# RLNUtexoWallet — Implementation Plan

Wraps `RLNManager` and implements both `IWalletManager` and `IUTEXOProtocol`.
Auth is handled via an injected `IRLNSigner` — the same pattern `BaseWalletManager` uses with
`ISigner`. This keeps `RLNUtexoWallet` itself auth-agnostic and makes future custom signers
(hardware wallets, HSMs, remote signers) a drop-in without touching the wallet class.

---

## File locations

```
src/wallet/rln-utexo-wallet.ts       — main class
src/wallet/rln-signers.ts            — IRLNSigner + built-in implementations
```

---

## Comparison: how Breez SDK handles this

Breez SDK Nodeless takes the simplest possible approach — seed passed once at connect time,
never stored by the SDK:

```typescript
const seed = await mnemonicToSeed(mnemonic);   // Uint8Array
await connect({ config, seed });               // SDK uses it, caller manages lifecycle
```

This works for Breez because it owns all internal signing. RLN supports external signers
(hardware wallets, HSMs) where the private key must never be handled by the node. The signer
interface pattern handles both cases cleanly and mirrors how `BaseWalletManager` takes `ISigner`.

---

## Signer abstraction

### `IRLNSigner` interface

```typescript
export interface IRLNSigner {
  /** Called once on first-time node creation. Sets up keys on disk. */
  initNode(rln: RLNManager): Promise<void>;

  /** Called every time the node starts (first time and restarts). */
  unlockNode(rln: RLNManager, params: IRLNUnlockParams): Promise<void>;

  /** Optional cleanup — release signer resources (e.g. destroy native signer). */
  dispose?(rln: RLNManager): Promise<void>;
}
```

### Key material type

Both signers accept either a mnemonic string or raw seed bytes — conversion is handled internally:

```typescript
export type RLNKeyMaterial = string | Uint8Array; // mnemonic string OR BIP39 seed bytes

// Internal helper (not exported)
function toSeedHex(input: RLNKeyMaterial): string {
  const bytes = typeof input === 'string'
    ? mnemonicToSeedSync(input)   // BIP39: 64-byte seed from mnemonic
    : input;
  return Buffer.from(bytes).slice(0, 32).toString('hex'); // RLN requires 32 bytes
}
```

### `PasswordRLNSigner`

```typescript
export class PasswordRLNSigner implements IRLNSigner {
  private readonly password: string;
  private mnemonic: string | undefined; // only needed for initNode, cleared after

  constructor(password: string, keys?: RLNKeyMaterial) {
    this.password = password;
    // rlnInitNode takes mnemonic string — if seed bytes passed, convert back is not possible,
    // so we store mnemonic only when a string is given; seed-only = unlock-only mode
    this.mnemonic = typeof keys === 'string' ? keys : undefined;
  }

  async initNode(rln: RLNManager): Promise<void> {
    await rln.rlnInitNode(this.password, this.mnemonic);
    this.mnemonic = undefined; // clear after use
  }

  async unlockNode(rln: RLNManager, params: IRLNUnlockParams): Promise<void> {
    await rln.rlnUnlockNode({ password: this.password, ...params });
  }
  // no dispose needed
}
```

`mnemonic` cleared after `initNode`. Restarts only need `password`.

### `NativeExternalRLNSigner`

```typescript
export class NativeExternalRLNSigner implements IRLNSigner {
  private readonly seedHex: string; // always 32-byte hex, derived internally
  private readonly network: string;
  private readonly permissivePolicy?: boolean;
  private signerId: number | null = null;

  constructor(keys: RLNKeyMaterial, network: string, permissivePolicy?: boolean) {
    this.seedHex = toSeedHex(keys); // accepts mnemonic string or Uint8Array seed
    this.network = network;
    this.permissivePolicy = permissivePolicy;
  }

  async initNode(rln: RLNManager): Promise<void> {
    this.signerId = await rln.rlnCreateNativeExternalSigner(
      this.seedHex, this.network, this.permissivePolicy
    );
    await rln.rlnInitNodeWithNativeExternalSigner(this.signerId);
  }

  async unlockNode(rln: RLNManager, params: IRLNUnlockParams): Promise<void> {
    if (this.signerId === null) {
      // fresh instance (e.g. app cold start) — recreate signer from seed
      this.signerId = await rln.rlnCreateNativeExternalSigner(
        this.seedHex, this.network, this.permissivePolicy
      );
      await rln.rlnAttachNativeExternalSigner(this.signerId);
    }
    await rln.rlnUnlockNodeWithNativeExternalSigner(this.signerId, params);
  }

  async dispose(rln: RLNManager): Promise<void> {
    if (this.signerId !== null) {
      await rln.rlnDestroyNativeExternalSigner(this.signerId);
      this.signerId = null;
    }
  }
}
```

### Future custom signer (example shape)

```typescript
export class HardwareWalletRLNSigner implements IRLNSigner {
  async initNode(rln: RLNManager): Promise<void> {
    const bootstrap = await hardwareWallet.getRLNBootstrap(); // external key material
    await rln.rlnInitNodeWithExternalSigner(bootstrap);
  }
  async unlockNode(rln: RLNManager, params: IRLNUnlockParams): Promise<void> {
    const bootstrap = await hardwareWallet.getRLNBootstrap();
    await rln.rlnAttachNativeExternalSigner(/* ... */);
    await rln.rlnUnlockNodeWithNativeExternalSigner(/* ... */);
  }
}
```

No changes to `RLNUtexoWallet` required — new signer = new class.

---

## Constructor params type

```typescript
export interface RLNUtexoWalletNodeParams {
  // ── Node creation ────────────────────────────────────────────────────────────
  storageDirPath: string;
  daemonListeningPort: number;
  ldkPeerListeningPort: number;
  network: string;
  maxMediaUploadSizeMb?: number;     // default 20
  enableVirtualChannelsV0?: boolean;

  // ── Keys (reported via getXpub / getNetwork) ─────────────────────────────────
  xpubVan: string;
  xpubCol: string;
  masterFingerprint: string;
}
```

Network/RPC params are not stored in the constructor — they are passed directly to `unlock()`.
Auth is not in `nodeParams` either — it lives entirely in the signer.

---

## Recommended usage flows

### First-time init — external signer

```typescript
// Pass mnemonic directly — signer converts to 32-byte seedHex internally
const signer = new NativeExternalRLNSigner(mnemonic, 'regtest');
// or with raw seed bytes:
const signer = new NativeExternalRLNSigner(await mnemonicToSeed(mnemonic), 'regtest');

const wallet = new RLNUtexoWallet(nodeParams, signer);
await wallet.init();            // rlnCreateNode → signer.initNode (keys written to disk)
await wallet.unlock(rpcParams); // signer.unlockNode — no password needed
```

### First-time init — password

```typescript
const signer = new PasswordRLNSigner('mypassword', mnemonic); // mnemonic string
const wallet = new RLNUtexoWallet(nodeParams, signer);

await wallet.init();            // rlnCreateNode → signer.initNode (clears mnemonic after)
await wallet.unlock(rpcParams); // signer.unlockNode({ password, ...rpcParams })
```

### Restart — same instance

```typescript
await wallet.shutdown();        // rlnShutdown — bridge marks SHUTDOWN
await wallet.reinit();          // rlnCreateNode (SHUTDOWN→INITIALIZED), skips signer.initNode
await wallet.unlock(rpcParams); // signer.unlockNode
```

### Restart — fresh instance (e.g. app cold start)

```typescript
const wallet = new RLNUtexoWallet(sameNodeParams, signer);
// skip init() — keys already on disk; signer recreates signerId internally in unlock
await wallet.reinit();          // rlnCreateNode (SHUTDOWN→INITIALIZED)
await wallet.unlock(rpcParams); // signer.unlockNode
```

`unlock` params type mirrors `IRLNUnlockParams`:
```typescript
interface RLNUnlockParams {
  bitcoindRpcUsername: string;
  bitcoindRpcPassword: string;
  bitcoindRpcHost: string;
  bitcoindRpcPort: number;
  indexerUrl?: string;
  proxyEndpoint?: string;
  announceAddresses?: string[];
  announceAlias?: string;
}
```

---

## Class skeleton

```typescript
export class RLNUtexoWallet implements IWalletManager, IUTEXOProtocol {
  private rln: RLNManager;
  private params: RLNUtexoWalletNodeParams;
  private signer: IRLNSigner;
  private disposed = false;

  constructor(params: RLNUtexoWalletNodeParams, signer: IRLNSigner) { … }

  // ── IWalletManager (goOnline → NOT IMPLEMENTED; initialize → delegates to init) ──
  // ── IUTEXOProtocol ──────────────────────────────────────────────────────────

  // ── RLN-specific lifecycle ───────────────────────────────────────────────────
  init(): Promise<void>
  unlock(params: RLNUnlockParams): Promise<void>
  reinit(): Promise<void>
  shutdown(): Promise<void>
  destroy(): Promise<void>

  // ── RLN-specific node / peers / channels / payments ─────────────────────────
  getNodeInfo(): Promise<RlnNodeInfo>
  getNetworkInfo(): Promise<RlnNetworkInfo>
  connectPeer(peerPubkeyAndAddr: string): Promise<void>
  listPeers(): Promise<RlnPeer[]>
  disconnectPeer(peerPubkey: string): Promise<void>
  listChannels(): Promise<RlnChannel[]>
  openChannel(request: RlnOpenChannelRequest): Promise<RlnOpenChannelResponse>
  closeChannel(channelId: string, peerPubkey: string, force: boolean): Promise<void>
  getChannelId(temporaryChannelId: string): Promise<string>
  keysend(destPubkey: string, amtMsat: number, assetId?: string, assetAmount?: number): Promise<RlnKeysendResponse>
  decodeLnInvoice(invoice: string): Promise<RlnDecodeLnInvoiceResponse>
  invoiceStatus(invoice: string): Promise<RlnInvoiceStatus>
  checkIndexerUrl(url: string): Promise<RlnCheckIndexerUrlResponse>
  checkProxyEndpoint(endpoint: string): Promise<void>
}
```

---

## IWalletManager — method mapping

### Initialization & Lifecycle

| Method | RLN calls | Notes |
|---|---|---|
| `initialize()` | delegates to `init()` | Backward-compat alias — `rlnCreateNode` + `signer.initNode` |
| `goOnline(indexerUrl)` | **NOT IMPLEMENTED** | Use `unlock(params)` instead |
| `getXpub()` | — | Returns `{ xpubVan, xpubCol }` from params |
| `getNetwork()` | — | Maps `params.network` → `Network` enum |
| `dispose()` | `rlnShutdown` → `rlnDestroyNode` → `signer.dispose?(rln)` | Sets `disposed = true` |
| `isDisposed()` | — | Internal flag |

### Balance & Address

| Method | RLN call | Type mapping |
|---|---|---|
| `getBtcBalance()` | `rlnBtcBalance(false)` | `RlnBtcBalance` → `BtcBalance` |
| `getAddress()` | `rlnAddress()` | `.address` string |
| `rotateVanillaAddress()` | **NOT IMPLEMENTED** | |
| `rotateColoredAddress()` | **NOT IMPLEMENTED** | |

### UTXO Management

| Method | RLN call | Notes |
|---|---|---|
| `listUnspents()` | `rlnListUnspents(false)` | Map `RlnUnspent[]` → `Unspent[]` |
| `createUtxosBegin()` | **NOT IMPLEMENTED** | |
| `createUtxosEnd()` | **NOT IMPLEMENTED** | |
| `createUtxos(params)` | `rlnCreateUtxos(upTo, num, size, feeRate, false)` | Returns `params.num ?? 0` |

### Asset Operations

| Method | RLN call | Notes |
|---|---|---|
| `listAssets()` | `rlnListAssets([])` | Map `RlnListAssetsResponse` → `ListAssets` |
| `getAssetBalance(id)` | `rlnAssetBalance(id)` | `RlnAssetBalance` → `AssetBalance` |
| `issueAssetNia(params)` | `rlnIssueAssetNia(...)` | Map request fields; return as `AssetNIA` |
| `issueAssetIfa(params)` | `rlnIssueAssetIfa(...)` | Return raw |
| `inflateBegin/End/inflate` | **NOT IMPLEMENTED** | |

### Sending Assets

| Method | RLN call | Notes |
|---|---|---|
| `sendBegin/sendEnd` | **NOT IMPLEMENTED** | |
| `send(params)` | `rlnSendRgb(...)` | First recipient from `RecipientMap`; map → `SendResult` |

### Sending BTC

| Method | RLN call | Notes |
|---|---|---|
| `sendBtcBegin/sendBtcEnd` | **NOT IMPLEMENTED** | |
| `sendBtc(params)` | `rlnSendBtc(amount, address, feeRate, false)` | Returns txid |

### Receiving Assets

| Method | RLN call | Notes |
|---|---|---|
| `blindReceive(params)` | `rlnRgbInvoice(...)` | Map `InvoiceRequest` → args; map response → `InvoiceReceiveData` |
| `witnessReceive(params)` | `rlnRgbInvoice(...)` | Same |
| `decodeRGBInvoice({invoice})` | `rlnDecodeRgbInvoice(invoice)` | Map → `InvoiceData` |

### Transactions & Transfers

| Method | RLN call | Notes |
|---|---|---|
| `listTransactions()` | `rlnListTransactions(false)` | Map `RlnTransaction[]` → `Transaction[]` |
| `listTransfers(asset_id?)` | `rlnListTransfers(asset_id ?? '')` | Map `RlnTransfer[]` → `Transfer[]` |
| `failTransfers(params)` | `rlnFailTransfers(...)` | Returns `transfersChanged` |
| `refreshWallet()` | `rlnRefreshTransfers(false)` | |
| `syncWallet()` | `rlnSync()` | |

### VSS Backup — all **NOT IMPLEMENTED**

### Fee Estimation

| Method | RLN call | Notes |
|---|---|---|
| `estimateFeeRate(blocks)` | `rlnEstimateFee(blocks)` | Returns `{ [blocks]: feeRate }` |
| `estimateFee(psbt)` | **NOT IMPLEMENTED** | |

### Backup

| Method | RLN call | Notes |
|---|---|---|
| `createBackup({backupPath, password})` | `rlnBackup(backupPath, password)` | Returns `{ success: true }` |

### Cryptographic Operations — all **NOT IMPLEMENTED**

---

## IUTEXOProtocol — method mapping

### ILightningProtocol

| Method | RLN call | Notes |
|---|---|---|
| `createLightningInvoice(params)` | `rlnLnInvoice(amtMsat, expirySec, assetId, assetAmount)` | Map → `LightningReceiveRequest` |
| `getLightningReceiveRequest(id)` | `rlnInvoiceStatus(id)` | Map `RlnInvoiceStatus` → `TransferStatus \| null` |
| `getLightningSendRequest(id)` | `rlnGetPayment(id)` | Map `RlnPayment.status` → `TransferStatus \| null` |
| `getLightningSendFeeEstimate()` | **NOT IMPLEMENTED** | |
| `payLightningInvoiceBegin/End` | **NOT IMPLEMENTED** | |
| `payLightningInvoice(params)` | `rlnSendPayment(invoice, amtMsat, assetId, assetAmount)` | Map → `LightningSendRequest` |
| `listLightningPayments()` | `rlnListPayments()` | Map → `ListLightningPaymentsResponse` |

### IOnchainProtocol

RGB-over-onchain — not plain BTC transfers.

| Method | RLN call | Notes |
|---|---|---|
| `onchainReceive(params)` | `rlnRgbInvoice(assetId, amount, expiry, transportEndpoints, minConf, null)` | Map → `OnchainReceiveResponse` |
| `onchainSendBegin/End` | **NOT IMPLEMENTED** | |
| `onchainSend(params)` | `rlnSendRgb(...)` | Map `OnchainSendRequestModel` → args; map → `OnchainSendResponse` |
| `getOnchainSendStatus(id)` | **NOT IMPLEMENTED** | |
| `listOnchainTransfers(asset_id?)` | `rlnListTransfers(asset_id ?? '')` | Reuse `listTransfers` mapping |

---

## RLN-specific extra methods

### Lifecycle

| Method | RLN call | Notes |
|---|---|---|
| `init()` | `rlnCreateNode` → `signer.initNode` | First-time; `initialize()` delegates here |
| `unlock(params)` | `signer.unlockNode(rln, params)` | Every start |
| `reinit()` | `rlnCreateNode` (SHUTDOWN→INITIALIZED) | Restart — no init step |
| `shutdown()` | `rlnShutdown()` | Bridge marks SHUTDOWN |
| `destroy()` | `rlnDestroyNode()` + `signer.dispose?()` | Full cleanup after shutdown |

### Node info

| Method | RLN call | Notes |
|---|---|---|
| `getNodeInfo()` | `rlnNodeInfo()` | Returns `RlnNodeInfo` |
| `getNetworkInfo()` | `rlnNetworkInfo()` | Returns `RlnNetworkInfo` |

### Peers

| Method | RLN call | Notes |
|---|---|---|
| `connectPeer(peerPubkeyAndAddr: string)` | `rlnConnectPeer(peerPubkeyAndAddr)` | |
| `listPeers()` | `rlnListPeers()` | Returns `RlnPeer[]` |
| `disconnectPeer(peerPubkey: string)` | `rlnDisconnectPeer(peerPubkey)` | |

### Channels

| Method | RLN call | Notes |
|---|---|---|
| `listChannels()` | `rlnListChannels()` | Returns `RlnChannel[]` |
| `openChannel(request)` | `rlnOpenChannel(request)` | Returns `RlnOpenChannelResponse` |
| `closeChannel(channelId, peerPubkey, force)` | `rlnCloseChannel(...)` | |
| `getChannelId(temporaryChannelId)` | `rlnGetChannelId(temporaryChannelId)` | Resolves temp id → real channel id |

### Payments

| Method | RLN call | Notes |
|---|---|---|
| `keysend(destPubkey, amtMsat, assetId?, assetAmount?)` | `rlnKeysend(...)` | Returns `RlnKeysendResponse` |
| `decodeLnInvoice(invoice)` | `rlnDecodeLnInvoice(invoice)` | Returns `RlnDecodeLnInvoiceResponse` |
| `invoiceStatus(invoice)` | `rlnInvoiceStatus(invoice)` | Returns `RlnInvoiceStatus` |

### Utility

| Method | RLN call | Notes |
|---|---|---|
| `checkIndexerUrl(url)` | `rlnCheckIndexerUrl(url)` | Returns `RlnCheckIndexerUrlResponse` |
| `checkProxyEndpoint(endpoint)` | `rlnCheckProxyEndpoint(endpoint)` | |

---

## NOT IMPLEMENTED — full list

```
goOnline
rotateVanillaAddress, rotateColoredAddress
createUtxosBegin, createUtxosEnd
inflateBegin, inflateEnd, inflate
sendBegin, sendEnd
sendBtcBegin, sendBtcEnd
configureVssBackup, disableVssAutoBackup, vssBackup, vssBackupInfo
estimateFee
signPsbt, signMessage, verifyMessage
getLightningSendFeeEstimate
payLightningInvoiceBegin, payLightningInvoiceEnd
onchainSendBegin, onchainSendEnd
getOnchainSendStatus
```

---

## Private helpers

```typescript
mapBtcBalance(b: RlnBtcBalance): BtcBalance
mapTransaction(t: RlnTransaction): Transaction
mapTransfer(t: RlnTransfer): Transfer
mapUnspent(u: RlnUnspent): Unspent
mapAssetBalance(b: RlnAssetBalance): AssetBalance
mapListAssets(r: RlnListAssetsResponse): ListAssets
```

---

## Resolved decisions

**`send()` / `onchainSend()` batch recipients** — take the first (and only) entry from `RecipientMap`; throw `Error('RLNUtexoWallet: batch sends not supported — only one recipient allowed')` if map contains more than one.
