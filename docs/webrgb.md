# WebRGB integration

`@utexo/rgb-sdk-rn/webrgb` adapts an unlocked `UTEXOWallet` to the receiving,
read and optional burn methods in `@utexo/webrgb`. Install the WebRGB peer
when using this entry point. The main SDK entry point contains native wallet
operations and does not load WebRGB or WalletConnect.

```ts
import { BurnOperations } from '@utexo/rgb-sdk-rn';
import { WebRgbProvider } from '@utexo/rgb-sdk-rn/webrgb';

// One operation service and durable store per wallet, shared across sessions.
const operations = new BurnOperations(wallet, store);
const provider = new WebRgbProvider(wallet, {
  origin: approvedOrigin,
  sessionApproved: true,
  assertAuthorized: () => session.assertAuthorized(),
  confirm: request => showApprovalDialog(request),
  burn: { operations, allowedPayoutChainIds: ['eip155:42161'] },
});

const invoice = await provider.blindReceive({ amount: 100 });
const burn = await provider.burnAsset({
  network: wallet.getNetwork(),
  assetId,
  amount: '100',
  burnRecipient: { chainId: 'eip155:42161', address: evmAddress },
});
const proof = await provider.getConsignment({ assetId, txid: burn.txid });
// When this session ends:
provider.revoke();
```

The host derives origin from an approved session, checks permissions and expiry,
and supplies the confirmation UI. Each invoice and burn needs confirmation.
Show the exact amount, asset, payout chain/address, BTC fee rate, confirmations
and permission to share the proof. Sharing another origin's proof requires fresh
consent. Serialize approval dialogs and all native mutations for a wallet.

The provider uses `@utexo/webrgb` types directly and maps native errors to its
error codes. It contains no RPC dispatcher. `@utexo/webrgb-walletconnect` owns
WalletConnect sessions, method names, RPC serialization and proof chunking.
The same SDK provider can serve another transport.

## Native methods

`wallet.burn({ assetId, amount, burnRecipient, feeRate, minConfirmations })`
returns `{ txid, batchTransferIdx }`. It is irreversible and never retries.
Amounts are u64 decimal strings; `burnRecipient` is 32-byte hex without `0x`.
The WebRGB adapter encodes an EVM address as 12 zero bytes followed by its 20
address bytes. The payout chain is wallet policy; it is not encoded in these bytes.

`wallet.getConsignment(assetId, txid)` reads the saved proof as Base64.
`getConsignmentPath(assetId, txid)` returns a local path for wallet-internal use.
WebRGB returns the complete proof with its asset, txid, byte length and Keccak-256
digest. The provider limits proofs to 16 MiB.

Native build/signer capabilities control whether burn is offered. The password
signer supports it; the current external signer does not. Configure `ethRpcUrl`
when unlocking a BFA wallet. BFA asset models remain an RN extension until the
shared SDK core includes that schema. Invoice and balance APIs still use safe JS
integers; the provider rejects unsafe numeric balances instead of returning them.
The RN BFA asset mapper likewise rejects unsafe supply/balance values. Supporting
the full u64 range here requires coordinated native and shared-model changes.

## Storage and recovery

`BurnOperations` owns the journal. The host provides `readAll()` and durable
`write(record)` upserts by `record.id`. Internal IDs and journal states are never
sent as WebRGB request fields or RGB transfer statuses.

Records use version 2. `normalizeBurnRecord` reads previous records and preserves
their IDs, origin, recipient and result. The demo keeps its original storage key;
wallet credentials and native directories do not move.

- `prepared`: native burn has not started. Interrupted preparations can be cancelled.
- `pending`: native execution may have started. Never retry it automatically.
- `complete`: the native result has been saved.
- `cancelled`: cancelled before native invocation; subsequent burns are allowed.

Revocation or a storage error before native invocation cancels the operation.
If saving a known result fails, `retryPersistence()` saves that result again without
calling burn. The demo invokes it on open/refresh; transfer lookup also invokes it.
A full process restart loses an unsaved in-memory result.

For an ambiguous outcome after restart, the wallet can call
`operations.reconcile(id, nativeResult, verifyProof)`. This checks that the txid
is a burn of the asset and reads its saved consignment. The host's verifier must
independently validate the asset, amount, recipient and native result before the
record can become complete. Current RLN bindings lack a proof-recipient decoder,
so the demo keeps these cases pending for review. A txid or matching amount alone
is insufficient; clearing the record could permit a duplicate burn.

## Native installation

The current local iOS build is RLN `feat/bfa-burn-consignment` / `06d918e`.
Official `0.13.0-beta.3` lacks the required BFA API. The installer checks bindings
before accepting a framework and requires one of:

- An existing compatible framework and generated Swift bindings in `ios/`.
- The local ignored `src/bindings/swift-release.zip`.
- `UTEXO_RLN_IOS_ARCHIVE=/path/to/archive.zip` for a local build.
- `UTEXO_RLN_IOS_VERSION=<compatible-published-version>` for a GitHub release.

Local archives are excluded from npm packages. Until a compatible release is
published and pinned, fresh iOS installations require a supplied build/version.
Android still uses its existing AAR and reports BFA methods as unsupported.

Run `npm test` for SDK conformance and `npm run test:webrgb` for provider,
recovery and installation checks. The demo's integration tests use the actual
packages with mocked native calls and transport; a live device/relay run is separate.
