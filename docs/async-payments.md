# Async Payments (APay)

Async payments let a recipient receive Lightning while **offline at payment time**. The recipient pre-registers a **hash pool** with an always-online **Host RLN** + **utexo-lsp**. Payers use a stable **Lightning Address** (`username@domain`); each payment gets a fresh HODL BOLT11.

**Protocol spec:** [Async Payments — RGB Lightning Node & Utexo LSP](https://hackmd.io/@xalkan/async-payments)

**Related docs:** [LSP implementation plan](./lsp-async-payments-implementation-plan.md) · [apay/new wire-format bugs](./bug-apay-new-invalid-request.md)

---

## Roles

| Role | Component | Your app calls it? |
|------|-----------|-------------------|
| Recipient | Recipient RLN on device | Yes — register pool, claim HODL |
| Host | LSP’s RLN node | No — P2P + HTTP to utexo-lsp |
| Orchestrator | utexo-lsp | Partial — LNURL + discovery HTTP only |
| Payer | Sender RLN on device | Yes — LNURL + pay invoice |

---

## Six-step flow (where you are)

Use the step numbers when debugging or reading demo logs (`async-pay` tab phases map to these steps).

```mermaid
flowchart TD
  S1["① Register hash pool<br/><b>Recipient app</b><br/>apayRegisterHashPool(hostPubkey)<br/>then getLightningAddressByPubkey(pubkey)"]
  S2["② Payer fetches invoice<br/><b>Sender app</b><br/>GET /.well-known/lnurlp/{username}<br/>GET callback?amount=… → HODL BOLT11"]
  S3["③ Payer pays<br/><b>Sender app</b><br/>payLightningInvoice(pr)<br/>HTLC parked at Host — not settled yet"]
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

| Step | What happens | Who drives it | SDK / HTTP |
|------|----------------|---------------|------------|
| **①** | Hash batch stored; Lightning Address minted for `peer_pubkey` | **Recipient app** | `wallet.apayRegisterHashPool(lspPeerPubkey)` then `lspClient.getLightningAddressByPubkey(recipientPubkey)` → `username@domain` |
| **②** | Next `hash_index` reserved; inbound HODL BOLT11 issued | **Sender app** | `wallet.payLightningAddress('user@domain', amtMsat)` or LNURL GETs on utexo-lsp |
| **③** | Payer pays BOLT11; inbound HTLC held (hodl) | **Sender app** | `wallet.payLightningInvoice({ lnInvoice })` — inside `payLightningAddress` or separate |
| **④** | LSP notified claimable; outbox asks Recipient for **outbound** HODL invoice | **Host + utexo-lsp** (no app code) | Recipient RLN must be **online** to answer P2P `async_order.request_invoice` |
| **⑤** | Host pays outbound invoice; Recipient claims → **preimage revealed** | **Recipient app** | `wallet.listPaymentsRaw()` → `InboundHodl` + `Claimable` → `wallet.claimHodlInvoice(paymentHash, preimage)` |
| **⑥** | Host claims inbound HTLC with preimage; payment complete | **Host + utexo-lsp** (no app code) | — |

**Blue steps (①②③⑤)** — your mobile app. **Green steps (④⑥)** — LSP cron/outbox and Host RLN; you only wait or keep Recipient RLN online for ④.

When `unused_hashes` hits zero, utexo-lsp marks the order **Exhausted** — run **①** again to refill.

---

## Sequence (control + payment legs)

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
  RB->>RR: apayRegisterHashPool
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

  Note over H,L: ④⑤⑥ Settle (mostly automatic)
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

## SDK entry points

**Recipient** (after RGB virtual channel to Host — set `enableVirtualChannelsV0: true` on both sides for regtest LSP):

```typescript
import { UTEXOWallet, UtexoLSPClient } from '@utexo/rgb-sdk-rn';

const lsp = new UtexoLSPClient({ baseUrl: 'http://127.0.0.1:8080' });

// ① Register + discover Lightning Address
await recipientWallet.apayRegisterHashPool(lspPeerPubkey);
const { username, domain } = await lsp.getLightningAddressByPubkey(recipientPubkey);
const address = `${username}@${domain}`;

// ⑤ Claim when back online
const payments = await recipientWallet.listPaymentsRaw();
const hodl = payments.find(
  (p) => p.paymentType === 'InboundHodl' && p.status === 'Claimable',
);
if (hodl?.preimage) {
  await recipientWallet.claimHodlInvoice(hodl.paymentHash, hodl.preimage);
}
```

**Sender:**

```typescript
// ②③ LNURL + pay (any host)
await senderWallet.payLightningAddress(address, 3_000_000);
```

**Not called from the app:** `POST /internal/async_order/*` — Host RLN uses those with utexo-lsp after P2P.

### API methods

| Method | Step | Description |
|--------|------|-------------|
| `apayRegisterHashPool(hostNodeId)` | ① | Register hash pool with Host RLN (LSP peer pubkey) |
| `UtexoLSPClient.getLightningAddressByPubkey(pubkey)` | ① | Resolve `username` + `domain` after registration |
| `payLightningAddress(address, amtMsat)` | ②③ | LNURL-pay discovery + pay |
| `payLightningInvoice({ lnInvoice })` | ③ | Pay HODL BOLT11 (also used inside `payLightningAddress`) |
| `listPaymentsRaw()` | ⑤ | Find `InboundHodl` + `Claimable` + `preimage` |
| `claimHodlInvoice(paymentHash, preimage)` | ⑤ | Reveal preimage; LSP settles inbound |
| `createHodlInvoice` / `cancelHodlInvoice` | — | HODL invoice helpers |

`UtexoLSPClient` also exposes `resolveAddress`, `onchainSend`, and `lightningReceive` for other LSP flows.

### utexo-lsp HTTP (public)

| Method | Path | Step |
|--------|------|------|
| GET | `/lightning_address/by_pubkey/{pubkey}` | ① — discovery after register |
| GET | `/.well-known/lnurlp/{username}` | ② — LNURL metadata |
| GET | `/pay/callback/{username}?amount=…` | ② — HODL BOLT11 (`asset_id` + `asset_amount` for RGB) |

---

## Demo tab mapping

| Demo phase | Flow step |
|------------|-----------|
| `b_init` … `b_channel` | Setup before ① |
| `register` | ① + `getLightningAddressByPubkey` |
| `a_init` … `a_channel` | Sender setup before ② |
| `lnurlp` | ② |
| `send` | ③ |
| `poll` / `claim` | ⑤ (④⑥ run in LSP while polling) |
| `done` | ⑥ complete |

**Regtest:** [rgb-sdk-rn-demo](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo) → **Async Payment** tab + `./scripts/start-lsp-regtest.sh`.

---

## Troubleshooting

- **Poll timeout / 0 payments at claim:** [bug-apay-claimable-outbox-stuck.md](./bug-apay-claimable-outbox-stuck.md)
- **`apay_new` / `InvalidRequest` on register:** [bug-apay-new-invalid-request.md](./bug-apay-new-invalid-request.md)
