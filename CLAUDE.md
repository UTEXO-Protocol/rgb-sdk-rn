# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@utexo/rgb-sdk-rn` is the RGB_L1 engine for React Native: `RgbLibRn` over native rgb-lib (the BFA build), with no RLN or LDK. It implements the `SharedWalletApi` engine contract from `@utexo/rgb-sdk-core` plus the rgb-lib extensions (burn, consignment, backups, VSS, maintenance and others). The optional `UTEXOWallet` facade and WebRGB live in `@utexo/rgb-sdk`. The library uses the React Native new architecture (TurboModules + Codegen) and upstream UniFFI bindings on iOS and Android; it does not build a Rust adapter.

## Commands

```bash
npm run build          # bob build to lib/
npm run typecheck      # tsc
npm run lint           # eslint
npm run prettier       # format
npm test               # typecheck + contract check + rgb-lib tests
npm run codegen:rgb-lib    # regenerate the native bridge and DTOs from the spec
npm run bindings:rgb-lib   # download/rebuild the pinned iOS bindings
npm run test:rgb-lib:ios       # native smoke sources in tests/native/
npm run test:rgb-lib:android   # JVM checks; needs no native artifacts
cd ios && pod install
```

`npm test` runs the TypeScript type check (including compile-only tests in `tests/types/`), `scripts/check-contract.mjs` (core's engine conformance checks against the built engine) and `tests/*.test.mjs` with Node's test runner. The generated bridge and DTO files are checked against the spec. The rgb-lib session store also runs against the Maven Central AAR as an instrumentation test (`android/src/androidTest/`, `RgbLibSessionStoreInstrumentationTest`) on an emulator or device.

The `version:*` scripts bump the version, push a tag and publish to npm. Do not run them for local work.

Use `.mjs` (ES modules) for Node scripts, runtime tests and ESLint config. `babel.config.cjs` stays CommonJS for synchronous config loading. SDK source stays TypeScript; generated JavaScript in `lib/` is managed by Bob.

## Architecture

```
RgbLibRn (src/wallet/rgb-lib/rgb-lib-rn.ts)
  └── RgbLibWalletBackend (backend.ts, SerialExecutor) → native.ts → NativeRgbLib ('RgbLib')
        ├── RgbLibModule.kt → RgbLibDispatcher → RgbLibSessionStore   (Android)
        └── RgbLib.mm → RgbLibDispatcher → RgbLibSwiftHelper          (iOS)
```

### `RgbLibRn`

`new RgbLibRn(params, keys)`. `params.online` (optional) holds the indexer and proxy endpoints; it is validated and stored at construction, with no network call. Lifecycle: `init()`, then the first online operation connects lazily (`connectLazily()`, using `online`, then the network defaults; regtest has no defaults). `goOnline(params?)` connects explicitly (rgb-lib's own name); explicit fields override `online` field by field. `unlock(params?)` is the `SharedWalletApi` name for the same call; rgb-lib has no unlock step, so docs, errors and the demo use `goOnline`. Reads with `skipSync: true` never connect. `refresh(options?)` returns the refresh result; `refreshWallet()` is refresh without it. `restoreFromBackup` is a separate pre-init operation in `wallet/rgb-lib/restore.ts`.

`keys` (`wallet/rgb-lib/key-provider.ts`) is a mnemonic string, a reader function, `{ mnemonic }` / `{ getMnemonic }`, optionally with public keys, or public keys alone (watch-only). `resolveRgbLibKeys` validates the shape in the constructor (`INVALID_CONFIG`); `readRgbLibMnemonic` wraps only the reader call (`KEYS_UNAVAILABLE` with `cause`). Native `open` derives xpubs from the mnemonic, checks given public keys against them, or opens watch-only with `mnemonic: nil`; rgb-lib's `WatchOnly` maps to `UNSUPPORTED_CAPABILITY`, and `getBfaCapabilities()` reports `burn: false` for a watch-only wallet.

### Type mapping

DTO-to-domain mapping lives in `wallet/rgb-lib/mappers.ts`; u64 input validation lives in `amounts.ts`. Native wire u64 values remain decimal strings until an explicit safe public conversion. `native.ts` shares runtime-version validation between init and restore. The bridges report `version` and `sourceRevision` from the artifact's own `version.json` (the AAR asset `rgb-lib-bfa-version.json`, and the copy the installer puts in `RGBLib.framework`), never from constants. `WalletBackendError` extends core `SDKError` and carries an optional `protocol`.

### Codegen

The TurboModule spec is `src/native/NativeRgbLib.ts` (module `'RgbLib'`, Android package `com.utexo.rgblibrn`). Edit it, run `npm run codegen:rgb-lib`, and implement native behavior in the platform dispatcher and session helpers. Keep generated files in their current native locations: the podspec uses a nonrecursive `ios/*` source glob, and `RgbLibPackage` registers `RgbLibModule` directly. `src/native/network-name.ts` holds the network names accepted at the native boundary (it adds `signet_custom`).

### Native artifacts

`src/bindings/rgb-lib/manifest.json` pins the upstream artifacts for both platforms. On iOS, `scripts/setup-rgb-lib-bindings.mjs` (run by `postinstall`, or `npm run bindings:rgb-lib`) downloads the pinned rgb-lib-swift release, verifies its SHA-256 and `version.json`, and builds `ios/RgbLibBindings/` (a dynamic `rgb_libFFI` wrapper of the release library plus the `RGBLib` Swift module); `RgbLib.podspec` refuses to build when the installed bindings do not match the pin. On Android, Gradle resolves `com.utexo:rgb-lib-bfa-android` from Maven Central at the pinned version; JNA (`net.java.dev.jna:jna:5.17.0@aar`) is required for UniFFI. When bumping rgb-lib, update the manifest and `RGB_LIB_VERSION`/`RGB_LIB_REVISION` in `config.ts` together; `npm test` checks they agree. Rebuild the application after changing native artifacts.

### Core dependency

`@utexo/rgb-sdk-core` provides the engine contract (`SharedWalletApi` and the extension interfaces), conformance checks, error types, key derivation, network config and the LSP client. `src/index.ts` re-exports the parts consumers need so they import one package.

### Build output

`react-native-builder-bob` builds from `src/` to `lib/` (`lib/module/` ESM, `lib/typescript/` declarations). `lib/` and `ios/RgbLibBindings/` are excluded from git.

## Project Structure

```
src/
  index.ts                     Public exports
  native/                      TurboModule spec and native network names
  bindings/rgb-lib/manifest.json  Native artifact pin (not a JS transport)
  wallet/
    rgb-lib/                   Engine class, session backend, native loader,
                               restore, config, amounts, mapping, key provider, errors
    operations/                Input validation shared by the engine
    runtime/                   Serial executor and input snapshot helpers
    wallet-api.ts              Engine interface groups
    wallet-errors.ts           SDKError-compatible wallet errors
    network-endpoints.ts       Per-network default endpoints
    types.ts, refresh-types.ts Domain types
scripts/                       Install script, generators and check runners
tests/
  *.test.mjs                   Runtime tests
  types/                       Compile-only contracts and API regressions
  support/                     React Native stub for Node tests
  native/                      JVM and iOS smoke sources
android/src/main/java/com/utexo/rgblibrn/  Android module, dispatcher, session store
ios/                           Native bridge and Swift session helpers
```

The package allowlist includes production source/build output and only the bindings install script. Tests, generators and check runners are repository tools; do not publish them.

## Code Conventions

- `strict: true`, `import type` for type-only imports, no `any` in status/amount code paths.
- Errors extend base classes from `@utexo/rgb-sdk-core`; call `Object.setPrototypeOf(this, new.target.prototype)` in constructors.
- All native calls go through the backend's `SerialExecutor` and its guarded native transport. Never call native methods directly from `RgbLibRn`.
- The native layer returns `null` for missing values; the TypeScript surface uses `undefined`. Mappers convert explicitly.
- No wire types (DTOs) leak into the public surface.

**Adding a native method:** add it to `src/native/NativeRgbLib.ts`, run `npm run codegen:rgb-lib`, implement it in `RgbLibDispatcher` on both platforms, wrap it in the backend (through the serial executor), and expose it on `RgbLibRn`. If it belongs to the shared contract or an extension, change `@utexo/rgb-sdk-core` first and keep `scripts/check-contract.mjs` passing.

## Code Review Focus Areas

### Security

- **Mnemonic handling**: the key reader is called only when needed and its value is never logged, serialized or put in error messages.
- **TurboModule positional parameters**: codegen does not validate parameter names at runtime, only positions. A wrong order passes TypeScript and silently sends wrong values to native. Review any reordering in `NativeRgbLib.ts`.
- **Native artifact pin**: a version bump must update the SHA-256 in the manifest; never accept unverified downloads.

### Correctness

- **Queue deadlock risk**: work inside the serial executor must not await another queued call.
- **Amount precision**: amounts that can exceed `Number.MAX_SAFE_INTEGER` stay decimal strings or `bigint`. Any `Number()` conversion of a u64 field is a bug.
- **Transfer status fallbacks**: mappers must not silently map an unknown status to a valid one.
- **Lazy connect**: an operation that needs the network must connect through `connectLazily()`; `skipSync: true` reads must stay offline.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
