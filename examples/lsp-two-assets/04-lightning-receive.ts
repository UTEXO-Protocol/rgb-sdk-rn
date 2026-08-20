/**
 * Flow 4 — paid on-chain in canonical USDT, delivered as LNUSDT liquidity.
 *
 * A user wants to be paid over Lightning in LNUSDT, but whoever is paying holds
 * BUSDT on-chain and has no channel to anyone. `receiveAsset` hands back an RGB
 * invoice for the sender and a BOLT11 for the LSP to pay:
 *
 *     sender --(BUSDT, on-chain)--> LSP --(LNUSDT, Lightning)--> user
 *
 * The interesting part is who chooses the on-chain asset. The user names only
 * what it wants over Lightning; the LSP resolves the counterpart from its own
 * `CONVERTIBLE_PAIRS`, so the sender's contract id is never configured
 * client-side and first appears in the response as `onchainAssetId`.
 *
 * Pass `onchainAsset: 'payout'` for one asset end to end — the previous
 * behaviour, and the only form older LSPs accept.
 */

import { startNode, awaitLspChannel, PAYOUT_ASSET } from './setup';

export async function receiveOnchainInAnotherAsset() {
  const user = await startNode('/data/user', 9800, 'user-password');
  await awaitLspChannel(user, PAYOUT_ASSET);

  // Only the Lightning-side asset is named. `onchainAsset` defaults to
  // 'convertible', which is what leaves the on-chain leg to the LSP.
  const { lnInvoice, rgbInvoice, onchainAssetId, converted } =
    await user.lsp.receiveAsset({
      assetId: PAYOUT_ASSET,
      amountSats: 3_000,
      amountRgb: 500_000,
    });

  console.log(
    `send ${rgbInvoice} —`,
    converted ? `pay in ${onchainAssetId}, delivered as ${PAYOUT_ASSET}` : 'same asset both legs'
  );

  // Give `rgbInvoice` to the sender. A converted receive pins the amount in the
  // invoice's assignment (`{"type":"Fungible","value":N}` rather than `Any`):
  // two unrelated contracts have nothing else tying what arrives on-chain to
  // what the BOLT11 pays out, so read the assignment back off the invoice
  // rather than assuming it.

  // Then wait. 'settled' | 'timed_out' — a timeout is not a failure, the LSP
  // may still be waiting on confirmations.
  const outcome = await user.lsp.awaitReceiveSettlement(lnInvoice, {
    timeoutMs: 600_000,
    onProgress: (status) => console.log('lightning_receive:', status),
    onEachPoll: async () => {
      // Runs at the top of every poll. Use it for whatever the wallet cannot do
      // itself — on regtest, produce a block; in an app, keep the LSP
      // connection warm so it can deliver as soon as the transfer settles.
      await user.lsp.connect().catch(() => {});
    },
  });

  console.log('outcome:', outcome);
}
