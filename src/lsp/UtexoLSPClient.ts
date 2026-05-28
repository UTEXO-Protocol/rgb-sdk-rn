// No React Native imports — this file moves to @utexo/rgb-sdk-core next release.
import type { IUtexoLSPClient } from './IUtexoLSPClient';
import type {
  LspClientConfig,
  LspGetInfoResponse,
  LspOnchainSendRequest,
  LspOnchainSendResponse,
  LspLightningReceiveRequest,
  LspLightningReceiveResponse,
  LspLnurlpCallbackResponse,
} from './lsp-types';

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
    return this.request<LspGetInfoResponse>('/get_info');
  }

  /**
   * Full LUD-06 resolution: discovers callback URL from LNURL metadata,
   * then fetches the BOLT11 invoice. Works for any Lightning Address host,
   * not just utexo-lsp.
   */
  async resolveAddress(
    username: string,
    amtMsat: number
  ): Promise<LspLnurlpCallbackResponse> {
    const meta = await this.request<{ callback: string }>(
      `/.well-known/lnurlp/${encodeURIComponent(username)}`
    );
    if (!meta?.callback) {
      throw new LspError('/.well-known/lnurlp', 200, 'missing callback in LNURL response');
    }
    // Use the full callback URL — it may be on a different host
    const sep = meta.callback.includes('?') ? '&' : '?';
    return this.request<LspLnurlpCallbackResponse>(
      `${meta.callback}${sep}amount=${amtMsat}`
    );
  }

  /**
   * Direct LSP Lightning Address callback — skips the LNURL discovery
   * step and hits /pay/callback/{username} on this LSP's base URL directly.
   * Useful when you already know the username is on this LSP.
   */
  async lnurlCallback(
    username: string,
    amtMsat: number
  ): Promise<LspLnurlpCallbackResponse> {
    return this.request<LspLnurlpCallbackResponse>(
      `/pay/callback/${encodeURIComponent(username)}?amount=${amtMsat}`
    );
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

    return this.request<LspOnchainSendResponse>('/onchain_send', {
      method: 'POST',
      body: JSON.stringify(body),
    });
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
    return this.request<LspLightningReceiveResponse>('/lightning_receive', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
