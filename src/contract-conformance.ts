/**
 * Type-level conformance check — compiled, never bundled.
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
import type { UTEXOWallet } from './wallet/utexo-wallet';
import type { IRLNUnlockParams } from './binding/IRLN';

declare const concrete: UTEXOWallet;
// A consumer programming against the shared contract, not the concrete class:
const w: IUTEXOProtocol<IRLNUnlockParams> = concrete;

// ── 1. Always-present surface — must compile on both platforms ───────────────
void w.getBtcBalance();
void w.listChannels();
void w.createLightningInvoice({ amountSats: 1000 });
void w.syncWallet();
void w.refreshWallet();
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
// @ts-expect-error rgb-lib lifecycle, deleted — use unlock(params)
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
