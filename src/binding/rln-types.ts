export type {
  CreateLightningInvoiceRequestModel,
  LightningReceiveRequest,
  GetLightningSendFeeEstimateRequestModel,
  PayLightningInvoiceRequestModel,
  LightningSendRequest,
  OnchainReceiveRequestModel,
  OnchainReceiveResponse,
  OnchainSendRequestModel,
  OnchainSendResponse,
  OnchainSendStatus,
  SendAssetEndRequestModel,
  TransferStatus,
  Transfer,
  ListLightningPaymentsResponse,
} from '@utexo/rgb-sdk-core';

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

export interface RlnChannel {
  channelId: string;
  peerPubkey: string;
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
export type RlnPaymentStatus =
  | 'Pending'
  | 'Claimable'
  | 'Claiming'
  | 'Succeeded'
  | 'Cancelled'
  | 'Failed';

export interface RlnPayment {
  paymentHash: string;
  paymentType?: RlnPaymentType;
  status?: RlnPaymentStatus;
  createdAt: number;
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
  status: RlnPaymentStatus;
}

export interface RlnKeysendResponse {
  paymentHash: string;
  paymentPreimage: string;
  status: RlnPaymentStatus;
}

export type RlnInvoiceStatus =
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
  expirySec: number;
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
  timestamp: number;
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
  expirationTimestamp?: number;
}

export interface RlnDecodeRgbInvoiceResponse {
  recipientId: string;
  recipientType: string;
  assetSchema?: string;
  assetId?: string;
  assignment: string;
  network: string;
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
}

export interface RlnTransaction {
  txid: string;
  transactionType?: string;
  received?: number;
  sent?: number;
  fee?: number;
  confirmationTime?: RlnBlockTime;
}

export interface RlnTransfer {
  idx: number;
  status: string;
  createdAt?: number;
  updatedAt?: number;
  kind?: string;
  txid?: string;
  recipientId?: string;
  receiveUtxo?: string;
  changeUtxo?: string;
  expiration?: number;
  transportEndpoints?: RlnTransportEndpoint[];
  requestedAssignment?: string;
  assignments?: string[];
}

// ── Send RGB ──────────────────────────────────────────────────────────────────

export interface RlnSendRgbResponse {
  txid: string;
  batchTransferIdx: number;
}

// ── Fail transfers ────────────────────────────────────────────────────────────

export interface RlnFailTransfersResponse {
  transfersChanged: boolean;
}
