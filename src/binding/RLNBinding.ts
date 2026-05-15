import { WalletError } from '@utexo/rgb-sdk-core';
import Rgb from './NativeRgb';
import type {
  IRLN,
  IRLNNodeCreateParams,
  IRLNUnlockParams,
  IRLNExternalSignerBootstrap,
} from './IRLN';
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
} from './rln-types';

// The native layer may return BtcBalance as its Rust Display string
// e.g. "BtcBalance(settled=100, future=0, spendable=100)" — parse it into a proper object.
function parseBtcSubBalance(raw: any): { settled: number; future: number; spendable: number } {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    const m = raw.match(/settled=(\d+)[,\s]+future=(\d+)[,\s]+spendable=(\d+)/);
    if (m) return { settled: Number(m[1]), future: Number(m[2]), spendable: Number(m[3]) };
  }
  return { settled: 0, future: 0, spendable: 0 };
}

function normalizeBtcBalance(raw: any): RlnBtcBalance {
  if (!raw || typeof raw !== 'object') return { vanilla: { settled: 0, future: 0, spendable: 0 }, colored: { settled: 0, future: 0, spendable: 0 } };
  return { vanilla: parseBtcSubBalance(raw.vanilla), colored: parseBtcSubBalance(raw.colored) };
}

export class RLNBinding implements IRLN {
  private nodeOperationQueue: Promise<void> = Promise.resolve();
  private rlnNodeId: number | null = null;
  private unlockConflictNormalized = false;
  private lifecycleState: 'idle' | 'active' | 'shutting_down' | 'destroying' =
    'idle';

  // ── Node lifecycle ──────────────────────────────────────────────────────────

  async rlnCreateNode(params: IRLNNodeCreateParams): Promise<number> {
    return this.withNodeQueue(async () => {
      if (this.rlnNodeId != null) {
        throw new WalletError('RLN node is already created');
      }
      const nodeId = await Rgb.rlnCreateNode(
        params.storageDirPath,
        params.daemonListeningPort,
        params.ldkPeerListeningPort,
        params.network,
        params.maxMediaUploadSizeMb,
        params.enableVirtualChannelsV0 ?? null
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

  async rlnUnlockNode(
    request: { password: string } & IRLNUnlockParams
  ): Promise<void> {
    await this.withNodeQueue(async () => {
      const nodeId = this.requireNodeId();
      this.assertRegularOpsAllowed();
      this.unlockConflictNormalized = false;

      const alreadyReady = await this.probeNodeReady(nodeId, 3, 300);
      if (alreadyReady) return;

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
          if (!this.isConflictError(error)) throw error;
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
          }
        }
      }
      throw lastConflictError;
    });
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

  consumeRlnUnlockConflictNormalized(): boolean {
    const normalized = this.unlockConflictNormalized;
    this.unlockConflictNormalized = false;
    return normalized;
  }

  // ── External signer ─────────────────────────────────────────────────────────

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
    request: IRLNUnlockParams
  ): Promise<void> {
    await this.withNodeQueue(async () => {
      const nodeId = this.requireNodeId();
      this.assertRegularOpsAllowed();
      this.unlockConflictNormalized = false;

      const alreadyReady = await this.probeNodeReady(nodeId, 3, 300);
      if (alreadyReady) return;

      const unlockOnce = () =>
        Rgb.rlnUnlockNodeWithNativeExternalSigner(
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

      const maxConflictRetries = 4;
      let lastConflictError: unknown = null;
      for (let attempt = 1; attempt <= maxConflictRetries; attempt += 1) {
        try {
          await unlockOnce();
          return;
        } catch (error) {
          if (!this.isConflictError(error)) throw error;
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
          }
        }
      }
      throw lastConflictError;
    });
  }

  async rlnDestroyNativeExternalSigner(signerId: number): Promise<void> {
    return this.withNodeQueue(async () => {
      return Rgb.rlnDestroyNativeExternalSigner(signerId);
    });
  }

  async rlnInitNodeWithExternalSigner(
    bootstrap: IRLNExternalSignerBootstrap
  ): Promise<void> {
    return this.withNodeQueue(async () => {
      const nodeId = this.requireNodeId();
      this.assertRegularOpsAllowed();
      return Rgb.rlnInitNodeWithExternalSigner(
        nodeId,
        bootstrap.nodePublicKeyHex,
        bootstrap.accountXpubVanilla,
        bootstrap.accountXpubColored,
        bootstrap.masterFingerprint,
        bootstrap.protocolVersion,
        bootstrap.apiLevel
      );
    });
  }

  // ── Node info ───────────────────────────────────────────────────────────────

  async rlnNodeInfo(): Promise<RlnNodeInfo> {
    return this.withNodeOperation((nodeId) => Rgb.rlnNodeInfo(nodeId)) as Promise<RlnNodeInfo>;
  }

  async rlnNetworkInfo(): Promise<RlnNetworkInfo> {
    return this.withNodeOperation((nodeId) => Rgb.rlnNetworkInfo(nodeId)) as Promise<RlnNetworkInfo>;
  }

  // ── Peers ───────────────────────────────────────────────────────────────────

  async rlnConnectPeer(peerPubkeyAndAddr: string): Promise<void> {
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnConnectPeer(nodeId, peerPubkeyAndAddr)
    );
  }

  async rlnListPeers(): Promise<RlnPeer[]> {
    return this.withNodeOperation((nodeId) => Rgb.rlnListPeers(nodeId)) as Promise<RlnPeer[]>;
  }

  async rlnDisconnectPeer(peerPubkey: string): Promise<void> {
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnDisconnectPeer(nodeId, peerPubkey)
    );
  }

  // ── Channels ────────────────────────────────────────────────────────────────

  async rlnListChannels(): Promise<RlnChannel[]> {
    return this.withNodeOperation((nodeId) => Rgb.rlnListChannels(nodeId)) as Promise<RlnChannel[]>;
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
  }): Promise<RlnOpenChannelResponse> {
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
    ) as Promise<RlnOpenChannelResponse>;
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

  async rlnGetChannelId(temporaryChannelId: string): Promise<string> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnGetChannelId(nodeId, temporaryChannelId)
    );
  }

  // ── Payments ─────────────────────────────────────────────────────────────────

  async rlnListPayments(): Promise<RlnPayment[]> {
    return this.withNodeOperation((nodeId) => Rgb.rlnListPayments(nodeId)) as Promise<RlnPayment[]>;
  }

  async rlnGetPayment(paymentHash: string): Promise<RlnPayment> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnGetPayment(nodeId, paymentHash)
    ) as Promise<RlnPayment>;
  }

  async rlnInvoiceStatus(invoice: string): Promise<RlnInvoiceStatus> {
    const raw = await this.withNodeOperation((nodeId) =>
      Rgb.rlnInvoiceStatus(nodeId, invoice)
    );
    const status = (raw as any)?.value ?? raw;
    return status as RlnInvoiceStatus;
  }

  async rlnLnInvoice(
    amtMsat: number | null,
    expirySec: number,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<RlnLnInvoiceResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnLnInvoice(nodeId, amtMsat, expirySec, assetId, assetAmount)
    ) as Promise<RlnLnInvoiceResponse>;
  }

  async rlnDecodeLnInvoice(invoice: string): Promise<RlnDecodeLnInvoiceResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnDecodeLnInvoice(nodeId, invoice)
    ) as Promise<RlnDecodeLnInvoiceResponse>;
  }

  async rlnDecodeRgbInvoice(invoice: string): Promise<RlnDecodeRgbInvoiceResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnDecodeRgbInvoice(nodeId, invoice)
    ) as Promise<RlnDecodeRgbInvoiceResponse>;
  }

  async rlnSendPayment(
    invoice: string,
    amtMsat: number | null,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<RlnSendPaymentResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnSendPayment(nodeId, invoice, amtMsat, assetId, assetAmount)
    ) as Promise<RlnSendPaymentResponse>;
  }

  async rlnKeysend(
    destPubkey: string,
    amtMsat: number,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<RlnKeysendResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnKeysend(nodeId, destPubkey, amtMsat, assetId, assetAmount)
    ) as Promise<RlnKeysendResponse>;
  }

  // ── On-chain wallet ──────────────────────────────────────────────────────────

  async rlnAddress(): Promise<RlnAddressResponse> {
    return this.withNodeOperation((nodeId) => Rgb.rlnAddress(nodeId)) as Promise<RlnAddressResponse>;
  }

  async rlnBtcBalance(skipSync: boolean = false): Promise<RlnBtcBalance> {
    const raw = await this.withNodeOperation((nodeId) => Rgb.rlnBtcBalance(nodeId, skipSync));
    return normalizeBtcBalance(raw);
  }

  async rlnSendBtc(
    amount: number,
    address: string,
    feeRate: number,
    skipSync: boolean
  ): Promise<RlnSendBtcResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnSendBtc(nodeId, amount, address, feeRate, skipSync)
    ) as Promise<RlnSendBtcResponse>;
  }

  // ── Asset issuance (requires walletId — call setWalletId first) ─────────────

  async rlnIssueAssetNia(
    ticker: string,
    name: string,
    precision: number,
    amounts: number[]
  ): Promise<any> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnIssueAssetNia(nodeId, ticker, name, precision, amounts)
    );
  }

  async rlnIssueAssetCfa(
    name: string,
    details: string | null,
    precision: number,
    amounts: number[],
    fileDigest: string | null
  ): Promise<any> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnIssueAssetCfa(nodeId, name, details, precision, amounts, fileDigest)
    );
  }

  async rlnIssueAssetIfa(
    ticker: string,
    name: string,
    precision: number,
    amounts: number[],
    inflationAmounts: number[],
    rejectListUrl: string | null
  ): Promise<any> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnIssueAssetIfa(nodeId, ticker, name, precision, amounts, inflationAmounts, rejectListUrl)
    );
  }

  async rlnIssueAssetUda(
    ticker: string,
    name: string,
    details: string | null,
    precision: number,
    mediaFileDigest: string | null,
    attachmentsFileDigests: string[]
  ): Promise<any> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnIssueAssetUda(nodeId, ticker, name, details, precision, mediaFileDigest, attachmentsFileDigests)
    );
  }

  // ── Assets / transfers ──────────────────────────────────────────────────────

  async rlnListAssets(filterAssetSchemas: string[]): Promise<RlnListAssetsResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnListAssets(nodeId, filterAssetSchemas)
    ) as Promise<RlnListAssetsResponse>;
  }

  async rlnAssetBalance(assetId: string): Promise<RlnAssetBalance> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnAssetBalance(nodeId, assetId)
    ) as Promise<RlnAssetBalance>;
  }

  async rlnRgbInvoice(
    assetId: string | null,
    assignmentAmount: number | null,
    durationSeconds: number | null,
    minConfirmations: number,
    witness: boolean
  ): Promise<RlnRgbInvoiceResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnRgbInvoice(
        nodeId,
        assetId,
        assignmentAmount,
        durationSeconds,
        minConfirmations,
        witness
      )
    ) as Promise<RlnRgbInvoiceResponse>;
  }

  async rlnSendRgb(
    donation: boolean,
    feeRate: number,
    minConfirmations: number,
    skipSync: boolean,
    assetId: string,
    recipientId: string,
    amount: number,
    transportEndpoints: string[],
    witnessData?: { amountSat: number; blinding?: number } | null
  ): Promise<RlnSendRgbResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnSendRgb(
        nodeId, donation, feeRate, minConfirmations, skipSync,
        assetId, recipientId, amount, transportEndpoints,
        witnessData?.amountSat ?? null,
        witnessData?.blinding ?? null,
      )
    ) as Promise<RlnSendRgbResponse>;
  }

  async rlnListTransactions(skipSync: boolean): Promise<RlnTransaction[]> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnListTransactions(nodeId, skipSync)
    ) as Promise<RlnTransaction[]>;
  }

  async rlnListTransfers(assetId: string): Promise<RlnTransfer[]> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnListTransfers(nodeId, assetId)
    ) as Promise<RlnTransfer[]>;
  }

  async rlnListUnspents(skipSync: boolean): Promise<RlnUnspent[]> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnListUnspents(nodeId, skipSync)
    ) as Promise<RlnUnspent[]>;
  }

  async rlnRefreshTransfers(skipSync: boolean): Promise<void> {
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnRefreshTransfers(nodeId, skipSync)
    );
  }

  async rlnFailTransfers(
    batchTransferIdx: number | null,
    noAssetOnly: boolean,
    skipSync: boolean
  ): Promise<RlnFailTransfersResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnFailTransfers(nodeId, batchTransferIdx, noAssetOnly, skipSync)
    ) as Promise<RlnFailTransfersResponse>;
  }

  // ── Utility ─────────────────────────────────────────────────────────────────

  async rlnEstimateFee(blocks: number): Promise<RlnEstimateFeeResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnEstimateFee(nodeId, blocks)
    ) as Promise<RlnEstimateFeeResponse>;
  }

  async rlnCheckIndexerUrl(indexerUrl: string): Promise<RlnCheckIndexerUrlResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnCheckIndexerUrl(nodeId, indexerUrl)
    ) as Promise<RlnCheckIndexerUrlResponse>;
  }

  async rlnCheckProxyEndpoint(proxyEndpoint: string): Promise<void> {
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnCheckProxyEndpoint(nodeId, proxyEndpoint)
    );
  }

  async rlnSync(): Promise<void> {
    await this.withNodeOperation((nodeId) => Rgb.rlnSync(nodeId));
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
          if (!this.isConflictError(error)) throw error;
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
          }
        }
      }
      throw lastConflictError;
    });
  }

  // ── Backup ───────────────────────────────────────────────────────────────────

  async rlnBackup(backupPath: string, password: string): Promise<void> {
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnBackup(nodeId, backupPath, password)
    );
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private requireNodeId(): number {
    if (this.rlnNodeId == null) {
      throw new WalletError('RLN node is not created');
    }
    return this.rlnNodeId;
  }

  private assertRegularOpsAllowed(): void {
    if (
      this.lifecycleState === 'shutting_down' ||
      this.lifecycleState === 'destroying'
    ) {
      throw new WalletError(
        `RLN node is ${this.lifecycleState}; non-lifecycle operations are blocked`
      );
    }
  }

  private async withNodeOperation<T>(
    op: (nodeId: number) => Promise<T>
  ): Promise<T> {
    return this.withNodeQueue(async () => {
      const nodeId = this.requireNodeId();
      this.assertRegularOpsAllowed();
      return op(nodeId);
    });
  }

  private async withNodeQueue<T>(op: () => Promise<T>): Promise<T> {
    const run = this.nodeOperationQueue
      .catch(() => {})
      .then(op);
    this.nodeOperationQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private isConflictError(error: unknown): boolean {
    const e = error as { message?: string; code?: unknown } | null;
    const code =
      typeof e?.code === 'string' ? e.code.toLowerCase() : '';
    const message =
      typeof e?.message === 'string' ? e.message.toLowerCase() : '';
    return code.includes('conflict') || message.includes('conflict');
  }

  isPoisonError(error: unknown): boolean {
    const e = error as { message?: string; code?: unknown } | null;
    const code =
      typeof e?.code === 'string' ? e.code.toLowerCase() : '';
    const message =
      typeof e?.message === 'string' ? e.message.toLowerCase() : '';
    return (
      code.includes('nodestatecorrupted') ||
      message.includes('poisonerror') ||
      message.includes('poison error') ||
      message.includes('node internal state is corrupted')
    );
  }

  private isNotInitializedError(error: unknown): boolean {
    const e = error as { message?: string; code?: unknown } | null;
    const code =
      typeof e?.code === 'string' ? e.code.toLowerCase() : '';
    const message =
      typeof e?.message === 'string' ? e.message.toLowerCase() : '';
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
    await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
    for (let i = 0; i < attempts; i += 1) {
      try {
        await Rgb.rlnNodeInfo(nodeId);
        return true;
      } catch (error) {
        if (!this.isNotInitializedError(error)) return false;
        if (i < attempts - 1) {
          await new Promise((resolve) =>
            globalThis.setTimeout(resolve, delayMs)
          );
        }
      }
    }
    return false;
  }
}
