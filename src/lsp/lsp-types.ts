// LSP + async-payment public types.
// No React Native imports — this file moves to @utexo/rgb-sdk-core next release.

// ── LSP client config ─────────────────────────────────────────────────────────

export interface LspClientConfig {
  baseUrl: string;
  bearerToken?: string;
  timeoutMs?: number;
}

// ── LSP HTTP response / request DTOs ─────────────────────────────────────────

export interface LspGetInfoResponse {
  pubkey: string;
  alias?: string;
  numChannels: number;
}

export interface LspLnParams {
  amtMsat?: number;
  expirySec?: number;
  assetId?: string;
  assetAmount?: number;
  descriptionHash?: string;
  paymentHash?: string;
  minFinalCltvExpiryDelta?: number;
}

export interface LspOnchainSendRequest {
  rgbInvoice: string;
  ln?: LspLnParams;
}

export interface LspOnchainSendResponse {
  rgbInvoice: string;
  lnInvoice: string;
  mappingId: string;
}

export interface LspRgbParams {
  assetId: string;
  assignment?: string;
  durationSeconds?: number;
  minConfirmations?: number;
  witness?: string;
}

export interface LspLightningReceiveRequest {
  lnInvoice: string;
  rgb: LspRgbParams;
}

export interface LspLightningReceiveResponse {
  lnInvoice: string;
  rgbInvoice: string;
  mappingId: string;
}

/** Raw wire shape returned by utexo-lsp (snake_case keys). */
export interface LspLightningReceiveWire {
  ln_invoice?: string;
  lnInvoice?: string;
  rgb_invoice?: string;
  rgbInvoice?: string;
  mapping_id?: string | number;
  mappingId?: string | number;
}

export interface LspLnurlpCallbackResponse {
  pr: string;
  routes: unknown[];
  status?: string;
  reason?: string;
}

// ── HODL invoice types ────────────────────────────────────────────────────────

export interface CreateHodlInvoiceParams {
  paymentHash: string;
  amtMsat?: number | null;
  expirySec: number;
  assetId?: string | null;
  assetAmount?: number | null;
  minFinalCltvExpiryDelta?: number | null;
}

export interface HodlInvoice {
  bolt11: string;
  paymentHash: string;
}

export interface HodlInvoiceResult {
  changed: boolean;
}

// ── Async payment (APay) types ────────────────────────────────────────────────

export interface ApayHashEntry {
  hashIndex: number;
  paymentHash: string;
}

export interface ApayNewResponse {
  requestId: string;
  hostNodeId: string;
  protocolVersion: number;
  orderId: string;
  status: string;
  acceptedThroughIndex: number;
  nextIndexExpected: number;
  unusedHashes: number;
  refillBatchSize: number;
  firstHashIndex: number;
  lastHashIndex: number;
  hashes: ApayHashEntry[];
}

