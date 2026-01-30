/**
 * IWalletManager - Unified interface for WalletManager implementations
 * 
 * This interface defines the contract that all WalletManager implementations must follow
 * for cross-platform compatibility.
 * 
 * All methods are async to support native module requirements.
 * Synchronous implementations should wrap operations in Promise.resolve().
 * 
 * Type Standards:
 * - All enum-like types use PascalCase: 'RgbSend', 'WaitingCounterparty', 'Nia', etc.
 * - Network identifiers use lowercase: 'mainnet', 'testnet', 'regtest', 'signet', 'testnet4'
 * - Transaction types: 'RgbSend' | 'Drain' | 'CreateUtxos' | 'User'
 * - Transfer status: 'WaitingCounterparty' | 'WaitingConfirmations' | 'Settled' | 'Failed'
 * - Transfer kind: 'Issuance' | 'ReceiveBlind' | 'ReceiveWitness' | 'Send' | 'Inflation'
 * - Asset schemas: 'Nia' | 'Uda' | 'Cfa' | 'Ifa'
 * - Assignment types: 'Fungible' | 'NonFungible' | 'InflationRight' | 'ReplaceRight' | 'Any'
 */

import type {
  CreateUtxosBeginRequestModel,
  CreateUtxosEndRequestModel,
  FailTransfersRequest,
  InvoiceRequest,
  InvoiceReceiveData,
  IssueAssetNiaRequestModel,
  IssueAssetIfaRequestModel,
  SendAssetBeginRequestModel,
  SendAssetEndRequestModel,
  SendResult,
  BtcBalance,
  Unspent,
  WalletBackupResponse,
  SendBtcBeginRequestModel,
  SendBtcEndRequestModel,
  GetFeeEstimationResponse,
  InflateAssetIfaRequestModel,
  InflateEndRequestModel,
  OperationResult,
  AssetNIA,
  AssetBalance,
  ListAssets,
  Transaction,
  Transfer,
  InvoiceData,
} from '../types/rgb-model';
import type { EstimateFeeResult, Network } from '../crypto';

/**
 * Wallet initialization parameters
 * 
 * @param network - Network identifier: 'mainnet' | 'testnet' | 'testnet4' | 'regtest' | 'signet' (lowercase)
 *                   or network number (0 for mainnet, 1 for testnet, etc.)
 */
export interface WalletInitParams {
  xpubVan: string;
  xpubCol: string;
  mnemonic?: string;
  seed?: Uint8Array;
  network?: string | number;
  xpub?: string;
  masterFingerprint: string;
  transportEndpoint?: string;
  indexerUrl?: string;
  dataDir?: string;
}

/**
 * Unified WalletManager interface for cross-platform compatibility
 * 
 * This interface ensures all implementations provide the same API surface,
 * allowing clients to switch between implementations based on environment.
 */
export interface IWalletManager {
  // ============================================
  // Initialization & Lifecycle
  // ============================================

  /**
   * Initialize the wallet and establish online connection
   * Must be called before performing operations that require network access.
   * 
   * @returns Promise that resolves when initialization is complete
   * @throws {WalletError} if initialization fails
   * 
   * NOTE: Some implementations require this method to be called explicitly,
   *       while others may initialize automatically in the constructor.
   */
  initialize(): Promise<void>;

  /**
   * Connect the wallet to an online indexer service for syncing and transaction operations.
   * Must be called before performing operations that require network connectivity.
   * 
   * @param indexerUrl - The URL of the RGB indexer service to connect to
   * @param skipConsistencyCheck - If true, skips the consistency check with the indexer (default: false)
   * @returns Promise that resolves when the wallet is successfully connected online
   * @throws {WalletError} if connection fails
   */
  goOnline(indexerUrl: string, skipConsistencyCheck?: boolean): Promise<void>;

  /**
   * Get wallet's extended public keys
   * @returns Object containing vanilla and colored extended public keys
   */
  getXpub(): { xpubVan: string; xpubCol: string };

  /**
   * Get wallet's network
   * @returns Network identifier
   */
  getNetwork(): Network;

  /**
   * Dispose of sensitive wallet data
   * Clears mnemonic and seed from memory, closes connections
   * Idempotent - safe to call multiple times
   * 
   * @returns Promise that resolves when disposal is complete
   */
  dispose(): Promise<void>;

  /**
   * Check if wallet has been disposed
   * @returns true if wallet has been disposed, false otherwise
   */
  isDisposed(): boolean;

  // ============================================
  // Wallet Registration & Basic Info
  // ============================================

  /**
   * Register wallet and get initial address and balance
   * This is typically called once after wallet creation
   * 
   * @returns Promise resolving to address and BTC balance
   */
//   registerWallet(): Promise<{ address: string; btcBalance: BtcBalance }>;

  /**
   * Get current BTC balance
   * @returns Promise resolving to BTC balance information
   */
  getBtcBalance(): Promise<BtcBalance>;

  /**
   * Get wallet's receiving address
   * @returns Promise resolving to Bitcoin address string
   */
  getAddress(): Promise<string>;

  // ============================================
  // UTXO Management
  // ============================================

  /**
   * List all unspent transaction outputs (UTXOs)
   * @returns Promise resolving to array of unspent outputs
   */
  listUnspents(): Promise<Unspent[]>;

  /**
   * Begin creating UTXOs (first step of two-step process)
   * @param params - UTXO creation parameters
   * @returns Promise resolving to base64-encoded PSBT that needs to be signed
   */
  createUtxosBegin(params: CreateUtxosBeginRequestModel): Promise<string>;

  /**
   * Complete UTXO creation (second step after signing)
   * @param params - Signed PSBT from createUtxosBegin
   * @returns Promise resolving to number of UTXOs created
   */
  createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number>;

  /**
   * Complete UTXO creation flow: begin → sign → end
   * Convenience method that combines createUtxosBegin, signing, and createUtxosEnd
   * 
   * @param params - UTXO creation parameters
   * @returns Promise resolving to number of UTXOs created
   */
  createUtxos(params: {
    upTo?: boolean;
    num?: number;
    size?: number;
    feeRate?: number;
  }): Promise<number>;

  // ============================================
  // Asset Operations
  // ============================================

  /**
   * List all assets in the wallet
   * Returns assets grouped by schema (NIA, UDA, CFA, IFA)
   * @returns Promise resolving to assets information grouped by schema
   */
  listAssets(): Promise<ListAssets>;

  /**
   * Get balance for a specific asset
   * @param asset_id - Asset identifier
   * @returns Promise resolving to asset balance information
   */
  getAssetBalance(asset_id: string): Promise<AssetBalance>;

  /**
   * Issue a new NIA (Non-Inflatable Asset)
   * @param params - Asset issuance parameters
   * @returns Promise resolving to issued asset information
   */
  issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA>;

  /**
   * Issue a new IFA (Inflatable Fungible Asset)
   * @param params - Asset issuance parameters
   * @returns Promise resolving to issued asset information
   */
  issueAssetIfa(params: IssueAssetIfaRequestModel): Promise<any>;

  /**
   * Begin asset inflation (first step of two-step process)
   * @param params - Inflation parameters
   * @returns Promise resolving to base64-encoded PSBT that needs to be signed
   */
  inflateBegin(params: InflateAssetIfaRequestModel): Promise<string>;

  /**
   * Complete asset inflation (second step after signing)
   * @param params - Signed PSBT from inflateBegin
   * @returns Promise resolving to operation result
   */
  inflateEnd(params: InflateEndRequestModel): Promise<OperationResult>;

  /**
   * Complete inflation flow: begin → sign → end
   * Convenience method that combines inflateBegin, signing, and inflateEnd
   * 
   * @param params - Inflation parameters
   * @param mnemonic - Optional mnemonic for signing (uses wallet's mnemonic if not provided)
   * @returns Promise resolving to operation result
   */
  inflate(params: InflateAssetIfaRequestModel, mnemonic?: string): Promise<OperationResult>;

  // ============================================
  // Sending Assets
  // ============================================

  /**
   * Begin sending assets (first step of two-step process)
   * @param params - Send parameters including invoice
   * @returns Promise resolving to base64-encoded PSBT that needs to be signed
   */
  sendBegin(params: SendAssetBeginRequestModel): Promise<string>;

  /**
   * Complete sending assets (second step after signing)
   * @param params - Signed PSBT from sendBegin
   * @returns Promise resolving to send result with txid
   */
  sendEnd(params: SendAssetEndRequestModel): Promise<SendResult>;

  /**
   * Complete send flow: begin → sign → end
   * Convenience method that combines sendBegin, signing, and sendEnd
   * 
   * @param invoiceTransfer - Send parameters including invoice
   * @param mnemonic - Optional mnemonic for signing (uses wallet's mnemonic if not provided)
   * @returns Promise resolving to send result with txid
   */
  send(invoiceTransfer: SendAssetBeginRequestModel, mnemonic?: string): Promise<SendResult>;

  // ============================================
  // Sending BTC
  // ============================================

  /**
   * Begin sending BTC (first step of two-step process)
   * @param params - Send BTC parameters
   * @returns Promise resolving to base64-encoded PSBT that needs to be signed
   */
  sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string>;

  /**
   * Complete sending BTC (second step after signing)
   * @param params - Signed PSBT from sendBtcBegin
   * @returns Promise resolving to transaction ID
   */
  sendBtcEnd(params: SendBtcEndRequestModel): Promise<string>;

  /**
   * Complete BTC send flow: begin → sign → end
   * Convenience method that combines sendBtcBegin, signing, and sendBtcEnd
   * 
   * @param params - Send BTC parameters
   * @returns Promise resolving to transaction ID
   */
  sendBtc(params: SendBtcBeginRequestModel): Promise<string>;

  // ============================================
  // Receiving Assets
  // ============================================

  /**
   * Generate blind receive invoice
   * Creates an invoice for receiving assets without revealing the amount
   * 
   * @param params - Invoice generation parameters including assignment type
   *                 Assignment types: 'Fungible' | 'NonFungible' | 'InflationRight' | 'ReplaceRight' | 'Any'
   * @returns Promise resolving to invoice data including invoice string
   */
  blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData>;

  /**
   * Generate witness receive invoice
   * Creates an invoice for receiving assets with amount visible
   * 
   * @param params - Invoice generation parameters including assignment type
   *                 Assignment types: 'Fungible' | 'NonFungible' | 'InflationRight' | 'ReplaceRight' | 'Any'
   * @returns Promise resolving to invoice data including invoice string
   */
  witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData>;

  /**
   * Decode RGB invoice
   * Extracts information from an RGB invoice string
   * 
   * @param params - Invoice string to decode
   * @returns Promise resolving to decoded invoice data including recipientId, assetSchema, assignment, etc.
   */
  decodeRGBInvoice(params: { invoice: string }): Promise<InvoiceData>;

  // ============================================
  // Transaction & Transfer Management
  // ============================================

  /**
   * List all transactions
   * @returns Promise resolving to array of transactions
   * Each transaction includes transactionType ('RgbSend' | 'Drain' | 'CreateUtxos' | 'User'),
   * txid, received/sent amounts, fee, and optional confirmationTime
   */
  listTransactions(): Promise<Transaction[]>;

  /**
   * List transfers for a specific asset or all assets
   * @param asset_id - Optional asset identifier (lists all if not provided)
   * @returns Promise resolving to array of transfers
   * Each transfer includes status ('WaitingCounterparty' | 'WaitingConfirmations' | 'Settled' | 'Failed'),
   * kind ('Issuance' | 'ReceiveBlind' | 'ReceiveWitness' | 'Send' | 'Inflation'),
   * assignments, and transport endpoints
   */
  listTransfers(asset_id?: string): Promise<Transfer[]>;

  /**
   * Mark transfers as failed
   * @param params - Transfer failure parameters
   * @returns Promise resolving to boolean indicating success
   */
  failTransfers(params: FailTransfersRequest): Promise<boolean>;

  /**
   * Refresh wallet state
   * Syncs wallet with the network and updates internal state
   * 
   * @returns Promise that resolves when refresh is complete
   */
  refreshWallet(): Promise<void>;

  /**
   * Sync wallet with network
   * Performs a full synchronization with the indexer
   * 
   * @returns Promise that resolves when sync is complete
   */
  syncWallet(): Promise<void>;

  // ============================================
  // Fee Estimation
  // ============================================

  /**
   * Estimate fee rate for a given number of blocks
   * @param blocks - Number of blocks for fee estimation
   * @returns Promise resolving to fee estimation response
   */
  estimateFeeRate(blocks: number): Promise<GetFeeEstimationResponse>;

  /**
   * Estimate fee for a specific PSBT
   * @param psbtBase64 - Base64-encoded PSBT
   * @returns Promise resolving to fee estimation result
   */
  estimateFee(psbtBase64: string): Promise<EstimateFeeResult>;

  // ============================================
  // Backup & Restore
  // ============================================

  /**
   * Create wallet backup
   * @param params - Backup parameters including path and password
   * @returns Promise resolving to backup response
   */
  createBackup(params: { backupPath: string; password: string }): Promise<WalletBackupResponse>;

  // ============================================
  // Cryptographic Operations
  // ============================================

  /**
   * Sign a PSBT using the wallet's mnemonic or a provided mnemonic
   * @param psbt - Base64 encoded PSBT
   * @param mnemonic - Optional mnemonic (uses wallet's mnemonic if not provided)
   * @returns Promise resolving to signed PSBT (base64-encoded)
   */
  signPsbt(psbt: string, mnemonic?: string): Promise<string>;

  /**
   * Sign a message using Schnorr signature
   * @param message - Message to sign
   * @returns Promise resolving to signature string
   */
  signMessage(message: string): Promise<string>;

  /**
   * Verify a Schnorr message signature
   * @param message - Original message
   * @param signature - Signature to verify
   * @param accountXpub - Optional account xpub (uses wallet's xpubVan if not provided)
   * @returns Promise resolving to boolean indicating if signature is valid
   */
  verifyMessage(message: string, signature: string, accountXpub?: string): Promise<boolean>;
}

