import { AssetSchema } from '@utexo/rgb-sdk-core';
import type {
  AssetNIA,
  AssetIfa,
  Transaction,
  TransferStatus,
  TransactionType,
  BitcoinNetwork,
} from '@utexo/rgb-sdk-core';
import type {
  NativeAsset,
  NativeAssignment,
  NativeBalance,
  NativeInvoice,
  NativeOperation,
  NativeReceive,
  NativeTransaction,
  NativeTransfer,
  NativeUnspent,
} from '../../binding/NativeRgbLib';
import type { ListAssets } from '../types';
import type {
  WalletAssignment,
  WalletInvoiceData,
  WalletTransfer,
  WalletUnspent,
} from '../wallet-api';
import { WalletBackendError } from '../wallet-errors';
import { safeAmount, safeNumber, u64 } from './amounts';

export function known<T extends string>(
  value: string,
  values: readonly T[],
  field: string
): T {
  if (!values.includes(value as T)) {
    throw new WalletBackendError(
      'INVALID_NATIVE_RESPONSE',
      `Unknown native ${field}`,
      undefined,
      'RGB_L1'
    );
  }
  return value as T;
}
export function balance(value: NativeBalance) {
  return {
    settled: safeAmount(value.settled, 'settled'),
    future: safeAmount(value.future, 'future'),
    spendable: safeAmount(value.spendable, 'spendable'),
  };
}
export function assignment(value: NativeAssignment): WalletAssignment {
  const type = known(
    value.type,
    ['Fungible', 'NonFungible', 'InflationRight', 'MintRight', 'Any'] as const,
    'assignment'
  );
  if (type === 'Fungible' || type === 'InflationRight') {
    if (value.amount === null)
      throw new WalletBackendError(
        'INVALID_NATIVE_RESPONSE',
        'Missing assignment amount',
        undefined,
        'RGB_L1'
      );
    const amountBaseUnits = u64(value.amount, 'assignment');
    return {
      type,
      amountBaseUnits,
      ...(BigInt(amountBaseUnits) <= BigInt(Number.MAX_SAFE_INTEGER) && {
        amount: Number(amountBaseUnits),
      }),
    };
  }
  if (value.amount !== null)
    throw new WalletBackendError(
      'INVALID_NATIVE_RESPONSE',
      'Unexpected assignment amount',
      undefined,
      'RGB_L1'
    );
  return { type };
}
export function transferStatus(value: string): TransferStatus {
  return known(
    value,
    [
      'Initiated',
      'WaitingCounterparty',
      'WaitingSafeHeight',
      'WaitingBroadcast',
      'WaitingConfirmations',
      'Settled',
      'Failed',
    ] as const,
    'transfer status'
  );
}
export function transfer(value: NativeTransfer): WalletTransfer {
  const assignments = value.assignments.map(assignment);
  const requestedAssignment = value.requestedAssignment
    ? assignment(value.requestedAssignment)
    : undefined;
  const amounts = assignments
    .filter((a) => a.type === 'Fungible')
    .map((a) => BigInt(a.amountBaseUnits!));
  const total = amounts.length
    ? amounts.reduce((sum, amount) => sum + amount, 0n)
    : requestedAssignment?.type === 'Fungible'
      ? BigInt(requestedAssignment.amountBaseUnits!)
      : undefined;
  return {
    idx: value.idx,
    batchTransferIdx: value.batchTransferIdx,
    createdAt: safeNumber(value.createdAt, 'createdAt'),
    updatedAt: safeNumber(value.updatedAt, 'updatedAt'),
    status: transferStatus(value.status),
    kind: known(
      value.kind,
      [
        'Issuance',
        'ReceiveBlind',
        'ReceiveWitness',
        'Send',
        'Inflation',
        'Burn',
        'Mint',
      ] as const,
      'transfer kind'
    ),
    requestedAssignment,
    assignments,
    ...(total !== undefined && {
      amountBaseUnits: total.toString(),
      ...(total <= BigInt(Number.MAX_SAFE_INTEGER) && {
        amount: Number(total),
      }),
    }),
    txid: value.txid ?? undefined,
    recipientId: value.recipientId ?? undefined,
    receiveUtxo: value.receiveUtxo ?? undefined,
    changeUtxo: value.changeUtxo ?? undefined,
    expiration:
      value.expiration === null
        ? undefined
        : safeAmount(value.expiration, 'expiration'),
    transportEndpoints: value.transportEndpoints,
    invoiceString: value.invoiceString ?? undefined,
    consignmentPath: value.consignmentPath ?? undefined,
  };
}
export function transaction(value: NativeTransaction): Transaction {
  return {
    txid: value.txid,
    transactionType: known<TransactionType>(
      value.transactionType,
      ['RgbSend', 'Drain', 'CreateUtxos', 'SendBtc', 'Incoming'],
      'transaction type'
    ),
    received: safeAmount(value.received, 'received'),
    sent: safeAmount(value.sent, 'sent'),
    fee: safeAmount(value.fee, 'fee'),
    confirmationTime: value.confirmationTime
      ? {
          height: value.confirmationTime.height,
          timestamp: safeAmount(
            value.confirmationTime.timestamp,
            'confirmation timestamp'
          ),
        }
      : undefined,
  };
}
export function unspent(value: NativeUnspent): WalletUnspent {
  return {
    utxo: {
      ...value.utxo,
      btcAmount: safeAmount(value.utxo.btcAmount, 'btcAmount'),
    },
    pendingBlinded: value.pendingBlinded,
    rgbAllocations: value.rgbAllocations.map((a) => ({
      assetId: a.assetId ?? undefined,
      assignment: assignment(a.assignment),
      settled: a.settled,
    })),
  };
}
function baseAsset(value: NativeAsset) {
  return {
    assetId: value.assetId,
    name: value.name,
    details: value.details ?? undefined,
    precision: value.precision,
    timestamp: safeNumber(value.timestamp, 'timestamp'),
    addedAt: safeNumber(value.addedAt, 'addedAt'),
    balance: balance(value.balance),
    media: value.media ?? undefined,
  };
}
function required<T>(value: T | null, name: string): T {
  if (value === null)
    throw new WalletBackendError(
      'INVALID_NATIVE_RESPONSE',
      `Missing ${name}`,
      undefined,
      'RGB_L1'
    );
  return value;
}
export function nia(value: NativeAsset): AssetNIA {
  known(value.schema, ['Nia'], 'asset schema');
  return {
    ...baseAsset(value),
    ticker: required(value.ticker, 'ticker'),
    issuedSupply: safeAmount(
      required(value.issuedSupply, 'issuedSupply'),
      'issuedSupply'
    ),
  };
}
export function ifa(value: NativeAsset): AssetIfa {
  known(value.schema, ['Ifa'], 'asset schema');
  return {
    ...baseAsset(value),
    ticker: required(value.ticker, 'ticker'),
    initialSupply: safeAmount(
      required(value.initialSupply, 'initialSupply'),
      'initialSupply'
    ),
    maxSupply: safeAmount(required(value.maxSupply, 'maxSupply'), 'maxSupply'),
    knownCirculatingSupply: safeAmount(
      required(value.knownCirculatingSupply, 'knownCirculatingSupply'),
      'knownCirculatingSupply'
    ),
    rejectListUrl: value.rejectListUrl ?? undefined,
  };
}
export function assets(values: NativeAsset[]): ListAssets {
  const result: ListAssets = { nia: [], ifa: [], cfa: [], uda: [], bfa: [] };
  for (const value of values) {
    const schema = known(
      value.schema,
      ['Nia', 'Ifa', 'Cfa', 'Uda', 'Bfa'] as const,
      'asset schema'
    );
    const base = baseAsset(value);
    switch (schema) {
      case 'Nia':
        result.nia.push(nia(value));
        break;
      case 'Ifa':
        result.ifa.push(ifa(value));
        break;
      case 'Cfa':
        result.cfa.push({
          ...base,
          issuedSupply: safeAmount(
            required(value.issuedSupply, 'issuedSupply'),
            'issuedSupply'
          ),
        });
        break;
      case 'Bfa':
        result.bfa.push({
          ...base,
          ticker: required(value.ticker, 'ticker'),
          initialSupply: safeAmount(
            required(value.initialSupply, 'initialSupply'),
            'initialSupply'
          ),
          rejectListUrl: value.rejectListUrl ?? undefined,
        });
        break;
      case 'Uda':
        result.uda.push({
          ...base,
          ticker: required(value.ticker, 'ticker'),
          token: value.token
            ? {
                ...value.token,
                ticker: value.token.ticker ?? undefined,
                name: value.token.name ?? undefined,
                details: value.token.details ?? undefined,
                media: value.token.media ?? undefined,
              }
            : undefined,
        });
        break;
    }
  }
  return result;
}
/** Both bridges name a failed transfer `RGB_LIB_<Variant>`, as for rejections. */
export function refreshFailure(value: { name: string; message: string }) {
  if (
    typeof value?.name !== 'string' ||
    !/^RGB_LIB_[A-Z][A-Za-z0-9]*$/.test(value.name) ||
    typeof value.message !== 'string'
  ) {
    throw new WalletBackendError(
      'INVALID_NATIVE_RESPONSE',
      'Invalid refresh failure',
      undefined,
      'RGB_L1'
    );
  }
  return { name: value.name, message: value.message };
}
/** Public result of a broadcast operation; the native entropy stays internal. */
export function operation(value: NativeOperation) {
  if (
    typeof value?.txid !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.txid) ||
    !Number.isSafeInteger(value.batchTransferIdx) ||
    value.batchTransferIdx < 0
  ) {
    throw new WalletBackendError(
      'INVALID_NATIVE_RESPONSE',
      'Invalid operation result',
      undefined,
      'RGB_L1'
    );
  }
  return { txid: value.txid, batchTransferIdx: value.batchTransferIdx };
}
export function receive(value: NativeReceive) {
  return {
    ...value,
    expirationTimestamp: safeAmount(
      value.expirationTimestamp,
      'expirationTimestamp'
    ),
  };
}
export function invoice(
  value: NativeInvoice,
  encoded: string
): WalletInvoiceData {
  const schema =
    value.assetSchema === null
      ? undefined
      : known(
          value.assetSchema,
          [
            AssetSchema.Nia,
            AssetSchema.Cfa,
            AssetSchema.Ifa,
            AssetSchema.Uda,
            'Bfa',
          ] as const,
          'invoice schema'
        );
  const network = known<BitcoinNetwork>(
    value.network,
    ['mainnet', 'testnet', 'testnet4', 'regtest', 'signet', 'utexo'],
    'invoice network'
  );
  return {
    invoice: encoded,
    recipientId: value.recipientId,
    assetId: value.assetId ?? undefined,
    assetSchema: schema,
    assignment: assignment(value.assignment),
    assignmentName: value.assignmentName ?? undefined,
    network,
    expirationTimestamp:
      value.expirationTimestamp === null
        ? null
        : safeAmount(value.expirationTimestamp, 'expirationTimestamp'),
    transportEndpoints: value.transportEndpoints,
    publicKey: value.publicKey ?? undefined,
    encryption: known(
      value.encryption,
      ['Required', 'Unsupported', 'Optional'] as const,
      'encryption'
    ),
    unknownQueryParams: Object.fromEntries(
      value.unknownQueryParams.map(({ key, value: item }) => [key, item])
    ),
  };
}
