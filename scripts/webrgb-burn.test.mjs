import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base64 } from '@scure/base';
import { WebRgbBurnController } from '../lib/module/integrations/webrgb/burn.js';
import { WebRgbProvider } from '../lib/module/integrations/webrgb/index.js';
import { validateBurnParams } from '../lib/module/wallet/operations/validation.js';
import { encodeEvmBurnRecipient } from '../lib/module/integrations/webrgb/index.js';
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
function fixture() {
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
      { operations }
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
      { assetId: 'rgb:asset', amount: '1', feeRate: 2, minConfirmations: 3 },
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
