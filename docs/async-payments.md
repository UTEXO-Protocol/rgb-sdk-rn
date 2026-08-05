# Async Payments (APay)

Async payments let a recipient receive Lightning while **offline at payment time**. The recipient pre-registers a **hash pool** with an always-online **Host RLN** (LSP node). Payers use a stable **Lightning Address** (`username@domain`); each payment gets a fresh HODL BOLT11.

**Protocol spec:** [Async Payments — RGB Lightning Node & Utexo LSP](https://hackmd.io/@xalkan/async-payments)

**Working demo:** [rgb-sdk-rn-demo `screens/apay/useApayFlow.ts`](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo/blob/main/screens/apay/useApayFlow.ts)

---

## Roles

| Role | Component | Your app calls it? |
|------|-----------|-------------------|
| Recipient | Recipient RLN on device | Yes — register pool, **`lsp.connect()` while online** |
| Host | LSP's RLN node | No — P2P + HTTP to utexo-lsp |
| Orchestrator | utexo-lsp | Partial — LNURL + discovery HTTP only |
| Payer | Sender RLN on device | Yes — LNURL + pay + poll send status |

> **Important:** APay settlement is **automatic**. When the LSP outbox pays the merchant's outbound invoice, the recipient node auto-claims (`async_payment_recipient: true`). Your app calls `lsp.connect()` while online and polls for `Succeeded`. See [Lightning Address vs HODL invoice](#lightning-address-vs-hodl-invoice) below.

---

## Six-step flow

```mermaid
flowchart TD
  S1["① Register hash pool<br/><b>Recipient app</b><br/>lsp.connect()<br/>lsp.enableLightningAddress()"]
  S2["② Payer fetches invoice<br/><b>Sender app</b><br/>lsp.http.resolveAddress(…)<br/>→ HODL BOLT11 from Host /lninvoice"]
  S3["③ Payer pays<br/><b>Sender app</b><br/>wallet.payLightningInvoice(pr)<br/>HTLC held at Host — not settled yet"]
  S4["④ Request outbound invoice<br/><b>Automatic</b> — utexo-lsp outbox + Host RLN<br/>P2P apay/request_invoice → Recipient RLN"]
  S5["⑤ Outbound pay + auto-claim<br/><b>Automatic</b> — Host pays Recipient<br/>Recipient RLN auto-claims (no app claim)"]
  S6["⑥ Claim inbound<br/><b>Automatic</b> — utexo-lsp outbox + Host RLN<br/>settles payer HTLC with preimage"]

  S1 --> S2 --> S3 --> S4 --> S5 --> S6
  S6 -.->|pool empty| S1

  style S1 fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
  style S2 fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
  style S3 fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
  style S4 fill:#1a2e1a,stroke:#4ade80,color:#e2e8f0
  style S5 fill:#1a2e1a,stroke:#4ade80,color:#e2e8f0
  style S6 fill:#1a2e1a,stroke:#4ade80,color:#e2e8f0
```

| Step | What happens | Who drives it | SDK call |
|------|-------------|---------------|----------|
| **①** | Address provisioned on connect; attested hash batch stored | **Recipient app** | `lsp.connect()` → `lsp.enableLightningAddress()` |
| **②** | Hash slot reserved; inbound HODL BOLT11 from Host | **Sender app** | `lsp.http.resolveAddress(username, amtMsat, assetId?, assetAmount?)` |
| **③** | Payer pays BOLT11; inbound HTLC held at Host | **Sender app** | `lsp.waitForOutboundLiquidity(…)` then `wallet.payLightningInvoice(…)` |
| **④** | Outbox asks Recipient for outbound invoice over P2P | **Host + utexo-lsp** | Recipient must be reachable — **`lsp.connect()`** |
| **⑤** | Host pays outbound invoice; Recipient **auto-claims** | **Host + Recipient RLN** | App: optional `listPayments()` → `INBOUND_HODL/SUCCEEDED` |
| **⑥** | Host settles payer HTLC with preimage | **Host + utexo-lsp** | App: poll `getLightningSendStatus(hash)` → `Succeeded` |

**Blue steps (①②③)** — your app. **Green steps (④⑤⑥)** — LSP outbox; recipient app keeps **`lsp.connect()`** alive when online.

When `unusedHashes` runs low, call `lsp.refillHashPool()` to register a fresh attested batch.

---

## Sequence diagram

```mermaid
sequenceDiagram
  autonumber
  participant RB as Recipient app
  participant RR as Recipient RLN
  participant SA as Sender app
  participant SR as Sender RLN
  participant H as Host RLN
  participant L as utexo-lsp

  Note over RB,L: ① Register
  RB->>RR: lsp.connect()
  Note over L: cron provisions account on peer connect
  RB->>L: GET /lightning_address/by_pubkey/{pubkey}
  L-->>RB: username, domain
  RB->>RR: enableLightningAddress → apayNewWithAddress(lspPubkey, username, domain)
  RR--)H: async_order.new + address_sig (P2P)
  H->>L: POST /internal/async_order/new

  Note over SA,L: ②③ Pay (LNURL callback — no P2P to Recipient yet)
  SA->>L: LNURL /.well-known/lnurlp/{username}
  L->>H: POST /lninvoice (hodl, reserved hash)
  H-->>L: inbound HODL BOLT11
  L-->>SA: pr
  SA->>SR: payLightningInvoice(pr)
  SR->>H: HTLC (held)

  Note over H,L: ④⑤⑥ Settle (Recipient must be online for ④)
  H->>L: POST /internal/async_order/claimable
  L->>H: outbox: request outbound invoice
  H--)RR: apay/request_invoice (P2P)
  RR-->>H: outbound BOLT11 (async_payment_recipient)
  H->>RR: pay outbound
  Note over RR: auto-claim — no app claimHodlInvoice
  RR-->>H: preimage
  L->>H: outbox: claim inbound HTLC (⑥)
  SR->>H: payer HTLC Settled
```

---

## SDK usage

### Wallet + LSP setup

**Utexo / signet (production):**

```typescript
const wallet = new UTEXOWallet({
  ...nodeParams,
  network:        'utexo',          // lspBaseUrl optional on utexo (defaults to https://lsp-signet.utexo.com)
  lspBearerToken: 'bearer-token',
}, signer);

// createLsp() before init(): discovers pubkey, host and port from GET /get_info
// and auto-wires virtual channels into the node params.
const lsp = await wallet.createLsp();

await wallet.init();
await wallet.unlock(unlockParams);
```

**Regtest local demo** (virtual 0-conf channels — not required on signet):

```typescript
const wallet = new UTEXOWallet({
  ...nodeParams,
  lspBaseUrl:              'http://127.0.0.1:8080',
  enableVirtualChannelsV0: true,
  virtualPeerPubkeys:      [lspPeerPubkey],  // fetch once from GET /get_info
}, signer);

// The port argument is only a fallback for an LSP that publishes no address.
const lsp = await wallet.createLsp(undefined, 9737);
```

Explicit `LspPeer` + `createLsp(LSP_PEER)` is still valid when you cannot set `lspBaseUrl` on the wallet (e.g. Android emulator host override).

### ① Recipient — register + Lightning Address

Both sides need an RGB channel first: `lsp.connect()` → `lsp.waitForChannel(assetId, { … })`.

```typescript
await lsp.connect();  // connect first — the LSP mints the address only for connected peers

// Resolves the minted address, then registers one attested batch:
const { address } = await lsp.enableLightningAddress();
console.log(`Lightning Address: ${address}`);

// Keep calling lsp.connect() while the app is in the foreground and expecting
// payments, so the LSP outbox can reach the node over P2P when a payer pays.
```

To do it manually, resolve the address first, then register:

```typescript
const { username, domain } = await lsp.http.getLightningAddressByPubkey(walletPubkey);
const pool = await wallet.apayNewWithAddress(lspPubkey, username, domain);
```

> `wallet.apayNew(lspPubkey)` registers the same pool without the address attestation (no `address_sig`). Use `apayNewWithAddress` for the attestation, which guards against hash substitution.

### ②③ Sender — LNURL pay

```typescript
await senderLsp.connect();
await senderLsp.waitForChannel(ASSET_ID, { … });
await senderLsp.waitForOutboundLiquidity(3_000_000, { … });

const { pr } = await senderLsp.http.resolveAddress(
  username, 3_000_000, ASSET_ID, 1,
);

const payResult = await senderWallet.payLightningInvoice({
  lnInvoice:   pr,
  assetId:     ASSET_ID,
  assetAmount: 1,
});
// payResult.status is usually Pending — HTLC held at Host
const paymentHash = payResult.txid;
```

`lsp.payAddress({ address, amtMsat, asset })` resolves + pays in one call but **does not wait** for APay LSP outbox settlement.

### ④⑤⑥ Settlement — poll until complete

**Recipient** (when app resumes / comes online):

```typescript
await lsp.connect();
await wallet.syncWallet();

const payments = await wallet.listPayments();
// APay inbound: INBOUND_HODL → SUCCEEDED (auto-claim, no claimHodlInvoice)
```

**Sender:**

```typescript
const status = await senderWallet.getLightningSendStatus(paymentHash);
// Poll until status === 'Succeeded' (or 'Failed')
```

**Success checks (RGB):**

- Sender: `getLightningSendStatus` → `Succeeded`
- Recipient: inbound `INBOUND_HODL/SUCCEEDED`, or `getAssetBalance(assetId).offchainOutbound` increased
- Use **`offchainOutbound`** (local spendable RGB), not `offchainInbound`, for receive confirmation

---

## Lightning Address vs HODL invoice

| | **Lightning Address (APay)** | **HODL invoice you create** |
|---|------------------------------|-------------------------------|
| Register | `enableLightningAddress()` (→ `apayNewWithAddress`) | `createHodlInvoice({ paymentHash, … })` |
| Payer path | LNURL → Host HODL BOLT11 | Pay BOLT11 directly |
| Recipient claim | **Automatic** (RLN auto-claim) | **`claimHodlInvoice(hash, preimage)`** |
| Helper | — | `lsp.claimPendingPayments()` |

```typescript
// After createHodlInvoice — claim when status is Claimable
for (const p of await wallet.listPayments()) {
  if (p.paymentType !== 'InboundHodl' || p.status !== 'Claimable') continue;
  if (!p.preimage) continue;
  await wallet.claimHodlInvoice(p.paymentHash, p.preimage);
}
```

---

## API reference

| Method | Step | Description |
|--------|------|-------------|
| `lsp.connect()` | ①④ | Lightning P2P to Host — call before register and when coming online |
| `lsp.waitForChannel(assetId)` | ①③ | Wait for usable RGB channel |
| `lsp.enableLightningAddress()` | ① | `getLightningAddressByPubkey` (poll) → `apayNewWithAddress` |
| `lsp.refillHashPool()` | ① | Top up the hash pool with a fresh attested batch |
| `lsp.http.resolveAddress(…)` | ② | LNURL callback → HODL BOLT11 |
| `lsp.waitForOutboundLiquidity(msat)` | ③ | Confirm sender can route before pay |
| `wallet.payLightningInvoice(…)` | ③ | Pay HODL invoice |
| `wallet.getLightningSendStatus(hash)` | ⑥ | Poll sender until `Succeeded` |
| `wallet.listPayments()` | ⑤ | Monitor recipient inbound (`SUCCEEDED`) |
| `wallet.getAssetBalance(assetId)` | ⑤ | Confirm RGB received (`offchainOutbound` ↑) |
| `wallet.createHodlInvoice(…)` | — | Issue a HODL invoice you control (pairs with claim below) |
| `wallet.claimHodlInvoice(…)` | — | Reveal preimage for a `createHodlInvoice` payment |
| `lsp.claimPendingPayments()` | — | Claim all pending HODL payments after unlock |

**Not called from the app:** `POST /internal/async_order/*` — Host RLN uses those with utexo-lsp.

### `LightningPayment` fields (from `listPayments`)

| Field | Type | Description |
|-------|------|-------------|
| `paymentHash` | `string` | Payment identifier |
| `paymentType` | `'Outbound' \| 'InboundAutoClaim' \| 'InboundHodl'` | APay receive: `INBOUND_HODL` |
| `status` | `'Pending' \| 'Claimable' \| 'Claiming' \| 'Succeeded' \| …'` | APay complete: `Succeeded` |
| `preimage` | `string?` | On `Claimable` HODL invoices — pass to `claimHodlInvoice` |
| `assetId` / `assetAmount` | optional | RGB leg |

---

## utexo-lsp public endpoints used

| Method | Path | Step |
|--------|------|------|
| GET | `/.well-known/lnurlp/{username}` | ② LNURL metadata |
| GET | `/pay/callback/{username}?amount=…&asset_id=…&asset_amount=…` | ② HODL BOLT11 |
| GET | `/lightning_address/by_pubkey/{pubkey}` | ① discovery before register (address provisioned on connect) |
