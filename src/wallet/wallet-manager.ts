import type {
  CreateUtxosBeginRequestModel,
  CreateUtxosEndRequestModel,
  FailTransfersRequest,
  InvoiceRequest,
  InvoiceReceiveData,
  InvoiceData,
  IssueAssetNiaRequestModel,
  SendAssetBeginRequestModel,
  SendAssetEndRequestModel,
  SendResult,
  AssetBalance,
  BtcBalance,
  Unspent,
  WalletBackupResponse,
  WalletRestoreResponse,
  RestoreWalletRequestModel,
  SendBtcBeginRequestModel,
  SendBtcEndRequestModel,
  GetFeeEstimationResponse,
  IssueAssetIfaRequestModel,
  InflateAssetIfaRequestModel,
  InflateEndRequestModel,
  OperationResult,
  ListAssets,
  AssignmentType,
  AssetNIA,
  AssetIFA,
  Transaction,
  Transfer
} from '../types/rgb-model';

import { signPsbt, signPsbtFromSeed, signMessage as signSchnorrMessage, verifyMessage as verifySchnorrMessage, estimatePsbt } from '../crypto';
import type { EstimateFeeResult, Network } from '../crypto';
// import { generateKeys } from '../crypto';
import { normalizeNetwork } from '../utils/validation';
import { ValidationError, WalletError } from '../errors';
// import { restoreWallet, RGBLibClient } from '../client/rgb-lib-client';
import { Wallet } from '../client/rgb-lib/Wallet';
import { BitcoinNetwork, decodeInvoice, generateKeys, restoreBackup } from '../client/rgb-lib';
import type { IWalletManager } from './IWalletManager';

/**
 * Restore wallet from backup
 * This should be called before creating a WalletManager instance
 * @param params - Restore parameters including backup file path, password, and restore directory
 * @returns Wallet restore response
 */
export const restoreFromBackup = async (params: RestoreWalletRequestModel): Promise<WalletRestoreResponse> => {
  const {
    backupFilePath,
    password,
    dataDir,
  } = params;

  if (!backupFilePath) {
    throw new ValidationError('backup file is required', 'backup');
  }
  if (!password) {
    throw new ValidationError('password is required', 'password');
  }
  if (!dataDir) {
    throw new ValidationError('restore directory is required', 'restoreDir');
  }

  await restoreBackup(
    backupFilePath,
    password
  );
  return {
    message: 'Wallet restored successfully',
  };
};

/**
 * Generate a new wallet with keys
 * @param network - Network string (default: 'regtest')
 * @returns Generated keys including mnemonic, xpubs, and master fingerprint
 */
export const createWallet = async (network: string = 'regtest') => {
  // return await generateKeys(network);
  const networkt = normalizeNetwork(network ?? 'regtest');
  console.log('networkt', networkt);
  return await generateKeys(BitcoinNetwork.REGTEST);
}

export type WalletInitParams = {

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
 * Wallet Manager - High-level wallet interface combining RGB API client and cryptographic operations
 * 
 * This class provides a unified interface for:
 * - RGB operations (via RGBLibClient - local rgb-lib)
 * - PSBT signing operations
 * - Wallet state management
 * 
 * @example
 * ```typescript
 * const keys = generateKeys('testnet');
 * const wallet = new WalletManager({
 *   xpubVan: keys.accountXpubVanilla,
 *   xpubCol: keys.accountXpubColored,
 *   masterFingerprint: keys.masterFingerprint,
 *   mnemonic: keys.mnemonic,
 *   network: 'testnet',
 *   transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
 *   indexerUrl: 'ssl://electrum.iriswallet.com:50013'
 * });
 * 
 * const balance = await wallet.getBtcBalance();
 * ```
 */
const DEFAULT_TRANSPORT_ENDPOINT = 'rpcs://proxy.iriswallet.com/0.2/json-rpc';

const defaultIndexerUrls: Record<Network, string> = {
  'mainnet': 'ssl://electrum.iriswallet.com:50003',
  'testnet': 'ssl://electrum.iriswallet.com:50013',
  'testnet4': 'ssl://electrum.iriswallet.com:50053',
  'signet': 'tcp://46.224.75.237:50001',
  'regtest': 'tcp://regtest.thunderstack.org:50001',
};
export class WalletManager implements IWalletManager {
  private readonly client: Wallet;
  // @ts-ignore
  private readonly xpub: string | null;
  private readonly xpubVan: string;
  private readonly xpubCol: string;
  private mnemonic: string | null;
  private seed: Uint8Array | null;
  private readonly network: Network;
  // private readonly masterFingerprint: string;
  private disposed: boolean = false;
  private readonly indexerUrl: string;
  // private readonly dataDir: string;
  private readonly transportEndpoint: string;
  constructor(params: WalletInitParams) {
    if (!params.xpubVan) {
      throw new ValidationError('xpubVan is required', 'xpubVan');
    }
    if (!params.xpubCol) {
      throw new ValidationError('xpubCol is required', 'xpubCol');
    }
    if (!params.masterFingerprint) {
      throw new ValidationError('masterFingerprint is required', 'masterFingerprint');
    }

    this.network = normalizeNetwork(params.network ?? 'regtest');


    this.xpubVan = params.xpubVan;
    this.xpubCol = params.xpubCol;
    this.seed = params.seed ?? null;
    this.mnemonic = params.mnemonic ?? null;
    this.xpub = params.xpub ?? null;
    // this.masterFingerprint = params.masterFingerprint;
    // Use provided dataDir or create a simple default path
    // In React Native, the native modules handle actual file system paths
    // this.dataDir = params.dataDir ?? `rgb-wallet/${this.masterFingerprint}`;
    this.transportEndpoint = params.transportEndpoint || DEFAULT_TRANSPORT_ENDPOINT;
    this.client = new Wallet(
      {
        mnemonic: params.mnemonic!,
        xpub: params.xpub!,
        accountXpubVanilla: params.xpubVan,
        accountXpubColored: params.xpubCol,
        masterFingerprint: params.masterFingerprint,
      },
      {
        network: BitcoinNetwork.REGTEST,
        supportedSchemas: ['Nia', 'Uda', 'Cfa'], // Optional, defaults to Cfa, Nia, Uda
        maxAllocationsPerUtxo: 1, // Optional, defaults to 1
        vanillaKeychain: 0, // Optional, defaults to 0
      }
    );

    this.indexerUrl = defaultIndexerUrls[this.network] || defaultIndexerUrls['regtest'];
  }

  public async initialize(): Promise<void> {
    await this.client.goOnline(this.indexerUrl, false);
  }

  public async goOnline(indexerUrl: string, skipConsistencyCheck: boolean = false): Promise<void> {
    await this.client.goOnline(indexerUrl, skipConsistencyCheck);
  }

  /**
   * Get wallet's extended public keys
   */
  public getXpub(): { xpubVan: string; xpubCol: string } {
    return {
      xpubVan: this.xpubVan,
      xpubCol: this.xpubCol
    };
  }

  /**
   * Get wallet's network
   */
  public getNetwork(): Network {
    return this.network;
  }

  /**
   * Dispose of sensitive wallet data
   * Clears mnemonic and seed from memory
   * Idempotent - safe to call multiple times
   */
  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    if (this.mnemonic !== null) {
      this.mnemonic = null;
    }

    if (this.seed !== null && this.seed.length > 0) {
      this.seed.fill(0);
      this.seed = null;
    }
    // await this.client.dropWallet();

    this.disposed = true;
  }

  /**
   * Check if wallet has been disposed
   */
  public isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Guard method to ensure wallet has not been disposed
   * @throws {WalletError} if wallet has been disposed
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new WalletError('Wallet has been disposed');
    }
  }

  // public async registerWallet(): Promise<{ address: string; btcBalance: BtcBalance }> {
  //   return await this.client.registerWallet();
  // }

  public async getBtcBalance(): Promise<BtcBalance> {
    return await this.client.getBtcBalance();
  }

  public async getAddress(): Promise<string> {
    return await this.client.getAddress();
  }

  public async listUnspents(): Promise<Unspent[]> {
    return await this.client.listUnspents(true);
  }

  public async listAssets(): Promise<ListAssets> {
    return await this.client.listAssets(['Nia', 'Uda', 'Cfa']);
  }

  public async getAssetBalance(asset_id: string): Promise<AssetBalance> {
    return await this.client.getAssetBalance(asset_id);
  }

  public async createUtxosBegin(params: CreateUtxosBeginRequestModel): Promise<string> {
    return await this.client.createUtxosBegin(params.upTo ?? true, params.num ?? null, params.size ?? null, params.feeRate ?? 1, false);
  }

  public async createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number> {
    return await this.client.createUtxosEnd(params.signedPsbt, false);
  }

  public async sendBegin(params: SendAssetBeginRequestModel): Promise<string> {

    if (!params.assetId) {
      throw new ValidationError('asset_id is required for send operation', 'asset_id');
    }
    let witnessData = null;
    if (params.witnessData && params.witnessData.amountSat) {
      witnessData = {
        amountSat: params.witnessData.amountSat,
        blinding: params.witnessData.blinding ? Number(params.witnessData.blinding) : null,
      };
    }
    const invoiceData = await decodeInvoice(params.invoice);
    const recipientId = invoiceData.recipientId;
    const assignment = invoiceData.assignment;
    const transportEndpoints = invoiceData.transportEndpoints;
    const donation = false;
    const recipientMap: Record<string, any[]> = {
      [params.assetId]: [{
        recipientId: recipientId,
        witnessData: witnessData,
        assignment: assignment,
        transportEndpoints: transportEndpoints,
      }],
    };

    return await this.client.sendBegin(recipientMap, donation, params.feeRate ?? 1, params.minConfirmations ?? 1);
  }

  public async sendEnd(params: SendAssetEndRequestModel): Promise<SendResult> {
    return await this.client.sendEnd(params.signedPsbt, params.skipSync ?? false);
  }

  public async sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string> {
    return await this.client.sendBtcBegin(params.address, params.amount, params.feeRate ?? 1, params.skipSync ?? false);
  }

  public async sendBtcEnd(params: SendBtcEndRequestModel): Promise<string> {
    return await this.client.sendBtcEnd(params.signedPsbt, params.skipSync ?? false);
  }

  public async estimateFeeRate(blocks: number): Promise<GetFeeEstimationResponse> {
    if (!Number.isFinite(blocks)) {
      throw new ValidationError('blocks must be a finite number', 'blocks');
    }
    if (!Number.isInteger(blocks) || blocks <= 0) {
      throw new ValidationError('blocks must be a positive integer', 'blocks');
    }

    return await this.client.getFeeEstimation(blocks);
  }

  public async estimateFee(psbtBase64: string): Promise<EstimateFeeResult> {
    return await estimatePsbt(psbtBase64);
  }

  public async sendBtc(params: SendBtcBeginRequestModel): Promise<string> {
    this.ensureNotDisposed();
    const psbt = await this.sendBtcBegin(params);
    const signed = await this.signPsbt(psbt);
    return await this.sendBtcEnd({ signedPsbt: signed });
  }

  public async blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    const assignment = {
      type: 'Fungible' as AssignmentType,
      amount: params.amount,
    };
    const transportEndpoints: string[] = [this.transportEndpoint];
    return await this.client.blindReceive(params.assetId,assignment, params.durationSeconds??2000, transportEndpoints, params.minConfirmations??1);
  }

  public async witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    const assignment = {
      type: 'Fungible' as AssignmentType,
      amount: params.amount,
    };
    const transportEndpoints: string[] = [this.transportEndpoint];
    return await this.client.witnessReceive(params.assetId,assignment, params.durationSeconds??2000, transportEndpoints, params.minConfirmations??1);
  }

  public async issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA> {

    return await this.client.issueAssetNia(params.ticker, params.name, params.precision, params.amounts);
  }

  public async issueAssetIfa(params: IssueAssetIfaRequestModel): Promise<AssetIFA> {
    return await this.client.issueAssetIfa(params.ticker, params.name, params.precision, params.amounts, params.inflationAmounts, params.replaceRightsNum, params.rejectListUrl);
  }

  public async inflateBegin(params: InflateAssetIfaRequestModel): Promise<string> {
    return await this.client.inflateBegin(params.assetId, params.inflationAmounts, params.feeRate??1, params.minConfirmations??1);
  }

  public async inflateEnd(params: InflateEndRequestModel): Promise<OperationResult> {
    return await this.client.inflateEnd(params.signedPsbt);
  }

  /**
   * Complete inflate operation: begin → sign → end
   * @param params - Inflate parameters
   * @param mnemonic - Optional mnemonic for signing
   */
  public async inflate(params: InflateAssetIfaRequestModel, mnemonic?: string): Promise<OperationResult> {
    this.ensureNotDisposed();
    const psbt = await this.inflateBegin(params);
    const signedPsbt = await this.signPsbt(psbt, mnemonic);
    return await this.inflateEnd({
      signedPsbt
    });
  }

  public async refreshWallet(): Promise<void> {
    await this.client.refresh(null, [], false);
  }

  public async listTransactions(): Promise<Transaction[]> {
    const nativeTransactions = await this.client.listTransactions(false);
    // Map Interfaces.Transaction to rgb-model.Transaction format
    return nativeTransactions.map((tx) => ({
      transactionType: tx.transactionType,
      txid: tx.txid,
      received: tx.received,
      sent: tx.sent,
      fee: tx.fee,
      confirmationTime: tx.confirmationTime
        ? { height: 0, timestamp: tx.confirmationTime }
        : undefined,
    }));
  }

  public async listTransfers(asset_id?: string): Promise<Transfer[]> {
    return await this.client.listTransfers(asset_id ?? null);
  }

  public async failTransfers(params: FailTransfersRequest): Promise<boolean> {
    return await this.client.failTransfers(
      params.batchTransferIdx ?? null,
      params.noAssetOnly ?? false,
      false
    );
  }

  public async decodeRGBInvoice(
    params: { invoice: string }
  ): Promise<InvoiceData> {
    const result = await decodeInvoice(params.invoice);
    // Convert Interfaces.InvoiceData to rgb-model.InvoiceData
    return result as InvoiceData;
  }

  public async createBackup(params: { backupPath: string, password: string }): Promise<WalletBackupResponse> {
      this.client.backup(params.backupPath,params.password);
      return {
        message: 'Backup created successfully',
        backupPath: params.backupPath,
      };
  }

  /**
   * Sign a PSBT using the wallet's mnemonic or a provided mnemonic
   * @param psbt - Base64 encoded PSBT
   * @param mnemonic - Optional mnemonic (uses wallet's mnemonic if not provided)
   */
  public async signPsbt(psbt: string, mnemonic?: string): Promise<string> {
    this.ensureNotDisposed();
    const mnemonicToUse = mnemonic ?? this.mnemonic;

    if (mnemonicToUse) {
      return await signPsbt(mnemonicToUse, psbt, this.network);
    }
    if (this.seed) {
      return await signPsbtFromSeed(this.seed, psbt, this.network);
    }

    throw new WalletError('mnemonic is required. Provide it as parameter or initialize wallet with mnemonic.');
  }

  /**
   * Complete send operation: begin → sign → end
   * @param invoiceTransfer - Transfer invoice parameters
   * @param mnemonic - Optional mnemonic for signing
   */
  public async send(invoiceTransfer: SendAssetBeginRequestModel, mnemonic?: string): Promise<SendResult> {
    this.ensureNotDisposed();
    const psbt = await this.sendBegin(invoiceTransfer);
    const signedPsbt = await this.signPsbt(psbt, mnemonic);
    console.log('send signedPsbt', signedPsbt);
    return await this.sendEnd({ signedPsbt });
  }

  public async createUtxos({ upTo, num, size, feeRate }: { upTo?: boolean, num?: number, size?: number, feeRate?: number }): Promise<number> {
    this.ensureNotDisposed();
    const psbt = await this.createUtxosBegin({ upTo, num, size, feeRate });
    const signedPsbt = await this.signPsbt(psbt);
    return await this.createUtxosEnd({ signedPsbt });
  }

  public async syncWallet(): Promise<void> {
    await this.client.sync();
  }

  public async signMessage(message: string): Promise<string> {
    this.ensureNotDisposed();
    if (!message) {
      throw new ValidationError('message is required', 'message');
    }

    if (!this.seed) {
      throw new WalletError('Wallet seed is required for message signing. Initialize the wallet with a seed.');
    }

    return signSchnorrMessage({
      message,
      seed: this.seed,
      network: this.network,
    });
  }

  public async verifyMessage(message: string, signature: string): Promise<boolean> {
    if (!message) {
      throw new ValidationError('message is required', 'message');
    }
    if (!signature) {
      throw new ValidationError('signature is required', 'signature');
    }

    return verifySchnorrMessage({
      message,
      signature,
      accountXpub: this.xpubVan,
      network: this.network,
    });
  }

}

/**
 * Factory function to create a WalletManager instance
 * Provides a cleaner API than direct constructor
 * 
 * @example
 * ```typescript
 * const keys = generateKeys('testnet');
 * const wallet = createWalletManager({
 *   xpubVan: keys.accountXpubVanilla,
 *   xpubCol: keys.accountXpubColored,
 *   masterFingerprint: keys.masterFingerprint,
 *   mnemonic: keys.mnemonic,
 *   network: 'testnet',
 *   transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
 *   indexerUrl: 'ssl://electrum.iriswallet.com:50013'
 * });
 * ```
 */
export function createWalletManager(params: WalletInitParams): WalletManager {
  return new WalletManager(params);
}

