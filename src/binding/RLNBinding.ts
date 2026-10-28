import type {
  RlnBfaCapabilities,
  RlnBurnParams,
  RlnBurnResult,
} from './rln-types';
import { ValidationError, WalletError } from '@utexo/rgb-sdk-core';
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
  RlnAssetMetadata,
  RlnPayment,
  RlnPaymentType,
  RlnSendPaymentResponse,
  RlnKeysendResponse,
  RlnInvoiceStatusWire,
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
  RlnInflateResponse,
  RlnTransaction,
  RlnTransfer,
  RlnUnspent,
  RlnFailTransfersResponse,
  RlnRefreshTransfersResponse,
  RlnAssignmentKind,
  RlnSignMessageResponse,
  RlnVerifyMessageResponse,
  RlnClaimHodlInvoiceResponse,
  RlnApayNewResponse,
} from './rln-types';

type RlnSubBalance = RlnBtcBalance['vanilla'];

function normalizeSubBalance(raw: unknown, name: string): RlnSubBalance {
  const b = raw as Partial<Record<keyof RlnSubBalance, unknown>> | null;
  if (
    !b ||
    typeof b !== 'object' ||
    typeof b.settled !== 'number' ||
    typeof b.future !== 'number' ||
    typeof b.spendable !== 'number'
  )
    throw new WalletError(`Invalid native BTC balance: ${name}`);
  return { settled: b.settled, future: b.future, spendable: b.spendable };
}

/** Both bridges return `{ vanilla, colored }` records; anything else is a bug. */
function normalizeBtcBalance(raw: unknown): RlnBtcBalance {
  const b = raw as { vanilla?: unknown; colored?: unknown } | null;
  return {
    vanilla: normalizeSubBalance(b?.vanilla, 'vanilla'),
    colored: normalizeSubBalance(b?.colored, 'colored'),
  };
}

// Android (Kotlin) serializes uniffi enums as SCREAMING_SNAKE ("RGB_SEND"),
// iOS (Swift) interpolates the case name as lowerCamel ("rgbSend") — convert
// both to canonical SCREAMING_SNAKE so the TS unions hold on every platform.
function canonicalEnum(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v);
  if (/^[A-Z0-9_]+$/.test(s)) return s; // already canonical (Android)
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

const PAYMENT_TYPES: Record<string, RlnPaymentType> = {
  OUTBOUND: 'Outbound',
  INBOUND_AUTO_CLAIM: 'InboundAutoClaim',
  INBOUND_HODL: 'InboundHodl',
};

/**
 * Android sends `INBOUND_AUTO_CLAIM`, iOS `inboundAutoClaim`; the wire type is
 * PascalCase. An unknown value becomes `undefined` so `inbound` stays unset.
 */
function normalizePaymentType(p: RlnPayment): RlnPayment {
  const key = canonicalEnum(p.paymentType);
  return { ...p, paymentType: key ? PAYMENT_TYPES[key] : undefined };
}

export class RLNBinding implements IRLN {
  private nodeOperationQueue: Promise<void> = Promise.resolve();
  private rlnNodeId: number | null = null;
  private unlockConflictNormalized = false;
  private lifecycleState: 'idle' | 'active' | 'shutting_down' | 'destroying' =
    'idle';

  async rlnBfaCapabilities(): Promise<RlnBfaCapabilities> {
    return Rgb.rlnBfaCapabilities();
  }
  async rlnBurn(params: RlnBurnParams): Promise<RlnBurnResult> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnBurn(
        nodeId,
        params.assetId,
        params.amount,
        params.burnRecipient ?? null,
        params.feeRate,
        params.minConfirmations
      )
    ) as Promise<RlnBurnResult>;
  }
  async rlnGetConsignment(assetId: string, txid: string): Promise<string> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnGetConsignment(nodeId, assetId, txid)
    );
  }
  async rlnGetConsignmentPath(assetId: string, txid: string): Promise<string> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnGetConsignmentPath(nodeId, assetId, txid)
    );
  }

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
        params.enableVirtualChannelsV0 ?? null,
        params.virtualPeerPubkeys ?? null,
        params.vssUrl ?? null,
        params.vssAllowHttp ?? false,
        params.vssAllowEmptyRestore ?? false,
        params.lspBaseUrl ?? null,
        params.lspBearerToken ?? null,
        params.reuseAddresses ?? false
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
          request.bitcoindRpcUsername ?? null,
          request.bitcoindRpcPassword ?? null,
          request.bitcoindRpcHost ?? null,
          request.bitcoindRpcPort ?? null,
          request.indexerUrl ?? null,
          request.proxyEndpoint ?? null,
          request.announceAddresses ?? [],
          request.announceAlias ?? null,
          request.gossipRgsServerUrl ?? null,
          request.ethRpcUrl ?? null
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
    permissivePolicy: boolean = true,
    storageDirPath: string | null = null
  ): Promise<number> {
    return this.withNodeQueue(async () => {
      return Rgb.rlnCreateNativeExternalSigner(
        seedHex,
        network,
        permissivePolicy,
        storageDirPath
      );
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
    // RLN's external-signer unlock has no RGS setting; do not drop it silently.
    if (request.gossipRgsServerUrl != null)
      throw new ValidationError(
        'gossipRgsServerUrl is not supported with NativeExternalRLNSigner',
        'gossipRgsServerUrl'
      );
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
          request.bitcoindRpcUsername ?? null,
          request.bitcoindRpcPassword ?? null,
          request.bitcoindRpcHost ?? null,
          request.bitcoindRpcPort ?? null,
          request.indexerUrl ?? null,
          request.proxyEndpoint ?? null,
          request.announceAddresses ?? [],
          request.announceAlias ?? null,
          request.ethRpcUrl ?? null
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
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnNodeInfo(nodeId)
    ) as Promise<RlnNodeInfo>;
  }

  async rlnNetworkInfo(): Promise<RlnNetworkInfo> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnNetworkInfo(nodeId)
    ) as Promise<RlnNetworkInfo>;
  }

  // ── Peers ───────────────────────────────────────────────────────────────────

  async rlnConnectPeer(peerPubkeyAndAddr: string): Promise<void> {
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnConnectPeer(nodeId, peerPubkeyAndAddr)
    );
  }

  async rlnListPeers(): Promise<RlnPeer[]> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnListPeers(nodeId)
    ) as Promise<RlnPeer[]>;
  }

  async rlnDisconnectPeer(peerPubkey: string): Promise<void> {
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnDisconnectPeer(nodeId, peerPubkey)
    );
  }

  // ── Channels ────────────────────────────────────────────────────────────────

  async rlnListChannels(): Promise<RlnChannel[]> {
    const raw = (await this.withNodeOperation((nodeId) =>
      Rgb.rlnListChannels(nodeId)
    )) as RlnChannel[];
    return raw.map((c) => ({
      ...c,
      status: canonicalEnum((c as any).status) as RlnChannel['status'],
    }));
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
    const raw = (await this.withNodeOperation((nodeId) =>
      Rgb.rlnListPayments(nodeId)
    )) as RlnPayment[];
    return raw.map(normalizePaymentType);
  }

  async rlnGetPayment(paymentHash: string): Promise<RlnPayment> {
    return normalizePaymentType(
      (await this.withNodeOperation((nodeId) =>
        Rgb.rlnGetPayment(nodeId, paymentHash)
      )) as RlnPayment
    );
  }

  async rlnInvoiceStatus(invoice: string): Promise<RlnInvoiceStatusWire> {
    const raw = await this.withNodeOperation((nodeId) =>
      Rgb.rlnInvoiceStatus(nodeId, invoice)
    );
    const status = (raw as any)?.value ?? raw;
    // Android (Kotlin) serializes the uniffi enum as "SUCCEEDED" while iOS
    // (Swift) interpolates the case name as "succeeded" — normalize here so
    // every status consumer sees the UPPERCASE contract of RlnInvoiceStatusWire.
    return String(status).toUpperCase() as RlnInvoiceStatusWire;
  }

  async rlnLnInvoice(
    amtMsat: number | null,
    expirySec: number,
    assetId: string | null,
    assetAmount: number | null,
    paymentHash?: string | null,
    minFinalCltvExpiryDelta?: number | null,
    descriptionHash?: string | null,
    /** BOLT11 `d` tag; mutually exclusive with `descriptionHash`. */
    description?: string | null
  ): Promise<RlnLnInvoiceResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnLnInvoice(
        nodeId,
        amtMsat,
        expirySec,
        assetId,
        assetAmount,
        paymentHash ?? null,
        minFinalCltvExpiryDelta ?? null,
        descriptionHash ?? null,
        description ?? null
      )
    ) as Promise<RlnLnInvoiceResponse>;
  }

  async rlnClaimHodlInvoice(
    paymentHash: string,
    paymentPreimage: string
  ): Promise<RlnClaimHodlInvoiceResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnClaimHodlInvoice(nodeId, paymentHash, paymentPreimage)
    ) as Promise<RlnClaimHodlInvoiceResponse>;
  }

  async rlnCancelHodlInvoice(paymentHash: string): Promise<void> {
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnCancelHodlInvoice(nodeId, paymentHash)
    );
  }

  async rlnApayNew(hostNodeId: string): Promise<RlnApayNewResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnApayNew(nodeId, hostNodeId)
    ) as Promise<RlnApayNewResponse>;
  }

  async rlnApayNewWithAddress(
    hostNodeId: string,
    username: string,
    domain: string
  ): Promise<RlnApayNewResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnApayNewWithAddress(nodeId, hostNodeId, username, domain)
    ) as Promise<RlnApayNewResponse>;
  }

  async rlnDecodeLnInvoice(
    invoice: string
  ): Promise<RlnDecodeLnInvoiceResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnDecodeLnInvoice(nodeId, invoice)
    ) as Promise<RlnDecodeLnInvoiceResponse>;
  }

  async rlnDecodeRgbInvoice(
    invoice: string
  ): Promise<RlnDecodeRgbInvoiceResponse> {
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
    const raw = (await this.withNodeOperation((nodeId) =>
      Rgb.rlnSendPayment(nodeId, invoice, amtMsat, assetId, assetAmount)
    )) as RlnSendPaymentResponse;
    // Android (Kotlin) serializes HtlcStatus as "PENDING" while iOS (Swift)
    // interpolates the case name as "pending" — normalize to the UPPERCASE
    // contract of RlnPaymentStatusWire.
    return {
      ...raw,
      status: String(
        raw.status
      ).toUpperCase() as RlnSendPaymentResponse['status'],
    };
  }

  async rlnKeysend(
    destPubkey: string,
    amtMsat: number,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<RlnKeysendResponse> {
    const raw = (await this.withNodeOperation((nodeId) =>
      Rgb.rlnKeysend(nodeId, destPubkey, amtMsat, assetId, assetAmount)
    )) as RlnKeysendResponse;
    // Same Android/iOS HtlcStatus case divergence as rlnSendPayment.
    return {
      ...raw,
      status: String(raw.status).toUpperCase() as RlnKeysendResponse['status'],
    };
  }

  // ── On-chain wallet ──────────────────────────────────────────────────────────

  async rlnAddress(): Promise<RlnAddressResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnAddress(nodeId)
    ) as Promise<RlnAddressResponse>;
  }

  async rlnRotateAddress(): Promise<RlnAddressResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnRotateAddress(nodeId)
    ) as Promise<RlnAddressResponse>;
  }

  async rlnSignMessage(message: string): Promise<RlnSignMessageResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnSignMessage(nodeId, message)
    ) as Promise<RlnSignMessageResponse>;
  }

  async rlnVerifyMessage(
    message: string,
    signature: string
  ): Promise<RlnVerifyMessageResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnVerifyMessage(nodeId, message, signature)
    ) as Promise<RlnVerifyMessageResponse>;
  }

  async rlnBtcBalance(skipSync: boolean = false): Promise<RlnBtcBalance> {
    const raw = await this.withNodeOperation((nodeId) =>
      Rgb.rlnBtcBalance(nodeId, skipSync)
    );
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

  async rlnPostAssetMedia(filePath: string): Promise<string> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnPostAssetMedia(nodeId, filePath)
    );
  }

  async rlnAssetMetadata(assetId: string): Promise<RlnAssetMetadata> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnAssetMetadata(nodeId, assetId)
    ) as Promise<RlnAssetMetadata>;
  }

  async rlnIssueAssetCfa(
    name: string,
    details: string | null,
    precision: number,
    amounts: number[],
    fileDigest: string | null
  ): Promise<any> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnIssueAssetCfa(
        nodeId,
        name,
        details,
        precision,
        amounts,
        fileDigest
      )
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
      Rgb.rlnIssueAssetIfa(
        nodeId,
        ticker,
        name,
        precision,
        amounts,
        inflationAmounts,
        rejectListUrl
      )
    );
  }

  async rlnInflate(
    assetId: string,
    inflationAmounts: number[],
    feeRate: number,
    minConfirmations: number
  ): Promise<RlnInflateResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnInflate(
        nodeId,
        assetId,
        inflationAmounts,
        feeRate,
        minConfirmations
      )
    ) as Promise<RlnInflateResponse>;
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
      Rgb.rlnIssueAssetUda(
        nodeId,
        ticker,
        name,
        details,
        precision,
        mediaFileDigest,
        attachmentsFileDigests
      )
    );
  }

  // ── Assets / transfers ──────────────────────────────────────────────────────

  async rlnListAssets(
    filterAssetSchemas: string[]
  ): Promise<RlnListAssetsResponse> {
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
    witness: boolean,
    assignmentKind?: RlnAssignmentKind | null
  ): Promise<RlnRgbInvoiceResponse> {
    // RLN pairs kind+amount strictly: it only honours assignmentAmount when a kind
    // is set, and falls back to `Any` (dropping the amount) otherwise. Default to
    // Fungible whenever an amount is present so the amount is actually enforced.
    const kind =
      assignmentKind ?? (assignmentAmount != null ? 'Fungible' : null);
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnRgbInvoice(
        nodeId,
        assetId,
        assignmentAmount,
        durationSeconds,
        minConfirmations,
        witness,
        kind
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
        nodeId,
        donation,
        feeRate,
        minConfirmations,
        skipSync,
        assetId,
        recipientId,
        amount,
        transportEndpoints,
        witnessData?.amountSat ?? null,
        witnessData?.blinding ?? null
      )
    ) as Promise<RlnSendRgbResponse>;
  }

  async rlnListTransactions(skipSync: boolean): Promise<RlnTransaction[]> {
    const raw = (await this.withNodeOperation((nodeId) =>
      Rgb.rlnListTransactions(nodeId, skipSync)
    )) as RlnTransaction[];
    return raw.map((t) => ({
      ...t,
      transactionType: canonicalEnum(
        (t as any).transactionType
      ) as RlnTransaction['transactionType'],
    }));
  }

  async rlnListTransactionsByTxid(
    txid: string,
    skipSync: boolean
  ): Promise<RlnTransaction[]> {
    const raw = (await this.withNodeOperation((nodeId) =>
      Rgb.rlnListTransactionsByTxid(nodeId, txid, skipSync)
    )) as RlnTransaction[];
    return raw.map((t) => ({
      ...t,
      transactionType: canonicalEnum(
        (t as any).transactionType
      ) as RlnTransaction['transactionType'],
    }));
  }

  async rlnListTransfers(assetId: string): Promise<RlnTransfer[]> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnListTransfers(nodeId, assetId)
    ) as Promise<RlnTransfer[]>;
  }

  async rlnListTransfersByTxid(txid: string): Promise<RlnTransfer[]> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnListTransfersByTxid(nodeId, txid)
    ) as Promise<RlnTransfer[]>;
  }

  async rlnListUnspents(skipSync: boolean): Promise<RlnUnspent[]> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnListUnspents(nodeId, skipSync)
    ) as Promise<RlnUnspent[]>;
  }

  async rlnRefreshTransfers(
    skipSync: boolean
  ): Promise<RlnRefreshTransfersResponse> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnRefreshTransfers(nodeId, skipSync)
    ) as Promise<RlnRefreshTransfersResponse>;
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

  async rlnCheckIndexerUrl(
    indexerUrl: string
  ): Promise<RlnCheckIndexerUrlResponse> {
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
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnCreateUtxos(nodeId, upTo, num, size, feeRate, skipSync)
    );
  }

  /**
   * Creates UTXOs and returns how many new colorable ones appeared. The reads
   * before and after run in the same queue entry as the create, so concurrent
   * calls cannot count each other's UTXOs.
   */
  async rlnCreateUtxosCounted(
    upTo: boolean,
    num: number | null,
    size: number | null,
    feeRate: number,
    skipSync: boolean
  ): Promise<number> {
    return this.withNodeOperation(async (nodeId) => {
      // The baseline read performs the sync the caller asked for.
      const before = new Set(
        ((await Rgb.rlnListUnspents(nodeId, skipSync)) as RlnUnspent[]).map(
          (u) => u.utxo.outpoint
        )
      );
      await Rgb.rlnCreateUtxos(nodeId, upTo, num, size, feeRate, true);
      const after = (await Rgb.rlnListUnspents(nodeId, true)) as RlnUnspent[];
      return after.filter(
        (u) => u.utxo.colorable && !before.has(u.utxo.outpoint)
      ).length;
    });
  }

  // ── VSS ─────────────────────────────────────────────────────────────────────

  async rlnVssClearFence(password: string): Promise<void> {
    await this.withNodeOperation((nodeId) =>
      Rgb.rlnVssClearFence(nodeId, password)
    );
  }

  async rlnVssBackup(): Promise<number> {
    return this.withNodeOperation((nodeId) =>
      Rgb.rlnVssBackup(nodeId)
    ) as Promise<number>;
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
    const run = this.nodeOperationQueue.catch(() => {}).then(op);
    this.nodeOperationQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private isConflictError(error: unknown): boolean {
    const e = error as { message?: string; code?: unknown } | null;
    const code = typeof e?.code === 'string' ? e.code.toLowerCase() : '';
    const message =
      typeof e?.message === 'string' ? e.message.toLowerCase() : '';
    return code.includes('conflict') || message.includes('conflict');
  }

  isPoisonError(error: unknown): boolean {
    const e = error as { message?: string; code?: unknown } | null;
    const code = typeof e?.code === 'string' ? e.code.toLowerCase() : '';
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
    const code = typeof e?.code === 'string' ? e.code.toLowerCase() : '';
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
