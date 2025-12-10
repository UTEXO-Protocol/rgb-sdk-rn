import { RGBClient } from '../client/index';
import {
  CreateUtxosBeginRequestModel,
  CreateUtxosEndRequestModel,
  FailTransfersRequest,
  InvoiceRequest,
  InvoiceReceiveData,
  IssueAssetNiaRequestModel,
  IssueAssetNIAResponse,
  SendAssetBeginRequestModel,
  SendAssetEndRequestModel,
  SendResult,
  AssetBalanceResponse,
  BtcBalance,
  ListAssetsResponse,
  Transaction,
  Unspent,
  RgbTransfer,
  WalletBackupResponse,
  WalletRestoreResponse,
  RestoreWalletRequestModel,
  SendBtcBeginRequestModel,
  SendBtcEndRequestModel,
  GetFeeEstimationResponse,
  AssetNIA
} from '../types/rgb-model';
import { signPsbt, signPsbtFromSeed, signMessage as signSchnorrMessage, verifyMessage as verifySchnorrMessage, estimatePsbt } from '../crypto';
import type { EstimateFeeResult, Network } from '../crypto';
import { generateKeys } from '../crypto';
import { normalizeNetwork } from '../utils/validation';
import { ValidationError, WalletError, CryptoError } from '../errors';
import type { Readable } from 'stream';


/**
 * Generate a new wallet with keys
 * @param network - Network string (default: 'regtest')
 * @returns Generated keys including mnemonic, xpubs, and master fingerprint
 */
export const createWallet = async (network: string | number = 'regtest') => {
  return await generateKeys(network);
}

export type WalletInitParams = {
 
  xpub_van: string;
  xpub_col: string;
  rgb_node_endpoint: string;
  mnemonic?: string;
  seed?: Uint8Array;
  network?: string | number;
  xpub?: string;
  master_fingerprint: string;
}

/**
 * Wallet Manager - High-level wallet interface combining RGB API client and cryptographic operations
 * 
 * This class provides a unified interface for:
 * - RGB Node API interactions (via RGBClient)
 * - PSBT signing operations
 * - Wallet state management
 * 
 * @example
 * ```typescript
 * const keys = await createWallet('testnet');
 * const wallet = new WalletManager({
 *   xpub_van: keys.account_xpub_vanilla,
 *   xpub_col: keys.account_xpub_colored,
 *   rgb_node_endpoint: 'http://127.0.0.1:8000',
 *   mnemonic: keys.mnemonic,
 *   network: 'testnet',
 *   master_fingerprint: keys.master_fingerprint
 * });
 * 
 * const balance = await wallet.getBtcBalance();
 * ```
 */
export class WalletManager {
  private readonly client: RGBClient;
  private readonly xpub: string | null;
  private readonly xpub_van: string;
  private readonly xpub_col: string;
  private readonly mnemonic: string | null;
  private readonly seed: Uint8Array | null;
  private readonly network: Network;
  private readonly masterFingerprint: string;

  constructor(params: WalletInitParams) {
    // Validate required parameters
    if (!params.xpub_van) {
      throw new ValidationError('xpub_van is required', 'xpub_van');
    }
    if (!params.xpub_col) {
      throw new ValidationError('xpub_col is required', 'xpub_col');
    }
    if (!params.rgb_node_endpoint) {
      throw new ValidationError('rgb_node_endpoint is required', 'rgb_node_endpoint');
    }
    if (!params.master_fingerprint) {
      throw new ValidationError('master_fingerprint is required', 'master_fingerprint');
    }

    // Initialize RGB client
    this.client = new RGBClient({
      xpub_van: params.xpub_van,
      xpub_col: params.xpub_col,
      rgbEndpoint: params.rgb_node_endpoint,
      master_fingerprint: params.master_fingerprint,
    });

    // Store wallet state
    this.xpub_van = params.xpub_van;
    this.xpub_col = params.xpub_col;
    this.seed = params.seed ?? null;
    this.mnemonic = params.mnemonic ?? null;
    this.xpub = params.xpub ?? null;
    this.masterFingerprint = params.master_fingerprint;

    // Normalize network using utility function
    this.network = normalizeNetwork(params.network ?? 'regtest');
  }

  /**
   * Get wallet's extended public keys
   */
  public getXpub(): { xpub_van: string; xpub_col: string } {
    return {
      xpub_van: this.xpub_van,
      xpub_col: this.xpub_col
    };
  }

  /**
   * Get wallet's network
   */
  public getNetwork(): Network {
    return this.network;
  }

  // ========== RGB API Methods (delegated to RGBClient) ==========

  public async registerWallet(): Promise<{ address: string; btc_balance: BtcBalance }> {
    return this.client.registerWallet();
  }

  public async getBtcBalance(): Promise<BtcBalance> {
    return this.client.getBtcBalance();
  }

  public async getAddress(): Promise<string> {
    return this.client.getAddress();
  }

  public async listUnspents(): Promise<Unspent[]> {
    return this.client.listUnspents();
  }

  public async listAssets(): Promise<ListAssetsResponse> {
    return this.client.listAssets();
  }

  public async getAssetBalance(asset_id: string): Promise<AssetBalanceResponse> {
    return this.client.getAssetBalance(asset_id);
  }

  public async createUtxosBegin(params: CreateUtxosBeginRequestModel): Promise<string> {
    return this.client.createUtxosBegin(params);
  }

  public async createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number> {
    return this.client.createUtxosEnd(params);
  }

  public async sendBegin(params: SendAssetBeginRequestModel): Promise<string> {
    return this.client.sendBegin(params);
  }

  public async sendEnd(params: SendAssetEndRequestModel): Promise<SendResult> {
    return this.client.sendEnd(params);
  }

  public async sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string> {
    return this.client.sendBtcBegin(params);
  }

  public async sendBtcEnd(params: SendBtcEndRequestModel): Promise<string> {
    return this.client.sendBtcEnd(params);
  }

  public async estimateFeeRate(blocks: number): Promise<GetFeeEstimationResponse> {
    if (!Number.isFinite(blocks)) {
      throw new ValidationError('blocks must be a finite number', 'blocks');
    }
    if (!Number.isInteger(blocks) || blocks <= 0) {
      throw new ValidationError('blocks must be a positive integer', 'blocks');
    }

    return this.client.getFeeEstimation({ blocks });
  }

  public async estimateFee(psbtBase64: string): Promise<EstimateFeeResult> {
     return await estimatePsbt(psbtBase64);
  }

  public async sendBtc(params: SendBtcBeginRequestModel): Promise<string> {
    const psbt = await this.sendBtcBegin(params);
    const signed = await this.signPsbt(psbt);
    return this.sendBtcEnd({ signed_psbt: signed });
  }

  public async blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    return this.client.blindReceive(params);
  }

  public async witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    return this.client.witnessReceive(params);
  }

  public async issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA> {
    return this.client.issueAssetNia(params);
  }

  public async refreshWallet(): Promise<void> {
    return this.client.refreshWallet();
  }

  public async listTransactions(): Promise<Transaction[]> {
    return this.client.listTransactions();
  }

  public async listTransfers(asset_id: string): Promise<RgbTransfer[]> {
    return this.client.listTransfers(asset_id);
  }

  public async failTransfers(params: FailTransfersRequest): Promise<boolean> {
    return this.client.failTransfers(params);
  }

  public async decodeRGBInvoice(params: { invoice: string }): Promise<SendAssetBeginRequestModel> {
    return this.client.decodeRGBInvoice(params);
  }

  public async createBackup(password: string): Promise<WalletBackupResponse> {
    if (!password) {
      throw new ValidationError('password is required', 'password');
    }
    return this.client.createBackup({ password });
  }

  public async downloadBackup(backupId?: string): Promise<ArrayBuffer | Buffer> {
    return this.client.downloadBackup(backupId ?? this.xpub_van);
  }

  public async restoreFromBackup(params: RestoreWalletRequestModel): Promise<WalletRestoreResponse> {
    const {
      backup,
      password,
      filename,
      xpub_van = this.xpub_van,
      xpub_col = this.xpub_col,
      master_fingerprint = this.masterFingerprint
    } = params;

    if (!backup) {
      throw new ValidationError('backup file is required', 'backup');
    }
    if (!password) {
      throw new ValidationError('password is required', 'password');
    }
    return {
      message: 'Restore from backup is not implemented',
    }

    // return this.client.restoreWallet({
    //   file: backup,
    //   password,
    //   filename,
    //   xpub_van,
    //   xpub_col,
    //   master_fingerprint
    // });
  }

  /**
   * Sign a PSBT using the wallet's mnemonic or a provided mnemonic
   * @param psbt - Base64 encoded PSBT
   * @param mnemonic - Optional mnemonic (uses wallet's mnemonic if not provided)
   */
  public async signPsbt(psbt: string, mnemonic?: string): Promise<string> {
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
    const psbt = await this.sendBegin(invoiceTransfer);
    const signed_psbt = await this.signPsbt(psbt, mnemonic);
    console.log('send signed_psbt', signed_psbt);
    return await this.sendEnd({ signed_psbt });
  }

  public async createUtxos({ up_to, num, size, fee_rate }: { up_to?: boolean, num?: number, size?: number, fee_rate?: number }): Promise<number> {
    const psbt = await this.createUtxosBegin({ up_to, num, size, fee_rate });
    const signed_psbt = await this.signPsbt(psbt);
    return await this.createUtxosEnd({ signed_psbt });
  }

  public async syncWallet(): Promise<void> {
    return this.client.syncWallet();
  }

  public async signMessage(message: string): Promise<string> {
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

  public async verifyMessage(message: string, signature: string, accountXpub?: string): Promise<boolean> {
    if (!message) {
      throw new ValidationError('message is required', 'message');
    }
    if (!signature) {
      throw new ValidationError('signature is required', 'signature');
    }

    return verifySchnorrMessage({
      message,
      signature,
      accountXpub: this.xpub_van,
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
 * const keys = await createWallet();
 * const wallet = createWalletManager({
 *   ...keys,
 *   rgb_node_endpoint: 'http://127.0.0.1:8000'
 * });
 * ```
 */
export function createWalletManager(params: WalletInitParams): WalletManager {
  return new WalletManager(params);
}

// Legacy singleton instance for backward compatibility
// @deprecated Use `new WalletManager(params)` or `createWalletManager(params)` instead
// This singleton will throw an error when accessed, requiring proper initialization
let _wallet: WalletManager | null = null;

export const wallet = new Proxy({} as WalletManager, {
  get(target, prop) {
    if (!_wallet) {
      throw new WalletError(
        'The legacy singleton wallet instance is deprecated. ' +
        'Please use `new WalletManager(params)` or `createWalletManager(params)` instead. ' +
        'Example: const wallet = new WalletManager({ xpub_van, xpub_col, rgb_node_endpoint, master_fingerprint })'
      );
    }
    const value = (_wallet as any)[prop];
    return typeof value === 'function' ? value.bind(_wallet) : value;
  },
});
