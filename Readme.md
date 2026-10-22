# RGB SDK for React Native

[`@utexo/rgb-sdk-rn`](https://www.npmjs.com/package/@utexo/rgb-sdk-rn)

> **Beta release** — APIs may change between releases.
> Report issues on [GitHub](https://github.com/UTEXO-Protocol/rgb-sdk-rn/issues).

React Native SDK for on-device RGB assets, with on-chain operations via **rgb-lib** and Lightning payments via the **RGB Lightning Node (RLN)**.

[![npm version](https://img.shields.io/npm/v/@utexo/rgb-sdk-rn)](https://www.npmjs.com/package/@utexo/rgb-sdk-rn)
[![license](https://img.shields.io/npm/l/@utexo/rgb-sdk-rn)](https://www.npmjs.com/package/@utexo/rgb-sdk-rn)

> **Note**: React Native port of the [original RGB SDK for Node.js](https://github.com/UTEXO-Protocol/rgb-sdk). Use that SDK for Node.js applications.

## Requirements

- React Native with **New Architecture** enabled (TurboModules `Rgb` for RLN and `RgbLib` for rgb-lib)
- iOS and Android
- Android `minSdkVersion` 24
- RLN: at `unlock()`, an Electrum indexer and/or bitcoind RPC, plus an RGB proxy endpoint (known networks get defaults — see [`IRLNUnlockParams`](#irlnunlockparams))
- rgb-lib: at `goOnline()`, an Electrum, Esplora or bitcoind indexer configuration and an RGB proxy endpoint

## Install

```bash
npm install @utexo/rgb-sdk-rn
```

### RLN (`RGB_LN`)

RLN bindings are installed by default: `postinstall` downloads
`RGBLightningNode.xcframework` on iOS, and Gradle resolves
`com.utexo:rgb-lightning-node-android` from Maven Central on Android.

### rgb-lib (`RGB_L1`)

To enable on-chain mode, supply a **local prebuilt UniFFI mobile bundle** matching
[the SDK's pinned release](src/bindings/rgb-lib/manifest.json). The current installer
does not download rgb-lib or compile Rust. From your application's root directory:

```bash
node node_modules/@utexo/rgb-sdk-rn/scripts/setup-rgb-lib-bindings.mjs \
  --from /absolute/path/to/mobile-bundle --platform all
```

Use `--platform ios` or `--platform android` for a single platform.

| Platform | Installed bindings | Integration |
|----------|--------------------|-------------|
| iOS | `RGBLib.xcframework` and `rgb_libFFI.xcframework` | The SDK's podspec includes them from `ios/RgbLibBindings/` |
| Android | `rgb-lib-bfa.aar` | Gradle resolves `com.utexo:rgb-lib-bfa-android` from the SDK's local Maven repository |

<details>
<summary>Bundle format and postinstall option</summary>

The bundle contains `manifest.json`, `ios/RGBLib.xcframework/`,
`ios/rgb_libFFI.xcframework/` and `android/rgb-lib-bfa.aar` (only the selected
platform's artifacts are required). Its manifest includes matching `version`,
`sourceRevision`, `uniffiVersion`, `swiftModule` and `kotlinPackage` fields, and
`checksums` mapping bundle-relative file paths to SHA-256 hashes.

To install the bundle during `postinstall` instead:

```bash
RGB_LIB_BINDINGS_DIR=/absolute/path/to/mobile-bundle npm install @utexo/rgb-sdk-rn
```

This installs both platforms on macOS and Android on other systems. Make the
bundle available in CI and reinstall matching bindings after SDK upgrades.

</details>

After native setup, run CocoaPods on iOS and rebuild the application:

```bash
(cd ios && pod install)
```

A JavaScript reload cannot load new native bindings. Missing rgb-lib bindings
cause `RGB_L1` initialization to fail with `NATIVE_BACKEND_UNAVAILABLE`.

## Quick start

### Wallet isolation

> **Do not create or restore RLN and rgb-lib wallets from the same mnemonic (seed phrase).**
> Generate and persist a different mnemonic for each protocol, and use separate
> storage directories. Separate directories alone are not sufficient. The app
> must enforce this separation; selecting another protocol does not migrate wallet state.

### RLN (`RGB_LN`)

The existing two-argument constructor and signer API stay the same:

```typescript
import { UTEXOWallet, PasswordRLNSigner, generateKeys } from '@utexo/rgb-sdk-rn';

const network = 'utexo';
// First use only: save these credentials in secure storage before init().
// On later launches, read the saved credentials instead of generating new keys.
const keys = await generateKeys(network);
const wallet = new UTEXOWallet(
  {
    storageDirPath: '/path/to/rln-storage',
    daemonListeningPort: 9735,
    ldkPeerListeningPort: 9736,
    network,
  },
  new PasswordRLNSigner('my-secure-password', keys.mnemonic),
);

await wallet.init();
await wallet.unlock({}); // use network defaults, or pass IRLNUnlockParams
```

This is the first-run path. For reopening saved profiles and handling an already
initialized RLN node, see the [session example](examples/dual-backend.ts).

### rgb-lib (`RGB_L1`)

`readRgbLibMnemonic` is your app's `() => Promise<string>` callback that reads a
separately generated, saved mnemonic from secure storage. Configure an indexer
and proxy compatible with the pinned rgb-lib release; do not assume RLN's proxy
supports the same version.

`utexo` uses standard Bitcoin signet (`sb` in RGB invoices). The public SDK and
WebRGB network name remains `utexo`. Older experimental rgb-lib profiles created
on custom signet (`sbc`) cannot reopen as standard signet; preserve their data
and use a separate new profile for testing. Generate new invoices after switching.

```typescript
import { UTEXOWallet, CallbackRgbLibKeyProvider } from '@utexo/rgb-sdk-rn';

const onchain = new UTEXOWallet({
  protocol: 'RGB_L1',
  params: { network: 'utexo', storageDirPath: '/path/to/rgb-lib-storage' },
  keys: new CallbackRgbLibKeyProvider(readRgbLibMnemonic),
});

await onchain.init();
await onchain.goOnline({
  indexer: { type: 'electrum', url: indexerUrl }, // tcp:// or ssl://
  proxyEndpoint,
});
```

`init()` opens the local wallet using the key provider; `goOnline()` connects it
to the indexer and applies the proxy settings. `unlock(params)` remains supported
with the same behavior. See [installation](#rgb-lib-rgb_l1) for native setup.

### On-chain operations (both modes)

Use the same methods on either initialized, connected wallet:

```typescript
const address = await wallet.getAddress();
// Fund this address with BTC, then:
await wallet.syncWallet();
await wallet.createUtxos({ upTo: false, num: 4, feeRate: 1 });

const { invoice } = await wallet.onchainReceive({
  witness: false,
  minConfirmations: 1,
});
// Share the invoice with the sender.
```

RLN also supports Lightning channels, payments, LSP and APay. These operations
require `RGB_LN`; on mainnet they reject with `LIGHTNING_DISABLED_ON_MAINNET`.
On-chain BTC/RGB operations remain available.

## Primary Class: `UTEXOWallet`

| Mode | Constructor | Connect |
|------|-------------|---------|
| RLN | `new UTEXOWallet(params, signer)` | `unlock(params)` |
| rgb-lib | `new UTEXOWallet({ protocol: 'RGB_L1', params, keys })` | `goOnline(params)` |

An explicit RLN options form is also available:
`new UTEXOWallet({ protocol: 'RGB_LN', params, signer })`.
Both modes satisfy `instanceof UTEXOWallet`; `wallet.protocol` is read-only and
`getWalletIdentity()` returns `{ id, network, protocol }`.

TypeScript infers the selected protocol. Plain `UTEXOWallet` retains its existing
RLN meaning. For a variable holding either mode, use `AnyUtexoWallet` and narrow
`wallet.protocol` before `unlock()`, `goOnline()`, `reinit()` or Lightning calls.
Avoid `UTEXOWallet<WalletProtocol>` for these calls: it loses the association
between a protocol and its configuration. Unsupported JavaScript calls reject
with `UNSUPPORTED_CAPABILITY`.

The legacy RLN facade satisfies `IUTEXOProtocol`; both modes expose the shared
[on-chain API](src/wallet/wallet-api.ts). rgb-lib's constructor and connection
options are defined in [config.ts](src/wallet/rgb-lib/config.ts).

### Construction

#### `UTEXOWalletNodeParams`

| Field | Type | Description |
|-------|------|-------------|
| `storageDirPath` | `string` | Directory where the node persists its data |
| `daemonListeningPort` | `number` | RLN daemon HTTP port |
| `ldkPeerListeningPort` | `number` | LDK peer-to-peer port |
| `network` | `string` | Bitcoin network (`'utexo'`, `'regtest'`, `'testnet'`, `'mainnet'`, …) |
| `maxMediaUploadSizeMb` | `number?` | Max media upload size in MB (default 20) |
| `reuseAddresses` | `boolean?` | Reuse on-chain addresses (default `false`) |
| `enableVirtualChannelsV0` | `boolean?` | Enable virtual channel support (required on both host and client) |
| `virtualPeerPubkeys` | `string[]?` | Host pubkeys allowed to open inbound virtual channels. `null`/`[]` = accept from anyone |
| `vssUrl` | `string?` | VSS server URL for encrypted remote backup |
| `vssAllowHttp` | `boolean?` | Allow plain HTTP VSS endpoint (default `false`) |
| `vssAllowEmptyRestore` | `boolean?` | Allow restoring from VSS when no backup exists yet (default `false`) |
| `lspBaseUrl` | `string?` | LSP base URL for `createLsp()` and APay. Optional on networks with a default (e.g. `utexo` → `https://lsp-signet.utexo.com`); required otherwise |
| `lspBearerToken` | `string?` | LSP bearer token — required for APay |

---

### Signers (RLN)

Pass an `IRLNSigner` to the RLN constructor:

- `PasswordRLNSigner(password, mnemonic?)` uses password-based authentication.
  Supply the mnemonic for first-time initialization; existing nodes can unlock
  with the password alone.
- `NativeExternalRLNSigner(mnemonicOrSeed, network)` uses RLN's native external
  signer. It accepts a mnemonic or raw BIP39 seed bytes; see the
  [custom signer example](examples/custom-signer) for extending signer behavior.

rgb-lib uses `IRgbLibKeyProvider` instead. Its `getMnemonic()` callback is read on
each new native session; storage and authentication remain the app's responsibility.

### Lifecycle

| Operation | RLN | rgb-lib |
|-----------|-----|---------|
| `init()` | Create the node and initialize a new profile | Open the local wallet using its key provider |
| Connect | `unlock(params)` | `goOnline(params)`; `unlock(params)` is also supported |
| `shutdown()` | Stop the session, preserving data on disk | Same |
| `reinit(params)` | Restart the node and unlock | Reopen the wallet and connect |
| `destroy()` / `dispose()` | Release the session permanently; use a new instance afterward | Same |

`initialize()` is an alias for `init()`. After `shutdown()`, pass the same
protocol's connection parameters to `reinit(params)`. For final cleanup, use
`await wallet.dispose()` in `finally`. These methods preserve stored wallet data.

#### `IRLNUnlockParams`

| Field | Type | Description |
|-------|------|-------------|
| `bitcoindRpcUsername` | `string?` | Bitcoin RPC username (optional, falls back to network default) |
| `bitcoindRpcPassword` | `string?` | Bitcoin RPC password |
| `bitcoindRpcHost` | `string?` | Bitcoin RPC host |
| `bitcoindRpcPort` | `number?` | Bitcoin RPC port |
| `indexerUrl` | `string?` | Electrum indexer URL (e.g. `'127.0.0.1:50001'`) |
| `proxyEndpoint` | `string?` | RGB proxy endpoint (e.g. `'rpc://host:3000/json-rpc'`) |
| `ethRpcUrl` | `string \| null?` | Ethereum RPC for native BFA validation; configure when unlocking a BFA wallet |
| `announceAddresses` | `string[]?` | Public addresses to announce to the network |
| `announceAlias` | `string \| null?` | Node alias |
| `gossipRgsServerUrl` | `string \| null?` | RGS server URL for rapid gossip sync |

---

### Method Reference

On-chain methods are shared; Lightning, LSP, VSS and node-management methods
require RLN. Parameter and result types follow the selected protocol.

#### Balance & Address

| Method | Description |
|--------|-------------|
| `getBtcBalance()` | BTC balance (vanilla + colored) |
| `getAddress()` | Current on-chain deposit address |
| `rotateVanillaAddress()` | Derive a fresh on-chain (vanilla/BTC) address |
| `getNetwork()` | Configured network string |
| `getNetworkInfo()` | Network-level info; fields depend on the native implementation |

#### UTXO Management

| Method | Description |
|--------|-------------|
| `createUtxos({ upTo?, num?, size?, feeRate? })` | Create UTXOs (all-in-one) |
| `listUnspents()` | List unspent UTXOs with RGB allocations |

#### Assets

| Method | Description |
|--------|-------------|
| `listAssets()` | All RGB assets (NIA, CFA, IFA, UDA, plus the RN-specific `bfa` collection) |
| `getAssetBalance(assetId)` | Balance for one asset |
| `issueAssetNia({ ticker, name, precision, amounts })` | Issue a Non-Inflationary Asset |
| `issueAssetIfa({ ticker, name, precision, amounts, inflationAmounts, rejectListUrl })` | Issue an Inflatable Asset |
| `inflate({ assetId, inflationAmounts, feeRate?, minConfirmations? })` | Inflate an IFA; returns `{ txid }` |
| `blindReceive({ assetId?, amount?, durationSeconds?, minConfirmations? })` | Create a blinded RGB invoice. Omit `assetId`/`amount` if the receiver doesn't own the asset yet |
| `witnessReceive({ assetId?, amount?, durationSeconds?, minConfirmations? })` | Create a witness RGB invoice. Omit `assetId`/`amount` if the receiver doesn't own the asset yet |
| `decodeRGBInvoice({ invoice })` | Decode an RGB invoice |

#### BFA & Consignments

| Method | Description |
|--------|-------------|
| `getBfaCapabilities()` | Available `{ bfa, burn, consignment }` support for the native build and signer |
| `burn({ assetId, amount, burnRecipient?, feeRate, minConfirmations })` | Burn asset units; returns `{ txid, batchTransferIdx }` |
| `getConsignment(assetId, txid)` | Saved consignment as Base64 |
| `getConsignmentPath(assetId, txid)` | Local proof path for wallet-internal use |

For RLN, burn requires `PasswordRLNSigner`; `NativeExternalRLNSigner` does not
support it. For either protocol, check `getBfaCapabilities()` before offering burn.
Use a positive decimal u64 string for `amount`, a positive integer sat/vB `feeRate`, and
0–255 `minConfirmations`. BFA requires a 32-byte hex `burnRecipient` without `0x`.
`burn()` is irreversible and does not retry or deduplicate; use `BurnOperations`
for a persistent journal. Invoice and balance APIs still require safe JS integers.

#### BTC Sends

| Method | Description |
|--------|-------------|
| `sendBtc({ address, amount, feeRate, skipSync? })` | On-chain BTC send |

#### Transactions & Transfers

| Method | Description |
|--------|-------------|
| `listTransactions()` | On-chain transaction history |
| `listTransactionsByTxid(txid, skipSync?)` | Transactions matching a txid |
| `listTransfers(assetId?)` | RGB transfer history |
| `listTransfersByTxid(txid)` | RGB transfers matching a txid |
| `failTransfers(params)` | Mark pending transfers as failed |
| `refreshWallet()` | Refresh RGB transfer state (`Promise<void>`, shared with web) |
| `refreshTransfers(skipSync?)` | RN-specific detailed refresh result, keyed by batch transfer ID |
| `syncWallet()` | Sync blockchain state |

#### Fees & Backup

| Method | Description |
|--------|-------------|
| `estimateFeeRate(blocks)` | Fee rate estimate for target confirmation |
| `createBackup({ backupPath, password })` | Encrypted local backup (file) |
| `backupNow()` | RLN only: replicate state to VSS; returns the new backup version |

#### IUTEXOProtocol — Lightning

| Method | Description |
|--------|-------------|
| `createLightningInvoice({ amountSats?, asset?, expirySeconds? })` | Create a Lightning invoice |
| `payLightningInvoice({ lnInvoice, amount?, assetId? })` | Pay a Lightning invoice |
| `getLightningSendStatus(paymentHash)` | Poll send status — `RlnPaymentStatus` (`'Pending'` \| `'Claimable'` \| `'Claiming'` \| `'Succeeded'` \| `'Cancelled'` \| `'Failed'`); `null` if the hash is unknown |
| `getLightningReceiveStatus(invoice)` | Poll receive status (`RlnInvoiceStatus`) |
| `listLightningPayments()` | List all Lightning payments |

#### IUTEXOProtocol — LSP & Async payments (APay)

| Method | Description |
|--------|-------------|
| `createLsp(peer?)` | Discover the LSP peer and configure virtual channels, or pass `LspPeer` overrides. Call before `init()`/`reinit()` |
| `getLspConfig()` | Return `{ baseUrl, bearerToken }` this node was initialized with |
| `apayNewWithAddress(hostNodeId, username, domain)` | Register an attested hash pool (signs `address_sig`) — hash-substitution resistant |
| `apayNew(hostNodeId)` | Register a hash pool without an address attestation |
| `createHodlInvoice(params)` | Create a HODL invoice tied to a specific payment hash |
| `claimHodlInvoice(paymentHash, preimage)` | Reveal preimage to claim an inbound HODL payment |
| `cancelHodlInvoice(paymentHash)` | Cancel a HODL invoice |
| `listPayments()` | Return all payments including `InboundHodl` with preimage |

See [docs/lsp.md](./docs/lsp.md) for `UtexoLsp` composed flows and full examples.

#### IUTEXOProtocol — Onchain (RGB)

| Method | Description |
|--------|-------------|
| `onchainReceive({ assetId?, amount?, durationSeconds?, minConfirmations?, witness? })` | RGB invoice — witness by default (`witness: true`). Pass `witness: false` for a blinded invoice |
| `onchainSend({ invoice, assetId?, amount?, donation?, feeRate?, minConfirmations?, skipSync?, witnessData? })` | RGB send via decoded invoice |
| `listOnchainTransfers(assetId?)` | RGB transfer history |

#### RLN Extras — Node Info

| Method | Description |
|--------|-------------|
| `getNodeInfo()` | Node pubkey, channel counts, sync status |

#### RLN Extras — Peers

| Method | Description |
|--------|-------------|
| `connectPeer(peerPubkeyAndAddr)` | Connect to a peer (`pubkey@host:port`) |
| `disconnectPeer(peerPubkey)` | Disconnect a peer |
| `listPeers()` | List connected peers |

#### RLN Extras — Channels

| Method | Description |
|--------|-------------|
| `openChannel({ peerPubkeyAndOptAddr, capacitySat, pushMsat, public, withAnchors, assetId?, assetAmount? })` | Open a channel |
| `closeChannel(channelId, peerPubkey, force)` | Close a channel |
| `listChannels()` | List open channels |
| `getChannelId(temporaryChannelId)` | Resolve temporary → permanent channel ID |

#### RLN Extras — Payments

| Method | Description |
|--------|-------------|
| `keysend(destPubkey, amtMsat, assetId?, assetAmount?)` | Spontaneous keysend payment |
| `decodeLnInvoice(invoice)` | Decode a Lightning invoice |
| `invoiceStatus(invoice)` | Raw invoice status |

#### RLN Extras — Utility

| Method | Description |
|--------|-------------|
| `checkIndexerUrl(url)` | Validate an electrum URL |
| `checkProxyEndpoint(endpoint)` | Validate a proxy endpoint |
| `signMessage(message)` / `verifyMessage(message, signature)` | Sign or verify with the node's own key |

---

## Core Workflows

After funding the wallet and creating RGB UTXOs, issue an asset:

```typescript
const { assetId } = await wallet.issueAssetNia({
  ticker: 'DEMO', name: 'Demo Token', precision: 2, amounts: [1000],
});
```

For a Lightning payment, both wallets must use RLN and have usable channel liquidity:

```typescript
const { lnInvoice } = await receiverWallet.createLightningInvoice({
  amountSats: 3000,
  expirySeconds: 900,
  asset: { assetId, amount: 10 }, // omit asset for a BTC-only payment
});
const { txid: paymentHash } = await senderWallet.payLightningInvoice({ lnInvoice });
// Poll getLightningSendStatus(paymentHash) until Succeeded or a terminal failure.
```

The demo contains full flows for
[channels, payments and restart](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo/blob/main/flows/payments/runRlnUtexoWalletChannelPaymentFlow.ts)
and [external-signer asset channels](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo/blob/main/flows/ext-signer/runRlnUtexoWalletAssetChannelExtSignerFlow.ts).

## VSS — Encrypted Remote Backup

VSS (Versioned Storage Service) keeps an encrypted remote copy of an RLN node's
LDK state. Restore with the original RLN credentials and VSS backup. This is an
RLN recovery flow; it does not migrate the wallet to rgb-lib.

### Enabling VSS

Set `vssUrl` (and optionally the two flags) in the `UTEXOWalletNodeParams` constructor. VSS state is synced automatically as the node runs — no extra calls needed during normal operation.

```typescript
const wallet = new UTEXOWallet(
  {
    storageDirPath: storageDir,
    daemonListeningPort: 9735,
    ldkPeerListeningPort: 9736,
    network: 'regtest',
    vssUrl: 'https://vss.example.com',
    vssAllowHttp: false,           // set true if vssUrl starts with http://
    vssAllowEmptyRestore: false,   // set true to allow first-time restore with no backup yet
  },
  new PasswordRLNSigner('my-password', keys.mnemonic),
);

await wallet.init();
await wallet.unlock(unlockParams);
// VSS syncs automatically while the node is running
```

### Restoring from VSS

To restore on a new device (or after wiping local storage), create a fresh wallet pointing at the **same** VSS URL with the **same** credentials, then call `vssClearFence()` between `init()` and `unlock()`. The fence is a single-writer lock the old node left on the VSS — clearing it allows the new node to take ownership and pull the latest state.

```typescript
const walletRestored = new UTEXOWallet(
  {
    storageDirPath: newEmptyStorageDir,   // fresh directory — no existing node state
    daemonListeningPort: 9735,
    ldkPeerListeningPort: 9736,
    network: 'regtest',
    vssUrl: 'https://vss.example.com',
    vssAllowHttp: false,
    vssAllowEmptyRestore: false,
  },
  new PasswordRLNSigner('my-password', keys.mnemonic),
);

await walletRestored.init();
await walletRestored.vssClearFence('my-password');  // release stale lock before unlock
await walletRestored.unlock(unlockParams);           // pulls LDK state from VSS
```

### `vssClearFence(password)`

Clears the VSS single-writer fence lock. Must be called **after `init()` but before `unlock()`** in the restore path. Requires the same password used to init the original node.

### `backupNow()`

Uploads a snapshot now instead of waiting for the node's own schedule, and returns the new backup version. Requires `vssUrl`.

The imperative `configureVssBackup` / `disableVssAutoBackup` / `vssBackup` / `vssBackupInfo` quartet is **not** part of the contract: the node owns its single state store and configures its VSS client at `init()` from `vssUrl`. Web has those methods because it also runs an rgb-lib wallet with a second store to replicate.

A full end-to-end example (fund → channel → simulate device loss → restore → verify channels recovered) is in the demo app: [`flows/vss/runRlnVssFlow.ts`](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo/blob/main/flows/vss/runRlnVssFlow.ts).

---

## Standalone helpers

| Function | Description |
|----------|-------------|
| `generateKeys(network?)` | Generate mnemonic, xpubs, master fingerprint |
| `createWallet(network?)` | Alias for `generateKeys` |
| `deriveKeysFromMnemonic(network, mnemonic)` | Derive keys from existing mnemonic |
| `deriveKeysFromSeed(network, seed)` | Derive keys from BIP39 seed |
| `signMessage` / `verifyMessage` | Schnorr message signing (standalone, no wallet) |

---

## RLN Manager (advanced)

`RLNManager` and `createRLNManager` expose the raw RLN node API for advanced use cases where you need full control of the node lifecycle and don't want `UTEXOWallet`'s opinionated wrapper. All methods map 1:1 to the native module calls.

```typescript
import { createRLNManager } from '@utexo/rgb-sdk-rn';

const rln = createRLNManager();
await rln.rlnCreateNode({ storageDirPath, daemonListeningPort, ldkPeerListeningPort, network });
await rln.rlnInitNode(password, mnemonic);
await rln.rlnUnlockNode({ password, ...connectionParams });
// ...
await rln.rlnShutdown();
await rln.rlnDestroyNode();
```

## Virtual Channels

RLN supports `trusted_no_broadcast` channels that become usable without an
on-chain funding broadcast. Configure `enableVirtualChannelsV0` and the host
allowlist before initialization; payments use the regular Lightning API.
See [setup, trust model and lifecycle](docs/virtual-channels.md).

## LSP Integration

`UtexoLsp` connects an RLN wallet to an LSP for inbound liquidity, on-chain/Lightning
transfers and Lightning Address payments. Create it **before `init()` or `reinit()`**
so peer discovery and virtual-channel configuration reach the node:

```typescript
const wallet = new UTEXOWallet(nodeParams, signer);
const lsp = await wallet.createLsp();
await wallet.init();
await wallet.unlock(unlockParams);
await lsp.connect();
```

See the [full LSP reference](docs/lsp.md) and
[two-asset payment examples](examples/lsp-two-assets).

### Async payments (APay)

`lsp.enableLightningAddress()` registers an attested hash pool and Lightning
Address. The LSP can hold incoming payments while the recipient is offline;
settlement requires the recipient to reconnect over P2P. Refill the pool with
`lsp.refillHashPool()` when needed.

APay settlement is automatic. HODL invoices created directly with
`createHodlInvoice()` require claiming with the preimage; use
`lsp.claimPendingPayments()` for pending claims.
See [APay flows and API](docs/async-payments.md).

## WebRGB integration

Install [@utexo/webrgb](https://github.com/UTEXO-Protocol/webrgb/tree/dev) to expose a connected wallet to dApps through
`@utexo/rgb-sdk-rn/webrgb`. Create one provider per dApp session. It handles wallet
calls and approvals; WalletConnect sessions and RPC routing are provided
separately by [@utexo/webrgb-walletconnect](https://github.com/UTEXO-Protocol/webrgb-walletconnect/tree/dev).

```bash
npm install @utexo/webrgb@0.1.3 @utexo/webrgb-walletconnect@0.1.3
```

```typescript
import { WebRgbProvider } from '@utexo/rgb-sdk-rn/webrgb';

const provider = new WebRgbProvider(wallet, {
  origin: approvedOrigin, // from the transport session
  assertAuthorized: () => session.assertAuthorized(),
  confirm: request => showApprovalDialog(request),
});

await provider.enable(); // request connection approval
const { network, protocol, methods } = await provider.getInfo();
const assets = await provider.listAssets();
const { invoice } = await provider.blindReceive(); // request invoice approval
const witness = await provider.witnessReceive({ amount: 5 }); // request witness invoice approval
if (methods.includes('signMessage')) { // RLN only
  const { signature } = await provider.signMessage('Sign in to mint.example');
}
const transfers = await provider.listTransfers();

provider.revoke(); // on session expiry/disconnect
```

The app supplies permission checks and the confirmation UI (`Promise<boolean>`).
Set `sessionApproved: true` only for an already approved transport session to skip
the connection prompt. `methods` lists calls supported by this wallet and session; check it before
requesting optional features such as message signing. Supported calls can include
`getAddress()`, `witnessReceive()`, `signMessage(message)`, `getAssetBalance(assetId)`,
`getTransferStatus(transferId, assetId?)`, and `decodeRgbInvoice(invoice)`.

Handle `witnessReceive` and `signMessage` in the confirmation UI. Witness invoices
use the same parameters and confirmation floor as blinded invoices; message
signing requires showing the requesting origin and exact message. For WalletConnect,
include these method names in the wallet's supported methods and the dApp's requested
session permissions (`optionalMethods` can be used for `signMessage`).

Optional burn/proof export: [setup and flow](./src/integrations/webrgb/burn.ts).

Tron payouts use `burnRecipient: { chainId: 'tron:728126428', address: 'T…' }`
(mainnet; Shasta `2494104990` and Nile `3448148188` are also accepted). Use a
nonzero Base58Check address with its original casing. The wallet validates its
checksum before prompting or invoking native burn. `getInfo().burnRecipientNamespaces`
advertises `tron` only when native burn and the durable operation store are available;
a dApp must check this field before requesting a Tron burn from an older wallet.
EVM requests retain the `eip155:<chainId>` and `0x…` format.

The native proof contains the 20 account bytes padded to 32 bytes. Tron's `41`
version byte and checksum are not included; the destination chain is retained in
approved journal metadata. This does not configure or verify bridge contracts.
The bridge payout route and its contracts must be configured independently.

Use WebRGB and its WalletConnect adapter version `0.1.3` or newer. Payout chains
are burn arguments; the WalletConnect session stays on `rgb:<network>`.
If a request returns `NOT_ENABLED` after a wallet restart, call `enable()` again
on the existing provider while the session remains valid. Burns are not retried
automatically.

---

## Further reading

| Doc | Description |
|-----|-------------|
| [examples/dual-backend.ts](examples/dual-backend.ts) | Session setup, reopening and cleanup for either protocol |
| [examples/custom-signer](examples/custom-signer) | Custom native RLN signer |
| [docs/lsp.md](./docs/lsp.md) | Full LSP reference: `UtexoLsp`, `LspPeer`, all methods, examples |
| [examples/lsp-two-assets](./examples/lsp-two-assets) | Four annotated flows for an LSP serving one asset and converting another |
| [docs/async-payments.md](./docs/async-payments.md) | Async payment (APay) protocol, six-step flow diagrams, SDK usage |
| [docs/virtual-channels.md](./docs/virtual-channels.md) | Virtual channels: trusted no-broadcast, host-key allowlist, `virtualPeerPubkeys`, SDK usage |

---

## Demo App

[rgb-sdk-rn-demo](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo) demonstrates the
shared wallet UI with separate **Wallet** (RLN) and **RGB Lib** (on-chain) profiles,
independent credentials and storage, and WebRGB/WalletConnect sessions. It also
includes channel, payment, VSS, LSP and APay flows.

Follow the demo's [setup instructions](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo#installation-and-build)
and [wallet integration guide](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo/blob/main/docs/wallet-integration.md)
for native builds, infrastructure and environment configuration.
