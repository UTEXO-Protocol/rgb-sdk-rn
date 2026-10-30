import { TurboModuleRegistry, type TurboModule } from 'react-native';

/** Decimal strings preserve the complete Rust u64 range across the RN bridge. */
export type NativeBalance = {
  settled: string;
  future: string;
  spendable: string;
};
export type NativeAssignment = { type: string; amount: string | null };
export type NativeOutpoint = { txid: string; vout: number };
export type NativeMedia = {
  filePath: string;
  mime: string;
  digest: string;
};
export type NativeAttachment = {
  key: number;
  filePath: string;
  mime: string;
  digest: string;
};
export type NativeToken = {
  index: number;
  ticker: string | null;
  name: string | null;
  details: string | null;
  embeddedMedia: boolean;
  media: NativeMedia | null;
  attachments: NativeAttachment[];
  reserves: boolean;
};
export type NativeAsset = {
  schema: string;
  assetId: string;
  ticker: string | null;
  name: string;
  details: string | null;
  precision: number;
  issuedSupply: string | null;
  initialSupply: string | null;
  maxSupply: string | null;
  knownCirculatingSupply: string | null;
  timestamp: string;
  addedAt: string;
  balance: NativeBalance;
  media: NativeMedia | null;
  token: NativeToken | null;
  rejectListUrl: string | null;
};
export type NativeTransfer = {
  idx: number;
  batchTransferIdx: number;
  createdAt: string;
  updatedAt: string;
  status: string;
  requestedAssignment: NativeAssignment | null;
  assignments: NativeAssignment[];
  kind: string;
  txid: string | null;
  recipientId: string | null;
  receiveUtxo: NativeOutpoint | null;
  changeUtxo: NativeOutpoint | null;
  expiration: string | null;
  transportEndpoints: {
    endpoint: string;
    transportType: string;
    used: boolean;
  }[];
  invoiceString: string | null;
  consignmentPath: string | null;
};
export type NativeTransaction = {
  transactionType: string;
  txid: string;
  received: string;
  sent: string;
  fee: string;
  confirmationTime: { height: number; timestamp: string } | null;
};
export type NativeUnspent = {
  utxo: {
    outpoint: NativeOutpoint;
    btcAmount: string;
    colorable: boolean;
    exists: boolean;
  };
  rgbAllocations: {
    assetId: string | null;
    assignment: NativeAssignment;
    settled: boolean;
  }[];
  pendingBlinded: number;
};
export type NativeReceive = {
  invoice: string;
  recipientId: string;
  expirationTimestamp: string;
  batchTransferIdx: number;
  publicKey: string;
};
export type NativeInvoice = {
  recipientId: string;
  assetSchema: string | null;
  assetId: string | null;
  assignment: NativeAssignment;
  assignmentName: string | null;
  network: string;
  expirationTimestamp: string | null;
  transportEndpoints: string[];
  publicKey: string | null;
  encryption: string;
  unknownQueryParams: { key: string; value: string }[];
};
export type NativeOperation = {
  txid: string;
  batchTransferIdx: number;
  entropy: string;
};
export type NativeRuntimeInfo = {
  version: string;
  sourceRevision: string;
  bridgeVersion: number;
  burn: boolean;
  consignment: boolean;
  bfa: boolean;
};
export type NativeAssetMetadata = {
  assetSchema: string;
  initialSupply: string;
  maxSupply: string;
  knownCirculatingSupply: string;
  timestamp: string;
  name: string;
  precision: number;
  ticker: string | null;
  details: string | null;
  rejectListUrl: string | null;
};
export type NativeIdentity = {
  id: string;
  network: string;
  masterFingerprint: string;
};

export interface Spec extends TurboModule {
  getRuntimeInfo(): Promise<NativeRuntimeInfo>;
  /**
   * Pass a mnemonic, public keys, or both (they must match). Public keys
   * without a mnemonic open the wallet watch-only.
   */
  openWallet(
    dataDir: string,
    network: string,
    mnemonic: string | null,
    accountXpubVanilla: string | null,
    accountXpubColored: string | null,
    masterFingerprint: string | null,
    witnessVersion: string,
    maxAllocationsPerUtxo: number,
    reuseAddresses: boolean
  ): Promise<string>;
  closeWallet(handle: string): Promise<void>;
  getWalletIdentity(handle: string): Promise<NativeIdentity>;
  goOnline(
    handle: string,
    indexerKind: string,
    indexerUrl: string,
    username: string | null,
    password: string | null,
    cookieFile: string | null,
    evmChainIds: string[],
    evmRpcUrls: string[],
    proxyEndpoints: string[],
    proxyAuthKeys: string[]
  ): Promise<void>;
  getAddress(handle: string, rotate: boolean): Promise<string>;
  getBtcBalance(
    handle: string,
    skipSync: boolean
  ): Promise<{ vanilla: NativeBalance; colored: NativeBalance }>;
  getAssetBalance(handle: string, assetId: string): Promise<NativeBalance>;
  listAssets(
    handle: string,
    filterAssetSchemas: string[]
  ): Promise<NativeAsset[]>;
  getAssetMetadata(
    handle: string,
    assetId: string
  ): Promise<NativeAssetMetadata>;
  listUnspents(handle: string, skipSync: boolean): Promise<NativeUnspent[]>;
  listTransactions(
    handle: string,
    skipSync: boolean
  ): Promise<NativeTransaction[]>;
  listTransfers(
    handle: string,
    assetId: string | null,
    txid: string | null
  ): Promise<NativeTransfer[]>;
  createUtxos(
    handle: string,
    upTo: boolean,
    num: number | null,
    size: number | null,
    feeRate: string,
    skipSync: boolean
  ): Promise<number>;
  sendBtc(
    handle: string,
    address: string,
    amount: string,
    feeRate: string,
    skipSync: boolean
  ): Promise<string>;
  receive(
    handle: string,
    witness: boolean,
    assetId: string | null,
    amount: string | null,
    expirationTimestamp: string,
    transportEndpoints: string[],
    minConfirmations: number,
    assignmentKind: string | null
  ): Promise<NativeReceive>;
  decodeInvoice(handle: string, invoice: string): Promise<NativeInvoice>;
  send(
    handle: string,
    invoice: string,
    assetId: string | null,
    amount: string | null,
    witnessAmountSat: string | null,
    witnessBlinding: string | null,
    donation: boolean,
    feeRate: string,
    minConfirmations: number,
    skipSync: boolean,
    senderTransportEndpoint: string
  ): Promise<NativeOperation>;
  issueAssetNia(
    handle: string,
    ticker: string,
    name: string,
    precision: number,
    amounts: string[]
  ): Promise<NativeAsset>;
  issueAssetCfa(
    handle: string,
    name: string,
    details: string | null,
    precision: number,
    amounts: string[],
    filePath: string | null
  ): Promise<NativeAsset>;
  issueAssetUda(
    handle: string,
    ticker: string,
    name: string,
    details: string | null,
    precision: number,
    mediaFilePath: string | null,
    attachmentsFilePaths: string[]
  ): Promise<NativeAsset>;
  issueAssetIfa(
    handle: string,
    ticker: string,
    name: string,
    precision: number,
    amounts: string[],
    inflationAmounts: string[],
    rejectListUrl: string | null
  ): Promise<NativeAsset>;
  inflate(
    handle: string,
    assetId: string,
    amounts: string[],
    feeRate: string,
    minConfirmations: number
  ): Promise<NativeOperation>;
  burn(
    handle: string,
    assetId: string,
    amount: string,
    burnReason: string | null,
    feeRate: string,
    minConfirmations: number
  ): Promise<NativeOperation>;
  getConsignment(
    handle: string,
    assetId: string,
    txid: string
  ): Promise<string>;
  getConsignmentPath(
    handle: string,
    assetId: string,
    txid: string
  ): Promise<string>;
  failTransfers(
    handle: string,
    batchTransferIdx: number | null,
    noAssetOnly: boolean,
    skipSync: boolean
  ): Promise<boolean>;
  refresh(
    handle: string,
    skipSync: boolean
  ): Promise<
    {
      batchTransferIdx: number;
      updatedStatus: string | null;
      failure: { name: string; message: string } | null;
    }[]
  >;
  deleteTransfers(
    handle: string,
    batchTransferIdx: number | null,
    noAssetOnly: boolean
  ): Promise<boolean>;
  drainTo(handle: string, address: string, feeRate: string): Promise<string>;
  /** Resolves the indexer protocol: `electrum`, `esplora` or `bitcoind`. */
  checkIndexerUrl(handle: string, indexerUrl: string): Promise<string>;
  sync(handle: string): Promise<void>;
  estimateFeeRate(handle: string, blocks: number): Promise<number>;
  getNetworkInfo(
    handle: string
  ): Promise<{ network: string; blockHeight: number | null }>;
  backup(handle: string, backupPath: string, password: string): Promise<void>;
  restoreBackup(
    backupPath: string,
    password: string,
    dataDir: string
  ): Promise<void>;
}

// Optional modules must not prevent an RLN-only application from importing the SDK.
export default TurboModuleRegistry.get<Spec>('RgbLib');
