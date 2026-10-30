# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@utexo/rgb-sdk-rn` is a React Native SDK for the Bitcoin RGB Protocol. It supports on-chain operations via rgb-lib and Lightning payments via the on-device RGB Lightning Node (RLN) through one `UTEXOWallet` facade. RLN also supports on-chain operations. Both engines use upstream UniFFI bindings on iOS and Android; this SDK does not build a Rust adapter. The library uses the React Native new architecture (TurboModules + Codegen).

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
node scripts/download-rln-bindings.mjs
```

Tests use Node's built-in test runner. Run `npm test` for typecheck, runtime contract checks, rgb-lib tests and WebRGB tests. `tests/types/` contains compile-only API regressions (including facade method coverage); `tests/*.test.mjs` contains JavaScript tests. `npm run test:rgb-lib:ios` and `npm run test:rgb-lib:android` run the native smoke sources in `tests/native/`. The Android script uses the host JVM and needs no native artifacts. The rgb-lib session store runs against the Maven Central AAR as an instrumentation test (`android/src/androidTest/`, `RgbLibSessionStoreInstrumentationTest`), on an emulator or device.

Use `.mjs` (ES modules) for Node scripts, runtime tests and ESLint config. `babel.config.cjs` stays CommonJS for synchronous config loading. SDK source stays TypeScript; generated JavaScript in `lib/` is managed by Bob.

Publishing bumps version, pushes a tag, and publishes to npm:
```bash
npm run version:patch   # or version:minor / version:major
```

## Architecture

### Layer diagram

```
UTEXOWallet (src/wallet/utexo-wallet.ts)
    ├── RGB_LN: RlnWallet (wallet/rln/rln-wallet.ts)
    │     └── RLNManager → RLNBinding → NativeRgb ('Rgb')
    │           ├── RgbModule.kt (Android)
    │           └── Rgb.mm + RgbSwiftHelper.swift (iOS)
    └── RGB_L1: RgbLibWallet (wallet/rgb-lib/rgb-lib-wallet.ts)
          └── RgbLibWalletBackend → native.ts → NativeRgbLib ('RgbLib')
                ├── RgbLibModule.kt → RgbLibDispatcher → RgbLibSessionStore
                └── RgbLib.mm → RgbLibDispatcher → RgbLibSwiftHelper
```

### `RLNBinding` — the serialization layer

All native calls pass through `withNodeQueue()`, a sequential promise chain that prevents concurrent native calls. It also manages a `lifecycleState` machine (`idle → active → shutting_down → destroying → idle`) and blocks non-lifecycle operations during shutdown/destroy. The binding holds a `rlnNodeId: number` assigned by the native layer on `rlnCreateNode`.

The native layers (iOS: `RlnNodeStore.swift`, Android: `RlnNodeStore.kt`) maintain an integer-keyed registry mapping node IDs to live `SdkNode` instances. Signer instances similarly get integer IDs (`signerId`).

### `UTEXOWallet` — the primary public API

`RGB_L1` is the default protocol: `new UTEXOWallet({ params, keys })` (or with `protocol: 'RGB_L1'`) selects rgb-lib and satisfies the on-chain API, and a bare `UTEXOWallet` type means `UTEXOWallet<'RGB_L1'>`. RLN is selected by `{ protocol: 'RGB_LN', params, signer }` or the legacy `new UTEXOWallet(params, signer)`, and satisfies `IUTEXOProtocol` from `@utexo/rgb-sdk-core`. The legacy form infers `RGB_LN` from the signer's `protocol: 'RGB_LN'` marker. `RgbLibWallet` is internal; the public entry point does not export an alternative wallet class or factory. `restoreFromBackup` (RGB_L1 only) is a separate pre-init operation in `wallet/rgb-lib/restore.ts`. RGB_L1 `keys` (`wallet/rgb-lib/key-provider.ts`) is a mnemonic string, a reader function, `{ mnemonic }` / `{ getMnemonic }`, optionally with public keys, or public keys alone (watch-only). `resolveRgbLibKeys` validates the shape in the constructor (`INVALID_CONFIG`); `readRgbLibMnemonic` wraps only the reader call (`KEYS_UNAVAILABLE` with `cause`), so `openWallet` errors keep their codes. Native `open` derives xpubs from the mnemonic, checks given public keys against them, or opens watch-only with `mnemonic: nil`; rgb-lib's `WatchOnly` maps to `UNSUPPORTED_CAPABILITY`.

Use `AnyUtexoWallet` for a wallet that can have either protocol and narrow `wallet.protocol` before unlock/reinit or Lightning calls. A wide `UTEXOWallet<WalletProtocol>` cannot safely call unlock/reinit. Protocol selects the engine; runtime capabilities still determine whether operations such as burn are supported.

The facade owns public aliases and subclass dispatch. Keep `initialize()` calling `this.init()`, `dispose()` calling `this.destroy()`, and `refreshWallet()` calling `this.refreshTransfers()`. For `RGB_L1`, prefer `init()` followed by `goOnline(params)`; `goOnline()` guards the protocol and calls `this.unlock(params)` so subclass overrides run. Existing `unlock(params)` calls remain supported. The implementation classes own lifecycle and mapping. Web-only PSBT and begin/end carriers are absent.

**RLN node lifecycle:**
1. `init()` — `rlnCreateNode` + `signer.initNode` (writes keys to `storageDirPath`)
2. `unlock(params)` — connects to bitcoind/electrum/proxy
3. `shutdown()` — graceful stop; node state on disk is preserved
4. `reinit(params?)` — creates a fresh internal `RLNManager` (required because the old one's `rlnNodeId` blocks `rlnCreateNode`) then restarts the node
5. `destroy()` — shutdown + destroyNode + signer.dispose; use in `finally`

`initialize()` is a backward-compat alias for `init()`.

### Signers (`src/wallet/rln/rln-signers.ts`)

Two implementations of `IRLNSigner`:

- **`PasswordRLNSigner`** — password-based auth; mnemonic only needed for first `initNode`, then cleared from memory
- **`NativeExternalRLNSigner`** — hardware-wallet style; takes mnemonic or raw seed bytes, converts to 32-byte hex seed internally; the native layer holds keys and never exposes them; recommended for production

On cold start (after `shutdown`), `NativeExternalRLNSigner.unlockNode` recreates the native signer from the stored seed hex and attaches it before unlocking.

The signer is created with a disk-backed VLS store (`NativeExternalSigner.newWithStorage`) rooted at the node's `storageDirPath`, which `UTEXOWallet` injects into `IRLNSigner.initNode`/`unlockNode`. This is what makes the cold-start path safe: an ephemeral signer can re-derive channel keys from the seed but cannot validate commitment state it never tracked, so channels restored from LDK persistence would fail validation and force-close. Signers driven outside `UTEXOWallet` may omit the path to get the legacy ephemeral behaviour.

### Native modules

**iOS**: `Rgb.mm` (ObjC++ bridge) dispatches to `RgbSwiftHelper.swift` synchronous static methods, returning NSDictionary results. The `.mm` file bridges async Promise calls into those sync helpers via Grand Central Dispatch.

**Android**: `RgbModule.kt` (in `android/src/rln/java/`) extends the codegen-generated `NativeRgbSpec`, dispatches each bridge call via Kotlin coroutines (`Dispatchers.IO`). The Android binding (`com.utexo:rgb-lightning-node-android:0.17.0-beta.3`) is resolved from Maven Central. JNA (`net.java.dev.jna:jna:5.17.0@aar`) is required for UniFFI.

**RLN switch**: `rgbSdk.rln` in `package.json` (currently `false`) is read by `scripts/download-rln-bindings.mjs`, `Rgb.podspec` and `android/build.gradle`. When off, the xcframework is not downloaded, the podspec excludes `Rgb.mm`, `Rgb.h`, `RgbSwiftHelper.swift`, `RlnNodeStore.swift` and the generated RLN Swift files, and Gradle drops the RLN AAR and builds `android/src/noRln/` instead of `android/src/rln/` (`RgbModule.kt`, `RlnNodeStore.kt`, `RlnBurnRequest.kt`; tests in `src/rlnTest/` and `src/rlnAndroidTest/`). `RlnStorageClaim` stays in both builds because RGB Lib uses it. `RgbPackage` registers `Rgb` through `RlnModules`. In JS, `NativeRgb.ts` uses `TurboModuleRegistry.get`, and `RLNBinding` throws `NATIVE_BACKEND_UNAVAILABLE` from its constructor and every native call when the module is missing.

**iOS native framework**: `RGBLightningNode.xcframework` is downloaded from GitHub releases during `postinstall` (`scripts/download-rln-bindings.mjs`). It is not committed. Version is pinned at `0.17.0-beta.3`; `ios/.rln-ios-version` tracks the installed release so older or unversioned frameworks are replaced. Only the pinned release is used; local archives and environment overrides are not supported.

### Type mapping

`src/binding/rln-types.ts` defines raw types as the native layer returns them. `wallet/rln/rln-wallet.ts` contains a set of private `map*` functions (e.g. `mapAssetNia`, `mapTransaction`, `mapTransfer`) that convert these to the `@utexo/rgb-sdk-core` types that callers expect. Both bridges return BtcBalance as `{ vanilla, colored }` records; `RLNBinding.normalizeBtcBalance` throws `WalletError` on any other shape.

RGB Lib DTO-to-domain mapping lives in `wallet/rgb-lib/mappers.ts`; u64 input validation lives in `amounts.ts`. Native wire u64 values remain decimal strings until an explicit safe public conversion. `native.ts` shares runtime-version validation between init and restore. The bridges report `version` and `sourceRevision` from the artifact's own `version.json` (the AAR asset `rgb-lib-bfa-version.json`, and the copy the installer puts in `RGBLib.framework`), never from constants. `WalletBackendError` extends core `SDKError` and carries an optional `protocol`; do not label an unknown configuration as a particular engine.

### Core dependency

`@utexo/rgb-sdk-core` provides the shared contract (`IUTEXOProtocol` and its domain groups), error types, key derivation utilities, and network config. `src/index.ts` re-exports most of that surface so consumers only need one package.

### Codegen

The TurboModule spec is `src/binding/NativeRgb.ts` (module name `'Rgb'`, package `com.rgbsdkrn`). After changing the spec, run `yarn codegen` to regenerate `android/build/generated/source/codegen/`. The Android `build.gradle` sources `generated/java` and `generated/jni`.

For rgb-lib, edit `src/binding/NativeRgbLib.ts`, run `npm run codegen:rgb-lib`, and implement native behavior in the platform session helpers. The generated bridge and DTO files are checked by `npm test`. Keep them in the current native locations: the podspec uses a nonrecursive `ios/*` source glob, and `RgbPackage` registers `RgbLibModule` directly.

`src/bindings/rgb-lib/manifest.json` pins the upstream artifacts. On iOS, `scripts/setup-rgb-lib-bindings.mjs` (run by `postinstall`, or `npm run bindings:rgb-lib`) downloads the pinned rgb-lib-swift release, verifies its SHA-256 and `version.json`, and builds `ios/RgbLibBindings/` (a dynamic `rgb_libFFI` wrapper of the release library plus the `RGBLib` Swift module). On Android, Gradle resolves `com.utexo:rgb-lib-bfa-android` from Maven Central. When bumping rgb-lib, update the manifest and `RGB_LIB_VERSION`/`RGB_LIB_REVISION` in `config.ts` together; `npm test` checks they agree. Rebuild the application after changing native artifacts.

### Build output

`react-native-builder-bob` builds from `src/` to `lib/`:
- `lib/module/` — ESM JS
- `lib/typescript/` — type declarations

The `lib/` directory and native binary artifacts (`ios/RGBLightningNode.xcframework`, `ios/RgbLibBindings/`) are excluded from git and are downloaded or built by the install scripts.

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
  index.ts                     Public exports; keep legacy names stable
  binding/                     TurboModule specs, RLN transport and raw DTOs
  bindings/rgb-lib/manifest.json  Native artifact pin (not a JS transport)
  wallet/
    utexo-wallet.ts             Public constructor, protocol typing, aliases
    wallet-options.ts          Constructor options for both protocols
    wallet-api.ts              Shared on-chain contracts
    wallet-errors.ts           SDKError-compatible wallet errors
    types.ts, refresh-types.ts Shared domain types
    wallet-manager.ts          Legacy createWallet key-generation utility
    rln/                       RLN wallet, manager, signers, defaults, mappers
    rgb-lib/                   Wallet adapter, session backend, native loader,
                               restore, config, amounts, mapping, key provider
    operations/                Shared burn workflow and validation
    runtime/                   Queue and input snapshot helpers
  integrations/webrgb/         Optional WebRGB entry point
scripts/                       Install scripts, generators and test runners
tests/
  *.test.mjs                   Runtime tests
  types/                       Compile-only contracts and API regressions
  support/                     React Native stub for Node tests
  native/                      JVM and iOS smoke sources
android/src/main/java/com/rgbsdkrn/  Native module implementations
ios/                           Native bridge and Swift session helpers
```

The package allowlist includes production source/build output and only the two install scripts. Tests, generators and check runners are repository tools; do not publish their sources or type declarations.

## Code Conventions

**TypeScript**
- `strict: true`, `import type` for type-only imports, no `any` in status/amount code paths.
- Errors extend base classes from `@utexo/rgb-sdk-core`; call `Object.setPrototypeOf(this, new.target.prototype)` in constructors.

**Naming**
- `Rln*` prefix — raw types from the native layer (Wire types).
- `map*` — converter functions from `Rln*` Wire types to `@utexo/rgb-sdk-core` domain types; live in `wallet/rln/rln-wallet.ts`.
- `I*` — interfaces.
- `normalize*` — throws on invalid input; `tryNormalize*` — returns `undefined`.

**Node queue discipline** — RLN calls must go through `withNodeQueue()` in `RLNBinding`. RGB Lib calls go through the backend SerialExecutor and its guarded native transport. Never call native methods directly from `UTEXOWallet` or `RLNManager`. Queue ensures serial execution and blocks non-lifecycle calls during shutdown/destroy.

**Enum normalization** — Android returns `SCREAMING_SNAKE_CASE`, iOS returns `lowerCamelCase`. Always pass raw native enum values through `canonicalEnum()` before use. Never hard-code platform-specific enum strings outside the normalizer.

**Null vs undefined at bridge boundary** — native layer returns `null` for missing values; TypeScript surface uses `undefined`. `map*` functions must convert `null → undefined` explicitly.

**Type mappers** — `map*` functions in `wallet/rln/rln-wallet.ts` must strip all `Rln*`-prefixed keys before returning domain objects. No Wire keys must leak into the public surface.

**Adding a new native method**:
1. Add to `NativeRgb.ts` spec
2. Run `yarn codegen`
3. Implement in `RgbModule.kt` (Android) and `RgbSwiftHelper.swift` + `Rgb.mm` (iOS)
4. Add wrapper in `RLNBinding.ts` (through `withNodeQueue`)
5. Expose via `rln/rln-manager.ts`, `rln/rln-wallet.ts`, and `UTEXOWallet` if public; type conformance must continue to pass

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
