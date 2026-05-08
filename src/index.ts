// Main wallet exports
export {
  wallet,
  createWallet,
  WalletManager,
  createWalletManager,
  restoreFromBackup,
  restoreFromVss,
} from './wallet/wallet-manager';
export type {
  WalletInitParams,
  WalletManagerInitParams,
} from './wallet/wallet-manager';

// RLN node manager
export { RLNManager, createRLNManager } from './wallet/rln-manager';

// UTEXO wallet (implements IWalletManager + IUTEXOProtocol, backed by RLN)
export { UTEXOWallet } from './wallet/utexo-wallet';
export type { UTEXOWalletNodeParams } from './wallet/utexo-wallet';
export { PasswordRLNSigner, NativeExternalRLNSigner } from './wallet/rln-signers';
export type { IRLNSigner, RLNKeyMaterial } from './wallet/rln-signers';

// Binding and signer (for advanced / testing use)
export { RNRgbLibBinding } from './binding/RNRgbLibBinding';
export { RLNBinding } from './binding/RLNBinding';
export { RNSigner } from './signer/RNSigner';
export type * from './binding/rln-types';
export type {
  IRLN,
  IRLNNodeCreateParams,
  IRLNUnlockParams,
  IRLNExternalSignerBootstrap,
} from './binding/IRLN';

/** @deprecated Use RLNManager + RLNBinding instead. */
export { RLNRgbLibBinding } from './binding/RLNRgbLibBinding';

// Crypto — PSBT signing (RN-specific, uses bdk-rn)
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
