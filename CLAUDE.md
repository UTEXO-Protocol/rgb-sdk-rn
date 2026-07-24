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

**Android**: `RgbModule.kt` extends the codegen-generated `NativeRgbSpec`, dispatches each bridge call via Kotlin coroutines (`Dispatchers.IO`). The Android binding (`com.utexo:rgb-lightning-node-android:0.9.0-beta.3`) is resolved from Maven Central. JNA (`net.java.dev.jna:jna:5.17.0@aar`) is required for UniFFI.

**iOS native framework**: `RGBLightningNode.xcframework` is downloaded from GitHub releases during `postinstall` (`scripts/download-rln-bindings.js`). It is not committed. Version is pinned at `0.9.0-beta.3`. For local development with a custom build, place `swift-release.zip` at `src/bindings/swift-release.zip` — the script will use it instead.

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
