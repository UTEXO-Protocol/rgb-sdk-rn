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
  numUsableChannels: number;
}

/** Raw wire shape returned by utexo-lsp (snake_case keys). */
export interface LspGetInfoWire {
  pubkey: string;
  alias?: string;
  num_channels?: number;
  numChannels?: number;
  num_usable_channels?: number;
  numUsableChannels?: number;
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

/** utexo-lsp `GET /lightning_address/by_pubkey/{pubkey}` */
export interface LspLightningAddressByPubkeyResponse {
  username: string;
  domain: string;
}

// ── LspPeer ───────────────────────────────────────────────────────────────────
// Single config object that replaces three separate values apps currently pass
// to connectPeer(), UtexoLSPClient, and UTEXOWalletNodeParams.lspBaseUrl.

export interface LspPeer {
  /** utexo-lsp HTTP base URL — same value as UTEXOWalletNodeParams.lspBaseUrl */
  baseUrl: string;
  /** Lightning P2P pubkey — used for connectPeer() */
  peerPubkey: string;
  peerHost: string;
  peerPort: number;
  /** Required only for APay async routes (/internal/async_order/*) */
  bearerToken?: string;
  timeoutMs?: number;
}

/** Returns the string accepted by UTEXOWallet.connectPeer() */
export function peerUri(peer: LspPeer): string {
  return `${peer.peerPubkey}@${peer.peerHost}:${peer.peerPort}`;
}

// ── ReceiveStatus ─────────────────────────────────────────────────────────────
// Canonical status type. Replaces the dual Succeeded|Settled string checks
// that appear in multiple places in the demo.

export type ReceiveStatus = 'Pending' | 'Succeeded' | 'Failed' | 'Expired';

/** Result of awaitReceiveSettlement — distinct from wallet ReceiveStatus. */
export type ReceiveSettlementOutcome = 'settled' | 'timed_out';

export function normalizeReceiveStatus(raw: string | null | undefined): ReceiveStatus {
  const s = (raw ?? '').toUpperCase();
  if (s === 'SUCCEEDED' || s === 'SETTLED') return 'Succeeded';
  if (s === 'FAILED')  return 'Failed';
  if (s === 'EXPIRED') return 'Expired';
  return 'Pending';
}

// ── ChannelReadyInfo ──────────────────────────────────────────────────────────

export interface ChannelReadyInfo {
  channelId: string;
  peerPubkey: string;
  capacitySat: number;
  outboundBalanceMsat: number;
  inboundBalanceMsat: number;
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

