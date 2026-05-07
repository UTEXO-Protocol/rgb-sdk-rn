# External Signer — RN Bridge

Reference: https://github.com/UTEXO-Protocol/rgb-lightning-node/pull/27

PR #27 adds an alternative node initialisation flow where the caller supplies key material
directly instead of a password + mnemonic. The UDL exposes exactly one new entry point:

```
dictionary SdkExternalSignerBootstrap {
    string node_id;                       // compressed pubkey hex (66 chars)
    string account_xpub_vanilla;
    string account_xpub_colored;
    string master_fingerprint;            // 8 hex chars
    string protocol_version;             // e.g. "1"
    u32    api_level;                    // currently 1
    string ldk_inbound_payment_key_hex;  // 64 hex chars
    string ldk_peer_storage_key_hex;     // 64 hex chars
    string ldk_receive_auth_key_hex;     // 64 hex chars
    string async_payments_root_seed_hex; // "" = legacy, or 64 hex chars = 32-byte node seed
};

[Throws=RlnError]
void init_with_external_signer(SdkExternalSignerBootstrap bootstrap);
```

The method sits between `rlnCreateNode` and `rlnUnlockNode` in the lifecycle — it is an
alternative to `rlnInitNode`, not an addition alongside it.

---

## How to use from the RN SDK

### Where each field comes from

All fields are **derived from your 32-byte node seed**. Your signer (hardware wallet, VLS,
or custom key service) is responsible for deriving them — do not compute them manually.

| Field | Description |
|---|---|
| `node_id` | LDK node identity pubkey, compressed hex (33 bytes) |
| `account_xpub_vanilla` | BIP32 xpub for the vanilla on-chain wallet account |
| `account_xpub_colored` | BIP32 xpub for the RGB colored wallet account |
| `master_fingerprint` | 4-byte BIP32 master key fingerprint (8 hex chars) |
| `protocol_version` | Semver string, currently `"1"` |
| `api_level` | Currently always `1` |
| `ldk_inbound_payment_key_hex` | 32-byte LDK KeysManager auxiliary material, derived from seed |
| `ldk_peer_storage_key_hex` | Same derivation |
| `ldk_receive_auth_key_hex` | Same derivation |
| `async_payments_root_seed_hex` | The raw 32-byte node seed as hex, or `""` for legacy mode |

### Lifecycle

**First run (node not yet on disk):**
```
rlnCreateNode(storageDirPath, ...)
rlnInitNodeWithExternalSigner(bootstrap)   ← stores node_id + xpubs to disk, no password
rlnUnlockNode(password, ...rpc params)     ← password only encrypts on-disk channel state
```

**Subsequent runs:**
```
rlnCreateNode(storageDirPath, ...)
// skip rlnInitNodeWithExternalSigner — already initialised on disk
rlnUnlockNode(password, ...rpc params)
```

### TypeScript usage

```typescript
await node.rlnInitNodeWithExternalSigner({
  nodePublicKeyHex:           '03abc...',   // 66 hex chars
  accountXpubVanilla:         'xpub...',
  accountXpubColored:         'xpub...',
  masterFingerprint:          'aabbccdd',   // 8 hex chars
  protocolVersion:            '1',
  apiLevel:                   1,
  ldkInboundPaymentKeyHex:    'aabbcc...',  // 64 hex chars
  ldkPeerStorageKeyHex:       'aabbcc...',  // 64 hex chars
  ldkReceiveAuthKeyHex:       'aabbcc...',  // 64 hex chars
  asyncPaymentsRootSeedHex:   'aabbcc...',  // 64 hex chars, or omit for legacy
});
```

---

## Field mapping (UDL → RN bridge)

| UDL field                      | JS/TS param name              | Type              | Notes                           |
|-------------------------------|-------------------------------|-------------------|---------------------------------|
| `node_id`                     | `nodePublicKeyHex`            | `string`          | Node pubkey hex, NOT session id |
| `account_xpub_vanilla`        | `accountXpubVanilla`          | `string`          |                                 |
| `account_xpub_colored`        | `accountXpubColored`          | `string`          |                                 |
| `master_fingerprint`          | `masterFingerprint`           | `string`          |                                 |
| `protocol_version`            | `protocolVersion`             | `string`          |                                 |
| `api_level`                   | `apiLevel`                    | `number` → `u32`  | Cast to UInt on Android         |
| `ldk_inbound_payment_key_hex` | `ldkInboundPaymentKeyHex`     | `string`          |                                 |
| `ldk_peer_storage_key_hex`    | `ldkPeerStorageKeyHex`        | `string`          |                                 |
| `ldk_receive_auth_key_hex`    | `ldkReceiveAuthKeyHex`        | `string`          |                                 |
| `async_payments_root_seed_hex`| `asyncPaymentsRootSeedHex`    | `string`          | Pass `""` for legacy mode       |

---

## NativeExternalSigner — how to use with WalletManager

`NativeExternalSigner` is the recommended path: store a 32-byte seed in Keychain/SecureEnclave
and pass it once. All key derivation and signing callbacks are handled internally.

### First run (node not yet on disk)

```typescript
const wallet = new WalletManager({ bindingMode: 'rln', ... });

// 1. Create in-memory node session
await wallet.rlnCreateNode({ storageDirPath, daemonListeningPort, ldkPeerListeningPort, network, maxMediaUploadSizeMb });

// 2. Create signer from 32-byte seed (store this seed securely in Keychain)
const signerId = await wallet.rlnCreateNativeExternalSigner(
  '1111...1111',  // 64 hex chars = 32 bytes
  'regtest',      // or 'mainnet', 'testnet'
  true            // permissivePolicy — set false in production
);

// 3. Init node with signer (stores node identity + xpubs to disk, no password)
await wallet.rlnInitNodeWithNativeExternalSigner(signerId);

// 4. Unlock and start the node
await wallet.rlnUnlockNodeWithNativeExternalSigner(signerId, {
  bitcoindRpcUsername: 'user',
  bitcoindRpcPassword: 'pass',
  bitcoindRpcHost: '127.0.0.1',
  bitcoindRpcPort: 18443,
  indexerUrl: 'http://...',
  announceAddresses: [],
  announceAlias: 'my-node',
});

// 5. Use the node normally...

// 6. Cleanup on shutdown
await wallet.rlnShutdown();
await wallet.rlnDestroyNode();
await wallet.rlnDestroyNativeExternalSigner(signerId);
```

### Subsequent runs (node already initialised on disk)

```typescript
await wallet.rlnCreateNode({ storageDirPath, ... });

const signerId = await wallet.rlnCreateNativeExternalSigner(seedHex, network, true);

// Skip rlnInitNodeWithNativeExternalSigner — already done on first run
// Use rlnAttachNativeExternalSigner instead to re-attach the signer
await wallet.rlnAttachNativeExternalSigner(signerId);

await wallet.rlnUnlockNodeWithNativeExternalSigner(signerId, { ...rpcParams });
```

> `rlnAttachNativeExternalSigner` registers the signer with the node without re-initialising
> key material. Call it on every run after the first, before `rlnUnlockNodeWithNativeExternalSigner`.

### Using the manual bootstrap path (`rlnInitNodeWithExternalSigner`)

If you derive the key material yourself (hardware wallet / custom signer service):

```typescript
await wallet.rlnCreateNode({ ... });

// First run only
await wallet.rlnInitNodeWithExternalSigner({
  nodePublicKeyHex: '03abc...',
  accountXpubVanilla: 'xpub...',
  accountXpubColored: 'xpub...',
  masterFingerprint: 'aabbccdd',
  protocolVersion: '1',
  apiLevel: 1,
  ldkInboundPaymentKeyHex: 'aabbcc...',
  ldkPeerStorageKeyHex: 'aabbcc...',
  ldkReceiveAuthKeyHex: 'aabbcc...',
  asyncPaymentsRootSeedHex: 'aabbcc...',
});

// Then unlock with regular rlnUnlockNode (password only encrypts channel state on disk)
await wallet.rlnUnlockNode({
  password: 'channel-backup-password',
  bitcoindRpcUsername: '...',
  ...
});
```

---

## Bridge changes applied

All 5 files have been updated for the manual bootstrap path. The implementation is complete
for what the current artifacts support.

| File | Change |
|---|---|
| `ios/RlnNodeStore.swift` | Added `NativeExternalSigner` store (createSigner/getSigner/removeSigner) |
| `android/.../RlnNodeStore.kt` | Same + `NativeExternalSigner` import |
| `ios/RgbSwiftHelper.swift` | Added 5 `_rln*NativeExternalSigner` helpers |
| `ios/Rgb.mm` | Added 5 ObjC bridge methods |
| `android/.../RgbModule.kt` | Added 5 override methods + `NativeExternalSigner` import |
| `src/binding/NativeRgb.ts` | Added 5 + 1 method signatures to `Spec` |
| `src/binding/RLNRgbLibBinding.ts` | Added 5 + 1 public methods |
| `src/wallet/wallet-manager.ts` | Added 5 + 1 proxy methods |

---

## NativeExternalSigner — requires new artifact build

`NativeExternalSigner` exists in the PR Rust code (`src/uniffi_api/native_signer.rs`) but is
exposed via **proc-macros** (`#[derive(uniffi::Object)]` + `#[uniffi::export]`), not the UDL
file — which is why it's not visible in the UDL but should appear in generated Swift/Kotlin.

The current artifacts were built from an earlier commit of the PR before `native_signer.rs`
was added, so `NativeExternalSigner` is absent from both `RGBLightningNode.swift` and
`rgb_lightning_node.kt`.

**To get `NativeExternalSigner`:**
1. Rebuild the native Rust library from commit `938f1ed` (or the merged PR) of
   `rmn-boiko/rgb-lightning-node`
2. Re-bundle the artifacts and run `yarn setup-rln-bindings`
3. Verify: `grep "NativeExternalSigner" ios/RGBLightningNode.swift` should return hits

Once available, it works like this (equivalent to the Python example):
```typescript
// Instead of manually constructing SdkExternalSignerBootstrap,
// NativeExternalSigner derives everything from a 32-byte seed:
//
// val signer = NativeExternalSigner(seedHex, "regtest", true)  // Kotlin
// let signer = NativeExternalSigner(seedHex: "...", network: "regtest", permissivePolicy: true)  // Swift
//
// signer.bootstrap() → SdkExternalSignerBootstrap (all fields derived from seed)
//
// The RN bridge would then need:
//   rlnInitNodeWithNativeExternalSigner(nodeId, seedHex, network, permissivePolicy)
//   rlnUnlockNodeWithNativeExternalSigner(nodeId, seedHex, network, permissivePolicy, ...rpcParams)
```

---

## Custom signer — implementing ExternalSignerHost

If you need full control (hardware wallet, HSM, remote signing service), you implement
`ExternalSignerHost` natively in Swift or Kotlin instead of using `NativeExternalSigner`.

### What it is

```
// Swift
public protocol ExternalSignerHost: AnyObject {
    func call(request: Data) throws -> Data
}

// Kotlin
interface ExternalSignerHost {
    fun call(request: ByteArray): ByteArray
}
```

One method. `request` is a protobuf-encoded `SignerEnvelope` containing a `SignerRequest`
(e.g. sign this transaction, derive this key, return ECDH). You decode it, perform the
operation in your secure environment, and return a protobuf-encoded `SignerResponse`.

The full set of operation types the node will send:
`Bootstrap`, `GetNodeId`, `GetDestinationScript`, `GetShutdownScriptpubkey`, `Ecdh`,
`SignInvoice`, `SignBolt12Invoice`, `SignGossipMessage`, `SignMessage`,
`GenerateChannelKeysId`, `DeriveChannelSigner`, `SetupChannel`,
`GetPerCommitmentPoint`, `ReleaseCommitmentSecret`, `ValidateHolderCommitment`,
`SignHolderCommitment`, `SignCounterpartyCommitment`, `SignClosingTransaction`,
`SignJusticeRevokedOutput`, `SignHolderHtlcTransaction`, `SignCounterpartyHtlcTransaction`,
`SignRgbPsbt`, `SignSpendableOutputsPsbt`, and more.

Use `NativeExternalSigner`'s Rust source as the reference implementation for each operation.

---

### Swift example

```swift
import Foundation

// Your custom signer — implement the UniFFI-generated protocol
class MyHardwareWalletSigner: ExternalSignerHost {

    private let device: MyHSMDevice  // your hardware/remote signer

    init(device: MyHSMDevice) {
        self.device = device
    }

    func call(request: Data) throws -> Data {
        // 1. Forward raw protobuf bytes to your signing device
        //    The device decodes the SignerEnvelope, performs the operation, returns response bytes
        let responseBytes = try device.sign(requestBytes: request)
        return responseBytes
    }
}

// Usage — native side only (not exposed to JS)
let signer = MyHardwareWalletSigner(device: myDevice)

// Get bootstrap from your signer (first run — signer must implement Bootstrap request)
// bootstrap = your signer processes a Bootstrap SignerRequest and returns SdkExternalSignerBootstrap

// First run: store node identity to disk
try node.initWithExternalSigner(bootstrap: bootstrap)

// Every run: attach signer and unlock
try node.attachExternalSigner(host: signer, bootstrap: bootstrap)
try node.unlockWithAttachedExternalSigner(
    bootstrap: bootstrap,
    bitcoindRpcUsername: "user",
    bitcoindRpcPassword: "pass",
    bitcoindRpcHost: "127.0.0.1",
    bitcoindRpcPort: 18443,
    indexerUrl: nil,
    proxyEndpoint: nil,
    announceAddresses: [],
    announceAlias: "my-node"
)
```

---

### Kotlin example

```kotlin
import org.utexo.rgblightningnode.ExternalSignerHost
import org.utexo.rgblightningnode.SdkExternalSignerBootstrap

class MyHardwareWalletSigner(private val device: MyHSMDevice) : ExternalSignerHost {

    override fun call(request: ByteArray): ByteArray {
        // Forward raw protobuf bytes to your signing device
        return device.sign(request)
    }
}

// Usage — native side only
val signer = MyHardwareWalletSigner(device = myDevice)

// First run
node.initWithExternalSigner(bootstrap)

// Every run
node.attachExternalSigner(host = signer, bootstrap = bootstrap)
node.unlockWithAttachedExternalSigner(
    bootstrap = bootstrap,
    bitcoindRpcUsername = "user",
    bitcoindRpcPassword = "pass",
    bitcoindRpcHost = "127.0.0.1",
    bitcoindRpcPort = 18443u,
    indexerUrl = null,
    proxyEndpoint = null,
    announceAddresses = emptyList(),
    announceAlias = "my-node"
)
```

---

### Getting SdkExternalSignerBootstrap from a custom signer

The bootstrap is obtained by sending a `Bootstrap` `SignerRequest` to your signer and reading
the response. Since your signer processes raw protobuf, you can use `NativeExternalSigner` as
a reference to see what a `Bootstrap` response looks like — or derive the fields manually:

```swift
// Option A: use NativeExternalSigner just to get the bootstrap fields from the same seed,
// then switch to your custom signer for all subsequent signing ops
let tempSigner = try NativeExternalSigner(seedHex: seedHex, network: "mainnet", permissivePolicy: false)
let bootstrap = try tempSigner.bootstrap()  // SdkExternalSignerBootstrap

// Option B: construct manually if your HSM provides the raw key material
let bootstrap = SdkExternalSignerBootstrap(
    nodeId: myHSM.nodePublicKey(),
    accountXpubVanilla: myHSM.xpub(path: "m/84'/0'/0'"),
    accountXpubColored: myHSM.xpub(path: "m/84'/1'/0'"),
    masterFingerprint: myHSM.masterFingerprint(),
    protocolVersion: "1",
    apiLevel: 1,
    ldkInboundPaymentKeyHex: myHSM.ldkKey("inbound_payment"),
    ldkPeerStorageKeyHex: myHSM.ldkKey("peer_storage"),
    ldkReceiveAuthKeyHex: myHSM.ldkKey("receive_auth"),
    asyncPaymentsRootSeedHex: myHSM.rawSeedHex()
)
```

---

### Important: ExternalSignerHost is NOT bridged to JS

`attachExternalSigner` and `unlockWithAttachedExternalSigner` are **not currently in the RN
bridge**. The custom signer must be implemented and used **natively** (Swift/Kotlin).

This is by design — `ExternalSignerHost.call()` is a synchronous native callback. JavaScript
cannot implement a synchronous native interface directly. If JS-side custom signing is needed
in future, it would require an async bridge (e.g. RN NativeEventEmitter round-trip), which
adds latency for every signing operation.

**Contrast with Breez SDK:** Breez's `ExternalSigner` has the same limitation on Flutter
(explicitly documented), but works on iOS/Android because the trait object can be passed
through UniFFI. Same applies here — our `ExternalSignerHost` works natively but not from JS.

---

## Comparison: RGB Lightning Node vs Breez SDK external signer

Reference: https://github.com/breez/spark-sdk/blob/main/crates/breez-sdk/core/src/signer/external.rs

### Architecture

| | RGB Lightning Node | Breez SDK |
|---|---|---|
| **Pattern** | Bootstrap + VLS callback | Pure callback (no bootstrap) |
| **Foreign trait** | `ExternalSignerHost` — 1 method: `call(bytes) → bytes` | `ExternalSigner` — 20+ typed async methods |
| **Default signer** | `NativeExternalSigner` (VLS in-process) | `default_external_signer(mnemonic)` |
| **Wire format** | Protobuf-encoded `SignerEnvelope` (opaque to caller) | Direct typed method calls (transparent) |
| **Underlying framework** | LDK + VLS (Validating Lightning Signer) | Spark + FROST multi-party signing |
| **Flutter support** | Yes | No (trait object FFI limitation) |

### How each works

**RGB LN — Bootstrap path:**
1. Caller derives all key material from seed and provides it upfront in `SdkExternalSignerBootstrap`
2. Node stores the bootstrap (node_id, xpubs) to disk at init
3. On every unlock, node re-reads disk and verifies the same signer is reattached
4. Signing ops during operation go through VLS protobuf protocol (if `NativeExternalSigner` is used)

**RGB LN — `NativeExternalSigner` path (recommended):**
1. Seed → VLS spins up in-process, derives bootstrap internally
2. SDK calls back through `ExternalSignerHost.call(protoBytes)` for every signing op
3. Caller never sees individual signing requests — VLS handles them all

**Breez SDK:**
1. No upfront bootstrap — signer is passed at `connect_with_signer(signer)` only
2. SDK holds `Arc<dyn ExternalSigner>` and calls specific typed methods on demand:
   - `sign_ecdsa(message, path)` for regular sigs
   - `sign_frost(request)` / `aggregate_frost(request)` for Spark multi-party ops
   - `derive_public_key(path)`, `encrypt_ecies`, `decrypt_ecies`, etc.
3. Caller implements each method — full control over key material and HSM integration

### Key differences

**Interface granularity:**
- Breez exposes 20+ explicit, typed, named methods — each signing operation is a separate,
  meaningful API call. Easy to implement, easy to audit, easy to route to hardware.
- RGB LN uses a single opaque `call(bytes) → bytes` with protobuf inside — abstracts the
  VLS protocol completely. Harder to implement a custom signer, but you don't need to — use
  `NativeExternalSigner` instead.

**Bootstrap requirement:**
- RGB LN requires the signer to produce key material (`SdkExternalSignerBootstrap`) before the
  node can be initialised. This is a one-time step tied to the node's on-disk identity.
- Breez has no bootstrap step — the signer is attached once at connect time and the SDK
  derives everything it needs on demand via trait method calls.

**Callback model:**
- Breez: SDK pulls from signer (sync + async typed callbacks).
- RGB LN `NativeExternalSigner`: SDK sends a protobuf request, VLS responds in-process.
- RGB LN `ExternalSignerHost` (not yet in RN bridge): same protobuf push/pull but the
  implementation lives outside the SDK (e.g. hardware wallet over transport).

### What we use

The current RN bridge uses the **bootstrap path** (`rlnInitNodeWithExternalSigner`) and the
**`NativeExternalSigner` VLS in-process path** (`rlnCreateNativeExternalSigner` +
`rlnUnlockNodeWithNativeExternalSigner`).

We do **not** bridge `ExternalSignerHost` (the custom callback interface). That would be the
equivalent of Breez's `ExternalSigner` — allowing a custom Swift/Kotlin implementation to
handle signing. If needed in future, it would require:
1. A UniFFI foreign trait bridge for `ExternalSignerHost` (already in the Rust UDL)
2. A JS → native callback mechanism (likely via React Native event emitter or a native module
   callback) since JS cannot implement a synchronous native callback interface directly
