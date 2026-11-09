# Android RGB-lib v6 demo integration

This draft contains the SDK adaptations used by the Dev Next Android demo wallet.
It is a reference for comparing invoice, send and burn behavior, not a published
cross-platform SDK release. Do not publish this branch as beta.40.

## Native dependency

- Unmodified Rust source: `UTEXO-Protocol/rgb-lib-bfa`
- Tag: `v0.3.0-beta.7-upstream-dev-bfa.6`
- Commit: `5010eefa355beb9c42a4c1b69883f7651241a111`
- Local Maven coordinate: `com.utexo:rgb-lib-bfa-android:0.3.0-beta.7-upstream-dev-bfa.6-bfa.devnext.1`
- UniFFI: 0.32.2; generated Kotlin package: `com.utexo`
- Tested ABI: arm64-v8a; API 24; NDK 27.1.12297006; Rust 1.96.1

The AAR is a local build, **not available from Maven Central**. Obtain the matching
AAR from the demo build owner, then run in the installed SDK directory:

```sh
npm run bindings:rgb-lib:android -- /path/to/rgb-lib-bfa-v6-release.aar
```

The installer checks embedded provenance against the manifest and writes an
ignored local Maven repository. It does not authenticate an untrusted binary;
only install an artifact from a trusted build. The tested AAR SHA-256 was
`2842d1e8a3b702c122b244ae78d92d3ff6d66c76f123ad1c50e4ffd9629da35e`.
Gradle resolves only this module from that repository. No AAR, APK, generated
UniFFI source or Rust source is included in the PR.

For rebuilding the AAR, the demo used `cargo ndk --target arm64-v8a --platform 24
rustc --release --locked --no-default-features --lib -j 2 -- -C strip=none`
from `bindings/uniffi` of the pinned Rust checkout, with a 16 KB page-size linker
flag. Kotlin must be generated from that actual unstripped library using UniFFI
0.32.2. Package the generated Kotlin, native library, JNA dependency and
`assets/rgb-lib-bfa-version.json` in an Android library. This PR does not automate
that native build or publish its result.

## SDK changes

Each EVM RPC now requires an explicit block policy:

```ts
evmRpcUrls: { '42161': 'https://arb1.arbitrum.io/rpc' },
evmMintLockBlocks: { '42161': { min: 1200, max: 28800 } },
```

These are the demo's configured bounds; review them against the target bridge
policy. The bridge passes chain IDs, RPC URLs and bounds as aligned arrays.
Transfers use v6 `TransferScope`, retain all change outputs and expose BFA known
circulating supply. The original burn consignment bytes are preserved.

## Limitations and validation

Use a **new, isolated wallet directory and key** for the v6 BFA schema. Migration
of an old wallet database or old BFA tokens is not covered.

iOS is intentionally unavailable in this draft: there is no matching v6 Swift
artifact or tested iOS adapter. CocoaPods fails with an explicit explanation.
The generated shared bridge signatures are synchronized, but that is not iOS
support. Do not use the previous v5 Swift artifact with these runtime pins.

The original local demo passed SDK/app TypeScript checks, regression tests,
Kotlin/AAR compilation and Android release assembly. The PR's JavaScript tests
use native stubs; they do not prove a live transfer or payout succeeds.
