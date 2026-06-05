# Changelog

---

## feat/async_payment — LSP, VSS, Async Payments

### Unlock params

**`IRLNUnlockParams` — bitcoind fields are now optional**

All four bitcoind RPC fields (`bitcoindRpcUsername`, `bitcoindRpcPassword`, `bitcoindRpcHost`, `bitcoindRpcPort`) are now optional (`string | null`). The node can unlock using only an Electrum `indexerUrl` without any bitcoind RPC. A new `gossipRgsServerUrl` field was added to support Rapid Gossip Sync.

Unlocking with both a bitcoind RPC and an `indexerUrl` throws `AmbiguousChainBackend`. Unlocking with neither throws `MissingChainBackend`.

```diff
 export interface IRLNUnlockParams {
-  bitcoindRpcUsername: string;
-  bitcoindRpcPassword: string;
-  bitcoindRpcHost: string;
-  bitcoindRpcPort: number;
+  bitcoindRpcUsername?: string | null;
+  bitcoindRpcPassword?: string | null;
+  bitcoindRpcHost?: string | null;
+  bitcoindRpcPort?: number | null;
   indexerUrl?: string | null;
   proxyEndpoint?: string | null;
   announceAddresses?: string[];
   announceAlias?: string | null;
+  gossipRgsServerUrl?: string | null;
 }
```

A new `resolveUnlockParams(network, params)` helper fills in network-appropriate defaults (indexer URL, proxy endpoint) for any fields left `null` or `undefined`, so callers can pass a minimal params object and rely on defaults for the rest.

**`UTEXOWalletNodeParams` — removed xpub fields**

`xpubVan`, `xpubCol`, and `masterFingerprint` were removed from `UTEXOWalletNodeParams`. These were never used by the native layer — the node derives its own keys from the mnemonic/seed provided to the signer. Passing them was misleading and is no longer required.

```diff
 export interface UTEXOWalletNodeParams {
   storageDirPath: string;
   daemonListeningPort: number;
   ldkPeerListeningPort: number;
   network: string;
   maxMediaUploadSizeMb?: number;
   enableVirtualChannelsV0?: boolean;
-  xpubVan: string;
-  xpubCol: string;
-  masterFingerprint: string;
   vssUrl?: string | null;
   vssAllowHttp?: boolean;
   vssAllowEmptyRestore?: boolean;
   lspBaseUrl?: string | null;
   lspBearerToken?: string | null;
 }
```

**`RlnNodeInfo` — new optional field**

```diff
+  latestRgsSnapshotTimestamp?: number | null;
```

---

### VSS backup

Encrypted remote backup of the node's LDK state, synced to a server while the node is running. Enables full node restore from only the mnemonic and password after device loss.

- Wired `vssUrl`, `vssAllowHttp`, and `vssAllowEmptyRestore` through `buildNodeParams` → `rlnCreateNode`
- Exposed `rlnVssClearFence` on `RLNBinding`, `RLNManager`, and `UTEXOWallet` as `vssClearFence(password)`
- Added Android instrumentation test `VssDirectTest.kt` for direct VSS verification
- Updated iOS bridge methods in `RGBLightningNode.swift` and `RgbSwiftHelper.swift`

**Restore pattern** — call `vssClearFence(password)` after `init()` but before `unlock()` to release the single-writer fence lock left by the previous node instance:

```typescript
await wallet.init();
await wallet.vssClearFence(password);  // clears stale lock
await wallet.unlock(unlockParams);     // pulls state from VSS
```

---

### LSP integration

Added `src/lsp/` with a typed HTTP client and a composed flow helper for the `utexo-lsp` service.

**`UtexoLSPClient`** — typed HTTP client wrapping:
- `GET /get_info` — node pubkey, host, port
- `POST /lightning_receive` — open/request inbound channel
- `GET /health`
- `GET /lightning_address/by_pubkey/{pubkey}` — resolve Lightning Address
- `GET /.well-known/lnurlp/{username}` + callback — LNURL-pay resolution
- Internal async order routes (`/internal/async_order/*`) — used by the Host RLN, not the app directly

**`UtexoLsp`** — composed helper for common LSP flows:
- `connect()` — connect to the LSP peer
- `waitForChannel(assetId, opts)` — poll until a usable RGB channel exists
- `receiveAsset(opts)` — create synchronized LN + RGB invoices
- `awaitReceiveSettlement(lnInvoice, opts)` — poll until the receive settles
- `waitForOutboundLiquidity(assetId, opts)` — poll until outbound capacity is sufficient
- `sendAsset(opts)` — resolve Lightning Address + pay to send RGB on-chain via LSP
- `payAddress(opts)` — resolve Lightning Address and pay it
- `enableLightningAddress()` — register hash pool + fetch the auto-generated Lightning Address
- `claimPendingPayments()` — find all claimable HODL payments and claim them

**`UTEXOWallet.createLsp(peer?)`**
- No-arg form: auto-discovers the peer pubkey from `GET lspBaseUrl/get_info`
- Explicit form: accepts an `LspPeer` to override any field

`lspBaseUrl` and `lspBearerToken` are passed through `buildNodeParams` → `rlnCreateNode`.

---

### Async / HODL payments (APay)

Allows a recipient to receive Lightning payments while offline. The recipient pre-registers a hash pool with an always-online Host RLN (LSP). Each incoming payment gets a fresh HODL BOLT11; the HTLC is held until the recipient comes online and claims it.

**New `UTEXOWallet` methods:**

| Method | Description |
|--------|-------------|
| `apayNew(hostNodeId)` | Register a payment hash pool with the Host RLN |
| `createHodlInvoice(params)` | Create a BOLT11 HODL invoice tied to a specific `paymentHash` |
| `claimHodlInvoice(paymentHash, preimage)` | Reveal preimage and settle the held HTLC |
| `cancelHodlInvoice(paymentHash)` | Fail the inbound HTLC back to the sender |
| `listPaymentsRaw()` | Return all payments including `InboundHodl` with `preimage` |

`createLightningInvoice` extended with two new optional params:
- `paymentHash` — tie the invoice to a specific hash (for HODL-style flows)
- `minFinalCltvExpiryDelta` — override the LDK default CLTV delta for the final hop

**New types:** `HodlInvoice`, `HodlInvoiceResult`, `ApayNewResponse`, `LspOrder`, `LspOrderStatus`

---

### Docs

- `Readme.md` — updated throughout:
  - Removed `xpubVan`, `xpubCol`, `masterFingerprint` from all examples and the params table
  - Marked all `IRLNUnlockParams` bitcoind fields as optional; added `gossipRgsServerUrl`
  - Added `vssAllowHttp`, `vssAllowEmptyRestore` to the params table
  - Added new `## VSS — Encrypted Remote Backup` section with enable + restore examples
  - Added `cancelHodlInvoice` to the method reference table
- `docs/lsp.md` — new: end-to-end LSP flow walkthrough, `UtexoLsp` method reference, examples
- `docs/async-payments.md` — new: HODL invoice protocol, six-step flow diagram, full SDK usage guide, `cancelHodlInvoice` usage, `ClaimResult` and `RlnPayment` type tables
