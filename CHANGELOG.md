# Changelog

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
