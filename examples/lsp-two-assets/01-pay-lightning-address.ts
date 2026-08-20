/**
 * Flow 1 — two SDK wallets, one asset: Alice pays Bob's Lightning Address.
 *
 * The baseline. Both sides hold LNUSDT channels the LSP opened for them, so the
 * payment is LNUSDT on both legs and nothing is converted. Start here: the
 * three other examples are this flow with one leg swapped for another asset.
 *
 *     Alice --(LNUSDT)--> LSP --(LNUSDT)--> Bob
 *
 * Bob does not have to be online when Alice pays. His address is backed by a
 * batch of pre-signed payment hashes (APay), so the LSP can quote an invoice
 * against one of them and hold the HTLC until he reconnects.
 */

import { awaitLspChannel, startNode, PAYOUT_ASSET } from './setup';

export async function payLightningAddress() {
  // ── Bob: get a channel, then publish an address ────────────────────────────
  const bob = await startNode('/data/bob', 9800, 'bob-password');
  await awaitLspChannel(bob, PAYOUT_ASSET);

  // Registers the hash batch and returns the LSP-assigned address. Every quote
  // against it spends one hash, so watch `unusedHashes` and call
  // `bob.lsp.refillHashPool()` before it runs out.
  const { address, unusedHashes } = await bob.lsp.enableLightningAddress();
  console.log(`Bob is ${address}, ${unusedHashes} hashes left`);

  // ── Alice: pay it ──────────────────────────────────────────────────────────
  const alice = await startNode('/data/alice', 9900, 'alice-password');
  await awaitLspChannel(alice, PAYOUT_ASSET);

  // Optional, but worth doing once in a UI: discovery says what this address is
  // actually paid out in, so nothing downstream has to hardcode a contract id.
  const discovery = await alice.lsp.discoverAddress(address);
  console.log('payout asset:', discovery.payoutAsset?.ticker);

  // No `assetId` in the asset leg — the SDK picks one. Here Alice holds the
  // payout asset, so it picks that and `converted` comes back false.
  //
  // Amounts are always base units: 500_000 is 0.5 of a precision-6 asset.
  const { invoice, sendResult, assetSelection } = await alice.lsp.payAddress({
    address,
    amtMsat: 3_000_000,
    asset: { assetAmount: 500_000 },
  });

  console.log(
    `paid ${invoice.slice(0, 24)}… in ${assetSelection?.asset?.ticker}`,
    assetSelection?.converted ? '(LSP converted)' : '(same asset both legs)',
    sendResult.status
  );

  // Naming the asset yourself skips selection entirely:
  //
  //   asset: { assetId: PAYOUT_ASSET, assetAmount: 500_000 }
}
