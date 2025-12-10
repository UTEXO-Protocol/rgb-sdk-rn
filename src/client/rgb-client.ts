/**
 * RGB Client - Main client class for interacting with RGB Node API
 */
// Use native FormData for React Native compatibility
// FormData is available globally in React Native
import { createClient } from "./http-client";
import {
  AssetBalanceResponse,
  BtcBalance,
  CreateUtxosBeginRequestModel,
  CreateUtxosEndRequestModel,
  FailTransfersRequest,
  InvoiceReceiveData,
  InvoiceRequest,
  IssueAssetNIAResponse,
  ListAssetsResponse,
  RGBHTTPClientParams,
  RgbTransfer,
  SendAssetBeginRequestModel,
  SendAssetEndRequestModel,
  SendResult,
  Transaction,
  Unspent,
  WalletBackupResponse,
  WalletRestoreResponse,
  SendBtcBeginRequestModel,
  SendBtcEndRequestModel,
  GetFeeEstimationRequestModel,
  GetFeeEstimationResponse,
  AssetNIA
} from "../types/rgb-model";

/**
 * RGB Client class for interacting with RGB Node API
 * 
 * This class provides methods for wallet management, asset operations,
 * and UTXO management through the RGB Node HTTP API.
 * 
 * @example
 * ```typescript
 * const client = new RGBClient({
 *   xpub_van: 'xpub...',
 *   xpub_col: 'xpub...',
 *   master_fingerprint: 'abcd1234',
 *   rgbEndpoint: 'http://127.0.0.1:8000'
 * });
 * 
 * const balance = await client.getBtcBalance();
 * ```
 */
export class RGBClient {
  private client;
  private readonly xpubVan: string;
  private readonly xpubCol: string;
  private readonly masterFingerprint: string;

  constructor(params: RGBHTTPClientParams) {
    this.client = createClient(params);
    this.xpubVan = params.xpub_van;
    this.xpubCol = params.xpub_col;
    this.masterFingerprint = params.master_fingerprint;
  }

  /**
   * Make API request and return response data
   * @param method - HTTP method (GET, POST, PUT, DELETE, etc.)
   * @param endpoint - API endpoint path
   * @param params - Request parameters (body for POST/PUT, query for GET)
   */
  private async request<T>(
    method: 'get' | 'post' | 'put' | 'delete' | 'patch',
    endpoint: string,
    params?: any
  ): Promise<T> {
    let response;
    switch (method) {
      case 'get':
        response = await this.client.get(endpoint, { params });
        break;
      case 'post':
        response = await this.client.post(endpoint, params);
        break;
      case 'put':
        response = await this.client.put(endpoint, params);
        break;
      case 'delete':
        response = await this.client.delete(endpoint, { data: params });
        break;
      case 'patch':
        response = await this.client.patch(endpoint, params);
        break;
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
    return response.data;
  }

  async registerWallet(): Promise<{ address: string; btc_balance: BtcBalance }> {
    return this.request("post", "/wallet/register");
  }

  async getBtcBalance(): Promise<BtcBalance> {
    return this.request("post", "/wallet/btcbalance");
  }

  async getAddress(): Promise<string> {
    return this.request("post", "/wallet/address");
  }

  async listUnspents(): Promise<Unspent[]> {
    return this.request("post", "/wallet/listunspents");
  }

  async createUtxosBegin(params: CreateUtxosBeginRequestModel): Promise<string> {
    return this.request<string>("post", "/wallet/createutxosbegin", params);
  }

  async createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number> {
    return this.request<number>("post", "/wallet/createutxosend", params);
  }

  async sendBegin(params: SendAssetBeginRequestModel): Promise<string> {
    return this.request<string>("post", "/wallet/sendbegin", params);
  }

  async sendEnd(params: SendAssetEndRequestModel): Promise<SendResult> {
    return this.request<SendResult>("post", "/wallet/sendend", params);
  }

  async sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string> {
    return this.request<string>("post", "/wallet/sendbtcbegin", params);
  }

  async sendBtcEnd(params: SendBtcEndRequestModel): Promise<string> {
    return this.request<string>("post", "/wallet/sendbtcend", params);
  }

  async getFeeEstimation(params: GetFeeEstimationRequestModel): Promise<GetFeeEstimationResponse> {
    return this.request<GetFeeEstimationResponse>("post", "/wallet/get_fee_estimation", params);
  }

  async blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    return this.request<InvoiceReceiveData>("post", "/wallet/blindreceive", params);
  }

  async witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    return this.request<InvoiceReceiveData>("post", "/wallet/witnessreceive", params);
  }

  async getAssetBalance(asset_id: string): Promise<AssetBalanceResponse> {
    return this.request<AssetBalanceResponse>("post", "/wallet/assetbalance", { asset_id });
  }

  async issueAssetNia(params: { ticker: string; name: string; amounts: number[]; precision: number }): Promise<AssetNIA> {
    return this.request<AssetNIA>("post", "/wallet/issueassetnia", params);
  }

  async listAssets(): Promise<ListAssetsResponse> {
    return this.request<ListAssetsResponse>("post", "/wallet/listassets");
  }

  async decodeRGBInvoice(params: { invoice: string }): Promise<SendAssetBeginRequestModel> {
    return this.request<SendAssetBeginRequestModel>("post", "/wallet/decodergbinvoice", params);
  }

  async refreshWallet(): Promise<void> {
    await this.request<void>("post", "/wallet/refresh");
  }

  async dropWallet(): Promise<void> {
    await this.request<void>("post", "/wallet/drop");
  }

  async listTransactions(): Promise<Transaction[]> {
    return this.request<Transaction[]>("post", "/wallet/listtransactions");
  }

  async listTransfers(asset_id: string): Promise<RgbTransfer[]> {
    return this.request<RgbTransfer[]>("post", "/wallet/listtransfers", { asset_id });
  }

  async failTransfers(params: FailTransfersRequest): Promise<boolean> {
    const { batch_transfer_idx, no_asset_only = false, skip_sync = false } = params;
    return this.request<boolean>("post", "/wallet/failtransfers", { batch_transfer_idx, no_asset_only, skip_sync });
  }

  async syncWallet(): Promise<void> {
    await this.request<void>("post", "/wallet/sync");
  }

  async createBackup(params: { password: string }): Promise<WalletBackupResponse> {
    return this.request<WalletBackupResponse>("post", "/wallet/backup", params);
  }

  async downloadBackup(backupId: string = this.xpubVan): Promise<ArrayBuffer | Buffer> {
    const response = await this.client.get(`/wallet/backup/${backupId}`, {
      responseType: "arraybuffer"
    });
    const data = response.data;
    if (typeof Buffer !== "undefined" && data instanceof ArrayBuffer) {
      return Buffer.from(data);
    }
    return data;
  }

  // async restoreWallet(params: {
  //   file: Buffer | Uint8Array | ArrayBuffer | Readable;
  //   password: string;
  //   xpub_van?: string;
  //   xpub_col?: string;
  //   master_fingerprint?: string;
  //   filename?: string;
  // }): Promise<WalletRestoreResponse> {
  //   const {
  //     file,
  //     password,
  //     filename = "wallet.backup",
  //     xpub_van = this.xpubVan,
  //     xpub_col = this.xpubCol,
  //     master_fingerprint = this.masterFingerprint
  //   } = params;

  //   const form = new FormData();
  //   const filePart =
  //     file instanceof ArrayBuffer
  //       ? new Blob([file], { type: 'application/octet-stream' })
  //       : file instanceof Uint8Array
  //         ? new Blob([file], { type: 'application/octet-stream' })
  //         : file;

  //   form.append("file", filePart as any, filename);
  //   form.append("password", password);
  //   form.append("xpub_van", xpub_van);
  //   form.append("xpub_col", xpub_col);
  //   form.append("master_fingerprint", master_fingerprint);

  //   const response = await this.client.post<WalletRestoreResponse>("/wallet/restore", form);
  //   return response.data;
  // }
}
