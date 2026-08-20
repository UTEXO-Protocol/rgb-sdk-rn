/**
 * Flow 2 — an outside node holding canonical USDT pays a BOLT11.
 *
 * The merchant is paid in LNUSDT and the payer holds only USDT. Instead of
 * teaching the payer about LNURL, asset selection or this SDK, the merchant
 * quotes the invoice itself and hands over the string.
 *
 *     external node --(USDT)--> LSP --(LNUSDT)--> merchant
 *
 * That works because the invoice is *hosted*: the LSP signs it against a hash
 * the merchant pre-registered, so its payee is the LSP and nothing in it names
 * a payer. The RGB contract id and the amount ride inside the BOLT11, which is
 * why the payer needs nothing but the string:
 *
 *     POST /sendpayment {"invoice": "lnbcrt…"}
 *
 * Any RGB Lightning node with a USDT channel to this LSP can settle it — no
 * SDK, no LNURL, no APay.
 */

import { awaitLspChannel, startNode, PAYOUT_ASSET } from './setup';

export async function quoteForExternalPayer() {
  const merchant = await startNode('/data/merchant', 9800, 'merchant-password');
  await awaitLspChannel(merchant, PAYOUT_ASSET);
  await merchant.lsp.enableLightningAddress();

  // What can this address be paid in? The payout asset plus everything the LSP
  // converts to it 1:1, with tickers and precisions — enough to render a picker
  // without configuring a single contract id.
  const payable = await merchant.lsp.listPayableAssets();
  console.log(
    'payout:', payable.payoutAsset?.ticker,
    '| convertible:', payable.convertible.map((a) => a.ticker).join(', ')
  );

  // Quote without paying. With no `asset` argument this takes the single
  // convertible asset the address advertises; pass a ticker (`asset: 'USDT'`)
  // when there is more than one, or `prefer: 'payout'` for the no-conversion
  // asset. Several matches and no `asset` throws rather than guessing — the
  // quote pins one asset for the invoice's life, and a payer holding the other
  // one would only find out by failing to pay.
  const quoted = await merchant.lsp.requestExternalInvoice({
    amtMsat: 3_000_000,
    assetAmount: 500_000,
  });

  console.log(
    `pay ${quoted.invoice} — ${quoted.asset?.ticker}`,
    quoted.converted ? `(delivered as ${payable.payoutAsset?.ticker})` : ''
  );

  // Each quote reserves a hash from the merchant's batch, and one that is never
  // paid still costs it. Refill off `unusedHashes` if you quote speculatively.
  return quoted;
}

/**
 * The payer side, for completeness. A real external node would not run this —
 * it would POST the invoice to its own `/sendpayment`. From the SDK it is the
 * same single call, with no LSP client involved.
 */
export async function payAsAnOutsideNode(invoice: string) {
  const payer = await startNode('/data/payer', 9900, 'payer-password');
  // ...payer already has a USDT channel it funded itself — see setup.ts.
  return payer.wallet.payLightningInvoice({ lnInvoice: invoice });
}
