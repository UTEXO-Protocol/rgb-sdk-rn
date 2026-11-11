// @utexo/rgb-sdk-rn — the RGB_L1 engine for React Native (native rgb-lib, no
// RLN / LDK). The engine is the primary API; the optional UTEXOWallet facade
// lives in @utexo/rgb-sdk.

// Engine
export { RgbLibWallet } from './wallet/rgb-lib/rgb-lib-wallet';
export {
  restoreBackupFromFile,
  restoreFromBackup,
} from './wallet/rgb-lib/restore';
export type {
  RgbLibWalletParams,
  RgbLibWalletOptions,
  RgbLibUnlockParams,
  RgbLibIndexer,
  RgbLibMintLockBlocks,
} from './wallet/rgb-lib/config';
export { DEFAULT_EVM_MINT_LOCK_BLOCKS } from './wallet/rgb-lib/config';
export { CallbackRgbLibKeyProvider } from './wallet/rgb-lib/key-provider';
export type {
  IRgbLibKeyProvider,
  RgbLibKeys,
  RgbLibMnemonicReader,
  RgbLibMnemonicResult,
  RgbLibPublicKeys,
} from './wallet/rgb-lib/key-provider';
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
  DEFAULT_INDEXER_URLS,
  DEFAULT_TRANSPORT_ENDPOINTS,
  getNetworkDefaults,
} from './wallet/network-endpoints';
export type { NetworkEndpoints } from './wallet/network-endpoints';

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
} from '@utexo/rgb-sdk-core';

export type {
  // Crypto types
  Network,
  PsbtType,
  NetworkVersions,
  Descriptors,
  GeneratedKeys,
  AccountXpubs,
  // UTEXO protocol contract types from core, re-exported for convenience.
  // RgbLibWallet does not implement the Lightning carriers; see SharedWalletApi.
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
  AssetSchemaName,
  ReceiveAssignmentKind,
  ReceiveParams,
  OnchainReceiveParams,
  ReadOptions,
  IssueAssetCfaParams,
  IssueAssetUdaParams,
  AssetMetadata,
  RestoreBackupFromFileParams,
  RestoreFromBackupParams,
  WalletRestoreResponse,
} from './wallet/types';
