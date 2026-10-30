/**
 * Type-level conformance check — checked by typecheck, never published.
 *
 * The mirror of web's `contract-conformance.ts`: that file proves the carriers
 * are *present* and reachable on web, this one proves they are *absent* here
 * and that the shared surface is identical on both platforms.
 *
 * Every `@ts-expect-error` below fails the build if the call it marks ever
 * becomes legal again. Types cannot check that a *present* carrier really works
 * — that needs the runtime conformance suite.
 */

import type { IUTEXOProtocol } from '@utexo/rgb-sdk-core';
import type { UTEXOWallet } from '../../src/wallet/utexo-wallet';
import type { IRLNUnlockParams } from '../../src/binding/IRLN';
import type { RefreshTransfersResult } from '../../src/wallet/refresh-types';
import type { RlnWallet } from '../../src/wallet/rln/rln-wallet';
import type { RgbLibWallet } from '../../src/wallet/rgb-lib/rgb-lib-wallet';
import type { OnchainWalletApi } from '../../src/wallet/wallet-api';
import type { RgbLibUnlockParams } from '../../src/wallet/rgb-lib/config';

declare const concrete: UTEXOWallet<'RGB_LN'>;
declare const onchain: UTEXOWallet<'RGB_L1'>;
type PublicMethods<T> = Pick<
  T,
  {
    [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never;
  }[keyof T]
>;
// Adding a method to either engine must also update the public facade.
const rlnSurface: PublicMethods<RlnWallet> = concrete;
const rgbLibSurface: PublicMethods<RgbLibWallet> = onchain;
const onchainContract: OnchainWalletApi<RgbLibUnlockParams> = onchain;
void rlnSurface;
void rgbLibSurface;
void onchainContract;
// A consumer programming against the shared contract, not the concrete class:
const w: IUTEXOProtocol<IRLNUnlockParams> = concrete;

// ── 1. Always-present surface — must compile on both platforms ───────────────
void w.getBtcBalance();
void w.listChannels();
void w.createLightningInvoice({ amountSats: 1000 });
void w.syncWallet();
const sharedRefresh: Promise<void> = w.refreshWallet();
void sharedRefresh;
const nativeRefresh: Promise<RefreshTransfersResult> =
  concrete.refreshTransfers();
void nativeRefresh;
// @ts-expect-error Detailed native refresh is an RN extension, not a shared capability.
void w.refreshTransfers();
void w.createBackup({ backupPath: '/tmp/b', password: 'p' });
void w.vssClearFence('password');
void w.backupNow();
// Atomic IFA inflation — no longer a stub.
void w.inflate({ assetId: 'a', inflationAmounts: [1] });

// ── 2. Lifecycle — the generic carries rn's native unlock params ─────────────
void w.init();
void w.unlock({ indexerUrl: 'http://localhost:50001' });
void w.dispose();
void w.isDisposed();

// ── 3. Carriers are ABSENT here — optional access is the only legal form ─────
void w.psbt?.signPsbt('psbt');
void w.beginEnd?.sendBtcBegin({ address: 'a', amount: 1, feeRate: 1 });

// ── 4. Everything below MUST be an error ─────────────────────────────────────

// @ts-expect-error carriers are optional — non-optional access cannot compile
void w.psbt.signPsbt('psbt');
// @ts-expect-error flat carrier methods are not on the contract (was a stub)
void w.signPsbt('psbt');
// @ts-expect-error was a stub; belongs to the beginEnd carrier
void w.createUtxosBegin({ num: 1 });
// @ts-expect-error the imperative VSS surface is gone — use backupNow()
void w.vssBackup();
// @ts-expect-error goOnline is an RGB_L1 extension, absent from the shared contract
void w.goOnline('http://localhost:50001');
// @ts-expect-error rgb-lib wallet concept, deleted — use getNodeInfo()
void w.getXpub();
// @ts-expect-error accountXpub left the shared contract
void w.verifyMessage('m', 's', 'xpub');
// @ts-expect-error paymentHash belongs to createHodlInvoice only
void w.createLightningInvoice({ amountSats: 1, paymentHash: 'h' });
// @ts-expect-error mnemonic is a web platform extra
void w.onchainSend({ invoice: 'i' }, 'mnemonic');
// @ts-expect-error dead surface — web uses onchainSend*, rn's were stubs
void w.sendBegin({ invoice: 'i' });
