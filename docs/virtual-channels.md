# Virtual Channels (`trusted_no_broadcast`)

Virtual channels are trusted Lightning channels where the funding UTXO is **never broadcast** to Bitcoin — the channel becomes usable immediately. RGB-backed virtual channels use a trusted no-broadcast funding path with an RGB proxy for consignment delivery. `/closechannel` is allowed only when the host can prove no user value remains in the channel.

---

## Roles

- **Host (LSP)** — opens virtual channels, constructs the virtual funding outpoint, registers it with LDK, enforces policy, and executes cleanup via `closeChannel`.
- **Client (wallet)** — accepts the inbound channel via trusted zero-conf and uses existing Lightning payment APIs over the channel.

Both host and client run RLN with vendored LDK handling the channel state machine, acceptance, and the trusted no-broadcast primitives on each side.

---

## Open channel flow

The host calls `POST /openchannel` with `virtual_open_mode=trusted_no_broadcast` (requires `--enable-virtual-channels-v0` startup flag). The request is rejected if `public=true` or if a draft or session already exists for the same peer.

The client accepts via trusted zero-conf. Since the funding UTXO is never confirmed on-chain there is no real SCID — a **scid-alias** (a locally assigned fake identifier both peers agree on) is the only channel identifier that exists. Client B encodes this alias in invoice route hints so payments can be routed through the host.

In `FundingGenerationReady` the host constructs the virtual funding outpoint. For RGB-backed channels this is the transaction ID of an unbroadcast RGB funding PSBT. The RGB consignment is posted to the proxy; the client fetches and validates it automatically via LDK's channel funding handler. The host then registers the outpoint via `unsafe_manual_funding_transaction_generated` — **no broadcast**. The channel becomes usable immediately.

---

## Payment routing

Two clients connected to the same host can pay each other through a hub-and-spoke topology: `Client A → Host → Client B`. Client B creates a BOLT11 invoice with a private route hint encoding `Host → Client B` via the inbound SCID alias. Client A pays — first hop to Host, then Host forwards over the private virtual channel to Client B. The host must have `accept_forwards_to_priv_channels` enabled.

---

## Close channel

`closeChannel` is constrained for virtual channels:

- `force=true` is **always rejected** — force-close would attempt to broadcast a commitment transaction whose funding UTXO was never on-chain.
- A cooperative close is allowed only when the **no-user-value predicate** passes (all conditions in order):
  1. No in-flight HTLCs in current LDK channel state
  2. No channel-scoped pending RGB markers on disk
  3. Counterparty (client) commitment BTC balance floor is exactly `0`
  4. For RGB channels: both final and pending RGB state records exist and agree on `contract_id`, `schema`, `local_rgb_amount`, and `remote_rgb_amount == 0`

If any condition fails, `closeChannel` is rejected with a `CannotCloseChannel` error.

---

## Host-key allowlist (`virtualPeerPubkeys`)

The allowlist lives on the **inbound (receiving) side** — the client checks it when an incoming virtual channel open arrives.

| Client `virtualPeerPubkeys` | Inbound virtual open from any host |
|---|---|
| `null` / `[]` (empty) | **Accepted** — permissive, no restriction |
| `['02lspPubkey…']` | Accepted **only** from that pubkey; all others rejected |
| `['02wrongKey…']` (wrong key) | Rejected — channel never becomes `ready && is_usable` |

The **host** always starts with an empty allowlist. This is correct: the host only opens channels outbound and never receives inbound virtual channels.

When the client's allowlist does not include the opener's pubkey, the channel handshake completes (HTTP 200 on the host side) but neither node's channel ever reaches `ready && is_usable`. Both sides see the channel pending indefinitely — the security guarantee tested by `virtual_open_non_allowlisted_host_does_not_become_operational`.

### One virtual channel per peer pair

The host enforces a single active virtual channel per `(host, client)` peer pair. A second `openChannel` call while one already exists returns HTTP 400 with `"already exists for this peer pair"`. Concurrent duplicate requests are rejected atomically.

---

## Validation rules (enforced by RLN)

| Rule | Error |
|---|---|
| `--enable-virtual-channels-v0` must be set on the initiating node | `"trusted virtual channels v0 are disabled"` |
| `virtual_open_mode` must be `"trusted_no_broadcast"` | `"unknown virtual_open_mode: <value>"` |
| `public` must be `false` | `"virtual channels requires public=false"` |

---

## SDK integration

Both flags are passed at **node creation time** in `UTEXOWalletNodeParams` (i.e. the `UTEXOWallet` constructor). They cannot be changed after the node is started.

### Constructor params

```typescript
import { UTEXOWallet } from '@utexo/rgb-sdk-rn';

// Host / LSP node — opens virtual channels to clients
const hostWallet = new UTEXOWallet({
  storageDirPath,
  daemonListeningPort,
  ldkPeerListeningPort,
  network: 'regtest',
  enableVirtualChannelsV0: true,
  virtualPeerPubkeys: null,        // host never receives inbound virtual opens
  lspBaseUrl: 'http://…',
}, signer);

// Client — accepts virtual channels from one specific LSP only
const clientWallet = new UTEXOWallet({
  storageDirPath,
  daemonListeningPort,
  ldkPeerListeningPort,
  network: 'regtest',
  enableVirtualChannelsV0: true,
  virtualPeerPubkeys: ['02lspPubkey…'],
  lspBaseUrl: 'http://…',
}, signer);

// Client — no allowlist, accepts inbound from any host
const openClientWallet = new UTEXOWallet({
  storageDirPath,
  daemonListeningPort,
  ldkPeerListeningPort,
  network: 'regtest',
  enableVirtualChannelsV0: true,
  virtualPeerPubkeys: null,        // or [] — node starts fine, accepts from anyone
  lspBaseUrl: 'http://…',
}, signer);
```

`virtualPeerPubkeys: null` and `virtualPeerPubkeys: []` are equivalent — both map to an empty Rust `Vec<PublicKey>` which means "accept from all". The node starts successfully either way.

### Opening a virtual channel (host / LSP side)

```typescript
const channel = await wallet.openChannel({
  peerPubkeyAndOptAddr: `${clientPubkey}@host:port`,
  capacitySat: 100_000,
  pushMsat: 10_000_000,
  assetId: 'rgb:…',
  assetAmount: 200,
  publicChannel: false,                       // required — virtual channels must be private
  withAnchors: true,
  virtualOpenMode: 'trusted_no_broadcast',
});
// channel.virtualOpenMode === 'trusted_no_broadcast'
// channel.ready === true, channel.isUsable === true (no blocks to wait for)
```

### Checking the channel

```typescript
const channels = await wallet.listChannels();
const virtual = channels.find(
  c => c.virtualOpenMode === 'trusted_no_broadcast' && c.ready && c.isUsable
);
```

---

## Channel lifecycle data

### `VirtualChannelSession` status

| Status | Meaning |
|---|---|
| `Active` | Channel is operational |
| `AbandonPending` | Close in progress |
| `Abandoned` | Channel abandoned without broadcast — terminal |

### Channel in `listChannels`

Virtual channels appear in `listChannels` with a `virtualOpenMode` field. The `fundingTxid` is the transaction ID portion of the virtual funding outpoint — it was never broadcast.

---

## Demo

The demo app includes APay flows at [`screens/apay/useApayFlow.ts`](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo/blob/main/screens/apay/useApayFlow.ts) — wallet construction with `enableVirtualChannelsV0: true`, LSP channel setup, LNURL checkout, and LSP outbox settlement.
