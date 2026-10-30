import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '@utexo/rgb-sdk-core';
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

test('onchainSend sends the decoded recipient through rlnSendRgb', async () => {
  const { wallet, calls } = walletWith({
    rlnDecodeRgbInvoice: async () => decoded(),
    rlnSendRgb: async () => ({ txid: 'tx', batchTransferIdx: 3 }),
  });
  const result = await wallet.onchainSend({
    invoice: INVOICE,
    witnessData: { amountSat: 1000 },
    feeRate: 2,
  });
  assert.deepEqual(result, { txid: 'tx', batchTransferIdx: 3 });
  const send = calls.find(([name]) => name === 'rlnSendRgb');
  assert.deepEqual(send[1], [
    false,
    2,
    1,
    false,
    ASSET,
    'recipient',
    250,
    ['rpcs://proxy.example/json-rpc'],
    { amountSat: 1000 },
  ]);
});

test('onchainSend prefers explicit asset and amount', async () => {
  const { wallet, calls } = walletWith({
    rlnDecodeRgbInvoice: async () =>
      decoded({ assetId: undefined, assignment: 'Any' }),
    rlnSendRgb: async () => ({ txid: 'tx', batchTransferIdx: 0 }),
  });
  await wallet.onchainSend({
    invoice: INVOICE,
    assetId: 'rgb:other',
    amount: 7,
  });
  const [, args] = calls.find(([name]) => name === 'rlnSendRgb');
  assert.equal(args[4], 'rgb:other');
  assert.equal(args[6], 7);
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
    rlnSendRgb: async () => ({ txid: 'tx', batchTransferIdx: 0 }),
  });
  await wallet.onchainSend({
    invoice: INVOICE,
    witnessData: { amountSat: 1000 },
  });
  const [, args] = calls.find(([name]) => name === 'rlnSendRgb');
  assert.equal(args[1], 1);
  assert.equal(args[2], 1);
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
      rlnSendRgb: async () => ({ txid: 'tx', batchTransferIdx: 0 }),
    });
    await assert.rejects(
      wallet.onchainSend({ invoice: INVOICE, ...request }),
      (error) => error instanceof ValidationError && error.field === field
    );
    assert.equal(calls.length, 0);
  });
}

test('decodeRGBInvoice maps invoice fields', async () => {
  const { wallet } = walletWith({
    rlnDecodeRgbInvoice: async () =>
      decoded({ proxyRecipientId: 'proxy-recipient' }),
  });
  const data = await wallet.decodeRGBInvoice({ invoice: INVOICE });
  assert.equal(data.recipientId, 'recipient');
  assert.equal(data.assignment.amount, 250);
  assert.ok(!('proxyRecipientId' in data));
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

test('constructor accepts address reuse', () => {
  assert.doesNotThrow(
    () => new RlnWallet({ ...params, reuseAddresses: true }, signer)
  );
});

const unspent = (outpoint, colorable = true) => ({
  utxo: { outpoint, colorable, exists: true, btcAmount: 1000 },
  rgbAllocations: [],
});

// A fake native UTXO store; reads yield so unserialized calls would interleave.
function fakeUtxoNative() {
  const unspents = [unspent('a:0'), unspent('a:1', false)];
  const calls = [];
  let next = 0;
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
  return {
    calls,
    Rgb: {
      rlnCreateNode: async () => 7,
      rlnListUnspents: async (_id, skipSync) => {
        calls.push(['rlnListUnspents', skipSync]);
        await tick();
        return unspents.map((u) => ({ ...u }));
      },
      rlnCreateUtxos: async (_id, upTo, num, size, feeRate, skipSync) => {
        calls.push(['rlnCreateUtxos', upTo, num, size, feeRate, skipSync]);
        await tick();
        for (let i = 0; i < (num ?? 1); i++)
          unspents.push(unspent(`new:${next++}`));
        unspents.push(unspent(`change:${next++}`, false));
      },
    },
  };
}

async function walletOnFakeNative(native) {
  const { RLNBinding } = await import('../lib/module/binding/RLNBinding.js');
  globalThis.__RN_NATIVE__ = { Rgb: native.Rgb };
  const binding = new RLNBinding();
  await binding.rlnCreateNode({ storageDirPath: '/tmp', network: 'regtest' });
  const { wallet } = walletWith({
    rlnCreateUtxosCounted: (...args) => binding.rlnCreateUtxosCounted(...args),
  });
  return wallet;
}

test('createUtxos returns the number of new colorable UTXOs', async () => {
  const native = fakeUtxoNative();
  try {
    const wallet = await walletOnFakeNative(native);
    assert.equal(await wallet.createUtxos({ num: 2, feeRate: 3 }), 2);
    assert.deepEqual(native.calls, [
      ['rlnListUnspents', false],
      ['rlnCreateUtxos', true, 2, null, 3, true],
      ['rlnListUnspents', true],
    ]);
    await assert.rejects(wallet.createUtxos({ num: 256 }), /num must be/);
    await assert.rejects(wallet.createUtxos({ feeRate: 1.5 }), /feeRate/);
  } finally {
    delete globalThis.__RN_NATIVE__;
  }
});

test('concurrent createUtxos calls count only their own UTXOs', async () => {
  const native = fakeUtxoNative();
  try {
    const wallet = await walletOnFakeNative(native);
    const counts = await Promise.all([
      wallet.createUtxos({ num: 1, upTo: false }),
      wallet.createUtxos({ num: 1, upTo: false }),
    ]);
    assert.deepEqual(counts, [1, 1]);
  } finally {
    delete globalThis.__RN_NATIVE__;
  }
});

test('read methods forward skipSync to native', async () => {
  const { wallet, calls } = walletWith({
    rlnBtcBalance: async () => ({}),
    rlnListUnspents: async () => [],
    rlnListTransactions: async () => [],
  });
  await wallet.getBtcBalance({ skipSync: true });
  await wallet.listUnspents({ skipSync: true });
  await wallet.listTransactions({ skipSync: true });
  await wallet.getBtcBalance();
  assert.deepEqual(
    calls.map(([, args]) => args),
    [[true], [true], [true], [false]]
  );
});

test('receive forwards assignmentKind with the shared rules', async () => {
  const { wallet, calls } = walletWith({
    rlnRgbInvoice: async () => ({
      invoice: 'rgb:inv',
      batchTransferIdx: 1,
      recipientId: 'r',
    }),
  });
  await wallet.witnessReceive({
    assetId: 'rgb:uda',
    assignmentKind: 'NonFungible',
  });
  await wallet.blindReceive({ amount: 5 });
  await wallet.onchainReceive({ assignmentKind: 'InflationRight', amount: 9 });
  assert.deepEqual(
    calls.map(([, args]) => args),
    [
      ['rgb:uda', null, null, 0, true, 'NonFungible'],
      [null, 5, null, 0, false, 'Fungible'],
      [null, 9, null, 0, true, 'InflationRight'],
    ]
  );
  await assert.rejects(
    wallet.witnessReceive({ assignmentKind: 'MintRight' }),
    /not supported by RGB_LN/
  );
  await assert.rejects(
    wallet.blindReceive({ assignmentKind: 'Fungible' }),
    /requires amount/
  );
  assert.equal(calls.length, 3);
});

test('listAssets forwards schema filters', async () => {
  const { wallet, calls } = walletWith({ rlnListAssets: async () => ({}) });
  await wallet.listAssets({ filterAssetSchemas: ['Nia', 'Bfa'] });
  await wallet.listAssets();
  assert.deepEqual(
    calls.map(([, args]) => args),
    [[['Nia', 'Bfa']], [[]]]
  );
  await assert.rejects(
    wallet.listAssets({ filterAssetSchemas: ['nia'] }),
    /Unknown asset schema/
  );
});

test('issueAssetCfa and issueAssetUda upload files before issuing', async () => {
  let n = 0;
  const asset = {
    assetId: 'rgb:a',
    name: 'A',
    precision: 0,
    issuedSupply: 10,
    timestamp: 1,
    addedAt: 2,
    balance: { settled: 0, future: 0, spendable: 0 },
  };
  const { wallet, calls } = walletWith({
    rlnPostAssetMedia: async () => `digest-${++n}`,
    rlnIssueAssetCfa: async () => asset,
    rlnIssueAssetUda: async () => ({ ...asset, ticker: 'U' }),
  });
  await wallet.issueAssetCfa({
    name: 'A',
    precision: 0,
    amounts: [10],
    filePath: '/m.png',
  });
  await wallet.issueAssetUda({
    ticker: 'U',
    name: 'A',
    precision: 0,
    mediaFilePath: '/u.png',
    attachmentsFilePaths: ['/x.png'],
  });
  assert.deepEqual(
    calls.map(([name, args]) => [name, args]),
    [
      ['rlnPostAssetMedia', ['/m.png']],
      ['rlnIssueAssetCfa', ['A', null, 0, [10], 'digest-1']],
      ['rlnPostAssetMedia', ['/u.png']],
      ['rlnPostAssetMedia', ['/x.png']],
      ['rlnIssueAssetUda', ['U', 'A', null, 0, 'digest-2', ['digest-3']]],
    ]
  );
  // Invalid input fails before any upload.
  await assert.rejects(
    wallet.issueAssetCfa({
      name: 'A',
      precision: 0,
      amounts: [1.5],
      filePath: '/m.png',
    }),
    /amounts/
  );
  assert.equal(n, 3);
});

test('getAssetMetadata, checkIndexerUrl and estimateFeeRate match RGB_L1 shapes', async () => {
  const { wallet } = walletWith({
    rlnAssetMetadata: async () => ({
      assetSchema: 'Nia',
      initialSupply: '18446744073709551615',
      maxSupply: '18446744073709551615',
      knownCirculatingSupply: '18446744073709551615',
      timestamp: 1700000000,
      name: 'N',
      precision: 8,
      ticker: 'N',
    }),
    rlnCheckIndexerUrl: async () => ({ indexerProtocol: 'Electrum' }),
    rlnEstimateFee: async () => ({ feeRate: 2.1 }),
  });
  const metadata = await wallet.getAssetMetadata('rgb:n');
  assert.equal(metadata.assetSchema, 'Nia');
  assert.equal(metadata.initialSupply, '18446744073709551615');
  assert.deepEqual(await wallet.checkIndexerUrl('tcp://x'), {
    indexerProtocol: 'electrum',
  });
  assert.deepEqual(await wallet.estimateFeeRate(6), { feeRate: 3 });
});

test('native-signer unlock rejects gossipRgsServerUrl instead of dropping it', async () => {
  const { RLNBinding } = await import('../lib/module/binding/RLNBinding.js');
  const binding = new RLNBinding();
  await assert.rejects(
    binding.rlnUnlockNodeWithNativeExternalSigner(1, {
      gossipRgsServerUrl: 'https://rgs.example',
    }),
    (error) =>
      error instanceof ValidationError && error.field === 'gossipRgsServerUrl'
  );
});

test('payment types are normalized on both platform spellings', async () => {
  const { RLNBinding } = await import('../lib/module/binding/RLNBinding.js');
  const { toLightningPayment } =
    await import('../lib/module/binding/mappers.js');
  globalThis.__RN_NATIVE__ = {
    Rgb: {
      rlnCreateNode: async () => 7,
      // Android SCREAMING_SNAKE, iOS lowerCamel, then an unknown value.
      rlnListPayments: async () => [
        { paymentHash: 'a', status: 'SUCCEEDED', paymentType: 'OUTBOUND' },
        {
          paymentHash: 'b',
          status: 'SUCCEEDED',
          paymentType: 'inboundAutoClaim',
        },
        { paymentHash: 'c', status: 'SUCCEEDED', paymentType: 'INBOUND_HODL' },
        { paymentHash: 'd', status: 'SUCCEEDED', paymentType: 'Future' },
      ],
    },
  };
  try {
    const binding = new RLNBinding();
    await binding.rlnCreateNode({ storageDirPath: '/tmp', network: 'regtest' });
    const payments = (await binding.rlnListPayments()).map(toLightningPayment);
    assert.deepEqual(
      payments.map((p) => [p.paymentType, p.inbound]),
      [
        ['Outbound', false],
        ['InboundAutoClaim', true],
        ['InboundHodl', true],
        [undefined, undefined],
      ]
    );
  } finally {
    delete globalThis.__RN_NATIVE__;
  }
});

test('onchainSend sends the request it validated even if the caller mutates it', async () => {
  let release;
  const decodeStarted = new Promise((resolve) => {
    release = resolve;
  });
  let finishDecode;
  const { wallet, calls } = walletWith({
    rlnDecodeRgbInvoice: () => {
      release();
      return new Promise((resolve) => {
        finishDecode = () => resolve(decoded());
      });
    },
    rlnSendRgb: async () => ({ txid: 'tx', batchTransferIdx: 1 }),
  });
  const request = {
    invoice: INVOICE,
    amount: 5,
    witnessData: { amountSat: 1000 },
  };
  const sending = wallet.onchainSend(request);
  await decodeStarted;
  request.invoice = 'rgb:other-invoice';
  request.amount = -1;
  request.assetId = 'rgb:other-asset';
  request.witnessData.amountSat = 0.5;
  finishDecode();
  await sending;
  const decode = calls.find(([name]) => name === 'rlnDecodeRgbInvoice');
  assert.deepEqual(decode[1], [INVOICE]);
  const send = calls.find(([name]) => name === 'rlnSendRgb');
  assert.deepEqual(send[1], [
    false,
    1,
    1,
    false,
    ASSET,
    'recipient',
    5,
    ['rpcs://proxy.example/json-rpc'],
    { amountSat: 1000 },
  ]);
});

test('RLN issuance rejects a total supply beyond the exact integer range', async () => {
  const { wallet, calls } = walletWith({});
  const big = Number.MAX_SAFE_INTEGER;
  const overflow = (error) => error.code === 'AMOUNT_OVERFLOW';
  await assert.rejects(
    wallet.issueAssetCfa({
      name: 'C',
      precision: 0,
      amounts: [big, 2],
      filePath: '/m.png',
    }),
    overflow
  );
  await assert.rejects(
    wallet.issueAssetNia({
      ticker: 'N',
      name: 'N',
      precision: 0,
      amounts: [big, 1],
    }),
    overflow
  );
  await assert.rejects(
    wallet.issueAssetIfa({
      ticker: 'I',
      name: 'I',
      precision: 0,
      amounts: [big - 1],
      inflationAmounts: [2],
    }),
    overflow
  );
  // Nothing reaches native, not even the media upload.
  assert.deepEqual(calls, []);
});

test('RLN issuance converts file:// URIs and rejects other schemes before upload', async () => {
  const asset = {
    assetId: 'rgb:a',
    name: 'A',
    precision: 0,
    issuedSupply: 1,
    timestamp: 1,
    addedAt: 2,
    balance: { settled: 0, future: 0, spendable: 0 },
  };
  const { wallet, calls } = walletWith({
    rlnPostAssetMedia: async () => 'digest',
    rlnIssueAssetCfa: async () => asset,
    rlnIssueAssetUda: async () => ({ ...asset, ticker: 'U' }),
  });
  await wallet.issueAssetCfa({
    name: 'A',
    precision: 0,
    amounts: [1],
    filePath: 'file:///data/my%20logo.png',
  });
  await assert.rejects(
    wallet.issueAssetUda({
      ticker: 'U',
      name: 'A',
      precision: 0,
      mediaFilePath: '/ok.png',
      attachmentsFilePaths: ['content://media/1'],
    }),
    /attachmentsFilePaths must be an absolute path or a file:\/\/ URI/
  );
  assert.deepEqual(
    calls.filter(([name]) => name === 'rlnPostAssetMedia').map(([, a]) => a),
    [['/data/my logo.png']]
  );
});

test('RGB_LN createBackup rejects with UNSUPPORTED_CAPABILITY without calling native', async () => {
  const { wallet, calls } = walletWith({});
  await assert.rejects(
    wallet.createBackup({ backupPath: '/b', password: 'pw' }),
    (error) =>
      error.code === 'UNSUPPORTED_CAPABILITY' && error.protocol === 'RGB_LN'
  );
  assert.deepEqual(calls, []);
});

test('BTC balance must be the structured record both bridges return', async () => {
  const { RLNBinding } = await import('../lib/module/binding/RLNBinding.js');
  const sub = { settled: 1, future: 2, spendable: 3 };
  let reply = { vanilla: sub, colored: sub };
  globalThis.__RN_NATIVE__ = {
    Rgb: {
      rlnCreateNode: async () => 7,
      rlnBtcBalance: async () => reply,
    },
  };
  try {
    const binding = new RLNBinding();
    await binding.rlnCreateNode({ storageDirPath: '/tmp', network: 'regtest' });
    assert.deepEqual(await binding.rlnBtcBalance(false), reply);
    // The old Rust Display string is no longer parsed, nor replaced by zeros.
    reply = {
      vanilla: 'BtcBalance(settled=1, future=2, spendable=3)',
      colored: sub,
    };
    await assert.rejects(
      binding.rlnBtcBalance(false),
      /Invalid native BTC balance: vanilla/
    );
  } finally {
    delete globalThis.__RN_NATIVE__;
  }
});
