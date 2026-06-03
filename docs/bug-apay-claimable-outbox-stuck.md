# Bug: APay stuck after payer pays — claimable 400, outbox CLTV failures

**Repos affected:** `utexo-lsp`
**Severity:** Blocker — settlement stops after inbound HTLC is held; recipient never receives `InboundHodl`
**Observed:** 2026-06-02, regtest
**Spec:** [HackMD async-payments](https://hackmd.io/@xalkan/async-payments)

---

## What breaks and where

After the payer's HTLC arrives and is held at the Host RLN, utexo-lsp must run a
settlement pipeline. That pipeline has three sequential validation bugs — each one
blocks the next step:

```
PaymentClaimable event on Host RLN
        ↓
POST /internal/async_order/claimable   ← Bug #1 always returns 400
        ↓
outbox: request outbound HODL invoice  ← Bug #2: LDK rejects delta=18 < min 42
        ↓
validate returned BOLT11 CLTV          ← Bug #3: encoded 147 ≠ requested 144
        ↓
Host pays Recipient → claimhodlinvoice → preimage → settlement  (never reached)
```

The demo app and SDK are fine. The entire failure is server-side in utexo-lsp.

---

## Which demo flows are affected

| Flow | Affected |
|------|----------|
| `lsp-regtest.tsx` — `lightning_receive` | **No** — uses on-chain RGB delivery + regular channel payment; no HODL invoices, no `claimable` notification |
| `async-pay.tsx` — full apay flow | **Yes — 100% blocker** |

In `async-pay.tsx` the failure lands in the `poll` phase, immediately after
`wA.payLightningInvoice(hodlBolt11)` succeeds:

1. User A pays → HTLC held at LSP Host RLN ✓
2. Host fires `PaymentClaimable` → `POST /internal/async_order/claimable` → **400** (bug #1)
3. Invoice stays `active` in DB; outbox is never enqueued
4. User B polls `listPaymentsRaw()` every 3 s for 90 s → "InboundHodl/Claimable: none yet"
5. `Fatal: Timeout: no Claimable InboundHodl payment appeared for User B`

---

## Root causes (all in utexo-lsp)

### Bug #1 — Wrong CLTV constant in the claimable deadline check (primary blocker)

**File:** `internal/lspapi/api.go`, `handleInternalInboundInvoiceClaimable` (~line 67)

```go
// current (wrong):
a.validateAsyncOrderClaimDeadlineWithinPolicy(
    ctx,
    *req.ClaimDeadlineHeight,
    uint64(a.cfg.APayInboundMinFinalCltvExpiryDelta),  // 144
)
```

`validateAsyncOrderClaimDeadlineWithinPolicy` computes:

```
requiredBlocks = minFinalCltvExpiryDelta + claimMarginBlocks
               = 144 + 12 = 156 blocks needed
```

But LDK's `PaymentClaimable::claim_deadline` comes from
`channelmanager.rs:8134`:

```rust
claim_deadline: Some(earliest_expiry - HTLC_FAIL_BACK_BUFFER)
// HTLC_FAIL_BACK_BUFFER = CLTV_CLAIM_BUFFER(36) + LATENCY_GRACE_PERIOD(3) = 39
```

With inbound `min_final_cltv=144`, `claim_deadline ≈ current_height + 144 − 39 = current + 105 blocks`.

**Result:** `105 ≤ 156` → always 400. Confirmed manually:

```bash
# height 503, deadline 520 → 17 blocks available, need >156
curl -s -X POST http://127.0.0.1:8080/internal/async_order/claimable \
  -H "Authorization: Bearer apay-regtest-secret" \
  -H "Content-Type: application/json" \
  -d '{"payment_hash":"6fb3720c…","amount_msat":3000000,"claim_deadline_height":520}'
# → {"error":"claim_deadline_height 520 is too close to current height 503 (have 17 blocks, need more than 156)"}
```

The correct check should use the **outbound** delta (18–42 blocks) not the inbound one (144):

```go
// fix:
a.validateAsyncOrderClaimDeadlineWithinPolicy(
    ctx,
    *req.ClaimDeadlineHeight,
    uint64(a.cfg.APayOutboundMinFinalCltvExpiryDelta),  // 42 after bug #2 fixed → requires >54 blocks, 105 > 54 ✓
)
```

---

### Bug #2 — Outbound CLTV default below LDK minimum

**File:** `internal/lspapi/config.go`, line 19

```go
// current (wrong):
defaultAPayOutboundMinFinalCltvExpiryDelta uint16 = 18
```

LDK's `MIN_FINAL_CLTV_EXPIRY_DELTA` is defined in `channelmanager.rs`:

```rust
pub const MIN_FINAL_CLTV_EXPIRY_DELTA: u16 = HTLC_FAIL_BACK_BUFFER as u16 + 3;
// = 39 + 3 = 42
```

Any `POST /apay/outboundinvoice` with `min_final_cltv_expiry_delta < 42` is rejected
by LDK with "The supplied final CLTV expiry delta was less than LDK's
MIN_FINAL_CLTV_EXPIRY_DELTA".

```go
// fix:
defaultAPayOutboundMinFinalCltvExpiryDelta uint16 = 42
```

---

### Bug #3 — Strict CLTV equality ignores LDK's +3 wire encoding

**File:** `internal/lspapi/api.go`, `validateAsyncOrderRequestInvoiceResponse` (~line 614)

```go
// current (wrong):
minCltv := uint64(params.MinFinalCltvExpiryDelta)  // e.g. 42 from config
if decoded.MinFinalCltvExpiryDelta != minCltv {    // 45 ≠ 42 → always fails
```

LDK unconditionally adds 3 when encoding `min_final_cltv_expiry_delta` into the
BOLT11 invoice (`channelmanager.rs:12930`):

```rust
min_final_cltv_expiry_delta
    .map(|x| x.saturating_add(3))     // 42 → 45 in the wire invoice
    .unwrap_or(MIN_FINAL_CLTV_EXPIRY_DELTA)
    .into()
```

So whatever value utexo-lsp requests, the decoded invoice always carries `requested + 3`.
The check must accept that:

```go
// fix:
if decoded.MinFinalCltvExpiryDelta < minCltv {
    return fmt.Errorf(
        "decoded invoice min_final_cltv_expiry_delta %d is less than requested %d",
        decoded.MinFinalCltvExpiryDelta, minCltv,
    )
}
```

---

### Bug #4 — Missing `claim_deadline_height` from Host (minor, low risk)

`PaymentClaimable::claim_deadline` in LDK is `Option<u32>`. The Host RLN forwards it
as-is. For a live held HTLC LDK always populates it, but if it were ever `None` the
JSON would serialize as `null` and utexo-lsp would return "claim_deadline_height is
required" (a different 400 with a different message).

No code fix needed immediately; note it as a defensive improvement for the Host RLN
to log the response body on any non-2xx from `/internal/async_order/claimable`.

---

## DB / log signatures when broken

**Host RLN log** (`logs/rln-lsp.log`):
```
EVENT: received payment from payment hash 6fb3720c… of 3000000 millisatoshis
WARN async_order claimable notification failed
  POST /internal/async_order/claimable returned 400 Bad Request
```

**utexo-lsp DB** (`utexo_lsp.db`):
```sql
SELECT payment_hash, status, claim_deadline_height
FROM async_rotating_invoices
WHERE payment_hash = '6fb3720c…';
-- status = active, claim_deadline_height = (NULL)   ← never reached claimable
```

**utexo-lsp cron** (if bug #1 is patched but #2/#3 remain):
```
request_outbound_invoice/… failed: The supplied final CLTV expiry delta was less than LDK's MIN_FINAL_CLTV_EXPIRY_DELTA
-- or, with delta ≥ 42 but #3 not patched:
decoded invoice min_final_cltv_expiry_delta 45 does not match requested 42
```

---

## Fixes required (utexo-lsp only)

All three are small, isolated changes:

| # | File | Change |
|---|------|--------|
| 1 | `internal/lspapi/api.go` ~line 67 | `APayInboundMinFinalCltvExpiryDelta` → `APayOutboundMinFinalCltvExpiryDelta` in claimable handler |
| 2 | `internal/lspapi/config.go` line 19 | default `APayOutboundMinFinalCltvExpiryDelta` `18` → `42` |
| 3 | `internal/lspapi/api.go` ~line 614 | `!= minCltv` → `< minCltv` in outbound invoice CLTV validation |

Also add to the `env ...` block in `start-lsp-regtest.sh` so a local deploy picks it
up without recompiling when the default changes:

```bash
APAY_OUTBOUND_MIN_FINAL_CLTV_EXPIRY_DELTA=42 \
```

> **Note:** The `.env` file in the utexo-lsp repo is not auto-loaded by the Go
> service (`os.Getenv` only). Values in `.env` have no effect unless explicitly
> exported into the process before `go run .`.

---

## Debugging checklist

```bash
# 1. After User A pays — check Host log for claimable 400
tail -f /path/to/rln-lsp.log | grep -i "claimable\|async_order"

# 2. Check invoice status in DB
sqlite3 utexo-lsp/utexo_lsp.db \
  "SELECT payment_hash, status, claim_deadline_height
   FROM async_rotating_invoices ORDER BY id DESC LIMIT 5;"

# 3. Check outbox (only populated if claimable passes)
sqlite3 utexo-lsp/utexo_lsp.db \
  "SELECT action, status, last_error
   FROM async_rotating_invoice_outbox ORDER BY id DESC LIMIT 5;"
```

**After failed runs:** wipe `utexo_lsp.db` before retrying — stale rows do not
self-heal and will block the next attempt.

---

## Related

- [bug-apay-new-invalid-request.md](./bug-apay-new-invalid-request.md) — `async_order/new`
  JSON wire types (separate issue, fixed in utexo-lsp PR #17).
