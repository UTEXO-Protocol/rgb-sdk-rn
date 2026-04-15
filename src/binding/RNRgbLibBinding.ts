/**
 * RNRgbLibBinding — React Native implementation of IRgbLibBinding.
 *
 * Directly wraps the NativeRgb TurboModule (no intermediate Wallet class).
 * Manages walletId state, translates IRgbLibBinding model types to native
 * call shapes, and satisfies IRgbLibBinding so it can be injected into
 * BaseWalletManager.
 */
import Rgb from './NativeRgb';
import type { IRgbLibBinding, WalletInitParams } from '@utexo/rgb-sdk-core';
import {
  ValidationError,
  WalletError,
  normalizeNetwork,
} from '@utexo/rgb-sdk-core';
import { toNativeNetwork } from './Interfaces';
import type {
  BtcBalance,
  Unspent,
  ListAssets,
  AssetBalance,
  AssetNIA,
  AssetIfa,
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
  WalletBackupResponse,
  VssBackupConfig,
  VssBackupInfo,
  GetFeeEstimationResponse,
  RecipientMap,
  AssignmentType,
} from '@utexo/rgb-sdk-core';
import type { Keys } from './Interfaces';
import {
  DEFAULT_INDEXER_URLS,
  DEFAULT_TRANSPORT_ENDPOINTS,
} from '@utexo/rgb-sdk-core';

/**
 * Maps `IRgbLibBinding` / `InvoiceRequest` (`durationSeconds` = TTL from now,
 * optional absolute `expirationTimestamp`) to rgb-lib's absolute Unix seconds
 * for the TurboModule (`NativeRgb` passes this through to Kotlin/Swift as-is).
 */
function receiveExpirationUnixSeconds(
  params: InvoiceRequest & { expirationTimestamp?: number | null }
): number {
  const explicit = params.expirationTimestamp;
  if (explicit != null && Number.isFinite(Number(explicit))) {
    let ts = Math.floor(Number(explicit));
    if (ts > 10_000_000_000) {
      ts = Math.floor(ts / 1000);
    }
    return ts;
  }
  const duration = params.durationSeconds ?? 2000;
  return (
    Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(Number(duration)))
  );
}

// ── RNRgbLibBinding ──────────────────────────────────────────────────────────

export class RNRgbLibBinding implements IRgbLibBinding {
  private walletId: number | null = null;
  private initPromise: Promise<void> | null = null;

  private readonly keys: Keys;
  private readonly rnNetwork: string;
  private readonly transportEndpoint: string;
  readonly indexerUrl: string;
  private readonly maxAllocationsPerUtxo: number;
  private readonly vanillaKeychain: number;
  private readonly reuseAddresses: boolean;

  constructor(params: WalletInitParams) {
    if (!params.xpubVan)
      throw new ValidationError('xpubVan is required', 'xpubVan');
    if (!params.xpubCol)
      throw new ValidationError('xpubCol is required', 'xpubCol');
    if (!params.masterFingerprint)
      throw new ValidationError(
        'masterFingerprint is required',
        'masterFingerprint'
      );

    const network = normalizeNetwork(params.network ?? 'regtest');
    // utexo is a UTEXO-specific network — native rgb-lib only knows signet
    this.rnNetwork = toNativeNetwork(network);
    this.transportEndpoint =
      params.transportEndpoint ??
      DEFAULT_TRANSPORT_ENDPOINTS[network] ??
      DEFAULT_TRANSPORT_ENDPOINTS.signet!;

    this.indexerUrl =
      params.indexerUrl ??
      DEFAULT_INDEXER_URLS[network] ??
      DEFAULT_INDEXER_URLS['regtest']!;

    this.keys = {
      mnemonic: params.mnemonic ?? '',
      xpub: params.xpub ?? '',
      accountXpubVanilla: params.xpubVan,
      accountXpubColored: params.xpubCol,
      masterFingerprint: params.masterFingerprint,
    };
    this.maxAllocationsPerUtxo = params.maxAllocationsPerUtxo ?? 1;
    this.vanillaKeychain = params.vanillaKeychain ?? 0;
    this.reuseAddresses = params.reuseAddresses ?? false;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.walletId !== null) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      this.walletId = await Rgb.initializeWallet(
        this.rnNetwork,
        this.keys.accountXpubVanilla,
        this.keys.accountXpubColored,
        this.keys.mnemonic,
        this.keys.masterFingerprint,
        ['Nia', 'Uda', 'Cfa'],
        this.maxAllocationsPerUtxo,
        this.vanillaKeychain,
        this.reuseAddresses
      );
    })();
    await this.initPromise;
  }

  private id(): number {
    if (this.walletId === null)
      throw new WalletError('Wallet not initialized. Call goOnline() first.');
    return this.walletId;
  }

  async goOnline(
    indexerUrl: string,
    skipConsistencyCheck: boolean = false
  ): Promise<void> {
    await this.ensureInitialized();
    await Rgb.goOnline(this.id(), skipConsistencyCheck, indexerUrl);
  }

  getOnline(): void {}

  registerWallet(): { address: string; btcBalance: BtcBalance } {
    throw new WalletError(
      'registerWallet is not supported synchronously in React Native.'
    );
  }

  dropWallet(): void {
    if (this.walletId !== null) {
      Rgb.walletClose(this.walletId).catch(() => {});
      this.walletId = null;
      this.initPromise = null;
    }
  }

  async getBtcBalance(): Promise<BtcBalance> {
    return Rgb.getBtcBalance(this.id(), false) as unknown as BtcBalance;
  }

  async getAddress(): Promise<string> {
    return Rgb.getAddress(this.id());
  }

  async rotateVanillaAddress(): Promise<string> {
    return Rgb.rotateVanillaAddress(this.id());
  }

  async rotateColoredAddress(): Promise<string> {
    return Rgb.rotateColoredAddress(this.id());
  }

  async listUnspents(): Promise<Unspent[]> {
    const raw = await Rgb.listUnspents(this.id(), false, false);
    return raw.map((u) => ({
      utxo: { ...u.utxo, exists: (u.utxo as any).exists ?? true },
      rgbAllocations: u.rgbAllocations.map((a) => {
        const keys = Object.keys(a.assignment);
        const type = keys[0] as AssignmentType | undefined;
        return {
          assetId: a.assetId,
          assignment: {
            type: type ?? 'Any',
            amount:
              type && (a.assignment as any)[type]
                ? Number((a.assignment as any)[type])
                : undefined,
          },
          settled: a.settled,
        };
      }),
      pendingBlinded: (u as any).pendingBlinded ?? 0,
    }));
  }

  async createUtxosBegin(
    params: CreateUtxosBeginRequestModel
  ): Promise<string> {
    return Rgb.createUtxosBegin(
      this.id(),
      params.upTo ?? true,
      params.num ?? null,
      params.size ?? null,
      params.feeRate ?? 1,
      false
    );
  }

  async createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number> {
    return Rgb.createUtxosEnd(this.id(), params.signedPsbt, false);
  }

  async listAssets(): Promise<ListAssets> {
    return Rgb.listAssets(this.id(), []) as unknown as ListAssets;
  }

  async getAssetBalance(assetId: string): Promise<AssetBalance> {
    const b = await Rgb.getAssetBalance(this.id(), assetId);
    return {
      settled: b.settled ?? 0,
      future: b.future ?? 0,
      spendable: b.spendable ?? 0,
      offchainOutbound: (b as any).offchainOutbound ?? 0,
      offchainInbound: (b as any).offchainInbound ?? 0,
    };
  }

  async issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA> {
    return Rgb.issueAssetNia(
      this.id(),
      params.ticker,
      params.name,
      params.precision,
      params.amounts
    ) as unknown as AssetNIA;
  }

  async issueAssetIfa(params: IssueAssetIfaRequestModel): Promise<AssetIfa> {
    return Rgb.issueAssetIfa(
      this.id(),
      params.ticker,
      params.name,
      params.precision,
      params.amounts,
      params.inflationAmounts,
      params.rejectListUrl
    ) as unknown as AssetIfa;
  }

  async inflateBegin(params: InflateAssetIfaRequestModel): Promise<string> {
    const dryRun = (params as { dryRun?: boolean }).dryRun ?? false;
    const r = await Rgb.inflateBegin(
      this.id(),
      params.assetId,
      params.inflationAmounts,
      params.feeRate ?? 1,
      params.minConfirmations ?? 1,
      dryRun
    );
    return r.psbt;
  }

  async inflateEnd(params: InflateEndRequestModel): Promise<OperationResult> {
    return Rgb.inflateEnd(
      this.id(),
      params.signedPsbt
    ) as unknown as OperationResult;
  }

  async sendBegin(params: SendAssetBeginRequestModel): Promise<string> {
    if (!params.assetId)
      throw new ValidationError(
        'asset_id is required for send operation',
        'asset_id'
      );

    let witnessData: { amountSat: number; blinding?: number | null } | null =
      null;
    if (params.witnessData?.amountSat) {
      witnessData = {
        amountSat: params.witnessData.amountSat,
        blinding: params.witnessData.blinding
          ? Number(params.witnessData.blinding)
          : null,
      };
    }

    const invoiceData = await Rgb.decodeInvoice(params.invoice);
    const recipientId = invoiceData.recipientId;
    const assignment = invoiceData.assignment;
    const transportEndpoints = (invoiceData as any).transportEndpoints?.length
      ? (invoiceData as any).transportEndpoints
      : [this.transportEndpoint];

    const recipientMap: Record<string, any[]> = {
      [params.assetId]: [
        { recipientId, witnessData, assignment, transportEndpoints },
      ],
    };

    const expirationTimestamp =
      (params as { expirationTimestamp?: number | null }).expirationTimestamp ??
      null;
    const dryRun = (params as { dryRun?: boolean }).dryRun ?? false;
    const r = await Rgb.sendBegin(
      this.id(),
      recipientMap,
      params.donation ?? false,
      params.feeRate ?? 1,
      params.minConfirmations ?? 1,
      expirationTimestamp,
      dryRun
    );
    return r.psbt;
  }

  async sendBeginBatch(params: {
    recipientMap: RecipientMap;
    feeRate?: number;
    minConfirmations?: number;
    donation?: boolean;
    expirationTimestamp?: number | null;
    dryRun?: boolean;
  }): Promise<string> {
    if (!params.recipientMap || Object.keys(params.recipientMap).length === 0) {
      throw new ValidationError(
        'recipientMap must contain at least one asset id',
        'recipientMap'
      );
    }
    const r = await Rgb.sendBegin(
      this.id(),
      params.recipientMap as Record<string, any[]>,
      params.donation ?? true,
      params.feeRate ?? 1,
      params.minConfirmations ?? 1,
      params.expirationTimestamp ?? null,
      params.dryRun ?? false
    );
    return r.psbt;
  }

  async sendEnd(params: SendAssetEndRequestModel): Promise<SendResult> {
    return Rgb.sendEnd(
      this.id(),
      params.signedPsbt,
      params.skipSync ?? false
    ) as unknown as SendResult;
  }

  async sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string> {
    return Rgb.sendBtcBegin(
      this.id(),
      params.address,
      params.amount,
      params.feeRate ?? 1,
      params.skipSync ?? false
    );
  }

  async sendBtcEnd(params: SendBtcEndRequestModel): Promise<string> {
    return Rgb.sendBtcEnd(
      this.id(),
      params.signedPsbt,
      params.skipSync ?? false
    );
  }

  async blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    const assignment = { type: 'Fungible' as const, amount: params.amount };
    return Rgb.blindReceive(
      this.id(),
      params.assetId ?? null,
      assignment,
      receiveExpirationUnixSeconds(params),
      [this.transportEndpoint],
      params.minConfirmations ?? 1
    ) as unknown as InvoiceReceiveData;
  }

  async witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    const assignment = { type: 'Fungible' as const, amount: params.amount };
    return Rgb.witnessReceive(
      this.id(),
      params.assetId ?? null,
      assignment,
      receiveExpirationUnixSeconds(params),
      [this.transportEndpoint],
      params.minConfirmations ?? 1
    ) as unknown as InvoiceReceiveData;
  }

  async decodeRGBInvoice(params: { invoice: string }): Promise<InvoiceData> {
    return Rgb.decodeInvoice(params.invoice) as unknown as InvoiceData;
  }

  async listTransactions(): Promise<Transaction[]> {
    const raw = await Rgb.listTransactions(this.id(), false);
    return raw.map((tx) => ({
      transactionType: tx.transactionType,
      txid: tx.txid,
      received: tx.received,
      sent: tx.sent,
      fee: tx.fee,
      confirmationTime: tx.confirmationTime
        ? { height: 0, timestamp: tx.confirmationTime }
        : undefined,
    })) as Transaction[];
  }

  async listTransfers(assetId?: string): Promise<Transfer[]> {
    return Rgb.listTransfers(
      this.id(),
      assetId ?? null
    ) as unknown as Transfer[];
  }

  async failTransfers(params: FailTransfersRequest): Promise<boolean> {
    return Rgb.failTransfers(
      this.id(),
      params.batchTransferIdx ?? null,
      params.noAssetOnly ?? false,
      false
    );
  }

  refreshWallet(): void {
    Rgb.refresh(this.id(), null, [], false).catch(() => {});
  }

  syncWallet(): void {
    Rgb.sync(this.id()).catch(() => {});
  }

  async getFeeEstimation(params: {
    blocks: number;
  }): Promise<GetFeeEstimationResponse> {
    return Rgb.getFeeEstimation(
      this.id(),
      params.blocks
    ) as unknown as GetFeeEstimationResponse;
  }

  async createBackup(params: {
    backupPath: string;
    password: string;
  }): Promise<WalletBackupResponse> {
    await Rgb.backup(this.id(), params.backupPath, params.password);
    return {
      message: 'Backup created successfully',
      backupPath: params.backupPath,
    };
  }

  /**
   * Configures automatic VSS cloud backup for this wallet.
   * After calling this, the wallet will automatically upload a backup after state-changing operations
   * when autoBackup is enabled in the config.
   * @param config - VSS backup configuration
   */
  async configureVssBackup(config: VssBackupConfig): Promise<void> {
    await this.ensureInitialized();
    await Rgb.configureVssBackup(this.id(), {
      serverUrl: config.serverUrl,
      storeId: config.storeId,
      signingKeyHex: config.signingKey,
      encryptionEnabled: config.encryptionEnabled ?? true,
      autoBackup: config.autoBackup ?? false,
      backupMode: config.backupMode ?? 'Async',
    });
  }

  /**
   * Uploads a VSS cloud backup of the current wallet state.
   * @param config - VSS backup configuration
   * @returns Server-side version number after successful upload
   */
  async vssBackup(config: VssBackupConfig): Promise<number> {
    await this.ensureInitialized();
    return await Rgb.vssBackup(this.id(), {
      serverUrl: config.serverUrl,
      storeId: config.storeId,
      signingKeyHex: config.signingKey,
      encryptionEnabled: config.encryptionEnabled ?? true,
      autoBackup: config.autoBackup ?? false,
      backupMode: config.backupMode ?? 'Async',
    });
  }

  /**
   * Queries the VSS server for this wallet's backup status.
   * @param config - VSS backup configuration
   * @returns Backup info including whether a backup exists, server version, and if backup is required
   */
  async vssBackupInfo(config: VssBackupConfig): Promise<VssBackupInfo> {
    await this.ensureInitialized();
    return await Rgb.vssBackupInfo(this.id(), {
      serverUrl: config.serverUrl,
      storeId: config.storeId,
      signingKeyHex: config.signingKey,
      encryptionEnabled: config.encryptionEnabled ?? true,
      autoBackup: config.autoBackup ?? false,
      backupMode: config.backupMode ?? 'Async',
    });
  }

  /**
   * Disables automatic VSS backup for this wallet.
   * Manual backup via vssBackup() still works after calling this.
   */
  async disableVssAutoBackup(): Promise<void> {
    await this.ensureInitialized();
    await Rgb.disableVssAutoBackup(this.id());
  }
}
