# RGB SDK for React Native

[`@utexo/rgb-sdk-rn`](https://www.npmjs.com/package/@utexo/rgb-sdk-rn)

> **Beta release** — APIs may change between releases. Report issues on
> [GitHub](https://github.com/UTEXO-Protocol/rgb-sdk-rn/issues).

React Native SDK for on-device RGB assets, with on-chain operations via
**rgb-lib** and Lightning payments via the **RGB Lightning Node (RLN)**.

> **RLN (`RGB_LN`), including Lightning, is temporarily disabled in this
> release.** Its API and examples remain documented below. RGB_L1 is available
> by default.

[![npm version](https://img.shields.io/npm/v/@utexo/rgb-sdk-rn)](https://www.npmjs.com/package/@utexo/rgb-sdk-rn)
[![license](https://img.shields.io/npm/l/@utexo/rgb-sdk-rn)](https://www.npmjs.com/package/@utexo/rgb-sdk-rn)

> **Note**: React Native port of the
> [original RGB SDK for Node.js](https://github.com/UTEXO-Protocol/rgb-sdk). Use
> that SDK for Node.js applications.

## Requirements

- React Native with the New Architecture enabled.
- iOS 16.0 or later.
- Android API 24 or later, `arm64-v8a` or `x86_64`.
- An indexer and RGB proxy. Known networks have defaults; rgb-lib requires a
  protocol 1.0 proxy.

## Install

```bash
npm install @utexo/rgb-sdk-rn
```

Native rgb-lib dependencies are installed automatically. On iOS, set the app's
deployment target to 16.0 or later, then install pods:

```bash
(cd ios && pod install)
```

Rebuild the native application after installing or updating the SDK.

### RLN (`RGB_LN`)

RLN is disabled by `rgbSdk.rln: false` in the SDK's `package.json`. To build
with RLN, set it to `true`, reinstall the native dependencies and rebuild the
app. Without it, creating an RGB_LN wallet throws `NATIVE_BACKEND_UNAVAILABLE`.

## Quick start

### Wallet isolation

Use a different mnemonic and storage directory for each protocol. Switching
protocols does not migrate wallet state.

### rgb-lib (`RGB_L1`, default)

Pass the mnemonic as `keys`, or use a [reader or watch-only keys](#rgb_l1-keys).
The `utexo` network uses Bitcoin signet.

```typescript
import {
  UTEXOWallet,
  generateKeys,
  type RgbLibWalletParams,
} from '@utexo/rgb-sdk-rn';

const network = 'utexo';
// First use only: save the mnemonic in secure storage before init().
// On later launches, read the saved mnemonic instead of generating new keys.
const { mnemonic } = await generateKeys(network);

const walletParams: RgbLibWalletParams = {
  network,
  storageDirPath: '/path/to/rgb-lib-storage',
};
const onchain = new UTEXOWallet({
  params: walletParams,
  keys: mnemonic,
});

await onchain.init();
const address = await onchain.getAddress(); // works offline
const balance = await onchain.getBtcBalance(); // connects with the utexo defaults
```

`init()` opens the local wallet. Address generation, asset reads and backups
work offline. The first network operation connects using the network defaults. A
failed connection rejects that operation; the next one retries.

`goOnline()` is optional except on `regtest`. To use custom endpoints, call it
after `init()` and before the first network operation:

```typescript
await onchain.goOnline({
  indexer: { type: 'electrum', url: indexerUrl }, // tcp:// or ssl://
  proxyEndpoint,
});
```

`unlock(params)` has the same behavior. Omitted endpoints use network defaults.
To change settings after connecting, call `shutdown()`, `init()`, then
`goOnline(params)` again, or use `shutdown()` followed by `reinit(params)`.
Custom connection settings must be supplied again after reopening.

| Network   | Default indexer                         | Default proxy                                 |
| --------- | --------------------------------------- | --------------------------------------------- |
| `mainnet` | `ssl://electrs-01.utexo.com:50002`      | `rpcs://rgb-proxy.utexo.com/json-rpc`         |
| `utexo`   | `https://dev.esplora-01.mint.utexo.com` | `rpcs://dev.rgb-proxy.utexo.com/json-rpc`     |
| `signet`  | `ssl://electrum.iriswallet.com:50033`   | `rpcs://staging.rgb-proxy.utexo.com/json-rpc` |

Other networks use the `@utexo/rgb-sdk-core` defaults. rgb-lib needs a proxy
that implements protocol 1.0.

### RLN (`RGB_LN`)

> RLN is temporarily disabled in this release; this example needs
> `rgbSdk.rln: true` (see [Install](#rln-rgb_ln)).

RLN must be selected with `protocol: 'RGB_LN'`:

```typescript
import {
  UTEXOWallet,
  PasswordRLNSigner,
  generateKeys,
} from '@utexo/rgb-sdk-rn';

const network = 'utexo';
// First use only: save these credentials in secure storage before init().
// On later launches, read the saved credentials instead of generating new keys.
const keys = await generateKeys(network);
const wallet = new UTEXOWallet({
  protocol: 'RGB_LN',
  params: {
    storageDirPath: '/path/to/rln-storage',
    daemonListeningPort: 9735,
    ldkPeerListeningPort: 9736,
    network,
  },
  signer: new PasswordRLNSigner('my-secure-password', keys.mnemonic),
});

await wallet.init();
await wallet.unlock({}); // use network defaults, or pass IRLNUnlockParams
```

This is the first-run path. For reopening saved profiles and handling an already
initialized RLN node, see the [session example](examples/dual-backend.ts).

### On-chain operations (both modes)

Use the same methods after `init()`. RGB_L1 connects automatically except on
`regtest`, which needs `goOnline(params)`. RLN needs `unlock(params)` first.

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

## Wallet API

| Mode              | Constructor                                               | Connect                                                                                                 |
| ----------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| rgb-lib (default) | `new UTEXOWallet({ params, keys })`                       | Automatic on the first network operation; explicit `goOnline(params)` for custom endpoints or `regtest` |
| RLN               | `new UTEXOWallet({ protocol: 'RGB_LN', params, signer })` | `unlock(params)`                                                                                        |

TypeScript infers the protocol from the constructor. `UTEXOWallet` defaults to
`RGB_L1`; use `UTEXOWallet<'RGB_LN'>` for RLN or `AnyUtexoWallet` when handling
both. Narrow `wallet.protocol` before calling protocol-specific methods.

The legacy `new UTEXOWallet(params, signer)` constructor selects RLN. Custom
signers used with it must declare `readonly protocol = 'RGB_LN'`.

### RLN configuration

#### `UTEXOWalletNodeParams`

| Field                     | Type        | Description                                                                                                                                                                                                                    |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storageDirPath`          | `string`    | Directory where the node persists its data                                                                                                                                                                                     |
| `daemonListeningPort`     | `number`    | RLN daemon HTTP port                                                                                                                                                                                                           |
| `ldkPeerListeningPort`    | `number`    | LDK peer-to-peer port                                                                                                                                                                                                          |
| `network`                 | `string`    | Bitcoin network (`'utexo'`, `'regtest'`, `'testnet'`, `'mainnet'`, …)                                                                                                                                                          |
| `maxMediaUploadSizeMb`    | `number?`   | Max media upload size in MB (default 20)                                                                                                                                                                                       |
| `reuseAddresses`          | `boolean?`  | Reuse on-chain addresses (default `false`)                                                                                                                                                                                     |
| `enableVirtualChannelsV0` | `boolean?`  | Enable virtual channel support (required on both host and client)                                                                                                                                                              |
| `virtualPeerPubkeys`      | `string[]?` | Host pubkeys allowed to open inbound virtual channels. `null`/`[]` = accept from anyone                                                                                                                                        |
| `vssUrl`                  | `string?`   | VSS server URL for encrypted remote backup                                                                                                                                                                                     |
| `vssAllowHttp`            | `boolean?`  | Allow plain HTTP VSS endpoint (default `false`)                                                                                                                                                                                |
| `vssAllowEmptyRestore`    | `boolean?`  | If the VSS restore fails (server unreachable, wrong key), start with empty local state instead of failing `unlock()`. **Unsafe:** a node with active channels can lose funds. A missing backup never needs it. Default `false` |
| `lspBaseUrl`              | `string?`   | LSP base URL for `createLsp()` and APay. Optional on networks with a default (e.g. `utexo` → `https://lsp-signet.utexo.com`); required otherwise                                                                               |
| `lspBearerToken`          | `string?`   | LSP bearer token — required for APay                                                                                                                                                                                           |

#### `IRLNUnlockParams`

| Field                 | Type              | Description                                                                                                                                                                 |
| --------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bitcoindRpcUsername` | `string?`         | Bitcoin RPC username (optional, falls back to network default)                                                                                                              |
| `bitcoindRpcPassword` | `string?`         | Bitcoin RPC password                                                                                                                                                        |
| `bitcoindRpcHost`     | `string?`         | Bitcoin RPC host                                                                                                                                                            |
| `bitcoindRpcPort`     | `number?`         | Bitcoin RPC port                                                                                                                                                            |
| `indexerUrl`          | `string?`         | Electrum indexer URL (e.g. `'127.0.0.1:50001'`)                                                                                                                             |
| `proxyEndpoint`       | `string?`         | RGB proxy endpoint (e.g. `'rpc://host:3000/json-rpc'`)                                                                                                                      |
| `ethRpcUrl`           | `string \| null?` | Ethereum RPC for native BFA validation; configure when unlocking a BFA wallet. Supported by both signers                                                                    |
| `announceAddresses`   | `string[]?`       | Public addresses to announce to the network                                                                                                                                 |
| `announceAlias`       | `string \| null?` | Node alias                                                                                                                                                                  |
| `gossipRgsServerUrl`  | `string \| null?` | RGS server URL for rapid gossip sync. `PasswordRLNSigner` only; `NativeExternalRLNSigner` throws `ValidationError`, because RLN's external-signer unlock has no RGS setting |

### RLN signers

Pass an `IRLNSigner` to the RLN constructor:

- `PasswordRLNSigner(password, mnemonic?)` uses password-based authentication.
  Supply the mnemonic for first-time initialization; existing nodes can unlock
  with the password alone.
- `NativeExternalRLNSigner(mnemonicOrSeed, network)` uses RLN's native external
  signer. It accepts a mnemonic or raw BIP39 seed bytes; see the
  [custom signer example](examples/custom-signer) for extending signer behavior.

rgb-lib takes `keys` instead.

### RGB_L1 keys

`keys` accepts a mnemonic string, a sync/async reader such as
`() => SecureStore.getItemAsync('mnemonic')`, or an object with `getMnemonic()`.

Readers run on each new session. An empty or failed read rejects `init()` with
`KEYS_UNAVAILABLE`.

Public keys alone open a watch-only wallet. See
[`RgbLibKeys`](src/wallet/rgb-lib/key-provider.ts) for all options.

### Lifecycle

| Operation                 | RLN                                                             | rgb-lib                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `init()`                  | Create the node and initialize a new profile                    | Open the local wallet using `keys`; also reopens after `shutdown()`. Repeated calls on an open wallet do nothing                            |
| Connect                   | `unlock(params)`                                                | `goOnline(params)`; `unlock(params)` is also supported. Optional except on `regtest`: the first online operation connects with the defaults |
| `shutdown()`              | Stop the session, preserving data on disk                       | Same                                                                                                                                        |
| `reinit(params?)`         | Recreate the node manager; unlock only when params are supplied | After `shutdown()`, call `init()` and, if params are supplied, `goOnline(params)`                                                           |
| `destroy()` / `dispose()` | Release the session permanently; use a new instance afterward   | Same                                                                                                                                        |

`initialize()` is an alias for `init()`. RGB_L1 can restart with `init()`; RLN
needs `reinit()`. Passing `{}` to `reinit({})` also connects with network
defaults; omitting the argument only opens the session. Use `dispose()` for
final cleanup. These methods preserve stored wallet data.

```typescript
// RGB_L1 lifecycle, using network defaults (except regtest).
try {
  await onchain.init();
  await onchain.getBtcBalance(); // connects automatically

  // Later, when pausing and resuming the wallet:
  await onchain.shutdown();
  await onchain.init();
  await onchain.refreshTransfers(); // reconnects automatically
} finally {
  await onchain.dispose(); // use a new instance after this
}
```

### Method reference

On-chain methods are shared; Lightning, LSP, VSS and node-management methods
require RLN. Parameter and result types follow the selected protocol.

#### Balances and addresses

| Method                          | Description                                                    |
| ------------------------------- | -------------------------------------------------------------- |
| `getBtcBalance({ skipSync? }?)` | BTC balance (vanilla + colored)                                |
| `getAddress()`                  | Current on-chain deposit address                               |
| `rotateVanillaAddress()`        | Derive a fresh on-chain (vanilla/BTC) address                  |
| `getNetwork()`                  | Configured network string                                      |
| `getNetworkInfo()`              | Network-level info; fields depend on the native implementation |

#### UTXOs

| Method                                                     | Description                                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `createUtxos({ upTo?, num?, size?, feeRate?, skipSync? })` | Create UTXOs (all-in-one); returns how many were created. `feeRate` is an integer sat/vB |
| `listUnspents({ skipSync? }?)`                             | List unspent UTXOs with RGB allocations                                                  |

#### Assets

| Method                                                                                        | Description                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listAssets({ filterAssetSchemas? }?)`                                                        | All RGB assets (NIA, CFA, IFA, UDA, plus the RN-specific `bfa` collection); filter by `'Nia' \| 'Cfa' \| 'Uda' \| 'Ifa' \| 'Bfa'`                                                                  |
| `getAssetMetadata(assetId)`                                                                   | Contract metadata; supplies are exact decimal strings                                                                                                                                              |
| `getAssetBalance(assetId)`                                                                    | Balance for one asset                                                                                                                                                                              |
| `issueAssetNia({ ticker, name, precision, amounts })`                                         | Issue a Non-Inflationary Asset                                                                                                                                                                     |
| `issueAssetIfa({ ticker, name, precision, amounts, inflationAmounts, rejectListUrl })`        | Issue an Inflatable Asset                                                                                                                                                                          |
| `issueAssetCfa({ name, details?, precision, amounts, filePath? })`                            | Issue a Collectible Fungible Asset. RGB_LN uploads `filePath` to the node first                                                                                                                    |
| `issueAssetUda({ ticker, name, details?, precision, mediaFilePath?, attachmentsFilePaths? })` | Issue a Unique Digital Asset                                                                                                                                                                       |
| `inflate({ assetId, inflationAmounts, feeRate?, minConfirmations? })`                         | Inflate an IFA; returns `{ txid }`                                                                                                                                                                 |
| `blindReceive({ assetId?, amount?, assignmentKind?, durationSeconds?, minConfirmations? })`   | Create a blinded RGB invoice. Omit `assetId`/`amount` if the receiver doesn't own the asset yet. `assignmentKind`: `Fungible`, `NonFungible`, `InflationRight`, `MintRight` (RGB_L1 only) or `Any` |
| `witnessReceive({ assetId?, amount?, assignmentKind?, durationSeconds?, minConfirmations? })` | Create a witness RGB invoice. Same `assignmentKind` rules as `blindReceive`                                                                                                                        |
| `decodeRGBInvoice({ invoice })`                                                               | Decode an RGB invoice                                                                                                                                                                              |

#### BFA and consignments

| Method                                                                 | Description                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `getBfaCapabilities()`                                                 | Available `{ bfa, burn, consignment }` support for the native build and signer |
| `burn({ assetId, amount, burnRecipient?, feeRate, minConfirmations })` | Burn asset units; returns `{ txid, batchTransferIdx }`                         |
| `getConsignment(assetId, txid)`                                        | Saved consignment as Base64                                                    |
| `getConsignmentPath(assetId, txid)`                                    | Local proof path for wallet-internal use                                       |

For RLN, burn requires `PasswordRLNSigner`; `NativeExternalRLNSigner` does not
support it. For either protocol, check `getBfaCapabilities()` before offering
burn. Use a positive decimal u64 string for `amount`, a positive integer sat/vB
`feeRate`, and 0–255 `minConfirmations`. BFA requires a 32-byte hex
`burnRecipient` without `0x`. `burn()` is irreversible and does not retry or
deduplicate; use `BurnOperations` for a persistent journal. Invoice and balance
APIs still require safe JS integers.

#### Bitcoin transfers

| Method                                             | Description       |
| -------------------------------------------------- | ----------------- |
| `sendBtc({ address, amount, feeRate, skipSync? })` | On-chain BTC send |

#### History and synchronization

| Method                                    | Description                                                     |
| ----------------------------------------- | --------------------------------------------------------------- |
| `listTransactions({ skipSync? }?)`        | On-chain transaction history                                    |
| `listTransactionsByTxid(txid, skipSync?)` | Transactions matching a txid                                    |
| `listTransfers(assetId?)`                 | RGB transfer history                                            |
| `listTransfersByTxid(txid)`               | RGB transfers matching a txid                                   |
| `failTransfers(params)`                   | Mark pending transfers as failed                                |
| `refreshWallet()`                         | Refresh RGB transfer state (`Promise<void>`, shared with web)   |
| `refreshTransfers(skipSync?)`             | RN-specific detailed refresh result, keyed by batch transfer ID |
| `syncWallet()`                            | Sync blockchain state                                           |

#### Fees and backup

| Method                                                  | Description                                                                                                                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `estimateFeeRate(blocks)`                               | Fee rate estimate for target confirmation, rounded up to an integer sat/vB                                                                                                   |
| `checkIndexerUrl(url)`                                  | Detect the indexer protocol: `{ indexerProtocol: 'electrum' \| 'esplora' \| 'bitcoind' }`                                                                                    |
| `drainTo({ address, feeRate? })`                        | RGB_L1 only. Send the whole vanilla BTC balance to `address`                                                                                                                 |
| `deleteTransfers({ batchTransferIdx?, noAssetOnly? }?)` | RGB_L1 only. Remove failed transfers from the local database                                                                                                                 |
| `createBackup({ backupPath, password })`                | RGB_L1 only. Encrypted backup file; restore it with `restoreFromBackup()`. RGB_LN rejects it with `UNSUPPORTED_CAPABILITY`: RLN mobile bindings have no file backup, use VSS |
| `backupNow()`                                           | RLN only: replicate state to VSS; returns the new backup version                                                                                                             |

#### On-chain RGB transfers

| Method                                                                                                         | Description                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onchainReceive({ assetId?, amount?, assignmentKind?, durationSeconds?, minConfirmations?, witness? })`        | RGB invoice — witness by default (`witness: true`). Pass `witness: false` for a blinded invoice                                                                                                                      |
| `onchainSend({ invoice, assetId?, amount?, donation?, feeRate?, minConfirmations?, skipSync?, witnessData? })` | RGB send via decoded invoice. `assetId` and `amount` default to the invoice values. `feeRate` is an integer in sat/vB (default 1 on RLN, 2 on RGB_L1). `skipSync` applies on RLN; RGB_L1 ignores it and always syncs |
| `listOnchainTransfers(assetId?)`                                                                               | RGB transfer history                                                                                                                                                                                                 |

#### Lightning payments (RLN)

| Method                                                                                            | Description                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createLightningInvoice({ amountSats?, asset?, expirySeconds?, description?, descriptionHash? })` | Create a Lightning invoice                                                                                                                                          |
| `payLightningInvoice({ lnInvoice, amount?, assetId? })`                                           | Pay a Lightning invoice                                                                                                                                             |
| `getLightningSendStatus(paymentHash)`                                                             | Poll send status — `RlnPaymentStatus` (`'Pending'` \| `'Claimable'` \| `'Claiming'` \| `'Succeeded'` \| `'Cancelled'` \| `'Failed'`); `null` if the hash is unknown |
| `getLightningReceiveStatus(invoice)`                                                              | Poll receive status (`RlnInvoiceStatus`)                                                                                                                            |
| `listLightningPayments()`                                                                         | List all Lightning payments                                                                                                                                         |

#### LSP and async payments (RLN)

| Method                                             | Description                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `createLsp(peer?)`                                 | Discover the LSP peer and configure virtual channels, or pass `LspPeer` overrides. Call before `init()`/`reinit()` |
| `getLspConfig()`                                   | Return `{ baseUrl, bearerToken }` this node was initialized with                                                   |
| `apayNewWithAddress(hostNodeId, username, domain)` | Register an attested hash pool (signs `address_sig`) — hash-substitution resistant                                 |
| `apayNew(hostNodeId)`                              | Register a hash pool without an address attestation                                                                |
| `createHodlInvoice(params)`                        | Create a HODL invoice tied to a specific payment hash                                                              |
| `claimHodlInvoice(paymentHash, preimage)`          | Reveal preimage to claim an inbound HODL payment                                                                   |
| `cancelHodlInvoice(paymentHash)`                   | Cancel a HODL invoice                                                                                              |
| `listPayments()`                                   | Return all payments including `InboundHodl` with preimage                                                          |

See [docs/lsp.md](./docs/lsp.md) for `UtexoLsp` composed flows and full
examples.

#### Node information (RLN)

| Method          | Description                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `getNodeInfo()` | Node pubkey, channel counts, channel and HTLC limits, network graph size, close-fee and pending-payment totals, account xpubs |

#### Peers (RLN)

| Method                           | Description                            |
| -------------------------------- | -------------------------------------- |
| `connectPeer(peerPubkeyAndAddr)` | Connect to a peer (`pubkey@host:port`) |
| `disconnectPeer(peerPubkey)`     | Disconnect a peer                      |
| `listPeers()`                    | List connected peers                   |

#### Channels (RLN)

| Method                                                                                                     | Description                              |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `openChannel({ peerPubkey, capacitySat, isPublic, pushMsat?, withAnchors?, assetId?, assetLocalAmount? })` | Open a channel                           |
| `closeChannel(channelId, peerPubkey, force)`                                                               | Close a channel                          |
| `listChannels()`                                                                                           | List open channels                       |
| `getChannelId(temporaryChannelId)`                                                                         | Resolve temporary → permanent channel ID |

#### Payment utilities (RLN)

| Method                                                 | Description                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `keysend(destPubkey, amtMsat, assetId?, assetAmount?)` | Spontaneous keysend payment                                     |
| `decodeLnInvoice(invoice)`                             | Decode a Lightning invoice, including `minFinalCltvExpiryDelta` |
| `invoiceStatus(invoice)`                               | Raw invoice status                                              |

#### Utilities (RLN)

| Method                                                       | Description                            |
| ------------------------------------------------------------ | -------------------------------------- |
| `checkProxyEndpoint(endpoint)`                               | Validate a proxy endpoint              |
| `signMessage(message)` / `verifyMessage(message, signature)` | Sign or verify with the node's own key |

## On-chain workflows

### Issue an asset

After funding the wallet and creating RGB UTXOs, issue an asset:

```typescript
const { assetId } = await wallet.issueAssetNia({
  ticker: 'DEMO',
  name: 'Demo Token',
  precision: 2,
  amounts: [1000],
});
```

### Send RGB

Obtain another wallet's blinded invoice (`onchainReceive({ witness: false })`):

```typescript
const { txid } = await wallet.onchainSend({
  invoice: recipientInvoice,
  assetId,
  amount: 100, // base units: 1 token at precision 2
  feeRate: 2,
});
await wallet.refreshTransfers();
```

The sender needs the RGB balance and BTC for fees. Both wallets refresh
transfers to advance the exchange; settlement also depends on confirmations.

## Lightning (RGB_LN)

> Temporarily disabled in this release. These examples require an RLN-enabled
> build.

Use initialized and unlocked RGB_LN wallets as `senderWallet` and
`receiverWallet`. Lightning payments require a usable channel with sufficient
liquidity. On mainnet, Lightning calls reject with
`LIGHTNING_DISABLED_ON_MAINNET`.

### Open a channel

Fund the sender with BTC, then connect to the recipient's peer:

```typescript
const peer = `${peerPubkey}@${peerHost}:9736`;
await senderWallet.connectPeer(peer);
const { temporaryChannelId } = await senderWallet.openChannel({
  peerPubkey: peer,
  capacitySat: 500_000,
  pushMsat: 0,
  isPublic: false,
  withAnchors: true,
});
```

Wait for funding confirmations and poll `listChannels()` until the channel is
usable. For an RGB channel, also pass `assetId` and `assetLocalAmount` to
`openChannel()`; the sender must hold that asset.

### Pay with BTC

```typescript
const { lnInvoice } = await receiverWallet.createLightningInvoice({
  amountSats: 3000,
  expirySeconds: 900,
});
const { txid: paymentHash } = await senderWallet.payLightningInvoice({
  lnInvoice,
});
const status = await senderWallet.getLightningSendStatus(paymentHash);
```

Poll until `Succeeded`, `Failed` or `Cancelled`. An accepted payment is not
necessarily settled.

### Pay with RGB

```typescript
const { lnInvoice } = await receiverWallet.createLightningInvoice({
  amountSats: 3000,
  expirySeconds: 900,
  asset: { assetId, amount: 10 }, // base units
});
const { txid: paymentHash } = await senderWallet.payLightningInvoice({
  lnInvoice,
});
// Poll getLightningSendStatus(paymentHash) until Succeeded or a terminal failure.
```

The channel must support the requested RGB asset.

### Restart the node

```typescript
await senderWallet.shutdown();
await senderWallet.reinit(unlockParams);
const info = await senderWallet.getNodeInfo();
```

Use `dispose()` when finished with the instance. Both shutdown and disposal
preserve wallet data on disk.

The demo contains full flows for
[channels, payments and restart](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo/blob/main/flows/payments/runRlnUtexoWalletChannelPaymentFlow.ts)
and
[external-signer asset channels](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo/blob/main/flows/ext-signer/runRlnUtexoWalletAssetChannelExtSignerFlow.ts).

## Backup and restore

The two protocols back up differently:

|             | RGB_L1 (rgb-lib)                                                           | RGB_LN (RLN)                                                           |
| ----------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Backup      | `createBackup({ backupPath, password })` writes an encrypted file          | VSS, automatic once `vssUrl` is set; `backupNow()` uploads immediately |
| Restore     | `restoreFromBackup({ backupFilePath, password, dataDir })` before `init()` | Automatic during `unlock()` when local storage is empty                |
| File backup | Yes                                                                        | No (`createBackup()` rejects)                                          |
| VSS         | No                                                                         | Yes                                                                    |

### RGB_L1: encrypted file

```typescript
import { UTEXOWallet, restoreFromBackup } from '@utexo/rgb-sdk-rn';

// Back up the initialized RGB_L1 wallet from Quick start; no network required.
// Use a new file in an existing directory, outside the wallet's storage.
// password is a nonempty encryption password supplied by the application.
const backupPath = '/path/to/backups/wallet.rgb';
await onchain.createBackup({ backupPath, password });

// When switching to the restored copy, stop the original session first.
await onchain.shutdown();

// Restore into a new, empty directory before init().
const dataDir = '/path/to/restored-storage';
await restoreFromBackup({
  backupFilePath: backupPath,
  password,
  dataDir,
});
const restored = new UTEXOWallet({
  params: { ...walletParams, storageDirPath: dataDir },
  keys: mnemonic, // the mnemonic of the backed-up wallet
});
try {
  await restored.init();
  const assets = await restored.listAssets(); // offline
  // Use the wallet here; network operations connect lazily as usual.
} finally {
  await restored.dispose();
}
```

`backupPath`, `backupFilePath` and `dataDir` must be absolute native paths, not
`file://` URIs. The password must be nonempty. `restoreFromBackup()` accepts
this SDK's RGB_L1 archives and rejects a nonempty or active destination
directory.

Keep the original mnemonic separately, together with the original `network`,
`witnessVersion` and `maxAllocationsPerUtxo` settings (`walletParams` above). A
watch-only restore can use the original public keys. The archive and its
password alone do not supply the keys required by the constructor. The app owns
off-device storage and backup updates after wallet changes.

### RLN: VSS

These examples require an RLN-enabled native build; RLN is disabled in this
release.

VSS (Versioned Storage Service) keeps an encrypted remote copy of an RLN node's
LDK state. Restore with the original RLN credentials and VSS backup. This is an
RLN recovery flow; it does not migrate the wallet to rgb-lib.

#### Enable VSS

Set `vssUrl` (and optionally the two flags) in the `UTEXOWalletNodeParams`
constructor. VSS state is synced automatically as the node runs — no extra calls
needed during normal operation.

```typescript
const wallet = new UTEXOWallet({
  protocol: 'RGB_LN',
  params: {
    storageDirPath: storageDir,
    daemonListeningPort: 9735,
    ldkPeerListeningPort: 9736,
    network: 'regtest',
    vssUrl: 'https://vss.example.com',
    vssAllowHttp: false, // set true if vssUrl starts with http://
    vssAllowEmptyRestore: false, // keep false: true starts empty if the restore fails
  },
  signer: new PasswordRLNSigner('my-password', keys.mnemonic),
});

await wallet.init();
await wallet.unlock(unlockParams);
// VSS syncs automatically while the node is running
```

#### Restore from VSS

To restore on a new device (or after wiping local storage), create a fresh
wallet pointing at the **same** VSS URL with the **same** credentials, then call
`vssClearFence()` between `init()` and `unlock()`. Stop the old node before
clearing its single-writer fence, and keep it stopped while the restored node
uses that state.

```typescript
const walletRestored = new UTEXOWallet({
  protocol: 'RGB_LN',
  params: {
    storageDirPath: newEmptyStorageDir, // fresh directory — no existing node state
    daemonListeningPort: 9735,
    ldkPeerListeningPort: 9736,
    network: 'regtest',
    vssUrl: 'https://vss.example.com',
    vssAllowHttp: false,
    vssAllowEmptyRestore: false,
  },
  signer: new PasswordRLNSigner('my-password', keys.mnemonic),
});

await walletRestored.init();
await walletRestored.vssClearFence('my-password'); // release stale lock before unlock
await walletRestored.unlock(unlockParams); // pulls LDK state from VSS
```

On `mainnet`, the node does not restore Lightning channel state from VSS. Only
the RGB wallet and shared configuration are restored. Channel recovery from VSS
works on test networks.

#### `vssClearFence(password)`

Clears the VSS single-writer fence lock. Must be called **after `init()` but
before `unlock()`** in the restore path. Requires the same password used to init
the original node.

#### `backupNow()`

Uploads a snapshot now instead of waiting for the node's own schedule, and
returns the new backup version. Requires `vssUrl`.

A full end-to-end example (fund → channel → simulate device loss → restore →
verify channels recovered) is in the demo app:
[`flows/vss/runRlnVssFlow.ts`](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo/blob/main/flows/vss/runRlnVssFlow.ts).

## Standalone helpers

| Function                                                   | Description                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `generateKeys(network?)`                                   | Generate mnemonic, xpubs, master fingerprint                                |
| `createWallet(network?)`                                   | Alias for `generateKeys`                                                    |
| `restoreFromBackup({ backupFilePath, password, dataDir })` | Restore an RGB_L1 archive into an empty directory before opening the wallet |
| `deriveKeysFromMnemonic(network, mnemonic)`                | Derive keys from existing mnemonic                                          |
| `deriveKeysFromSeed(network, seed)`                        | Derive keys from BIP39 seed                                                 |
| `signMessage` / `verifyMessage`                            | Schnorr message signing (standalone, no wallet)                             |

## RLN manager

`RLNManager` and `createRLNManager` expose the raw RLN node API for advanced use
cases where you need full control of the node lifecycle and don't want
`UTEXOWallet`'s opinionated wrapper. All methods map 1:1 to the native module
calls.

```typescript
import { createRLNManager } from '@utexo/rgb-sdk-rn';

const rln = createRLNManager();
await rln.rlnCreateNode({
  storageDirPath,
  daemonListeningPort,
  ldkPeerListeningPort,
  network,
  maxMediaUploadSizeMb: 20,
});
await rln.rlnInitNode(password, mnemonic);
await rln.rlnUnlockNode({ password, ...connectionParams });
// ...
await rln.rlnShutdown();
await rln.rlnDestroyNode();
```

## Virtual channels

RLN supports `trusted_no_broadcast` channels that become usable without an
on-chain funding broadcast. Configure `enableVirtualChannelsV0` and the host
allowlist before initialization; payments use the regular Lightning API. See
[setup, trust model and lifecycle](docs/virtual-channels.md).

## LSP integration

`UtexoLsp` connects an RLN wallet to an LSP for inbound liquidity,
on-chain/Lightning transfers and Lightning Address payments. Create it **before
`init()` or `reinit()`** so peer discovery and virtual-channel configuration
reach the node:

```typescript
const wallet = new UTEXOWallet({
  protocol: 'RGB_LN',
  params: nodeParams,
  signer,
});
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
`lsp.claimPendingPayments()` for pending claims. See
[APay flows and API](docs/async-payments.md).

## WebRGB integration

Install [@utexo/webrgb](https://github.com/UTEXO-Protocol/webrgb/tree/dev) to
expose a connected wallet to dApps through `@utexo/rgb-sdk-rn/webrgb`. Create
one provider per dApp session. It handles wallet calls and approvals;
WalletConnect sessions and RPC routing are provided separately by
[@utexo/webrgb-walletconnect](https://github.com/UTEXO-Protocol/webrgb-walletconnect/tree/dev).

```bash
npm install @utexo/webrgb@0.1.3 @utexo/webrgb-walletconnect@0.1.3
```

```typescript
import { WebRgbProvider } from '@utexo/rgb-sdk-rn/webrgb';

const provider = new WebRgbProvider(wallet, {
  origin: approvedOrigin, // from the transport session
  assertAuthorized: () => session.assertAuthorized(),
  confirm: (request) => showApprovalDialog(request),
});

await provider.enable(); // request connection approval
const { network, protocol, methods } = await provider.getInfo();
const assets = await provider.listAssets();
const { invoice } = await provider.blindReceive(); // request invoice approval
const witness = await provider.witnessReceive({ amount: 5 }); // request witness invoice approval
if (methods.includes('signMessage')) {
  // RLN only
  const { signature } = await provider.signMessage('Sign in to mint.example');
}
const transfers = await provider.listTransfers();

provider.revoke(); // on session expiry/disconnect
```

The app supplies session authorization and the approval UI (`Promise<boolean>`).
Use `sessionApproved: true` only when the transport session is already approved.
Check `getInfo().methods` before calling optional methods, and include the same
methods in the WalletConnect session permissions. For message signing, show the
requesting origin and exact message in the approval UI.

For burn and proof export, configure a persistent operation store and
`burn.destinationRoutes` matching the deployed bridge. Check
`getInfo().burnRecipientNamespaces` and `burnDestinationRoutes` before
requesting a payout. EVM recipients use `eip155:<chainId>` and a `0x` address;
Tron recipients use `tron:<chainId>` and a Base58Check address. See the
[burn integration API](src/integrations/webrgb/burn.ts) for configuration.

After a wallet restart, call `enable()` again if the provider returns
`NOT_ENABLED` and the transport session is still valid. Burns are not retried
automatically.

## Further reading

| Doc                                                    | Description                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [examples/dual-backend.ts](examples/dual-backend.ts)   | Session setup, reopening and cleanup for either protocol                                    |
| [examples/custom-signer](examples/custom-signer)       | Custom native RLN signer                                                                    |
| [docs/lsp.md](./docs/lsp.md)                           | Full LSP reference: `UtexoLsp`, `LspPeer`, all methods, examples                            |
| [examples/lsp-two-assets](./examples/lsp-two-assets)   | Four annotated flows for an LSP serving one asset and converting another                    |
| [docs/async-payments.md](./docs/async-payments.md)     | Async payment (APay) protocol, six-step flow diagrams, SDK usage                            |
| [docs/virtual-channels.md](./docs/virtual-channels.md) | Virtual channels: trusted no-broadcast, host-key allowlist, `virtualPeerPubkeys`, SDK usage |

## Demo app

[rgb-sdk-rn-demo](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo)
demonstrates the shared wallet UI with separate **Wallet** (RLN) and **RGB Lib**
(on-chain) profiles, independent credentials and storage, and
WebRGB/WalletConnect sessions. It also includes channel, payment, VSS, LSP and
APay flows.

Follow the demo's
[setup instructions](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo#installation-and-build)
and
[wallet integration guide](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo/blob/main/docs/wallet-integration.md)
for native builds, infrastructure and environment configuration.
