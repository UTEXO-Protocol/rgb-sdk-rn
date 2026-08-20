// UniFFI wire types — the binding contract.
//
// Only `Rln*` shapes live here. Shared model types come from
// @utexo/rgb-sdk-core; import them from there, not through this module.
//
// Unit conventions:
// - Every timestamp is **Unix seconds**, passed through from the native layer
//   unconverted. JS `Date` expects milliseconds, so multiply by 1000 before
//   constructing one — treating these as ms yields dates in 1970.
// - Fields named `*Sec`/`*Seconds` are durations, not absolute times.
// - Amounts are sats unless the name ends in `Msat`.
// ── Shared primitives ─────────────────────────────────────────────────────────

export interface RlnBtcSubBalance {
  settled: number;
  future: number;
  spendable: number;
}

export interface RlnMedia {
  filePath: string;
  digest: string;
  mime: string;
}

export interface RlnBlockTime {
  height: number;
  /** Block time as **Unix seconds** (not JS milliseconds). */
  timestamp: number;
}

export interface RlnTransportEndpoint {
  endpoint: string;
  transportType: string;
  used: boolean;
}

// ── Node ──────────────────────────────────────────────────────────────────────

export interface RlnNodeInfo {
  pubkey: string;
  numChannels: number;
  numUsableChannels: number;
  localBalanceSat: number;
  numPeers: number;
  maxMediaUploadSizeMb?: number;
  rgbHtlcMinMsat?: number;
  rgbChannelCapacityMinSat?: number;
  channelCapacityMinSat?: number;
  channelCapacityMaxSat?: number;
  channelAssetMinAmount?: number;
  channelAssetMaxAmount?: number;
  networkNodes?: number;
  networkChannels?: number;
  /** **Unix seconds** (not JS milliseconds). */
  latestRgsSnapshotTimestamp?: number | null;
}

export interface RlnNetworkInfo {
  network: string;
  height: number;
}

// ── Peers ─────────────────────────────────────────────────────────────────────

export interface RlnPeer {
  pubkey: string;
}

// ── Channels ──────────────────────────────────────────────────────────────────

/** Canonical SCREAMING_SNAKE — normalized at the RLNBinding boundary. */
export type RlnChannelStatusWire = 'OPENING' | 'OPENED' | 'CLOSING';

export interface RlnChannel {
  channelId: string;
  peerPubkey: string;
  status?: RlnChannelStatusWire;
  ready: boolean;
  capacitySat: number;
  isUsable?: boolean;
  public: boolean;
  localBalanceSat?: number;
  outboundBalanceMsat?: number;
  inboundBalanceMsat?: number;
  nextOutboundHtlcLimitMsat?: number;
  nextOutboundHtlcMinimumMsat?: number;
  fundingTxid?: string;
  peerAlias?: string;
  shortChannelId?: number;
  assetId?: string;
  assetLocalAmount?: number;
  assetRemoteAmount?: number;
  virtualOpenMode?: string;
}

export interface RlnOpenChannelResponse {
  temporaryChannelId: string;
}

// ── Payments ──────────────────────────────────────────────────────────────────

export type RlnPaymentType = 'Outbound' | 'InboundAutoClaim' | 'InboundHodl';
export type RlnPaymentStatusWire =
  | 'Pending'
  | 'Claimable'
  | 'Claiming'
  | 'Succeeded'
  | 'Cancelled'
  | 'Failed';

export interface RlnPayment {
  paymentHash: string;
  paymentType?: RlnPaymentType;
  status?: RlnPaymentStatusWire;
  /** **Unix seconds** (not JS milliseconds) — multiply by 1000 for `new Date()`. */
  createdAt: number;
  /** **Unix seconds** (not JS milliseconds) — multiply by 1000 for `new Date()`. */
  updatedAt: number;
  payeePubkey: string;
  amtMsat?: number;
  assetAmount?: number;
  assetId?: string;
  preimage?: string;
}

export interface RlnSendPaymentResponse {
  paymentId: string;
  paymentHash?: string;
  paymentSecret?: string;
  status: RlnPaymentStatusWire;
}

export interface RlnKeysendResponse {
  paymentHash: string;
  paymentPreimage: string;
  status: RlnPaymentStatusWire;
}

export type RlnInvoiceStatusWire =
  | 'PENDING'
  | 'CLAIMABLE'
  | 'CLAIMING'
  | 'SUCCEEDED'
  | 'CANCELLED'
  | 'FAILED'
  | 'EXPIRED';

export interface RlnLnInvoiceResponse {
  invoice: string;
}

export interface RlnDecodeLnInvoiceResponse {
  amtMsat?: number;
  /** Duration in seconds from `timestamp`, not an absolute time. */
  expirySec: number;
  /** Invoice creation time as **Unix seconds** (not JS milliseconds). */
  timestamp: number;
  assetId?: string;
  assetAmount?: number;
  paymentHash: string;
  paymentSecret: string;
  payeePubkey?: string;
  network: string;
}

// ── On-chain wallet ───────────────────────────────────────────────────────────

export interface RlnAddressResponse {
  address: string;
}

/** Mirrors the native `AssignmentKind` enum. */
export type RlnAssignmentKind =
  | 'Fungible'
  | 'NonFungible'
  | 'InflationRight'
  | 'ReplaceRight'
  | 'Any';

export interface RlnSignMessageResponse {
  signedMessage: string;
}

export interface RlnVerifyMessageResponse {
  valid: boolean;
}

export interface RlnBtcBalance {
  vanilla: RlnBtcSubBalance;
  colored: RlnBtcSubBalance;
}

export interface RlnSendBtcResponse {
  txid: string;
}

export interface RlnEstimateFeeResponse {
  feeRate: number;
}

export interface RlnCheckIndexerUrlResponse {
  indexerProtocol: string;
}

// ── Assets ────────────────────────────────────────────────────────────────────

export interface RlnAssetBalance {
  settled: number;
  future: number;
  spendable: number;
  offchainOutbound?: number;
  offchainInbound?: number;
}

interface RlnAssetBase {
  assetId: string;
  name: string;
  precision: number;
  /** Issuance time as **Unix seconds** (not JS milliseconds). */
  timestamp: number;
  /** Time the asset entered this wallet, as **Unix seconds**. */
  addedAt: number;
  balance: RlnAssetBalance;
  media?: RlnMedia;
}

export interface RlnAssetNia extends RlnAssetBase {
  ticker: string;
  issuedSupply: number;
  details?: string;
}

export interface RlnAssetCfa extends RlnAssetBase {
  issuedSupply: number;
  details?: string;
}

export interface RlnAssetIfa extends RlnAssetBase {
  ticker: string;
  details?: string;
  initialSupply: number;
  maxSupply: number;
  knownCirculatingSupply: number;
  rejectListUrl?: string;
  issuanceLinkRightOutpoint?: RlnRgbOutpoint;
  linkedFromAssetId?: string;
  linkedToAssetId?: string;
}

export interface RlnRgbOutpoint {
  txid: string;
  vout: number;
}

export interface RlnAssetUda extends RlnAssetBase {
  ticker: string;
  details?: string;
  token?: object;
}

export interface RlnListAssetsResponse {
  nia?: RlnAssetNia[];
  cfa?: RlnAssetCfa[];
  ifa?: RlnAssetIfa[];
  uda?: RlnAssetUda[];
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export interface RlnRgbInvoiceResponse {
  invoice: string;
  batchTransferIdx: number;
  recipientId?: string;
  /** **Unix seconds** (not JS milliseconds). */
  expirationTimestamp?: number;
}

export interface RlnDecodeRgbInvoiceResponse {
  recipientId: string;
  proxyRecipientId: string;
  recipientType: string;
  assetSchema?: string;
  assetId?: string;
  assignment: string;
  network: string;
  /** **Unix seconds** (not JS milliseconds). */
  expirationTimestamp?: number;
  transportEndpoints: string[];
}

// ── Transfers / transactions / unspents ───────────────────────────────────────

export interface RlnRgbAllocation {
  assetId?: string;
  assignment: string;
  settled: boolean;
}

export interface RlnUtxo {
  outpoint: string;
  btcAmount: number;
  colorable: boolean;
}

export interface RlnUnspent {
  utxo: RlnUtxo;
  rgbAllocations?: RlnRgbAllocation[];
  /** Blinded assignments awaiting a matching incoming transfer. */
  pendingBlinded?: number;
}

/** Canonical SCREAMING_SNAKE — normalized at the RLNBinding boundary. */
export type RlnTransactionType =
  | 'RGB_SEND'
  | 'DRAIN'
  | 'CREATE_UTXOS'
  | 'SEND_BTC'
  | 'INCOMING';

export interface RlnTransaction {
  txid: string;
  transactionType?: RlnTransactionType;
  received?: number;
  sent?: number;
  fee?: number;
  confirmationTime?: RlnBlockTime;
}

export interface RlnTransfer {
  idx: number;
  status: string;
  /** **Unix seconds** (not JS milliseconds) — multiply by 1000 for `new Date()`. */
  createdAt?: number;
  /** **Unix seconds** (not JS milliseconds) — multiply by 1000 for `new Date()`. */
  updatedAt?: number;
  kind?: string;
  txid?: string;
  recipientId?: string;
  proxyRecipientId?: string;
  receiveUtxo?: string;
  changeUtxo?: string;
  /** **Unix seconds** (not JS milliseconds). */
  expiration?: number;
  transportEndpoints?: RlnTransportEndpoint[];
  requestedAssignment?: string;
  assignments?: string[];
}

// ── HODL invoices ─────────────────────────────────────────────────────────────

export interface RlnClaimHodlInvoiceResponse {
  changed: boolean;
}

// ── Async payments (APay) ─────────────────────────────────────────────────────

export interface RlnApayHashEntry {
  hashIndex: number;
  paymentHash: string;
}

export interface RlnApayNewResponse {
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
  hashes: RlnApayHashEntry[];
}

// ── Send RGB ──────────────────────────────────────────────────────────────────

export interface RlnSendRgbResponse {
  txid: string;
  batchTransferIdx: number;
}

// ── Inflate (IFA) ─────────────────────────────────────────────────────────────

/**
 * Mirrors the UniFFI `InflateResponse`, which carries **only** a txid — unlike
 * `RlnSendRgbResponse` there is no `batchTransferIdx`, because the node
 * performs inflation atomically rather than through a batch transfer.
 */
export interface RlnInflateResponse {
  txid: string;
}

// ── Fail transfers ────────────────────────────────────────────────────────────

export interface RlnFailTransfersResponse {
  transfersChanged: boolean;
}
