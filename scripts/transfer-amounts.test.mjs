import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ValidationError } from '@utexo/rgb-sdk-core';
import { UTEXOWallet } from '../lib/module/wallet/utexo-wallet.js';
import { WebRgbProvider } from '../lib/module/integrations/webrgb/provider.js';

const assetId = 'rgb:amount-test';
const txid = 'ab'.repeat(32);
const rawTransfer = (overrides = {}) => ({
  idx: 1,
  status: 'Settled',
  kind: 'Burn',
  txid,
  requestedAssignment: 'Fungible(100000)',
  assignments: ['Fungible(900000)'],
  ...overrides,
});
function fixture(transfers) {
  const calls = [];
  const wallet = new UTEXOWallet(
    {
      storageDirPath: '/tmp/rgb-sdk-transfer-amount-test',
      daemonListeningPort: 3001,
      ldkPeerListeningPort: 9735,
      network: 'regtest',
    },
    { initNode: async () => {}, unlockNode: async () => {} }
  );
  wallet.rln.rlnListTransfers = async (asset) => {
    calls.push(asset);
    return transfers;
  };
  wallet.rln.rlnListTransfersByTxid = async (id) => {
    calls.push(id);
    return transfers;
  };
  wallet.refreshWallet = async () => {
    calls.push('refresh');
  };
  const provider = new WebRgbProvider(wallet, {
    origin: 'https://bridge.example',
    sessionApproved: true,
    confirm: async () => {
      throw new Error('Reading history must not prompt or burn');
    },
  });
  return { wallet, provider, calls };
}

for (const method of [
  'listTransfers',
  'listTransfersByTxid',
  'listOnchainTransfers',
]) {
  test(`${method} preserves requested allocations and returns burned units, not change`, async () => {
    const raw = rawTransfer();
    const { wallet, calls } = fixture([raw]);
    const lookup = method === 'listTransfersByTxid' ? txid : assetId;
    const [transfer] = await wallet[method](lookup);
    assert.equal(transfer.requestedAssignment.type, 'Fungible');
    assert.equal(transfer.requestedAssignment.amount, 100000);
    assert.equal(transfer.requestedAssignment.amountBaseUnits, '100000');
    assert.equal(transfer.assignments[0].amount, 900000);
    assert.equal(transfer.assignments[0].amountBaseUnits, '900000');
    assert.equal(transfer.amount, 100000);
    assert.equal(transfer.amountBaseUnits, '100000');
    assert.deepEqual(raw, rawTransfer(), 'Mapping must not mutate native data');
    assert.deepEqual(calls, [lookup]);
  });
}

test('outgoing amounts are per transfer, including full burns and multi-recipient batches', async () => {
  const rows = [
    rawTransfer({ assignments: [] }),
    rawTransfer({
      idx: 2,
      kind: 'Send',
      requestedAssignment: 'Fungible(66)',
      assignments: ['Fungible(802)'],
    }),
    rawTransfer({
      idx: 3,
      kind: 'Send',
      requestedAssignment: 'Fungible(132)',
      assignments: ['Fungible(802)'],
    }),
    ...[66, 132].map((amount, i) =>
      rawTransfer({
        idx: i + 4,
        kind: 'Inflation',
        requestedAssignment: `Fungible(${amount})`,
        assignments: ['InflationRight(802)', 'Fungible(66)', 'Fungible(132)'],
      })
    ),
  ];
  const { wallet, provider } = fixture(rows);
  const expected = ['100000', '66', '132', '66', '132'];
  assert.deepEqual(
    (await wallet.listTransfers(assetId)).map((t) => t.amountBaseUnits),
    expected
  );
  assert.deepEqual(
    (await provider.listTransfers(assetId)).map((t) => t.amountBaseUnits),
    expected
  );
});

test('receives and issuance use actual allocations, not the invoice request', async () => {
  const rows = ['ReceiveBlind', 'ReceiveWitness', 'Issuance'].map((kind, idx) =>
    rawTransfer({
      kind,
      idx,
      requestedAssignment: 'Fungible(999)',
      assignments: ['Fungible(10)', 'Fungible(20)'],
    })
  );
  rows.push(
    rawTransfer({
      kind: 'ReceiveBlind',
      requestedAssignment: 'Fungible(999)',
      assignments: [],
    })
  );
  const { provider } = fixture(rows);
  const transfers = await provider.listTransfers(assetId);
  assert.deepEqual(
    transfers.map((t) => t.amountBaseUnits),
    ['30', '30', '30', undefined]
  );
});

test('unknown outgoing amounts remain unknown and all transfers remain in history', async () => {
  const rows = ['Burn', 'Send', 'Inflation'].flatMap((kind) =>
    [undefined, null, 'Any', 'NonFungible'].map((requestedAssignment) =>
      rawTransfer({
        kind,
        requestedAssignment,
        assignments: ['Fungible(900000)'],
      })
    )
  );
  rows.push(rawTransfer({ status: 'Failed' }));
  const { wallet, provider } = fixture(rows);
  const native = await wallet.listTransfers(assetId);
  assert.equal(native[0].requestedAssignment, undefined);
  assert.equal(
    native[1].requestedAssignment,
    undefined,
    'Normalize native null'
  );
  const transfers = await provider.listTransfers(assetId);
  assert.equal(
    transfers.length,
    rows.length,
    'Filtering belongs to the caller'
  );
  for (const transfer of transfers.slice(0, -1)) {
    assert.equal(transfer.amountBaseUnits, undefined);
    assert.equal(transfer.amount, undefined);
  }
  assert.equal(transfers.at(-1).status, 'Failed');
  assert.equal(transfers.at(-1).amountBaseUnits, '100000');
});

test('u64 amounts stay exact through native mapping, aggregation and WebRGB JSON', async () => {
  const rows = [
    ...['9007199254740991', '9007199254740993', '18446744073709551615'].map(
      (amount, idx) =>
        rawTransfer({
          idx,
          requestedAssignment: `Fungible(${amount})`,
          assignments: [],
        })
    ),
    rawTransfer({
      kind: 'ReceiveBlind',
      assignments: ['Fungible(9007199254740991)', 'Fungible(2)'],
    }),
    rawTransfer({
      requestedAssignment: 'Fungible(1)',
      assignments: ['Fungible(18446744073709551614)'],
    }),
  ];
  const { wallet, provider } = fixture(rows);
  const sdk = await wallet.listTransfers(assetId);
  assert.equal(
    sdk[2].requestedAssignment.amountBaseUnits,
    '18446744073709551615'
  );
  assert.equal(sdk[2].requestedAssignment.amount, undefined);
  assert.equal(sdk[4].assignments[0].amountBaseUnits, '18446744073709551614');
  assert.equal(sdk[4].assignments[0].amount, undefined);
  const transfers = JSON.parse(
    JSON.stringify(await provider.listTransfers(assetId))
  );
  assert.deepEqual(
    transfers.map((t) => t.amountBaseUnits),
    [
      '9007199254740991',
      '9007199254740993',
      '18446744073709551615',
      '9007199254740993',
      '1',
    ]
  );
  assert.deepEqual(
    transfers.map((t) => t.amount),
    [Number.MAX_SAFE_INTEGER, undefined, undefined, undefined, 1]
  );
});

test('invalid native amounts and u64 aggregate overflow are rejected without rounding', async () => {
  for (const value of [
    'Fungible(-1)',
    'Fungible(1.5)',
    'Fungible(18446744073709551616)',
  ]) {
    const { wallet } = fixture([rawTransfer({ requestedAssignment: value })]);
    await assert.rejects(wallet.listTransfers(assetId), ValidationError);
  }
  const { wallet } = fixture([
    rawTransfer({
      kind: 'ReceiveBlind',
      assignments: ['Fungible(18446744073709551615)', 'Fungible(1)'],
    }),
  ]);
  await assert.rejects(wallet.listTransfers(assetId), ValidationError);
});

test('getTransferStatus uses the same amount as history without a burn journal', async () => {
  const { provider, calls } = fixture([rawTransfer()]);
  const status = await provider.getTransferStatus(txid, assetId);
  assert.equal(status.transfer.amount, 100000);
  assert.equal(status.transfer.amountBaseUnits, '100000');
  assert.deepEqual(calls, ['refresh', assetId]);
});
