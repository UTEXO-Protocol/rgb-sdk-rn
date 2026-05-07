/**
 * @deprecated Use {@link RLNManager} with {@link RLNBinding} instead.
 * RLNRgbLibBinding will be removed in a future release.
 */
import type { WalletInitParams, IUTEXOProtocol } from '@utexo/rgb-sdk-core';
import { WalletError } from '@utexo/rgb-sdk-core';
import Rgb from './NativeRgb';
import type {
  CreateLightningInvoiceRequestModel,
  LightningReceiveRequest,
  GetLightningSendFeeEstimateRequestModel,
  PayLightningInvoiceRequestModel,
  LightningSendRequest,
  OnchainReceiveRequestModel,
  OnchainReceiveResponse,
  OnchainSendRequestModel,
  SendAssetEndRequestModel,
  OnchainSendResponse,
  OnchainSendStatus,
  TransferStatus,
  Transfer,
  ListLightningPaymentsResponse,
} from './rln-types';
import { RNRgbLibBinding } from './RNRgbLibBinding';

type ProtocolMethodNames =
  | 'createLightningInvoice'
  | 'getLightningReceiveRequest'
  | 'getLightningSendRequest'
  | 'getLightningSendFeeEstimate'
  | 'payLightningInvoiceBegin'
  | 'payLightningInvoiceEnd'
  | 'payLightningInvoice'
  | 'listLightningPayments'
  | 'onchainReceive'
  | 'onchainSendBegin'
  | 'onchainSendEnd'
  | 'onchainSend'
  | 'getOnchainSendStatus'
  | 'listOnchainTransfers';

/**
 * RLNRgbLibBinding extends the regular RN rgb-lib binding with the UTEXO
 * protocol surface expected by RLN integrations.
 *
 * The protocol calls can be delegated to an adapter (for now usually
 * UTEXOWalletCore-backed logic). When adapter methods are not provided yet,
 * explicit errors are thrown so callers can distinguish unsupported behavior.
 */
export class RLNRgbLibBinding
  extends RNRgbLibBinding
  implements IUTEXOProtocol
{
  private nodeOperationQueue: Promise<void> = Promise.resolve();
  private readonly protocolAdapter?: Partial<IUTEXOProtocol>;
  private rlnNodeId: number | null = null;
  private unlockConflictNormalized = false;
  private lifecycleState: 'idle' | 'active' | 'shutting_down' | 'destroying' =
    'idle';

  constructor(
    params: WalletInitParams,
    protocolAdapter?: Partial<IUTEXOProtocol>
  ) {
    super(params);
    this.protocolAdapter = protocolAdapter;
  }

  private requireMethod<K extends ProtocolMethodNames>(
    methodName: K
  ): NonNullable<IUTEXOProtocol[K]> {
    const method = this.protocolAdapter?.[methodName];
    if (typeof method !== 'function') {
      throw new WalletError(`${methodName} is not implemented yet for RLN.`);
    }
    return method as NonNullable<IUTEXOProtocol[K]>;
  }

  async createLightningInvoice(
    params: CreateLightningInvoiceRequestModel
  ): Promise<LightningReceiveRequest> {
    return this.requireMethod('createLightningInvoice')(params);
  }

  async getLightningReceiveRequest(id: string): Promise<TransferStatus | null> {
    return this.requireMethod('getLightningReceiveRequest')(id);
  }

  async getLightningSendRequest(id: string): Promise<TransferStatus | null> {
    return this.requireMethod('getLightningSendRequest')(id);
  }

  async getLightningSendFeeEstimate(
    params: GetLightningSendFeeEstimateRequestModel
  ): Promise<number> {
    return this.requireMethod('getLightningSendFeeEstimate')(params);
  }

  async payLightningInvoiceBegin(
    params: PayLightningInvoiceRequestModel
  ): Promise<string> {
    return this.requireMethod('payLightningInvoiceBegin')(params);
  }

  async payLightningInvoiceEnd(
    params: SendAssetEndRequestModel
  ): Promise<LightningSendRequest> {
    return this.requireMethod('payLightningInvoiceEnd')(params);
  }

  async payLightningInvoice(
    params: PayLightningInvoiceRequestModel,
    mnemonic?: string
  ): Promise<LightningSendRequest> {
    return this.requireMethod('payLightningInvoice')(params, mnemonic);
  }

  async listLightningPayments(): Promise<ListLightningPaymentsResponse> {
    return this.requireMethod('listLightningPayments')();
  }

  async onchainReceive(
    params: OnchainReceiveRequestModel
  ): Promise<OnchainReceiveResponse> {
    return this.requireMethod('onchainReceive')(params);
  }

  async onchainSendBegin(params: OnchainSendRequestModel): Promise<string> {
    return this.requireMethod('onchainSendBegin')(params);
  }

  async onchainSendEnd(
    params: SendAssetEndRequestModel
  ): Promise<OnchainSendResponse> {
    return this.requireMethod('onchainSendEnd')(params);
  }

  async onchainSend(
    params: OnchainSendRequestModel,
    mnemonic?: string
  ): Promise<OnchainSendResponse> {
    return this.requireMethod('onchainSend')(params, mnemonic);
  }

  async getOnchainSendStatus(
    send_id: string
  ): Promise<OnchainSendStatus | null> {
    return this.requireMethod('getOnchainSendStatus')(send_id);
  }

  async listOnchainTransfers(asset_id?: string): Promise<Transfer[]> {
    return this.requireMethod('listOnchainTransfers')(asset_id);
  }

  // ── Direct RLN-native methods (SdkNode bridge) ─────────────────────────────

  async rlnCreateNode(request: {
    storageDirPath: string;
    daemonListeningPort: number;
    ldkPeerListeningPort: number;
    network: string;
    maxMediaUploadSizeMb: number;
    enableVirtualChannelsV0?: boolean | null;
  }): Promise<number> {
    return this.withNodeQueue(async () => {
      if (this.rlnNodeId != null) {
        throw new WalletError('RLN node is already created');
      }
      const nodeId = await Rgb.rlnCreateNode(
        request.storageDirPath,
        request.daemonListeningPort,
        request.ldkPeerListeningPort,
        request.network,
        request.maxMediaUploadSizeMb,
        request.enableVirtualChannelsV0 ?? null
      );
      this.rlnNodeId = nodeId;
      this.lifecycleState = 'active';
      return nodeId;
    });
  }

  async rlnInitNode(password: string, mnemonic?: string): Promise<string> {
    return this.withNodeQueue(async () => {
      const nodeId = this.requireNodeId();
      this.assertRegularOpsAllowed();
      return Rgb.rlnInitNode(nodeId, password, mnemonic ?? null);
    });
  }

  async rlnCreateNativeExternalSigner(
    seedHex: string,
    network: string,
    permissivePolicy: boolean = true
  ): Promise<number> {
    return this.withNodeQueue(async () => {
      return Rgb.rlnCreateNativeExternalSigner(seedHex, network, permissivePolicy);
    });
  }

  async rlnInitNodeWithNativeExternalSigner(signerId: number): Promise<void> {
    return this.withNodeQueue(async () => {
      const nodeId = this.requireNodeId();
      this.assertRegularOpsAllowed();
      return Rgb.rlnInitNodeWithNativeExternalSigner(nodeId, signerId);
    });
  }

  async rlnAttachNativeExternalSigner(signerId: number): Promise<void> {
    return this.withNodeQueue(async () => {
      const nodeId = this.requireNodeId();
      this.assertRegularOpsAllowed();
      return Rgb.rlnAttachNativeExternalSigner(nodeId, signerId);
    });
  }

  async rlnUnlockNodeWithNativeExternalSigner(
    signerId: number,
    request: {
      bitcoindRpcUsername: string;
      bitcoindRpcPassword: string;
      bitcoindRpcHost: string;
      bitcoindRpcPort: number;
      indexerUrl?: string | null;
      proxyEndpoint?: string | null;
      announceAddresses?: string[];
      announceAlias?: string | null;
    }
  ): Promise<void> {
    return this.withNodeQueue(async () => {
      const nodeId = this.requireNodeId();
      this.assertRegularOpsAllowed();
      return Rgb.rlnUnlockNodeWithNativeExternalSigner(
        nodeId,
        signerId,
        request.bitcoindRpcUsername,
        request.bitcoindRpcPassword,
        request.bitcoindRpcHost,
        request.bitcoindRpcPort,
        request.indexerUrl ?? null,
        request.proxyEndpoint ?? null,
        request.announceAddresses ?? [],
        request.announceAlias ?? null
      );
    });
  }

  async rlnDestroyNativeExternalSigner(signerId: number): Promise<void> {
    return this.withNodeQueue(async () => {
      return Rgb.rlnDestroyNativeExternalSigner(signerId);
    });
  }

  async rlnInitNodeWithExternalSigner(request: {
    nodePublicKeyHex: string;
    accountXpubVanilla: string;
    accountXpubColored: string;
    masterFingerprint: string;
    protocolVersion: string;
    apiLevel: number;
    ldkInboundPaymentKeyHex: string;
    ldkPeerStorageKeyHex: string;
    ldkReceiveAuthKeyHex: string;
    asyncPaymentsRootSeedHex?: string;
  }): Promise<void> {
    return this.withNodeQueue(async () => {
      const nodeId = this.requireNodeId();
      this.assertRegularOpsAllowed();
      return Rgb.rlnInitNodeWithExternalSigner(
        nodeId,
        request.nodePublicKeyHex,
        request.accountXpubVanilla,
        request.accountXpubColored,
        request.masterFingerprint,
        request.protocolVersion,
        request.apiLevel,
        request.ldkInboundPaymentKeyHex,
        request.ldkPeerStorageKeyHex,
        request.ldkReceiveAuthKeyHex,
        request.asyncPaymentsRootSeedHex ?? ''
      );
    });
  }

  async rlnUnlockNode(request: {
    password: string;
    bitcoindRpcUsername: string;
    bitcoindRpcPassword: string;
    bitcoindRpcHost: string;
    bitcoindRpcPort: number;
    indexerUrl?: string | null;
    proxyEndpoint?: string | null;
    announceAddresses?: string[];
    announceAlias?: string | null;
  }): Promise<void> {
    await this.withNodeQueue(async () => {
      const nodeId = this.requireNodeId();
      this.assertRegularOpsAllowed();
      this.unlockConflictNormalized = false;

      // Treat unlock as idempotent: if node is already ready, skip native unlock.
      const alreadyReady = await this.probeNodeReady(nodeId, 3, 300);
      if (alreadyReady) {
        return;
      }

      const unlockOnce = () =>
        Rgb.rlnUnlockNode(
          nodeId,
          request.password,
          request.bitcoindRpcUsername,
          request.bitcoindRpcPassword,
          request.bitcoindRpcHost,
          request.bitcoindRpcPort,
          request.indexerUrl ?? null,
          request.proxyEndpoint ?? null,
          request.announceAddresses ?? [],
          request.announceAlias ?? null
        );

      const maxConflictRetries = 4;
      let lastConflictError: unknown = null;
      for (let attempt = 1; attempt <= maxConflictRetries; attempt += 1) {
        try {
          await unlockOnce();
          return;
        } catch (error) {
          if (!this.isConflictError(error)) {
            throw error;
          }
          // In practice RLN can return Conflict while switching internal state.
          // Probe first; if not ready yet, retry unlock a few times with backoff.
          const ready = await this.probeNodeReady(nodeId, 12, 500);
          if (ready) {
            this.unlockConflictNormalized = true;
            return;
          }
          lastConflictError = error;
          if (attempt < maxConflictRetries) {
            await new Promise((resolve) =>
              globalThis.setTimeout(resolve, 400 * attempt)
            );
            continue;
          }
        }
      }
      throw lastConflictError;
    });
  }

  public consumeUnlockConflictNormalized(): boolean {
    const normalized = this.unlockConflictNormalized;
    this.unlockConflictNormalized = false;
    return normalized;
  }

  private isConflictError(error: unknown): boolean {
    const maybeError = error as { message?: string; code?: unknown } | null;
    const code =
      typeof maybeError?.code === 'string' ? maybeError.code.toLowerCase() : '';
    const message =
      typeof maybeError?.message === 'string'
        ? maybeError.message.toLowerCase()
        : '';
    return code.includes('conflict') || message.includes('conflict');
  }

  private isNotInitializedError(error: unknown): boolean {
    const maybeError = error as { message?: string; code?: unknown } | null;
    const code =
      typeof maybeError?.code === 'string' ? maybeError.code.toLowerCase() : '';
    const message =
      typeof maybeError?.message === 'string'
        ? maybeError.message.toLowerCase()
        : '';
    return (
      code.includes('notinitialized') ||
      code.includes('not_initialized') ||
      message.includes('not initialized') ||
      message.includes('notinitialized')
    );
  }

  private async probeNodeReady(
    nodeId: number,
    attempts: number = 30,
    delayMs: number = 750
  ): Promise<boolean> {
    // Give native unlock state a short settling window before probing.
    await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
    for (let i = 0; i < attempts; i += 1) {
      try {
        await Rgb.rlnNodeInfo(nodeId);
        return true;
      } catch (error) {
        // During unlock-after-conflict, RLN can briefly return NotInitialized
        // before transitioning to ready; keep polling in that case.
        if (!this.isNotInitializedError(error)) {
          return false;
        }
        if (i < attempts - 1) {
          await new Promise((resolve) =>
            globalThis.setTimeout(resolve, delayMs)
          );
        }
      }
    }
    return false;
  }

  async rlnDestroyNode(): Promise<void> {
    await this.withNodeQueue(async () => {
      if (this.rlnNodeId == null) return;
      this.lifecycleState = 'destroying';
      try {
        await Rgb.rlnDestroyNode(this.rlnNodeId);
        this.rlnNodeId = null;
        this.lifecycleState = 'idle';
      } catch (error) {
        this.lifecycleState = 'active';
        throw error;
      }
    });
  }

  async rlnNodeInfo(): Promise<object> {
    return this.withNodeOperation((nodeId) => Rgb.rlnNodeInfo(nodeId));
  }

  async rlnNetworkInfo(): Promise<object> {
    return this.withNodeOperation((nodeId) => Rgb.rlnNetworkInfo(nodeId));
  }

  async rlnConnectPeer(peerPubkeyAndAddr: string): Promise<void> {
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnConnectPeer(nodeId, peerPubkeyAndAddr)
    );
  }

  async rlnListPeers(): Promise<object[]> {
    return this.withNodeOperation((nodeId) => Rgb.rlnListPeers(nodeId));
  }

  async rlnDisconnectPeer(peerPubkey: string): Promise<void> {
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnDisconnectPeer(nodeId, peerPubkey)
    );
  }

  async rlnListChannels(): Promise<object[]> {
    return this.withNodeOperation((nodeId) => Rgb.rlnListChannels(nodeId));
  }

  async rlnOpenChannel(request: {
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
  }): Promise<object> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnOpenChannel(
        nodeId,
        request.peerPubkeyAndOptAddr,
        request.capacitySat,
        request.pushMsat,
        request.public,
        request.withAnchors,
        request.feeBaseMsat ?? null,
        request.feeProportionalMillionths ?? null,
        request.temporaryChannelId ?? null,
        request.assetId ?? null,
        request.assetAmount ?? null,
        request.pushAssetAmount ?? null,
        request.virtualOpenMode ?? null
      )
    );
  }

  async rlnCloseChannel(
    channelId: string,
    peerPubkey: string,
    force: boolean
  ): Promise<void> {
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnCloseChannel(nodeId, channelId, peerPubkey, force)
    );
  }

  async rlnListPayments(): Promise<object[]> {
    return this.withNodeOperation((nodeId) => Rgb.rlnListPayments(nodeId));
  }

  async rlnAddress(): Promise<object> {
    return this.withNodeOperation((nodeId) => Rgb.rlnAddress(nodeId));
  }

  async rlnAssetBalance(assetId: string): Promise<object> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnAssetBalance(nodeId, assetId)
    );
  }

  async rlnBackup(backupPath: string, password: string): Promise<void> {
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnBackup(nodeId, backupPath, password)
    );
  }

  async rlnBtcBalance(skipSync: boolean = false): Promise<object> {
    return this.withNodeOperation((nodeId) => Rgb.rlnBtcBalance(nodeId, skipSync));
  }

  async rlnCheckIndexerUrl(indexerUrl: string): Promise<object> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnCheckIndexerUrl(nodeId, indexerUrl)
    );
  }

  async rlnCheckProxyEndpoint(proxyEndpoint: string): Promise<void> {
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnCheckProxyEndpoint(nodeId, proxyEndpoint)
    );
  }

  async rlnCreateUtxos(
    upTo: boolean,
    num: number | null,
    size: number | null,
    feeRate: number,
    skipSync: boolean
  ): Promise<void> {
    await this.withNodeOperation(async (nodeId) => {
      const maxConflictRetries = 20;
      let lastConflictError: unknown = null;
      for (let attempt = 1; attempt <= maxConflictRetries; attempt += 1) {
        try {
          await Rgb.rlnCreateUtxos(nodeId, upTo, num, size, feeRate, skipSync);
          return;
        } catch (error) {
          if (!this.isConflictError(error)) {
            throw error;
          }
          // Same normalization strategy as unlock: RLN can temporarily reject
          // operations while transitioning internal state.
          const ready = await this.probeNodeReady(nodeId, 8, 500);
          if (ready) {
            await new Promise((resolve) =>
              globalThis.setTimeout(resolve, 250 * attempt)
            );
          }
          lastConflictError = error;
          if (attempt < maxConflictRetries) {
            await new Promise((resolve) =>
              globalThis.setTimeout(resolve, 600)
            );
            continue;
          }
        }
      }
      throw lastConflictError;
    });
  }

  async rlnDecodeLnInvoice(invoice: string): Promise<object> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnDecodeLnInvoice(nodeId, invoice)
    );
  }

  async rlnDecodeRgbInvoice(invoice: string): Promise<object> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnDecodeRgbInvoice(nodeId, invoice)
    );
  }

  async rlnEstimateFee(blocks: number): Promise<object> {
    return this.withNodeOperation((nodeId) => Rgb.rlnEstimateFee(nodeId, blocks));
  }

  async rlnFailTransfers(
    batchTransferIdx: number | null,
    noAssetOnly: boolean,
    skipSync: boolean
  ): Promise<object> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnFailTransfers(
        nodeId,
        batchTransferIdx,
        noAssetOnly,
        skipSync
      )
    );
  }

  async rlnGetChannelId(temporaryChannelId: string): Promise<string> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnGetChannelId(nodeId, temporaryChannelId)
    );
  }

  async rlnGetPayment(paymentHash: string): Promise<object> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnGetPayment(nodeId, paymentHash)
    );
  }

  async rlnInvoiceStatus(invoice: string): Promise<object> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnInvoiceStatus(nodeId, invoice)
    );
  }

  async rlnKeysend(
    destPubkey: string,
    amtMsat: number,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<object> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnKeysend(
        nodeId,
        destPubkey,
        amtMsat,
        assetId,
        assetAmount
      )
    );
  }

  async rlnListAssets(filterAssetSchemas: string[]): Promise<object> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnListAssets(nodeId, filterAssetSchemas)
    );
  }

  async rlnListTransactions(skipSync: boolean): Promise<object[]> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnListTransactions(nodeId, skipSync)
    );
  }

  async rlnListTransfers(assetId: string): Promise<object[]> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnListTransfers(nodeId, assetId)
    );
  }

  async rlnListUnspents(skipSync: boolean): Promise<object[]> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnListUnspents(nodeId, skipSync)
    );
  }

  async rlnLnInvoice(
    amtMsat: number | null,
    expirySec: number,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<object> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnLnInvoice(
        nodeId,
        amtMsat,
        expirySec,
        assetId,
        assetAmount
      )
    );
  }

  async rlnRefreshTransfers(skipSync: boolean): Promise<void> {
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnRefreshTransfers(nodeId, skipSync)
    );
  }

  async rlnRgbInvoice(
    assetId: string | null,
    assignmentAmount: number | null,
    durationSeconds: number | null,
    minConfirmations: number,
    witness: boolean
  ): Promise<object> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnRgbInvoice(
        nodeId,
        assetId,
        assignmentAmount,
        durationSeconds,
        minConfirmations,
        witness
      )
    );
  }

  async rlnSendBtc(
    amount: number,
    address: string,
    feeRate: number,
    skipSync: boolean
  ): Promise<object> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnSendBtc(nodeId, amount, address, feeRate, skipSync)
    );
  }

  async rlnSendPayment(
    invoice: string,
    amtMsat: number | null,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<object> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnSendPayment(
        nodeId,
        invoice,
        amtMsat,
        assetId,
        assetAmount
      )
    );
  }

  async rlnSendRgb(
    donation: boolean,
    feeRate: number,
    minConfirmations: number,
    skipSync: boolean,
    assetId: string,
    recipientId: string,
    amount: number,
    transportEndpoints: string[]
  ): Promise<object> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnSendRgb(
        nodeId,
        donation,
        feeRate,
        minConfirmations,
        skipSync,
        assetId,
        recipientId,
        amount,
        transportEndpoints
      )
    );
  }

  async rlnShutdown(): Promise<void> {
    await this.withNodeQueue(async () => {
      const nodeId = this.requireNodeId();
      this.lifecycleState = 'shutting_down';
      try {
        await Rgb.rlnShutdown(nodeId);
      } catch (error) {
        this.lifecycleState = 'active';
        throw error;
      }
    });
  }

  async rlnSync(): Promise<void> {
    await this.withNodeOperation((nodeId) => Rgb.rlnSync(nodeId));
  }

  private requireNodeId(): number {
    if (this.rlnNodeId == null) {
      throw new WalletError('RLN node is not created');
    }
    return this.rlnNodeId;
  }

  private assertRegularOpsAllowed() {
    if (
      this.lifecycleState === 'shutting_down' ||
      this.lifecycleState === 'destroying'
    ) {
      throw new WalletError(
        `RLN node is ${this.lifecycleState}; non-lifecycle operations are blocked`
      );
    }
  }

  private async withNodeOperation<T>(op: (nodeId: number) => Promise<T>): Promise<T> {
    return this.withNodeQueue(async () => {
      const nodeId = this.requireNodeId();
      this.assertRegularOpsAllowed();
      return op(nodeId);
    });
  }

  private async withNodeQueue<T>(op: () => Promise<T>): Promise<T> {
    const run = this.nodeOperationQueue
      .catch(() => {
        // Keep queue moving even if a previous op failed.
      })
      .then(op);
    this.nodeOperationQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}
