# LSP Integration

`utexo-lsp` is a Lightning Service Provider that bridges on-chain RGB assets with Lightning payments. The SDK exposes it through two objects:

- **`UtexoLsp`** — composed flows (connect, channel wait, receive, send, APay). Create one per wallet via `wallet.createLsp()`.
- **`UtexoLSPClient`** — raw HTTP client. Accessible via `lsp.http` for one-off calls.

---

## Quick start

```typescript
import { UTEXOWallet } from '@utexo/rgb-sdk-rn';

// lspBaseUrl is required — wires the native RLN for APay and
// is the source for no-arg createLsp() peer discovery
const wallet = new UTEXOWallet({
  ...nodeParams,
  lspBaseUrl:     'https://lsp-signet.utexo.com',
  lspBearerToken: 'bearer-token',  // only required for APay
}, signer);
await wallet.init();
await wallet.unlock(unlockParams);

// No-arg: peer pubkey from GET /get_info, host from lspBaseUrl, port 9735
const lsp = await wallet.createLsp();
```

If you need to override any peer detail:

```typescript
import { type LspPeer } from '@utexo/rgb-sdk-rn';

const lsp = await wallet.createLsp({
  baseUrl:    'https://lsp-signet.utexo.com',
  peerPubkey: '02abc...',
  peerHost:   'lsp-signet.utexo.com',
  peerPort:   9736,  // non-standard port
});
```

> **`lspBaseUrl` on the wallet** and **`baseUrl` on `LspPeer`** must point to the same URL. The wallet param wires the native RLN node for async payments; `LspPeer.baseUrl` wires the HTTP client for bridge flows.

---

## `LspPeer`

```typescript
interface LspPeer {
  baseUrl:      string;   // utexo-lsp HTTP API URL
  peerPubkey:   string;   // Lightning P2P pubkey for connectPeer()
  peerHost:     string;   // P2P host
  peerPort:     number;   // P2P port (LDK peer port, not HTTP)
  bearerToken?: string;   // required for APay internal routes
  timeoutMs?:   number;   // HTTP request timeout (default 15 000 ms)
}

// Build the string expected by wallet.connectPeer()
peerUri(peer: LspPeer): string   // → "02abc...@lsp-signet.utexo.com:9735"
```

---

## `UtexoLsp` — method reference

### `connect()`

Connect to the LSP peer over Lightning P2P. Idempotent — safe to call even if already connected (swallows LDK "already connected" errors).

```typescript
await lsp.connect();
```

---

### `waitForChannel(assetId, opts?)`

Poll `wallet.listChannels()` until a usable RGB channel for `assetId` exists. Calls `wallet.syncWallet()` before each check.

```typescript
const channel = await lsp.waitForChannel('rgb:abc...', {
  timeoutMs:      120_000,   // default
  pollIntervalMs:   2_000,   // default
  onProgress: (msg) => console.log(msg),
  // In regtest, mine a block each iteration so the channel confirms:
  onEachPoll: () => mine(1),
});

// channel: ChannelReadyInfo
// { channelId, peerPubkey, capacitySat, outboundBalanceMsat, inboundBalanceMsat }
```

Throws **`LspChannelTimeoutError`** if `timeoutMs` is exceeded.

**`onEachPoll`** — async hook called at the start of every iteration before the wallet check. In regtest the channel funding transaction needs block confirmations; pass `onEachPoll: () => mine(1)` to mine one block per poll. In signet/mainnet omit it — confirmations arrive naturally.

---

### `receiveAsset(opts)` — `POST /lightning_receive`

The **Lightning → RGB** bridge. The on-chain sender sends RGB to the LSP; once settled, the LSP pays the user's Lightning invoice.

```typescript
const { lnInvoice, rgbInvoice, mappingId } = await lsp.receiveAsset({
  assetId:    'rgb:abc...',
  amountSats: 3_000,       // sats component of the LN invoice
  amountRgb:  1,           // RGB units
  expirySeconds: 3_600,    // default; applied to both LN and RGB — always in sync
});

// Give rgbInvoice to the on-chain sender.
// The LSP pays lnInvoice once the RGB transfer settles.
```

Internally:
1. Calls `wallet.createLightningInvoice({ amountSats, expirySeconds, asset: { assetId, amount: amountRgb } })`
2. POSTs to `utexo-lsp /lightning_receive` with the LN invoice and RGB params
3. Returns `{ lnInvoice, rgbInvoice, mappingId }`

`expirySeconds` is applied to **both** invoices simultaneously. The LSP validates that they match; `receiveAsset` ensures they always do.

---

### `awaitReceiveSettlement(lnInvoice, opts?)` 

Poll `wallet.getLightningReceiveRequest(lnInvoice)` until it reaches a terminal state.

```typescript
await lsp.awaitReceiveSettlement(lnInvoice, {
  timeoutMs:      60_000,
  pollIntervalMs:  2_000,
  onProgress: (status) => setUiStatus(status),
});
// Returns 'Succeeded' or throws LspSettlementError({ step: 'ln_invoice', status })
```

Status progression: `'Pending'` → `'Succeeded'` | `'Failed'` | `'Expired'`

On timeout the method returns `'Succeeded'` without throwing — a timeout is not a confirmed failure, the LSP cron may still be processing.

---

### `waitForOutboundLiquidity(minMsat, opts?)`

Poll `wallet.listChannels()` until outbound balance on the LSP channel ≥ `minMsat`. Use before `wallet.payLightningInvoice()` to confirm routing capacity.

```typescript
await lsp.waitForOutboundLiquidity(3_000_000, {
  timeoutMs:      120_000,
  pollIntervalMs:   2_000,
  onProgress: (msg) => console.log(msg),
});
```

---

### `sendAsset(opts)` — `POST /onchain_send`

The **RGB → Lightning** bridge. The user sends sats over Lightning; the LSP sends RGB on-chain to the recipient.

```typescript
const result = await lsp.sendAsset({
  rgbInvoice: 'rgb1...',   // recipient's on-chain RGB invoice
  ln: {
    amtMsat:    3_000_000,
    expirySec:  3_600,
  },
});
// result.lnInvoice  — the LN invoice this wallet paid
// result.sendResult — { txid: paymentHash, status }
```

Internally:
1. POSTs to `utexo-lsp /onchain_send` with the RGB invoice and LN params
2. LSP returns a BOLT11 invoice
3. Immediately pays it via `wallet.payLightningInvoice()`
4. LSP executes `sendrgb` to the recipient once the LN payment settles

---

### `payAddress(opts)`

Resolve a Lightning Address and pay it. Tries the LSP's `resolveAddress` first (handles Android emulator callback URL rewriting). Falls back to standard LNURL discovery for addresses on other hosts.

```typescript
const { invoice, sendResult } = await lsp.payAddress({
  address: 'alice@lsp-signet.utexo.com',
  amtMsat: 3_000_000,
  asset: { assetId: 'rgb:abc...', assetAmount: 1 },  // optional
});
```

---

### `enableLightningAddress()`

Register an async payment hash pool with the LSP, then fetch the auto-generated Lightning Address for this wallet's pubkey. Call once after `unlock()` to enable offline receive.

```typescript
const { username, domain, address } = await lsp.enableLightningAddress();
// address → 'excited-mountain-1234@lsp-signet.utexo.com'
```

Internally:
1. Fetches the wallet's own pubkey via `wallet.getNodeInfo()`
2. Fetches LSP pubkey via `lsp.http.getInfo()`
3. Calls `wallet.apayNew(lspPubkey)` — sends hashes to the LSP via P2P onion messages
4. Calls `lsp.http.getLightningAddressByPubkey(walletPubkey)` — returns the assigned address

The `lspBaseUrl` **and** `lspBearerToken` on the wallet node params must be set for step 3 to work (it routes through the native RLN node, not the HTTP client).

---

### `claimPendingPayments()`

Find all `CLAIMABLE` / `CLAIMING` inbound HODL payments and claim each one by revealing the preimage. Call after every `unlock()` when the wallet comes back online.

```typescript
const results = await lsp.claimPendingPayments();
// results: Array<{ paymentHash, claimed, error? }>
```

---

## `WaitOptions`

All waiting methods share these options:

```typescript
interface WaitOptions {
  timeoutMs?:      number;               // ms until timeout (throws or returns)
  pollIntervalMs?: number;               // ms between checks
  signal?:         AbortSignal;          // abort the loop
  onProgress?:     (msg: string) => void; // status updates for UI
  onEachPoll?:     () => Promise<void>;  // regtest: mine blocks between iterations
}
```

---

## Error types

```typescript
// Thrown by waitForChannel() on timeout
class LspChannelTimeoutError extends Error {
  assetId:   string;
  elapsedMs: number;
}

// Thrown by awaitReceiveSettlement() when status is 'Failed' or 'Expired'
class LspSettlementError extends Error {
  step:   'ln_invoice';
  status: ReceiveStatus;   // 'Failed' | 'Expired'
}
```

---

## Full examples

### Receive RGB over Lightning

```typescript
const lsp = await wallet.createLsp(LSP_PEER);

// 1. Connect + wait for channel (regtest: mine blocks per iteration)
await lsp.connect();
const channel = await lsp.waitForChannel(ASSET_ID, {
  onEachPoll:  () => mine(1),   // omit on signet/mainnet
  onProgress:  (msg) => console.log(msg),
});
console.log(`Channel ready: ${channel.capacitySat} sat`);

// 2. Create invoices — one call, expiry synced automatically
const { lnInvoice, rgbInvoice } = await lsp.receiveAsset({
  assetId:    ASSET_ID,
  amountSats: 3_000,
  amountRgb:  1,
});

// 3. Share rgbInvoice with the on-chain sender
console.log('RGB invoice (give to sender):', rgbInvoice);

// 4. Wait for LSP to pay the LN invoice once RGB settles
await lsp.awaitReceiveSettlement(lnInvoice, {
  onProgress: (s) => setStatus(s),
});
console.log('Received!');
```

### Send RGB to an on-chain recipient

```typescript
// Recipient gives you their RGB invoice
const recipientRgbInvoice = 'rgb1...';

const result = await lsp.sendAsset({
  rgbInvoice: recipientRgbInvoice,
  ln: { amtMsat: 3_000_000 },
});
console.log('Sent. Payment hash:', result.sendResult.txid);
```

### P2P Lightning payment (after receiving)

```typescript
// Wait until the channel has enough outbound balance
await lsp.waitForOutboundLiquidity(3_000_000, {
  onProgress: (msg) => console.log(msg),
});

// Recipient creates an invoice
const { lnInvoice } = await recipientWallet.createLightningInvoice({
  amountSats: 3_000,
  expirySeconds: 3_600,
  asset: { assetId: ASSET_ID, amount: 1 },
});

// Pay it directly — no LSP bridge needed for Lightning-to-Lightning
await wallet.payLightningInvoice({ lnInvoice });
```

### Enable Lightning Address (offline receive / APay)

```typescript
// wallet node must be constructed with lspBaseUrl + lspBearerToken
const wallet = new UTEXOWallet({
  ...nodeParams,
  lspBaseUrl:      'https://lsp-signet.utexo.com',
  lspBearerToken:  'bearer-token',
}, signer);
await wallet.init();
await wallet.unlock(unlockParams);

const lsp = await wallet.createLsp(LSP_PEER);

// Register once after first unlock
const { address } = await lsp.enableLightningAddress();
console.log('Your Lightning Address:', address);
// → 'excited-mountain-1234@lsp-signet.utexo.com'

// On every subsequent unlock, claim any payments received while offline
const claimed = await lsp.claimPendingPayments();
console.log(`Claimed ${claimed.filter(c => c.claimed).length} payments`);
```

---

## Two LSP flows explained

### `POST /lightning_receive` — on-chain RGB → Lightning

```
On-chain sender ─[RGB on-chain]→ LSP
                                   │ once RGB settles
                    User ←[LN]──── LSP
```

Use case: user has a Lightning channel with the LSP but needs to receive RGB from a sender who can only send on-chain (exchange, faucet, another wallet without a channel). User creates a LN invoice, LSP issues an RGB invoice for the sender to pay, then delivers the RGB to the user over Lightning once the on-chain transfer confirms.

SDK: `lsp.receiveAsset()` + `lsp.awaitReceiveSettlement()`

### `POST /onchain_send` — Lightning → on-chain RGB

```
User ─[LN]→ LSP
              │ once LN settles
Recipient ←[RGB on-chain]── LSP
```

Use case: user has RGB in a Lightning channel and wants to send to a recipient who only has an on-chain RGB invoice. User submits the RGB invoice to the LSP, pays the returned LN invoice, and the LSP delivers the RGB on-chain.

SDK: `lsp.sendAsset()`

---

## Raw HTTP client

`lsp.http` is an `IUtexoLSPClient` instance. Use it for calls not covered by `UtexoLsp`:

```typescript
// Get LSP info
const info = await lsp.http.getInfo();
console.log(info.pubkey, info.numUsableChannels);

// Resolve a Lightning Address (LNURL discovery)
const { pr } = await lsp.http.resolveAddress('alice@lsp-signet.utexo.com', 3_000_000);
await wallet.payLightningInvoice({ lnInvoice: pr });

// Get the Lightning Address assigned to a peer pubkey
const addr = await lsp.http.getLightningAddressByPubkey(peerPubkey);
console.log(`${addr.username}@${addr.domain}`);
```
