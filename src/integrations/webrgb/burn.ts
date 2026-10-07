/* eslint no-unused-vars: "off", "@typescript-eslint/no-unused-vars": "error" -- TypeScript signatures. */
/**
 * Optional WebRGB burn/proof extension. Receiving and read methods work without it.
 * Use an unlocked BFA wallet with ethRpcUrl and a burn-capable signer
 * (PasswordRLNSigner; NativeExternalRLNSigner does not support burn).
 *
 * Setup: share one BurnOperations service and durable BurnOperationStore per
 * wallet across sessions. The store implements readAll() and write(record),
 * which resolves only after an upsert by record.id is durably saved.
 *
 * import { BurnOperations } from '@utexo/rgb-sdk-rn';
 * import { WebRgbProvider } from '@utexo/rgb-sdk-rn/webrgb';
 *
 * const operations = new BurnOperations(wallet, store);
 * const provider = new WebRgbProvider(wallet, {
 *   ...approvedSessionOptions, // origin, authorization checks, confirmation UI
 *   burn: { operations },
 * });
 * await provider.enable();
 * const burn = await provider.burnAsset({
 *   network: wallet.getNetwork(),
 *   assetId,
 *   amount: '100', // decimal base units; never convert u64 amounts to JS numbers
 *   burnRecipient: { chainId: 'eip155:42161', address: evmAddress },
 * });
 * const proof = await provider.getConsignment({ assetId, txid: burn.txid });
 * provider.revoke(); // on session expiry/disconnect
 *
 * Flow: check getInfo().methods, validate the asset/network/payout parameters,
 * then confirm the asset, amount, payout chain/address, BTC fee, confirmations,
 * and proof sharing. The host serializes approval dialogs. The operation service
 * serializes burns, persists prepared -> pending before invoking native burn,
 * and saves the result as complete. Failure before invocation cancels the record.
 * The EVM address is encoded as 12 zero bytes followed by its 20 address bytes;
 * the requested payout chain is confirmed and saved in operation metadata.
 *
 * Proof export returns Base64, byte length, and a Keccak-256 digest (16 MiB limit).
 * Local paths stay inside the wallet; another origin's proof needs fresh consent.
 *
 * Recovery: never retry a pending burn. retryPersistence() saves a known result
 * without reburning. After restart, reconcile() requires an independent verifier
 * of the saved proof's asset, amount, recipient, and native result. Current RLN
 * bindings do not provide that decoder; keep ambiguous outcomes pending.
 */
import { base64 } from '@scure/base';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type {
  RgbBurnAssetArgs,
  RgbBurnAssetResult,
  RgbGetConsignmentArgs,
  RgbGetConsignmentResult,
  RgbTransferStatusResult,
} from '@utexo/webrgb';
import { encodeEvmBurnRecipient } from './recipient';
import {
  validateBurnParams,
  validateConsignmentLookup,
} from '../../wallet/operations/validation';
import type { BurnOperations } from '../../wallet/operations/burn';
import { WebRgbError } from './errors';
import type { UTEXOWallet } from '../../wallet/utexo-wallet';

const MAX_CONSIGNMENT_BYTES = 16 * 1024 * 1024;
export interface WebRgbBurnOptions {
  operations: BurnOperations;
}
type Wallet = Pick<
  UTEXOWallet,
  | 'getNetwork'
  | 'getBfaCapabilities'
  | 'burn'
  | 'getConsignment'
  | 'listAssets'
  | 'listTransfers'
  | 'listTransactionsByTxid'
  | 'getNetworkInfo'
  | 'refreshWallet'
>;
interface Host {
  origin: string;
  enabled(): boolean;
  confirm(
    method: 'burnAsset' | 'getConsignment',
    params: Record<string, unknown>
  ): Promise<boolean>;
}
export class WebRgbBurnController {
  private exports = new Set<string>();
  private proof?: { key: string; bytes: Uint8Array; digest: `0x${string}` };
  revoke() {
    this.exports.clear();
    this.proof = undefined;
  }
  constructor(
    private wallet: Wallet,
    private host: Host,
    private options: WebRgbBurnOptions
  ) {}
  private requireEnabled() {
    if (!this.host.enabled())
      throw new WebRgbError('NOT_ENABLED', 'Session is no longer active');
  }
  async methods(): Promise<string[]> {
    const caps = await this.wallet.getBfaCapabilities();
    return [
      ...(caps.burn && caps.consignment ? ['burnAsset'] : []),
      ...(caps.consignment ? ['getConsignment'] : []),
    ];
  }
  async burnAsset(args: RgbBurnAssetArgs): Promise<RgbBurnAssetResult> {
    this.requireEnabled();
    if (!(await this.methods()).includes('burnAsset'))
      throw new WebRgbError(
        'METHOD_NOT_SUPPORTED',
        'Native burn is unavailable'
      );
    if (
      !args ||
      args.network !== this.wallet.getNetwork() ||
      !args.burnRecipient ||
      typeof args.burnRecipient.address !== 'string' ||
      typeof args.burnRecipient.chainId !== 'string' ||
      !/^eip155:[1-9][0-9]*$/.test(args.burnRecipient.chainId)
    )
      throw new WebRgbError(
        'INVALID_PARAMS',
        'Invalid RGB network or payout chain'
      );
    if (
      args.minConfirmations !== undefined &&
      (!Number.isInteger(args.minConfirmations) ||
        args.minConfirmations < 1 ||
        args.minConfirmations > 255)
    )
      throw new WebRgbError('INVALID_PARAMS', 'Invalid confirmation count');
    let recipient: string;
    const request: RgbBurnAssetArgs = {
      network: args.network,
      assetId: args.assetId,
      amount: args.amount,
      burnRecipient: {
        chainId: args.burnRecipient.chainId,
        address: args.burnRecipient.address.toLowerCase() as `0x${string}`,
      },
      feeRate: args.feeRate ?? 2,
      minConfirmations: Math.max(3, args.minConfirmations ?? 3),
    };
    try {
      recipient = encodeEvmBurnRecipient(request.burnRecipient.address);
      validateBurnParams({
        ...request,
        burnRecipient: recipient,
        feeRate: request.feeRate!,
        minConfirmations: request.minConfirmations!,
      });
    } catch (error) {
      throw new WebRgbError('INVALID_PARAMS', (error as Error).message);
    }
    await this.options.operations.retryPersistence();
    const records = await this.options.operations.records();
    if (records.some((record) => record.state === 'pending'))
      throw new WebRgbError(
        'INTERNAL_ERROR',
        'A previous burn has an unresolved outcome. Inspect wallet history before another burn.'
      );
    if (
      !(await this.wallet.listAssets()).bfa.some(
        (asset) => asset.assetId === request.assetId
      )
    )
      throw new WebRgbError(
        'ASSET_NOT_FOUND',
        'Select a BFA asset held by this wallet'
      );
    if (
      !(await this.host.confirm('burnAsset', {
        ...request,
        getConsignment: true,
      }))
    )
      throw new WebRgbError('USER_REJECTED', 'Burn declined');
    this.requireEnabled();
    const record = await this.options.operations.execute(
      {
        assetId: request.assetId,
        amount: request.amount,
        burnRecipient: recipient,
        feeRate: request.feeRate!,
        minConfirmations: request.minConfirmations!,
      },
      {
        origin: this.host.origin,
        network: request.network,
        payout: request.burnRecipient,
      },
      () => this.requireEnabled()
    );
    return {
      transferId: record.result!.txid,
      txid: record.result!.txid,
      assetId: request.assetId,
      amount: request.amount,
      burnRecipient: request.burnRecipient,
      status: 'WaitingConfirmations',
      minConfirmations: request.minConfirmations!,
    };
  }
  async getTransferStatus(
    id: string | number,
    assetId?: string
  ): Promise<RgbTransferStatusResult | null> {
    this.requireEnabled();
    await this.options.operations.retryPersistence();
    const record = (await this.options.operations.records()).find(
      (item) =>
        item.metadata.origin === this.host.origin &&
        item.result?.txid === id &&
        (!assetId || item.params.assetId === assetId)
    );
    if (!record?.result) return null;
    await this.wallet.refreshWallet();
    const [transfers, transactions, network] = await Promise.all([
      this.wallet.listTransfers(record.params.assetId),
      this.wallet.listTransactionsByTxid(record.result.txid),
      this.wallet.getNetworkInfo(),
    ]);
    const transfer = transfers.find(
      (item) => item.txid === record.result!.txid && item.kind === 'Burn'
    );
    const blockHeight =
      transactions.find((item) => item.txid === record.result!.txid)
        ?.confirmationTime?.height ?? null;
    const confirmations =
      blockHeight === null
        ? 0
        : Math.max(0, (network.blockHeight ?? 0) - blockHeight + 1);
    return {
      found: true,
      status: transfer?.status ?? 'WaitingConfirmations',
      transfer: {
        // Select public fields explicitly: older stored results may contain requestId.
        network: record.metadata.network,
        assetId: record.params.assetId,
        amount: Number.isSafeInteger(Number(record.params.amount))
          ? Number(record.params.amount)
          : undefined,
        burnRecipient: record.metadata.payout,
        txid: record.result.txid,
        batchTransferIdx: record.result.batchTransferIdx,
        status: transfer?.status ?? 'WaitingConfirmations',
        feeRate: record.params.feeRate,
        minConfirmations: record.params.minConfirmations,
        transferId: transfer?.idx,
        amountBaseUnits: record.params.amount,
        blockHeight,
        confirmations,
      },
    };
  }
  /** Full proof for transport-independent providers; adapters own wire chunking. */
  async getConsignment(
    args: RgbGetConsignmentArgs
  ): Promise<RgbGetConsignmentResult> {
    const { bytes, digest } = await this.prepareConsignment(args);
    this.requireEnabled();
    return {
      assetId: args.assetId,
      txid: args.txid,
      encoding: 'base64' as const,
      data: base64.encode(bytes),
      byteLength: bytes.length,
      digest: { algorithm: 'keccak256' as const, value: digest },
    };
  }

  private async prepareConsignment(args: RgbGetConsignmentArgs) {
    this.requireEnabled();
    if (!(await this.methods()).includes('getConsignment'))
      throw new WebRgbError(
        'METHOD_NOT_SUPPORTED',
        'Native consignment access is unavailable'
      );
    try {
      validateConsignmentLookup(args?.assetId, args?.txid);
    } catch {
      throw new WebRgbError('INVALID_PARAMS', 'Invalid assetId or txid');
    }
    const key = `${args.assetId}:${args.txid}`;
    const records = await this.options.operations.records();
    const approved = records.some(
      (item) =>
        item.metadata.origin === this.host.origin &&
        item.state === 'complete' &&
        item.params.assetId === args.assetId &&
        item.result?.txid === args.txid
    );
    if (!approved && !this.exports.has(key)) {
      if (
        !(await this.host.confirm('getConsignment', {
          assetId: args.assetId,
          txid: args.txid,
        }))
      )
        throw new WebRgbError('USER_REJECTED', 'Proof export declined');
      this.requireEnabled();
      this.exports.add(key);
    }
    const transfers = await this.wallet.listTransfers(args.assetId);
    if (
      !transfers.some((item) => item.kind === 'Burn' && item.txid === args.txid)
    )
      throw new WebRgbError(
        'INVALID_PARAMS',
        'Only a saved burn consignment can be exported'
      );
    if (this.proof?.key !== key) {
      const encoded = await this.wallet.getConsignment(args.assetId, args.txid);
      if (encoded.length > Math.ceil(MAX_CONSIGNMENT_BYTES / 3) * 4)
        throw new WebRgbError(
          'INTERNAL_ERROR',
          'Consignment exceeds the 16 MiB wallet limit'
        );
      const bytes = base64.decode(encoded);
      if (bytes.length > MAX_CONSIGNMENT_BYTES)
        throw new WebRgbError(
          'INTERNAL_ERROR',
          'Consignment exceeds the 16 MiB wallet limit'
        );
      this.proof = { key, bytes, digest: `0x${bytesToHex(keccak_256(bytes))}` };
    }
    this.requireEnabled();
    if (!this.proof.bytes.length)
      throw new WebRgbError('INTERNAL_ERROR', 'Saved consignment is empty');
    return this.proof;
  }
}
