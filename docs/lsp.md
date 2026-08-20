# LSP Integration

`utexo-lsp` is a Lightning Service Provider that bridges on-chain RGB assets with Lightning payments. The SDK exposes it through two objects:

- **`UtexoLsp`** — composed flows (connect, channel wait, receive, send, APay). Create one per wallet via `wallet.createLsp()`.
- **`UtexoLSPClient`** — raw HTTP client. Accessible via `lsp.http` for one-off calls.

---

## Quick start

```typescript
import { UTEXOWallet } from '@utexo/rgb-sdk-rn';

// lspBaseUrl wires the native RLN for APay and is the source for no-arg
// createLsp() peer discovery. Optional on networks with a default (utexo →
// https://lsp-signet.utexo.com); required otherwise.
const wallet = new UTEXOWallet({
  ...nodeParams,
  network:        'utexo',
  lspBearerToken: 'bearer-token',  // only required for APay
}, signer);

// No-arg: peer pubkey, host and port all from GET /get_info.
// MUST be called before init() — it auto-wires virtual channels into node params.
const lsp = await wallet.createLsp();

await wallet.init();
await wallet.unlock(unlockParams);
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

**Two assets.** `assetId` names only what you are paid over Lightning. By default (`onchainAsset: 'convertible'`) the LSP issues the RGB invoice in whichever asset it converts 1:1 to that one — typically the canonical contract the sender already holds — so its contract id never has to be configured client-side:

```typescript
const { rgbInvoice, onchainAssetId, converted } = await lsp.receiveAsset({
  assetId:    LNUSDT,      // what you receive
  amountSats: 3_000,
  amountRgb:  500_000,     // base units
});
// converted → true, onchainAssetId → the asset the sender must send
```

Pass `onchainAsset: 'payout'` for one asset end to end. That is also the only form LSPs predating convertible `/lightning_receive` accept.

A converted receive pins the inbound amount in the RGB invoice's assignment (`{"type":"Fungible","value":N}` rather than `Any`) — two unrelated contracts have nothing else tying what arrives on-chain to what the BOLT11 pays out. Read the assignment off the invoice rather than assuming it.

---

### `awaitReceiveSettlement(lnInvoice, opts?)` 

Poll `wallet.getLightningReceiveStatus(lnInvoice)` until it reaches a terminal state.

```typescript
const outcome = await lsp.awaitReceiveSettlement(lnInvoice, {
  timeoutMs:      60_000,
  pollIntervalMs:  2_000,
  onProgress: (status) => setUiStatus(status),
});
// outcome: 'settled' | 'timed_out'
// throws LspSettlementError({ step: 'ln_invoice', status }) on Failed | Expired
```

Wallet status progression: `'Pending'` → `'Succeeded'` | `'Failed'` | `'Expired'`

Return value: `'settled'` when Succeeded is confirmed; `'timed_out'` when timeoutMs elapses without a terminal status (LSP cron may still be processing — not a confirmed failure).

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

Omitting `assetId` hands the choice to `selectPaymentAsset()` and returns it as `assetSelection`:

```typescript
const { assetSelection } = await lsp.payAddress({
  address: 'alice@lsp-signet.utexo.com',
  amtMsat: 3_000_000,
  asset: { assetAmount: 500_000 },
});
// assetSelection.assetId | .asset.ticker | .converted | .localAssetAmount
```

Throws `LspInsufficientAssetLiquidityError` when no accepted asset has enough local outbound liquidity — before anything is quoted, so no hash is spent.

---

### `quoteAddress(opts)`

Everything `payAddress` does except paying. Same options, returns `{ invoice, amtMsat, assetId, assetAmount, assetSelection, proof }`.

Useful on its own because the invoice is **hosted**: the LSP signs it against a hash the receiver pre-registered, so its payee is the LSP and nothing in it names a payer. Whoever holds the string can pay it.

Quoting is not free — the callback reserves a payment hash from the receiver's APay batch, and a quote that is never paid still costs one.

---

### `discoverAddress(address)` / `listPayableAssets(address?)`

LNURL discovery, routed on the address domain exactly like `payAddress`.

```typescript
const { payoutAsset, accepted, convertible } = await lsp.listPayableAssets();
// payoutAsset  — what the receiver is delivered
// accepted     — everything the callback will quote
// convertible  — accepted minus the payout asset
```

Entries carry ticker and precision, so a UI can offer an asset picker with no configuration. `address` defaults to this wallet's own LSP address.

Note this reads discovery, **not** `/get_info`: `getInfo().supportedAssets` is the LSP-wide served set and leaves out the convertible assets it accepts but never provisions.

---

### `requestExternalInvoice(opts)`

Quote a BOLT11 for a payer that is not this wallet — a node that knows nothing about this SDK, APay or Lightning Addresses and can only be handed an invoice.

```typescript
const quoted = await lsp.requestExternalInvoice({
  amtMsat:     3_000_000,
  assetAmount: 500_000,
  asset:       'BUSDT',        // ticker or contract id; optional
  prefer:      'convertible',  // default; or 'payout'
});
// quoted.invoice | .asset | .converted | .paymentHash
```

The RGB contract id and amount ride inside the BOLT11, so paying it is a plain `POST /sendpayment {"invoice": …}` on any RGB Lightning node with a channel to this LSP in the quoted asset.

The asset comes from LNURL discovery, not configuration. More than one match with no `asset` throws `LspAmbiguousPayableAssetError` rather than guessing — the quote pins one asset for the invoice's life, and a payer holding the other one would only find out by failing to pay.

Every call reserves a hash from the receiver's batch. Call `enableLightningAddress()` first and refill off `unusedHashes`.

---

### `payExternalInvoice(opts)` / `quoteExternalPayment(opts)` — `POST /lightning_send`

Pay a third party's plain BOLT11 out of an asset this wallet does not hold. The mirror of `requestExternalInvoice`: there the outside node pays, here it is paid, and either way it only signs or settles an ordinary invoice.

```typescript
const { quote, sendResult } = await lsp.payExternalInvoice({
  invoice:    'lnbcrt...',   // the third party's own invoice
  payWith:    'LNUSDT',      // ticker or contract id; optional
  maxFeeMsat: 0,             // default — the relay must be at cost
});
// quote.paymentHash | .inbound | .outbound | .converted | .verified
```

The LSP returns a HODL invoice carrying **the third party invoice's own payment hash**. That shared hash is the atomicity: the LSP can claim what this wallet pays only with a preimage the third party releases on being paid.

The SDK decodes the returned BOLT11 on this wallet's own node and throws `LspQuoteMismatchError` unless the hash, the assets and the amounts match what the LSP reported — before anything is paid. `quoteExternalPayment()` does the same without paying.

Omitting `payWith` picks the channel that can cover the amount, preferring the delivery asset itself (a plain relay, no conversion).

---

### `externalPaymentStatus(paymentHash)`

Where a relay has got to: `'quoted' | 'claimable' | 'outbound_pending' | 'outbound_paid' | 'outbound_claimed' | 'settled' | 'cancelled' | 'failed'`.

`settled` is final but not yet local — it reports the moment the LSP claimed the HTLC, while this wallet's channel balance moves only once its node applies the fulfilment. Code asserting on a balance should wait for the balance, or poll `wallet.getLightningSendStatus(paymentHash)` for the local half.

`cancelled` and `failed` are terminal and refunded: nothing was delivered or spent.

---

### `enableLightningAddress()`

Register an async payment hash pool with the LSP, then fetch the auto-generated Lightning Address for this wallet's pubkey. Call once after `unlock()` to enable offline receive.

```typescript
const { username, domain, address } = await lsp.enableLightningAddress();
// address → 'excited-mountain-1234@lsp-signet.utexo.com'
```

How it works:

The LSP mints a Lightning Address for every peer that connects, so the address exists before registration — the method only has to look it up. It reads the wallet pubkey (`getNodeInfo`) and the LSP pubkey (`getInfo`), then polls `getLightningAddressByPubkey` until the address appears. `lsp.connect()` must run first; until the account exists the lookup returns 404.

With the `username` and `domain` resolved, it calls `wallet.apayNewWithAddress(lspPubkey, username, domain)`, which sends a single signed batch of hashes to the LSP over P2P. The node signs `username`+`domain` (`address_sig`) and attaches it to the batch. This signature makes the pool resistant to hash substitution and works for both password and external signers.

Returns `{ username, domain, address, unusedHashes, nextIndexExpected, refillBatchSize }`.

Both `lspBaseUrl` and `lspBearerToken` must be set on the wallet node params — registration runs through the native RLN node, not the HTTP client.

> Register exactly one batch. The node's batch size already matches the LSP's pool cap, so a single batch fills it. Issuing an `apayNew` bootstrap first overflows the pool, and the LSP rejects the second batch with `invalid_hash_batch`.

---

### `refillHashPool()`

Tops up the hash pool with a fresh signed batch. Call it after `enableLightningAddress()` once `unusedHashes` runs low.

```typescript
const { unusedHashes, nextIndexExpected, refillBatchSize } = await lsp.refillHashPool();
```

The address is already minted, so the method re-resolves it and registers another batch through `apayNewWithAddress`. Refills therefore carry the same attestation as the initial registration. Prefer this over calling `apayNew` directly.

---

### `claimPendingPayments()`

Find all `CLAIMABLE` / `CLAIMING` inbound HODL payments and call `claimHodlInvoice` on each. Use for invoices created with `createHodlInvoice` — e.g. after `unlock()` when the wallet comes back online.

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

// ── Asset selection ────────────────────────────────────────────────────────

// selectPaymentAsset(): nothing accepted has enough local outbound liquidity.
// Raised before anything is quoted, so no hash is spent.
class LspInsufficientAssetLiquidityError extends Error {
  required:   number;
  candidates: { assetId: string; localAmount: number }[];
}

// The address advertises no payout and no accepted asset — its receiver has no
// usable asset channel yet.
class LspNoPayableAssetError extends Error { address: string }

// The asset asked for is not one this address can be paid in.
class LspUnknownPayableAssetError extends Error {
  requested: string;
  accepted:  LspSupportedAsset[];
}

// More than one asset fits and the caller named none. Pass `asset`.
class LspAmbiguousPayableAssetError extends Error {
  candidates: LspSupportedAsset[];
  prefer:     'payout' | 'convertible';
}

// ── Relay ──────────────────────────────────────────────────────────────────

// payExternalInvoice(): the quote's two legs are not bound together as the LSP
// described them. Thrown before anything is paid.
class LspQuoteMismatchError extends Error {}
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

### APay — Lightning Address (offline receive)

```typescript
const wallet = new UTEXOWallet({
  ...nodeParams,
  network:        'utexo',          // lspBaseUrl optional on utexo (defaults to https://lsp-signet.utexo.com)
  lspBearerToken: 'bearer-token',
}, signer);

// createLsp() before init() — auto-wires virtual channels into node params
const lsp = await wallet.createLsp();  // or createLsp(undefined, 9737) on regtest

await wallet.init();
await wallet.unlock(unlockParams);

await lsp.connect();
await lsp.waitForChannel(ASSET_ID, { onProgress: (m) => console.log(m) });

const { address } = await lsp.enableLightningAddress();
console.log('Lightning Address:', address);

// When app is foreground / expecting payment: lsp.connect() so LSP outbox can reach you.
// Settlement is automatic — poll listPayments() or sender getLightningSendStatus until Succeeded.
```

Sender side:

```typescript
await senderLsp.connect();
await senderLsp.waitForChannel(ASSET_ID, { … });
await senderLsp.waitForOutboundLiquidity(3_000_000, { … });

const { pr } = await senderLsp.http.resolveAddress(username, 3_000_000, ASSET_ID, 1);
const pay = await senderWallet.payLightningInvoice({ lnInvoice: pr, assetId: ASSET_ID, assetAmount: 1 });

// Poll until Succeeded
const status = await senderWallet.getLightningSendStatus(pay.txid!);
```

Full flow → [async-payments.md](./async-payments.md). Demo → [rgb-sdk-rn-demo `useApayFlow.ts`](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo/blob/main/screens/apay/useApayFlow.ts).

### Claim pending HODL payments

```typescript
const claimed = await lsp.claimPendingPayments();
console.log(`Claimed ${claimed.filter(c => c.claimed).length} HODL payments`);
```

---

## LSP flows explained

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

### `POST /lightning_send` — Lightning → Lightning, across assets

```
User ─[LN, asset it holds]→ LSP  (HODL, held)
                              │ pays the third party first
        Third party ←[LN, asset in its invoice]── LSP
                              │ then claims, with the preimage
```

Use case: user wants to pay an ordinary BOLT11 denominated in an asset it does not hold. Both legs share the third party's payment hash, so the LSP cannot claim the user's payment without having been given the preimage by the third party.

SDK: `lsp.payExternalInvoice()` + `lsp.externalPaymentStatus()`

### Where conversion applies

`/lightning_receive` and `/lightning_send` both convert between two assets the LSP operator declared as a pair, 1:1, on the LSP's own books. So does an APay payment whose payer quotes an accepted asset rather than the receiver's payout asset. In every case the rate is the operator's word, not the protocol's — the two contracts are unrelated.

Worked examples: **[examples/lsp-two-assets](../examples/lsp-two-assets)**

---

## Raw HTTP client

`lsp.http` is an `IUtexoLSPClient` instance. Use it for calls not covered by `UtexoLsp`:

```typescript
// Get LSP info
const info = await lsp.http.getInfo();
console.log(`${info.pubkey}@${info.host}:${info.port}`, info.network);
// Amounts are bigint — the wire sends u64 as strings.
console.log(info.minPaymentSizeMsat, info.supportedAssets[0]?.schema);

// Resolve a Lightning Address (LNURL discovery)
const { pr } = await lsp.http.resolveAddress('alice@lsp-signet.utexo.com', 3_000_000);
await wallet.payLightningInvoice({ lnInvoice: pr });

// Get the Lightning Address assigned to a peer pubkey
const addr = await lsp.http.getLightningAddressByPubkey(peerPubkey);
console.log(`${addr.username}@${addr.domain}`);
```
