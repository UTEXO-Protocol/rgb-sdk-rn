import { RLNBinding } from '../binding/RLNBinding';
import type {
  IRLN,
  IRLNNodeCreateParams,
  IRLNUnlockParams,
  IRLNExternalSignerBootstrap,
} from '../binding/IRLN';
import type {
  RlnNodeInfo,
  RlnNetworkInfo,
  RlnPeer,
  RlnChannel,
  RlnOpenChannelResponse,
  RlnPayment,
  RlnSendPaymentResponse,
  RlnKeysendResponse,
  RlnInvoiceStatus,
  RlnLnInvoiceResponse,
  RlnDecodeLnInvoiceResponse,
  RlnDecodeRgbInvoiceResponse,
  RlnAddressResponse,
  RlnBtcBalance,
  RlnSendBtcResponse,
  RlnEstimateFeeResponse,
  RlnCheckIndexerUrlResponse,
  RlnAssetBalance,
  RlnListAssetsResponse,
  RlnRgbInvoiceResponse,
  RlnSendRgbResponse,
  RlnTransaction,
  RlnTransfer,
  RlnUnspent,
  RlnFailTransfersResponse,
} from '../binding/rln-types';

export class RLNManager implements IRLN {
  private readonly rlnBinding: RLNBinding;

  constructor() {
    this.rlnBinding = new RLNBinding();
  }

  // ── Node lifecycle ──────────────────────────────────────────────────────────

  rlnCreateNode(params: IRLNNodeCreateParams): Promise<number> {
    return this.rlnBinding.rlnCreateNode(params);
  }

  rlnInitNode(password: string, mnemonic?: string): Promise<string> {
    return this.rlnBinding.rlnInitNode(password, mnemonic);
  }

  rlnUnlockNode(params: { password: string } & IRLNUnlockParams): Promise<void> {
    return this.rlnBinding.rlnUnlockNode(params);
  }

  rlnShutdown(): Promise<void> {
    return this.rlnBinding.rlnShutdown();
  }

  rlnDestroyNode(): Promise<void> {
    return this.rlnBinding.rlnDestroyNode();
  }

  consumeRlnUnlockConflictNormalized(): boolean {
    return this.rlnBinding.consumeRlnUnlockConflictNormalized();
  }

  // ── External signer ─────────────────────────────────────────────────────────

  rlnCreateNativeExternalSigner(
    seedHex: string,
    network: string,
    permissivePolicy?: boolean
  ): Promise<number> {
    return this.rlnBinding.rlnCreateNativeExternalSigner(seedHex, network, permissivePolicy);
  }

  rlnInitNodeWithNativeExternalSigner(signerId: number): Promise<void> {
    return this.rlnBinding.rlnInitNodeWithNativeExternalSigner(signerId);
  }

  rlnAttachNativeExternalSigner(signerId: number): Promise<void> {
    return this.rlnBinding.rlnAttachNativeExternalSigner(signerId);
  }

  rlnUnlockNodeWithNativeExternalSigner(
    signerId: number,
    params: IRLNUnlockParams
  ): Promise<void> {
    return this.rlnBinding.rlnUnlockNodeWithNativeExternalSigner(signerId, params);
  }

  rlnDestroyNativeExternalSigner(signerId: number): Promise<void> {
    return this.rlnBinding.rlnDestroyNativeExternalSigner(signerId);
  }

  rlnInitNodeWithExternalSigner(bootstrap: IRLNExternalSignerBootstrap): Promise<void> {
    return this.rlnBinding.rlnInitNodeWithExternalSigner(bootstrap);
  }

  // ── Node info ───────────────────────────────────────────────────────────────

  rlnNodeInfo(): Promise<RlnNodeInfo> {
    return this.rlnBinding.rlnNodeInfo();
  }

  rlnNetworkInfo(): Promise<RlnNetworkInfo> {
    return this.rlnBinding.rlnNetworkInfo();
  }

  // ── Peers ───────────────────────────────────────────────────────────────────

  rlnConnectPeer(peerPubkeyAndAddr: string): Promise<void> {
    return this.rlnBinding.rlnConnectPeer(peerPubkeyAndAddr);
  }

  rlnListPeers(): Promise<RlnPeer[]> {
    return this.rlnBinding.rlnListPeers();
  }

  rlnDisconnectPeer(peerPubkey: string): Promise<void> {
    return this.rlnBinding.rlnDisconnectPeer(peerPubkey);
  }

  // ── Channels ────────────────────────────────────────────────────────────────

  rlnListChannels(): Promise<RlnChannel[]> {
    return this.rlnBinding.rlnListChannels();
  }

  rlnOpenChannel(request: {
    peerPubkeyAndOptAddr: string;
    capacitySat: number;
    pushMsat: number;
    public: boolean;
    withAnchors: boolean;
    feeBaseMsat?: number | null;
    feeProportionalMillionths?: number | null;
    temporaryChannelId?: string | null;
    assetId?: string | null;
    assetAmount?: number | null;
    pushAssetAmount?: number | null;
    virtualOpenMode?: string | null;
  }): Promise<RlnOpenChannelResponse> {
    return this.rlnBinding.rlnOpenChannel(request);
  }

  rlnCloseChannel(channelId: string, peerPubkey: string, force: boolean): Promise<void> {
    return this.rlnBinding.rlnCloseChannel(channelId, peerPubkey, force);
  }

  rlnGetChannelId(temporaryChannelId: string): Promise<string> {
    return this.rlnBinding.rlnGetChannelId(temporaryChannelId);
  }

  // ── Payments ─────────────────────────────────────────────────────────────────

  rlnListPayments(): Promise<RlnPayment[]> {
    return this.rlnBinding.rlnListPayments();
  }

  rlnGetPayment(paymentHash: string): Promise<RlnPayment> {
    return this.rlnBinding.rlnGetPayment(paymentHash);
  }

  rlnInvoiceStatus(invoice: string): Promise<RlnInvoiceStatus> {
    return this.rlnBinding.rlnInvoiceStatus(invoice);
  }

  rlnLnInvoice(
    amtMsat: number | null,
    expirySec: number,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<RlnLnInvoiceResponse> {
    return this.rlnBinding.rlnLnInvoice(amtMsat, expirySec, assetId, assetAmount);
  }

  rlnDecodeLnInvoice(invoice: string): Promise<RlnDecodeLnInvoiceResponse> {
    return this.rlnBinding.rlnDecodeLnInvoice(invoice);
  }

  rlnDecodeRgbInvoice(invoice: string): Promise<RlnDecodeRgbInvoiceResponse> {
    return this.rlnBinding.rlnDecodeRgbInvoice(invoice);
  }

  rlnSendPayment(
    invoice: string,
    amtMsat: number | null,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<RlnSendPaymentResponse> {
    return this.rlnBinding.rlnSendPayment(invoice, amtMsat, assetId, assetAmount);
  }

  rlnKeysend(
    destPubkey: string,
    amtMsat: number,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<RlnKeysendResponse> {
    return this.rlnBinding.rlnKeysend(destPubkey, amtMsat, assetId, assetAmount);
  }

  // ── On-chain wallet ──────────────────────────────────────────────────────────

  rlnAddress(): Promise<RlnAddressResponse> {
    return this.rlnBinding.rlnAddress();
  }

  rlnBtcBalance(skipSync?: boolean): Promise<RlnBtcBalance> {
    return this.rlnBinding.rlnBtcBalance(skipSync);
  }

  rlnSendBtc(
    amount: number,
    address: string,
    feeRate: number,
    skipSync: boolean
  ): Promise<RlnSendBtcResponse> {
    return this.rlnBinding.rlnSendBtc(amount, address, feeRate, skipSync);
  }

  // ── Assets / transfers ──────────────────────────────────────────────────────

  rlnIssueAssetNia(ticker: string, name: string, precision: number, amounts: number[]): Promise<any> {
    return this.rlnBinding.rlnIssueAssetNia(ticker, name, precision, amounts);
  }

  rlnIssueAssetCfa(name: string, details: string | null, precision: number, amounts: number[], fileDigest: string | null): Promise<any> {
    return this.rlnBinding.rlnIssueAssetCfa(name, details, precision, amounts, fileDigest);
  }

  rlnIssueAssetIfa(ticker: string, name: string, precision: number, amounts: number[], inflationAmounts: number[], rejectListUrl: string | null): Promise<any> {
    return this.rlnBinding.rlnIssueAssetIfa(ticker, name, precision, amounts, inflationAmounts, rejectListUrl);
  }

  rlnIssueAssetUda(ticker: string, name: string, details: string | null, precision: number, mediaFileDigest: string | null, attachmentsFileDigests: string[]): Promise<any> {
    return this.rlnBinding.rlnIssueAssetUda(ticker, name, details, precision, mediaFileDigest, attachmentsFileDigests);
  }

  rlnListAssets(filterAssetSchemas: string[]): Promise<RlnListAssetsResponse> {
    return this.rlnBinding.rlnListAssets(filterAssetSchemas);
  }

  rlnAssetBalance(assetId: string): Promise<RlnAssetBalance> {
    return this.rlnBinding.rlnAssetBalance(assetId);
  }

  rlnRgbInvoice(
    assetId: string | null,
    assignmentAmount: number | null,
    durationSeconds: number | null,
    minConfirmations: number,
    witness: boolean
  ): Promise<RlnRgbInvoiceResponse> {
    return this.rlnBinding.rlnRgbInvoice(assetId, assignmentAmount, durationSeconds, minConfirmations, witness);
  }

  rlnSendRgb(
    donation: boolean,
    feeRate: number,
    minConfirmations: number,
    skipSync: boolean,
    assetId: string,
    recipientId: string,
    amount: number,
    transportEndpoints: string[]
  ): Promise<RlnSendRgbResponse> {
    return this.rlnBinding.rlnSendRgb(donation, feeRate, minConfirmations, skipSync, assetId, recipientId, amount, transportEndpoints);
  }

  rlnListTransactions(skipSync: boolean): Promise<RlnTransaction[]> {
    return this.rlnBinding.rlnListTransactions(skipSync);
  }

  rlnListTransfers(assetId: string): Promise<RlnTransfer[]> {
    return this.rlnBinding.rlnListTransfers(assetId);
  }

  rlnListUnspents(skipSync: boolean): Promise<RlnUnspent[]> {
    return this.rlnBinding.rlnListUnspents(skipSync);
  }

  rlnRefreshTransfers(skipSync: boolean): Promise<void> {
    return this.rlnBinding.rlnRefreshTransfers(skipSync);
  }

  rlnFailTransfers(
    batchTransferIdx: number | null,
    noAssetOnly: boolean,
    skipSync: boolean
  ): Promise<RlnFailTransfersResponse> {
    return this.rlnBinding.rlnFailTransfers(batchTransferIdx, noAssetOnly, skipSync);
  }

  // ── Utility ─────────────────────────────────────────────────────────────────

  rlnEstimateFee(blocks: number): Promise<RlnEstimateFeeResponse> {
    return this.rlnBinding.rlnEstimateFee(blocks);
  }

  rlnCheckIndexerUrl(indexerUrl: string): Promise<RlnCheckIndexerUrlResponse> {
    return this.rlnBinding.rlnCheckIndexerUrl(indexerUrl);
  }

  rlnCheckProxyEndpoint(proxyEndpoint: string): Promise<void> {
    return this.rlnBinding.rlnCheckProxyEndpoint(proxyEndpoint);
  }

  rlnSync(): Promise<void> {
    return this.rlnBinding.rlnSync();
  }

  rlnCreateUtxos(
    upTo: boolean,
    num: number | null,
    size: number | null,
    feeRate: number,
    skipSync: boolean
  ): Promise<void> {
    return this.rlnBinding.rlnCreateUtxos(upTo, num, size, feeRate, skipSync);
  }

  // ── Backup ───────────────────────────────────────────────────────────────────

  rlnBackup(backupPath: string, password: string): Promise<void> {
    return this.rlnBinding.rlnBackup(backupPath, password);
  }
}

export function createRLNManager(): RLNManager {
  return new RLNManager();
}
