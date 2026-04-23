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
  private readonly protocolAdapter?: Partial<IUTEXOProtocol>;
  private rlnNodeId: number | null = null;
  private unlockConflictNormalized = false;

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
    const nodeId = await Rgb.rlnCreateNode(
      request.storageDirPath,
      request.daemonListeningPort,
      request.ldkPeerListeningPort,
      request.network,
      request.maxMediaUploadSizeMb,
      request.enableVirtualChannelsV0 ?? null
    );
    this.rlnNodeId = nodeId;
    return nodeId;
  }

  async rlnInitNode(password: string, mnemonic?: string): Promise<string> {
    if (this.rlnNodeId == null)
      throw new WalletError('RLN node is not created');
    return Rgb.rlnInitNode(this.rlnNodeId, password, mnemonic ?? null);
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
    if (this.rlnNodeId == null)
      throw new WalletError('RLN node is not created');
    this.unlockConflictNormalized = false;
    try {
      await Rgb.rlnUnlockNode(
        this.rlnNodeId,
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
    } catch (error) {
      if (!this.isConflictError(error)) {
        throw error;
      }
      const ready = await this.probeNodeReady();
      if (!ready) {
        throw error;
      }
      this.unlockConflictNormalized = true;
    }
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
    attempts: number = 20,
    delayMs: number = 500
  ): Promise<boolean> {
    for (let i = 0; i < attempts; i += 1) {
      try {
        await this.rlnNodeInfo();
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
    if (this.rlnNodeId == null) return;
    await Rgb.rlnDestroyNode(this.rlnNodeId);
    this.rlnNodeId = null;
  }

  async rlnNodeInfo(): Promise<object> {
    if (this.rlnNodeId == null)
      throw new WalletError('RLN node is not created');
    return Rgb.rlnNodeInfo(this.rlnNodeId);
  }

  async rlnNetworkInfo(): Promise<object> {
    if (this.rlnNodeId == null)
      throw new WalletError('RLN node is not created');
    return Rgb.rlnNetworkInfo(this.rlnNodeId);
  }

  async rlnConnectPeer(peerPubkeyAndAddr: string): Promise<void> {
    if (this.rlnNodeId == null)
      throw new WalletError('RLN node is not created');
    await Rgb.rlnConnectPeer(this.rlnNodeId, peerPubkeyAndAddr);
  }

  async rlnListPeers(): Promise<object[]> {
    if (this.rlnNodeId == null)
      throw new WalletError('RLN node is not created');
    return Rgb.rlnListPeers(this.rlnNodeId);
  }

  async rlnDisconnectPeer(peerPubkey: string): Promise<void> {
    if (this.rlnNodeId == null)
      throw new WalletError('RLN node is not created');
    await Rgb.rlnDisconnectPeer(this.rlnNodeId, peerPubkey);
  }

  async rlnListChannels(): Promise<object[]> {
    if (this.rlnNodeId == null)
      throw new WalletError('RLN node is not created');
    return Rgb.rlnListChannels(this.rlnNodeId);
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
    if (this.rlnNodeId == null)
      throw new WalletError('RLN node is not created');
    return Rgb.rlnOpenChannel(
      this.rlnNodeId,
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
    );
  }

  async rlnCloseChannel(
    channelId: string,
    peerPubkey: string,
    force: boolean
  ): Promise<void> {
    if (this.rlnNodeId == null)
      throw new WalletError('RLN node is not created');
    await Rgb.rlnCloseChannel(this.rlnNodeId, channelId, peerPubkey, force);
  }

  async rlnListPayments(): Promise<object[]> {
    if (this.rlnNodeId == null)
      throw new WalletError('RLN node is not created');
    return Rgb.rlnListPayments(this.rlnNodeId);
  }
}
