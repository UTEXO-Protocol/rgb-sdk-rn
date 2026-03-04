/**
 * Network address representation
 */
export type NetworkAddress = {
  /** Address string */
  address: string;
  /** Network name (optional) */
  networkName?: string;
  /** Network ID */
  networkId: number;
};

/**
 * Types of transfers
 */
export type TransferType = 'LP' | 'WU' | 'CCTP' | 'NTV' | 'MLT';

/**
 * Estimation data for transfer calculations
 */
export type Estimation = {
  /** Expected converted gas fee for this transfer in transferring token */
  fee?: string;
  /** Stable fee percent */
  feePercentage?: string;
  /** Estimated confirmation time */
  estimatedConfirmationTime: string;
  /** Stable fee in transferring token */
  stableFee?: string;
  /** Result amount */
  resultAmount: string;
  /** Expected converted gas fee for this transfer in sender native token (for multitoken transfers) */
  nativeFee?: string;
  /** Expected converted stable fee for this transfer in sender native token (for multitoken transfers) */
  nativeStableFee?: string;
  /** Sum of NativeFee and NativeStableFee if present */
  totalNativeCommission?: string;
  /** Native token symbol if present (for multi-token transfer estimation) */
  nativeTokenSymbol?: string;
  /** Amount in the smallest token units in recipient tokens, which user will receive */
  swapResultAmount?: string;
};

/**
 * Request to get bridge-in signature
 */
export type BridgeInSignatureRequest = {
  /** Sender network address */
  sender: NetworkAddress;
  /** Token ID */
  tokenId: number;
  /** Amount to transfer (as string) */
  amount: string;
  /** Destination network address */
  destination: NetworkAddress;
  /** Additional addresses (optional) */
  additionalAddresses?: string[];
};

/**
 * Response containing bridge-in signature data
 */
export type BridgeInSignatureResponse = {
  /** Token address */
  token: string;
  /** Amount to transfer */
  amount: string;
  /** Gas commission */
  gasCommission: string;
  /** Destination network address */
  destination: NetworkAddress;
  /** Transaction deadline */
  deadline: string;
  /** Nonce value */
  nonce: number;
  /** Transfer ID */
  transferId: number;
  /** Signature for the transaction */
  signature: string;
  /** Transfer type */
  transferType: TransferType;
  /** Estimation data */
  estimation: Estimation;
  /** Total commission */
  totalCommission: string;
  /** Recipient amount */
  recipientAmount?: string;
};

/**
 * Request to submit a transaction
 */
export type SubmitTransactionRequest = {
  /** Transfer ID */
  transferId: number;
  /** Network ID */
  networkId: number;
  /** Transaction data (base64 encoded for Bitcoin/Concordium, hex for others) */
  txData: string;
  /** Public key */
  publicKey: string;
  /** Authentication signature (hex encoded) */
  authenticationSignature: string;
};

/**
 * Response from submit transaction
 */
export type SubmitTransactionResponse = {
  /** Transaction hash */
  txHash: string;
};

/**
 * Request to verify bridge-in transaction
 */
export type VerifyBridgeInRequest = {
  /** Transfer ID */
  transferId: number;
  /** Network ID */
  networkId: number;
  /** Transaction hash */
  txHash: string;
  /** Public key */
  publicKey: string;
  /** Authentication signature (hex encoded) */
  authenticationSignature: string;
};

/**
 * Response from receiver invoice endpoint
 */
export type ReceiverInvoiceResponse = {
  /** Invoice string */
  invoice: string;
};

/**
 * Token information
 */
export type TokenInfo = {
  /** Token ID */
  id: number;
  /** Short name of the token */
  shortName: string;
  /** Long name of the token */
  longName: string;
  /** Icon link for the token */
  iconLink: string;
};

/**
 * Transaction hash information
 */
export type TransactionHash = {
  /** Network name */
  networkName: string;
  /** Transaction hash */
  hash: string;
};

/**
 * Response from transfer-by-mainnet-invoice endpoint
 */
export type TransferByMainnetInvoiceResponse = {
  /** Transfer ID */
  id: number;
  /** Sender amount */
  senderAmount: string;
  /** Recipient amount */
  recipientAmount: string;
  /** Commission amount */
  commission: string;
  /** Sender token information */
  senderToken: TokenInfo;
  /** Recipient token information */
  recipientToken: TokenInfo;
  /** Sender network address */
  sender: NetworkAddress;
  /** Recipient network address */
  recipient: NetworkAddress;
  /** Transfer status */
  status: string;
  /** Triggering transaction */
  triggeringTx: TransactionHash;
  /** Outbound transaction */
  outboundTx: TransactionHash;
  /** Creation timestamp */
  createdAt: string;
};

/**
 * API Error response
 */
export type ApiError = {
  error: string;
  code?: number;
};
