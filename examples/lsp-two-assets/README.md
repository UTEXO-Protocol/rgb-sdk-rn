# Two assets, one LSP

Four LSP flows, each in its own file. They exist because most real deployments
have two USDT-shaped assets rather than one:

- **LNUSDT** — what the LSP serves over Lightning channels. It provisions it,
  and every address it hosts is paid out in it.
- **BUSDT** — the canonical contract people already hold on-chain. The LSP
  accepts and pays it out, but never provisions it.

The two are ordinary, unrelated RGB contracts. What makes them interchangeable
is one setting on the LSP, `CONVERTIBLE_PAIRS`, and that setting is the entire
authorisation for the 1:1 rate — there is no protocol-level link between the
contracts and nothing in a consignment says they are related.

| File | Flow |
|------|------|
| [`01-pay-lightning-address.ts`](./01-pay-lightning-address.ts) | Two SDK wallets pay each other in LNUSDT. No conversion — the baseline. |
| [`02-external-payer.ts`](./02-external-payer.ts) | A node holding canonical BUSDT pays a merchant's hosted BOLT11. |
| [`03-pay-external-invoice.ts`](./03-pay-external-invoice.ts) | An outside node asks for BUSDT; a wallet holding only LNUSDT pays it. |
| [`04-lightning-receive.ts`](./04-lightning-receive.ts) | Paid on-chain in BUSDT, delivered as LNUSDT liquidity. |

[`setup.ts`](./setup.ts) holds the wallet + LSP bootstrap the four share.

## Which one you want

```
                        ┌──────────────┐
    01  wallet ─LNUSDT─▶ │              │ ─LNUSDT─▶ wallet
                        │              │
    02  outside ─BUSDT─▶ │     LSP      │ ─LNUSDT─▶ wallet
                        │              │
    03  wallet ─LNUSDT─▶ │  converts    │ ─BUSDT──▶ outside
                        │     1:1      │
    04  sender ─BUSDT──▶ │              │ ─LNUSDT─▶ wallet
        (on-chain)       └──────────────┘
```

Flows 2 and 3 are mirrors of each other, and in both the outside node does
nothing unusual: it signs or pays a plain BOLT11 and never learns that APay,
LNURL or this SDK exist. That works because the invoices the LSP hosts carry the
RGB contract id and amount inside the BOLT11 itself, and name no payer — so a
bare `POST /sendpayment {"invoice": …}` on any RGB Lightning node with the right
channel settles them.

## Who pays for a channel

Worth getting straight before reading the code, because it is the one asymmetry
that shapes all four flows:

- **Receiving in the payout asset** costs you nothing. Connect, and the LSP's
  cron opens you an LNUSDT channel.
- **Sending the bridge asset** is on you. The LSP never provisions BUSDT, so a
  peer that wants to spend it receives it on-chain and colours its own
  channel-open with it.

Open that channel with a non-zero `pushMsat`. RGB amounts ride on HTLC outputs,
so the LSP needs sats on its side to deliver anything back to you — a channel
opened at zero leaves it with only what your first payment pushes across, most
of which is locked as channel reserve.

## Choosing the asset

Which asset gets quoted is the **payer's** call, not the LSP's. The LNURL
callback is unauthenticated, so at quote time the LSP does not know whose
channels to look at; and the quote pins the asset for the invoice's whole life,
so the choice has to be made before the invoice exists.

`payAddress` with an `assetAmount` but no `assetId` runs that choice for you
(`selectPaymentAsset`): it reads the address's payout asset and accepted assets
off LNURL discovery, and picks the payout asset when local liquidity covers the
amount, an accepted one otherwise. Conversion is the fallback, never the
default — quoting the payout asset trusts the LSP for delivery only, converting
also trusts it for the second leg's amount.

Liquidity is compared per channel, not summed: there is no cross-asset MPP, so
the whole amount has to fit in one channel.

## Amounts

Always base units, everywhere — `receiveAsset.amountRgb`, `payAddress`'s
`asset.assetAmount`, an RGB invoice's assignment. `precision` only affects how
you display them. For a precision-6 asset, `500_000` is 0.5.

## Running them

These are annotated snippets, not a runnable app — they assume a funded regtest
node and a `mineOneBlock()` helper. For something you can actually launch, the
demo app runs all four against a local stack:

```bash
TWO_ASSETS=1 ./scripts/start-lsp-regtest.sh
```

See [`rgb-sdk-rn-demo`](https://github.com/UTEXO-Protocol/rgb-sdk-rn-demo) —
`screens/apay-linked-asset.tsx` and `screens/apay/useApayLinkedAssetFlow.ts`.

## Reference

- [`../../docs/lsp.md`](../../docs/lsp.md) — full `UtexoLsp` method reference
- [`../../docs/async-payments.md`](../../docs/async-payments.md) — how APay hash
  batches and the LSP outbox work
