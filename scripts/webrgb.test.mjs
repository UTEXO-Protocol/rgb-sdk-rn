import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createWalletConnectProvider } from '@utexo/webrgb-walletconnect';
import {
  WebRgbProvider,
  WEBRGB_READ_METHODS,
} from '../lib/module/integrations/webrgb/index.js';

function fixture(options = {}) {
  const calls = [];
  const prompts = [];
  const receiveMethods = [];
  const wallet = {
    getNetwork: () => 'utexo',
    isDisposed: () => false,
    getAddress: async () => 'tb1qdemo',
    blindReceive: async (args) => {
      calls.push(args);
      receiveMethods.push('blindReceive');
      return {
        invoice: 'rgb:invoice',
        recipientId: 'utxob:receiver',
        expirationTimestamp: 1234,
      };
    },
    witnessReceive: async (args) => {
      calls.push(args);
      receiveMethods.push('witnessReceive');
      return {
        invoice: 'rgb:witness-invoice',
        recipientId: 'utxow:receiver',
        expirationTimestamp: 1234,
      };
    },
    signMessage: async (message) => {
      calls.push(message);
      return 'zbase32-signature';
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
  return { provider, calls, prompts, wallet, receiveMethods };
}

test('session must be approved; repeated enable does not prompt twice', async () => {
  const { provider, prompts } = fixture();
  await assert.rejects(provider.getInfo(), { code: 'NOT_ENABLED' });
  await Promise.all([provider.enable(), provider.enable()]);
  assert.equal(prompts.length, 1);
  const info = await provider.getInfo();
  assert.equal(info.network, 'utexo');
  assert.deepEqual(info.methods, [...WEBRGB_READ_METHODS, 'signMessage']);
  assert.ok(info.methods.includes('witnessReceive'));
  assert.ok(!info.methods.includes('burnAsset'));
});
for (const method of ['blindReceive', 'witnessReceive']) {
  test(`${method} is confirmed with the actual effective parameters`, async () => {
    const { provider, calls, prompts, receiveMethods } = fixture({
      sessionApproved: true,
    });
    const result = await provider[method]({
      amount: 12,
      minConfirmations: 1,
    });
    assert.equal(result.minConfirmations, 3);
    assert.equal(
      result.invoice,
      method === 'blindReceive' ? 'rgb:invoice' : 'rgb:witness-invoice'
    );
    assert.equal(
      result.recipientId,
      method === 'blindReceive' ? 'utxob:receiver' : 'utxow:receiver'
    );
    assert.equal(result.expirationTimestamp, 1234);
    assert.deepEqual(receiveMethods, [method]);
    assert.equal(calls[0].minConfirmations, 3);
    assert.equal(calls[0].assetId, undefined);
    assert.equal(prompts[0].origin, 'https://mint.example');
    assert.equal(prompts[0].method, method);
    assert.deepEqual(prompts[0].params, calls[0]);
  });
  test(`${method} refusal and disconnect cannot create an invoice`, async () => {
    const declined = fixture({
      sessionApproved: true,
      confirm: async () => false,
    });
    await assert.rejects(declined.provider[method]({ amount: 1 }), {
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
    const pending = revoked.provider[method]({ amount: 1 });
    revoked.provider.revoke();
    approve(true);
    await assert.rejects(pending, { code: 'NOT_ENABLED' });
    assert.equal(revoked.calls.length, 0);
  });
  test(`${method} rejects invalid arguments and unsafe amounts before invoking native code`, async () => {
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
      await assert.rejects(provider[method]({ amount }), {
        code: 'INVALID_PARAMS',
      });
    }
    await assert.rejects(provider[method](null), { code: 'INVALID_PARAMS' });
    await assert.rejects(provider.burnAsset({}), {
      code: 'METHOD_NOT_SUPPORTED',
    });
    assert.equal(calls.length, 0);
    assert.equal(prompts.length, 0);
  });
  test(`${method} defaults to any asset/amount and preserves a higher confirmation floor`, async () => {
    const { provider, calls, prompts } = fixture({
      sessionApproved: true,
      minConfirmations: 6,
    });
    const result = await provider[method]();
    assert.deepEqual(calls[0], {
      assetId: undefined,
      amount: undefined,
      durationSeconds: 3600,
      minConfirmations: 6,
    });
    assert.equal(result.minConfirmations, 6);
    assert.deepEqual(prompts[0].params, calls[0]);
  });
  test(`${method} maps native missing-asset errors`, async () => {
    const { provider, wallet } = fixture({ sessionApproved: true });
    wallet[method] = async () => {
      throw Object.assign(new Error('Missing asset'), {
        code: 'AssetNotFound',
      });
    };
    await assert.rejects(provider[method]({ assetId: 'rgb:missing' }), {
      code: 'ASSET_NOT_FOUND',
    });
  });
}

test('signMessage asks for consent on every call and signs the exact Unicode message', async () => {
  const { provider, calls, prompts } = fixture({ sessionApproved: true });
  const message = '  Вхід до mint.example 🔑\nnonce: 123\r\n';
  for (let i = 0; i < 2; i += 1) {
    assert.deepEqual(await provider.signMessage(message), {
      signature: 'zbase32-signature',
    });
  }
  assert.deepEqual(calls, [message, message]);
  assert.equal(prompts.length, 2);
  assert.deepEqual(prompts[0], {
    origin: 'https://mint.example',
    method: 'signMessage',
    params: { message },
  });
});

test('signMessage rejects malformed input and native failures use WebRGB errors', async () => {
  const { provider, calls, prompts, wallet } = fixture({
    sessionApproved: true,
  });
  for (const message of [null, undefined, 123, {}, [], '\ud800', '\udfff']) {
    await assert.rejects(provider.signMessage(message), {
      code: 'INVALID_PARAMS',
    });
  }
  assert.equal(calls.length, 0);
  assert.equal(prompts.length, 0);
  wallet.signMessage = async () => {
    throw new Error('Signer unavailable');
  };
  await assert.rejects(provider.signMessage('hello'), {
    code: 'INTERNAL_ERROR',
  });
});

test('signMessage requires an enabled session and explicit per-call approval', async () => {
  const disabled = fixture();
  await assert.rejects(disabled.provider.signMessage('hello'), {
    code: 'NOT_ENABLED',
  });
  assert.equal(disabled.prompts.length, 0);
  const declined = fixture({
    sessionApproved: true,
    confirm: async () => false,
  });
  await assert.rejects(declined.provider.signMessage('hello'), {
    code: 'USER_REJECTED',
  });
  assert.equal(declined.calls.length, 0);
});

for (const [method, args] of [
  ['witnessReceive', { amount: 1 }],
  ['signMessage', 'hello'],
]) {
  test(`${method} rechecks transport authorization after approval`, async () => {
    let authorized = true;
    const { provider, calls } = fixture({
      sessionApproved: true,
      assertAuthorized: () => {
        if (!authorized)
          throw Object.assign(new Error('Request expired'), {
            code: 'NOT_ENABLED',
          });
      },
      confirm: async () => {
        authorized = false;
        return true;
      },
    });
    await assert.rejects(provider[method](args), { code: 'NOT_ENABLED' });
    assert.equal(calls.length, 0);
  });
  test(`${method} rejects an old approval even if the session is re-enabled`, async () => {
    let approve;
    const { provider, calls } = fixture({
      sessionApproved: true,
      confirm: ({ method: approvalMethod }) =>
        approvalMethod === 'enable'
          ? Promise.resolve(true)
          : new Promise((resolve) => {
              approve = resolve;
            }),
    });
    const pending = provider[method](args);
    provider.revoke();
    await provider.enable();
    approve(true);
    await assert.rejects(pending, { code: 'NOT_ENABLED' });
    assert.equal(calls.length, 0);
  });
}

test('WalletConnect 0.1.2 forwards witnessReceive and signMessage to the RN provider', async () => {
  const { provider, calls, prompts } = fixture({ sessionApproved: true });
  const methods = ['enable', 'getInfo', 'witnessReceive', 'signMessage'];
  const session = {
    topic: 'test-session',
    expiry: Math.floor(Date.now() / 1000) + 3600,
    sessionProperties: { webrgb: 'webrgb:1' },
    namespaces: {
      rgb: {
        accounts: ['rgb:utexo:test-wallet'],
        methods: methods.map((method) => `rgb_${method}`),
        events: [],
      },
    },
  };
  const requests = [];
  const client = Object.assign(new EventEmitter(), {
    session: { get: () => session },
    request: async ({ topic, chainId, request }) => {
      assert.equal(topic, session.topic);
      assert.equal(chainId, 'rgb:utexo');
      requests.push(request);
      return provider[request.method.slice(4)](...request.params);
    },
  });
  const remote = createWalletConnectProvider({
    client,
    topic: session.topic,
    network: 'utexo',
  });
  try {
    await remote.enable();
    assert.deepEqual((await remote.getInfo()).methods, methods);
    const invoice = await remote.witnessReceive({ amount: 5 });
    assert.equal(invoice.invoice, 'rgb:witness-invoice');
    assert.deepEqual(await remote.signMessage('hello'), {
      signature: 'zbase32-signature',
    });
    assert.deepEqual(requests.slice(-2), [
      { method: 'rgb_witnessReceive', params: [{ amount: 5 }] },
      { method: 'rgb_signMessage', params: ['hello'] },
    ]);
    assert.equal(calls.length, 2);
    assert.deepEqual(
      prompts.map((prompt) => prompt.method),
      ['witnessReceive', 'signMessage']
    );
  } finally {
    remote.dispose();
  }
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
