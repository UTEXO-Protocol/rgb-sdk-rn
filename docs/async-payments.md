# Async Payments (APay)

Async payments let a recipient receive Lightning while **offline at payment time**. The recipient pre-registers a **hash pool** with an always-online **Host RLN** (LSP node). Payers use a stable **Lightning Address** (`username@domain`); each payment gets a fresh HODL BOLT11.

**Protocol spec:** [Async Payments — RGB Lightning Node & Utexo LSP](https://hackmd.io/@xalkan/async-payments)

---

## Roles

| Role | Component | Your app calls it? |
|------|-----------|-------------------|
| Recipient | Recipient RLN on device | Yes — register pool, claim HODL |
| Host | LSP's RLN node | No — P2P + HTTP to utexo-lsp |
| Orchestrator | utexo-lsp | Partial — LNURL + discovery HTTP only |
| Payer | Sender RLN on device | Yes — LNURL + pay invoice |

---

## Six-step flow

```mermaid
flowchart TD
  S1["① Register hash pool<br/><b>Recipient app</b><br/>wallet.apayNew(hostPubkey)<br/>lsp.http.getLightningAddressByPubkey(pubkey)"]
  S2["② Payer fetches invoice<br/><b>Sender app</b><br/>GET /.well-known/lnurlp/{username}<br/>GET callback?amount=… → HODL BOLT11"]
  S3["③ Payer pays<br/><b>Sender app</b><br/>wallet.payLightningInvoice(pr)<br/>HTLC held at Host — not settled yet"]
  S4["④ Request outbound invoice<br/><b>Automatic</b> — utexo-lsp outbox + Host RLN<br/>async_order.request_invoice → Recipient RLN"]
  S5["⑤ Outbound pay + recipient claim<br/><b>Recipient app</b> when online<br/>listPaymentsRaw → InboundHodl Claimable<br/>claimHodlInvoice(hash, preimage)"]
  S6["⑥ Claim inbound<br/><b>Automatic</b> — utexo-lsp outbox + Host RLN<br/>claimhodlinvoice with revealed preimage"]

  S1 --> S2 --> S3 --> S4 --> S5 --> S6
  S6 -.->|pool empty| S1

  style S1 fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
  style S2 fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
  style S3 fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
  style S5 fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
  style S4 fill:#1a2e1a,stroke:#4ade80,color:#e2e8f0
  style S6 fill:#1a2e1a,stroke:#4ade80,color:#e2e8f0
```

| Step | What happens | Who drives it | SDK call |
|------|-------------|---------------|----------|
| **①** | Hash batch stored; Lightning Address minted for `peer_pubkey` | **Recipient app** | `wallet.apayNew(lspPeerPubkey)` then `lsp.http.getLightningAddressByPubkey(pubkey)` |
| **②** | Next `hash_index` reserved; inbound HODL BOLT11 issued | **Sender app** | `lsp.payAddress(...)` or raw LNURL GETs |
| **③** | Payer pays BOLT11; inbound HTLC held | **Sender app** | `wallet.payLightningInvoice({ lnInvoice })` |
| **④** | LSP notified claimable; outbox asks Recipient for outbound HODL invoice | **Host + utexo-lsp** | Recipient RLN must be online to answer P2P |
| **⑤** | Host pays outbound invoice; Recipient claims → preimage revealed | **Recipient app** | `wallet.listPaymentsRaw()` → `claimHodlInvoice(hash, preimage)` |
| **⑥** | Host claims inbound HTLC with preimage; payment complete | **Host + utexo-lsp** | — |

**Blue steps (①②③⑤)** — your app. **Green steps (④⑥)** — LSP cron/outbox; you just keep the node online for ④.

When `unusedHashes` hits zero, utexo-lsp marks the order exhausted — call `apayNew` again to refill.

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
  RB->>RR: apayNew(lspPeerPubkey)
  RR--)H: async_order.new (P2P)
  H->>L: POST /internal/async_order/new
  L-->>RR: order_id, pool stats
  RB->>L: GET /lightning_address/by_pubkey/{pubkey}
  L-->>RB: username, domain

  Note over SA,L: ②③ Pay
  SA->>L: LNURL /.well-known/lnurlp/{username}
  L->>H: request inbound HODL invoice
  H--)RR: async_order.request_invoice
  RR-->>H: BOLT11 (hodl)
  L-->>SA: pr
  SA->>SR: payLightningInvoice(pr)
  SR->>H: HTLC (held)

  Note over H,L: ④⑤⑥ Settle
  H->>L: POST /internal/async_order/claimable
  L->>H: outbox: outbound invoice + pay
  H--)RR: async_order.request_invoice
  RR-->>H: outbound BOLT11
  H->>RR: pay outbound
  RB->>RR: claimHodlInvoice (⑤)
  RR-->>H: preimage
  L->>H: outbox: claimhodlinvoice (⑥)
```

---

## SDK usage

Recipient wallet must be constructed with `enableVirtualChannelsV0: true` (required for the LSP's 0-conf virtual channel offer):

```typescript
import { UTEXOWallet, type LspPeer } from '@utexo/rgb-sdk-rn';

const wallet = new UTEXOWallet({
  ...nodeParams,
  lspBaseUrl:              'https://lsp-signet.utexo.com',
  lspBearerToken:          'bearer-token',
  enableVirtualChannelsV0: true,
}, signer);

await wallet.init();
await wallet.unlock(unlockParams);

const LSP_PEER: LspPeer = {
  baseUrl:    'https://lsp-signet.utexo.com',
  peerPubkey: lspPeerPubkey,
  peerHost:   'lsp-signet.utexo.com',
  peerPort:   9735,
};
const lsp = await wallet.createLsp(LSP_PEER);
```

### ① Register + get Lightning Address

```typescript
// Connect to LSP peer first
await lsp.connect();

// Register hash pool — sends hashes to Host over P2P onion
const pool = await wallet.apayNew(lspPeerPubkey);
console.log(`${pool.hashes.length} hashes issued, ${pool.unusedHashes} unused`);

// Fetch the auto-generated Lightning Address for this wallet
const addr = await lsp.http.getLightningAddressByPubkey(walletPubkey);
console.log(`Lightning Address: ${addr.username}@${addr.domain}`);

// Or use the one-shot helper (combines both calls above):
const { address } = await lsp.enableLightningAddress();
console.log(`Lightning Address: ${address}`);
```

### ③ Sender pays (on the sender's device)

```typescript
// Option A — via UtexoLsp (handles LNURL resolution + pay)
await senderLsp.payAddress({
  address: 'alice@lsp-signet.utexo.com',
  amtMsat: 3_000_000,
  asset:   { assetId: ASSET_ID, assetAmount: 1 },
});

// Option B — manual (if you need to inspect the HODL invoice before paying)
const { pr } = await senderLsp.http.resolveAddress(username, 3_000_000, ASSET_ID, 1);
await senderWallet.payLightningInvoice({ lnInvoice: pr, assetId: ASSET_ID, assetAmount: 1 });
```

### ⑤ Recipient comes online and claims

```typescript
await wallet.syncWallet();
const payments = await wallet.listPaymentsRaw();

for (const p of payments) {
  if (p.paymentType !== 'InboundHodl' || p.status !== 'Claimable') continue;
  if (!p.preimage) continue;

  const result = await wallet.claimHodlInvoice(p.paymentHash, p.preimage);
  if (result.changed) console.log(`Claimed: ${p.amtMsat} msat`);
}

// Or use the one-shot helper:
const claimed = await lsp.claimPendingPayments();
```

---

## API reference

| Method | Step | Description |
|--------|------|-------------|
| `wallet.apayNew(hostNodeId)` | ① | Register hash pool with Host RLN |
| `lsp.http.getLightningAddressByPubkey(pubkey)` | ① | Resolve `username` + `domain` after registration |
| `lsp.enableLightningAddress()` | ① | `apayNew` + `getLightningAddressByPubkey` in one call |
| `senderLsp.payAddress({ address, amtMsat, asset? })` | ②③ | LNURL resolution + pay |
| `wallet.payLightningInvoice({ lnInvoice })` | ③ | Pay HODL BOLT11 directly |
| `wallet.listPaymentsRaw()` | ⑤ | Find `InboundHodl` + `Claimable` + `preimage` |
| `wallet.claimHodlInvoice(paymentHash, preimage)` | ⑤ | Reveal preimage; LSP settles inbound HTLC |
| `lsp.claimPendingPayments()` | ⑤ | Filter + claim all claimable in one call |

**Not called from the app:** `POST /internal/async_order/*` — Host RLN uses those internally with utexo-lsp.

---

## utexo-lsp public endpoints used

| Method | Path | Step |
|--------|------|------|
| GET | `/.well-known/lnurlp/{username}` | ② LNURL metadata |
| GET | `/pay/callback/{username}?amount=…&asset_id=…&asset_amount=…` | ② HODL BOLT11 |
| GET | `/lightning_address/by_pubkey/{pubkey}` | ① discovery after register |
