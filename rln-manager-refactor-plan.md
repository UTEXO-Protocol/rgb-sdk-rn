# RLNManager Refactor — Implementation Plan

## Problem with the Current Architecture

`RLNRgbLibBinding extends RNRgbLibBinding` is conceptually wrong:

- `RNRgbLibBinding` manages an **RGB wallet** (walletId, xpubs, mnemonic, UTXO/asset ops)
- The RLN binding manages an **LDK node** (nodeId, serial queue, lifecycle, channel ops)
- These are orthogonal concerns forced into an inheritance chain

`WalletManager` with `bindingMode: 'rln'` then exposes ~40 `rln*` proxy methods alongside all the wallet methods on the same object, making the surface huge and the responsibility unclear.

External signer methods are mixed in with password-auth node operations, implying they are equally primary — but a node can be used with just a password.

---

## Target Architecture

```
IRgbLibBinding (core, unchanged)
    └── RNRgbLibBinding     ← pure RGB wallet binding (unchanged)

IRLN                        ← new RLN node interface (rn-local, not in core)
    └── RLNBinding          ← new pure RLN node binding (no wallet inheritance)

IWalletManager (core, unchanged)
    └── BaseWalletManager (core, unchanged)
            └── WalletManager  ← cleaned up: wallet only, no bindingMode

RLNManager                  ← new high-level RLN manager
    composes: RLNBinding    ← always present
    composes: RNRgbLibBinding (optional, wallet params optional in constructor)
    implements: IRLN        ← all RLN node ops
    implements: IWalletManager ← wallet ops delegated to RNRgbLibBinding,
                               or throws NotImplemented when wallet params absent
    implements: IUTEXOProtocol (optional adapter pattern, same as today)
```

---

## New Files

### 1. `src/binding/IRLN.ts`

Interface for all RLN node operations. Mirrors how `IWalletManager` lives in core
except this one stays in rn (no core changes needed for now).

```typescript
// ── Node lifecycle ────────────────────────────────────────────────────────────

export interface IRLNNodeCreateParams {
  storageDirPath: string;
  daemonListeningPort: number;
  ldkPeerListeningPort: number;
  network: string;
  maxMediaUploadSizeMb: number;
  enableVirtualChannelsV0?: boolean | null;
}

export interface IRLNUnlockParams {
  bitcoindRpcUsername: string;
  bitcoindRpcPassword: string;
  bitcoindRpcHost: string;
  bitcoindRpcPort: number;
  indexerUrl?: string | null;
  proxyEndpoint?: string | null;
  announceAddresses?: string[];
  announceAlias?: string | null;
}

export interface IRLNExternalSignerBootstrap {
  nodePublicKeyHex: string;
  accountXpubVanilla: string;
  accountXpubColored: string;
  masterFingerprint: string;
  protocolVersion: string;
  apiLevel: number;
  ldkInboundPaymentKeyHex: string;
  ldkPeerStorageKeyHex: string;
  ldkReceiveAuthKeyHex: string;
  asyncPaymentsRootSeedHex?: string;
}

export interface IRLN {
  // ── Node lifecycle ──────────────────────────────────────────────────────────

  rlnCreateNode(params: IRLNNodeCreateParams): Promise<number>;

  /** Password-based init (node storage is new). */
  rlnInitNode(password: string, mnemonic?: string): Promise<string>;
  /** Password-based unlock (node storage already exists). */
  rlnUnlockNode(params: { password: string } & IRLNUnlockParams): Promise<void>;

  rlnDestroyNode(): Promise<void>;
  rlnShutdown(): Promise<void>;

  /** Returns true when consumeRlnUnlockConflictNormalized() cleared a conflict. */
  consumeRlnUnlockConflictNormalized(): boolean;

  // ── External signer (optional — node can be used with password only) ────────

  rlnCreateNativeExternalSigner(
    seedHex: string,
    network: string,
    permissivePolicy?: boolean
  ): Promise<number>;

  rlnInitNodeWithNativeExternalSigner(signerId: number): Promise<void>;
  rlnAttachNativeExternalSigner(signerId: number): Promise<void>;

  rlnUnlockNodeWithNativeExternalSigner(
    signerId: number,
    params: IRLNUnlockParams
  ): Promise<void>;

  rlnDestroyNativeExternalSigner(signerId: number): Promise<void>;

  /** Manual bootstrap path — for custom ExternalSignerHost implementations. */
  rlnInitNodeWithExternalSigner(
    bootstrap: IRLNExternalSignerBootstrap
  ): Promise<void>;

  // ── Node info ───────────────────────────────────────────────────────────────

  rlnNodeInfo(): Promise<object>;
  rlnNetworkInfo(): Promise<object>;

  // ── Peers ───────────────────────────────────────────────────────────────────

  rlnConnectPeer(peerPubkeyAndAddr: string): Promise<void>;
  rlnListPeers(): Promise<object[]>;
  rlnDisconnectPeer(peerPubkey: string): Promise<void>;

  // ── Channels ────────────────────────────────────────────────────────────────

  rlnListChannels(): Promise<object[]>;
  rlnOpenChannel(request: {
    peerPubkeyAndOptAddr: string;
    capacitySat: number;
    pushMsat: number;
    public: boolean;
    withAnchors: boolean;
    feeBaseMsat?: number | null;
    feeProportionalMillionths?: number | null;
    temporaryChannelId?: string | null;
    assetId?: string | null;
    assetAmount?: number | null;
    pushAssetAmount?: number | null;
    virtualOpenMode?: string | null;
  }): Promise<object>;
  rlnCloseChannel(channelId: string, peerPubkey: string, force: boolean): Promise<void>;
  rlnGetChannelId(temporaryChannelId: string): Promise<string>;

  // ── Payments ─────────────────────────────────────────────────────────────────

  rlnListPayments(): Promise<object[]>;
  rlnGetPayment(paymentHash: string): Promise<object>;
  rlnInvoiceStatus(invoice: string): Promise<object>;

  rlnLnInvoice(
    amtMsat: number | null,
    expirySec: number,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<object>;

  rlnDecodeLnInvoice(invoice: string): Promise<object>;
  rlnDecodeRgbInvoice(invoice: string): Promise<object>;

  rlnSendPayment(
    invoice: string,
    amtMsat: number | null,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<object>;

  rlnKeysend(
    destPubkey: string,
    amtMsat: number,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<object>;

  // ── On-chain wallet (RLN-managed, separate from the RGB wallet) ────────────

  rlnAddress(): Promise<object>;
  rlnBtcBalance(skipSync?: boolean): Promise<object>;
  rlnSendBtc(amount: number, address: string, feeRate: number, skipSync: boolean): Promise<object>;

  // ── Assets / transfers ──────────────────────────────────────────────────────

  rlnListAssets(filterAssetSchemas: string[]): Promise<object>;
  rlnAssetBalance(assetId: string): Promise<object>;
  rlnRgbInvoice(
    assetId: string | null,
    assignmentAmount: number | null,
    durationSeconds: number | null,
    minConfirmations: number,
    witness: boolean
  ): Promise<object>;
  rlnSendRgb(donation: boolean, feeRate: number, minConfirmations: number, skipSync: boolean): Promise<object>;
  rlnListTransactions(skipSync: boolean): Promise<object[]>;
  rlnListTransfers(assetId: string): Promise<object[]>;
  rlnListUnspents(skipSync: boolean): Promise<object[]>;
  rlnRefreshTransfers(skipSync: boolean): Promise<void>;
  rlnFailTransfers(batchTransferIdx: number | null, noAssetOnly: boolean, skipSync: boolean): Promise<object>;

  // ── Utility ─────────────────────────────────────────────────────────────────

  rlnEstimateFee(blocks: number): Promise<object>;
  rlnCheckIndexerUrl(indexerUrl: string): Promise<object>;
  rlnCheckProxyEndpoint(proxyEndpoint: string): Promise<void>;
  rlnSync(): Promise<void>;
  rlnCreateUtxos(upTo: boolean, num: number | null, size: number | null, feeRate: number, skipSync: boolean): Promise<void>;

  // ── Backup ───────────────────────────────────────────────────────────────────

  rlnBackup(backupPath: string, password: string): Promise<void>;
}
```

---

### 2. `src/binding/RLNBinding.ts`

Pure RLN node binding — extracted from `RLNRgbLibBinding`, **does not extend** `RNRgbLibBinding`.

Contents moved verbatim from `RLNRgbLibBinding`:
- `rlnNodeId`, `lifecycleState`, `unlockConflictNormalized`
- `nodeOperationQueue` / `withNodeQueue` / `withNodeOperation`
- `requireNodeId`, `assertRegularOpsAllowed`
- `isConflictError`, `isNotInitializedError`, `probeNodeReady`
- `rlnCreateNode`, `rlnInitNode`, `rlnUnlockNode`, `rlnDestroyNode`
- External signer: `rlnCreateNativeExternalSigner`, `rlnInitNodeWithNativeExternalSigner`,
  `rlnAttachNativeExternalSigner`, `rlnUnlockNodeWithNativeExternalSigner`,
  `rlnDestroyNativeExternalSigner`, `rlnInitNodeWithExternalSigner`
- All `rlnNodeInfo` … `rlnSync` node-operation methods

What is **removed** from `RLNBinding` vs `RLNRgbLibBinding`:
- `extends RNRgbLibBinding` (wallet inheritance gone)
- `implements IUTEXOProtocol` (moved to `RLNManager`)
- `protocolAdapter` / `requireMethod` (moved to `RLNManager`)
- All `IUTEXOProtocol` method bodies (moved to `RLNManager`)

Constructor:
```typescript
export class RLNBinding implements IRLN {
  constructor() {}   // no wallet params needed
  // ... all rln methods
}
```

---

### 3. `src/wallet/rln-manager.ts`

```typescript
export type RLNManagerParams = {
  // ── RLN node (required) ──────────────────────────────────────────────────
  // (node create/init params passed to rlnCreateNode later, not in constructor)

  // ── Optional wallet (for IWalletManager methods) ─────────────────────────
  xpubVan?: string;
  xpubCol?: string;
  masterFingerprint?: string;
  mnemonic?: string;
  network?: string;
  indexerUrl?: string;
  transportEndpoint?: string;

  // ── Optional UTEXO protocol adapter ──────────────────────────────────────
  rlnProtocolAdapter?: Partial<IUTEXOProtocol>;
};

export class RLNManager implements IRLN, IUTEXOProtocol {
  private readonly rlnBinding: RLNBinding;
  private readonly walletBinding: RNRgbLibBinding | null;  // null when no wallet params

  constructor(params: RLNManagerParams) {
    this.rlnBinding = new RLNBinding();
    this.walletBinding = hasWalletParams(params)
      ? new RNRgbLibBinding(params as WalletInitParams)
      : null;
    // IUTEXOProtocol adapter (same delegate pattern as today)
  }

  // ── IRLN — delegate entirely to rlnBinding ────────────────────────────────
  rlnCreateNode(params) { return this.rlnBinding.rlnCreateNode(params); }
  // ... (all IRLN methods forward to rlnBinding)

  // ── IWalletManager — delegate to walletBinding or throw ──────────────────
  async initialize(): Promise<void> {
    this.requireWalletBinding().goOnline(/* ... */);
  }
  async getBtcBalance(): Promise<BtcBalance> {
    return this.requireWalletBinding().getBtcBalance();
  }
  // Methods that have no RLN equivalent: requireWalletBinding() throws
  // NotImplemented when walletBinding is null.

  private requireWalletBinding(): RNRgbLibBinding {
    if (!this.walletBinding) {
      throw new WalletError(
        'Wallet methods require wallet params (xpubVan, xpubCol, masterFingerprint) ' +
        'to be provided to RLNManager constructor.'
      );
    }
    return this.walletBinding;
  }

  // ── IUTEXOProtocol — same adapter-delegate pattern as today ──────────────
  // ...
}
```

---

### 4. Modify `src/wallet/wallet-manager.ts`

Changes:
- Remove `WalletManagerBindingMode` type (`'rgb' | 'rln'`)
- Remove `rlnProtocolAdapter` from `WalletManagerInitParams`
- Remove `bindingMode` from constructor / `WalletManagerInitParams`
- Remove `getRlnBinding()` private method
- Remove all `rln*` proxy methods (~40 methods)
- `WalletManager` always uses `RNRgbLibBinding` — no conditional on `bindingMode`

Before (constructor):
```typescript
const binding = bindingMode === 'rln'
  ? new RLNRgbLibBinding(params, params.rlnProtocolAdapter)
  : new RNRgbLibBinding(params);
```

After:
```typescript
constructor(params: WalletManagerInitParams) {
  const binding = new RNRgbLibBinding(params);
  super(params, binding, new RNSigner());
  this.rnBinding = binding;
}
```

---

### 5. Modify `src/index.ts`

Add exports:
```typescript
export { RLNManager } from './wallet/rln-manager';
export { RLNBinding } from './binding/RLNBinding';
export type { IRLN, RLNManagerParams, IRLNNodeCreateParams, IRLNUnlockParams, IRLNExternalSignerBootstrap } from './binding/IRLN';
```

Keep `RLNRgbLibBinding` exported (marked `@deprecated`) during a transition period.

---

## Migration — Caller Changes

| Before | After |
|--------|-------|
| `new WalletManager({ ..., bindingMode: 'rln', rlnProtocolAdapter })` | `new RLNManager({ ..., rlnProtocolAdapter })` |
| `wm.rlnCreateNode(...)` | `rlnMgr.rlnCreateNode(...)` |
| `wm.rlnInitNode(...)` | `rlnMgr.rlnInitNode(...)` |
| `wm.getBtcBalance()` (via wallet) | `rlnMgr.getBtcBalance()` (if wallet params given) |
| `wm.rlnBtcBalance()` (via node) | `rlnMgr.rlnBtcBalance()` |
| `wm.consumeRlnUnlockConflictNormalized()` | `rlnMgr.consumeRlnUnlockConflictNormalized()` |

External signer — no caller changes needed; all methods stay the same shape:
```typescript
// Before (on WalletManager):
const signerId = await wm.rlnCreateNativeExternalSigner(seed, network);

// After (on RLNManager):
const signerId = await rlnMgr.rlnCreateNativeExternalSigner(seed, network);
```

---

## Implementation Steps

### Step 1 — `src/binding/IRLN.ts` (new file)
Define the `IRLN` interface, `IRLNNodeCreateParams`, `IRLNUnlockParams`,
`IRLNExternalSignerBootstrap` types.  No logic, no imports from other files.

### Step 2 — `src/binding/RLNBinding.ts` (new file)
- Copy node-management code from `RLNRgbLibBinding` verbatim
- Remove `extends RNRgbLibBinding`
- Remove `implements IUTEXOProtocol` and all protocol method bodies
- Remove `protocolAdapter`, `requireMethod`
- Class `implements IRLN`
- Add `consumeUnlockConflictNormalized()` method (already exists as public in current code)

### Step 3 — `src/wallet/rln-manager.ts` (new file)
- Constructor: accept `RLNManagerParams`, create `RLNBinding`, optionally create `RNRgbLibBinding`
- `IRLN` methods: thin delegation to `this.rlnBinding`
- `IWalletManager` methods: delegation to `this.walletBinding` or `requireWalletBinding()` throw
- `IUTEXOProtocol` methods: adapter delegate (same pattern as current `RLNRgbLibBinding`)
- `rlnShutdown()` convenience method (calls `rlnBinding.rlnDestroyNode()`)

### Step 4 — `src/wallet/wallet-manager.ts` (modify)
- Remove `bindingMode`, `rlnProtocolAdapter`, `WalletManagerBindingMode`
- Remove `getRlnBinding()`
- Remove all 40+ `rln*` proxy methods
- Constructor always creates `RNRgbLibBinding`
- Update `WalletManagerInitParams` to remove rln-specific fields

### Step 5 — `src/index.ts` (modify)
- Export `RLNManager`, `RLNBinding`, `IRLN`, new param types
- Mark `RLNRgbLibBinding` as `@deprecated` in its source (keep export for one release)
- Remove `WalletManagerBindingMode` from exports (or keep as deprecated)

### Step 6 — `src/binding/RLNRgbLibBinding.ts` (deprecate)
- Add `@deprecated` JSDoc comment pointing to `RLNBinding` + `RLNManager`
- Keep file intact during transition; delete in a follow-up cleanup

---

## Design Decisions

### Why `RLNBinding` does not extend `RNRgbLibBinding`
A wallet (xpubs, UTXOs, RGB assets) and a Lightning node (channels, peers, payments)
are different resources with different lifecycles. Inheritance forced all wallet methods
onto the node binding even though the node binding never uses them — it overrides nothing
from the wallet binding and delegates zero wallet calls. Composition is correct here.

### Why `RLNManager` takes wallet params as optional
An RLN node does not require a separate RGB wallet to operate. The node has its own
on-chain wallet exposed through `rlnBtcBalance`, `rlnAddress`, `rlnListUnspents`.
Adding wallet params to `RLNManager` is a convenience for apps that need both at once
(issue assets, then open channels), not a requirement.

### Why `IRLN` stays in rn rather than moving to core
The interface depends on RLN-specific concepts (VLS bootstrap, NativeExternalSigner)
that don't belong in a platform-agnostic core package. Moving them to core would add
RLN-only concepts to a library used by all platforms. Revisit once a server-side RLN
SDK needs to share the same interface.

### External signer is optional, not a separate mode
`rlnInitNode`/`rlnUnlockNode` (password) and `rlnInitNodeWithNativeExternalSigner`/
`rlnUnlockNodeWithNativeExternalSigner` (external signer) are both on `IRLN` with equal
standing. The caller picks one path. No `signerMode` flag needed.

### `IUTEXOProtocol` on `RLNManager`
Kept for compatibility with `UTEXOWallet`/`UTEXOWalletCore`. The adapter pattern
(`requireMethod`) is moved as-is from `RLNRgbLibBinding` to `RLNManager`.
Future cleanup: expose this through a dedicated `UTEXORLNAdapter` wrapper instead.
