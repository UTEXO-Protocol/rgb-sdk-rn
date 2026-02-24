/**
 * Bridge client exports
 *
 * This module provides access to the UTEXO Bridge API client for
 * Lightning Network and cross-network transfer operations.
 */

export { bridgeAPI } from './api';
export type {
  NetworkAddress,
  TransferType,
  Estimation,
  BridgeInSignatureRequest,
  BridgeInSignatureResponse,
  SubmitTransactionRequest,
  SubmitTransactionResponse,
  VerifyBridgeInRequest,
  ReceiverInvoiceResponse,
  TokenInfo,
  TransactionHash,
  TransferByMainnetInvoiceResponse,
  ApiError,
} from './types';
