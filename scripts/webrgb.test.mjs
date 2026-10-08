import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WebRgbProvider,
  WEBRGB_READ_METHODS,
} from '../lib/module/integrations/webrgb/index.js';

function fixture(options = {}) {
  const calls = [];
  const prompts = [];
  const wallet = {
    getNetwork: () => 'utexo',
    isDisposed: () => false,
    getAddress: async () => 'tb1qdemo',
    blindReceive: async (args) => {
      calls.push(args);
      return {
        invoice: 'rgb:invoice',
        recipientId: 'utxob:receiver',
        expirationTimestamp: 1234,
      };
    },
    listAssets: async () => ({
      nia: [{ assetId: 'rgb:a', name: 'Asset', ticker: 'A', precision: 0 }],
    }),
    getAssetBalance: async () => ({ settled: 10, future: 10, spendable: 7 }),
    refreshWallet: async () => {
      calls.push('refresh');
    },
    listTransfers: async () => [
      {
        idx: 9,
        status: 'Settled',
        kind: 'ReceiveBlind',
        txid: 'tx',
        recipientId: 'utxob:receiver',
        assignments: [{ type: 'Fungible', amount: 10 }],
        amount: 10,
        amountBaseUnits: '10',
      },
    ],
    decodeRGBInvoice: async () => ({
      network: 'utexo',
      assignment: { type: 'Fungible', amount: 10 },
      recipientId: 'utxob:receiver',
    }),
  };
  const provider = new WebRgbProvider(wallet, {
    origin: 'https://mint.example',
    confirm: async (request) => {
      prompts.push(request);
      return true;
    },
    ...options,
  });
  return { provider, calls, prompts, wallet };
}

test('session must be approved; repeated enable does not prompt twice', async () => {
  const { provider, prompts } = fixture();
  await assert.rejects(provider.getInfo(), { code: 'NOT_ENABLED' });
  await Promise.all([provider.enable(), provider.enable()]);
  assert.equal(prompts.length, 1);
  const info = await provider.getInfo();
  assert.equal(info.network, 'utexo');
  assert.deepEqual(info.methods, WEBRGB_READ_METHODS);
  assert.ok(!info.methods.includes('burnAsset'));
});
test('blinded invoice is confirmed with the actual effective parameters', async () => {
  const { provider, calls, prompts } = fixture({ sessionApproved: true });
  const result = await provider.blindReceive({
    amount: 12,
    minConfirmations: 1,
  });
  assert.equal(result.minConfirmations, 3);
  assert.equal(result.invoice, 'rgb:invoice');
  assert.equal(calls[0].minConfirmations, 3);
  assert.equal(calls[0].assetId, undefined);
  assert.equal(prompts[0].origin, 'https://mint.example');
  assert.deepEqual(prompts[0].params, calls[0]);
});
test('refusal and disconnect while confirming cannot create an invoice', async () => {
  const declined = fixture({
    sessionApproved: true,
    confirm: async () => false,
  });
  await assert.rejects(declined.provider.blindReceive({ amount: 1 }), {
    code: 'USER_REJECTED',
  });
  assert.equal(declined.calls.length, 0);
  let approve;
  const revoked = fixture({
    sessionApproved: true,
    confirm: () =>
      new Promise((resolve) => {
        approve = resolve;
      }),
  });
  const pending = revoked.provider.blindReceive({ amount: 1 });
  revoked.provider.revoke();
  approve(true);
  await assert.rejects(pending, { code: 'NOT_ENABLED' });
  assert.equal(revoked.calls.length, 0);
});
test('reject invalid invoice arguments and unsafe amounts before invoking native code', async () => {
  const { provider, calls, prompts } = fixture({ sessionApproved: true });
  for (const amount of [
    0,
    -1,
    1.5,
    '1',
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await assert.rejects(provider.blindReceive({ amount }), {
      code: 'INVALID_PARAMS',
    });
  }
  await assert.rejects(provider.blindReceive(null), { code: 'INVALID_PARAMS' });
  await assert.rejects(provider.burnAsset({}), {
    code: 'METHOD_NOT_SUPPORTED',
  });
  assert.equal(calls.length, 0);
  assert.equal(prompts.length, 0);
});
test('transfer lookup refreshes native state and preserves unknown-ID semantics', async () => {
  const { provider, calls } = fixture({ sessionApproved: true });
  const result = await provider.getTransferStatus('utxob:receiver');
  assert.equal(result.status, 'Settled');
  assert.equal(result.transfer.amount, 10);
  assert.equal(calls[0], 'refresh');
  assert.deepEqual(await provider.getTransferStatus('missing'), {
    found: false,
    status: null,
    transfer: null,
  });
});
test('native asset errors map to WebRGB and unsafe balances are rejected', async () => {
  const { provider, wallet } = fixture({ sessionApproved: true });
  wallet.blindReceive = async () => {
    throw Object.assign(new Error('Missing asset'), { code: 'AssetNotFound' });
  };
  await assert.rejects(provider.blindReceive(), { code: 'ASSET_NOT_FOUND' });
  wallet.getAssetBalance = async () => ({
    spendable: Number.MAX_SAFE_INTEGER + 1,
  });
  await assert.rejects(provider.getAssetBalance('rgb:a'), {
    code: 'INTERNAL_ERROR',
  });
  assert.equal(provider.request, undefined);
});
