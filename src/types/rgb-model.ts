export type RGBHTTPClientParams = {
  xpubVan: string;
  xpubCol: string;
  masterFingerprint: string;
  rgbEndpoint: string;
};

export type BitcoinNetwork =
  | 'mainnet'
  | 'testnet'
  | 'testnet4'
  | 'regtest'
  | 'signet';

export interface FailTransfersRequest {
  batchTransferIdx?: number;
  noAssetOnly?: boolean;
  skipSync?: boolean;
}

export interface WalletBackupResponse {
  message: string;
  backupPath: string;
}

export type VssBackupMode = 'Async' | 'Blocking';

export interface VssBackupConfigParams {
  serverUrl: string;
  storeId: string;
  /** 64-char hex string representing 32 raw bytes (secp256k1 secret key) */
  signingKeyHex: string;
  /** Whether to encrypt data before uploading. Default: true */
  encryptionEnabled?: boolean;
  /** Whether to automatically back up after state-changing operations. Default: false */
  autoBackup?: boolean;
  /** Whether auto-backup uploads block the caller or run asynchronously. Default: 'Async' */
  backupMode?: VssBackupMode;
}

export interface VssBackupInfo {
  /** Whether a backup exists on the server */
  backupExists: boolean;
  /** Server-side version of the backup */
  serverVersion: number | null;
  /** Whether the local wallet has changes since last backup */
  backupRequired: boolean;
}

export interface WalletRestoreResponse {
  message: string;
}

export interface RestoreWalletRequestModel {
  backupFilePath: string;
  password: string;
  dataDir: string;
}

export interface WitnessData {
  amountSat: number;
  blinding?: number;
}
export interface InvoiceRequest {
  amount: number;
  assetId?: string;
  minConfirmations?: number;
  durationSeconds?: number;
}
export interface Recipient {
  recipientId: string;
  witnessData?: WitnessData;
  amount: number;
  transportEndpoints: string[];
}
export interface IssueAssetNiaRequestModel {
  ticker: string;
  name: string;
  amounts: number[];
  precision: number;
}

export interface IssueAssetIfaRequestModel {
  ticker: string;
  name: string;
  precision: number;
  amounts: number[];
  inflationAmounts: number[];
  replaceRightsNum: number;
  rejectListUrl: string | null;
}
export interface SendAssetBeginRequestModel {
  invoice: string;
  witnessData?: WitnessData;
  assetId?: string;
  amount?: number;
  donation?: boolean;
  feeRate?: number;
  minConfirmations?: number;
}

export interface SendAssetEndRequestModel {
  signedPsbt: string;
  skipSync?: boolean;
}

export interface SendResult {
  txid: string;
  batchTransferIdx: number;
}

export interface OperationResult {
  txid: string;
  batchTransferIdx: number;
}

export interface CreateUtxosBeginRequestModel {
  upTo?: boolean;
  num?: number;
  size?: number;
  feeRate?: number;
}

export interface CreateUtxosEndRequestModel {
  signedPsbt: string;
  skipSync?: boolean;
}

export interface InflateAssetIfaRequestModel {
  assetId: string;
  inflationAmounts: number[];
  feeRate?: number;
  minConfirmations?: number;
}

export interface InflateEndRequestModel {
  signedPsbt: string;
}

export interface SendBtcBeginRequestModel {
  address: string;
  amount: number;
  feeRate: number;
  skipSync?: boolean;
}
export interface SendBtcEndRequestModel {
  signedPsbt: string;
  skipSync?: boolean;
}

export interface GetFeeEstimationRequestModel {
  blocks: number;
}

export type GetFeeEstimationResponse = Record<string, number> | number;

export enum BindingTransactionType {
  RGB_SEND = 0,
  DRAIN = 1,
  CREATE_UTXOS = 2,
  USER = 3,
}
export type TransactionType = 'RgbSend' | 'Drain' | 'CreateUtxos' | 'User';

export interface BlockTime {
  height: number;
  timestamp: number;
}

export interface Transaction {
  transactionType: TransactionType;
  txid: string;
  received: number;
  sent: number;
  fee: number;
  confirmationTime?: BlockTime;
}
export type TransferKind =
  | 'Issuance'
  | 'ReceiveBlind'
  | 'ReceiveWitness'
  | 'Send'
  | 'Inflation';

export type Outpoint = {
  txid: string;
  vout: number;
};

export interface Transfer {
  idx: number;
  batchTransferIdx: number;
  createdAt: number;
  updatedAt: number;
  status: TransferStatus;
  requestedAssignment?: Assignment;
  assignments: Assignment[];
  kind: TransferKind;
  txid?: string;
  recipientId?: string;
  receiveUtxo?: Outpoint;
  changeUtxo?: Outpoint;
  expiration?: number;
  transportEndpoints: {
    endpoint: string;
    transportType: string;
    used: boolean;
  }[];
  invoiceString?: string;
  consignmentPath?: string;
}

export type TransferStatus =
  | 'WaitingCounterparty'
  | 'WaitingConfirmations'
  | 'Settled'
  | 'Failed';
export interface Unspent {
  utxo: Utxo;
  rgbAllocations: RgbAllocation[];
  pendingBlinded: number;
}
export interface Utxo {
  outpoint: {
    txid: string;
    vout: number;
  };
  btcAmount: number;
  colorable: boolean;
  exists: boolean;
}

export interface RgbAllocation {
  assetId?: string;
  assignment: Assignment;
  settled: boolean;
}

export interface Balance {
  settled: number;
  future: number;
  spendable: number;
}

export interface BtcBalance {
  vanilla: Balance;
  colored: Balance;
}
export interface InvoiceReceiveData {
  invoice: string;
  recipientId: string;
  expirationTimestamp: number | null;
  batchTransferIdx: number;
}
export interface AssetNIA {
  /**
   * @type {string}
   * @memberof AssetNIA
   * @example rgb:2dkSTbr-jFhznbPmo-TQafzswCN-av4gTsJjX-ttx6CNou5-M98k8Zd
   */
  assetId: string;

  /**
   * @type {AssetIface}
   * @memberof AssetNIA
   */
  assetIface?: AssetIface;

  /**
   * @type {string}
   * @memberof AssetNIA
   * @example USDT
   */
  ticker: string;

  /**
   * @type {string}
   * @memberof AssetNIA
   * @example Tether
   */
  name: string;

  /**
   * @type {string}
   * @memberof AssetNIA
   * @example asset details
   */
  details?: string;

  /**
   * @type {number}
   * @memberof AssetNIA
   * @example 0
   */
  precision: number;

  /**
   * @type {number}
   * @memberof AssetNIA
   * @example 777
   */
  issuedSupply: number;

  /**
   * @type {number}
   * @memberof AssetNIA
   * @example 1691160565
   */
  timestamp: number;

  /**
   * @type {number}
   * @memberof AssetNIA
   * @example 1691161979
   */
  addedAt: number;

  /**
   * @type {Balance}
   * @memberof AssetNIA
   */
  balance: Balance;

  /**
   * @type {Media}
   * @memberof AssetNIA
   */
  media?: Media;
}

export interface AssetIfa {
  assetId: string;
  ticker: string;
  name: string;
  details?: string;
  precision: number;
  initialSupply: number;
  maxSupply: number;
  knownCirculatingSupply: number;
  timestamp: number;
  addedAt: number;
  balance: Balance;
  media?: Media;
  rejectListUrl?: string;
}

export interface Media {
  /**
   * @type {string}
   * @memberof Media
   * @example /path/to/media
   */
  filePath?: string;

  /**
   * @type {string}
   * @memberof Media
   * @example text/plain
   */
  mime?: string;
}

export enum AssetIface {
  RGB20 = 'RGB20',
  RGB21 = 'RGB21',
  RGB25 = 'RGB25',
}

export enum AssetSchema {
  Nia = 'Nia',
  Uda = 'Uda',
  Cfa = 'Cfa',
}

export type ListAssets = {
  nia: AssetNIA[];
  uda: AssetUDA[];
  cfa: AssetCFA[];
  ifa: AssetIfa[];
};
export type AssetUDA = {
  assetId: string;
  ticker: string;
  name: string;
  details?: string;
  precision: number;
  timestamp: number;
  addedAt: number;
  balance: Balance;
  token?: {
    index: number;
    ticker?: string;
    name?: string;
    details?: string;
    embeddedMedia: boolean;
    media?: Media;
    attachments: Array<{
      key: number;
      filePath: string;
      mime: string;
      digest: string;
    }>;
    reserves: boolean;
  };
};
export type AssetIFA = {
  assetId: string;
  ticker: string;
  name: string;
  details?: string;
  precision: number;
  initialSupply: number;
  maxSupply: number;
  knownCirculatingSupply: number;
  timestamp: number;
  addedAt: number;
  balance: Balance;
  media?: Media;
  rejectListUrl?: string;
};

export type AssetCFA = {
  assetId: string;
  name: string;
  details?: string;
  precision: number;
  issuedSupply: number;
  timestamp: number;
  addedAt: number;
  balance: Balance;
  media?: Media;
};

export interface IssueAssetNIAResponse {
  /**
   * @type {AssetNIA}
   * @memberof IssueAssetNIAResponse
   */
  asset?: AssetNIA;
}

/**
 *
 *
 * @export
 * @interface AssetBalance
 */
export interface AssetBalance {
  /**
   * @type {number}
   * @memberof AssetBalance
   * @example 777
   */
  settled?: number;

  /**
   * @type {number}
   * @memberof AssetBalance
   * @example 777
   */
  future?: number;

  /**
   * @type {number}
   * @memberof AssetBalance
   * @example 777
   */
  spendable?: number;

  /**
   * @type {number}
   * @memberof AssetBalance
   * @example 444
   */
  offchainOutbound?: number;

  /**
   * @type {number}
   * @memberof AssetBalance
   * @example 0
   */
  offchainInbound?: number;
}

export interface InvoiceData {
  invoice: string;
  recipientId: string;
  assetSchema?: AssetSchema;
  assetId?: string;
  network: BitcoinNetwork;
  assignment: Assignment;
  assignmentName?: string;
  expirationTimestamp: number | null;
  transportEndpoints: string[];
}

export type AssignmentType =
  | 'Fungible'
  | 'NonFungible'
  | 'InflationRight'
  | 'ReplaceRight'
  | 'Any';

export type Assignment = {
  type: AssignmentType;
  amount?: number;
};

/**
 * UTEXO Protocol Types - Lightning Network and Cross-Network Transfers
 */

export interface LightningAsset {
  /**
   * RGB Asset ID
   * @type {string}
   * @memberof LightningAsset
   */
  assetId: string;

  /**
   * Amount in asset units
   * @type {number}
   * @memberof LightningAsset
   */
  amount: number;
}

/**
 * Request model for creating Lightning invoice.
 *
 * @export
 * @interface CreateLightningInvoiceRequestModel
 */
export interface CreateLightningInvoiceRequestModel {
  /**
   * Amount in satoshis (optional)
   * @type {number}
   * @memberof CreateLightningInvoiceRequestModel
   */
  amountSats?: number;

  /**
   * Asset to receive
   * @type {LightningAsset}
   * @memberof CreateLightningInvoiceRequestModel
   */
  asset: LightningAsset;

  /**
   * Invoice expiry time in seconds (optional)
   * @type {number}
   * @memberof CreateLightningInvoiceRequestModel
   */
  expirySeconds?: number;
}

/**
 * Lightning receive request response
 */
export interface LightningReceiveRequest {
  /** Lightning Network invoice string */
  lnInvoice: string;
  /** Expiration timestamp (optional) */
  expiresAt?: number;
  /** Request ID for tracking (optional) */
  requestId?: string;
}

/**
 * Lightning send request response
 */
export interface LightningSendRequest {
  /** Transaction ID */
  txid: string;
  /** Transfer status */
  status?: string;
  /** Consignment endpoint (optional) */
  consignmentEndpoint?: string;
}

/**
 * Request model for getting Lightning send fee estimate
 */
export interface GetLightningSendFeeEstimateRequestModel {
  /** Lightning invoice to pay */
  invoice: string;
  /** Asset ID (optional) */
  assetId?: string;
}

/**
 * Request model for paying Lightning invoice
 */
export interface PayLightningInvoiceRequestModel {
  /** Lightning Network invoice string */
  lnInvoice: string;
  /** Amount to pay (optional, if not in invoice) */
  amount?: number;
  /** Asset ID to pay with (optional) */
  assetId?: string;
  /** Maximum fee in satoshis (optional) */
  maxFee?: number;
}

/**
 * Request model for completing Lightning invoice payment
 */
export interface PayLightningInvoiceEndRequestModel {
  /** Signed PSBT */
  signedPsbt: string;
  /** Lightning invoice being paid */
  lnInvoice: string;
}

/**
 * Withdrawal (on-chain send) types
 */

/**
 * Request model for withdrawing to Bitcoin L1
 */
export interface WithdrawBeginRequestModel {
  /** Bitcoin address or RGB invoice */
  address_or_rgbinvoice: string;
  /** Amount in satoshis */
  amount_sats: number;
  /** Fee rate in sat/vB (optional) */
  fee_rate?: number;
  /** Asset ID to withdraw (optional, defaults to BTC) */
  asset?: string;
}

/**
 * Request model for completing withdrawal
 */
export interface WithdrawEndRequestModel {
  /** Signed PSBT */
  signed_psbt: string;
}

/**
 * Withdrawal status response
 */
export interface WithdrawalStatus {
  /** Current status */
  status: 'pending' | 'completed' | 'failed';
  /** Transaction ID (when completed) */
  txid?: string;
  /** Withdrawal ID */
  withdrawalId?: string;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Onchain receive/send types (UTEXO bridge cross-network transfers)
 */

export interface OnchainReceiveRequestModel extends InvoiceRequest {
  amount: number;
  assetId: string;
}

export interface OnchainReceiveResponse {
  /** Mainnet invoice */
  invoice: string;
}

export interface OnchainSendRequestModel {
  /** Mainnet RGB invoice */
  invoice: string;
  assetId?: string;
  amount?: number;
}

export interface OnchainSendEndRequestModel {
  /** Mainnet RGB invoice */
  invoice: string;
  signedPsbt: string;
}

export interface OnchainSendResponse extends SendResult {}

export interface GetOnchainSendResponse {
  sendId: string;
  txid?: string;
  status: string;
  amount: number;
  assetId?: string;
  fee?: number;
  createdAt: number;
  completedAt?: number;
}

export interface ListLightningPaymentsResponse {
  payments: LightningSendRequest[];
}

/**
 * Public keys structure
 */
export interface PublicKeys {
  /** Master extended public key */
  xpub: string;
  /** Vanilla (Bitcoin) account xpub */
  accountXpubVanilla: string;
  /** Colored (RGB) account xpub */
  accountXpubColored: string;
  /** Master key fingerprint */
  masterFingerprint: string;
}
