/**
 * UTEXO Protocol Interfaces
 *
 * These interfaces define the contract for UTEXO-specific operations.
 * They are separated by concern (Lightning vs Onchain) and combined into IUTEXOProtocol.
 */

import type {
  CreateLightningInvoiceRequestModel,
  LightningReceiveRequest,
  LightningSendRequest,
  GetLightningSendFeeEstimateRequestModel,
  PayLightningInvoiceRequestModel,
  OnchainSendRequestModel,
  OnchainSendResponse,
  ListLightningPaymentsResponse,
  OnchainReceiveRequestModel,
  OnchainReceiveResponse,
} from '../types/rgb-model';
import type { SendAssetEndRequestModel, Transfer, TransferStatus } from '../types/rgb-model';

/**
 * Lightning Protocol Interface
 *
 * Defines methods for Lightning Network operations including
 * invoice creation, payments, and fee estimation.
 */
export interface ILightningProtocol {
  /**
   * Creates a Lightning invoice for receiving BTC or asset payments.
   *
   * @param params - Request parameters for creating the Lightning invoice
   * @returns Promise resolving to Lightning invoice response
   */
  createLightningInvoice(
    params: CreateLightningInvoiceRequestModel
  ): Promise<LightningReceiveRequest>;

  /**
   * Returns the status of a Lightning invoice created with createLightningInvoice.
   *
   * @param id - The request ID of the Lightning invoice
   * @returns Promise resolving to transfer status or null if not found
   */
  getLightningReceiveRequest(id: string): Promise<TransferStatus | null>;

  /**
   * Returns the current status of a Lightning payment initiated with payLightningInvoice.
   *
   * @param id - The request ID of the Lightning send request
   * @returns Promise resolving to transfer status or null if not found
   */
  getLightningSendRequest(id: string): Promise<TransferStatus | null>;

  /**
   * Estimates the routing fee required to pay a Lightning invoice.
   * For asset payments, the returned fee is always denominated in satoshis.
   *
   * @param params - Request parameters containing the invoice and optional asset
   * @returns Promise resolving to estimated fee in satoshis
   */
  getLightningSendFeeEstimate(
    params: GetLightningSendFeeEstimateRequestModel
  ): Promise<number>;

  /**
   * Begins a Lightning invoice payment process.
   * Returns a base64-encoded PSBT to be signed.
   *
   * @param params - Request parameters containing the invoice and max fee
   * @returns Promise resolving to base64-encoded PSBT
   */
  payLightningInvoiceBegin(params: PayLightningInvoiceRequestModel): Promise<string>;

  /**
   * Completes a Lightning invoice payment using a signed PSBT.
   *
   * @param params - Request parameters containing the signed PSBT
   * @returns Promise resolving to Lightning send result
   */
  payLightningInvoiceEnd(params: SendAssetEndRequestModel): Promise<LightningSendRequest>;

  /**
   * Pays a Lightning invoice (convenience: begin → sign → end).
   *
   * @param params - Request parameters containing the invoice and max fee
   * @param mnemonic - Optional mnemonic for signing (uses wallet's mnemonic if not provided)
   * @returns Promise resolving to Lightning send result
   */
  payLightningInvoice(
    params: PayLightningInvoiceRequestModel,
    mnemonic?: string
  ): Promise<LightningSendRequest>;

  /**
   * Lists all Lightning payments.
   *
   * @returns Promise resolving to response containing array of Lightning payments
   */
  listLightningPayments(): Promise<ListLightningPaymentsResponse>;
}

/**
 * Onchain Protocol Interface
 *
 * Defines methods for on-chain transfer operations via the UTEXO bridge.
 */
export interface IOnchainProtocol {
  /**
   * Creates a receive invoice for an on-chain transfer into UTEXO.
   *
   * @param params - Request parameters for the receive
   * @returns Promise resolving to a mainnet invoice
   */
  onchainReceive(params: OnchainReceiveRequestModel): Promise<OnchainReceiveResponse>;

  /**
   * Begins an on-chain send from UTEXO.
   * Returns a base64-encoded PSBT to be signed.
   *
   * @param params - Request parameters for on-chain send
   * @returns Promise resolving to base64-encoded PSBT
   */
  onchainSendBegin(params: OnchainSendRequestModel): Promise<string>;

  /**
   * Completes an on-chain send from UTEXO using a signed PSBT.
   *
   * @param params - Request parameters containing the signed PSBT
   * @returns Promise resolving to on-chain send response
   */
  onchainSendEnd(params: SendAssetEndRequestModel): Promise<OnchainSendResponse>;

  /**
   * Sends BTC or assets on-chain from the UTEXO layer (convenience: begin → sign → end).
   *
   * @param params - Request parameters for on-chain send
   * @param mnemonic - Optional mnemonic for signing (uses wallet's mnemonic if not provided)
   * @returns Promise resolving to on-chain send response
   */
  onchainSend(
    params: OnchainSendRequestModel,
    mnemonic?: string
  ): Promise<OnchainSendResponse>;

  /**
   * Gets the status of an on-chain send by the originating invoice.
   *
   * @param invoice - The originating mainnet invoice
   * @returns Promise resolving to transfer status or null if not found
   */
  getOnchainSendStatus(invoice: string): Promise<TransferStatus | null>;

  /**
   * Lists on-chain transfers for a specific asset.
   *
   * @param asset_id - The asset ID to list transfers for (all assets if omitted)
   * @returns Promise resolving to array of transfers
   */
  listOnchainTransfers(asset_id?: string): Promise<Transfer[]>;
}

/**
 * UTEXO Protocol Interface
 *
 * Combines Lightning and Onchain protocol interfaces.
 * This is the main interface that UTEXOWallet implements.
 */
export interface IUTEXOProtocol extends ILightningProtocol, IOnchainProtocol {}
