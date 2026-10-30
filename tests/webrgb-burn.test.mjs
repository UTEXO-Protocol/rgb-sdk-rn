import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createWalletConnectProvider } from '@utexo/webrgb-walletconnect';
import { base64 } from '@scure/base';
import { WebRgbBurnController } from '../lib/module/integrations/webrgb/burn.js';
import { WebRgbProvider } from '../lib/module/integrations/webrgb/index.js';
import { validateBurnParams } from '../lib/module/wallet/operations/validation.js';
import {
  burnDestinationHash,
  createBurnDestination,
  encodeEvmBurnRecipient,
} from '../lib/module/integrations/webrgb/index.js';
import {
  BurnOperations,
  normalizeBurnRecord,
} from '../lib/module/wallet/operations/burn.js';

const txid = 'ab'.repeat(32);
const args = () => ({
  network: 'utexo',
  assetId: 'rgb:asset',
  amount: '18446744073709551615',
  burnRecipient: { chainId: 'eip155:42161', address: `0x${'12'.repeat(20)}` },
  feeRate: 2,
  minConfirmations: 3,
});
function fixture(destinationRoutes) {
  let records = [],
    enabled = true,
    approve = true;
  const calls = [],
    prompts = [];
  const proof = new Uint8Array(48 * 1024 + 7).fill(51);
  const store = {
    readAll: async () => structuredClone(records),
    write: async (record) => {
      records = [
        ...records.filter(
          (item) =>
            (item.id ?? item.request.requestId) !==
            (record.id ?? record.request.requestId)
        ),
        structuredClone(record),
      ];
    },
  };
  const wallet = {
    isDisposed: () => false,
    getNetwork: () => 'utexo',
    getBfaCapabilities: async () => ({
      burn: true,
      consignment: true,
      bfa: true,
    }),
    listAssets: async () => ({ bfa: [{ assetId: 'rgb:asset' }] }),
    burn: async (params) => {
      calls.push(params);
      assert.equal(records.at(-1).state, 'pending');
      return { txid, batchTransferIdx: 42 };
    },
    listTransfers: async () => [
      { txid, idx: 9, kind: 'Burn', status: 'Settled' },
    ],
    listTransactionsByTxid: async () => [
      { txid, confirmationTime: { height: 100 } },
    ],
    getNetworkInfo: async () => ({ blockHeight: 102 }),
    refreshWallet: async () => {},
    getConsignment: async () => base64.encode(proof),
  };
  const operations = new BurnOperations(wallet, store);
  const controller = (origin = 'https://mint.example') =>
    new WebRgbBurnController(
      wallet,
      {
        origin,
        enabled: () => enabled,
        confirm: async (method, params) => {
          prompts.push({ method, params });
          return approve;
        },
      },
      { operations, destinationRoutes }
    );
  return {
    wallet,
    calls,
    prompts,
    proof,
    store,
    operations,
    controller,
    approve: (value) => {
      approve = value;
    },
    revoke: () => {
      enabled = false;
    },
  };
}
test('u64 burn precision and EVM recipient padding never use JS numbers', () => {
  const params = {
    assetId: 'rgb:asset',
    amount: args().amount,
    burnRecipient: encodeEvmBurnRecipient(args().burnRecipient.address),
    feeRate: 2,
    minConfirmations: 3,
  };
  assert.equal(params.burnRecipient, '0'.repeat(24) + '12'.repeat(20));
  validateBurnParams(params);
  for (const amount of ['18446744073709551616', 1, '01', '0', '-1'])
    assert.throws(() => validateBurnParams({ ...params, amount }));
  assert.throws(() => validateBurnParams({ ...params, feeRate: 1.5 }));
  assert.throws(() => encodeEvmBurnRecipient(`0x${'0'.repeat(40)}`));
});
test('SDK generates a private journal ID before native burn and returns no ID', async () => {
  const f = fixture();
  const request = {
    ...args(),
    burnRecipient: { ...args().burnRecipient, chainId: 'eip155:1' },
  };
  const result = await f.controller().burnAsset(request);
  const [record] = await f.store.readAll();
  assert.deepEqual(result.burnRecipient, request.burnRecipient);
  assert.deepEqual(record.metadata.payout, request.burnRecipient);
  assert.deepEqual(f.prompts[0].params.burnRecipient, request.burnRecipient);
  assert.match(record.id, /^[0-9a-f]{32}$/);
  assert.equal(record.state, 'complete');
  assert.equal(result.requestId, undefined);
  assert.equal(record.result.requestId, undefined);
  assert.equal(f.calls[0].requestId, undefined);
  assert.equal(f.prompts[0].params.requestId, undefined);
  assert.equal(f.calls[0].amount, args().amount);
  assert.equal(f.prompts[0].params.getConsignment, true);
  assert.equal(f.prompts.length, 1);
});
test('each new approved burn has a unique wallet-generated ID, even with identical arguments', async () => {
  const f = fixture();
  const callerId = 'caller-controlled-id';
  await Promise.all([
    f.controller().burnAsset({ ...args(), requestId: callerId }),
    f.controller().burnAsset({ ...args(), requestId: callerId }),
  ]);
  const records = await f.store.readAll();
  assert.equal(records.length, 2);
  assert.equal(new Set(records.map((r) => r.id)).size, 2);
  assert.ok(records.every((r) => r.id !== callerId));
  assert.equal(f.calls.length, 2);
  assert.equal(f.prompts.length, 2);
});
test('an ambiguous native failure blocks queued and restarted burns', async () => {
  const f = fixture();
  let calls = 0;
  f.wallet.burn = async () => {
    calls++;
    throw new Error('Lost native response');
  };
  const [first, second] = await Promise.allSettled([
    f.controller().burnAsset(args()),
    f.controller().burnAsset(args()),
  ]);
  assert.equal(first.status, 'rejected');
  assert.match(first.reason.message, /Lost native response/);
  assert.equal(second.status, 'rejected');
  assert.match(second.reason.message, /unresolved outcome/);
  await assert.rejects(f.controller().burnAsset(args()), /unresolved outcome/);
  const [record] = await f.store.readAll();
  assert.equal(record.state, 'pending');
  assert.equal(await f.controller().getTransferStatus(record.id), null);
  assert.equal(calls, 1);
});
test('journal write failures never cause an automatic native retry', async () => {
  const before = fixture();
  before.store.write = async () => {
    throw new Error('Storage unavailable');
  };
  await assert.rejects(
    before.controller().burnAsset(args()),
    /Storage unavailable/
  );
  assert.equal(before.calls.length, 0);

  const after = fixture();
  const write = after.store.write;
  after.store.write = async (record) => {
    if (record.state === 'complete') throw new Error('Result save failed');
    await write(record);
  };
  await assert.rejects(
    after.controller().burnAsset(args()),
    /Result save failed/
  );
  await assert.rejects(
    after.controller().burnAsset(args()),
    /Result save failed/
  );
  after.store.write = write;
  await after.operations.retryPersistence();
  assert.equal(
    (await after.controller().getTransferStatus(txid)).status,
    'Settled'
  );
  assert.equal(after.calls.length, 1);
});
test('refusal, malformed chain and revoked session do not burn', async () => {
  const f = fixture();
  f.approve(false);
  await assert.rejects(f.controller().burnAsset(args()), {
    code: 'USER_REJECTED',
  });
  await assert.rejects(
    f.controller().burnAsset({
      ...args(),
      burnRecipient: { ...args().burnRecipient, chainId: 'eip155:0' },
    }),
    { code: 'INVALID_PARAMS' }
  );
  f.revoke();
  await assert.rejects(f.controller().burnAsset(args()), {
    code: 'NOT_ENABLED',
  });
  assert.equal(f.calls.length, 0);
  assert.equal((await f.store.readAll()).length, 0);
});
test('status uses the actual anchor height and remains scoped to the approving origin', async () => {
  const f = fixture();
  await f.controller().burnAsset(args());
  const status = await f.controller().getTransferStatus(txid);
  assert.equal(status.transfer.blockHeight, 100);
  assert.equal(status.transfer.confirmations, 3);
  assert.equal(status.transfer.transferId, 9);
  assert.equal(status.transfer.batchTransferIdx, 42);
  assert.equal(status.transfer.requestId, undefined);
  assert.equal(f.calls.length, 1);
  assert.equal(
    await f.controller('https://other.example').getTransferStatus(txid),
    null
  );
  f.wallet.listTransactionsByTxid = async () => [{ txid }];
  const reorg = await f.controller().getTransferStatus(txid);
  assert.equal(reorg.transfer.blockHeight, null);
  assert.equal(reorg.transfer.confirmations, 0);
});
test('getConsignment returns the full saved proof; other origins require fresh consent', async () => {
  const f = fixture();
  const controller = f.controller();
  await controller.burnAsset(args());
  const proof = await controller.getConsignment({
    assetId: args().assetId,
    txid,
  });
  assert.equal(proof.byteLength, f.proof.length);
  assert.equal(proof.offset, undefined);
  assert.equal(proof.nextOffset, undefined);
  assert.equal(proof.digest.algorithm, 'keccak256');
  assert.deepEqual(base64.decode(proof.data), f.proof);
  assert.equal(f.prompts.length, 1);
  assert.equal(f.calls.length, 1);
  f.approve(false);
  await assert.rejects(
    f
      .controller('https://other.example')
      .getConsignment({ assetId: args().assetId, txid }),
    { code: 'USER_REJECTED' }
  );
  assert.equal(f.prompts.at(-1).method, 'getConsignment');
  f.wallet.listTransfers = async () => [{ txid, kind: 'Send' }];
  await assert.rejects(
    controller.getConsignment({ assetId: args().assetId, txid }),
    /Only a saved burn/
  );
});
test('provider advertises and dispatches getConsignment with complete Base64 data', async () => {
  const f = fixture();
  const provider = new WebRgbProvider(f.wallet, {
    origin: 'https://mint.example',
    sessionApproved: true,
    confirm: async () => true,
    burn: { operations: f.operations },
  });
  const methods = (await provider.getInfo()).methods;
  assert.ok(methods.includes('getConsignment'));
  assert.ok(!methods.includes('exportConsignment'));
  assert.equal(provider.exportConsignment, undefined);
  const result = await provider.burnAsset(args());
  assert.equal(result.requestId, undefined);
  const proof = await provider.getConsignment({
    assetId: args().assetId,
    txid,
  });
  assert.deepEqual(base64.decode(proof.data), f.proof);
  assert.equal(proof.nextOffset, undefined);
  assert.equal(provider.request, undefined);
});
test('existing journal records remain usable without leaking old request IDs', async () => {
  const f = fixture();
  const requestId = 'legacy-request-00001';
  const request = { ...args(), requestId };
  await f.store.write({
    origin: 'https://mint.example',
    request,
    state: 'pending',
  });
  await assert.rejects(f.controller().burnAsset(args()), /unresolved outcome/);
  await f.store.write({
    origin: 'https://mint.example',
    request,
    state: 'complete',
    result: {
      ...request,
      txid,
      batchTransferIdx: 42,
      status: 'WaitingConfirmations',
    },
  });
  const controller = f.controller();
  const status = await controller.getTransferStatus(txid);
  assert.equal(status.status, 'Settled');
  assert.equal(status.transfer.amountBaseUnits, args().amount);
  assert.equal(status.transfer.requestId, undefined);
  assert.equal(await controller.getTransferStatus(requestId), null);
  const proof = await controller.getConsignment({
    assetId: args().assetId,
    txid,
  });
  assert.deepEqual(base64.decode(proof.data), f.proof);
  assert.equal(f.calls.length, 0);
  assert.equal(f.prompts.length, 0);
});
test('unsupported native build does not advertise or execute burn', async () => {
  const f = fixture();
  f.wallet.getBfaCapabilities = async () => ({
    burn: false,
    consignment: false,
  });
  assert.deepEqual(await f.controller().methods(), []);
  await assert.rejects(f.controller().burnAsset(args()), {
    code: 'METHOD_NOT_SUPPORTED',
  });
  assert.equal(f.calls.length, 0);
});

test('full proof reads keep their own bytes when concurrent lookups share a controller', async () => {
  const f = fixture();
  const otherTxid = 'cd'.repeat(32);
  f.wallet.listTransfers = async () =>
    [txid, otherTxid].map((id) => ({ txid: id, kind: 'Burn' }));
  f.wallet.getConsignment = async (_assetId, id) =>
    base64.encode(id === txid ? f.proof : new Uint8Array([7, 8, 9]));
  const controller = f.controller();
  const [first, second] = await Promise.all([
    controller.getConsignment({ assetId: args().assetId, txid }),
    controller.getConsignment({ assetId: args().assetId, txid: otherTxid }),
  ]);
  assert.deepEqual(base64.decode(first.data), f.proof);
  assert.deepEqual(base64.decode(second.data), new Uint8Array([7, 8, 9]));
  assert.equal(first.offset, undefined);
  assert.equal(first.nextOffset, undefined);
});

test('revocation during either journal write cancels before native invocation', async () => {
  for (const phase of ['prepared', 'pending']) {
    const f = fixture();
    const write = f.store.write;
    f.store.write = async (record) => {
      await write(record);
      if (record.state === phase) f.revoke();
    };
    await assert.rejects(f.controller().burnAsset(args()), {
      code: 'NOT_ENABLED',
    });
    assert.equal(f.calls.length, 0);
    assert.equal((await f.operations.records())[0].state, 'cancelled');
    // Reconnect with a new authorization context on the same wallet/store.
    await f.operations.execute(
      {
        assetId: 'rgb:asset',
        amount: '1',
        burnRecipient: encodeEvmBurnRecipient(args().burnRecipient.address),
        feeRate: 2,
        minConfirmations: 3,
      },
      {
        origin: 'https://mint.example',
        network: 'utexo',
        payout: args().burnRecipient,
      },
      () => {}
    );
    assert.equal(f.calls.length, 1);
  }
});
test('pre-broadcast funding errors cancel the burn instead of leaving it pending', async () => {
  for (const code of [
    'InsufficientFunds',
    'NoAvailableUtxos',
    'INSUFFICIENT_FUNDS',
  ]) {
    const f = fixture();
    f.wallet.burn = async () => {
      throw Object.assign(new Error('InsufficientAllocationSlots'), { code });
    };
    await assert.rejects(
      f.controller().burnAsset(args()),
      /InsufficientAllocationSlots/
    );
    const [record] = await f.operations.records();
    assert.equal(record.state, 'cancelled', code);
    assert.equal(record.error, 'InsufficientAllocationSlots');
  }
  // An unknown native failure after invocation stays unresolved.
  const f = fixture();
  f.wallet.burn = async () => {
    throw Object.assign(new Error('broadcast failed'), {
      code: 'NATIVE_ERROR',
    });
  };
  await assert.rejects(f.controller().burnAsset(args()));
  assert.equal((await f.operations.records())[0].state, 'pending');
});
test('a capability refusal from burn cancels the record and does not block the next burn', async () => {
  const f = fixture();
  const burn = f.wallet.burn;
  // e.g. an RGB_L1 wallet opened watch-only: rgb-lib refuses before signing.
  f.wallet.burn = async () => {
    throw Object.assign(new Error('burn needs the mnemonic'), {
      code: 'UNSUPPORTED_CAPABILITY',
    });
  };
  await assert.rejects(f.controller().burnAsset(args()), /needs the mnemonic/);
  const [record] = await f.operations.records();
  assert.equal(record.state, 'cancelled');
  f.wallet.burn = burn;
  await f.controller().burnAsset(args());
  assert.equal(f.calls.length, 1);
});
test('BurnOperations refuses a wallet without burn before writing a record', async () => {
  const f = fixture();
  f.wallet.getBfaCapabilities = async () => ({
    burn: false,
    consignment: true,
    bfa: true,
  });
  await assert.rejects(
    f.operations.execute(
      {
        assetId: args().assetId,
        amount: '1',
        burnRecipient: encodeEvmBurnRecipient(args().burnRecipient.address),
        feeRate: 2,
        minConfirmations: 3,
      },
      {
        origin: 'https://mint.example',
        network: 'utexo',
        payout: args().burnRecipient,
      },
      () => {}
    ),
    { code: 'UNSUPPORTED_CAPABILITY' }
  );
  assert.deepEqual(await f.operations.records(), []);
  assert.equal(f.calls.length, 0);
});
test('reconciliation requires a matching burn and independently verified proof', async () => {
  const f = fixture();
  await f.store.write({
    origin: 'https://mint.example',
    request: { ...args(), requestId: 'legacy-pending' },
    state: 'pending',
  });
  const result = { txid, batchTransferIdx: 42 };
  await assert.rejects(
    f.operations.reconcile('legacy-pending', result, async () => false),
    /does not match/
  );
  assert.equal((await f.operations.records())[0].state, 'pending');
  await f.operations.reconcile(
    'legacy-pending',
    result,
    async (record, native, proof) => {
      assert.equal(record.params.amount, args().amount);
      assert.equal(native.txid, txid);
      assert.deepEqual(base64.decode(proof), f.proof);
      return true;
    }
  );
  assert.equal((await f.operations.records())[0].state, 'complete');
  assert.equal(f.calls.length, 0);
  assert.equal(
    (await f.controller().getTransferStatus(txid)).status,
    'Settled'
  );
});
test('invalid journal records fail closed instead of losing unresolved burns', () => {
  for (const record of [null, {}, { version: 2, id: 'x', state: 'complete' }])
    assert.throws(() => normalizeBurnRecord(record));
});

const tronAddress = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const tronAccount = 'a614f803b6fd780986a42c78ec9c7f77e6ded13c';
const tronArgs = () => ({
  ...args(),
  burnRecipient: { chainId: 'tron:728126428', address: tronAddress },
});
test('Tron burn preserves native address in approval/result/journal and encodes only account bytes', async () => {
  const f = fixture();
  const result = await f.controller().burnAsset(tronArgs());
  assert.deepEqual(result.burnRecipient, tronArgs().burnRecipient);
  assert.deepEqual(f.prompts[0].params.burnRecipient, tronArgs().burnRecipient);
  assert.equal(f.calls[0].burnRecipient, '0'.repeat(24) + tronAccount);
  const [record] = await f.operations.records();
  assert.deepEqual(record.metadata.payout, tronArgs().burnRecipient);
  assert.equal(record.state, 'complete');
  // A new operation service/provider can read the same durable journal without reburning.
  const restarted = new BurnOperations(f.wallet, f.store);
  assert.deepEqual(await restarted.records(), [record]);
  const status = await f.controller().getTransferStatus(txid);
  assert.deepEqual(status.transfer.burnRecipient, tronArgs().burnRecipient);
  assert.equal(
    (await f.controller().getConsignment({ assetId: 'rgb:asset', txid }))
      .encoding,
    'base64'
  );
  assert.equal(f.calls.length, 1);
});
test('Tron validates checksum, case, version, nonzero account and chain before prompting or burning', async () => {
  const { base58check } = await import('@scure/base');
  const { sha256 } = await import('@noble/hashes/sha2.js');
  const codec = base58check(sha256);
  const zero = codec.encode(new Uint8Array([0x41, ...new Uint8Array(20)]));
  const wrongVersion = codec.encode(
    new Uint8Array([0x42, ...new Uint8Array(20).fill(1)])
  );
  const recipients = [
    { chainId: 'tron:728126428', address: tronAddress.toLowerCase() },
    { chainId: 'tron:728126428', address: tronAddress.slice(0, -1) + 'a' },
    { chainId: 'tron:728126428', address: zero },
    { chainId: 'tron:728126428', address: wrongVersion },
    { chainId: 'tron:728126428', address: '0x' + tronAccount },
    { chainId: 'tron:728126428', address: '41' + tronAccount },
    { chainId: 'tron:1', address: tronAddress },
    { chainId: 'tron:0728126428', address: tronAddress },
    { chainId: 'tron:0x2b6653dc', address: tronAddress },
    { chainId: 'eip155:1', address: tronAddress },
    { chainId: 'cosmos:cosmoshub-4', address: tronAddress },
  ];
  for (const burnRecipient of recipients) {
    const f = fixture();
    await assert.rejects(
      f.controller().burnAsset({ ...args(), burnRecipient }),
      { code: 'INVALID_PARAMS' }
    );
    assert.equal(f.prompts.length, 0);
    assert.equal(f.calls.length, 0);
    assert.equal((await f.store.readAll()).length, 0);
  }
});
test('Tron testnets preserve their approved chain identity', async () => {
  for (const chainId of ['tron:2494104990', 'tron:3448148188']) {
    const f = fixture();
    const result = await f.controller().burnAsset({
      ...tronArgs(),
      burnRecipient: { chainId, address: tronAddress },
    });
    assert.equal(result.burnRecipient.chainId, chainId);
    assert.equal(f.calls[0].burnRecipient, '0'.repeat(24) + tronAccount);
  }
});
test('Tron journal rejects mismatched or corrupted recipient metadata', async () => {
  const f = fixture();
  await f.controller().burnAsset(tronArgs());
  const [record] = await f.operations.records();
  assert.throws(
    () =>
      normalizeBurnRecord({
        ...record,
        params: { ...record.params, burnRecipient: '1'.repeat(64) },
      }),
    /does not match/
  );
  assert.throws(() =>
    normalizeBurnRecord({
      ...record,
      metadata: {
        ...record.metadata,
        payout: {
          ...record.metadata.payout,
          address: tronAddress.toLowerCase(),
        },
      },
    })
  );
});
test('ambiguous Tron burn remains pending after restart and cannot burn again', async () => {
  const f = fixture();
  let calls = 0;
  f.wallet.burn = async () => {
    calls++;
    throw new Error('Lost native response');
  };
  await assert.rejects(
    f.controller().burnAsset(tronArgs()),
    /Lost native response/
  );
  await assert.rejects(
    f.controller().burnAsset(tronArgs()),
    /unresolved outcome/
  );
  assert.equal(
    (await new BurnOperations(f.wallet, f.store).records())[0].state,
    'pending'
  );
  assert.equal(calls, 1);
});
test('provider advertises Tron only with a working burn controller', async () => {
  const f = fixture();
  const options = {
    origin: 'https://mint.example',
    sessionApproved: true,
    confirm: async () => true,
  };
  const provider = new WebRgbProvider(f.wallet, {
    ...options,
    burn: { operations: f.operations },
  });
  assert.deepEqual((await provider.getInfo()).burnRecipientNamespaces, [
    'eip155',
    'tron',
  ]);
  assert.equal(
    (await new WebRgbProvider(f.wallet, options).getInfo())
      .burnRecipientNamespaces,
    undefined
  );
  f.wallet.getBfaCapabilities = async () => ({
    burn: false,
    consignment: true,
  });
  assert.equal((await provider.getInfo()).burnRecipientNamespaces, undefined);
});

test('WalletConnect exposes recipient namespaces and preserves Tron recipients on the RGB session', async (t) => {
  const f = fixture();
  const provider = new WebRgbProvider(f.wallet, {
    origin: 'https://mint.example',
    sessionApproved: true,
    confirm: async () => true,
    burn: { operations: f.operations },
  });
  const session = {
    topic: 'burn-session',
    expiry: Math.floor(Date.now() / 1000) + 3600,
    sessionProperties: { webrgb: 'webrgb:1' },
    namespaces: {
      rgb: {
        accounts: ['rgb:utexo:test-wallet'],
        methods: ['rgb_enable', 'rgb_getInfo', 'rgb_burnAsset'],
        events: [],
      },
    },
  };
  const client = Object.assign(new EventEmitter(), {
    session: { get: () => session },
    request: async ({ topic, chainId, request }) => {
      assert.equal(topic, session.topic);
      assert.equal(chainId, 'rgb:utexo');
      return provider[request.method.slice(4)](...request.params);
    },
  });
  const remote = createWalletConnectProvider({
    client,
    topic: session.topic,
    network: 'utexo',
  });
  t.after(() => remote.dispose());
  await remote.enable();
  assert.deepEqual((await remote.getInfo()).burnRecipientNamespaces, [
    'eip155',
    'tron',
  ]);
  const result = await remote.burnAsset(tronArgs());
  assert.deepEqual(result.burnRecipient, tronArgs().burnRecipient);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].burnRecipient, '0'.repeat(24) + tronAccount);
});

const v1Routes = [
  { chainId: 'eip155:42161', dstEid: 0 },
  { chainId: 'eip155:1', dstEid: 30101 },
  { chainId: 'tron:728126428', dstEid: 30420 },
];
test('V1 destination commitments match independent go-ethereum ABI vectors from utexo-bridge-fe', () => {
  const { vectors } = JSON.parse(
    readFileSync(
      new URL('./fixtures/burn-destination-vectors.json', import.meta.url)
    )
  );
  for (const vector of vectors)
    assert.equal(burnDestinationHash(vector), vector.hash, vector.name);
  const destination = createBurnDestination(args().burnRecipient, v1Routes);
  for (const invalid of [
    null,
    {},
    { ...destination, version: 2 },
    { ...destination, destinationChainId: Number.MAX_SAFE_INTEGER + 1 },
    { ...destination, dstEid: -1 },
    { ...destination, dstEid: 2 ** 32 },
    { ...destination, recipient: '0x123' },
    { ...destination, recipient: '0x12' },
  ])
    assert.throws(() => burnDestinationHash(invalid));
  assert.throws(() => createBurnDestination(args().burnRecipient, []), /route/);
  const tron = createBurnDestination(
    {
      chainId: 'tron:728126428',
      address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
    },
    v1Routes
  );
  assert.equal(tron.recipient, '0x415cbdd86a2fa8dc4bddd8a8f69dba48572eec07fb');
});
test('RGB_L1 advertises V1, commits the approved hash and recovers destination metadata after restart', async () => {
  const f = fixture(v1Routes);
  f.wallet.protocol = 'RGB_L1';
  const provider = new WebRgbProvider(f.wallet, {
    origin: 'https://mint.example',
    sessionApproved: true,
    confirm: async () => true,
    burn: { operations: f.operations, destinationRoutes: v1Routes },
  });
  const info = await provider.getInfo();
  assert.equal(info.protocol, 'RGB_L1');
  assert.equal(info.burnDestinationVersion, 1);
  assert.deepEqual(info.burnDestinationRoutes, v1Routes);
  assert.ok(info.methods.includes('burnAsset'));
  assert.ok(info.methods.includes('getConsignment'));
  assert.ok(!info.methods.includes('signMessage'));
  const destination = createBurnDestination(args().burnRecipient, v1Routes);
  const result = await provider.burnAsset({
    ...args(),
    burnDestination: destination,
  });
  assert.deepEqual(result.burnDestination, destination);
  assert.equal(
    f.calls[0].burnRecipient,
    burnDestinationHash(destination).slice(2)
  );
  const [record] = await new BurnOperations(f.wallet, f.store).records();
  assert.deepEqual(record.metadata.burnDestination, destination);
  assert.deepEqual(normalizeBurnRecord(record), record);
  const status = await f.controller().getTransferStatus(txid, args().assetId);
  assert.deepEqual(status.transfer.burnDestination, destination);
  const altered = structuredClone(record);
  altered.metadata.burnDestination.dstEid++;
  assert.throws(() => normalizeBurnRecord(altered));
  await provider.getConsignment({ assetId: args().assetId, txid });
  assert.equal(
    f.calls.length,
    1,
    'Recovery and proof reads never repeat the burn'
  );
});
test('V1 rejects route or payout substitutions before approval and never silently falls back to legacy encoding', async () => {
  const destination = createBurnDestination(args().burnRecipient, v1Routes);
  for (const changed of [
    { ...destination, dstEid: 1 },
    { ...destination, destinationChainId: 1 },
    { ...destination, recipient: `0x${'34'.repeat(20)}` },
  ]) {
    const f = fixture(v1Routes);
    await assert.rejects(
      f.controller().burnAsset({ ...args(), burnDestination: changed }),
      { code: 'INVALID_PARAMS' }
    );
    assert.equal(f.prompts.length, 0);
    assert.equal(f.calls.length, 0);
  }
  await assert.rejects(
    fixture()
      .controller()
      .burnAsset({ ...args(), burnDestination: destination }),
    { code: 'INVALID_PARAMS' }
  );
  const f = fixture(v1Routes);
  const result = await f.controller().burnAsset(args());
  assert.deepEqual(
    result.burnDestination,
    destination,
    'Configured wallets also use V1 for local/older callers'
  );
});
test('a local V1 burn exposes recovery metadata only after successful proof-sharing consent', async () => {
  const f = fixture(v1Routes);
  const result = await f.controller('local:wallet').burnAsset(args());
  const bridge = f.controller();
  assert.equal(await bridge.getTransferStatus(txid, args().assetId), null);
  f.approve(false);
  await assert.rejects(
    bridge.getConsignment({ assetId: args().assetId, txid }),
    { code: 'USER_REJECTED' }
  );
  assert.equal(await bridge.getTransferStatus(txid, args().assetId), null);
  f.approve(true);
  const proof = await bridge.getConsignment({ assetId: args().assetId, txid });
  assert.deepEqual(base64.decode(proof.data), f.proof);
  const status = await bridge.getTransferStatus(txid, args().assetId);
  assert.deepEqual(status.transfer.burnDestination, result.burnDestination);
  bridge.revoke();
  assert.equal(await bridge.getTransferStatus(txid, args().assetId), null);
  assert.equal(f.calls.length, 1);
});
