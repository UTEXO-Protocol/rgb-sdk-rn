# Custom External Signer Example

This example shows how to plug a custom signing backend (hardware wallet,
Secure Enclave, remote HSM, Android Keystore, etc.) into the RGB Lightning
Node SDK.

## Files

| File | Purpose |
|------|---------|
| `ios/CustomExternalSigner.swift` | Swift signing backend protocol, store, and example backends |
| `ios/CustomSignerBridge.swift` | `RgbSwiftHelper` extension + Rgb.mm additions |
| `android/CustomExternalSigner.kt` | Kotlin equivalents + `CustomSignerModule` React Native module |
| `index.ts` | TypeScript usage from the JS side |

---

## When to use a custom signer vs `NativeExternalSigner`

| | `rlnCreateNativeExternalSigner` | Custom `ExternalSignerHost` |
|---|---|---|
| Key storage | In-process memory (seed passed in) | Your backend (HSM, Secure Enclave, …) |
| Setup effort | None | Implement `SignerBackend` |
| Use case | Development / testing | Production apps requiring hardware isolation |
| Bootstrap derivation | Automatic from seed | Must implement `bootstrap()` |
| VLS protocol handling | Built-in | Must implement `processRequest()` |

Use `NativeExternalSigner` during development. Switch to a custom signer when
you need keys to never leave a hardware boundary.

---

## What is "bootstrap"?

Bootstrap is a dictionary of public key material the node needs to initialise
its LDK state machine. It is derived **once** from your seed / HSM and stored
to disk by the node. On every subsequent run the node reads it from disk; you
only need to provide it again if the node storage is wiped.

Fields in `SdkExternalSignerBootstrap`:

| Field | Description |
|-------|-------------|
| `nodeId` | LDK node public key (33-byte hex) |
| `accountXpubVanilla` | BIP-84 xpub for on-chain vanilla wallet |
| `accountXpubColored` | BIP-84 xpub for on-chain RGB wallet |
| `masterFingerprint` | BIP-32 master fingerprint |
| `protocolVersion` | VLS protocol version string |
| `apiLevel` | Numeric API version for compatibility checks |
| `ldkInboundPaymentKeyHex` | LDK inbound payment key |
| `ldkPeerStorageKeyHex` | LDK peer storage key |
| `ldkReceiveAuthKeyHex` | LDK receive authentication key |
| `asyncPaymentsRootSeedHex` | Root seed for async payment keys |

---

## How the custom signer works

```
JS (index.ts)
  │
  │  CustomSigner.createCustomSigner(seedHex, network)
  │  ──────────────────────────────────────────────────▶  Native (Swift/Kotlin)
  │                                                         NativeBackedSignerBackend.bootstrap()
  │  ◀── { signerId, nodePublicKeyHex, ... } ──────────    CustomSignerStore[signerId] = signer
  │
  │  wm.rlnInitNodeWithExternalSigner(bootstrap)       ──▶  rlnInitNode (stores bootstrap to disk)
  │
  │  CustomSigner.attachAndUnlock(nodeId, signerId, …) ──▶  node.attachExternalSigner(signer)
  │                                                          node.unlockWithAttachedExternalSigner(…)
  │                                                              │
  │                                                              │  For every signing op:
  │                                                              └─▶ signer.call(requestBytes)
  │                                                                     └─▶ backend.processRequest(…)
  │                                                                            └─▶ YOUR HSM / SE
```

The `ExternalSignerHost.call()` method is invoked **synchronously on a
background thread** for every cryptographic operation the LDK node performs
(channel open, commit, HTLC, close, …). Your `processRequest()` implementation
must return the correct VLS protobuf response.

---

## Getting started

### iOS

1. Copy `CustomExternalSigner.swift` and `CustomSignerBridge.swift` into your
   Xcode target.
2. Add the `rlnCreateCustomSigner:`, `rlnAttachCustomSigner:`, and
   `rlnUnlockWithCustomSigner:` methods to `Rgb.mm` — the exact signatures are
   in the comment block at the bottom of `CustomSignerBridge.swift`.
3. Implement `processRequest()` in `NativeBackedSignerBackend` (or replace the
   whole backend class with your own `SignerBackend` implementation).

### Android

1. Copy `CustomExternalSigner.kt` into your app module (e.g.
   `app/src/main/java/com/yourapp/`).
2. Register `CustomSignerPackage` in `MainApplication.kt`:
   ```kotlin
   override fun getPackages(): List<ReactPackage> =
       PackageList(this).packages.apply {
           add(CustomSignerPackage())
       }
   ```
   Add the `CustomSignerPackage` class alongside `CustomSignerModule`:
   ```kotlin
   class CustomSignerPackage : ReactPackage {
       override fun createNativeModules(ctx: ReactApplicationContext) =
           listOf(CustomSignerModule(ctx))
       override fun createViewManagers(ctx: ReactApplicationContext) = emptyList<ViewManager<*,*>>()
   }
   ```
3. Implement `processRequest()` in `NativeBackedSignerBackend`.

### JS

```typescript
import { startNodeWithCustomSigner } from './examples/custom-signer';

await startNodeWithCustomSigner(mySeedHex, '/path/to/node/storage');
```

See `index.ts` for the full flow including first-run vs subsequent-run logic
and proper shutdown sequencing.

---

## Implementing processRequest()

The `requestBytes` / `requestBytes: ByteArray` argument is a serialised
`SignerEnvelope` protobuf wrapping a `SignerRequest` oneof message. The
response must be a serialised `SignerEnvelope` wrapping the matching
`SignerResponse`.

Proto schema:
[https://github.com/UTEXO-Protocol/rgb-lightning-node/blob/main/proto/](https://github.com/UTEXO-Protocol/rgb-lightning-node/blob/main/proto/)

For common operations (commit/close/HTLC signing) the request type is
identified by the oneof field set in `SignerRequest`. Your implementation
must handle at minimum:

- `GetNodeId`, `GetDestinationScript`, `GetShutdownScriptpubkey`
- `GenerateChannelKeysId`, `DeriveChannelSigner`, `SetupChannel`
- `GetPerCommitmentPoint`, `ReleaseCommitmentSecret`
- `SignHolderCommitment`, `SignCounterpartyCommitment`, `SignClosingTransaction`
- `SignRgbPsbt`, `SignSpendableOutputsPsbt`

The simplest compliant implementation for development is to proxy requests to
a VLS in-process signer via `NativeExternalSigner`. Since `call()` is not
exposed through the UniFFI bridge, you would instead use
`rlnCreateNativeExternalSigner` from JS — which handles the full VLS protocol
automatically without requiring any custom `processRequest()` code.

---

## Shutdown sequencing

Always shut down in this order to avoid dangling references:

```typescript
await wm.rlnShutdown();                          // stops LDK background tasks
await CustomSigner.destroyCustomSigner(signerId); // frees native signer object
```
