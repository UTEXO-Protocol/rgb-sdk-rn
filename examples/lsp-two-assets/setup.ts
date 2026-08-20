/**
 * Shared bootstrap for the four flow examples in this folder.
 *
 * Nothing here is specific to two assets — it is the ordinary "create a wallet,
 * attach an LSP, get a usable channel" sequence every LSP flow starts with. The
 * examples import it so each one shows only the part that is actually new.
 */

import { UTEXOWallet, PasswordRLNSigner, createWallet } from '@utexo/rgb-sdk-rn';
import type { LspPeer, UtexoLsp } from '@utexo/rgb-sdk-rn';

/** Where the LSP lives. On `utexo` most of this has a default — see the README. */
export const LSP_PEER: LspPeer = {
  baseUrl: 'http://127.0.0.1:8080',
  peerPubkey: '02...',
  peerHost: '127.0.0.1',
  peerPort: 9737,
};

/**
 * The two assets. Neither is derived from the other — they are interchangeable
 * only because the LSP operator declared the pair in `CONVERTIBLE_PAIRS`.
 */
export const PAYOUT_ASSET = 'rgb:...LNUSDT'; // what the LSP serves over channels
export const BRIDGE_ASSET = 'rgb:...USDT';   // what senders hold on-chain

export type Node = {
  wallet: UTEXOWallet;
  lsp: UtexoLsp;
  pubkey: string;
};

/**
 * Start a node and attach the LSP to it.
 *
 * `createLsp()` must run **before** `init()`: it reads `GET /get_info` and folds
 * the LSP's pubkey (and virtual-channel settings, where used) into the node
 * params, which are baked in at init time.
 */
export async function startNode(
  storageDirPath: string,
  port: number,
  password: string
): Promise<Node> {
  const keys = await createWallet('regtest');

  const wallet = new UTEXOWallet(
    {
      storageDirPath,
      daemonListeningPort: port,
      ldkPeerListeningPort: port + 1,
      network: 'regtest',
      lspBaseUrl: LSP_PEER.baseUrl,
    },
    new PasswordRLNSigner(password, keys.mnemonic)
  );

  const lsp = await wallet.createLsp(LSP_PEER);
  await wallet.init();
  await wallet.unlock({ bitcoindRpcUsername: 'user', bitcoindRpcPassword: 'pass' } as never);

  const pubkey = String((await wallet.getNodeInfo())?.pubkey ?? '');
  return { wallet, lsp, pubkey };
}

/**
 * Connect and wait until the LSP's cron has opened a usable channel in the
 * payout asset. This is how a *receiver* gets liquidity — it never funds
 * anything itself.
 *
 * `onEachPoll` is regtest-only: the channel needs confirmations and nothing
 * else in the loop produces blocks. Drop it on signet and mainnet.
 */
export async function awaitLspChannel(node: Node, assetId = PAYOUT_ASSET) {
  await node.lsp.connect();
  return node.lsp.waitForChannel(assetId, {
    timeoutMs: 240_000,
    onProgress: (msg) => console.log(msg),
    onEachPoll: () => mineOneBlock(),
  });
}

/**
 * A peer that wants to *send* the bridge asset funds its own channel instead.
 * The LSP never provisions a convertible asset, so this capacity has to come
 * from the peer: receive the asset on-chain, then colour a channel-open with it.
 *
 * `pushMsat` matters. The LSP can only deliver an RGB amount by attaching it to
 * an HTLC, so it needs sats on its side of this channel to send anything back.
 * A channel opened at zero leaves it with only what the first payment pushes
 * across, most of which is locked as channel reserve.
 */
export async function openBridgeChannel(node: Node, assetAmount: number) {
  await node.wallet.connectPeer(
    `${LSP_PEER.peerPubkey}@${LSP_PEER.peerHost}:${LSP_PEER.peerPort}`
  );

  await node.wallet.openChannel({
    peerPubkey: `${LSP_PEER.peerPubkey}@${LSP_PEER.peerHost}:${LSP_PEER.peerPort}`,
    capacitySat: 100_000,
    pushMsat: 10_000_000,
    isPublic: false,
    withAnchors: true,
    assetId: BRIDGE_ASSET,
    assetLocalAmount: assetAmount,
  });

  return node.lsp.waitForChannel(BRIDGE_ASSET, {
    timeoutMs: 240_000,
    onEachPoll: () => mineOneBlock(),
  });
}

/** Regtest only — your app supplies this (the demo calls a small bitcoin-cli helper). */
declare function mineOneBlock(): Promise<void>;
