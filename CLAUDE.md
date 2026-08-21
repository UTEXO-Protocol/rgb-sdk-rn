# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@utexo/rgb-sdk-rn` is a React Native SDK for the Bitcoin RGB Protocol. It provides TypeScript bindings for an on-device RGB Lightning Node (RLN) — a native LDK-based Lightning node that runs directly on iOS and Android. The library uses the React Native new architecture (TurboModules + Codegen).

## Commands

```bash
# Build the library (outputs to lib/)
yarn build

# TypeScript watch mode during development
yarn dev

# Type-check without emitting
yarn typecheck

# Lint
yarn lint

# Format
yarn prettier

# Regenerate React Native codegen schema + native glue code
yarn codegen

# Clean build artifacts
yarn clean

# iOS native setup (run after npm install or when xcframework changes)
cd ios && pod install

# Download/refresh iOS xcframework (runs automatically on postinstall; Android AAR comes from Maven Central via Gradle)
node scripts/download-rln-bindings.js
node scripts/setup-rln-bindings.js
```

There is no JavaScript test runner. Android instrumentation tests live in `android/src/androidTest/`.

Publishing bumps version, pushes a tag, and publishes to npm:
```bash
npm run version:patch   # or version:minor / version:major
```

## Architecture

### Layer diagram

```
UTEXOWallet (src/wallet/utexo-wallet.ts)
    └── RLNManager (src/wallet/rln-manager.ts)       ← thin facade, delegates everything
            └── RLNBinding (src/binding/RLNBinding.ts) ← queues calls, manages lifecycle state
                    └── NativeRgb (src/binding/NativeRgb.ts) ← TurboModule spec ('Rgb')
                            ├── RgbModule.kt (Android)
                            └── Rgb.mm + RgbSwiftHelper.swift (iOS)
```

### `RLNBinding` — the serialization layer

All native calls pass through `withNodeQueue()`, a sequential promise chain that prevents concurrent native calls. It also manages a `lifecycleState` machine (`idle → active → shutting_down → destroying → idle`) and blocks non-lifecycle operations during shutdown/destroy. The binding holds a `rlnNodeId: number` assigned by the native layer on `rlnCreateNode`.

The native layers (iOS: `RlnNodeStore.swift`, Android: `RlnNodeStore.kt`) maintain an integer-keyed registry mapping node IDs to live `SdkNode` instances. Signer instances similarly get integer IDs (`signerId`).

### `UTEXOWallet` — the primary public API

Implements the shared `IUTEXOProtocol` contract (from `@utexo/rgb-sdk-core`). It owns the node lifecycle and type-mapping between RLN-native types (`Rln*` prefixed) and core SDK types. Web-only surface (PSBT signing, begin/end flows) lives on optional carriers that are absent here — e.g. `createUtxos()` works; the `createUtxosBegin/End()` carrier methods are not exposed.

**Node lifecycle:**
1. `init()` — `rlnCreateNode` + `signer.initNode` (writes keys to `storageDirPath`)
2. `unlock(params)` — connects to bitcoind/electrum/proxy
3. `shutdown()` — graceful stop; node state on disk is preserved
4. `reinit(params?)` — creates a fresh internal `RLNManager` (required because the old one's `rlnNodeId` blocks `rlnCreateNode`) then restarts the node
5. `destroy()` — shutdown + destroyNode + signer.dispose; use in `finally`

`initialize()` is a backward-compat alias for `init()`.

### Signers (`src/wallet/rln-signers.ts`)

Two implementations of `IRLNSigner`:

- **`PasswordRLNSigner`** — password-based auth; mnemonic only needed for first `initNode`, then cleared from memory
- **`NativeExternalRLNSigner`** — hardware-wallet style; takes mnemonic or raw seed bytes, converts to 32-byte hex seed internally; the native layer holds keys and never exposes them; recommended for production

On cold start (after `shutdown`), `NativeExternalRLNSigner.unlockNode` recreates the native signer from the stored seed hex and attaches it before unlocking.

The signer is created with a disk-backed VLS store (`NativeExternalSigner.newWithStorage`) rooted at the node's `storageDirPath`, which `UTEXOWallet` injects into `IRLNSigner.initNode`/`unlockNode`. This is what makes the cold-start path safe: an ephemeral signer can re-derive channel keys from the seed but cannot validate commitment state it never tracked, so channels restored from LDK persistence would fail validation and force-close. Signers driven outside `UTEXOWallet` may omit the path to get the legacy ephemeral behaviour.

### Native modules

**iOS**: `Rgb.mm` (ObjC++ bridge) dispatches to `RgbSwiftHelper.swift` synchronous static methods, returning NSDictionary results. The `.mm` file bridges async Promise calls into those sync helpers via Grand Central Dispatch.

**Android**: `RgbModule.kt` extends the codegen-generated `NativeRgbSpec`, dispatches each bridge call via Kotlin coroutines (`Dispatchers.IO`). The Android binding (`com.utexo:rgb-lightning-node-android:0.11.0-beta.3`) is resolved from Maven Central. JNA (`net.java.dev.jna:jna:5.17.0@aar`) is required for UniFFI.

**iOS native framework**: `RGBLightningNode.xcframework` is downloaded from GitHub releases during `postinstall` (`scripts/download-rln-bindings.js`). It is not committed. Version is pinned at `0.11.0-beta.3`. For local development with a custom build, place `swift-release.zip` at `src/bindings/swift-release.zip` — the script will use it instead.

### Type mapping

`src/binding/rln-types.ts` defines raw types as the native layer returns them. `utexo-wallet.ts` contains a set of private `map*` functions (e.g. `mapAssetNia`, `mapTransaction`, `mapTransfer`) that convert these to the `@utexo/rgb-sdk-core` types that callers expect. When the native layer returns BtcBalance as a Rust Display string (e.g. `"BtcBalance(settled=100, ...)"`) `RLNBinding.normalizeBtcBalance` parses it.

### Core dependency

`@utexo/rgb-sdk-core` provides the shared contract (`IUTEXOProtocol` and its domain groups), error types, key derivation utilities, and network config. `src/index.ts` re-exports most of that surface so consumers only need one package.

### Codegen

The TurboModule spec is `src/binding/NativeRgb.ts` (module name `'Rgb'`, package `com.rgbsdkrn`). After changing the spec, run `yarn codegen` to regenerate `android/build/generated/source/codegen/`. The Android `build.gradle` sources `generated/java` and `generated/jni`.

### Build output

`react-native-builder-bob` builds from `src/` to `lib/`:
- `lib/module/` — ESM JS
- `lib/typescript/` — type declarations

The `lib/` directory and native binary artifacts (`ios/RGBLightningNode.xcframework`, `android/src/main/jniLibs/`) are excluded from git and must be built/downloaded locally.

## Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5, strict mode |
| Output | ESM (`lib/module/`) + type declarations (`lib/typescript/`) |
| Build | react-native-builder-bob |
| Native bridge | TurboModules + Codegen (React Native new architecture) |
| iOS native | `RGBLightningNode.xcframework` (downloaded via postinstall) |
| Android native | `com.utexo:rgb-lightning-node-android` from Maven Central + JNA |
| Crypto | `@noble/*` + `@scure/*` (via `@utexo/rgb-sdk-core`) |
| Linting | ESLint + Prettier |
| Package manager | yarn |

## Project Structure

```
src/
  index.ts                      Public entry — re-exports core surface + RN-specific
  binding/
    NativeRgb.ts                TurboModule spec (module name 'Rgb', package com.rgbsdkrn)
    RLNBinding.ts               Sequential call queue (withNodeQueue), lifecycle state machine,
                                normalizeBtcBalance parser
    rln-types.ts                Raw Wire types as returned by native layer (Rln* prefix)
  wallet/
    utexo-wallet.ts             UTEXOWallet — public API, implements IUTEXOProtocol,
                                owns map* converters (Wire → domain types)
    rln-manager.ts              RLNManager — thin facade over RLNBinding
    rln-signers.ts              PasswordRLNSigner, NativeExternalRLNSigner (IRLNSigner)
  scripts/
    download-rln-bindings.js    Downloads iOS xcframework from GitHub releases
    setup-rln-bindings.js       Installs xcframework into ios/
android/
  src/main/java/com/rgbsdkrn/
    RgbModule.kt                NativeRgbSpec impl, dispatches via Dispatchers.IO
    RlnNodeStore.kt             Integer-keyed registry of live SdkNode instances
ios/
  Rgb.mm                        ObjC++ bridge → RgbSwiftHelper.swift (sync static methods)
  RgbSwiftHelper.swift          Swift wrappers around RGBLightningNode.xcframework
  RlnNodeStore.swift            Integer-keyed registry of live SdkNode instances
```

## Code Conventions

**TypeScript**
- `strict: true`, `import type` for type-only imports, no `any` in status/amount code paths.
- Errors extend base classes from `@utexo/rgb-sdk-core`; call `Object.setPrototypeOf(this, new.target.prototype)` in constructors.

**Naming**
- `Rln*` prefix — raw types from the native layer (Wire types).
- `map*` — converter functions from `Rln*` Wire types to `@utexo/rgb-sdk-core` domain types; live in `utexo-wallet.ts`.
- `I*` — interfaces.
- `normalize*` — throws on invalid input; `tryNormalize*` — returns `undefined`.

**Node queue discipline** — all native calls must go through `withNodeQueue()` in `RLNBinding`. Never call native methods directly from `UTEXOWallet` or `RLNManager`. Queue ensures serial execution and blocks non-lifecycle calls during shutdown/destroy.

**Enum normalization** — Android returns `SCREAMING_SNAKE_CASE`, iOS returns `lowerCamelCase`. Always pass raw native enum values through `canonicalEnum()` before use. Never hard-code platform-specific enum strings outside the normalizer.

**Null vs undefined at bridge boundary** — native layer returns `null` for missing values; TypeScript surface uses `undefined`. `map*` functions must convert `null → undefined` explicitly.

**Type mappers** — `map*` functions in `utexo-wallet.ts` must strip all `Rln*`-prefixed keys before returning domain objects. No Wire keys must leak into the public surface.

**Adding a new native method**:
1. Add to `NativeRgb.ts` spec
2. Run `yarn codegen`
3. Implement in `RgbModule.kt` (Android) and `RgbSwiftHelper.swift` + `Rgb.mm` (iOS)
4. Add wrapper in `RLNBinding.ts` (through `withNodeQueue`)
5. Expose via `RLNManager.ts` and `UTEXOWallet`/`IUTEXOProtocol` if public

## Code Review Focus Areas

### Security

- **Seed/key material in memory**: `NativeExternalRLNSigner` holds seed hex to support cold-start re-derivation. Any change that logs, serializes, or exposes this value is a critical security bug.
- **`vssAllowHttp` defaults**: VSS over HTTP must default to `false`. PRs that change this default or make it opt-out rather than opt-in require security review.
- **`permissivePolicy` flag**: must not be set to `true` in production configs. Flag bypasses signer validation — review any PR that changes its default or passes it from external input.
- **`lspBearerToken` leakage**: must not appear in logs, error messages, or responses. Check all new logging statements in LSP flow paths.
- **TurboModule positional parameters**: codegen does not validate parameter names at runtime — only positions. A wrong parameter order passes TypeScript checking but silently sends wrong values to native. Review any reordering in `NativeRgb.ts`.

### Correctness

- **Node ID lifecycle**: `rlnNodeId` is assigned by native on `rlnCreateNode` and released on `rlnDestroyNode`. Any code path that reuses a stale `rlnNodeId` after destroy will corrupt the native registry.
- **Queue deadlock risk**: calls inside `withNodeQueue` must not await another `withNodeQueue` call. Nested queue entries deadlock.
- **Enum normalization gaps**: `canonicalEnum()` only normalizes known enum shapes. New enum types from the native layer must be added to the normalizer — otherwise they fall through as raw strings.
- **Timestamp units**: RLN returns some timestamps in seconds, others in milliseconds. Check the unit of each new timestamp field — confusing them causes display and comparison bugs.
- **Amount precision**: amounts that exceed `Number.MAX_SAFE_INTEGER` must use `bigint`. Any `Number()` conversion of a u64 amount field is a bug.
- **Transfer status fallbacks**: `mapTransfer` must not silently default an unknown status to a valid status. Unknown statuses must either throw or propagate as a typed unknown variant.

### Performance

- **Serial queue implications**: `withNodeQueue` serializes all native calls. Long-running calls (e.g. `syncWallet`) block all subsequent calls. New blocking calls must be documented and considered for cancellation support.
- **`probeNodeReady` stall**: can stall up to 24 s on cold start (worst case). Callers must not call it from UI thread without a loading state.
- **`postinstall` binary download pinning**: xcframework version is pinned. Any PR that bumps the version must verify the SHA-256 of the new artifact matches the download script's expectation.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
