/* eslint no-unused-vars: "off", "@typescript-eslint/no-unused-vars": "error" -- TypeScript signatures. */
import type {
  RgbProvider,
  RgbInfo,
  RgbAssetBalance,
  RgbTransferStatusResult,
  RgbBlindReceiveArgs,
  RgbBurnAssetArgs,
  RgbGetConsignmentArgs,
} from '@utexo/webrgb';
import { WebRgbError, walletCall } from './errors';
import { WebRgbBurnController, type WebRgbBurnOptions } from './burn';
import type { UTEXOWallet } from '../../wallet/utexo-wallet';

export const WEBRGB_READ_METHODS = [
  'enable',
  'getInfo',
  'getAddress',
  'blindReceive',
  'listAssets',
  'getAssetBalance',
  'listTransfers',
  'getTransferStatus',
  'decodeRgbInvoice',
] as const;
type SupportedProvider = Pick<
  RgbProvider,
  | (typeof WEBRGB_READ_METHODS)[number]
  | 'enabled'
  | 'burnAsset'
  | 'getConsignment'
>;

export interface WebRgbApproval {
  origin: string;
  method: 'enable' | 'blindReceive' | 'burnAsset' | 'getConsignment';
  params: Readonly<Record<string, unknown>>;
}
export interface WebRgbOptions {
  /** Taken from the approved transport session, never from request parameters. */
  origin: string;
  confirm: (request: WebRgbApproval) => Promise<boolean>;
  /** The host may set this ONLY after approving/restoring the transport session. */
  sessionApproved?: boolean;
  /** Recheck transport authorization after async prompts and before native calls. */
  assertAuthorized?: () => void;
  minConfirmations?: number;
  burn?: WebRgbBurnOptions;
}
type Wallet = Pick<
  UTEXOWallet,
  | 'getBfaCapabilities'
  | 'burn'
  | 'getConsignment'
  | 'listTransactionsByTxid'
  | 'getNetworkInfo'
  | 'getNetwork'
  | 'isDisposed'
  | 'getAddress'
  | 'blindReceive'
  | 'listAssets'
  | 'getAssetBalance'
  | 'listTransfers'
  | 'refreshWallet'
  | 'decodeRGBInvoice'
>;

function integer(
  value: unknown,
  name: string,
  min = 1,
  max = Number.MAX_SAFE_INTEGER
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new WebRgbError(
      'INVALID_PARAMS',
      `${name} must be an integer between ${min} and ${max}`
    );
  }
  return value;
}
function optionalAsset(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    !value.startsWith('rgb:') ||
    value.length > 256
  ) {
    throw new WebRgbError('INVALID_PARAMS', 'Invalid assetId');
  }
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WebRgbError('INVALID_PARAMS', 'Expected an object');
  }
  return value as Record<string, unknown>;
}

/**
 * WebRGB receiving/read API for an individual dApp session. No React Native or
 * WalletConnect runtime dependency. Burn is advertised only when the host
 * supplies a durable operation store and the native build/signer support it.
 */
export class WebRgbProvider implements SupportedProvider {
  private authorized: boolean;
  private revision = 0;
  private enabling?: Promise<void>;
  private readonly floor: number;
  private readonly burnController?: WebRgbBurnController;

  constructor(
    private readonly wallet: Wallet,
    private readonly options: WebRgbOptions
  ) {
    if (!/^https?:\/\/[^\s]+$/.test(options.origin)) {
      throw new WebRgbError('INVALID_PARAMS', 'A session origin is required');
    }
    this.authorized = options.sessionApproved === true;
    if (options.burn)
      this.burnController = new WebRgbBurnController(
        wallet,
        {
          origin: options.origin,
          enabled: () => {
            options.assertAuthorized?.();
            return this.enabled;
          },
          confirm: (method, params) =>
            options.confirm({ origin: options.origin, method, params }),
        },
        options.burn
      );
    this.floor = Math.max(
      3,
      integer(options.minConfirmations ?? 3, 'minConfirmations', 0, 255)
    );
  }

  get enabled(): boolean {
    return this.authorized && !this.wallet.isDisposed();
  }

  revoke(): void {
    this.authorized = false;
    this.burnController?.revoke();
    this.revision += 1;
  }

  async enable(): Promise<void> {
    if (this.enabled) return;
    if (this.enabling) return this.enabling;
    const revision = this.revision;
    this.enabling = (async () => {
      if (
        !(await this.options.confirm({
          origin: this.options.origin,
          method: 'enable',
          params: {},
        }))
      ) {
        throw new WebRgbError('USER_REJECTED', 'Connection declined');
      }
      if (revision !== this.revision || this.wallet.isDisposed()) {
        throw new WebRgbError('NOT_ENABLED', 'Session is no longer active');
      }
      this.authorized = true;
    })();
    try {
      await this.enabling;
    } finally {
      this.enabling = undefined;
    }
  }

  private requireEnabled(): void {
    this.options.assertAuthorized?.();
    if (!this.enabled)
      throw new WebRgbError('NOT_ENABLED', 'Connect the wallet first');
  }

  async burnAsset(args: RgbBurnAssetArgs) {
    this.requireEnabled();
    if (!this.burnController)
      throw new WebRgbError(
        'METHOD_NOT_SUPPORTED',
        'Burn extension is not configured'
      );
    return walletCall(() => this.burnController!.burnAsset(args));
  }
  async getConsignment(args: RgbGetConsignmentArgs) {
    this.requireEnabled();
    if (!this.burnController)
      throw new WebRgbError(
        'METHOD_NOT_SUPPORTED',
        'Burn extension is not configured'
      );
    return walletCall(() => this.burnController!.getConsignment(args));
  }

  async getInfo(): Promise<RgbInfo> {
    this.requireEnabled();
    return {
      ready: true,
      network: this.wallet.getNetwork(),
      protocol: 'RGB_LN',
      methods: [
        ...WEBRGB_READ_METHODS,
        ...((await this.burnController?.methods()) ?? []),
      ],
    };
  }
  async getAddress() {
    this.requireEnabled();
    return { address: await walletCall(() => this.wallet.getAddress()) };
  }
  async blindReceive(args: RgbBlindReceiveArgs = {}) {
    this.requireEnabled();
    const raw = object(args);
    const params = {
      assetId: optionalAsset(raw.assetId),
      amount:
        raw.amount === undefined ? undefined : integer(raw.amount, 'amount'),
      durationSeconds: integer(
        raw.durationSeconds ?? 3600,
        'durationSeconds',
        1,
        2_592_000
      ),
      minConfirmations: Math.max(
        this.floor,
        integer(raw.minConfirmations ?? this.floor, 'minConfirmations', 0, 255)
      ),
    };
    const revision = this.revision;
    if (
      !(await this.options.confirm({
        origin: this.options.origin,
        method: 'blindReceive',
        params: Object.freeze({ ...params }),
      }))
    ) {
      throw new WebRgbError('USER_REJECTED', 'Invoice request declined');
    }
    this.requireEnabled();
    if (revision !== this.revision)
      throw new WebRgbError('NOT_ENABLED', 'Session changed');
    const result = await walletCall(() => this.wallet.blindReceive(params));
    return {
      invoice: result.invoice,
      recipientId: result.recipientId,
      expirationTimestamp: result.expirationTimestamp ?? undefined,
      minConfirmations: params.minConfirmations,
    };
  }
  async listAssets() {
    this.requireEnabled();
    const assets = await walletCall(() => this.wallet.listAssets());
    return Object.entries(assets).flatMap(([schema, group]) =>
      Array.isArray(group)
        ? group.map((asset) => ({
            id: asset.assetId,
            schema,
            ticker: 'ticker' in asset ? asset.ticker : undefined,
            name: asset.name,
            precision: asset.precision,
          }))
        : []
    );
  }
  async getAssetBalance(assetId: string): Promise<RgbAssetBalance> {
    this.requireEnabled();
    if (!optionalAsset(assetId))
      throw new WebRgbError('INVALID_PARAMS', 'assetId is required');
    const raw = await walletCall(() => this.wallet.getAssetBalance(assetId));
    if (!Number.isSafeInteger(raw.spendable))
      throw new WebRgbError(
        'INTERNAL_ERROR',
        'Asset balance exceeds the supported exact integer range'
      );
    return { assetId, balance: raw.spendable!, raw };
  }
  async listTransfers(assetId?: string) {
    this.requireEnabled();
    optionalAsset(assetId);
    const transfers = await walletCall(() =>
      this.wallet.listTransfers(assetId)
    );
    return transfers.map((transfer) => {
      return {
        assetId,
        transferId: transfer.idx,
        status: transfer.status,
        kind: transfer.kind,
        amount: transfer.amount,
        amountBaseUnits: transfer.amountBaseUnits,
        recipientId: transfer.recipientId,
        txid: transfer.txid,
      };
    });
  }
  async getTransferStatus(
    transferId: string | number,
    assetId?: string
  ): Promise<RgbTransferStatusResult> {
    this.requireEnabled();
    if (
      (typeof transferId !== 'string' && typeof transferId !== 'number') ||
      String(transferId).length === 0
    ) {
      throw new WebRgbError('INVALID_PARAMS', 'transferId is required');
    }
    optionalAsset(assetId);
    const burn = this.burnController
      ? await walletCall(() =>
          this.burnController!.getTransferStatus(transferId, assetId)
        )
      : null;
    if (burn) return burn;
    await walletCall(() => this.wallet.refreshWallet());
    const transfer = (await this.listTransfers(assetId)).find(
      (item) =>
        String(item.transferId) === String(transferId) ||
        item.txid === transferId ||
        item.recipientId === transferId
    );
    return {
      found: Boolean(transfer),
      status: transfer?.status ?? null,
      transfer: transfer ?? null,
    };
  }
  async decodeRgbInvoice(args: { invoice: string } | string) {
    this.requireEnabled();
    const invoice = typeof args === 'string' ? args : object(args).invoice;
    if (
      typeof invoice !== 'string' ||
      !invoice.startsWith('rgb:') ||
      invoice.length > 16_384
    ) {
      throw new WebRgbError('INVALID_PARAMS', 'Invalid RGB invoice');
    }
    const raw = await walletCall(() =>
      this.wallet.decodeRGBInvoice({ invoice })
    );
    const amount =
      raw.assignment.type === 'Fungible' && raw.assignment.amount
        ? integer(raw.assignment.amount, 'invoice amount')
        : null;
    return {
      assetId: raw.assetId,
      amount,
      recipientId: raw.recipientId,
      expirationTimestamp: raw.expirationTimestamp ?? undefined,
      network: raw.network,
      transportEndpoints: raw.transportEndpoints,
    };
  }
}
