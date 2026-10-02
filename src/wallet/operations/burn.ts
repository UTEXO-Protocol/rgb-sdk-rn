/* eslint no-unused-vars: "off", "@typescript-eslint/no-unused-vars": "error" -- TypeScript signatures. */
import { bytesToHex, randomBytes } from '@noble/hashes/utils.js';
import type { BurnParams, BurnResult } from '../types';
import { validateBurnParams } from './validation';

/** Wallet-owned context, retained across transport sessions and app restarts. */
export interface BurnOperationMetadata {
  origin: string;
  network: string;
  payout: { chainId: string; address: string };
}
export interface BurnOperationRecord {
  version: 2;
  id: string;
  params: BurnParams;
  metadata: BurnOperationMetadata;
  /** Journal states, never RGB transfer statuses. */
  state: 'prepared' | 'pending' | 'complete' | 'cancelled';
  result?: BurnResult;
}
export interface BurnOperationStore {
  /** May return v1 records; normalizeBurnRecord preserves their internal IDs. */
  readAll(): Promise<unknown[]>;
  /** Resolve only after the record is durably saved. Upsert by id. */
  write(record: BurnOperationRecord): Promise<void>;
}

export function normalizeBurnRecord(value: unknown): BurnOperationRecord {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid burn journal record');
  const raw = value as Record<string, any>;
  let record: BurnOperationRecord;
  if (raw.version === 2) {
    record = raw as BurnOperationRecord;
  } else {
    const request = raw.request;
    if (!request || !/^0x[0-9a-fA-F]{40}$/.test(request.burnRecipient?.address))
      throw new Error('Invalid legacy burn journal record');
    record = {
      version: 2,
      id: request.requestId,
      params: {
        assetId: request.assetId,
        amount: request.amount,
        burnRecipient: request.burnRecipient.address
          .slice(2)
          .toLowerCase()
          .padStart(64, '0'),
        feeRate: request.feeRate ?? 2,
        minConfirmations: request.minConfirmations ?? 3,
      },
      metadata: {
        origin: raw.origin,
        network: request.network,
        payout: request.burnRecipient,
      },
      state: raw.state,
      result: raw.result && {
        txid: raw.result.txid,
        batchTransferIdx: raw.result.batchTransferIdx,
      },
    };
  }
  validateBurnParams(record.params);
  if (
    !record.id ||
    typeof record.id !== 'string' ||
    !['prepared', 'pending', 'complete', 'cancelled'].includes(record.state) ||
    typeof record.metadata?.origin !== 'string' ||
    typeof record.metadata.network !== 'string' ||
    typeof record.metadata.payout?.chainId !== 'string' ||
    !/^0x[0-9a-fA-F]{40}$/.test(record.metadata.payout.address)
  )
    throw new Error('Invalid burn journal record');
  if (record.state === 'complete') validateResult(record.result);
  return record;
}
function validateResult(
  result: BurnResult | undefined
): asserts result is BurnResult {
  if (
    !result ||
    !/^[a-fA-F0-9]{64}$/.test(result.txid) ||
    !Number.isSafeInteger(result.batchTransferIdx) ||
    result.batchTransferIdx < 0
  )
    throw new Error('Invalid native burn result');
}

interface BurnWallet {
  burn(params: BurnParams): Promise<BurnResult>;
  listTransfers(
    assetId: string
  ): Promise<{ txid?: string | null; kind: string }[]>;
  getConsignment(assetId: string, txid: string): Promise<string>;
}
interface Runtime {
  queue: Promise<unknown>;
  unsaved: Map<string, BurnOperationRecord>;
}
// One queue per native wallet object, even if sessions wrap the store differently.
const runtimes = new WeakMap<BurnWallet, Runtime>();

export class BurnOperations {
  private readonly runtime: Runtime;
  constructor(
    private readonly wallet: BurnWallet,
    private readonly store: BurnOperationStore
  ) {
    let runtime = runtimes.get(wallet);
    if (!runtime) {
      runtime = { queue: Promise.resolve(), unsaved: new Map() };
      runtimes.set(wallet, runtime);
    }
    this.runtime = runtime;
  }
  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.runtime.queue.catch(() => undefined).then(action);
    this.runtime.queue = result.catch(() => undefined);
    return result;
  }
  async records(): Promise<BurnOperationRecord[]> {
    return (await this.store.readAll()).map(normalizeBurnRecord);
  }
  private async save(record: BurnOperationRecord): Promise<void> {
    // Retain a known result even if storage fails; saving it again never burns.
    this.runtime.unsaved.set(record.id, record);
    await this.store.write(record);
    this.runtime.unsaved.delete(record.id);
  }
  private async flush(): Promise<void> {
    for (const record of this.runtime.unsaved.values()) await this.save(record);
    // No native invocation can have followed a durable prepared record.
    for (const record of await this.records()) {
      if (record.state === 'prepared')
        await this.save({ ...record, state: 'cancelled' });
    }
  }
  retryPersistence(): Promise<void> {
    return this.exclusive(() => this.flush());
  }
  execute(
    params: BurnParams,
    metadata: BurnOperationMetadata,
    assertAuthorized: () => void
  ): Promise<BurnOperationRecord> {
    // Copy before entering the queue: caller mutations cannot change approved data.
    const request = { ...params };
    const context = { ...metadata, payout: { ...metadata.payout } };
    return this.exclusive(async () => {
      validateBurnParams(request);
      await this.flush();
      if ((await this.records()).some((record) => record.state === 'pending'))
        throw new Error(
          'A previous burn has an unresolved outcome. Reconcile wallet history before another burn.'
        );
      assertAuthorized();
      let record: BurnOperationRecord = {
        version: 2,
        id: bytesToHex(randomBytes(16)),
        params: request,
        metadata: context,
        state: 'prepared',
      };
      let invoked = false;
      try {
        await this.save(record);
        assertAuthorized();
        record = { ...record, state: 'pending' };
        await this.save(record);
        assertAuthorized();
        invoked = true;
        const result = await this.wallet.burn(request);
        validateResult(result);
        record = { ...record, state: 'complete', result: { ...result } };
        await this.save(record);
        return record;
      } catch (error) {
        if (!invoked) {
          // Even a write failure is safe to cancel while native was never invoked.
          await this.save({ ...record, state: 'cancelled' }).catch(
            () => undefined
          );
        }
        throw error;
      }
    });
  }
  /**
   * Wallet-only recovery after a restart with an ambiguous native outcome.
   * The verifier must independently check asset, amount and recipient in the
   * saved proof, and the native result. A matching txid alone is insufficient.
   * Current RLN bindings do not expose this proof decoder; hosts must supply one.
   */
  reconcile(
    id: string,
    result: BurnResult,
    verify: (
      record: BurnOperationRecord,
      result: BurnResult,
      consignment: string
    ) => Promise<boolean>
  ): Promise<void> {
    return this.exclusive(async () => {
      await this.flush();
      const record = (await this.records()).find((item) => item.id === id);
      if (!record || record.state !== 'pending')
        throw new Error('No unresolved burn with this ID');
      validateResult(result);
      const transfers = await this.wallet.listTransfers(record.params.assetId);
      if (
        !transfers.some(
          (item) => item.kind === 'Burn' && item.txid === result.txid
        )
      )
        throw new Error('The transaction is not a burn of this asset');
      const proof = await this.wallet.getConsignment(
        record.params.assetId,
        result.txid
      );
      if (!proof || !(await verify(record, result, proof)))
        throw new Error('Burn proof does not match the saved operation');
      await this.save({ ...record, state: 'complete', result: { ...result } });
    });
  }
}
