// No React Native imports — this file moves to @utexo/rgb-sdk-core next release.
import type { IUtexoLSPClient } from './IUtexoLSPClient';
import type {
  LspClientConfig,
  LspGetInfoResponse,
  LspGetInfoWire,
  LspOnchainSendRequest,
  LspOnchainSendResponse,
  LspOnchainSendWire,
  LspLightningReceiveRequest,
  LspLightningReceiveResponse,
  LspLightningReceiveWire,
  LspLightningAddressByPubkeyResponse,
  LspLightningAddressByPubkeyWire,
  LspLnurlpCallbackResponse,
  LspLnurlpCallbackWire,
  LspApayInvoiceProofWire,
  ApayInvoiceProof,
} from './lsp-types';

/**
 * Map the snake_case wire proof (utexo-lsp) to the camelCase SDK shape.
 * request<T>() does a plain JSON.parse with no key transform, so this must
 * be explicit (same pattern as the rest of this client).
 */
function mapApayProof(
  raw: LspApayInvoiceProofWire | undefined
): ApayInvoiceProof | undefined {
  if (!raw) return undefined;
  return {
    version: raw.version,
    recipientPubkey: raw.recipient_pubkey,
    hostPubkey: raw.host_pubkey,
    batchId: raw.batch_id,
    hashIndex: raw.hash_index,
    paymentHash: raw.payment_hash,
    batchRoot: raw.batch_root,
    batchSize: raw.batch_size,
    merkleProof: (raw.merkle_proof ?? []).map((e) => ({
      sibling: e.sibling,
      side: e.side,
    })),
    batchSig: raw.batch_sig,
    createdAt: raw.created_at,
    expiresAt: raw.expires_at,
  };
}

const DEFAULT_TIMEOUT_MS = 15_000;

export class LspError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly status: number,
    public readonly body: string,
    cause?: unknown
  ) {
    super(
      status
        ? `LSP ${endpoint} → HTTP ${status}: ${body}`
        : `LSP ${endpoint} → ${(cause as Error)?.message ?? 'request failed'}`
    );
    this.name = 'LspError';
    if (cause) this.cause = cause;
  }
}

function snakeCaseLnParams(ln: LspOnchainSendRequest['ln']): Record<string, unknown> {
  if (!ln) return {};
  const out: Record<string, unknown> = {};
  if (ln.amtMsat !== undefined) out.amt_msat = ln.amtMsat;
  if (ln.expirySec !== undefined) out.expiry_sec = ln.expirySec;
  if (ln.assetId !== undefined) out.asset_id = ln.assetId;
  if (ln.assetAmount !== undefined) out.asset_amount = ln.assetAmount;
  if (ln.descriptionHash !== undefined) out.description_hash = ln.descriptionHash;
  if (ln.paymentHash !== undefined) out.payment_hash = ln.paymentHash;
  if (ln.minFinalCltvExpiryDelta !== undefined) {
    out.min_final_cltv_expiry_delta = ln.minFinalCltvExpiryDelta;
  }
  return out;
}

function snakeCaseRgbParams(rgb: LspLightningReceiveRequest['rgb']): Record<string, unknown> {
  const out: Record<string, unknown> = {
    asset_id: rgb.assetId,
    min_confirmations: rgb.minConfirmations ?? 1,
    witness: !!rgb.witness,
  };
  if (rgb.assignment !== undefined) out.assignment = rgb.assignment;
  if (rgb.durationSeconds !== undefined) out.duration_seconds = rgb.durationSeconds;
  return out;
}

export class UtexoLSPClient implements IUtexoLSPClient {
  constructor(private readonly config: LspClientConfig) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.config.bearerToken) {
      headers['Authorization'] = `Bearer ${this.config.bearerToken}`;
    }
    if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const signal = this.timeoutSignal(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { ...headers, ...(init?.headers as Record<string, string> ?? {}) },
        signal,
      });
    } catch (err) {
      throw new LspError(path, 0, '', err);
    }

    const text = await res.text();
    if (!res.ok) throw new LspError(path, res.status, text.trim());
    if (!text) return null as T;

    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new LspError(path, res.status, `invalid JSON: ${text.slice(0, 200)}`, err);
    }
  }

  private rewriteCallbackUrl(callbackUrl: string): string {
    try {
      const base = new URL(this.config.baseUrl);
      const cb   = new URL(callbackUrl);
      return base.origin + cb.pathname + cb.search + cb.hash;
    } catch {
      return callbackUrl;
    }
  }

  private timeoutSignal(ms: number): AbortSignal | undefined {
    if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function') {
      return (AbortSignal as any).timeout(ms);
    }
    if (typeof AbortController !== 'undefined') {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), ms);
      return ctrl.signal;
    }
    return undefined;
  }

  async getInfo(): Promise<LspGetInfoResponse> {
    const raw = await this.request<LspGetInfoWire>('/get_info');
    return {
      pubkey:            raw.pubkey,
      alias:             raw.alias,
      numChannels:       raw.num_channels,
      numUsableChannels: raw.num_usable_channels,
    };
  }

  /**
   * Full LUD-06 resolution: discovers callback URL from LNURL metadata,
   * then fetches the BOLT11 invoice. Works for any Lightning Address host,
   * not just utexo-lsp.
   */
  async resolveAddress(
    username: string,
    amtMsat: number,
    assetId?: string,
    assetAmount?: number
  ): Promise<LspLnurlpCallbackResponse> {
    const meta = await this.request<{ callback: string }>(
      `/.well-known/lnurlp/${encodeURIComponent(username)}`
    );
    if (!meta?.callback) {
      throw new LspError('/.well-known/lnurlp', 200, 'missing callback in LNURL response');
    }
    const sep = meta.callback.includes('?') ? '&' : '?';
    let url = `${this.rewriteCallbackUrl(meta.callback)}${sep}amount=${amtMsat}`;
    if (assetId) url += `&asset_id=${encodeURIComponent(assetId)}`;
    if (assetAmount !== undefined) url += `&asset_amount=${assetAmount}`;
    const raw = await this.request<LspLnurlpCallbackWire>(url);
    return {
      pr: raw.pr,
      routes: raw.routes ?? [],
      status: raw.status,
      reason: raw.reason,
      proof: mapApayProof(raw.proof),
    };
  }

  /**
   * Direct LSP Lightning Address callback — skips the LNURL discovery
   * step and hits /pay/callback/{username} on this LSP's base URL directly.
   * Useful when you already know the username is on this LSP.
   */
  async lnurlCallback(
    username: string,
    amtMsat: number,
    assetId?: string,
    assetAmount?: number
  ): Promise<LspLnurlpCallbackResponse> {
    let path = `/pay/callback/${encodeURIComponent(username)}?amount=${amtMsat}`;
    if (assetId) path += `&asset_id=${encodeURIComponent(assetId)}`;
    if (assetAmount !== undefined) path += `&asset_amount=${assetAmount}`;
    const raw = await this.request<LspLnurlpCallbackWire>(path);
    return {
      pr: raw.pr,
      routes: raw.routes ?? [],
      status: raw.status,
      reason: raw.reason,
      proof: mapApayProof(raw.proof),
    };
  }

  async getLightningAddressByPubkey(
    peerPubkey: string
  ): Promise<LspLightningAddressByPubkeyResponse> {
    const pubkey = peerPubkey.trim();
    if (!pubkey) {
      throw new Error('getLightningAddressByPubkey: peerPubkey is required');
    }
    const raw = await this.request<LspLightningAddressByPubkeyWire>(
      `/lightning_address/by_pubkey/${encodeURIComponent(pubkey)}`
    );
    return {
      username: raw.username,
      domain: raw.domain,
      recipientPubkey: raw.recipient_pubkey,
      addressSig: raw.address_sig,
    };
  }

  /**
   * RGB → Lightning: submit an RGB invoice to the LSP; receive a BOLT11
   * invoice to pay. LSP runs sendrgb to the recipient once the LN payment
   * settles.
   *
   * Body shape matches utexo-lsp exactly:
   *   { rgb_invoice, lninvoice: { amt_msat, expiry_sec, … } }
   */
  async onchainSend(
    params: LspOnchainSendRequest
  ): Promise<LspOnchainSendResponse> {
    const body: Record<string, unknown> = {
      rgb_invoice: params.rgbInvoice,
    };
    if (params.ln) body.lninvoice = snakeCaseLnParams(params.ln);

    const raw = await this.request<LspOnchainSendWire>('/onchain_send', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    // utexo-lsp returns snake_case keys — map explicitly
    // (request<T>() does a plain JSON.parse with no transform).
    return {
      lnInvoice:  raw.ln_invoice,
      rgbInvoice: raw.rgb_invoice,
      mappingId:  String(raw.mapping_id),
    };
  }

  /**
   * Lightning → RGB: submit a BOLT11 invoice + RGB params to the LSP;
   * LSP issues an RGB invoice. Once the RGB transfer settles, the LSP
   * pays the BOLT11 invoice.
   *
   * Body shape matches utexo-lsp exactly:
   *   { ln_invoice, rgb_invoice: { asset_id, min_confirmations, witness, … } }
   */
  async lightningReceive(
    params: LspLightningReceiveRequest
  ): Promise<LspLightningReceiveResponse> {
    const body = {
      ln_invoice: params.lnInvoice,
      rgb_invoice: snakeCaseRgbParams(params.rgb),
    };
    const raw = await this.request<LspLightningReceiveWire>('/lightning_receive', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return {
      lnInvoice:  raw.ln_invoice,
      rgbInvoice: raw.rgb_invoice,
      mappingId:  String(raw.mapping_id),
    };
  }
}
