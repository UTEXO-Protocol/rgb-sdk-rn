# Bug: `apay_new` always fails with `InvalidRequest` — JSON type mismatches on `async_order/new`

**Repos affected:** `rgb-lightning-node` + `utexo-lsp`  
**Branches checked:** `rgb-lightning-node@upstream/dev`, `utexo-lsp@origin/main`  
**Severity:** Blocker — async payment registration (`apay_new` / `apayRegisterHashPool`) is completely non-functional end-to-end

---

## Summary (2026-06-01)

There are **two independent JSON type mismatches** on the LSP host ↔ utexo-lsp HTTP path. Fixing only one is not enough.

| Direction | Field | RLN sends/expects | utexo-lsp expects/returns | Status |
|-----------|-------|-------------------|---------------------------|--------|
| **Response** | `accepted_through_index`, etc. | `u64` (number) | was `string`, now `uint64` locally | **Fixed locally** in `utexo-lsp` |
| **Request** | `hash_index` in `hashes[]` | `u64` → JSON **number** | Go `string` → JSON **string** | **Still broken** — current blocker |

Mobile logs only show `msg=invalid request` because UniFFI maps all `APIError::InvalidRequest(_)` to `RlnError::InvalidRequest` without exposing the stashed detail (`async_order host error -32700: parse error`).

---

## Root cause #1 (response) — fixed locally

`utexo-lsp` used to serialize the numeric index fields of `AsyncOrderNewResponse` as **JSON strings**, but `rgb-lightning-node` deserializes the same fields as **`u64` integers`. Serde rejects the string-encoded integers and returns a deserialization error, which propagates back to the recipient node as `RlnError::InvalidRequest`.

**utexo-lsp** — `internal/lspapi/models.go`:
```go
type AsyncOrderNewResponse struct {
    ProtocolVersion      uint64           `json:"protocol_version"`  // number ✓
    OrderID              string           `json:"order_id"`          // string ✓
    Status               AsyncOrderStatus `json:"status"`
    AcceptedThroughIndex string           `json:"accepted_through_index"`  // ← string ✗
    NextIndexExpected    string           `json:"next_index_expected"`     // ← string ✗
    UnusedHashes         string           `json:"unused_hashes"`           // ← string ✗
    RefillBatchSize      string           `json:"refill_batch_size"`       // ← string ✗
}
```

**rgb-lightning-node** — `src/async_order.rs`:
```rust
pub(crate) struct AsyncOrderNewResultWire {
    pub(crate) protocol_version: u64,
    pub(crate) order_id: String,
    pub(crate) status: String,
    pub(crate) accepted_through_index: u64,  // ← expects number
    pub(crate) next_index_expected: u64,      // ← expects number
    pub(crate) unused_hashes: u64,            // ← expects number
    pub(crate) refill_batch_size: u64,        // ← expects number
}
```

**Observed wire response** (via curl with correct bearer token):
```json
{
  "jsonrpc": "2.0",
  "id": "test-1",
  "result": {
    "protocol_version": 1,
    "order_id": "1",
    "status": "active",
    "accepted_through_index": "1",
    "next_index_expected": "2",
    "unused_hashes": "1",
    "refill_batch_size": "200"
  }
}
```

The numeric fields are strings. Rust's `serde_json` returns `utexo_lsp_invalid_response: invalid type: string "1", expected u64`, which becomes `JsonRpcErrorWire::internal_error(...)` on the host, sent back to the recipient via P2P, and surfaces as `RlnException.InvalidRequest` in the mobile SDK.

---

## Reproduction steps

1. Start `utexo-lsp` with a valid `APAY_BEARER_TOKEN`
2. Start `rgb-lightning-node` (LSP) with `--enable-virtual-channels-v0 --lsp-base-url <utexo-lsp-url> --lsp-bearer-token <token>`
3. Connect a recipient SDK node (with `enableVirtualChannelsV0: true`) to the LSP and wait for a virtual channel to open
4. Call `apay_new` on the recipient node with the LSP's peer pubkey as `host_node_id`
5. Observe `RlnException.InvalidRequest` on the recipient

Or reproduce the JSON mismatch directly:
```bash
curl -s http://127.0.0.1:8080/internal/async_order/new \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <APAY_BEARER_TOKEN>' \
  -d '{
    "id": "test-1",
    "peer_pubkey": "<any_32_byte_hex_pubkey>",
    "protocol_version": 1,
    "hashes": [{"hash_index": "1", "payment_hash": "aa...aa"}]
  }'
# → numeric fields in result are strings, not numbers
```

---

## Fix

**Option A (recommended) — fix utexo-lsp** to return numbers:

```go
// internal/lspapi/models.go
type AsyncOrderNewResponse struct {
    ProtocolVersion      uint64           `json:"protocol_version"`
    OrderID              string           `json:"order_id"`
    Status               AsyncOrderStatus `json:"status"`
    AcceptedThroughIndex uint64           `json:"accepted_through_index"`
    NextIndexExpected    uint64           `json:"next_index_expected"`
    UnusedHashes         uint64           `json:"unused_hashes"`
    RefillBatchSize      uint64           `json:"refill_batch_size"`
}
```

**Option B — fix rgb-lightning-node** to accept string-or-number using `serde_with::DisplayFromStr` on the four fields.

Option A is simpler. The values are small hash indices well within JavaScript's safe integer range (`Number.MAX_SAFE_INTEGER = 2^53 - 1`), so there is no JSON precision risk.

**Local status:** `utexo-lsp/internal/lspapi/models.go` already uses `uint64` for the four index fields. curl with `"hash_index": "1"` now returns numeric result fields.

---

## Root cause #2 (request) — **current blocker**

When the LSP host receives `async_order.new` over P2P from User B, it forwards the batch to utexo-lsp via HTTP. The Rust HTTP client serializes `AsyncOrderNewHashWire.hash_index: u64` as a JSON **number**, but utexo-lsp's request struct requires a JSON **string**:

**rgb-lightning-node** — `src/async_order.rs` (HTTP body built from P2P params):
```rust
struct AsyncOrderNewLspRequest {
    // ...
    hashes: Vec<AsyncOrderNewHashWire>,  // hash_index: u64 → JSON number
}

pub struct AsyncOrderNewHashWire {
    pub hash_index: u64,
    pub payment_hash: String,
}
```

**utexo-lsp** — `internal/lspapi/models.go`:
```go
type AsyncOrderNewHashInput struct {
    HashIndex   string `json:"hash_index"`  // expects JSON string
    PaymentHash string `json:"payment_hash"`
}
```

**Reproduction** (matches what the LSP host POSTs today):
```bash
# What rgb-lightning-node sends (FAILS — HTTP 400)
curl -s http://127.0.0.1:8080/internal/async_order/new \
  -H 'Authorization: Bearer apay-regtest-secret' \
  -H 'Content-Type: application/json' \
  -d '{"id":"x","peer_pubkey":"030983c34f...","protocol_version":1,
       "hashes":[{"hash_index":1,"payment_hash":"6a302ec8ce6f64d874d9a3bf620a91e845931f0633576f332a97498"}]}'
# → {"error":{"code":-32700,"message":"parse error"}}

# What utexo-lsp accepts (works once response fix is applied)
curl -s ... -d '{"hashes":[{"hash_index":"1","payment_hash":"6a302ec8..."}]}'
# → success (or domain error if DB state is stale)
```

The host forwards the `-32700 parse error` to User B over P2P; User B maps it to `InvalidRequest` → mobile shows generic `invalid request`.

**Fix options:**

- **Option A (recommended) — fix rgb-lightning-node:** add an LSP HTTP wire type with `hash_index: String` (same pattern as `AsyncOrderRequestInvoiceParamsWire`) and map from `AsyncOrderNewHashWire` before POST.
- **Option B — fix utexo-lsp:** accept `hash_index` as `json.Number` or custom unmarshal for string|number.

Note: P2P between User B and LSP host is fine (both Rust, both use `u64`). Only the **host → utexo-lsp HTTP** hop is broken.

---

## Log investigation notes

- **`rln-lsp.log`**: no `async_order` / `utexo_lsp` lines — the HTTP failure path does not log at INFO; User B's pubkey **does** appear (channel opened successfully).
- **`utexo-lsp.log`**: only `listening on :8080` — no per-request logging.
- **Demo app logs** (peer connected, re-connect ok, correct LSP pubkey) confirm the failure is **not** connectivity; it happens inside the async_order pipeline after P2P dispatch.

After fixing request encoding, **wipe regtest state** before retesting (`start-lsp-regtest.sh stop && start` wipes `utexo_lsp.db`; also reset User B wallet storage so `next_hash_index` starts at 1). Debug curls may have left stale hash-pool rows for User B's pubkey.

---

## Additional context

This bug was discovered while building the first real end-to-end async payment integration test against a live `utexo-lsp` + `rgb-lightning-node` regtest stack (in `rgb-sdk-rn` demo app, tab `async-pay`).

No existing e2e test exercises this code path — `test_virtual_channel_asset_payment_succeeds` uses direct node-to-node virtual channels and never calls utexo-lsp's `/internal/async_order/new`. The only test for this endpoint is the unit test `TestInternalAsyncOrderNewReturnsJsonRpcEnvelope` which constructs the response struct directly in Go and never exercises the JSON serialization round-trip against the Rust consumer.
