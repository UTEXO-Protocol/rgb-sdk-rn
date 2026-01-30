export type BitcoinNetwork =
  | 'mainnet'
  | 'testnet'
  | 'testnet4'
  | 'regtest'
  | 'signet';

export const BitcoinNetwork = {
  MAINNET: 'mainnet' as const,
  TESTNET: 'testnet' as const,
  TESTNET4: 'testnet4' as const,
  REGTEST: 'regtest' as const,
  SIGNET: 'signet' as const,
} as const;

export type Keys = {
  mnemonic: string;
  xpub: string;
  accountXpubVanilla: string;
  accountXpubColored: string;
  masterFingerprint: string;
};

export type Balance = {
  settled: number;
  future: number;
  spendable: number;
};

export type BtcBalance = {
  vanilla: Balance;
  colored: Balance;
};

export type AssetSchema = 'Nia' | 'Uda' | 'Cfa' | 'Ifa';

export const AssetSchema = {
  NIA: 'Nia' as const,
  UDA: 'Uda' as const,
  CFA: 'Cfa' as const,
  IFA: 'Ifa' as const,
} as const;

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

export type Outpoint = {
  txid: string;
  vout: number;
};

export type Utxo = {
  outpoint: Outpoint;
  btcAmount: number;
  colorable: boolean;
  exists: boolean;
};

export type RgbAllocation = {
  assetId?: string;
  assignment: Assignment;
  settled: boolean;
};

export type RefreshTransferStatus =
  | 'WaitingCounterparty'
  | 'WaitingConfirmations';

export type RefreshFilter = {
  status: RefreshTransferStatus;
  incoming: boolean;
};

export type WitnessData = {
  amountSat: number;
  blinding?: number;
};

export type Recipient = {
  recipientId: string;
  witnessData?: WitnessData;
  assignment: Assignment;
  transportEndpoints: string[];
};

export type Media = {
  filePath: string;
  mime: string;
  digest: string;
};

export type AssetCfa = {
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

export type AssetIfa = {
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

export type AssetNia = {
  assetId: string;
  ticker: string;
  name: string;
  details?: string;
  precision: number;
  issuedSupply: number;
  timestamp: number;
  addedAt: number;
  balance: Balance;
  media?: Media;
};

export type AssetUda = {
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

export type Assets = {
  nia: AssetNia[];
  uda: AssetUda[];
  cfa: AssetCfa[];
  ifa: AssetIfa[];
};

export type OperationResult = {
  txid: string;
  batchTransferIdx: number;
};

export type ReceiveData = {
  invoice: string;
  recipientId: string;
  expirationTimestamp: number | null;
  batchTransferIdx: number;
};

export type InvoiceData = {
  invoice: string;
  recipientId: string;
  assetSchema?: AssetSchema;
  assetId?: string;
  assignment: Assignment;
  assignmentName?: string;
  network: BitcoinNetwork;
  expirationTimestamp: number | null;
  transportEndpoints: string[];
};

export type Transaction = {
  transactionType: 'RgbSend' | 'Drain' | 'CreateUtxos' | 'User';
  txid: string;
  received: number;
  sent: number;
  fee: number;
  confirmationTime?: number;
};

export type TransferTransportEndpoint = {
  endpoint: string;
  used: boolean;
  transportType: string;
};

export type Transfer = {
  idx: number;
  batchTransferIdx: number;
  createdAt: number;
  updatedAt: number;
  kind: 'Issuance' | 'ReceiveBlind' | 'ReceiveWitness' | 'Send' | 'Inflation';
  status:
    | 'WaitingCounterparty'
    | 'WaitingConfirmations'
    | 'Settled'
    | 'Failed';
  txid?: string;
  recipientId?: string;
  requestedAssignment?: Assignment;
  assignments: Assignment[];
  receiveUtxo?: Outpoint;
  changeUtxo?: Outpoint;
  expiration?: number;
  transportEndpoints: TransferTransportEndpoint[];
  invoiceString?: string;
  consignmentPath?: string;
};

export type Unspent = {
  utxo: Utxo;
  rgbAllocations: RgbAllocation[];
  pendingBlinded: number;
};

export type RefreshedTransfer = {
  updatedStatus?:
    | 'WaitingCounterparty'
    | 'WaitingConfirmations'
    | 'Settled'
    | 'Failed';
  failure?: string;
};

export type WalletData = {
  dataDir: string;
  bitcoinNetwork: string;
  databaseType: string;
  maxAllocationsPerUtxo: number;
  accountXpubVanilla: string;
  accountXpubColored: string;
  mnemonic?: string;
  masterFingerprint: string;
  vanillaKeychain?: number;
  supportedSchemas: string[];
};

export type AssetMetadata = {
  assetId: string;
  name: string;
  ticker?: string;
  details?: string;
  precision?: number;
  issuedSupply?: number;
  timestamp?: number;
  amounts?: number[];
  assetNia?: AssetNia;
  assetUda?: AssetUda;
  assetCfa?: AssetCfa;
  assetIfa?: AssetIfa;
};

/**
 * Error types that can be returned by RGB library methods.
 * These correspond to the RgbLibError
 * Errors with associated values are represented as objects with the error name and associated data.
 */
export type RgbLibErrors =
  | 'AllocationsAlreadyAvailable'
  | { type: 'AssetNotFound'; assetId: string }
  | { type: 'BatchTransferNotFound'; idx: number }
  | 'BitcoinNetworkMismatch'
  | 'CannotChangeOnline'
  | 'CannotDeleteBatchTransfer'
  | 'CannotEstimateFees'
  | 'CannotFailBatchTransfer'
  | 'CannotFinalizePsbt'
  | 'CannotUseIfaOnMainnet'
  | { type: 'EmptyFile'; filePath: string }
  | { type: 'FailedBdkSync'; details: string }
  | { type: 'FailedBroadcast'; details: string }
  | { type: 'FailedIssuance'; details: string }
  | { type: 'FileAlreadyExists'; path: string }
  | 'FingerprintMismatch'
  | { type: 'Io'; details: string }
  | { type: 'Inconsistency'; details: string }
  | { type: 'Indexer'; details: string }
  | 'InexistentDataDir'
  | 'InsufficientAllocationSlots'
  | { type: 'InsufficientAssignments'; assetId: string; available: unknown }
  | { type: 'InsufficientBitcoins'; needed: number; available: number }
  | { type: 'Internal'; details: string }
  | { type: 'InvalidAddress'; details: string }
  | 'InvalidAmountZero'
  | { type: 'InvalidAssetId'; assetId: string }
  | 'InvalidAssignment'
  | { type: 'InvalidAttachments'; details: string }
  | 'InvalidBitcoinKeys'
  | { type: 'InvalidBitcoinNetwork'; network: string }
  | { type: 'InvalidColoringInfo'; details: string }
  | 'InvalidConsignment'
  | { type: 'InvalidDetails'; details: string }
  | { type: 'InvalidElectrum'; details: string }
  | 'InvalidEstimationBlocks'
  | { type: 'InvalidFeeRate'; details: string }
  | { type: 'InvalidFilePath'; filePath: string }
  | 'InvalidFingerprint'
  | { type: 'InvalidIndexer'; details: string }
  | { type: 'InvalidInvoice'; details: string }
  | { type: 'InvalidMnemonic'; details: string }
  | { type: 'InvalidName'; details: string }
  | { type: 'InvalidPrecision'; details: string }
  | { type: 'InvalidProxyProtocol'; version: string }
  | { type: 'InvalidPsbt'; details: string }
  | { type: 'InvalidPubkey'; details: string }
  | { type: 'InvalidRecipientData'; details: string }
  | 'InvalidRecipientId'
  | 'InvalidRecipientNetwork'
  | { type: 'InvalidRejectListUrl'; details: string }
  | { type: 'InvalidTicker'; details: string }
  | { type: 'InvalidTransportEndpoint'; details: string }
  | { type: 'InvalidTransportEndpoints'; details: string }
  | 'InvalidTxid'
  | 'InvalidVanillaKeychain'
  | { type: 'MaxFeeExceeded'; txid: string }
  | { type: 'MinFeeNotMet'; txid: string }
  | { type: 'Network'; details: string }
  | 'NoConsignment'
  | 'NoInflationAmounts'
  | 'NoIssuanceAmounts'
  | 'NoSupportedSchemas'
  | 'NoValidTransportEndpoint'
  | 'Offline'
  | 'OnlineNeeded'
  | 'OutputBelowDustLimit'
  | { type: 'Proxy'; details: string }
  | 'RecipientIdAlreadyUsed'
  | 'RecipientIdDuplicated'
  | { type: 'RejectListService'; details: string }
  | { type: 'RestClientBuild'; details: string }
  | 'TooHighInflationAmounts'
  | 'TooHighIssuanceAmounts'
  | { type: 'UnknownRgbSchema'; schemaId: string }
  | { type: 'UnknownTransfer'; txid: string }
  | { type: 'UnsupportedBackupVersion'; version: string }
  | { type: 'UnsupportedInflation'; assetSchema: string }
  | { type: 'UnsupportedLayer1'; layer1: string }
  | { type: 'UnsupportedSchema'; assetSchema: string }
  | 'UnsupportedTransportType'
  | { type: 'WalletDirAlreadyExists'; path: string }
  | 'WatchOnly'
  | 'WrongPassword';

/**
 * Constants for all RGB library errors.
 * Use these for error code comparison and type safety.
 */
export const RgbLibErrors = {
  AllocationsAlreadyAvailable: 'AllocationsAlreadyAvailable' as const,
  BitcoinNetworkMismatch: 'BitcoinNetworkMismatch' as const,
  CannotChangeOnline: 'CannotChangeOnline' as const,
  CannotDeleteBatchTransfer: 'CannotDeleteBatchTransfer' as const,
  CannotEstimateFees: 'CannotEstimateFees' as const,
  CannotFailBatchTransfer: 'CannotFailBatchTransfer' as const,
  CannotFinalizePsbt: 'CannotFinalizePsbt' as const,
  CannotUseIfaOnMainnet: 'CannotUseIfaOnMainnet' as const,
  FingerprintMismatch: 'FingerprintMismatch' as const,
  InexistentDataDir: 'InexistentDataDir' as const,
  InsufficientAllocationSlots: 'InsufficientAllocationSlots' as const,
  InvalidAmountZero: 'InvalidAmountZero' as const,
  InvalidAssignment: 'InvalidAssignment' as const,
  InvalidBitcoinKeys: 'InvalidBitcoinKeys' as const,
  InvalidConsignment: 'InvalidConsignment' as const,
  InvalidEstimationBlocks: 'InvalidEstimationBlocks' as const,
  InvalidFingerprint: 'InvalidFingerprint' as const,
  InvalidRecipientId: 'InvalidRecipientId' as const,
  InvalidRecipientNetwork: 'InvalidRecipientNetwork' as const,
  InvalidTxid: 'InvalidTxid' as const,
  InvalidVanillaKeychain: 'InvalidVanillaKeychain' as const,
  NoConsignment: 'NoConsignment' as const,
  NoInflationAmounts: 'NoInflationAmounts' as const,
  NoIssuanceAmounts: 'NoIssuanceAmounts' as const,
  NoSupportedSchemas: 'NoSupportedSchemas' as const,
  NoValidTransportEndpoint: 'NoValidTransportEndpoint' as const,
  Offline: 'Offline' as const,
  OnlineNeeded: 'OnlineNeeded' as const,
  OutputBelowDustLimit: 'OutputBelowDustLimit' as const,
  RecipientIdAlreadyUsed: 'RecipientIdAlreadyUsed' as const,
  RecipientIdDuplicated: 'RecipientIdDuplicated' as const,
  TooHighInflationAmounts: 'TooHighInflationAmounts' as const,
  TooHighIssuanceAmounts: 'TooHighIssuanceAmounts' as const,
  UnsupportedTransportType: 'UnsupportedTransportType' as const,
  WatchOnly: 'WatchOnly' as const,
  WrongPassword: 'WrongPassword' as const,
} as const;

