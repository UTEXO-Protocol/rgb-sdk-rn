import type { UTEXOWallet } from '../wallet/utexo-wallet';
import { UtexoLSPClient } from './UtexoLSPClient';
import type { IUtexoLSPClient } from './IUtexoLSPClient';
import type { RlnChannel } from '../binding/rln-types';
import type { LightningSendRequest } from '@utexo/rgb-sdk-core';
import {
  type LspPeer,
  type ChannelReadyInfo,
  type LspOnchainSendResponse,
  type LspLnParams,
  type ReceiveSettlementOutcome,
  type ApayNewResponse,
  normalizeReceiveStatus,
  peerUri,
} from './lsp-types';
import { LspChannelTimeoutError, LspSettlementError } from './LspErrors';

// ── Shared wait options ───────────────────────────────────────────────────────

export interface WaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  onProgress?: (msg: string) => void;
  /**
   * Called at the start of each poll iteration before the wallet check.
   * Use in regtest to mine a block per iteration:
   *   onEachPoll: () => mine(1)
   */
  onEachPoll?: () => Promise<void>;
}

// ── receiveAsset ──────────────────────────────────────────────────────────────

export interface ReceiveAssetOptions {
  assetId: string;
  amountSats: number;
  amountRgb: number;
  /**
   * Applied to both the LN invoice and the RGB invoice — they are always kept
   * in sync. The LSP rejects if they differ. Default: 3600.
   */
  expirySeconds?: number;
}

export interface ReceiveAssetResult {
  /** BOLT11 created on this wallet. LSP pays this once RGB transfer settles. */
  lnInvoice: string;
  /** RGB invoice issued by the LSP. Give this to the on-chain sender. */
  rgbInvoice: string;
  mappingId: string;
}

// ── sendAsset ─────────────────────────────────────────────────────────────────

export interface SendAssetOptions {
  /** Recipient's on-chain RGB invoice */
  rgbInvoice: string;
  ln?: LspLnParams;
}

export interface SendAssetResult extends LspOnchainSendResponse {
  sendResult: LightningSendRequest;
}

// ── payAddress ────────────────────────────────────────────────────────────────

export interface PayAddressOptions {
  /** Lightning Address, e.g. alice@lsp.utexo.com */
  address: string;
  amtMsat: number;
  asset?: { assetId: string; assetAmount: number };
}

// ── enableLightningAddress ────────────────────────────────────────────────────

export interface LightningAddressInfo {
  username: string;
  domain: string;
  /** Convenience: username@domain */
  address: string;
  /** Hashes still available in the pool after registration — drive refills off this. */
  unusedHashes?: number;
  /** Hash index the next batch will start from. */
  nextIndexExpected?: number;
  /** LSP-suggested size for the next refill batch. */
  refillBatchSize?: number;
}

// ── claimPendingPayments ──────────────────────────────────────────────────────

export interface ClaimResult {
  paymentHash: string;
  claimed: boolean;
  error?: string;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_CHANNEL_TIMEOUT_MS    = 120_000;
const DEFAULT_SETTLEMENT_TIMEOUT_MS =  60_000;
const DEFAULT_POLL_INTERVAL_MS      =   2_000;

// ── UtexoLsp ──────────────────────────────────────────────────────────────────

export class UtexoLsp {
  /** Direct access to the HTTP client for one-off LSP calls if needed. */
  readonly http: IUtexoLSPClient;

  constructor(
    private readonly wallet: UTEXOWallet,
    readonly peer: LspPeer,
  ) {
    this.http = new UtexoLSPClient({
      baseUrl:     peer.baseUrl,
      bearerToken: peer.bearerToken,
      timeoutMs:   peer.timeoutMs,
    });
  }

  // ── 1. Connection ─────────────────────────────────────────────────────────────

  /**
   * Connect to the LSP peer over Lightning P2P.
   * Idempotent — swallows "already connected" errors from LDK.
   */
  async connect(): Promise<void> {
    try {
      await this.wallet.connectPeer(peerUri(this.peer));
    } catch (err: any) {
      if (!String(err?.message ?? '').toLowerCase().includes('already')) throw err;
    }
  }

  // ── 2. Channel readiness ──────────────────────────────────────────────────────

  /**
   * Poll listChannels until a usable RGB channel for `assetId` exists with the
   * LSP peer. Call connect() and (in regtest) mine confirmations before this.
   *
   * Throws LspChannelTimeoutError if timeoutMs exceeded.
   */
  async waitForChannel(
    assetId: string,
    opts: WaitOptions = {},
  ): Promise<ChannelReadyInfo> {
    const timeoutMs      = opts.timeoutMs      ?? DEFAULT_CHANNEL_TIMEOUT_MS;
    const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const deadline       = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      this.checkAbort(opts.signal);

      if (opts.onEachPoll) await opts.onEachPoll();

      await this.wallet.syncWallet();
      const channels = (await this.wallet.listChannels()) as RlnChannel[];
      const match    = channels.find((c) => this.isUsableRgbChannel(c, assetId));

      opts.onProgress?.(
        `channels: ${channels.length} — RGB usable: ${match ? 'yes' : 'no'}`,
      );

      if (match) return this.toChannelReadyInfo(match);

      await this.sleep(pollIntervalMs, opts.signal);
    }

    throw new LspChannelTimeoutError(assetId, timeoutMs);
  }

  // ── 3. Receive RGB over Lightning (POST /lightning_receive) ───────────────────

  /**
   * Lightning → RGB bridge:
   *   1. Creates a LN invoice on this wallet (expirySeconds).
   *   2. Registers it with the LSP → LSP returns an RGB invoice.
   *   3. Returns both invoices.
   *
   * Share rgbInvoice with whoever will send the on-chain RGB.
   * The LSP pays lnInvoice once the RGB transfer settles.
   */
  async receiveAsset(opts: ReceiveAssetOptions): Promise<ReceiveAssetResult> {
    const expirySeconds = opts.expirySeconds ?? 3600;

    const createdAtMs = Date.now();
    const { lnInvoice } = await this.wallet.createLightningInvoice({
      amountSats:    opts.amountSats,
      expirySeconds,
      asset: { assetId: opts.assetId, amount: opts.amountRgb },
    });

    // The LSP validates durationSeconds against the LN invoice's *remaining*
    // lifetime (EXPIRY_MATCH_TOLERANCE_SEC, default 5s). Invoice creation on a
    // mobile node can take several seconds, so send the remaining lifetime —
    // sending the full expiry fails with HTTP 400 once creation outlasts the
    // tolerance.
    const elapsedSeconds = Math.round((Date.now() - createdAtMs) / 1000);
    const durationSeconds = Math.max(1, expirySeconds - elapsedSeconds);

    const lr = await this.http.lightningReceive({
      lnInvoice,
      rgb: {
        assetId: opts.assetId,
        durationSeconds,
      },
    });

    return { lnInvoice, rgbInvoice: lr.rgbInvoice, mappingId: lr.mappingId };
  }

  // ── 4. Settlement polling ─────────────────────────────────────────────────────

  /**
   * Poll wallet.getLightningReceiveRequest until the invoice reaches a terminal
   * state.
   *
   * @returns `'settled'` when status is Succeeded; `'timed_out'` when timeoutMs
   *   elapses without a terminal status (LSP may still be processing).
   * @throws LspSettlementError if status is Failed or Expired.
   */
  async awaitReceiveSettlement(
    lnInvoice: string,
    opts: WaitOptions = {},
  ): Promise<ReceiveSettlementOutcome> {
    const timeoutMs      = opts.timeoutMs      ?? DEFAULT_SETTLEMENT_TIMEOUT_MS;
    const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const deadline       = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      this.checkAbort(opts.signal);

      await this.wallet.syncWallet();
      const raw    = await this.wallet.getLightningReceiveRequest(lnInvoice);
      const status = normalizeReceiveStatus(raw as string | null | undefined);

      opts.onProgress?.(status);

      if (status === 'Succeeded') return 'settled';
      if (status === 'Failed' || status === 'Expired') {
        throw new LspSettlementError('ln_invoice', status);
      }

      await this.sleep(pollIntervalMs, opts.signal);
    }

    opts.onProgress?.('timeout');
    return 'timed_out';
  }

  // ── 5. Outbound liquidity wait ────────────────────────────────────────────────

  /**
   * Poll until outbound balance on the LSP channel >= minMsat.
   * Use before payLightningInvoice to confirm routing capacity.
   */
  async waitForOutboundLiquidity(
    minMsat: number,
    opts: WaitOptions = {},
  ): Promise<void> {
    const timeoutMs      = opts.timeoutMs      ?? DEFAULT_CHANNEL_TIMEOUT_MS;
    const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const deadline       = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      this.checkAbort(opts.signal);

      await this.wallet.syncWallet();
      const channels = (await this.wallet.listChannels()) as RlnChannel[];
      const lspChan  = channels.find((c) =>
        this.raw(c, 'peerPubkey', 'peer_pubkey') === this.peer.peerPubkey &&
        Boolean(this.raw(c, 'isUsable', 'is_usable')),
      );
      const outbound = Number(this.raw(lspChan, 'outboundBalanceMsat', 'outbound_balance_msat') ?? 0);

      opts.onProgress?.(`outbound: ${outbound} msat (need ${minMsat})`);

      if (outbound >= minMsat) return;

      await this.sleep(pollIntervalMs, opts.signal);
    }
  }

  // ── 6. Send RGB via LSP (POST /onchain_send) ──────────────────────────────────

  /**
   * RGB → Lightning bridge:
   *   1. Submits recipient's on-chain RGB invoice to LSP.
   *   2. LSP returns a LN invoice.
   *   3. This wallet pays the LN invoice immediately.
   *   4. LSP executes sendrgb to the recipient once LN settles.
   */
  async sendAsset(opts: SendAssetOptions): Promise<SendAssetResult> {
    const issued     = await this.http.onchainSend({ rgbInvoice: opts.rgbInvoice, ln: opts.ln });
    const sendResult = await this.wallet.payLightningInvoice({ lnInvoice: issued.lnInvoice });
    return { ...issued, sendResult };
  }

  // ── 7. Pay a Lightning Address ────────────────────────────────────────────────

  /**
   * Resolve a Lightning Address and pay it.
   * Tries this LSP's resolveAddress first (handles Android emulator host rewriting).
   * Falls back to standard LNURL discovery for addresses on external hosts.
   */
  async payAddress(
    opts: PayAddressOptions,
  ): Promise<{ invoice: string; sendResult: LightningSendRequest }> {
    const [username, domain] = opts.address.split('@');
    if (!username || !domain) throw new Error(`Invalid Lightning Address: "${opts.address}"`);

    let invoice: string | undefined;

    try {
      const cb = await this.http.resolveAddress(
        username,
        opts.amtMsat,
        opts.asset?.assetId,
        opts.asset?.assetAmount,
      );
      invoice = cb.pr;
    } catch {
      const meta = await fetch(
        `https://${domain}/.well-known/lnurlp/${encodeURIComponent(username)}`,
      ).then((r) => r.json()) as { callback: string };
      if (!meta?.callback) throw new Error('Missing callback in LNURL response');

      let url = `${meta.callback}${meta.callback.includes('?') ? '&' : '?'}amount=${opts.amtMsat}`;
      if (opts.asset?.assetId)                  url += `&asset_id=${encodeURIComponent(opts.asset.assetId)}`;
      if (opts.asset?.assetAmount !== undefined) url += `&asset_amount=${opts.asset.assetAmount}`;

      const cb = await fetch(url).then((r) => r.json()) as { pr: string };
      invoice  = cb.pr;
    }

    if (!invoice) throw new Error('No invoice returned for Lightning Address');
    const sendResult = await this.wallet.payLightningInvoice({ lnInvoice: invoice });
    return { invoice, sendResult };
  }

  // ── 8. Async / offline receive (APay) ─────────────────────────────────────────

  /**
   * Register the async-payment hash pool with this LSP and return the
   * auto-generated Lightning Address for this wallet's pubkey.
   * Call once after first unlock to enable offline receive.
   *
   * The LSP provisions the address account (and mints the username) for every
   * connected peer via its own cron, so the username already exists by the time
   * we register — no bootstrap call is needed. We therefore:
   *   1. Resolve username/domain via getLightningAddressByPubkey (poll briefly
   *      in case the LSP cron hasn't provisioned the account yet).
   *   2. Register ONE attested batch via apayNewWithAddress — the node signs the
   *      username+domain attestation (APay hash-substitution resistance; works
   *      for password and external signers).
   *
   * Important: the node's batch size equals the LSP's hash-pool cap, so a single
   * batch fills the pool. Issuing a second batch (e.g. a bootstrap apayNew first)
   * overflows it and the LSP rejects it with `invalid_hash_batch`.
   */
  async enableLightningAddress(): Promise<LightningAddressInfo> {
    const nodeInfo = await this.wallet.getNodeInfo();
    const pubkey   = String(nodeInfo?.pubkey ?? '');
    if (!pubkey) throw new Error('enableLightningAddress: wallet not unlocked');

    const lspInfo = await this.http.getInfo();

    // 1. Resolve the LSP-provisioned address (retry while the cron catches up).
    const addr = await this.resolveLightningAddress(pubkey);

    // 2. Register a single attested batch.
    const pool = await this.wallet.apayNewWithAddress(
      lspInfo.pubkey,
      addr.username,
      addr.domain
    );

    return {
      username: addr.username,
      domain:   addr.domain,
      address:  `${addr.username}@${addr.domain}`,
      unusedHashes:      pool.unusedHashes,
      nextIndexExpected: pool.nextIndexExpected,
      refillBatchSize:   pool.refillBatchSize,
    };
  }

  /**
   * Resolve this wallet's LSP-assigned Lightning Address, retrying while the LSP
   * cron provisions the account (getLightningAddressByPubkey 404s until then).
   */
  private async resolveLightningAddress(
    pubkey: string,
    attempts = 8,
    delayMs = 2000
  ): Promise<{ username: string; domain: string }> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const addr = await this.http.getLightningAddressByPubkey(pubkey);
        if (addr?.username && addr?.domain) return addr;
      } catch (e) {
        lastErr = e;
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    throw new Error(
      `enableLightningAddress: LSP did not provision an address for ${pubkey} ` +
        `(ensure the wallet is connected to the LSP). Last error: ${String(lastErr)}`
    );
  }

  /**
   * Top up the async-payment hash pool with a fresh signed batch.
   *
   * Call after {@link enableLightningAddress} when the pool runs low
   * (see {@link ApayNewResponse.unusedHashes}). Each call registers a NEW
   * batch — the node advances its hash index, builds a new Merkle root and
   * signs it. Unlike the initial bootstrap, refills go straight through
   * `apayNewWithAddress` so every batch also carries the address attestation
   * (the username already exists, so no extra bootstrap is needed).
   */
  async refillHashPool(): Promise<ApayNewResponse> {
    const nodeInfo = await this.wallet.getNodeInfo();
    const pubkey   = String(nodeInfo?.pubkey ?? '');
    if (!pubkey) throw new Error('refillHashPool: wallet not unlocked');

    const lspInfo = await this.http.getInfo();
    // Address was already minted by enableLightningAddress — resolve it.
    const addr = await this.http.getLightningAddressByPubkey(pubkey);

    return this.wallet.apayNewWithAddress(
      lspInfo.pubkey,
      addr.username,
      addr.domain
    );
  }

  // ── 9. Claim pending HODL payments ────────────────────────────────────────────

  /**
   * Find all CLAIMABLE/CLAIMING inbound payments and claim each one via claimHodlInvoice.
   * Use for invoices created with createHodlInvoice — e.g. after unlock() when back online.
   */
  async claimPendingPayments(): Promise<ClaimResult[]> {
    const payments  = await this.wallet.listPaymentsRaw();
    const claimable = payments.filter((p) => {
      const s = String((p as any).status ?? '').toUpperCase();
      return s === 'CLAIMABLE' || s === 'CLAIMING';
    });

    const results: ClaimResult[] = [];
    for (const p of claimable) {
      const hash     = String(this.raw(p, 'paymentHash',     'payment_hash')     ?? '');
      const preimage = String(this.raw(p, 'paymentPreimage', 'payment_preimage') ?? '');
      try {
        await this.wallet.claimHodlInvoice(hash, preimage);
        results.push({ paymentHash: hash, claimed: true });
      } catch (err: any) {
        results.push({ paymentHash: hash, claimed: false, error: err?.message });
      }
    }
    return results;
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private isUsableRgbChannel(c: RlnChannel, assetId: string): boolean {
    return (
      this.raw(c, 'assetId', 'asset_id') === assetId &&
      Boolean(this.raw(c, 'isUsable', 'is_usable'))
    );
  }

  private toChannelReadyInfo(c: RlnChannel): ChannelReadyInfo {
    return {
      channelId:           String(this.raw(c, 'channelId',           'channel_id')           ?? ''),
      peerPubkey:          this.peer.peerPubkey,
      capacitySat:         Number(this.raw(c, 'capacitySat',         'capacity_sat')         ?? 0),
      outboundBalanceMsat: Number(this.raw(c, 'outboundBalanceMsat', 'outbound_balance_msat') ?? 0),
      inboundBalanceMsat:  Number(this.raw(c, 'inboundBalanceMsat',  'inbound_balance_msat')  ?? 0),
    };
  }

  private raw(obj: any, camel: string, snake: string): any {
    return obj?.[camel] ?? obj?.[snake];
  }

  private checkAbort(signal?: AbortSignal): void {
    if (signal?.aborted) throw new Error('UtexoLsp: operation aborted');
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => { clearTimeout(t); reject(new Error('UtexoLsp: aborted')); },
        { once: true },
      );
    });
  }
}
