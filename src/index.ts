// Wallet utilities
export { createWallet } from './wallet/wallet-manager';


// RLN node manager
export { RLNManager, createRLNManager } from './wallet/rln-manager';

// UTEXO wallet — implements the shared IUTEXOWallet contract, backed by RLN.
export { UTEXOWallet } from './wallet/utexo-wallet';
export type { UTEXOWalletNodeParams } from './wallet/utexo-wallet';
export {
  getNetworkDefaults,
  resolveUnlockParams,
} from './wallet/network-defaults';
export type { NetworkEndpoints } from './wallet/network-defaults';
export {
  PasswordRLNSigner,
  NativeExternalRLNSigner,
} from './wallet/rln-signers';
export type { IRLNSigner, RLNKeyMaterial } from './wallet/rln-signers';

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
  LspChannelTimeoutError,
  LspLiquidityTimeoutError,
  LspSettlementError,
  normalizeReceiveStatus,
  peerUri,
} from '@utexo/rgb-sdk-core';
export type {
  IUtexoLSPClient,
  ILspWallet,
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
  LightningAddressInfo,
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
  // Wallet contract — shared surface, lifecycle, and the optional carrier
  // types. The carriers are all absent on this platform (see UTEXOWallet), but
  // the types are exported so app code can be written against the shared
  // contract and stay portable to rgb-sdk-web.
  IUTEXOWallet,
  IUTEXOWalletCore,
  IWalletLifecycle,
  WalletCapabilities,
  IPsbtSigning,
  IBeginEndFlows,
  IVssBackup,
  CreateLnInvoiceRequest,
  ILightningNode,
  ILightningPayments,
  ILightningAddress,
  IOnchainTransfers,
  IRgbAssets,
  IBitcoinWallet,
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
