/**
 * Flow 3 — an outside node asks for canonical USDT; an SDK wallet holding only
 * LNUSDT pays it.
 *
 * The mirror of flow 2: there the outside node paid, here it is paid. Either
 * way it only ever signs an ordinary invoice and never learns that APay, LNURL
 * or this SDK exist.
 *
 *     wallet --(LNUSDT)--> LSP --(USDT)--> external node
 *
 * The LSP quotes a HODL invoice carrying the *external invoice's own payment
 * hash*. That shared hash is the atomicity: the LSP can claim what this wallet
 * pays only by presenting a preimage the external node releases on being paid.
 * `payExternalInvoice` decodes the returned BOLT11 on this wallet's own node
 * and refuses the quote unless the hash, the assets and the amounts match what
 * the LSP reported — the LSP's JSON is never taken at its word.
 *
 * Note the liquidity: the LSP delivers USDT out of its side of the payee's
 * channel, which exists only because the payee spent through it earlier. The
 * LSP never provisions a convertible asset.
 */

import { LspQuoteMismatchError } from '@utexo/rgb-sdk-rn';

import { awaitLspChannel, startNode, BRIDGE_ASSET, PAYOUT_ASSET } from './setup';

export async function payAnOutsideInvoice() {
  // ── The outside node: a plain BOLT11, nothing else ─────────────────────────
  const outside = await startNode('/data/outside', 9900, 'outside-password');
  const target = await outside.wallet.createLightningInvoice({
    amountSats: 3_000,
    expirySeconds: 3600,
    asset: { assetId: BRIDGE_ASSET, amount: 300_000 },
  });

  // ── The payer: holds LNUSDT and nothing else ───────────────────────────────
  const payer = await startNode('/data/payer', 9800, 'payer-password');
  await awaitLspChannel(payer, PAYOUT_ASSET);

  // Quote and pay. Omitting `payWith` lets the wallet pick the channel that can
  // cover the amount — the delivery asset first when it holds it (a plain relay
  // with no conversion), otherwise whatever else can. Pass a ticker or a
  // contract id to decide yourself.
  //
  // `maxFeeMsat` defaults to 0: the relay has to be at cost unless you opt in.
  let quote, sendResult;
  try {
    ({ quote, sendResult } = await payer.lsp.payExternalInvoice({
      invoice: target.lnInvoice,
    }));
  } catch (err) {
    if (err instanceof LspQuoteMismatchError) {
      // The two legs were not bound together as the LSP described them. Nothing
      // has been paid at this point — this is the one failure in the flow that
      // would have cost the payment rather than a retry.
      console.error('refused:', err.message);
    }
    throw err;
  }

  console.log(
    `paying ${quote.inbound.assetAmount} of ${quote.inbound.assetId}`,
    `to deliver ${quote.outbound.assetAmount} of ${quote.outbound.assetId}`,
    `| hash ${quote.paymentHash} | ${sendResult.status}`
  );

  // ── Settlement is not immediate, by design ─────────────────────────────────
  // The LSP holds the HTLC until the outside node has actually been paid.
  //
  // Two different questions, and the payment is only done when both answer yes:
  // `externalPaymentStatus` is the LSP's bookkeeping — `settled` means it
  // claimed the HTLC, after which nothing can be reversed — while the payer's
  // own balance moves only once its node applies the fulfilment. Assert on the
  // balance, or on the wallet's own status, not on the LSP's alone.
  for (;;) {
    const status = await payer.lsp.externalPaymentStatus(quote.paymentHash);
    console.log('relay:', status.status, status.reason ?? '');

    if (status.status === 'cancelled' || status.status === 'failed') {
      // Terminal and refunded — the payer lost nothing.
      throw new Error(`relay ${status.status}: ${status.reason ?? 'no reason given'}`);
    }
    if (status.status === 'settled') {
      console.log('local:', await payer.wallet.getLightningSendStatus(quote.paymentHash));
      break;
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
}
