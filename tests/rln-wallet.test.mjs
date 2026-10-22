import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfigurationError, ValidationError } from '@utexo/rgb-sdk-core';
import { RlnWallet } from '../lib/module/wallet/rln/rln-wallet.js';

const params = { network: 'regtest', storageDirPath: '/wallets/rln/test' };
const signer = {};
const ASSET = 'rgb:asset-id';
const INVOICE = 'rgb:invoice';

function decoded(overrides = {}) {
  return {
    recipientId: 'recipient',
    recipientType: 'Witness',
    assetId: ASSET,
    assignment: 'Fungible(250)',
    network: 'Regtest',
    expirationTimestamp: 1_900_000_000,
    transportEndpoints: ['rpcs://proxy.example/json-rpc'],
    publicKey: 'ab'.repeat(32),
    encryption: 'Required',
    ...overrides,
  };
}

// RlnWallet keeps its manager in a private field; swap it for a recorder.
function walletWith(manager) {
  const wallet = new RlnWallet(params, signer);
  const calls = [];
  wallet.rln = new Proxy(manager, {
    get(target, name) {
      const value = target[name];
      if (typeof value !== 'function') return value;
      return (...args) => {
        calls.push([name, args]);
        return value(...args);
      };
    },
  });
  return { wallet, calls };
}

test('onchainSend sends the whole invoice through rlnSendRgbInvoice', async () => {
  const { wallet, calls } = walletWith({
    rlnDecodeRgbInvoice: async () => decoded(),
    rlnSendRgbInvoice: async () => ({ txid: 'tx', batchTransferIdx: 3 }),
  });
  const result = await wallet.onchainSend({
    invoice: INVOICE,
    witnessData: { amountSat: 1000 },
    feeRate: 2,
  });
  assert.deepEqual(result, { txid: 'tx', batchTransferIdx: 3 });
  const send = calls.find(([name]) => name === 'rlnSendRgbInvoice');
  assert.deepEqual(send[1], [
    INVOICE,
    ASSET,
    250,
    false,
    2,
    1,
    { amountSat: 1000 },
  ]);
  assert.ok(!calls.some(([name]) => name === 'rlnSendRgb'));
});

test('onchainSend prefers explicit asset and amount', async () => {
  const { wallet, calls } = walletWith({
    rlnDecodeRgbInvoice: async () =>
      decoded({ assetId: undefined, assignment: 'Any' }),
    rlnSendRgbInvoice: async () => ({ txid: 'tx', batchTransferIdx: 0 }),
  });
  await wallet.onchainSend({
    invoice: INVOICE,
    assetId: 'rgb:other',
    amount: 7,
  });
  const [, args] = calls.find(([name]) => name === 'rlnSendRgbInvoice');
  assert.equal(args[1], 'rgb:other');
  assert.equal(args[2], 7);
});

test('onchainSend requires an amount for any-amount invoices', async () => {
  const { wallet } = walletWith({
    rlnDecodeRgbInvoice: async () => decoded({ assignment: 'Any' }),
  });
  await assert.rejects(
    wallet.onchainSend({ invoice: INVOICE }),
    (error) => error instanceof ValidationError && error.field === 'amount'
  );
});

test('onchainSend rejects invoice amounts beyond the safe integer range', async () => {
  const { wallet } = walletWith({
    rlnDecodeRgbInvoice: async () =>
      decoded({ assignment: 'Fungible(18446744073709551615)' }),
  });
  await assert.rejects(
    wallet.onchainSend({ invoice: INVOICE }),
    /exact integer range/
  );
});

test('onchainSend defaults to an integer fee rate', async () => {
  const { wallet, calls } = walletWith({
    rlnDecodeRgbInvoice: async () => decoded(),
    rlnSendRgbInvoice: async () => ({ txid: 'tx', batchTransferIdx: 0 }),
  });
  await wallet.onchainSend({
    invoice: INVOICE,
    witnessData: { amountSat: 1000 },
  });
  const [, args] = calls.find(([name]) => name === 'rlnSendRgbInvoice');
  assert.equal(args[4], 1);
  assert.equal(args[5], 1);
});

for (const [name, request, field] of [
  ['fractional feeRate', { feeRate: 1.5 }, 'feeRate'],
  ['zero feeRate', { feeRate: 0 }, 'feeRate'],
  ['fractional amount', { amount: 2.5 }, 'amount'],
  ['unsafe amount', { amount: 2 ** 53 }, 'amount'],
  ['zero amount', { amount: 0 }, 'amount'],
  ['minConfirmations above u8', { minConfirmations: 256 }, 'minConfirmations'],
  [
    'fractional witness amount',
    { witnessData: { amountSat: 1000.5 } },
    'witnessData.amountSat',
  ],
  [
    'negative witness blinding',
    { witnessData: { amountSat: 1000, blinding: -1 } },
    'witnessData.blinding',
  ],
]) {
  test(`onchainSend rejects ${name} before calling native`, async () => {
    const { wallet, calls } = walletWith({
      rlnDecodeRgbInvoice: async () => decoded(),
      rlnSendRgbInvoice: async () => ({ txid: 'tx', batchTransferIdx: 0 }),
    });
    await assert.rejects(
      wallet.onchainSend({ invoice: INVOICE, ...request }),
      (error) => error instanceof ValidationError && error.field === field
    );
    assert.equal(calls.length, 0);
  });
}

test('decodeRGBInvoice maps proxy invoice fields', async () => {
  const { wallet } = walletWith({
    rlnDecodeRgbInvoice: async () => decoded(),
  });
  const data = await wallet.decodeRGBInvoice({ invoice: INVOICE });
  assert.equal(data.publicKey, 'ab'.repeat(32));
  assert.equal(data.encryption, 'Required');
  assert.equal(data.assignment.amount, 250);
  assert.ok(!('proxyRecipientId' in data));
});

test('decodeRGBInvoice leaves unknown encryption modes unset', async () => {
  const { wallet } = walletWith({
    rlnDecodeRgbInvoice: async () =>
      decoded({ publicKey: undefined, encryption: 'Future' }),
  });
  const data = await wallet.decodeRGBInvoice({ invoice: INVOICE });
  assert.equal(data.publicKey, undefined);
  assert.equal(data.encryption, undefined);
});

test('listOnchainTransfers keeps rgb-lib-bfa Mint transfers', async () => {
  const { wallet } = walletWith({
    rlnListTransfers: async () => [
      { idx: 1, status: 'Settled', kind: 'Mint', assignments: [] },
      { idx: 2, status: 'Settled', kind: 'Send', assignments: [] },
    ],
  });
  const kinds = (await wallet.listOnchainTransfers(ASSET)).map((t) => t.kind);
  assert.deepEqual(kinds, ['Mint', 'Send']);
});

test('constructor rejects address reuse', () => {
  assert.throws(
    () => new RlnWallet({ ...params, reuseAddresses: true }, signer),
    (error) =>
      error instanceof ConfigurationError &&
      /reuseAddresses/.test(error.message)
  );
  assert.doesNotThrow(
    () => new RlnWallet({ ...params, reuseAddresses: false }, signer)
  );
});
