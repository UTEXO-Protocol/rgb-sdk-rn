// Wallet utilities
export { createWallet } from './wallet/wallet-manager';
export type { WalletInitParams } from '@utexo/rgb-sdk-core';

// RLN node manager
export { RLNManager, createRLNManager } from './wallet/rln-manager';

// UTEXO wallet (implements IWalletManager + IUTEXOProtocol, backed by RLN)
export { UTEXOWallet } from './wallet/utexo-wallet';
export type { UTEXOWalletNodeParams } from './wallet/utexo-wallet';
export {
  PasswordRLNSigner,
  NativeExternalRLNSigner,
} from './wallet/rln-signers';
export type { IRLNSigner, RLNKeyMaterial } from './wallet/rln-signers';

// Binding and signer (for advanced / testing use)
export { RLNBinding } from './binding/RLNBinding';
export { RNSigner } from './signer/RNSigner';
export type * from './binding/rln-types';
export type {
  IRLN,
  IRLNNodeCreateParams,
  IRLNUnlockParams,
  IRLNExternalSignerBootstrap,
} from './binding/IRLN';

// LSP client + types (temporary in rgb-sdk-rn; moves to @utexo/rgb-sdk-core next release)
export { UtexoLSPClient, LspError } from './lsp/UtexoLSPClient';
export type { IUtexoLSPClient } from './lsp/IUtexoLSPClient';
export type {
  LspClientConfig,
  LspGetInfoResponse,
  LspLnParams,
  LspOnchainSendRequest,
  LspOnchainSendResponse,
  LspRgbParams,
  LspLightningReceiveRequest,
  LspLightningReceiveResponse,
  LspLnurlpCallbackResponse,
  LspLightningAddressByPubkeyResponse,
  CreateHodlInvoiceParams,
  HodlInvoice,
  HodlInvoiceResult,
  ApayHashEntry,
  ApayNewResponse,
  // New LSP types
  LspPeer,
  ReceiveStatus,
  ChannelReadyInfo,
} from './lsp/lsp-types';
export { normalizeReceiveStatus, peerUri } from './lsp/lsp-types';

// UtexoLsp — composed LSP flows (connect, channel wait, receive, send, pay address, APay)
export { UtexoLsp } from './lsp/UtexoLsp';
export type {
  WaitOptions,
  ReceiveAssetOptions,
  ReceiveAssetResult,
  SendAssetOptions,
  SendAssetResult,
  PayAddressOptions,
  LightningAddressInfo,
  ClaimResult,
} from './lsp/UtexoLsp';
export { LspChannelTimeoutError, LspSettlementError } from './lsp/LspErrors';

// Crypto — PSBT signing stubs (bdk-rn removed; throws — use NativeExternalRLNSigner for PSBT)
export { signPsbt, signPsbtFromSeed, estimatePsbt } from './crypto/signer';

// Re-export everything consumers need from core
export {
  // Key derivation
  generateKeys,
  deriveKeysFromMnemonic,
  deriveKeysFromSeed,
  deriveKeysFromMnemonicOrSeed,
  restoreKeys,
  accountXpubsFromMnemonic,
  getXprivFromMnemonic,
  getXpubFromXpriv,
  deriveKeysFromXpriv,
  // Message signing (pure @scure/*)
  signMessage,
  verifyMessage,
  // Errors
  SDKError,
  NetworkError,
  ValidationError,
  WalletError,
  CryptoError,
  ConfigurationError,
  BadRequestError,
  NotFoundError,
  // Utils
  logger,
  configureLogging,
  LogLevel,
  validateNetwork,
  normalizeNetwork,
  validateMnemonic,
  validatePsbt,
  validateBase64,
  validateHex,
  validateRequired,
  validateString,
  isNetwork,
  toUnitsNumber,
  fromUnitsNumber,
  // UTEXO network config
  utexoNetworkMap,
  utexoNetworkIdMap,
  getDestinationAsset,
  DEFAULT_TRANSPORT_ENDPOINTS,
  DEFAULT_INDEXER_URLS,
  // Bridge API
  getBridgeAPI,
  encodeTransferStatus,
  TransferStatuses,
  // Interfaces / base classes
  UTEXOProtocol,
  LightningProtocol,
  OnchainProtocol,
  UTEXOWalletCore,
  BaseWalletManager,
} from '@utexo/rgb-sdk-core';

export type {
  // Crypto types
  Network,
  PsbtType,
  NetworkVersions,
  Descriptors,
  GeneratedKeys,
  AccountXpubs,
  // Wallet interfaces
  IWalletManager,
  IRgbLibBinding,
  ISigner,
  IUTEXOProtocol,
  ILightningProtocol,
  IOnchainProtocol,
  // All model types
  BtcBalance,
  Unspent,
  ListAssets,
  AssetBalance,
  AssetNIA,
  CreateUtxosBeginRequestModel,
  CreateUtxosEndRequestModel,
  SendAssetBeginRequestModel,
  SendAssetEndRequestModel,
  SendResult,
  SendBtcBeginRequestModel,
  SendBtcEndRequestModel,
  InvoiceRequest,
  InvoiceReceiveData,
  InvoiceData,
  IssueAssetNiaRequestModel,
  IssueAssetIfaRequestModel,
  InflateAssetIfaRequestModel,
  InflateEndRequestModel,
  OperationResult,
  Transaction,
  Transfer,
  FailTransfersRequest,
  VssBackupConfig,
  VssBackupInfo,
  WalletBackupResponse,
  TransferStatus,
  OnchainSendStatus,
  PublicKeys,
  CreateLightningInvoiceRequestModel,
  LightningReceiveRequest,
  LightningSendRequest,
  PayLightningInvoiceRequestModel,
  OnchainSendRequestModel,
  OnchainSendResponse,
  OnchainSendEndRequestModel,
  OnchainReceiveRequestModel,
  OnchainReceiveResponse,
  ListLightningPaymentsResponse,
  GetFeeEstimationResponse,
  // Bridge types
  NetworkAddress,
  BridgeInSignatureRequest,
  BridgeInSignatureResponse,
  TransferByMainnetInvoiceResponse,
} from '@utexo/rgb-sdk-core';
