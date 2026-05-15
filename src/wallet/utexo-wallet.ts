import type {
  IWalletManager,
  IUTEXOProtocol,
  Network,
  BtcBalance,
  Balance,
  Unspent,
  Utxo,
  RgbAllocation,
  Assignment,
  AssignmentType,
  TransactionType,
  TransferKind,
  TransferStatus,
  Transaction,
  Transfer,
  Outpoint,
  ListAssets,
  AssetNIA,
  AssetIfa,
  AssetUDA,
  AssetCFA,
  AssetBalance,
  InvoiceRequest,
  InvoiceReceiveData,
  InvoiceData,
  IssueAssetNiaRequestModel,
  IssueAssetIfaRequestModel,
  SendAssetBeginRequestModel,
  SendAssetEndRequestModel,
  SendResult,
  OperationResult,
  InflateAssetIfaRequestModel,
  InflateEndRequestModel,
  SendBtcBeginRequestModel,
  SendBtcEndRequestModel,
  FailTransfersRequest,
  WalletBackupResponse,
  GetFeeEstimationResponse,
  VssBackupConfig,
  VssBackupInfo,
  CreateUtxosBeginRequestModel,
  CreateUtxosEndRequestModel,
  LightningReceiveRequest,
  LightningSendRequest,
  ListLightningPaymentsResponse,
  CreateLightningInvoiceRequestModel,
  GetLightningSendFeeEstimateRequestModel,
  PayLightningInvoiceRequestModel,
  OnchainReceiveRequestModel,
  OnchainReceiveResponse,
  OnchainSendRequestModel,
  OnchainSendResponse,
  OnchainSendStatus,
  TransferStatus as CoreTransferStatus,
  BitcoinNetwork,
} from '@utexo/rgb-sdk-core';
import type { EstimateFeeResult } from '@utexo/rgb-sdk-core';
import { AssetSchema } from '@utexo/rgb-sdk-core';

import { RLNManager, createRLNManager } from './rln-manager';
import type { IRLNSigner } from './rln-signers';
import type { IRLNUnlockParams, IRLNNodeCreateParams } from '../binding/IRLN';
import type {
  RlnNodeInfo,
  RlnNetworkInfo,
  RlnPeer,
  RlnChannel,
  RlnOpenChannelResponse,
  RlnKeysendResponse,
  RlnInvoiceStatus,
  RlnDecodeLnInvoiceResponse,
  RlnCheckIndexerUrlResponse,
  RlnBtcBalance,
  RlnAssetBalance,
  RlnAssetNia,
  RlnAssetCfa,
  RlnAssetIfa,
  RlnAssetUda,
  RlnListAssetsResponse,
  RlnRgbInvoiceResponse,
  RlnDecodeRgbInvoiceResponse,
  RlnTransaction,
  RlnTransfer,
  RlnUnspent,
} from '../binding/rln-types';

// ── Extended send request models ─────────────────────────────────────────────
// These extend the core interfaces with RLN-specific fields without modifying core.

export interface RlnOnchainReceiveRequestModel extends OnchainReceiveRequestModel {
  witness?: boolean;
}

export interface RlnSendAssetRequestModel extends SendAssetBeginRequestModel {
  skipSync?: boolean;
}

export interface RlnOnchainSendRequestModel extends OnchainSendRequestModel {
  witnessData?: { amountSat: number; blinding?: number };
  donation?: boolean;
  feeRate?: number;
  minConfirmations?: number;
  skipSync?: boolean;
}

// ── Constructor params ────────────────────────────────────────────────────────

export interface UTEXOWalletNodeParams {
  storageDirPath: string;
  daemonListeningPort: number;
  ldkPeerListeningPort: number;
  network: string;
  maxMediaUploadSizeMb?: number;
  enableVirtualChannelsV0?: boolean;
  xpubVan: string;
  xpubCol: string;
  masterFingerprint: string;
}

// ── Type-mapping helpers (module-private) ─────────────────────────────────────

function parseAssignment(s: string): Assignment {
  const m = s.match(/Fungible\((\d+)\)/);
  if (m) return { type: 'Fungible', amount: Number(m[1]) };
  const types: AssignmentType[] = ['NonFungible', 'InflationRight', 'ReplaceRight', 'Any'];
  for (const t of types) {
    if (s.includes(t)) return { type: t };
  }
  return { type: 'Any' };
}

function parseOutpoint(s: string): Outpoint {
  const i = s.lastIndexOf(':');
  return { txid: s.slice(0, i) || s, vout: Number(s.slice(i + 1)) || 0 };
}

function mapBtcBalance(b: RlnBtcBalance): BtcBalance {
  return b as unknown as BtcBalance;
}

function mapBalance(b: RlnAssetBalance): Balance {
  return { settled: b.settled, future: b.future, spendable: b.spendable };
}

function mapAssetBalance(b: RlnAssetBalance): AssetBalance {
  return {
    settled: b.settled,
    future: b.future,
    spendable: b.spendable,
    offchainOutbound: b.offchainOutbound,
    offchainInbound: b.offchainInbound,
  };
}

function mapUtxo(u: RlnUnspent): Unspent {
  return {
    utxo: {
      outpoint: parseOutpoint(u.utxo.outpoint),
      btcAmount: u.utxo.btcAmount,
      colorable: u.utxo.colorable,
      exists: true,
    } as Utxo,
    rgbAllocations: (u.rgbAllocations ?? []).map(
      (a): RgbAllocation => ({
        assetId: a.assetId,
        assignment: parseAssignment(a.assignment),
        settled: a.settled,
      }),
    ),
    pendingBlinded: 0,
  };
}

function mapTransaction(t: RlnTransaction): Transaction {
  const validTypes: TransactionType[] = ['RgbSend', 'Drain', 'CreateUtxos', 'User'];
  return {
    txid: t.txid,
    transactionType: (validTypes.includes(t.transactionType as TransactionType)
      ? t.transactionType
      : 'User') as TransactionType,
    received: t.received ?? 0,
    sent: t.sent ?? 0,
    fee: t.fee ?? 0,
    confirmationTime: t.confirmationTime,
  };
}

function mapTransfer(t: RlnTransfer): Transfer {
  const validStatuses: TransferStatus[] = [
    'WaitingCounterparty', 'WaitingConfirmations', 'Settled', 'Failed',
  ];
  const validKinds: TransferKind[] = [
    'Issuance', 'ReceiveBlind', 'ReceiveWitness', 'Send', 'Inflation',
  ];
  return {
    idx: t.idx,
    batchTransferIdx: 0,
    createdAt: t.createdAt ?? 0,
    updatedAt: t.updatedAt ?? 0,
    status: (validStatuses.includes(t.status as TransferStatus)
      ? t.status
      : 'WaitingCounterparty') as TransferStatus,
    assignments: (t.assignments ?? []).map(parseAssignment),
    kind: (validKinds.includes(t.kind as TransferKind) ? t.kind : 'Send') as TransferKind,
    txid: t.txid,
    recipientId: t.recipientId,
    receiveUtxo: t.receiveUtxo ? parseOutpoint(t.receiveUtxo) : undefined,
    changeUtxo: t.changeUtxo ? parseOutpoint(t.changeUtxo) : undefined,
    expiration: t.expiration,
    transportEndpoints: (t.transportEndpoints ?? []).map(e => ({
      endpoint: e.endpoint,
      transportType: e.transportType,
      used: e.used,
    })),
  };
}

function mapAssetNia(a: RlnAssetNia): AssetNIA {
  return {
    assetId: a.assetId,
    ticker: a.ticker,
    name: a.name,
    details: a.details,
    precision: a.precision,
    issuedSupply: a.issuedSupply,
    timestamp: a.timestamp,
    addedAt: a.addedAt,
    balance: mapBalance(a.balance),
    media: a.media ? { filePath: a.media.filePath, mime: a.media.mime } : undefined,
  };
}

function mapAssetCfa(a: RlnAssetCfa): AssetCFA {
  return {
    assetId: a.assetId,
    name: a.name,
    details: a.details,
    precision: a.precision,
    issuedSupply: a.issuedSupply,
    timestamp: a.timestamp,
    addedAt: a.addedAt,
    balance: mapBalance(a.balance),
    media: a.media ? { filePath: a.media.filePath, mime: a.media.mime } : undefined,
  };
}

function mapAssetIfa(a: RlnAssetIfa): AssetIfa {
  return {
    assetId: a.assetId,
    ticker: a.ticker,
    name: a.name,
    details: a.details,
    precision: a.precision,
    initialSupply: a.initialSupply,
    maxSupply: a.maxSupply,
    knownCirculatingSupply: a.knownCirculatingSupply,
    timestamp: a.timestamp,
    addedAt: a.addedAt,
    balance: mapBalance(a.balance),
    media: a.media ? { filePath: a.media.filePath, mime: a.media.mime } : undefined,
    rejectListUrl: a.rejectListUrl,
  };
}

function mapAssetUda(a: RlnAssetUda): AssetUDA {
  return {
    assetId: a.assetId,
    ticker: a.ticker,
    name: a.name,
    details: a.details,
    precision: a.precision,
    timestamp: a.timestamp,
    addedAt: a.addedAt,
    balance: mapBalance(a.balance),
    token: a.token as AssetUDA['token'],
  };
}

function mapListAssets(r: RlnListAssetsResponse): ListAssets {
  return {
    nia: (r.nia ?? []).map(mapAssetNia),
    cfa: (r.cfa ?? []).map(mapAssetCfa),
    ifa: (r.ifa ?? []).map(mapAssetIfa),
    uda: (r.uda ?? []).map(mapAssetUda),
  };
}

function mapInvoiceReceiveData(r: RlnRgbInvoiceResponse): InvoiceReceiveData {
  return {
    invoice: r.invoice,
    recipientId: r.recipientId ?? '',
    expirationTimestamp: r.expirationTimestamp ?? null,
    batchTransferIdx: r.batchTransferIdx,
  };
}

function mapInvoiceData(r: RlnDecodeRgbInvoiceResponse, invoice: string): InvoiceData {
  const schemaMap: Record<string, AssetSchema> = {
    Nia: AssetSchema.Nia,
    Uda: AssetSchema.Uda,
    Cfa: AssetSchema.Cfa,
  };
  return {
    invoice,
    recipientId: r.recipientId,
    assetSchema: r.assetSchema ? schemaMap[r.assetSchema] : undefined,
    assetId: r.assetId,
    network: r.network as BitcoinNetwork,
    assignment: parseAssignment(r.assignment),
    expirationTimestamp: r.expirationTimestamp ?? null,
    transportEndpoints: r.transportEndpoints,
  };
}

function mapInvoiceStatus(s: RlnInvoiceStatus): CoreTransferStatus | null {
  switch (s) {
    case 'PENDING': return 'WaitingCounterparty';
    case 'CLAIMABLE':
    case 'CLAIMING': return 'WaitingConfirmations';
    case 'SUCCEEDED': return 'Settled';
    case 'CANCELLED':
    case 'FAILED':
    case 'EXPIRED': return 'Failed';
    default: return null;
  }
}

// ── UTEXOWallet ────────────────────────────────────────────────────────────

export class UTEXOWallet implements IWalletManager, IUTEXOProtocol {
  private rln: RLNManager;
  private readonly params: UTEXOWalletNodeParams;
  private readonly signer: IRLNSigner;
  private disposed = false;

  constructor(params: UTEXOWalletNodeParams, signer: IRLNSigner) {
    this.params = params;
    this.signer = signer;
    this.rln = createRLNManager();
  }

  // ── RLN lifecycle (primary API) ───────────────────────────────────────────

  /** First-time init: createNode + signer.initNode (writes keys to disk). */
  async init(): Promise<void> {
    await this.rln.rlnCreateNode(this.buildNodeParams());
    await this.signer.initNode(this.rln);
  }

  /** Unlock the node (every start). Accepts the same params as IRLNUnlockParams. */
  async unlock(params: IRLNUnlockParams): Promise<void> {
    await this.signer.unlockNode(this.rln, params);
  }

  /**
   * Restart after shutdown: recreates the internal RLNManager (old one's rlnNodeId
   * would block rlnCreateNode), then calls createNode (bridge detects SHUTDOWN → INITIALIZED).
   * Call shutdown() before this on the same instance.
   */
  async reinit(params?: IRLNUnlockParams): Promise<void> {
    this.rln = createRLNManager();
    await this.rln.rlnCreateNode(this.buildNodeParams());
    if (params) await this.signer.unlockNode(this.rln, params);
  }

  /** Stop the node. Bridge marks the entry as SHUTDOWN (restartable via reinit). */
  async shutdown(): Promise<void> {
    await this.rln.rlnShutdown();
  }

  /** Full cleanup: shutdown + destroyNode + signer.dispose. */
  async destroy(): Promise<void> {
    try {
      await this.rln.rlnShutdown();
    } catch {}
    try {
      await this.rln.rlnDestroyNode();
    } catch {}
    await this.signer.dispose?.(this.rln);
    this.disposed = true;
  }

  // ── IWalletManager — Initialization & Lifecycle ───────────────────────────

  /** Backward-compat alias for init(). */
  async initialize(): Promise<void> {
    return this.init();
  }

  goOnline(_indexerUrl: string, _skipConsistencyCheck?: boolean): Promise<void> {
    throw new Error('UTEXOWallet.goOnline: not implemented — use unlock(params) instead');
  }

  getXpub(): { xpubVan: string; xpubCol: string } {
    return { xpubVan: this.params.xpubVan, xpubCol: this.params.xpubCol };
  }

  getNetwork(): Network {
    return this.params.network as Network;
  }

  async dispose(): Promise<void> {
    return this.destroy();
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  // ── IWalletManager — Balance & Address ────────────────────────────────────

  async getBtcBalance(): Promise<BtcBalance> {
    return mapBtcBalance(await this.rln.rlnBtcBalance(false));
  }

  async getAddress(): Promise<string> {
    return (await this.rln.rlnAddress()).address;
  }

  rotateVanillaAddress(): Promise<string> {
    throw new Error('UTEXOWallet.rotateVanillaAddress: not implemented');
  }

  rotateColoredAddress(): Promise<string> {
    throw new Error('UTEXOWallet.rotateColoredAddress: not implemented');
  }

  // ── IWalletManager — UTXO Management ─────────────────────────────────────

  async listUnspents(): Promise<Unspent[]> {
    return (await this.rln.rlnListUnspents(false)).map(mapUtxo);
  }

  createUtxosBegin(_params: CreateUtxosBeginRequestModel): Promise<string> {
    throw new Error('UTEXOWallet.createUtxosBegin: not implemented');
  }

  createUtxosEnd(_params: CreateUtxosEndRequestModel): Promise<number> {
    throw new Error('UTEXOWallet.createUtxosEnd: not implemented');
  }

  async createUtxos(params: {
    upTo?: boolean;
    num?: number;
    size?: number;
    feeRate?: number;
  }): Promise<number> {
    await this.rln.rlnCreateUtxos(
      params.upTo ?? true,
      params.num ?? null,
      params.size ?? null,
      params.feeRate ?? 1.5,
      false,
    );
    return params.num ?? 0;
  }

  // ── IWalletManager — Asset Operations ────────────────────────────────────

  async listAssets(): Promise<ListAssets> {
    return mapListAssets(await this.rln.rlnListAssets([]));
  }

  async getAssetBalance(asset_id: string): Promise<AssetBalance> {
    return mapAssetBalance(await this.rln.rlnAssetBalance(asset_id));
  }

  async issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA> {
    const raw = await this.rln.rlnIssueAssetNia(
      params.ticker,
      params.name,
      params.precision,
      params.amounts,
    );
    return mapAssetNia(raw);
  }

  async issueAssetIfa(params: IssueAssetIfaRequestModel): Promise<any> {
    return this.rln.rlnIssueAssetIfa(
      params.ticker,
      params.name,
      params.precision,
      params.amounts,
      params.inflationAmounts,
      params.rejectListUrl,
    );
  }

  inflateBegin(_params: InflateAssetIfaRequestModel): Promise<string> {
    throw new Error('UTEXOWallet.inflateBegin: not implemented');
  }

  inflateEnd(_params: InflateEndRequestModel): Promise<OperationResult> {
    throw new Error('UTEXOWallet.inflateEnd: not implemented');
  }

  inflate(_params: InflateAssetIfaRequestModel, _mnemonic?: string): Promise<OperationResult> {
    throw new Error('UTEXOWallet.inflate: not implemented');
  }

  // ── IWalletManager — Sending Assets ──────────────────────────────────────

  sendBegin(_params: SendAssetBeginRequestModel): Promise<string> {
    throw new Error('UTEXOWallet.sendBegin: not implemented');
  }

  sendEnd(_params: SendAssetEndRequestModel): Promise<SendResult> {
    throw new Error('UTEXOWallet.sendEnd: not implemented');
  }

  async send(params: RlnSendAssetRequestModel, _mnemonic?: string): Promise<SendResult> {
    const decoded = await this.rln.rlnDecodeRgbInvoice(params.invoice);
    const assetId = params.assetId ?? decoded.assetId;
    if (!assetId) throw new Error('UTEXOWallet.send: assetId required');
    if (params.amount === undefined) throw new Error('UTEXOWallet.send: amount required');
    return this.rln.rlnSendRgb(
      params.donation ?? false,
      params.feeRate ?? 1.5,
      params.minConfirmations ?? 1,
      params.skipSync ?? false,
      assetId,
      decoded.recipientId,
      params.amount,
      decoded.transportEndpoints,
      params.witnessData ?? null,
    );
  }

  // ── IWalletManager — Sending BTC ──────────────────────────────────────────

  sendBtcBegin(_params: SendBtcBeginRequestModel): Promise<string> {
    throw new Error('UTEXOWallet.sendBtcBegin: not implemented');
  }

  sendBtcEnd(_params: SendBtcEndRequestModel): Promise<string> {
    throw new Error('UTEXOWallet.sendBtcEnd: not implemented');
  }

  async sendBtc(params: SendBtcBeginRequestModel): Promise<string> {
    const resp = await this.rln.rlnSendBtc(
      params.amount,
      params.address,
      params.feeRate,
      params.skipSync ?? false,
    );
    return resp.txid;
  }

  // ── IWalletManager — Receiving Assets ────────────────────────────────────

  async blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    return mapInvoiceReceiveData(
      await this.rln.rlnRgbInvoice(
        params.assetId ?? null,
        params.amount ?? null,
        params.durationSeconds ?? null,
        params.minConfirmations ?? 0,
        false,
      ),
    );
  }

  async witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    return mapInvoiceReceiveData(
      await this.rln.rlnRgbInvoice(
        params.assetId ?? null,
        params.amount ?? null,
        params.durationSeconds ?? null,
        params.minConfirmations ?? 0,
        true,
      ),
    );
  }

  async decodeRGBInvoice(params: { invoice: string }): Promise<InvoiceData> {
    return mapInvoiceData(
      await this.rln.rlnDecodeRgbInvoice(params.invoice),
      params.invoice,
    );
  }

  // ── IWalletManager — Transactions & Transfers ─────────────────────────────

  async listTransactions(): Promise<Transaction[]> {
    return (await this.rln.rlnListTransactions(false)).map(mapTransaction);
  }

  async listTransfers(asset_id?: string): Promise<Transfer[]> {
    return (await this.rln.rlnListTransfers(asset_id ?? '')).map(mapTransfer);
  }

  async failTransfers(params: FailTransfersRequest): Promise<boolean> {
    const resp = await this.rln.rlnFailTransfers(
      params.batchTransferIdx ?? null,
      params.noAssetOnly ?? false,
      params.skipSync ?? false,
    );
    return resp.transfersChanged;
  }

  async refreshWallet(): Promise<void> {
    return this.rln.rlnRefreshTransfers(false);
  }

  async syncWallet(): Promise<void> {
    return this.rln.rlnSync();
  }

  // ── IWalletManager — VSS Backup (not implemented) ────────────────────────

  configureVssBackup(_config: VssBackupConfig): Promise<void> {
    throw new Error('UTEXOWallet.configureVssBackup: not implemented');
  }

  disableVssAutoBackup(): Promise<void> {
    throw new Error('UTEXOWallet.disableVssAutoBackup: not implemented');
  }

  vssBackup(_config: VssBackupConfig): Promise<number> {
    throw new Error('UTEXOWallet.vssBackup: not implemented');
  }

  vssBackupInfo(_config: VssBackupConfig): Promise<VssBackupInfo> {
    throw new Error('UTEXOWallet.vssBackupInfo: not implemented');
  }

  // ── IWalletManager — Fee Estimation ──────────────────────────────────────

  async estimateFeeRate(blocks: number): Promise<GetFeeEstimationResponse> {
    const resp = await this.rln.rlnEstimateFee(blocks);
    return { [String(blocks)]: resp.feeRate };
  }

  estimateFee(_psbtBase64: string): Promise<EstimateFeeResult> {
    throw new Error('UTEXOWallet.estimateFee: not implemented');
  }

  // ── IWalletManager — Backup ───────────────────────────────────────────────

  async createBackup(params: { backupPath: string; password: string }): Promise<WalletBackupResponse> {
    await this.rln.rlnBackup(params.backupPath, params.password);
    return { message: 'Backup created successfully', backupPath: params.backupPath };
  }

  // ── IWalletManager — Cryptographic Operations (not implemented) ───────────

  signPsbt(_psbt: string, _mnemonic?: string): Promise<string> {
    throw new Error('UTEXOWallet.signPsbt: not implemented');
  }

  signMessage(_message: string): Promise<string> {
    throw new Error('UTEXOWallet.signMessage: not implemented');
  }

  verifyMessage(_message: string, _signature: string, _accountXpub?: string): Promise<boolean> {
    throw new Error('UTEXOWallet.verifyMessage: not implemented');
  }

  // ── IUTEXOProtocol — Lightning ────────────────────────────────────────────

  async createLightningInvoice(params: CreateLightningInvoiceRequestModel): Promise<LightningReceiveRequest> {
    const amtMsat = params.amountSats != null ? params.amountSats * 1000 : null;
    const assetId = params.asset?.assetId || null;
    const assetAmount = assetId ? (params.asset?.amount ?? null) : null;
    const resp = await this.rln.rlnLnInvoice(
      amtMsat,
      params.expirySeconds ?? 3600,
      assetId,
      assetAmount,
    );
    return { lnInvoice: resp.invoice };
  }

  async getLightningReceiveRequest(id: string): Promise<CoreTransferStatus | null> {
    const status = await this.rln.rlnInvoiceStatus(id);
    return mapInvoiceStatus(status);
  }

  async getLightningSendRequest(id: string): Promise<CoreTransferStatus | null> {
    const payment = await this.rln.rlnGetPayment(id);
    if (!payment?.status) return null;
    // Native layer serializes enum with .name / .uppercased() → always UPPERCASE
    const map: Record<string, CoreTransferStatus> = {
      PENDING: 'WaitingCounterparty',
      CLAIMABLE: 'WaitingConfirmations',
      CLAIMING: 'WaitingConfirmations',
      SUCCEEDED: 'Settled',
      CANCELLED: 'Failed',
      FAILED: 'Failed',
    };
    return map[String(payment.status).toUpperCase()] ?? null;
  }

  getLightningSendFeeEstimate(_params: GetLightningSendFeeEstimateRequestModel): Promise<number> {
    throw new Error('UTEXOWallet.getLightningSendFeeEstimate: not implemented');
  }

  payLightningInvoiceBegin(_params: PayLightningInvoiceRequestModel): Promise<string> {
    throw new Error('UTEXOWallet.payLightningInvoiceBegin: not implemented');
  }

  payLightningInvoiceEnd(_params: SendAssetEndRequestModel): Promise<LightningSendRequest> {
    throw new Error('UTEXOWallet.payLightningInvoiceEnd: not implemented');
  }

  async payLightningInvoice(params: PayLightningInvoiceRequestModel): Promise<LightningSendRequest> {
    const amtMsat = params.amount != null ? params.amount * 1000 : null;
    const resp = await this.rln.rlnSendPayment(
      params.lnInvoice,
      amtMsat,
      params.assetId ?? null,
      null,
    );
    return { txid: resp.paymentHash ?? resp.paymentId, status: resp.status };
  }

  async listLightningPayments(): Promise<ListLightningPaymentsResponse> {
    const payments = await this.rln.rlnListPayments();
    return {
      payments: payments.map(p => ({ txid: p.paymentHash, status: p.status })),
    };
  }

  // ── IUTEXOProtocol — Onchain ──────────────────────────────────────────────

  async onchainReceive(params: RlnOnchainReceiveRequestModel): Promise<OnchainReceiveResponse> {
    const resp = await this.rln.rlnRgbInvoice(
      params.assetId,
      params.amount,
      params.durationSeconds ?? null,
      params.minConfirmations ?? 0,
      params.witness ?? true,
    );
    return { invoice: resp.invoice };
  }

  onchainSendBegin(_params: OnchainSendRequestModel): Promise<string> {
    throw new Error('UTEXOWallet.onchainSendBegin: not implemented');
  }

  onchainSendEnd(_params: SendAssetEndRequestModel): Promise<OnchainSendResponse> {
    throw new Error('UTEXOWallet.onchainSendEnd: not implemented');
  }

  async onchainSend(params: RlnOnchainSendRequestModel): Promise<OnchainSendResponse> {
    const decoded = await this.rln.rlnDecodeRgbInvoice(params.invoice);
    const assetId = params.assetId ?? decoded.assetId;
    if (!assetId) throw new Error('UTEXOWallet.onchainSend: assetId required');
    if (params.amount === undefined) throw new Error('UTEXOWallet.onchainSend: amount required');
    return this.rln.rlnSendRgb(
      params.donation ?? false,
      params.feeRate ?? 1.5,
      params.minConfirmations ?? 1,
      params.skipSync ?? false,
      assetId,
      decoded.recipientId,
      params.amount,
      decoded.transportEndpoints,
      params.witnessData ?? null,
    );
  }

  getOnchainSendStatus(_send_id: string): Promise<OnchainSendStatus | null> {
    throw new Error('UTEXOWallet.getOnchainSendStatus: not implemented');
  }

  async listOnchainTransfers(asset_id?: string): Promise<Transfer[]> {
    return (await this.rln.rlnListTransfers(asset_id ?? '')).map(mapTransfer);
  }

  // ── RLN-specific extras ───────────────────────────────────────────────────

  getNodeInfo(): Promise<RlnNodeInfo> {
    return this.rln.rlnNodeInfo();
  }

  getNetworkInfo(): Promise<RlnNetworkInfo> {
    return this.rln.rlnNetworkInfo();
  }

  connectPeer(peerPubkeyAndAddr: string): Promise<void> {
    return this.rln.rlnConnectPeer(peerPubkeyAndAddr);
  }

  listPeers(): Promise<RlnPeer[]> {
    return this.rln.rlnListPeers();
  }

  disconnectPeer(peerPubkey: string): Promise<void> {
    return this.rln.rlnDisconnectPeer(peerPubkey);
  }

  listChannels(): Promise<RlnChannel[]> {
    return this.rln.rlnListChannels();
  }

  openChannel(request: Parameters<RLNManager['rlnOpenChannel']>[0]): Promise<RlnOpenChannelResponse> {
    return this.rln.rlnOpenChannel(request);
  }

  closeChannel(channelId: string, peerPubkey: string, force: boolean): Promise<void> {
    return this.rln.rlnCloseChannel(channelId, peerPubkey, force);
  }

  getChannelId(temporaryChannelId: string): Promise<string> {
    return this.rln.rlnGetChannelId(temporaryChannelId);
  }

  keysend(
    destPubkey: string,
    amtMsat: number,
    assetId?: string,
    assetAmount?: number,
  ): Promise<RlnKeysendResponse> {
    return this.rln.rlnKeysend(destPubkey, amtMsat, assetId ?? null, assetAmount ?? null);
  }

  decodeLnInvoice(invoice: string): Promise<RlnDecodeLnInvoiceResponse> {
    return this.rln.rlnDecodeLnInvoice(invoice);
  }

  invoiceStatus(invoice: string): Promise<RlnInvoiceStatus> {
    return this.rln.rlnInvoiceStatus(invoice);
  }

  checkIndexerUrl(url: string): Promise<RlnCheckIndexerUrlResponse> {
    return this.rln.rlnCheckIndexerUrl(url);
  }

  checkProxyEndpoint(endpoint: string): Promise<void> {
    return this.rln.rlnCheckProxyEndpoint(endpoint);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildNodeParams(): IRLNNodeCreateParams {
    return {
      storageDirPath: this.params.storageDirPath,
      daemonListeningPort: this.params.daemonListeningPort,
      ldkPeerListeningPort: this.params.ldkPeerListeningPort,
      network: this.params.network,
      maxMediaUploadSizeMb: this.params.maxMediaUploadSizeMb ?? 20,
      enableVirtualChannelsV0: this.params.enableVirtualChannelsV0 ?? null,
    };
  }
}
