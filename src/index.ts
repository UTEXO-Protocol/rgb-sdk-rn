// Wallet utilities
export { createWallet } from './wallet/wallet-manager';

// RLN node manager
export { RLNManager, createRLNManager } from './wallet/rln/rln-manager';

// UTEXO wallet — legacy RLN constructor plus an optional on-chain rgb-lib mode.
export { UTEXOWallet } from './wallet/utexo-wallet';
export type {
  UTEXOWalletNodeParams,
  UTEXOWalletOptions,
  AnyUtexoWallet,
} from './wallet/utexo-wallet';
export { restoreFromBackup } from './wallet/rgb-lib/restore';
export type {
  WalletInit,
  RlnWalletInit,
  RgbLibWalletInit,
} from './wallet/wallet-options';
export type {
  RgbLibWalletParams,
  RgbLibUnlockParams,
  RgbLibIndexer,
} from './wallet/rgb-lib/config';
export { CallbackRgbLibKeyProvider } from './wallet/rgb-lib/key-provider';
export type { IRgbLibKeyProvider } from './wallet/rgb-lib/key-provider';
export type {
  WalletProtocol,
  WalletIdentity,
  OnchainWalletApi,
  WalletTransfer,
  WalletAssignment,
  WalletInvoiceData,
  WalletUnspent,
} from './wallet/wallet-api';
export { WalletBackendError } from './wallet/wallet-errors';
export type { WalletBackendErrorCode } from './wallet/wallet-errors';
export {
  getNetworkDefaults,
  resolveUnlockParams,
} from './wallet/rln/network-defaults';
export type { NetworkEndpoints } from './wallet/rln/network-defaults';
export {
  PasswordRLNSigner,
  NativeExternalRLNSigner,
} from './wallet/rln/rln-signers';
export type { IRLNSigner, RLNKeyMaterial } from './wallet/rln/rln-signers';

// Binding and signer (for advanced / testing use)
export { RLNBinding } from './binding/RLNBinding';
export type * from './binding/rln-types';
export type {
  IRLN,
  IRLNNodeCreateParams,
  IRLNUnlockParams,
  IRLNExternalSignerBootstrap,
} from './binding/IRLN';

// ── LSP (utexo-lsp) ──────────────────────────────────────────────────────────
// Now lives in @utexo/rgb-sdk-core (was duplicated here and in rgb-sdk-web).
// Re-exported so this package's public API is unchanged.
export {
  UtexoLSPClient,
  LspError,
  UtexoLsp,
  LspAmbiguousPayableAssetError,
  LspChannelTimeoutError,
  LspInsufficientAssetLiquidityError,
  LspLiquidityTimeoutError,
  LspNoPayableAssetError,
  LspQuoteMismatchError,
  LspSettlementError,
  LspUnknownPayableAssetError,
  normalizeReceiveStatus,
  peerUri,
} from '@utexo/rgb-sdk-core';
export type {
  IUtexoLSPClient,
  ILspWallet,
  LspClientConfig,
  LspGetInfoResponse,
  LspSupportedAsset,
  LspLnurlpDiscovery,
  LspLnParams,
  LspOnchainSendRequest,
  LspOnchainSendResponse,
  LspRgbParams,
  LspLightningReceiveRequest,
  LspLightningReceiveResponse,
  LspLightningSendRequest,
  LspLightningSendResponse,
  LspLightningSendLeg,
  LspLightningSendStatus,
  LspLightningSendStatusResponse,
  LspLnurlpCallbackResponse,
  LspLightningAddressByPubkeyResponse,
  CreateHodlInvoiceParams,
  HodlInvoiceResult,
  ApayHashEntry,
  ApayNewResponse,
  ApayInvoiceProof,
  ApayMerkleProofElement,
  LspPeer,
  ReceiveStatus,
  ReceiveSettlementOutcome,
  ChannelReadyInfo,
  WaitOptions,
  ReceiveAssetOptions,
  ReceiveAssetResult,
  SendAssetOptions,
  SendAssetResult,
  PayAddressOptions,
  PayAddressAssetParam,
  AddressQuote,
  PayableAssets,
  RequestExternalInvoiceOptions,
  ExternalInvoice,
  PayExternalInvoiceOptions,
  ExternalPaymentQuote,
  SelectPaymentAssetOptions,
  AssetSelection,
  LightningAddressInfo,
  ParsedLightningAddress,
  ClaimResult,
} from '@utexo/rgb-sdk-core';

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
  // Lightning Address / UMA (`$user@host`) helpers
  isUmaAddress,
  normalizeLightningAddress,
  parseLightningAddress,
  UMA_PREFIX,
  UMA_MAX_USERNAME_LENGTH,
  // UTEXO network config
  DEFAULT_TRANSPORT_ENDPOINTS,
  DEFAULT_INDEXER_URLS,
} from '@utexo/rgb-sdk-core';

export type {
  // Crypto types
  Network,
  PsbtType,
  NetworkVersions,
  Descriptors,
  GeneratedKeys,
  AccountXpubs,
  // UTEXO protocol contract — shared surface, lifecycle, and the optional
  // carrier types. The carriers are all absent on this platform (see
  // UTEXOWallet), but the types are exported so app code can be written against
  // the shared contract and stay portable to rgb-sdk-web.
  IUTEXOProtocol,
  IUTEXOProtocolCore,
  IWalletLifecycle,
  WalletCapabilities,
  IPsbtSigning,
  IBeginEndFlows,
  CreateLnInvoiceRequest,
  ILightningNode,
  ILightningPayments,
  IAsyncPayments,
  IOnchainTransfers,
  IRgbAssets,
  IBitcoinWallet,
  // All model types
  BtcBalance,
  Unspent,
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
  FailTransfersRequest,
  VssBackupConfig,
  VssBackupInfo,
  WalletBackupResponse,
  TransferStatus,
  PublicKeys,
  CreateLightningInvoiceRequestModel,
  GetLightningSendFeeEstimateRequestModel,
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
} from '@utexo/rgb-sdk-core';

export type {
  RefreshFailure,
  RefreshedTransfer,
  RefreshTransfersResult,
} from './wallet/refresh-types';

export type {
  BurnParams,
  BurnResult,
  BfaCapabilities,
  AssetBfa,
  ListAssets,
  Transfer,
  TransferAssignment,
  TransferAmount,
  LightningNodeDetails,
  DecodedLnInvoiceDetails,
  AssetSchemaName,
  ReceiveAssignmentKind,
  ReceiveParams,
  OnchainReceiveParams,
  ReadOptions,
  IssueAssetCfaParams,
  IssueAssetUdaParams,
  AssetMetadata,
  RestoreFromBackupParams,
  WalletRestoreResponse,
} from './wallet/types';

export { BurnOperations, normalizeBurnRecord } from './wallet/operations/burn';
export type {
  BurnOperationRecord,
  BurnOperationStore,
  BurnOperationMetadata,
} from './wallet/operations/burn';
