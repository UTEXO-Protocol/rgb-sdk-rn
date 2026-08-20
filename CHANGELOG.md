# Changelog

## 1.0.0-beta.29

__changed__
- Bumped `@utexo/rgb-sdk-core` to **1.0.0-beta.8**.
- **`lsp.receiveAsset()` no longer sends the on-chain asset id by default.** You name only what you are paid over Lightning; the LSP resolves the on-chain counterpart from its own convertible pairs, so a sender can pay in the canonical asset it already holds without that contract id ever being configured here. It comes back as `onchainAssetId`, with `converted` saying whether the two legs differ. Pass `onchainAsset: 'payout'` for the previous one-asset-end-to-end behaviour — also the only form LSPs predating convertible `/lightning_receive` accept.

__added__
- Re-exports for the new LSP surface in core, so it is reachable from `@utexo/rgb-sdk-rn` directly:
  - `lsp.quoteAddress()` — everything `payAddress` does except paying.
  - `lsp.discoverAddress()` / `lsp.listPayableAssets()` — what an address can be paid in, from LNURL discovery, with tickers and precisions.
  - `lsp.requestExternalInvoice()` — quote a hosted BOLT11 for a payer that is not this wallet. Any RGB Lightning node with the right channel settles it with a bare `POST /sendpayment`; no LNURL and no SDK on that side.
  - `lsp.payExternalInvoice()` / `lsp.quoteExternalPayment()` / `lsp.externalPaymentStatus()` — pay a third party's plain BOLT11 out of an asset this wallet does not hold. Both legs share the third party's payment hash, and the SDK decodes the LSP's HODL invoice locally and refuses the quote unless the hash, the assets and the amounts match what the LSP reported.
  - Types `PayAddressAssetParam`, `AddressQuote`, `PayableAssets`, `RequestExternalInvoiceOptions`, `ExternalInvoice`, `PayExternalInvoiceOptions`, `ExternalPaymentQuote`, `SelectPaymentAssetOptions`, `AssetSelection`, `LspSupportedAsset`, `LspLnurlpDiscovery`, `LspLightningSend*`; errors `LspAmbiguousPayableAssetError`, `LspInsufficientAssetLiquidityError`, `LspNoPayableAssetError`, `LspQuoteMismatchError`, `LspUnknownPayableAssetError`.
- `lsp.payAddress()` accepts an asset leg with no `assetId`, which asks the SDK to choose one: it reads the address's payout and accepted assets off discovery and picks by local liquidity, returning the choice as `assetSelection`. Conversion is the fallback, not the default.
- **[examples/lsp-two-assets](./examples/lsp-two-assets)** — four annotated flows for an LSP serving one asset over Lightning and converting another 1:1: paying a Lightning Address, being paid by an outside node, paying an outside node's invoice, and receiving on-chain in one asset to be delivered another.
- `docs/lsp.md` covers all of the above, plus `POST /lightning_send` and the full error list.

## 1.0.0-beta.28

__changed__
- Bumped RLN native bindings to **v0.11.0-beta.3** (from `0.10.0-beta.3`) — iOS xcframework and the Maven artifact `com.utexo:rgb-lightning-node-android`.
- The binding merged the txid-filtered list calls into the general ones: `listTransactionsByTxid(txid, skipSync)` → `listTransactions(skipSync, txid)`, `listTransfersByTxid(txid)` → `listTransfers(assetId, txid)`, with `assetId` now nullable. The native layers were rewired accordingly; **the JS surface is unchanged** — `listTransactionsByTxid()` / `listTransfersByTxid()` / `listTransfers()` keep working exactly as before, and `listTransfers()` with no asset id now passes `null` instead of an empty string.

__added__
- Linked-asset fields on IFA assets, surfaced by `rlnListAssets` and `rlnIssueAssetIfa`: `issuanceLinkRightOutpoint` (`{ txid, vout }`), `linkedFromAssetId`, `linkedToAssetId` (`RlnAssetIfa` in `src/binding/rln-types.ts`).
- `proxyRecipientId` on transfers (`RlnTransfer`) and on the decoded RGB invoice (`RlnDecodeRgbInvoiceResponse`) — the recipient id as registered with the proxy, which may differ from `recipientId`.

Both live on the raw `Rln*` binding types only; they do not reach the `UTEXOWallet` return types until `@utexo/rgb-sdk-core` declares them.

__not wired yet__
- `assetLink(SdkAssetLinkRequest)` (link a child asset to a parent) and the new `issuanceType` field on the IFA issuance request (`Legacy` / `LinkRightOnly` / `LinkedFromParent`) exist in `0.11.0-beta.3` but are not exposed through the TurboModule yet.
- `Payment.description` and `LnInvoiceRequest.description` are likewise available in the binding but not bridged (the bridge does not surface `descriptionHash` either).

## 1.0.0-beta.27

__changed__
- Bumped `@utexo/rgb-sdk-core` to **1.0.0-beta.7**. `LspGetInfoResponse` gains optional `host`/`port` fields (P2P address, additive-only contract).
- **`createLsp()` no-arg form now discovers peer host and port from `GET /get_info`** instead of taking the hostname from `lspBaseUrl` and defaulting the port to `9735`. Falls back to the HTTP hostname and the `peerPort` argument only when the LSP publishes no address.

## 1.0.0-beta.26

__changed__
- Bumped RLN native bindings to **v0.10.0-beta.3** (from `0.9.0-beta.3`). The only binding API change is a new `RlnError.FailedVssInit` variant, so no call sites moved.
- **Native errors now carry the real reason instead of a generic category message.** Previously every node-state conflict surfaced as `"conflict with current node state"`, no matter whether the wallet already had enough UTXOs, the node was already initialized, fees could not be estimated, or the network did not match. The `RlnError` variants now carry the underlying `APIError` display string, so the rejection reaching JS has the actual message (e.g. `"wallet has enough allocations available"`) while `error.code` keeps the category (`Conflict`, `NotFound`, `InsufficientFunds`, …). Note the category is still coarse — `AllocationsAlreadyAvailable`, `NetworkMismatch`, `CannotEstimateFees` and friends all remain `Conflict`, distinguishable only by message.
- **iOS `errorCode` is now the error category, not `"RlnError"`.** `RgbSwiftHelper` derived the code from the Swift type name, which for a UniFFI enum is just the enum itself, so every RLN failure reached JS as `code: "RlnError"`. It now reports the case name, matching what Android already reported.

__fixed__
- Conflict-retry paths (`rlnInitNode`, `rlnUnlockNode`, `rlnUnlockNodeWithExternalSigner`) no longer depend on the word "conflict" appearing in the message. With the richer messages from `0.10.0-beta.3` the old text match would have stopped firing, silently dropping the init/unlock retry on both platforms; detection now keys off the error category.

---

## 1.0.0-beta.25

__added__
- **`verifyMessage(message, signature)`** on `UTEXOWallet` — previously threw "not implemented", now backed by the native `verifyMessage`. Verification is always against the node's own key; passing `accountXpub` throws rather than silently ignoring it.
- **`rotateVanillaAddress()`** on `UTEXOWallet` — previously threw "not implemented", now backed by the native `rotateAddress`. (`rotateColoredAddress()` still throws — the binding has no colored equivalent.)
- **`listTransactionsByTxid(txid, skipSync?)`** and **`listTransfersByTxid(txid)`** on `UTEXOWallet` — filter to a single txid instead of listing full history.
- **`reuseAddresses`** on `UTEXOWalletNodeParams` — reuse on-chain addresses instead of deriving a fresh one per call. Defaults to `false` (unchanged behaviour).
- **`pendingBlinded`** on `RlnUnspent` — blinded assignments awaiting a matching incoming transfer.

__changed__
- Bumped RLN native bindings to **v0.9.0-beta.3** (from `0.6.0-beta.2`).
- **`NativeExternalRLNSigner` now uses a disk-backed VLS store** (`NativeExternalSigner.newWithStorage`) rooted at the node's `storageDirPath`. The previous ephemeral signer lost all VLS channel state on process restart: it could re-derive channel keys from the seed but could not validate commitment state it never tracked, so payments over channels restored from LDK persistence failed validation and force-closed the channel. Existing deployments start with an empty store, so behaviour is no worse than before and correct from the next restart on. No caller changes required — `UTEXOWallet` injects the path.
- **`IRLNSigner.initNode`/`unlockNode` take an optional trailing `storageDirPath`.** Existing implementations that ignore it keep compiling; custom signers that persist state should thread it through.

__note__
- `scripts/download-rln-bindings.js` skips the download when `ios/RGBLightningNode.xcframework` already exists, so upgrading in an existing checkout requires `rm -rf ios/RGBLightningNode.xcframework` before `postinstall` — otherwise iOS keeps running the old framework against the new Android binding.

---

## 1.0.0-beta.17

__added__
- **`apayNewWithAddress(hostNodeId, username, domain)`** on `UTEXOWallet` — registers an async-payment hash pool together with a Lightning Address attestation (`address_sig`). Required for APay hash-substitution resistance; works with password and external signers. Native bridge: `rlnApayNewWithAddress` on iOS and Android.
- **`UtexoLsp.refillHashPool()`** — tops up the APay hash pool with a fresh attested batch when `unusedHashes` runs low.
- **`ApayInvoiceProof`** / **`ApayMerkleProofElement`** types — Merkle proof returned on LNURL-pay callbacks so payers can verify the payment hash before paying.
- Per-network default `lspBaseUrl` — `network: 'utexo'` resolves to `https://lsp-signet.utexo.com` when `lspBaseUrl` is omitted. Helpers in `src/wallet/network-defaults.ts`: `getDefaultLspBaseUrl(network)` and `resolveLspBaseUrl(network, lspBaseUrl?)` (throws when neither an explicit value nor a network default exists).

__changed__
- **`UtexoLsp.enableLightningAddress()`** — now polls the LSP for a provisioned username/domain (`getLightningAddressByPubkey`), then registers a single attested batch via `apayNewWithAddress` (no bootstrap `apayNew` first — avoids `invalid_hash_batch` overflow). Returns `unusedHashes`, `nextIndexExpected`, and `refillBatchSize` from the pool response.
- **`createLsp()`** — auto-wires virtual channels: fetches the LSP pubkey (`GET /get_info`), sets `enableVirtualChannelsV0: true`, and adds that pubkey to `virtualPeerPubkeys`. Callers no longer need to fetch the LSP pubkey manually for LSP-backed virtual channels.
- **`UtexoLSPClient`** — explicit snake_case wire mapping for `getLightningAddressByPubkey` (`recipient_pubkey`, `address_sig`) and LNURL-pay callbacks (`proof` → `ApayInvoiceProof`). Fixes fields that were `undefined` against utexo-lsp >= 0.6.
- Bumped RLN native bindings to **v0.6.0-beta.2** (from `0.6.0-beta.1`).

__breaking__
- **`createLsp()` must be called before `init()`/`reinit()`** — virtual-channel params are baked into the node at init time. Calling `createLsp()` after the node exists throws. Update any `init() → createLsp()` ordering to `createLsp() → init()`.

---

## 1.0.0-beta.14

__added__
- Plain BTC Lightning invoices — `createLightningInvoice` now accepts requests without `asset` (`RlnCreateLightningInvoiceRequestModel`).
- `listChannels` returns previously missing fields on both platforms: `status`, `nextOutboundHtlcLimitMsat`, `nextOutboundHtlcMinimumMsat`, `peerAlias`, `shortChannelId`, `virtualOpenMode` (host-side only).
- Canonical enum unions: `RlnTransactionType`, `RlnChannelStatus`.

__fixed__
- iOS/Android enum case divergence — enum-as-string results normalized at the `RLNBinding` boundary (`rlnInvoiceStatus`, `rlnSendPayment`, `rlnKeysend`, channel `status`, `transactionType`). Fixes settlement polling stuck on `Pending` on iOS.
- `listTransactions` — transaction types no longer collapse to `'User'`; native values map correctly onto core `TransactionType`.
- `UtexoLsp.receiveAsset` — sends the LN invoice's remaining lifetime as `durationSeconds`; full expiry failed utexo-lsp's expiry-match validation (HTTP 400) on slow invoice creation.
- `UtexoLSPClient.onchainSend` — response fields were always `undefined` (snake_case wire keys); now mapped explicitly.
- iOS build error in `Rgb.mm` — `bitcoindRpcPort` nullability conflict with the codegen protocol.

__changed__
- `UtexoLSPClient` (`getInfo`, `lightningReceive`, `onchainSend`) — strict snake_case wire parsing, defensive fallback chains removed.

---

## 1.0.0-beta.13

__added__
- `virtualPeerPubkeys` param on `UTEXOWalletNodeParams` / `IRLNNodeCreateParams` — host-key allowlist for inbound virtual channel acceptance. Pass `null` or `[]` for permissive mode (accept from any host); pass a list of pubkeys to restrict to specific hosts. Wired through the full native stack: `NativeRgb.ts` spec → `RLNBinding` → `RgbModule.kt` (Android) and `RgbSwiftHelper.swift` (iOS).
- `docs/virtual-channels.md` — full reference for virtual channels: roles, open/payment/close flows, no-user-value predicate, allowlist semantics, and SDK usage examples.
- Virtual Channels section in `Readme.md` with setup snippet, channel readiness poll, and payment example.

---

## 1.0.0-beta.12

__added__
- **VSS (Versioned Storage Service)** — encrypted remote node backup. New `UTEXOWalletNodeParams` fields: `vssUrl`, `vssAllowHttp`, `vssAllowEmptyRestore`. New method `vssClearFence(password)` to release the single-writer fence lock during restore on a new device.
- **LSP integration** — `UtexoLsp` composed flow class (connect, wait for channel, receive/send asset, Lightning Address). Created via `wallet.createLsp(peer?)`. Raw HTTP client exposed as `lsp.http` (`UtexoLSPClient`). New types: `LspPeer`, `LspChannel`, `LspAssetConfig`. New `UTEXOWalletNodeParams` fields: `lspBaseUrl`, `lspBearerToken`.
- **Async payments (APay)** — HODL-invoice–based offline receive. New methods: `apayNew(hostNodeId)`, `createHodlInvoice(params)`, `claimHodlInvoice(paymentHash, preimage)`, `cancelHodlInvoice(paymentHash)`, `listPaymentsRaw()`.
- `enableVirtualChannelsV0` flag on `UTEXOWalletNodeParams` — enables the `trusted_no_broadcast` virtual channel mode on the node at startup.
- Network defaults — `IRLNUnlockParams` fields are now optional with sensible per-network fallbacks (`indexerUrl`, `proxyEndpoint`, `bitcoindRpc*`). Defaults managed in `src/wallet/network-defaults.ts`.
- `gossipRgsServerUrl` and `announceAlias` fields on `IRLNUnlockParams`.
- `paymentHash` and `minFinalCltvExpiryDelta` params on `createLightningInvoice` / `rlnLnInvoice` for HODL invoice support.
- `docs/lsp.md` and `docs/async-payments.md`.

__changed__
- Bumped RLN bindings to `v1.0.0-beta.12`.
- Internal refactor: removed legacy `WalletManager` abstraction; `UTEXOWallet` is now the sole public wallet class.
- `listUnspents` updated to reflect latest RLN response shape.
- `@utexo/rgb-sdk-core` dependency updated.

---

## 1.0.0-beta.10

__added__
- **`UTEXOWallet`** — new high-level wallet class implementing both `IWalletManager` and `IUTEXOProtocol`, backed by an on-device RLN (RGB Lightning Node). Replaces the old rgb-lib-backed `UTEXOWallet`.
- **`RLNManager` / `RLNBinding`** — native bridge layer exposing the full RLN node lifecycle (`rlnCreateNode`, `rlnShutdown`, `rlnDestroyNode`, all channel / payment / RGB operations) to TypeScript.
- **`IRLNSigner` + two implementations** — `PasswordRLNSigner` (password-based init/unlock) and `NativeExternalRLNSigner` (BIP39 seed, no password stored in memory), with a shared `IRLNUnlockParams` connection type.
- **Node lifecycle** — `init()` → `unlock()` → use → `shutdown()` / `reinit()` / `destroy()`. `reinit()` recreates the internal `RLNManager` so the same `UTEXOWallet` instance can be restarted after shutdown without hitting the "node already created" guard.
- **iOS / Android native bridge** (`Rgb.mm` / `RgbSwiftHelper.swift` / `RgbModule.kt`) expanded with ~60 new RLN methods. `RlnNodeStore` handles per-node lifecycle including `SHUTDOWN → INITIALIZED` restart on both platforms.

__changed__
- Old rgb-lib-backed `UTEXOWallet` removed; `src/index.ts` updated accordingly.
- README fully rewritten to document `UTEXOWallet`, both signers, lifecycle phases, method reference, and core workflows.

---
