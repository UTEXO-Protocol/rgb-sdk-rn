import {
  resolveReceiveAssignment,
  toSafeBridgeNumber,
  validateAssetSchemas,
  validateBurnParams,
  validateConsignmentLookup,
} from '../operations/validation';
import type {
  AssetMetadata,
  AssetSchemaName,
  BurnParams,
  BurnResult,
  DecodedLnInvoiceDetails,
  IssueAssetCfaParams,
  IssueAssetUdaParams,
  LightningNodeDetails,
  ListAssets,
  OnchainReceiveParams,
  ReadOptions,
  ReceiveParams,
  Transfer,
} from '../types';
import { getTransferAmount, parseTransferAssignment } from './transfer-amounts';
import type { RefreshTransfersResult } from '../refresh-types';
import type { WalletInvoiceData } from '../wallet-api';
import type {
  IUTEXOProtocol,
  WalletCapabilities,
  CreateLnInvoiceRequest,
  UTEXOWalletCreateParams,
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
  Transaction,
  Outpoint,
  AssetNIA,
  AssetIfa,
  AssetUDA,
  AssetCFA,
  AssetBalance,
  InvoiceReceiveData,
  InvoiceData,
  IssueAssetNiaRequestModel,
  IssueAssetIfaRequestModel,
  InflateAssetIfaRequestModel,
  SendBtcBeginRequestModel,
  FailTransfersRequest,
  WalletBackupResponse,
  LightningReceiveRequest,
  LightningSendRequest,
  ListLightningPaymentsResponse,
  PayLightningInvoiceRequestModel,
  OnchainReceiveResponse,
  GetFeeEstimationResponse,
  OnchainSendRequestModel,
  OnchainSendResponse,
  BitcoinNetwork,
} from '@utexo/rgb-sdk-core';
import {
  AssetSchema,
  ConfigurationError,
  ValidationError,
  WalletError,
  normalizeRlnNetwork,
  normalizeTransferStatus,
} from '@utexo/rgb-sdk-core';

import { RLNManager, createRLNManager } from './rln-manager';
import type { IRLNSigner } from './rln-signers';
import type {
  IRLNUnlockParams,
  IRLNNodeCreateParams,
} from '../../binding/IRLN';
import { toNativeNetwork } from '../../binding/Interfaces';
import {
  getDefaultLspBaseUrl,
  resolveLspBaseUrl,
  resolveUnlockParams,
} from './network-defaults';
import type {
  RlnAssetMetadata,
  RlnBtcBalance,
  RlnAssetBalance,
  RlnAssetNia,
  RlnAssetBfa,
  RlnAssetCfa,
  RlnAssetIfa,
  RlnAssetUda,
  RlnListAssetsResponse,
  RlnRgbInvoiceResponse,
  RlnDecodeRgbInvoiceResponse,
  RlnTransaction,
  RlnTransfer,
  RlnUnspent,
} from '../../binding/rln-types';
import type {
  CreateHodlInvoiceParams,
  HodlInvoiceResult,
  ApayNewResponse,
  LspPeer,
  LightningChannel,
  LightningPayment,
  LightningInvoice,
  OpenChannelParams,
  OpenChannelResult,
  LightningNetworkInfo,
  LightningPeer,
  SendPaymentResult,
} from '@utexo/rgb-sdk-core';
import type { RlnPaymentStatus, RlnInvoiceStatus } from '@utexo/rgb-sdk-core';
import {
  normalizeInvoiceStatus,
  tryNormalizePaymentStatus,
} from '@utexo/rgb-sdk-core';
import { UtexoLsp } from '@utexo/rgb-sdk-core';
import { UtexoLSPClient } from '@utexo/rgb-sdk-core';
import {
  toLightningChannel,
  toLightningNodeInfo,
  toLightningPayment,
  toLightningInvoice,
  toDecodedLnInvoice,
  toRefreshTransfersResult,
  toLightningNetworkInfo,
  toLightningPeer,
  toSendPaymentResult,
} from '../../binding/mappers';

// ── Constructor params ────────────────────────────────────────────────────────

/**
 * RN wallet params — the shared contract plus RN-only extras.
 *
 * `mnemonic` and `password` are deliberately Omit-ted from the shared params:
 * on RN those credentials live in the signer (a required second constructor
 * argument), not in the plain config object. Omitting them here states that
 * split in the type rather than leaving two places that could disagree.
 */
export interface UTEXOWalletNodeParams extends Omit<
  UTEXOWalletCreateParams,
  'mnemonic' | 'password'
> {
  storageDirPath: string;
  daemonListeningPort: number;
  ldkPeerListeningPort: number;
  network: BitcoinNetwork;
  maxMediaUploadSizeMb?: number;
  enableVirtualChannelsV0?: boolean;
  virtualPeerPubkeys?: string[] | null;
  vssUrl?: string | null;
  vssAllowHttp?: boolean;
  vssAllowEmptyRestore?: boolean;
  lspBaseUrl?: string | null;
  lspBearerToken?: string | null;
  /**
   * Must be `false` or omitted. RLN on rgb-lib-bfa rejects address reuse;
   * `true` throws `ConfigurationError` from the constructor.
   */
  reuseAddresses?: boolean;
}

// ── Type-mapping helpers (module-private) ─────────────────────────────────────

function parseAssignment(s: string): Assignment {
  const m = s.match(/Fungible\((\d+)\)/);
  if (m) return { type: 'Fungible', amount: Number(m[1]) };
  const types: AssignmentType[] = [
    'NonFungible',
    'InflationRight',
    'ReplaceRight',
    'Any',
  ];
  for (const t of types) {
    if (s.includes(t)) return { type: t };
  }
  return { type: 'Any' };
}

/** Amount of a `Fungible(n)` invoice; `undefined` when the invoice has none. */
function invoiceFungibleAmount(assignment: string): number | undefined {
  const m = assignment.match(/^Fungible\((\d+)\)$/);
  if (!m || m[1] === '0') return undefined;
  const amount = Number(m[1]);
  if (!Number.isSafeInteger(amount))
    throw new ValidationError(
      'Invoice amount exceeds the supported exact integer range',
      'amount'
    );
  return amount;
}

/**
 * Default on-chain RGB fee rate in sat/vB. It was 1.5, which the bridge
 * silently truncated to 1, so 1 keeps the fee callers already paid.
 */
const DEFAULT_RLN_SEND_FEE_RATE = 1;

/** Each value must be a positive safe integer (u64 base units). */
function bridgeAmounts(values: readonly number[], field: string): number[] {
  if (!Array.isArray(values))
    throw new ValidationError(`${field} must be an array`, field);
  return values.map((v) => bridgeInteger(v, field, 1, Number.MAX_SAFE_INTEGER));
}

const ASSET_SCHEMA_NAMES: Record<string, AssetSchemaName> = {
  nia: 'Nia',
  cfa: 'Cfa',
  uda: 'Uda',
  ifa: 'Ifa',
  bfa: 'Bfa',
};

function mapAssetMetadata(m: RlnAssetMetadata): AssetMetadata {
  const assetSchema = ASSET_SCHEMA_NAMES[m.assetSchema.toLowerCase()];
  if (!assetSchema)
    throw new WalletError(`Unknown asset schema: ${m.assetSchema}`);
  return {
    assetSchema,
    name: m.name,
    precision: m.precision,
    ticker: m.ticker ?? undefined,
    details: m.details ?? undefined,
    timestamp: m.timestamp,
    initialSupply: m.initialSupply,
    maxSupply: m.maxSupply,
    knownCirculatingSupply: m.knownCirculatingSupply,
  };
}

/** Integer the TurboModule bridge carries without rounding or truncation. */
function bridgeInteger(
  value: number,
  field: string,
  min: number,
  max: number
): number {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new ValidationError(
      `${field} must be an integer between ${min} and ${max}`,
      field
    );
  return value;
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
  const raw = b as any;
  return {
    settled: b.settled,
    future: b.future,
    spendable: b.spendable,
    offchainOutbound: b.offchainOutbound ?? raw.offchain_outbound,
    offchainInbound: b.offchainInbound ?? raw.offchain_inbound,
  };
}

function mapUtxo(u: RlnUnspent): Unspent {
  return {
    utxo: {
      outpoint: parseOutpoint(u.utxo.outpoint),
      btcAmount: u.utxo.btcAmount,
      colorable: u.utxo.colorable,
      exists: u.utxo.exists,
    } as Utxo,
    rgbAllocations: (u.rgbAllocations ?? []).map(
      (a): RgbAllocation => ({
        assetId: a.assetId,
        assignment: parseAssignment(a.assignment),
        settled: a.settled,
      })
    ),
    pendingBlinded: u.pendingBlinded ?? 0,
  };
}

function mapTransaction(t: RlnTransaction): Transaction {
  // RLNBinding canonicalizes the native enum to SCREAMING_SNAKE; map it onto
  // the core TransactionType vocabulary. Every RLN TransactionType variant has
  // a counterpart, so 'User' is only the fallback for an unrecognized value.
  const typeMap: Record<string, TransactionType> = {
    RGB_SEND: 'RgbSend',
    DRAIN: 'Drain',
    CREATE_UTXOS: 'CreateUtxos',
    SEND_BTC: 'SendBtc',
    INCOMING: 'Incoming',
  };
  return {
    txid: t.txid,
    transactionType: typeMap[t.transactionType ?? ''] ?? 'User',
    received: t.received ?? 0,
    sent: t.sent ?? 0,
    fee: t.fee ?? 0,
    confirmationTime: t.confirmationTime,
  };
}

/**
 * `Mint` comes from rgb-lib-bfa and is not in core `TransferKind` yet. It is
 * passed through, as RGB_L1 does, so a mint is not reported as a send.
 */
const VALID_TRANSFER_KINDS: Record<TransferKind | 'Mint', true> = {
  Issuance: true,
  ReceiveBlind: true,
  ReceiveWitness: true,
  Send: true,
  Inflation: true,
  Burn: true,
  Mint: true,
};

function isKnown(
  table: Record<string, true>,
  value: string | undefined
): boolean {
  return value != null && Object.prototype.hasOwnProperty.call(table, value);
}

function mapTransfer(t: RlnTransfer): Transfer {
  const transfer: Transfer = {
    idx: t.idx,
    batchTransferIdx: 0,
    createdAt: t.createdAt ?? 0,
    updatedAt: t.updatedAt ?? 0,
    status: normalizeTransferStatus(t.status),
    requestedAssignment:
      t.requestedAssignment == null
        ? undefined
        : parseTransferAssignment(t.requestedAssignment),
    assignments: (t.assignments ?? []).map(parseTransferAssignment),
    kind: (isKnown(VALID_TRANSFER_KINDS, t.kind)
      ? t.kind
      : 'Send') as TransferKind,
    txid: t.txid,
    recipientId: t.recipientId,
    receiveUtxo: t.receiveUtxo ? parseOutpoint(t.receiveUtxo) : undefined,
    changeUtxo: t.changeUtxo ? parseOutpoint(t.changeUtxo) : undefined,
    expiration: t.expiration,
    transportEndpoints: (t.transportEndpoints ?? []).map((e) => ({
      endpoint: e.endpoint,
      transportType: e.transportType,
      used: e.used,
    })),
  };
  return { ...transfer, ...getTransferAmount(transfer) };
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
    media: a.media
      ? { filePath: a.media.filePath, mime: a.media.mime }
      : undefined,
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
    media: a.media
      ? { filePath: a.media.filePath, mime: a.media.mime }
      : undefined,
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
    media: a.media
      ? { filePath: a.media.filePath, mime: a.media.mime }
      : undefined,
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

function mapAssetBfa(asset: RlnAssetBfa): RlnAssetBfa {
  // The current shared SDK exposes numeric balances. Do not return rounded u64s.
  for (const value of [
    asset.initialSupply,
    asset.balance.settled,
    asset.balance.future,
    asset.balance.spendable,
  ]) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error(
        'BFA supply or balance exceeds the supported exact integer range'
      );
  }
  return { ...asset, balance: mapBalance(asset.balance) };
}

function mapListAssets(r: RlnListAssetsResponse): ListAssets {
  return {
    bfa: (r.bfa ?? []).map(mapAssetBfa),
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

type RlnInvoiceData = InvoiceData &
  Pick<WalletInvoiceData, 'publicKey' | 'encryption'>;

const INVOICE_ENCRYPTION: Record<
  NonNullable<WalletInvoiceData['encryption']>,
  true
> = { Required: true, Optional: true, Unsupported: true };

function tryNormalizeInvoiceEncryption(
  value: string | null | undefined
): WalletInvoiceData['encryption'] {
  return value != null && isKnown(INVOICE_ENCRYPTION, value)
    ? (value as WalletInvoiceData['encryption'])
    : undefined;
}

function mapInvoiceData(
  r: RlnDecodeRgbInvoiceResponse,
  invoice: string
): RlnInvoiceData {
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
    network: normalizeRlnNetwork(r.network),
    assignment: parseAssignment(r.assignment),
    expirationTimestamp: r.expirationTimestamp ?? null,
    transportEndpoints: r.transportEndpoints,
    publicKey: r.publicKey ?? undefined,
    encryption: tryNormalizeInvoiceEncryption(r.encryption),
  };
}

// ── RLN implementation ────────────────────────────────────────────────────────────

export class RlnWallet implements IUTEXOProtocol<IRLNUnlockParams> {
  readonly protocol = 'RGB_LN' as const;

  async getWalletIdentity() {
    return {
      id: (await this.getNodeInfo()).pubkey,
      protocol: this.protocol,
      network: this.getNetwork(),
    };
  }

  /**
   * All three optional groups are **absent** on this platform, so the carrier
   * properties are simply not present — there is nothing to call, and the
   * compiler says so at the call site. This replaces the previous approach of
   * declaring the methods and throwing.
   *
   * The absences are architectural, not unfinished work: web bundles an rgb-lib
   * wallet in wasm *plus* the RLN node. This implementation owns the RLN node
   * only: no PSBT to hand out (`psbt`), no externally-signed begin/end flows
   * (`beginEnd`), and one state store that the node replicates itself.
   */
  readonly psbt = undefined;
  readonly beginEnd = undefined;

  /** Derived from carrier presence, so it cannot drift from reality. */
  get capabilities(): WalletCapabilities {
    return {
      psbtSigning: this.psbt !== undefined,
      beginEndFlows: this.beginEnd !== undefined,
    };
  }

  private rln: RLNManager;
  private readonly params: UTEXOWalletNodeParams;
  private readonly signer: IRLNSigner;
  private disposed = false;
  /** True once rlnCreateNode has run (init/reinit). Virtual-channel params are baked then. */
  private nodeCreated = false;

  constructor(params: UTEXOWalletNodeParams, signer: IRLNSigner) {
    if (params.reuseAddresses === true) {
      throw new ConfigurationError(
        'reuseAddresses is not supported by RLN on rgb-lib-bfa',
        'reuseAddresses'
      );
    }
    this.params = { ...params };
    this.signer = signer;
    this.rln = createRLNManager();
  }

  // ── RLN lifecycle (primary API) ───────────────────────────────────────────

  /** First-time init: createNode + signer.initNode (writes keys to disk). */
  async init(): Promise<void> {
    await this.rln.rlnCreateNode(this.buildNodeParams());
    this.nodeCreated = true;
    await this.signer.initNode(this.rln, this.params.storageDirPath);
  }

  /** Unlock the node (every start). Accepts the same params as IRLNUnlockParams. */
  async unlock(params: IRLNUnlockParams): Promise<void> {
    await this.signer.unlockNode(
      this.rln,
      resolveUnlockParams(this.params.network, params),
      this.params.storageDirPath
    );
  }

  /**
   * Restart after shutdown: recreates the internal RLNManager (old one's rlnNodeId
   * would block rlnCreateNode), then calls createNode (bridge detects SHUTDOWN → INITIALIZED).
   * Call shutdown() before this on the same instance.
   */
  async reinit(params?: IRLNUnlockParams): Promise<void> {
    this.rln = createRLNManager();
    await this.rln.rlnCreateNode(this.buildNodeParams());
    this.nodeCreated = true;
    if (params)
      await this.signer.unlockNode(
        this.rln,
        resolveUnlockParams(this.params.network, params),
        this.params.storageDirPath
      );
  }

  /** Stop the node. Bridge marks the entry as SHUTDOWN (restartable via reinit). */
  async shutdown(): Promise<void> {
    await this.rln.rlnShutdown();
  }

  /** Full cleanup: shutdown + destroyNode + signer.dispose. */
  async destroy(): Promise<void> {
    try {
      await this.rln.rlnShutdown();
    } catch {
      // Best-effort: the node may already be stopped.
    }
    try {
      await this.rln.rlnDestroyNode();
    } catch {
      // Best-effort: the node may already be destroyed.
    }
    await this.signer.dispose?.(this.rln);
    this.disposed = true;
  }

  // ── Initialization & Lifecycle ───────────────────────────

  /** Backward-compat alias for init(). */
  async initialize(): Promise<void> {
    return this.init();
  }

  // `goOnline` and `getXpub` are gone, not stubbed: the first was rgb-lib
  // lifecycle superseded by `unlock(params)`, the second an rgb-lib wallet
  // concept with no meaning on an RLN node (`getNodeInfo()` covers the real
  // need).

  getNetwork(): Network {
    return this.params.network as Network;
  }

  async dispose(): Promise<void> {
    return this.destroy();
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  // ── Balance & Address ────────────────────────────────────

  async getBtcBalance(options?: ReadOptions): Promise<BtcBalance> {
    return mapBtcBalance(
      await this.rln.rlnBtcBalance(options?.skipSync ?? false)
    );
  }

  async getAddress(): Promise<string> {
    return (await this.rln.rlnAddress()).address;
  }

  /**
   * Derives a fresh on-chain address, matching getAddress()'s vanilla (BTC)
   * wallet. Platform extra — address rotation left the shared contract because
   * the *coloured* variant threw on both platforms.
   */
  async rotateVanillaAddress(): Promise<string> {
    return (await this.rln.rlnRotateAddress()).address;
  }

  // ── UTXO Management ───────────────────────────────────────────────────────

  async listUnspents(options?: ReadOptions): Promise<Unspent[]> {
    return (await this.rln.rlnListUnspents(options?.skipSync ?? false)).map(
      mapUtxo
    );
  }

  // `createUtxosBegin`/`createUtxosEnd` belong to the `beginEnd` carrier, which
  // this wallet does not expose — the node creates UTXOs atomically and signs
  // internally, so there is no PSBT to hand out. `createUtxos()` below is the
  // whole operation.

  /**
   * Returns the number of UTXOs created. RLN does not report it, so it is
   * counted from colorable outpoints that appear after the call; rgb-lib
   * records the broadcast transaction locally, so no extra sync is needed.
   */
  async createUtxos(
    params: {
      upTo?: boolean;
      num?: number;
      size?: number;
      feeRate?: number;
    } & ReadOptions
  ): Promise<number> {
    const num =
      params.num === undefined
        ? null
        : bridgeInteger(params.num, 'num', 1, 255);
    const size =
      params.size === undefined
        ? null
        : bridgeInteger(params.size, 'size', 1, 0xffffffff);
    const feeRate = bridgeInteger(
      params.feeRate ?? DEFAULT_RLN_SEND_FEE_RATE,
      'feeRate',
      1,
      Number.MAX_SAFE_INTEGER
    );
    // The baseline read performs the sync the caller asked for.
    const before = new Set(
      (await this.rln.rlnListUnspents(params.skipSync ?? false)).map(
        (u) => u.utxo.outpoint
      )
    );
    await this.rln.rlnCreateUtxos(
      params.upTo ?? true,
      num,
      size,
      feeRate,
      true
    );
    return (await this.rln.rlnListUnspents(true)).filter(
      (u) => u.utxo.colorable && !before.has(u.utxo.outpoint)
    ).length;
  }

  async getBfaCapabilities() {
    const native = await this.rln.rlnBfaCapabilities();
    return {
      ...native,
      burn: native.burn && this.signer.supportsBurn === true,
    };
  }
  /** Irreversible. This low-level method does not retry or deduplicate burns. */
  async burn(params: BurnParams): Promise<BurnResult> {
    validateBurnParams(params);
    if (!(await this.getBfaCapabilities()).burn)
      throw new Error('Burn is unsupported by this native build or signer');
    return this.rln.rlnBurn(params);
  }
  /** Standard Base64 of the saved consignment bytes. No regeneration. */
  async getConsignment(assetId: string, txid: string): Promise<string> {
    validateConsignmentLookup(assetId, txid);
    return this.rln.rlnGetConsignment(assetId, txid);
  }
  /** Local sandbox path. Never expose it to a dApp. */
  async getConsignmentPath(assetId: string, txid: string): Promise<string> {
    validateConsignmentLookup(assetId, txid);
    return this.rln.rlnGetConsignmentPath(assetId, txid);
  }

  // ── Asset Operations ────────────────────────────────────

  async listAssets(options?: {
    filterAssetSchemas?: AssetSchemaName[];
  }): Promise<ListAssets> {
    return mapListAssets(
      await this.rln.rlnListAssets(
        validateAssetSchemas(options?.filterAssetSchemas)
      )
    );
  }

  async getAssetMetadata(assetId: string): Promise<AssetMetadata> {
    return mapAssetMetadata(await this.rln.rlnAssetMetadata(assetId));
  }

  async getAssetBalance(asset_id: string): Promise<AssetBalance> {
    return mapAssetBalance(await this.rln.rlnAssetBalance(asset_id));
  }

  async issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA> {
    const raw = await this.rln.rlnIssueAssetNia(
      params.ticker,
      params.name,
      bridgeInteger(params.precision, 'precision', 0, 18),
      bridgeAmounts(params.amounts, 'amounts')
    );
    return mapAssetNia(raw);
  }

  /** `filePath` is uploaded to the node first; RLN issues with its digest. */
  async issueAssetCfa(params: IssueAssetCfaParams): Promise<AssetCFA> {
    const precision = bridgeInteger(params.precision, 'precision', 0, 18);
    const amounts = bridgeAmounts(params.amounts, 'amounts');
    const digest = params.filePath
      ? await this.rln.rlnPostAssetMedia(params.filePath)
      : null;
    return mapAssetCfa(
      await this.rln.rlnIssueAssetCfa(
        params.name,
        params.details ?? null,
        precision,
        amounts,
        digest
      )
    );
  }

  /** Media and attachment files are uploaded first; RLN issues with their digests. */
  async issueAssetUda(params: IssueAssetUdaParams): Promise<AssetUDA> {
    const precision = bridgeInteger(params.precision, 'precision', 0, 18);
    const media = params.mediaFilePath
      ? await this.rln.rlnPostAssetMedia(params.mediaFilePath)
      : null;
    const attachments: string[] = [];
    for (const path of params.attachmentsFilePaths ?? [])
      attachments.push(await this.rln.rlnPostAssetMedia(path));
    return mapAssetUda(
      await this.rln.rlnIssueAssetUda(
        params.ticker,
        params.name,
        params.details ?? null,
        precision,
        media,
        attachments
      )
    );
  }

  /** Issue an inflatable (IFA) asset — mapped like `listAssets().ifa` entries. */
  async issueAssetIfa(params: IssueAssetIfaRequestModel): Promise<AssetIfa> {
    return mapAssetIfa(
      await this.rln.rlnIssueAssetIfa(
        params.ticker,
        params.name,
        bridgeInteger(params.precision, 'precision', 0, 18),
        bridgeAmounts(params.amounts, 'amounts'),
        bridgeAmounts(params.inflationAmounts, 'inflationAmounts'),
        params.rejectListUrl
      )
    );
  }

  /**
   * Atomic IFA inflation.
   *
   * The node signs internally, so there is no begin/end pair here and no
   * `mnemonic` parameter — contrast rgb-sdk-web, which has an rgb-lib wallet
   * and therefore both. `inflateBegin`/`inflateEnd` live on the `beginEnd`
   * carrier, which this wallet does not expose: a genuine platform difference,
   * not a gap.
   *
   * Returns only a `txid`: the uniffi `InflateResponse` carries no
   * `batchTransferIdx` (inflation is not a batch transfer), so none is
   * invented here.
   */
  async inflate(
    params: InflateAssetIfaRequestModel
  ): Promise<{ txid: string }> {
    const res = await this.rln.rlnInflate(
      params.assetId,
      bridgeAmounts(params.inflationAmounts, 'inflationAmounts'),
      bridgeInteger(
        params.feeRate ?? DEFAULT_RLN_SEND_FEE_RATE,
        'feeRate',
        1,
        Number.MAX_SAFE_INTEGER
      ),
      bridgeInteger(params.minConfirmations ?? 1, 'minConfirmations', 0, 255)
    );
    return { txid: res.txid };
  }

  // The `send`/`sendBegin`/`sendEnd` trio is gone. `sendBegin`/`sendEnd` were
  // stubs, and web had already dropped the names in favour of `onchainSend*` —
  // dead surface on both platforms. `onchainSend()` below is the one spelling.

  // ── Sending BTC ───────────────────────────────────────────────────────────
  //
  // `sendBtcBegin`/`sendBtcEnd` belong to the `beginEnd` carrier, absent here.

  async sendBtc(params: SendBtcBeginRequestModel): Promise<string> {
    const resp = await this.rln.rlnSendBtc(
      bridgeInteger(params.amount, 'amount', 1, Number.MAX_SAFE_INTEGER),
      params.address,
      bridgeInteger(params.feeRate, 'feeRate', 1, Number.MAX_SAFE_INTEGER),
      params.skipSync ?? false
    );
    return resp.txid;
  }

  // ── Receiving Assets ────────────────────────────────────

  async blindReceive(params: ReceiveParams): Promise<InvoiceReceiveData> {
    return mapInvoiceReceiveData(await this.rgbInvoice(params, false));
  }

  async witnessReceive(params: ReceiveParams): Promise<InvoiceReceiveData> {
    return mapInvoiceReceiveData(await this.rgbInvoice(params, true));
  }

  private rgbInvoice(params: ReceiveParams, witness: boolean) {
    const kind = resolveReceiveAssignment(params.assignmentKind, params.amount);
    if (kind === 'MintRight')
      throw new ValidationError(
        'MintRight receive is not supported by RGB_LN',
        'assignmentKind'
      );
    return this.rln.rlnRgbInvoice(
      params.assetId ?? null,
      params.amount === undefined
        ? null
        : bridgeInteger(params.amount, 'amount', 1, Number.MAX_SAFE_INTEGER),
      params.durationSeconds === undefined
        ? null
        : bridgeInteger(
            params.durationSeconds,
            'durationSeconds',
            1,
            2_592_000
          ),
      bridgeInteger(params.minConfirmations ?? 0, 'minConfirmations', 0, 255),
      witness,
      kind
    );
  }

  async decodeRGBInvoice(params: { invoice: string }): Promise<RlnInvoiceData> {
    return mapInvoiceData(
      await this.rln.rlnDecodeRgbInvoice(params.invoice),
      params.invoice
    );
  }

  // ── Transactions & Transfers ─────────────────────────────

  async listTransactions(options?: ReadOptions): Promise<Transaction[]> {
    return (await this.rln.rlnListTransactions(options?.skipSync ?? false)).map(
      mapTransaction
    );
  }

  /** Transactions filtered to a single txid — avoids listing the whole wallet history. */
  async listTransactionsByTxid(
    txid: string,
    skipSync: boolean = false
  ): Promise<Transaction[]> {
    return (await this.rln.rlnListTransactionsByTxid(txid, skipSync)).map(
      mapTransaction
    );
  }

  async listTransfers(asset_id?: string): Promise<Transfer[]> {
    return (await this.rln.rlnListTransfers(asset_id ?? '')).map(mapTransfer);
  }

  /** Transfers filtered to a single txid, across all assets. */
  async listTransfersByTxid(txid: string): Promise<Transfer[]> {
    return (await this.rln.rlnListTransfersByTxid(txid)).map(mapTransfer);
  }

  async failTransfers(params: FailTransfersRequest): Promise<boolean> {
    const resp = await this.rln.rlnFailTransfers(
      params.batchTransferIdx === undefined
        ? null
        : bridgeInteger(
            params.batchTransferIdx,
            'batchTransferIdx',
            1,
            0x7fffffff
          ),
      params.noAssetOnly ?? false,
      params.skipSync ?? false
    );
    return resp.transfersChanged;
  }

  async refreshWallet(): Promise<void> {
    await this.refreshTransfers();
  }

  async refreshTransfers(skipSync = false): Promise<RefreshTransfersResult> {
    return toRefreshTransfersResult(
      await this.rln.rlnRefreshTransfers(skipSync)
    );
  }

  async syncWallet(): Promise<void> {
    return this.rln.rlnSync();
  }

  // ── VSS ───────────────────────────────────────────────────────────────────
  //
  // The imperative VSS methods belong to the `vss` carrier, which this wallet
  // does not expose. That is not a gap: the node replicates its single state
  // store automatically, so there is nothing to drive from JS. web needs the
  // carrier because it has *two* stores — the rgb-lib wallet and the node —
  // and must back the wallet up manually.
  //
  // `vssClearFence` below stays on the shared contract: taking over another
  // device's single-writer fence is a deliberate act, never automatic.

  // ── Fee Estimation ────────────────────────────────────────────────────────

  async estimateFeeRate(blocks: number): Promise<GetFeeEstimationResponse> {
    const resp = await this.rln.rlnEstimateFee(
      bridgeInteger(blocks, 'blocks', 1, 0xffff)
    );
    // Rounded up, as on RGB_L1, so the estimate is a valid integer feeRate.
    return { feeRate: Math.ceil(resp.feeRate) };
  }

  // `estimateFee(psbt)` is on the `psbt` carrier — it estimates for a *PSBT*,
  // which this platform never produces.

  // ── Backup ────────────────────────────────────────────────────────────────

  async createBackup(params: {
    backupPath: string;
    password: string;
  }): Promise<WalletBackupResponse> {
    await this.rln.rlnBackup(params.backupPath, params.password);
    return {
      message: 'Backup created successfully',
      backupPath: params.backupPath,
    };
  }

  // ── Cryptographic Operations ──────────────────────────────────────────────
  //
  // `signPsbt` is on the `psbt` carrier, absent here. bdk-rn was removed and
  // the node signs internally; `NativeExternalRLNSigner` does not restore it,
  // since it signs channel/LDK operations inside the node rather than
  // arbitrary PSBTs handed in from JS.

  /** Signs with the node's own key — the counterpart to verifyMessage(). */
  async signMessage(message: string): Promise<string> {
    return (await this.rln.rlnSignMessage(message)).signedMessage;
  }

  /**
   * Verifies against this node's own key. No `accountXpub` parameter —
   * verification on an RLN node is always against the node key.
   */
  async verifyMessage(message: string, signature: string): Promise<boolean> {
    return (await this.rln.rlnVerifyMessage(message, signature)).valid;
  }

  // ── IUTEXOProtocol — Lightning ────────────────────────────────────────────

  /**
   * Takes the narrowed {@link CreateLnInvoiceRequest}, plus two rn-only extras.
   *
   * `paymentHash` was dropped: it made this method a second way to create a
   * HODL invoice, and web declared it while silently discarding it (its wasm
   * live-invoice API takes four arguments). `createHodlInvoice` is now the only
   * spelling on both platforms.
   *
   * `minFinalCltvExpiryDelta` and `descriptionHash` remain **rn platform
   * extras** — the web node cannot accept them. Both names already exist in
   * core's LSP types, so they are reused rather than reinvented.
   */
  async createLightningInvoice(
    params: CreateLnInvoiceRequest & {
      minFinalCltvExpiryDelta?: number | null;
      /** BOLT11 `h` tag — required by LNURL-pay to commit to the metadata. */
      descriptionHash?: string | null;
      /** BOLT11 `d` tag; mutually exclusive with `descriptionHash`. */
      description?: string | null;
    }
  ): Promise<LightningReceiveRequest> {
    this.assertLightningEnabled();
    const amtMsat =
      params.amountSats != null
        ? toSafeBridgeNumber(params.amountSats * 1000, 'amountSats')
        : null;
    const assetId = params.asset?.assetId || null;
    const assetAmount = assetId
      ? toSafeBridgeNumber(params.asset?.amount, 'asset.amount')
      : null;
    const resp = await this.rln.rlnLnInvoice(
      amtMsat,
      params.expirySeconds ?? 3600,
      assetId,
      assetAmount,
      null,
      params.minFinalCltvExpiryDelta ?? null,
      params.descriptionHash ?? null,
      params.description ?? null
    );
    return { lnInvoice: resp.invoice };
  }

  async createHodlInvoice(
    params: CreateHodlInvoiceParams & {
      /** BOLT11 `h` tag — required by LNURL-pay to commit to the metadata. */
      descriptionHash?: string | null;
      /** BOLT11 `d` tag; mutually exclusive with `descriptionHash`. */
      description?: string | null;
    }
  ): Promise<LightningInvoice> {
    this.assertLightningEnabled();
    const resp = await this.rln.rlnLnInvoice(
      params.amtMsat != null
        ? toSafeBridgeNumber(params.amtMsat, 'amtMsat')
        : null,
      params.expirySec,
      params.assetId ?? null,
      params.assetAmount != null
        ? toSafeBridgeNumber(params.assetAmount, 'assetAmount')
        : null,
      params.paymentHash,
      params.minFinalCltvExpiryDelta ?? null,
      params.descriptionHash ?? null,
      params.description ?? null
    );
    return toLightningInvoice(resp, {
      paymentHash: params.paymentHash,
      expirySeconds: params.expirySec,
      amtMsat: params.amtMsat,
      assetId: params.assetId,
      assetAmount: params.assetAmount,
    });
  }

  async claimHodlInvoice(
    paymentHash: string,
    preimage: string
  ): Promise<HodlInvoiceResult> {
    this.assertLightningEnabled();
    const resp = await this.rln.rlnClaimHodlInvoice(paymentHash, preimage);
    return { changed: resp.changed };
  }

  async cancelHodlInvoice(paymentHash: string): Promise<HodlInvoiceResult> {
    this.assertLightningEnabled();
    await this.rln.rlnCancelHodlInvoice(paymentHash);
    return { changed: true };
  }

  /** Payments in the canonical domain shape (part of the shared contract). */
  async listPayments(): Promise<LightningPayment[]> {
    this.assertLightningEnabled();
    return (await this.rln.rlnListPayments()).map(toLightningPayment);
  }

  async apayNew(hostNodeId: string): Promise<ApayNewResponse> {
    this.assertLightningEnabled();
    const raw = await this.rln.rlnApayNew(hostNodeId);
    return {
      requestId: raw.requestId,
      hostNodeId: raw.hostNodeId,
      protocolVersion: raw.protocolVersion,
      orderId: raw.orderId,
      status: raw.status,
      acceptedThroughIndex: raw.acceptedThroughIndex,
      nextIndexExpected: raw.nextIndexExpected,
      unusedHashes: raw.unusedHashes,
      refillBatchSize: raw.refillBatchSize,
      firstHashIndex: raw.firstHashIndex,
      lastHashIndex: raw.lastHashIndex,
      hashes: raw.hashes,
    };
  }

  /**
   * Register an async-payment hash pool bound to a Lightning Address.
   *
   * Same as {@link apayNew} but additionally signs an address attestation
   * (username + domain) so the LSP can prove the address is owned by this node
   * — required for APay hash-substitution resistance.
   */
  async apayNewWithAddress(
    hostNodeId: string,
    username: string,
    domain: string
  ): Promise<ApayNewResponse> {
    this.assertLightningEnabled();
    const raw = await this.rln.rlnApayNewWithAddress(
      hostNodeId,
      username,
      domain
    );
    return {
      requestId: raw.requestId,
      hostNodeId: raw.hostNodeId,
      protocolVersion: raw.protocolVersion,
      orderId: raw.orderId,
      status: raw.status,
      acceptedThroughIndex: raw.acceptedThroughIndex,
      nextIndexExpected: raw.nextIndexExpected,
      unusedHashes: raw.unusedHashes,
      refillBatchSize: raw.refillBatchSize,
      firstHashIndex: raw.firstHashIndex,
      lastHashIndex: raw.lastHashIndex,
      hashes: raw.hashes,
    };
  }

  // ── LSP ──────────────────────────────────────────────────────────────────────

  /**
   * Create an UtexoLsp instance for composed LSP flows.
   *
   * No-arg form — auto-discovers peer info from the wallet's lspBaseUrl:
   *   const lsp = await wallet.createLsp();
   *   // pubkey, host and port all from GET /get_info
   *
   * An LSP that publishes no address falls back to the HTTP hostname and the
   * `peerPort` argument.
   *
   * Explicit form — use when you already have the peer details:
   *   const lsp = await wallet.createLsp({ baseUrl, peerPubkey, peerHost, peerPort });
   */
  async createLsp(peer?: LspPeer, peerPort = 9735): Promise<UtexoLsp> {
    this.assertLightningEnabled();
    if (peer) return new UtexoLsp(this, peer);

    const baseUrl = resolveLspBaseUrl(
      this.params.network,
      this.params.lspBaseUrl
    );

    const http = new UtexoLSPClient({
      baseUrl,
      bearerToken: this.params.lspBearerToken ?? undefined,
    });
    const info = await http.getInfo();
    this.enableVirtualChannelsForPeer(info.pubkey);

    return new UtexoLsp(this, {
      baseUrl,
      peerPubkey: info.pubkey,
      peerHost: info.host ?? new URL(baseUrl).hostname,
      peerPort: info.port ?? peerPort,
      bearerToken: this.params.lspBearerToken ?? undefined,
    });
  }

  /**
   * Turns on virtual channels v0 for the given LSP peer by mutating the node-create params.
   *
   * These params (enableVirtualChannelsV0, virtualPeerPubkeys) are consumed by rlnCreateNode
   * and cannot be changed after the node exists, so this must run before init()/reinit().
   * Throws if the node was already created.
   */
  private enableVirtualChannelsForPeer(peerPubkey: string): void {
    if (this.nodeCreated) {
      throw new Error(
        'createLsp() must be called before init()/reinit(): virtual-channel params ' +
          '(enableVirtualChannelsV0, virtualPeerPubkeys) are baked into the node at init time ' +
          'and cannot be changed afterwards.'
      );
    }
    this.params.enableVirtualChannelsV0 = true;
    const existing = this.params.virtualPeerPubkeys ?? [];
    this.params.virtualPeerPubkeys = existing.includes(peerPubkey)
      ? existing
      : [...existing, peerPubkey];
  }

  /**
   * Returns the lspBaseUrl and bearer token this node was initialized with.
   * Useful for confirming APay config matches the UtexoLsp peer config.
   */
  getLspConfig(): { baseUrl: string | null; bearerToken: string | null } {
    return {
      baseUrl: this.params.lspBaseUrl ?? null,
      bearerToken: this.params.lspBearerToken ?? null,
    };
  }

  /**
   * Canonical inbound LN status, in the node's own vocabulary.
   *
   * Lightning and RGB on-chain statuses are deliberately separate: an invoice
   * is never reported as `WaitingCounterparty`/`Settled` (RGB consignment
   * states with no Lightning meaning). Apps that want one unified column fold
   * these in their own UI layer.
   */
  async getLightningReceiveStatus(id: string): Promise<RlnInvoiceStatus> {
    this.assertLightningEnabled();
    return normalizeInvoiceStatus(await this.rln.rlnInvoiceStatus(id));
  }

  /**
   * Canonical outbound LN status. `null` when the payment hash is unknown to
   * the node.
   */
  async getLightningSendStatus(id: string): Promise<RlnPaymentStatus | null> {
    this.assertLightningEnabled();
    const payment = await this.rln.rlnGetPayment(id);
    if (!payment?.status) return null;
    return tryNormalizePaymentStatus(payment.status);
  }

  // No local `& { assetAmount?: number }` intersection — core's
  // `PayLightningInvoiceRequestModel` already declares `assetAmount`, and
  // re-declaring core fields would make the two platforms look divergent when
  // they are not.
  async payLightningInvoice(
    params: PayLightningInvoiceRequestModel
  ): Promise<LightningSendRequest> {
    this.assertLightningEnabled();
    const amtMsat =
      params.amount != null
        ? toSafeBridgeNumber(params.amount * 1000, 'amount')
        : null;
    const resp = await this.rln.rlnSendPayment(
      params.lnInvoice,
      amtMsat,
      params.assetId ?? null,
      toSafeBridgeNumber(params.assetAmount, 'assetAmount')
    );
    return { txid: resp.paymentHash ?? resp.paymentId, status: resp.status };
  }

  async listLightningPayments(): Promise<ListLightningPaymentsResponse> {
    this.assertLightningEnabled();
    const payments = await this.rln.rlnListPayments();
    return {
      payments: payments.map((p) => ({
        txid: p.paymentHash,
        status: p.status,
      })),
    };
  }

  // ── IUTEXOProtocol — Onchain ──────────────────────────────────────────────

  async onchainReceive(
    params: OnchainReceiveParams
  ): Promise<OnchainReceiveResponse> {
    const resp = await this.rgbInvoice(params, params.witness ?? true);
    // Full receive data — the node already returns it; the older shape
    // discarded everything but the invoice.
    return {
      invoice: resp.invoice,
      recipientId: resp.recipientId,
      expirationTimestamp: resp.expirationTimestamp ?? null,
      batchTransferIdx: resp.batchTransferIdx,
    };
  }

  // `onchainSendBegin`/`onchainSendEnd` are on the `beginEnd` carrier, absent
  // here — the node sends atomically and signs internally.

  async onchainSend(
    params: OnchainSendRequestModel
  ): Promise<OnchainSendResponse> {
    // RLN rejects proxy recipients built from decoded fields, so the whole
    // invoice goes to native. Decoding here only fills defaults. RLN syncs
    // inside the send; `skipSync` does not apply.
    // The bridge truncates numbers to native integers, so reject anything
    // that would change value on the way.
    if (params.amount !== undefined)
      bridgeInteger(params.amount, 'amount', 1, Number.MAX_SAFE_INTEGER);
    const feeRate = bridgeInteger(
      params.feeRate ?? DEFAULT_RLN_SEND_FEE_RATE,
      'feeRate',
      1,
      Number.MAX_SAFE_INTEGER
    );
    const minConfirmations = bridgeInteger(
      params.minConfirmations ?? 1,
      'minConfirmations',
      0,
      255
    );
    const witnessData = params.witnessData ?? null;
    if (witnessData) {
      bridgeInteger(
        witnessData.amountSat,
        'witnessData.amountSat',
        1,
        Number.MAX_SAFE_INTEGER
      );
      if (witnessData.blinding !== undefined)
        bridgeInteger(
          witnessData.blinding,
          'witnessData.blinding',
          0,
          Number.MAX_SAFE_INTEGER
        );
    }
    const decoded = await this.rln.rlnDecodeRgbInvoice(params.invoice);
    const assetId = params.assetId ?? decoded.assetId;
    if (!assetId)
      throw new ValidationError(
        'UTEXOWallet.onchainSend: assetId required',
        'assetId'
      );
    const amount = params.amount ?? invoiceFungibleAmount(decoded.assignment);
    if (amount === undefined)
      throw new ValidationError(
        'UTEXOWallet.onchainSend: amount required',
        'amount'
      );
    return this.rln.rlnSendRgbInvoice(
      params.invoice,
      assetId,
      amount,
      params.donation ?? false,
      feeRate,
      minConfirmations,
      witnessData
    );
  }

  async listOnchainTransfers(asset_id?: string): Promise<Transfer[]> {
    return (await this.rln.rlnListTransfers(asset_id ?? '')).map(mapTransfer);
  }

  // ── RLN-specific extras ───────────────────────────────────────────────────

  async getNodeInfo(): Promise<LightningNodeDetails> {
    return toLightningNodeInfo(await this.rln.rlnNodeInfo());
  }

  async getNetworkInfo(): Promise<LightningNetworkInfo> {
    return toLightningNetworkInfo(await this.rln.rlnNetworkInfo());
  }

  async connectPeer(peerPubkeyAndAddr: string): Promise<void> {
    this.assertLightningEnabled();
    return this.rln.rlnConnectPeer(peerPubkeyAndAddr);
  }

  async listPeers(): Promise<LightningPeer[]> {
    this.assertLightningEnabled();
    return (await this.rln.rlnListPeers()).map(toLightningPeer);
  }

  async disconnectPeer(peerPubkey: string): Promise<void> {
    this.assertLightningEnabled();
    return this.rln.rlnDisconnectPeer(peerPubkey);
  }

  async listChannels(): Promise<LightningChannel[]> {
    this.assertLightningEnabled();
    return (await this.rln.rlnListChannels()).map(toLightningChannel);
  }

  /**
   * Open a channel.
   *
   * The extras below are **rn-only** and declared here rather than in core: the
   * wasm node takes no argument for any of them, and virtual mode is a
   * node-wide setting on web.
   */
  async openChannel(
    params: OpenChannelParams & {
      /** Msat pushed to the peer at open. Default 0. */
      pushMsat?: number | bigint;
      /** Open an anchor-outputs channel. Default true. */
      withAnchors?: boolean;
      feeBaseMsat?: number | null;
      feeProportionalMillionths?: number | null;
      /** Caller-supplied temporary channel id (advanced). */
      temporaryChannelId?: string | null;
      pushAssetAmount?: number | bigint | null;
      virtualOpenMode?: string | null;
    }
  ): Promise<OpenChannelResult> {
    this.assertLightningEnabled();
    const resp = await this.rln.rlnOpenChannel({
      peerPubkeyAndOptAddr: params.peerPubkey,
      capacitySat: toSafeBridgeNumber(params.capacitySat, 'capacitySat')!,
      pushMsat: toSafeBridgeNumber(params.pushMsat ?? 0, 'pushMsat')!,
      public: params.isPublic,
      withAnchors: params.withAnchors ?? true,
      feeBaseMsat: params.feeBaseMsat ?? null,
      feeProportionalMillionths: params.feeProportionalMillionths ?? null,
      temporaryChannelId: params.temporaryChannelId ?? null,
      assetId: params.assetId ?? null,
      assetAmount: toSafeBridgeNumber(
        params.assetLocalAmount,
        'assetLocalAmount'
      ),
      pushAssetAmount: toSafeBridgeNumber(
        params.pushAssetAmount,
        'pushAssetAmount'
      ),
      virtualOpenMode: params.virtualOpenMode ?? null,
    });
    return { temporaryChannelId: resp.temporaryChannelId };
  }

  async closeChannel(
    channelId: string,
    peerPubkey: string,
    force: boolean
  ): Promise<void> {
    this.assertLightningEnabled();
    return this.rln.rlnCloseChannel(channelId, peerPubkey, force);
  }

  async getChannelId(temporaryChannelId: string): Promise<string> {
    this.assertLightningEnabled();
    return this.rln.rlnGetChannelId(temporaryChannelId);
  }

  async keysend(
    destPubkey: string,
    amtMsat: number,
    assetId?: string,
    assetAmount?: number
  ): Promise<SendPaymentResult> {
    this.assertLightningEnabled();
    return toSendPaymentResult(
      await this.rln.rlnKeysend(
        destPubkey,
        toSafeBridgeNumber(amtMsat, 'amtMsat')!,
        assetId ?? null,
        toSafeBridgeNumber(assetAmount, 'assetAmount')
      )
    );
  }

  async decodeLnInvoice(invoice: string): Promise<DecodedLnInvoiceDetails> {
    this.assertLightningEnabled();
    return toDecodedLnInvoice(await this.rln.rlnDecodeLnInvoice(invoice));
  }

  /** Canonical invoice status (PascalCase) — normalized from the wire enum. */
  async invoiceStatus(invoice: string): Promise<RlnInvoiceStatus> {
    this.assertLightningEnabled();
    return normalizeInvoiceStatus(await this.rln.rlnInvoiceStatus(invoice));
  }

  /** `indexerProtocol` is lowercase (`electrum`, `esplora`), as on RGB_L1. */
  async checkIndexerUrl(url: string): Promise<{ indexerProtocol: string }> {
    const resp = await this.rln.rlnCheckIndexerUrl(url);
    return { indexerProtocol: resp.indexerProtocol.toLowerCase() };
  }

  checkProxyEndpoint(endpoint: string): Promise<void> {
    return this.rln.rlnCheckProxyEndpoint(endpoint);
  }

  // ── VSS ───────────────────────────────────────────────────────────────────

  /**
   * Clears the VSS single-writer fence lock. Call this while the node is
   * locked (before unlock) to recover from an unclean shutdown that left a
   * stale fence blocking re-initialization.
   */
  vssClearFence(password?: string): Promise<void> {
    // Optional in the shared contract (web's node-internal fence takes none);
    // the native module requires one, so fail loudly rather than pass undefined.
    if (password == null) {
      throw new Error(
        'UTEXOWallet.vssClearFence: password is required on React Native'
      );
    }
    return this.rln.rlnVssClearFence(password);
  }

  /**
   * Replicate wallet state to VSS now; returns the new backup version.
   *
   * The node also backs up on its own — this is the "don't wait" call. There
   * is no configure/disable pair to go with it: the node owns its single state
   * store and its VSS client is configured at `init()` from `vssUrl`.
   */
  backupNow(): Promise<number> {
    return this.rln.rlnVssBackup();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private assertLightningEnabled(): void {
    if (normalizeRlnNetwork(this.params.network) === 'mainnet') {
      throw new WalletError(
        'Lightning is disabled on mainnet. Only on-chain operations are supported.',
        'LIGHTNING_DISABLED_ON_MAINNET'
      );
    }
  }

  private buildNodeParams(): IRLNNodeCreateParams {
    return {
      storageDirPath: this.params.storageDirPath,
      daemonListeningPort: this.params.daemonListeningPort,
      ldkPeerListeningPort: this.params.ldkPeerListeningPort,
      network: toNativeNetwork(this.params.network as BitcoinNetwork),
      maxMediaUploadSizeMb: this.params.maxMediaUploadSizeMb ?? 20,
      enableVirtualChannelsV0: this.params.enableVirtualChannelsV0 ?? null,
      virtualPeerPubkeys: this.params.virtualPeerPubkeys ?? null,
      vssUrl: this.params.vssUrl ?? null,
      vssAllowHttp: this.params.vssAllowHttp ?? false,
      vssAllowEmptyRestore: this.params.vssAllowEmptyRestore ?? false,
      lspBaseUrl:
        this.params.lspBaseUrl ??
        getDefaultLspBaseUrl(this.params.network) ??
        null,
      lspBearerToken: this.params.lspBearerToken ?? null,
      reuseAddresses: this.params.reuseAddresses ?? false,
    };
  }
}
