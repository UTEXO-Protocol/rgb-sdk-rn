export type {
  CreateLightningInvoiceRequestModel,
  LightningReceiveRequest,
  GetLightningSendFeeEstimateRequestModel,
  PayLightningInvoiceRequestModel,
  LightningSendRequest,
  OnchainReceiveRequestModel,
  OnchainReceiveResponse,
  OnchainSendRequestModel,
  OnchainSendResponse,
  OnchainSendStatus,
  SendAssetEndRequestModel,
  TransferStatus,
  Transfer,
  ListLightningPaymentsResponse,
} from '@utexo/rgb-sdk-core';

export type RlnNodeInfo = Record<string, unknown>;
export type RlnNetworkInfo = Record<string, unknown>;
export type RlnPeer = { pubkey: string };
export type RlnChannel = Record<string, unknown>;
export type RlnPayment = Record<string, unknown>;
