/**
 * UTEXOWallet - Wallet class for UTEXO operations (React Native)
 *
 * Provides a wallet interface that accepts a mnemonic or seed for initialization.
 * Implements both IWalletManager (standard RGB operations) and IUTEXOProtocol
 * (UTEXO-specific Lightning and on-chain operations).
 */

import type { Network, EstimateFeeResult } from '../crypto';
import { deriveKeysFromMnemonicOrSeed } from '../crypto';
import { utexoNetworkMap, utexoNetworkIdMap, getDestinationAsset } from '../constants/utexo-network';
import { WalletManager } from '../wallet/wallet-manager';
import { ValidationError, WalletError } from '../errors';
import type { IWalletManager } from '../wallet/IWalletManager';
import type { IUTEXOProtocol } from './IUTEXOProtocol';
import { UTEXOProtocol } from './utexo-protocol';
import { bridgeAPI } from '../client/bridge';
import { fromUnitsNumber, toUnitsNumber } from '../utils/units';
import type {
  PublicKeys,
  CreateLightningInvoiceRequestModel,
  LightningReceiveRequest,
  LightningSendRequest,
  GetLightningSendFeeEstimateRequestModel,
  PayLightningInvoiceRequestModel,
  PayLightningInvoiceEndRequestModel,
  OnchainSendRequestModel,
  OnchainSendResponse,
  ListLightningPaymentsResponse,
  OnchainReceiveRequestModel,
  OnchainReceiveResponse,
  OnchainSendEndRequestModel,
  CreateUtxosBeginRequestModel,
  CreateUtxosEndRequestModel,
  FailTransfersRequest,
  InvoiceRequest,
  InvoiceReceiveData,
  IssueAssetNiaRequestModel,
  IssueAssetIfaRequestModel,
  SendAssetBeginRequestModel,
  SendAssetEndRequestModel,
  SendResult,
  BtcBalance,
  Unspent,
  WalletBackupResponse,
  SendBtcBeginRequestModel,
  SendBtcEndRequestModel,
  GetFeeEstimationResponse,
  InflateAssetIfaRequestModel,
  InflateEndRequestModel,
  OperationResult,
  AssetNIA,
  AssetBalance,
  ListAssets,
  Transaction,
  Transfer,
  InvoiceData,
  TransferStatus,
} from '../types/rgb-model';

export interface ConfigOptions {
  network?: Network;
}

/**
 * UTEXOWallet - Combines standard RGB wallet operations with UTEXO protocol features.
 *
 * Architecture:
 * - Implements IWalletManager for standard RGB operations (delegated to WalletManager)
 * - Implements IUTEXOProtocol for UTEXO-specific operations (Lightning, on-chain sends)
 * - Manages two WalletManager instances: layer1 (Bitcoin mainnet) and utexo (UTEXO/signet)
 */
export class UTEXOWallet extends UTEXOProtocol implements IWalletManager, IUTEXOProtocol {
  private readonly mnemonicOrSeed: string | Uint8Array;
  private layer1Keys: PublicKeys | null = null;
  private utexoKeys: PublicKeys | null = null;
  private layer1RGBWallet: WalletManager | null = null;
  private utexoRGBWallet: WalletManager | null = null;

  /**
   * Creates a new UTEXOWallet instance.
   *
   * @param mnemonicOrSeed - Either a BIP39 mnemonic phrase (string) or a raw seed (Uint8Array)
   * @param options - Optional configuration (network, etc.)
   */
  constructor(mnemonicOrSeed: string | Uint8Array, _options: ConfigOptions = {}) {
    super();
    this.mnemonicOrSeed = mnemonicOrSeed;
  }

  /**
   * Initialise the wallet: derives keys and creates the two internal WalletManager instances.
   * Must be called before any other operation.
   */
  async initialize(): Promise<void> {
    this.layer1Keys = await this.derivePublicKeys(utexoNetworkMap.mainnet);
    this.utexoKeys = await this.derivePublicKeys(utexoNetworkMap.utexo);

    const commonParams = {
      xpubCol: this.utexoKeys.accountXpubColored,
      masterFingerprint: this.utexoKeys.masterFingerprint,
      network: utexoNetworkMap.utexo,
      ...(this.mnemonicOrSeed instanceof Uint8Array
        ? { seed: this.mnemonicOrSeed }
        : { mnemonic: this.mnemonicOrSeed }),
    };

    this.utexoRGBWallet = new WalletManager({
      xpubVan: this.utexoKeys.accountXpubVanilla,
      ...commonParams,
    });

    this.layer1RGBWallet = new WalletManager({
      xpubVan: this.layer1Keys.accountXpubVanilla,
      xpubCol: this.layer1Keys.accountXpubVanilla,
      masterFingerprint: this.layer1Keys.masterFingerprint,
      network: utexoNetworkMap.mainnet,
      ...(this.mnemonicOrSeed instanceof Uint8Array
        ? { seed: this.mnemonicOrSeed }
        : { mnemonic: this.mnemonicOrSeed }),
    });
  }

  /**
   * Derives public keys from the wallet's mnemonic or seed for a given network.
   *
   * @param network - Bitcoin network identifier
   * @returns Derived public keys (xpub, accountXpubs, masterFingerprint)
   */
  async derivePublicKeys(network: Network): Promise<PublicKeys> {
    const generatedKeys = await deriveKeysFromMnemonicOrSeed(network, this.mnemonicOrSeed);
    const { xpub, accountXpubVanilla, accountXpubColored, masterFingerprint } = generatedKeys;
    return { xpub, accountXpubVanilla, accountXpubColored, masterFingerprint };
  }

  async getPubKeys(): Promise<PublicKeys> {
    if (!this.layer1Keys) {
      throw new ValidationError('Public keys are not set', 'publicKeys');
    }
    return this.layer1Keys;
  }

  /**
   * Throws if the wallet has not been initialised yet.
   */
  private ensureInitialized(): void {
    if (!this.utexoRGBWallet) {
      throw new WalletError('Wallet not initialized. Call initialize() first.');
    }
  }

  // ==========================================
  // IWalletManager Implementation
  // ==========================================

  async goOnline(_indexerUrl: string, _skipConsistencyCheck?: boolean): Promise<void> {
    this.ensureInitialized();
    throw new Error('goOnline not implemented');
  }

  getXpub(): { xpubVan: string; xpubCol: string } {
    this.ensureInitialized();
    return this.utexoRGBWallet!.getXpub();
  }

  getNetwork(): Network {
    this.ensureInitialized();
    return this.utexoRGBWallet!.getNetwork();
  }

  async dispose(): Promise<void> {
    if (this.layer1RGBWallet) await this.layer1RGBWallet.dispose();
    if (this.utexoRGBWallet) await this.utexoRGBWallet.dispose();
  }

  isDisposed(): boolean {
    if (!this.utexoRGBWallet) return false;
    return this.utexoRGBWallet.isDisposed();
  }

  async getBtcBalance(): Promise<BtcBalance> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.getBtcBalance();
  }

  async getAddress(): Promise<string> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.getAddress();
  }

  async listUnspents(): Promise<Unspent[]> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.listUnspents();
  }

  async createUtxosBegin(params: CreateUtxosBeginRequestModel): Promise<string> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.createUtxosBegin(params);
  }

  async createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.createUtxosEnd(params);
  }

  async createUtxos(params: {
    upTo?: boolean;
    num?: number;
    size?: number;
    feeRate?: number;
  }): Promise<number> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.createUtxos(params);
  }

  async listAssets(): Promise<ListAssets> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.listAssets();
  }

  async getAssetBalance(asset_id: string): Promise<AssetBalance> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.getAssetBalance(asset_id);
  }

  async issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.issueAssetNia(params);
  }

  async issueAssetIfa(params: IssueAssetIfaRequestModel): Promise<any> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.issueAssetIfa(params);
  }

  async inflateBegin(params: InflateAssetIfaRequestModel): Promise<string> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.inflateBegin(params);
  }

  async inflateEnd(params: InflateEndRequestModel): Promise<OperationResult> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.inflateEnd(params);
  }

  async inflate(
    params: InflateAssetIfaRequestModel,
    mnemonic?: string
  ): Promise<OperationResult> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.inflate(params, mnemonic);
  }

  async sendBegin(params: SendAssetBeginRequestModel): Promise<string> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.sendBegin(params);
  }

  async sendEnd(params: SendAssetEndRequestModel): Promise<SendResult> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.sendEnd(params);
  }

  async send(
    invoiceTransfer: SendAssetBeginRequestModel,
    mnemonic?: string
  ): Promise<SendResult> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.send(invoiceTransfer, mnemonic);
  }

  async sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.sendBtcBegin(params);
  }

  async sendBtcEnd(params: SendBtcEndRequestModel): Promise<string> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.sendBtcEnd(params);
  }

  async sendBtc(params: SendBtcBeginRequestModel): Promise<string> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.sendBtc(params);
  }

  async blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.blindReceive(params);
  }

  async witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.witnessReceive(params);
  }

  async decodeRGBInvoice(params: { invoice: string }): Promise<InvoiceData> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.decodeRGBInvoice(params);
  }

  async listTransactions(): Promise<Transaction[]> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.listTransactions();
  }

  async listTransfers(asset_id?: string): Promise<Transfer[]> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.listTransfers(asset_id);
  }

  async failTransfers(params: FailTransfersRequest): Promise<boolean> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.failTransfers(params);
  }

  async refreshWallet(): Promise<void> {
    this.ensureInitialized();
    await this.utexoRGBWallet!.refreshWallet();
  }

  async syncWallet(): Promise<void> {
    this.ensureInitialized();
    await this.utexoRGBWallet!.syncWallet();
  }

  async estimateFeeRate(blocks: number): Promise<GetFeeEstimationResponse> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.estimateFeeRate(blocks);
  }

  async estimateFee(psbtBase64: string): Promise<EstimateFeeResult> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.estimateFee(psbtBase64);
  }

  async createBackup(params: {
    backupPath: string;
    password: string;
  }): Promise<WalletBackupResponse> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.createBackup(params);
  }

  async signPsbt(psbt: string, mnemonic?: string): Promise<string> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.signPsbt(psbt, mnemonic);
  }

  async signMessage(message: string): Promise<string> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.signMessage(message);
  }

  async verifyMessage(
    message: string,
    signature: string,
    _accountXpub?: string
  ): Promise<boolean> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.verifyMessage(message, signature);
  }

  // ==========================================
  // IUTEXOProtocol Implementation
  // ==========================================

  /**
   * Creates a Lightning invoice to receive assets on the UTEXO layer via the bridge.
   * The bridge routes a Lightning payment on L1 to a witness RGB invoice on UTEXO.
   */
  async createLightningInvoice(
    params: CreateLightningInvoiceRequestModel
  ): Promise<LightningReceiveRequest> {
    this.ensureInitialized();

    const { asset } = params;
    if (!asset?.assetId) {
      throw new ValidationError('Asset ID is required', 'assetId');
    }
    if (!asset?.amount) {
      throw new ValidationError('Amount is required', 'amount');
    }

    const destinationAsset = getDestinationAsset('mainnet', 'utexo', asset.assetId);
    if (!destinationAsset) {
      throw new ValidationError('Destination asset is not supported', 'assetId');
    }

    const destinationInvoice = await this.utexoRGBWallet!.witnessReceive({
      assetId: '',
      amount: asset.amount,
    });

    const bridgeTransfer = await bridgeAPI.getBridgeInSignature({
      sender: {
        address: 'rgb-address',
        networkName: utexoNetworkIdMap.mainnetLightning.networkName,
        networkId: utexoNetworkIdMap.mainnetLightning.networkId,
      },
      tokenId: destinationAsset.tokenId,
      amount: asset.amount.toString(),
      destination: {
        address: destinationInvoice.invoice,
        networkName: utexoNetworkIdMap.utexo.networkName,
        networkId: utexoNetworkIdMap.utexo.networkId,
      },
      additionalAddresses: [],
    });

    const hexInvoice = bridgeTransfer.signature;
    const hex = hexInvoice.startsWith('0x') ? hexInvoice.slice(2) : hexInvoice;
    const decodedLnInvoice = Buffer.from(hex, 'hex').toString('utf-8');

    return { lnInvoice: decodedLnInvoice };
  }

  /**
   * Begins paying a Lightning invoice using the UTEXO bridge.
   * Resolves the bridge transfer from the invoice, then builds a PSBT to sign.
   */
  async payLightningInvoiceBegin(
    params: PayLightningInvoiceRequestModel
  ): Promise<string> {
    this.ensureInitialized();

    const bridgeTransfer = await bridgeAPI.getTransferByMainnetInvoice(
      params.lnInvoice,
      utexoNetworkIdMap.mainnetLightning.networkId
    );

    if (!bridgeTransfer) {
      // Bridge-out flow: UTEXO → Mainnet Lightning
      if (!params.assetId) {
        throw new ValidationError('Asset ID is required for external invoice', 'assetId');
      }
      if (!params.amount) {
        throw new ValidationError('Amount is required for external invoice', 'amount');
      }

      const destinationAsset = getDestinationAsset(
        'utexo',
        'mainnetLightning',
        params.assetId
      );
      if (!destinationAsset) {
        throw new ValidationError('Destination asset is not supported', 'assetId');
      }

      const bridgeOutTransfer = await bridgeAPI.getBridgeInSignature({
        sender: {
          address: 'rgb-address',
          networkName: utexoNetworkIdMap.utexo.networkName,
          networkId: utexoNetworkIdMap.utexo.networkId,
        },
        tokenId: destinationAsset.tokenId,
        amount: params.amount.toString(),
        destination: {
          address: params.lnInvoice,
          networkName: utexoNetworkIdMap.mainnetLightning.networkName,
          networkId: utexoNetworkIdMap.mainnetLightning.networkId,
        },
        additionalAddresses: [],
      });

      const hex = bridgeOutTransfer.signature.startsWith('0x')
        ? bridgeOutTransfer.signature.slice(2)
        : bridgeOutTransfer.signature;
      const decodedInvoice = Buffer.from(hex, 'hex').toString('utf-8');
      const isWitness = decodedInvoice.includes('wvout:');

      return this.utexoRGBWallet!.sendBegin({
        invoice: decodedInvoice,
        amount: Number(bridgeOutTransfer.amount),
        assetId: destinationAsset.assetId,
        ...(isWitness && { witnessData: { amountSat: 1000, blinding: 0 } }),
      });
    }

    const bridgeAmount = bridgeTransfer.recipientAmount;
    const utexoInvoice = bridgeTransfer.recipient.address;
    const invoiceData = await this.decodeRGBInvoice({ invoice: utexoInvoice });
    const destinationAsset = utexoNetworkIdMap.utexo.getAssetById(
      bridgeTransfer.recipientToken.id
    );
    if (!destinationAsset) {
      throw new ValidationError('Destination asset is not supported', 'assetId');
    }

    const amount = toUnitsNumber(bridgeAmount, destinationAsset.precision);
    const isWitness = invoiceData.recipientId.includes('wvout:');

    return this.utexoRGBWallet!.sendBegin({
      invoice: utexoInvoice,
      amount,
      assetId: destinationAsset.assetId,
      ...(isWitness && { witnessData: { amountSat: 1000, blinding: 0 } }),
    });
  }

  /**
   * Completes a Lightning invoice payment using a signed PSBT.
   */
  async payLightningInvoiceEnd(
    params: PayLightningInvoiceEndRequestModel
  ): Promise<LightningSendRequest> {
    this.ensureInitialized();
    const sendResult = await this.utexoRGBWallet!.sendEnd({
      signedPsbt: params.signedPsbt,
    });
    return sendResult as LightningSendRequest;
  }

  /**
   * Pays a Lightning invoice (convenience: begin → sign → end).
   */
  async payLightningInvoice(
    params: PayLightningInvoiceRequestModel,
    mnemonic?: string
  ): Promise<LightningSendRequest> {
    this.ensureInitialized();
    const psbt = await this.payLightningInvoiceBegin(params);
    const signedPsbt = await this.utexoRGBWallet!.signPsbt(psbt, mnemonic);
    return this.payLightningInvoiceEnd({
      signedPsbt,
      lnInvoice: params.lnInvoice,
    });
  }

  /**
   * Returns the transfer status for a Lightning receive invoice.
   */
  async getLightningReceiveRequest(lnInvoice: string): Promise<TransferStatus | null> {
    this.ensureInitialized();
    const bridgeTransfer = await bridgeAPI.getTransferByMainnetInvoice(
      lnInvoice,
      utexoNetworkIdMap.mainnetLightning.networkId
    );
    if (!bridgeTransfer) {
      throw new ValidationError('Bridge transfer is not found', 'lnInvoice');
    }
    const utexoInvoice = bridgeTransfer.recipient.address;
    const invoiceData = await this.decodeRGBInvoice({ invoice: utexoInvoice });
    const destinationAsset = utexoNetworkIdMap.utexo.getAssetById(
      bridgeTransfer.recipientToken.id
    );
    const transfers = await this.utexoRGBWallet!.listTransfers(destinationAsset?.assetId);
    return (
      transfers.find((t) => t.recipientId === invoiceData.recipientId)?.status ?? null
    );
  }

  /**
   * Returns the transfer status for a Lightning send request.
   */
  async getLightningSendRequest(lnInvoice: string): Promise<TransferStatus | null> {
    this.ensureInitialized();
    const bridgeTransfer = await bridgeAPI.getTransferByMainnetInvoice(
      lnInvoice,
      utexoNetworkIdMap.mainnetLightning.networkId
    );
    if (!bridgeTransfer) {
      throw new ValidationError('Bridge transfer is not found', 'lnInvoice');
    }
    const utexoInvoice = bridgeTransfer.recipient.address;
    const invoiceData = await this.decodeRGBInvoice({ invoice: utexoInvoice });
    const destinationAsset = utexoNetworkIdMap.utexo.getAssetById(
      bridgeTransfer.recipientToken.id
    );
    const transfers = await this.utexoRGBWallet!.listTransfers(destinationAsset?.assetId);
    return (
      transfers.find((t) => t.recipientId === invoiceData.recipientId)?.status ?? null
    );
  }

  async getLightningSendFeeEstimate(
    _params: GetLightningSendFeeEstimateRequestModel
  ): Promise<number> {
    throw new Error('getLightningSendFeeEstimate not implemented');
  }

  async listLightningPayments(): Promise<ListLightningPaymentsResponse> {
    throw new Error('listLightningPayments not implemented');
  }

  /**
   * Creates a receive invoice for an on-chain (mainnet → UTEXO) bridge transfer.
   */
  async onchainReceive(
    params: OnchainReceiveRequestModel
  ): Promise<OnchainReceiveResponse> {
    this.ensureInitialized();

    const destinationAsset = getDestinationAsset(
      'mainnet',
      'utexo',
      params.assetId ?? null
    );
    if (!destinationAsset) {
      throw new ValidationError('Destination asset is not supported', 'assetId');
    }
    if (!params.amount) {
      throw new ValidationError('Amount is required', 'amount');
    }

    const destinationInvoice = await this.utexoRGBWallet!.witnessReceive({
      assetId: '',
      amount: params.amount,
      minConfirmations: params.minConfirmations,
      durationSeconds: params.durationSeconds,
    });

    const bridgeTransfer = await bridgeAPI.getBridgeInSignature({
      sender: {
        address: 'rgb-address',
        networkName: utexoNetworkIdMap.mainnet.networkName,
        networkId: utexoNetworkIdMap.mainnet.networkId,
      },
      tokenId: destinationAsset.tokenId,
      amount: params.amount.toString(),
      destination: {
        address: destinationInvoice.invoice,
        networkName: utexoNetworkIdMap.utexo.networkName,
        networkId: utexoNetworkIdMap.utexo.networkId,
      },
      additionalAddresses: [],
    });

    const hexInvoice = bridgeTransfer.signature;
    const hex = hexInvoice.startsWith('0x') ? hexInvoice.slice(2) : hexInvoice;
    const decodedInvoice = Buffer.from(hex, 'hex').toString('utf-8');

    return { invoice: decodedInvoice };
  }

  /**
   * Begins an on-chain send (UTEXO → mainnet) via the bridge. Returns a PSBT to sign.
   */
  async onchainSendBegin(params: OnchainSendRequestModel): Promise<string> {
    this.ensureInitialized();

    const bridgeTransfer = await bridgeAPI.getTransferByMainnetInvoice(
      params.invoice,
      utexoNetworkIdMap.mainnet.networkId
    );

    if (!bridgeTransfer) {
      // Bridge-out flow: UTEXO → Mainnet
      if (!params.assetId) {
        throw new ValidationError('Asset ID is required for external invoice', 'assetId');
      }

      const invoiceData = await this.decodeRGBInvoice({ invoice: params.invoice });
      const assetId = params.assetId ?? invoiceData.assetId;
      const destinationAsset = getDestinationAsset('utexo', 'mainnet', assetId ?? null);
      if (!destinationAsset) {
        throw new ValidationError('Destination asset is not supported', 'assetId');
      }

      if (!params.amount && !invoiceData.assignment.amount) {
        throw new ValidationError('Amount is required for external invoice', 'amount');
      }

      const amount =
        params.amount ??
        fromUnitsNumber(invoiceData.assignment.amount!, destinationAsset.precision);

      const bridgeOutTransfer = await bridgeAPI.getBridgeInSignature({
        sender: {
          address: 'rgb-address',
          networkName: utexoNetworkIdMap.utexo.networkName,
          networkId: utexoNetworkIdMap.utexo.networkId,
        },
        tokenId: destinationAsset.tokenId,
        amount: amount.toString(),
        destination: {
          address: params.invoice,
          networkName: utexoNetworkIdMap.mainnet.networkName,
          networkId: utexoNetworkIdMap.mainnet.networkId,
        },
        additionalAddresses: [],
      });

      const hex = bridgeOutTransfer.signature.startsWith('0x')
        ? bridgeOutTransfer.signature.slice(2)
        : bridgeOutTransfer.signature;
      const decodedInvoice = Buffer.from(hex, 'hex').toString('utf-8');
      const isWitness = decodedInvoice.includes('wvout:');

      return this.utexoRGBWallet!.sendBegin({
        invoice: decodedInvoice,
        amount: Number(bridgeOutTransfer.amount),
        assetId: destinationAsset.assetId,
        ...(isWitness && { witnessData: { amountSat: 1000, blinding: 0 } }),
      });
    }

    const utexoInvoice = bridgeTransfer.recipient.address;
    const invoiceData = await this.decodeRGBInvoice({ invoice: utexoInvoice });
    const bridgeAmount = bridgeTransfer.recipientAmount;
    const destinationAsset = utexoNetworkIdMap.utexo.getAssetById(
      bridgeTransfer.recipientToken.id
    );
    if (!destinationAsset) {
      throw new ValidationError('Destination asset is not supported', 'assetId');
    }

    const amount = toUnitsNumber(bridgeAmount, destinationAsset.precision);
    const assetBalance = await this.getAssetBalance(destinationAsset.assetId);

    if (!assetBalance?.spendable) {
      throw new ValidationError('Asset balance is not found', 'assetBalance');
    }
    if (assetBalance.spendable < amount) {
      throw new ValidationError(
        `Insufficient balance ${assetBalance.spendable} < ${amount}`,
        'amount'
      );
    }

    const isWitness = invoiceData.recipientId.includes('wvout:');

    return this.utexoRGBWallet!.sendBegin({
      invoice: utexoInvoice,
      amount,
      assetId: destinationAsset.assetId,
      ...(isWitness && { witnessData: { amountSat: 1000, blinding: 0 } }),
    });
  }

  /**
   * Completes an on-chain send using a signed PSBT.
   */
  async onchainSendEnd(
    params: OnchainSendEndRequestModel
  ): Promise<OnchainSendResponse> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.sendEnd({ signedPsbt: params.signedPsbt });
  }

  /**
   * Sends assets on-chain (convenience: begin → sign → end).
   */
  async onchainSend(
    params: OnchainSendRequestModel,
    mnemonic?: string
  ): Promise<OnchainSendResponse> {
    this.ensureInitialized();
    const psbt = await this.onchainSendBegin(params);
    const signedPsbt = await this.utexoRGBWallet!.signPsbt(psbt, mnemonic);
    return this.onchainSendEnd({ signedPsbt, invoice: params.invoice });
  }

  /**
   * Returns the transfer status for an on-chain send identified by its mainnet invoice.
   */
  async getOnchainSendStatus(invoice: string): Promise<TransferStatus | null> {
    this.ensureInitialized();
    const bridgeTransfer = await bridgeAPI.getTransferByMainnetInvoice(
      invoice,
      utexoNetworkIdMap.mainnet.networkId
    );
    if (!bridgeTransfer) {
      throw new ValidationError('Bridge transfer is not found', 'invoice');
    }
    const utexoInvoice = bridgeTransfer.recipient.address;
    const invoiceData = await this.decodeRGBInvoice({ invoice: utexoInvoice });
    const destinationAsset = utexoNetworkIdMap.utexo.getAssetById(
      bridgeTransfer.recipientToken.id
    );
    const transfers = await this.utexoRGBWallet!.listTransfers(destinationAsset?.assetId);
    return (
      transfers.find((t) => t.recipientId === invoiceData.recipientId)?.status ?? null
    );
  }

  /**
   * Lists on-chain transfers for a specific asset (or all assets).
   */
  async listOnchainTransfers(asset_id?: string): Promise<Transfer[]> {
    this.ensureInitialized();
    return this.utexoRGBWallet!.listTransfers(asset_id);
  }
}
