import type {
  RlnNodeInfo,
  RlnNetworkInfo,
  RlnPeer,
  RlnChannel,
  RlnOpenChannelResponse,
  RlnPayment,
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
  RlnAssignmentKind,
  RlnSignMessageResponse,
  RlnVerifyMessageResponse,
  RlnClaimHodlInvoiceResponse,
  RlnApayNewResponse,
} from './rln-types';

// ── RLN node parameter types ──────────────────────────────────────────────────

export interface IRLNNodeCreateParams {
  storageDirPath: string;
  daemonListeningPort: number;
  ldkPeerListeningPort: number;
  network: string;
  maxMediaUploadSizeMb: number;
  enableVirtualChannelsV0?: boolean | null;
  virtualPeerPubkeys?: string[] | null;
  vssUrl?: string | null;
  vssAllowHttp?: boolean;
  vssAllowEmptyRestore?: boolean;
  lspBaseUrl?: string | null;
  lspBearerToken?: string | null;
  /** Reuse on-chain addresses instead of deriving a fresh one each call. Defaults to false. */
  reuseAddresses?: boolean;
}

export interface IRLNUnlockParams {
  bitcoindRpcUsername?: string | null;
  bitcoindRpcPassword?: string | null;
  bitcoindRpcHost?: string | null;
  bitcoindRpcPort?: number | null;
  indexerUrl?: string | null;
  proxyEndpoint?: string | null;
  announceAddresses?: string[];
  announceAlias?: string | null;
  gossipRgsServerUrl?: string | null;
}

export interface IRLNExternalSignerBootstrap {
  nodePublicKeyHex: string;
  accountXpubVanilla: string;
  accountXpubColored: string;
  masterFingerprint: string;
  protocolVersion: string;
  apiLevel: number;
}

// ── IRLN interface ────────────────────────────────────────────────────────────

export interface IRLN {
  // ── Node lifecycle ──────────────────────────────────────────────────────────

  rlnCreateNode(params: IRLNNodeCreateParams): Promise<number>;

  rlnInitNode(password: string, mnemonic?: string): Promise<string>;
  rlnUnlockNode(params: { password: string } & IRLNUnlockParams): Promise<void>;

  rlnShutdown(): Promise<void>;
  rlnDestroyNode(): Promise<void>;

  consumeRlnUnlockConflictNormalized(): boolean;

  // ── External signer (optional — node can be used with password only) ────────

  /**
   * @param storageDirPath  Enables the disk-backed VLS store so signer channel state
   *                        survives a restart. Omit for the legacy ephemeral signer.
   */
  rlnCreateNativeExternalSigner(
    seedHex: string,
    network: string,
    permissivePolicy?: boolean,
    storageDirPath?: string | null
  ): Promise<number>;

  rlnInitNodeWithNativeExternalSigner(signerId: number): Promise<void>;
  rlnAttachNativeExternalSigner(signerId: number): Promise<void>;

  rlnUnlockNodeWithNativeExternalSigner(
    signerId: number,
    params: IRLNUnlockParams
  ): Promise<void>;

  rlnDestroyNativeExternalSigner(signerId: number): Promise<void>;

  rlnInitNodeWithExternalSigner(
    bootstrap: IRLNExternalSignerBootstrap
  ): Promise<void>;

  // ── Node info ───────────────────────────────────────────────────────────────

  rlnNodeInfo(): Promise<RlnNodeInfo>;
  rlnNetworkInfo(): Promise<RlnNetworkInfo>;

  // ── Peers ───────────────────────────────────────────────────────────────────

  rlnConnectPeer(peerPubkeyAndAddr: string): Promise<void>;
  rlnListPeers(): Promise<RlnPeer[]>;
  rlnDisconnectPeer(peerPubkey: string): Promise<void>;

  // ── Channels ────────────────────────────────────────────────────────────────

  rlnListChannels(): Promise<RlnChannel[]>;
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
  }): Promise<RlnOpenChannelResponse>;
  rlnCloseChannel(
    channelId: string,
    peerPubkey: string,
    force: boolean
  ): Promise<void>;
  rlnGetChannelId(temporaryChannelId: string): Promise<string>;

  // ── Payments ─────────────────────────────────────────────────────────────────

  rlnListPayments(): Promise<RlnPayment[]>;
  rlnGetPayment(paymentHash: string): Promise<RlnPayment>;
  rlnInvoiceStatus(invoice: string): Promise<RlnInvoiceStatusWire>;

  rlnLnInvoice(
    amtMsat: number | null,
    expirySec: number,
    assetId: string | null,
    assetAmount: number | null,
    paymentHash?: string | null,
    minFinalCltvExpiryDelta?: number | null,
    /** BOLT11 `h` tag — commits the invoice to LNURL-pay metadata. */
    descriptionHash?: string | null
  ): Promise<RlnLnInvoiceResponse>;

  rlnClaimHodlInvoice(
    paymentHash: string,
    paymentPreimage: string
  ): Promise<RlnClaimHodlInvoiceResponse>;

  rlnCancelHodlInvoice(paymentHash: string): Promise<void>;

  rlnApayNew(hostNodeId: string): Promise<RlnApayNewResponse>;

  rlnApayNewWithAddress(
    hostNodeId: string,
    username: string,
    domain: string
  ): Promise<RlnApayNewResponse>;

  rlnDecodeLnInvoice(invoice: string): Promise<RlnDecodeLnInvoiceResponse>;
  rlnDecodeRgbInvoice(invoice: string): Promise<RlnDecodeRgbInvoiceResponse>;

  rlnSendPayment(
    invoice: string,
    amtMsat: number | null,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<RlnSendPaymentResponse>;

  rlnKeysend(
    destPubkey: string,
    amtMsat: number,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<RlnKeysendResponse>;

  // ── On-chain wallet (RLN-managed) ───────────────────────────────────────────

  rlnAddress(): Promise<RlnAddressResponse>;
  rlnRotateAddress(): Promise<RlnAddressResponse>;
  rlnSignMessage(message: string): Promise<RlnSignMessageResponse>;
  rlnVerifyMessage(
    message: string,
    signature: string
  ): Promise<RlnVerifyMessageResponse>;
  rlnBtcBalance(skipSync?: boolean): Promise<RlnBtcBalance>;
  rlnSendBtc(
    amount: number,
    address: string,
    feeRate: number,
    skipSync: boolean
  ): Promise<RlnSendBtcResponse>;

  // ── Assets / transfers ──────────────────────────────────────────────────────

  rlnIssueAssetNia(
    ticker: string,
    name: string,
    precision: number,
    amounts: number[]
  ): Promise<any>;
  rlnIssueAssetCfa(
    name: string,
    details: string | null,
    precision: number,
    amounts: number[],
    fileDigest: string | null
  ): Promise<any>;
  rlnIssueAssetIfa(
    ticker: string,
    name: string,
    precision: number,
    amounts: number[],
    inflationAmounts: number[],
    rejectListUrl: string | null
  ): Promise<any>;
  rlnIssueAssetUda(
    ticker: string,
    name: string,
    details: string | null,
    precision: number,
    mediaFileDigest: string | null,
    attachmentsFileDigests: string[]
  ): Promise<any>;
  /** Atomic IFA inflation — see {@link RlnInflateResponse}. */
  rlnInflate(
    assetId: string,
    inflationAmounts: number[],
    feeRate: number,
    minConfirmations: number
  ): Promise<RlnInflateResponse>;

  rlnListAssets(filterAssetSchemas: string[]): Promise<RlnListAssetsResponse>;
  rlnAssetBalance(assetId: string): Promise<RlnAssetBalance>;
  /**
   * `assignmentKind` defaults to `'Fungible'` when an amount is given and `null`
   * (→ native `Any`) otherwise. RLN discards `assignmentAmount` unless a kind is
   * set, so omitting it would silently produce an any-amount invoice.
   */
  rlnRgbInvoice(
    assetId: string | null,
    assignmentAmount: number | null,
    durationSeconds: number | null,
    minConfirmations: number,
    witness: boolean,
    assignmentKind?: RlnAssignmentKind | null
  ): Promise<RlnRgbInvoiceResponse>;
  rlnSendRgb(
    donation: boolean,
    feeRate: number,
    minConfirmations: number,
    skipSync: boolean,
    assetId: string,
    recipientId: string,
    amount: number,
    transportEndpoints: string[],
    witnessData?: { amountSat: number; blinding?: number } | null
  ): Promise<RlnSendRgbResponse>;
  rlnListTransactions(skipSync: boolean): Promise<RlnTransaction[]>;
  rlnListTransactionsByTxid(
    txid: string,
    skipSync: boolean
  ): Promise<RlnTransaction[]>;
  rlnListTransfers(assetId: string): Promise<RlnTransfer[]>;
  rlnListTransfersByTxid(txid: string): Promise<RlnTransfer[]>;
  rlnListUnspents(skipSync: boolean): Promise<RlnUnspent[]>;
  rlnRefreshTransfers(skipSync: boolean): Promise<void>;
  rlnFailTransfers(
    batchTransferIdx: number | null,
    noAssetOnly: boolean,
    skipSync: boolean
  ): Promise<RlnFailTransfersResponse>;

  // ── Utility ─────────────────────────────────────────────────────────────────

  rlnEstimateFee(blocks: number): Promise<RlnEstimateFeeResponse>;
  rlnCheckIndexerUrl(indexerUrl: string): Promise<RlnCheckIndexerUrlResponse>;
  rlnCheckProxyEndpoint(proxyEndpoint: string): Promise<void>;
  rlnSync(): Promise<void>;
  rlnCreateUtxos(
    upTo: boolean,
    num: number | null,
    size: number | null,
    feeRate: number,
    skipSync: boolean
  ): Promise<void>;

  // ── Backup ───────────────────────────────────────────────────────────────────

  rlnBackup(backupPath: string, password: string): Promise<void>;

  // ── VSS ──────────────────────────────────────────────────────────────────────

  rlnVssClearFence(password: string): Promise<void>;
}
