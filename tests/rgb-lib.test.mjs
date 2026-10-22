import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SDKError } from '@utexo/rgb-sdk-core';
import { WalletBackendError } from '../lib/module/wallet/wallet-errors.js';
import { RgbLibWallet } from '../lib/module/wallet/rgb-lib/rgb-lib-wallet.js';
import {
  restoreRgbLibBackup,
  restoreRgbLibBackupWith,
} from '../lib/module/wallet/rgb-lib/restore.js';
import { UTEXOWallet } from '../lib/module/wallet/utexo-wallet.js';
import {
  RGB_LIB_VERSION,
  RGB_LIB_REVISION,
  RGB_LIB_BRIDGE_VERSION,
  resolveRgbLibConfig,
  configEquals,
} from '../lib/module/wallet/rgb-lib/config.js';
import * as amounts from '../lib/module/wallet/rgb-lib/amounts.js';
import * as map from '../lib/module/wallet/rgb-lib/mappers.js';
import { WebRgbProvider } from '../lib/module/integrations/webrgb/provider.js';

const params = { network: 'regtest', storageDirPath: '/wallets/rgb-lib/test' };
const config = {
  indexerUrl: 'http://localhost:3000',
  proxyEndpoint: 'http://localhost:3001/json-rpc',
};
const runtime = {
  version: RGB_LIB_VERSION,
  sourceRevision: RGB_LIB_REVISION,
  bridgeVersion: RGB_LIB_BRIDGE_VERSION,
  burn: true,
  consignment: true,
  bfa: true,
};
const code = (expected) => (error) => {
  assert.equal(error.code, expected);
  return true;
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
function fixture(overrides = {}) {
  const calls = [];
  const native = {
    async getRuntimeInfo() {
      calls.push('runtime');
      return runtime;
    },
    async openWallet(...args) {
      calls.push(['open', ...args]);
      return 'handle-1';
    },
    async closeWallet(h) {
      calls.push(['close', h]);
    },
    async getWalletIdentity() {
      return {
        id: 'identity',
        network: 'regtest',
        masterFingerprint: 'abc12345',
      };
    },
    async goOnline(...args) {
      calls.push(['online', ...args]);
    },
    async getAddress() {
      calls.push('address');
      return 'address';
    },
    async listAssets() {
      return [];
    },
    async sendBtc(...args) {
      calls.push(['btc', ...args]);
      return 'txid';
    },
    async createUtxos() {
      return 3;
    },
    async send(...args) {
      calls.push(['send', ...args]);
      return {
        txid: 'txid',
        batchTransferIdx: 17,
        entropy: '18446744073709551615',
      };
    },
    async refresh() {
      return [
        {
          batchTransferIdx: 17,
          updatedStatus: 'WaitingSafeHeight',
          failure: null,
        },
      ];
    },
    async issueAssetNia(...args) {
      calls.push(['issueNia', ...args]);
      throw new Error('unexpected issuance');
    },
    async issueAssetIfa(...args) {
      calls.push(['issueIfa', ...args]);
      throw new Error('unexpected issuance');
    },
    async burn(...args) {
      calls.push(['burn', ...args]);
      return { txid: 'burn-txid', batchTransferIdx: 21 };
    },
    async getConsignment(...args) {
      calls.push(['consignment', ...args]);
      return 'consignment-bytes';
    },
    async getConsignmentPath(...args) {
      calls.push(['consignmentPath', ...args]);
      return '/wallets/consignment.rgb';
    },
    async backup(...args) {
      calls.push(['backup', ...args]);
    },
    async restoreBackup(...args) {
      calls.push(['restore', ...args]);
    },
    ...overrides,
  };
  const keys = {
    async getMnemonic() {
      calls.push('keys');
      return 'test mnemonic';
    },
  };
  const wallet = new RgbLibWallet(params, keys, () => native);
  return { wallet, native, calls, keys };
}

function publicWalletFixture(overrides = {}, walletParams = params) {
  const f = fixture(overrides);
  const wallet = new UTEXOWallet({
    protocol: 'RGB_L1',
    params: walletParams,
    keys: f.keys,
  });
  // Replace only the native transport; exercise the real public facade and backend.
  wallet.engine.ports.loadBinding = () => f.native;
  return { ...f, wallet };
}

test('wallet configuration errors use SDKError and only report a known protocol', () => {
  for (const [args, protocol] of [
    [[null], undefined],
    [[{ protocol: 'unknown' }], undefined],
    [[params], 'RGB_LN'],
    [[{ protocol: 'RGB_L1', params, keys: {}, signer: {} }], 'RGB_L1'],
  ]) {
    assert.throws(
      () => new UTEXOWallet(...args),
      (error) => {
        assert.ok(error instanceof SDKError);
        assert.ok(error instanceof WalletBackendError);
        assert.equal(error.code, 'INVALID_CONFIG');
        assert.equal(error.protocol, protocol);
        assert.equal('backend' in error, false);
        return true;
      }
    );
  }
});
test('native failures preserve the SDK error contract, protocol, operation and cause', async () => {
  const cause = Object.assign(new Error('Invalid invoice'), {
    code: 'RGB_LIB_InvalidInvoice',
  });
  const { wallet } = publicWalletFixture({
    async getAddress() {
      throw cause;
    },
  });
  await wallet.init();
  await assert.rejects(wallet.getAddress(), (error) => {
    assert.ok(error instanceof SDKError);
    assert.ok(error instanceof WalletBackendError);
    assert.equal(error.code, 'INVALID_PARAMS');
    assert.equal(error.protocol, 'RGB_L1');
    assert.equal(error.operation, 'getAddress');
    assert.equal(error.cause, cause);
    return true;
  });
  await assert.rejects(wallet.listChannels(), (error) => {
    assert.ok(error instanceof SDKError);
    assert.equal(error.code, 'UNSUPPORTED_CAPABILITY');
    assert.equal(error.protocol, 'RGB_L1');
    return true;
  });
  await wallet.dispose();
});

test('native pins agree with the UniFFI artifact manifest', () => {
  const manifest = JSON.parse(
    fs.readFileSync(
      new URL('../src/bindings/rgb-lib/manifest.json', import.meta.url)
    )
  );
  assert.equal(manifest.version, RGB_LIB_VERSION);
  assert.equal(manifest.sourceRevision, RGB_LIB_REVISION);
  assert.equal(manifest.bridgeVersion, RGB_LIB_BRIDGE_VERSION);
});
test('network info omits block height when the UniFFI API does not expose it', async () => {
  const { wallet } = fixture({
    async getNetworkInfo() {
      return { network: 'regtest', blockHeight: null };
    },
  });
  await wallet.init();
  await wallet.unlock(config);
  assert.deepEqual(await wallet.getNetworkInfo(), { network: 'regtest' });
  await wallet.dispose();
});
test('native chain selection preserves public network names across open and reopen', async () => {
  for (const [network, nativeNetwork] of [
    ['utexo', 'signet'],
    ['signet', 'signet'],
    ['mainnet', 'mainnet'],
    ['testnet', 'testnet'],
    ['testnet4', 'testnet4'],
    ['regtest', 'regtest'],
  ]) {
    const { wallet, calls } = publicWalletFixture(
      {
        async getWalletIdentity() {
          return {
            id: 'identity',
            network: nativeNetwork,
            masterFingerprint: 'abc12345',
          };
        },
        async getNetworkInfo() {
          return { network: nativeNetwork, blockHeight: null };
        },
      },
      { ...params, network }
    );
    await wallet.init();
    await wallet.goOnline(config);
    assert.equal(
      calls.find((c) => Array.isArray(c) && c[0] === 'open')[2],
      nativeNetwork
    );
    assert.equal(wallet.getNetwork(), network);
    assert.deepEqual(await wallet.getNetworkInfo(), { network });
    assert.deepEqual(await wallet.getWalletIdentity(), {
      id: 'identity',
      network,
      protocol: 'RGB_L1',
    });
    const provider = new WebRgbProvider(wallet, {
      origin: 'https://example.com',
      sessionApproved: true,
      confirm: async () => true,
    });
    assert.equal((await provider.getInfo()).network, network);
    await wallet.shutdown();
    await wallet.reinit(config);
    assert.deepEqual(
      calls.filter((c) => Array.isArray(c) && c[0] === 'open').map((c) => c[2]),
      [nativeNetwork, nativeNetwork]
    );
    await wallet.dispose();
  }
});
test('utexo rejects a custom-signet native identity instead of treating it as standard signet', async () => {
  const { wallet, calls } = publicWalletFixture(
    {
      async getWalletIdentity() {
        return {
          id: 'custom-signet',
          network: 'utexo',
          masterFingerprint: 'abc12345',
        };
      },
    },
    { ...params, network: 'utexo' }
  );
  await assert.rejects(wallet.init(), code('WALLET_CONFIG_MISMATCH'));
  assert.equal(
    calls.find((c) => Array.isArray(c) && c[0] === 'open')[2],
    'signet'
  );
  assert.deepEqual(
    calls.filter((c) => Array.isArray(c) && c[0] === 'close'),
    [['close', 'handle-1']]
  );
  await assert.rejects(
    wallet.getWalletIdentity(),
    code('WALLET_NOT_INITIALIZED')
  );
  await wallet.dispose();
});
test('options constructor preserves the legacy constructor and does not read credentials before init', () => {
  let reads = 0;
  const keys = {
    async getMnemonic() {
      reads++;
      return 'unused';
    },
  };
  const rgb = new UTEXOWallet({ protocol: 'RGB_L1', params, keys });
  assert.ok(rgb instanceof UTEXOWallet);
  assert.equal(rgb.protocol, 'RGB_L1');
  assert.equal(reads, 0);
  const rln = new UTEXOWallet({ protocol: 'RGB_LN', params, signer: {} });
  assert.ok(rln instanceof UTEXOWallet);
  assert.equal(rln.protocol, 'RGB_LN');
  assert.throws(
    () => new UTEXOWallet({ protocol: 'RGB_L1', params, keys, signer: {} }),
    code('INVALID_CONFIG')
  );
  assert.throws(
    () => new UTEXOWallet({ protocol: 'other', params }),
    code('INVALID_CONFIG')
  );
});
test('legacy construction preserves signer lifecycle, method overrides and prototype calls', async () => {
  const calls = [];
  const signer = {
    async initNode(manager, storage) {
      calls.push(['init', manager, storage]);
    },
    async unlockNode(manager, options, storage) {
      calls.push(['unlock', manager, options, storage]);
    },
    async dispose(manager) {
      calls.push(['dispose', manager]);
    },
  };
  class AppWallet extends UTEXOWallet {
    async getAddress() {
      return 'app:' + (await super.getAddress());
    }
  }
  const original = {
    ...params,
    daemonListeningPort: 9735,
    ldkPeerListeningPort: 9736,
  };
  const wallet = new AppWallet(original, signer);
  const manager = wallet.engine.rln;
  manager.rlnCreateNode = async (p) => {
    calls.push(['create', p]);
  };
  manager.rlnAddress = async () => ({ address: 'btc-address' });
  manager.rlnShutdown = async () => {
    calls.push(['shutdown']);
  };
  manager.rlnDestroyNode = async () => {
    calls.push(['destroy']);
  };
  original.storageDirPath = '/changed';
  original.network = 'mainnet';
  assert.ok(wallet instanceof UTEXOWallet);
  assert.equal(wallet.protocol, 'RGB_LN');
  assert.equal(calls.length, 0);
  await wallet.init();
  await wallet.unlock({ indexerUrl: 'tcp://localhost:50001' });
  assert.equal(calls[0][1].storageDirPath, params.storageDirPath);
  assert.deepEqual(calls[1], ['init', manager, params.storageDirPath]);
  assert.equal(calls[2][0], 'unlock');
  assert.equal(calls[2][1], manager);
  assert.equal(calls[2][2].indexerUrl, 'tcp://localhost:50001');
  assert.equal(calls[2][3], params.storageDirPath);
  assert.equal(wallet.getNetwork(), 'regtest');
  assert.equal(await wallet.getAddress(), 'app:btc-address');
  assert.equal(
    await UTEXOWallet.prototype.getAddress.call(wallet),
    'btc-address'
  );
  await wallet.dispose();
  assert.equal(wallet.isDisposed(), true);
  assert.deepEqual(calls.slice(-3), [
    ['shutdown'],
    ['destroy'],
    ['dispose', manager],
  ]);
});
test('public rgb-lib constructor owns only its on-chain session through reopen and dispose', async () => {
  const { wallet, calls } = publicWalletFixture();
  assert.ok(wallet instanceof UTEXOWallet);
  assert.equal(wallet.protocol, 'RGB_L1');
  assert.equal(wallet.engine.rln, undefined);
  assert.deepEqual(calls, []);
  await wallet.init();
  await wallet.init();
  await wallet.unlock(config);
  assert.equal((await wallet.getWalletIdentity()).id, 'identity');
  assert.equal(await wallet.getAddress(), 'address');
  assert.deepEqual(await wallet.listAssets(), {
    nia: [],
    uda: [],
    cfa: [],
    ifa: [],
    bfa: [],
  });
  assert.equal(
    await wallet.sendBtc({ address: 'btc-recipient', amount: 123, feeRate: 1 }),
    'txid'
  );
  assert.equal(calls.filter((c) => c === 'keys').length, 1);
  assert.equal(
    calls.filter((c) => Array.isArray(c) && c[0] === 'open').length,
    1
  );
  await wallet.shutdown();
  await wallet.reinit(config);
  assert.equal(calls.filter((c) => c === 'keys').length, 2);
  assert.equal(await wallet.getAddress(), 'address');
  await wallet.dispose();
  assert.equal(wallet.isDisposed(), true);
  assert.equal(
    calls.filter((c) => Array.isArray(c) && c[0] === 'close').length,
    2
  );
  await assert.rejects(wallet.getAddress(), code('WALLET_DISPOSED'));
});
test('goOnline and unlock share one connection and enforce the same lifecycle', async () => {
  const gate = deferred();
  let connections = 0;
  const { wallet } = publicWalletFixture({
    async goOnline() {
      connections++;
      await gate.promise;
    },
  });
  const online = {
    indexer: { type: 'electrum', url: 'tcp://localhost:50001' },
    proxyEndpoint: config.proxyEndpoint,
  };
  await assert.rejects(wallet.goOnline(online), code('WALLET_NOT_INITIALIZED'));
  await wallet.init();
  const connecting = wallet.goOnline(online);
  const unlocking = wallet.unlock({ ...online });
  await assert.rejects(
    wallet.goOnline({ ...online, proxyEndpoint: 'http://localhost:3002' }),
    code('WALLET_CONFIG_MISMATCH')
  );
  gate.resolve();
  await Promise.all([connecting, unlocking]);
  await wallet.goOnline(online);
  assert.equal(connections, 1);
  assert.equal(await wallet.sendBtc({ address: 'btc', amount: 1 }), 'txid');
  await wallet.shutdown();
  await wallet.init();
  await wallet.goOnline(online);
  assert.equal(connections, 2);
  await wallet.dispose();
  await assert.rejects(wallet.goOnline(online), code('WALLET_DISPOSED'));
});
test('goOnline preserves subclass unlock overrides and allows retry after connection failure', async () => {
  let connections = 0;
  const f = fixture({
    async goOnline() {
      if (++connections === 1) throw new Error('indexer unavailable');
    },
  });
  const seen = [];
  class AppWallet extends UTEXOWallet {
    unlock(options) {
      seen.push(options);
      return super.unlock(options);
    }
  }
  const wallet = new AppWallet({ protocol: 'RGB_L1', params, keys: f.keys });
  wallet.engine.ports.loadBinding = () => f.native;
  await wallet.init();
  await assert.rejects(wallet.goOnline(config), /indexer unavailable/);
  await assert.rejects(
    wallet.sendBtc({ address: 'btc', amount: 1 }),
    code('WALLET_OFFLINE')
  );
  await wallet.goOnline(config);
  assert.deepEqual(seen, [config, config]);
  assert.equal(connections, 2);
  await wallet.dispose();
});
test('goOnline rejects RLN usage before invoking any unlock override', async () => {
  const wallet = new UTEXOWallet(params, {});
  let unlocks = 0;
  wallet.unlock = async () => {
    unlocks++;
  };
  await assert.rejects(wallet.goOnline(config), (error) => {
    assert.ok(error instanceof SDKError);
    assert.equal(error.code, 'UNSUPPORTED_CAPABILITY');
    assert.equal(error.protocol, 'RGB_LN');
    assert.equal(error.operation, 'goOnline');
    return true;
  });
  assert.equal(unlocks, 0);
});
test('rgb-lib mode rejects RLN-only calls from JavaScript and does not advertise signing', async () => {
  const { wallet, calls } = publicWalletFixture();
  for (const [method, args] of [
    ['createLightningInvoice', [{ amountSats: 1 }]],
    ['openChannel', [{}]],
    ['getNodeInfo', []],
    ['backupNow', []],
    ['signMessage', ['message']],
    ['verifyMessage', ['message', 'signature']],
    ['createLsp', []],
    ['checkProxyEndpoint', ['https://example.com']],
  ]) {
    await assert.rejects(
      wallet[method](...args),
      code('UNSUPPORTED_CAPABILITY')
    );
  }
  assert.throws(() => wallet.getLspConfig(), code('UNSUPPORTED_CAPABILITY'));
  assert.deepEqual(calls, []);
  const provider = new WebRgbProvider(wallet, {
    origin: 'https://example.com',
    sessionApproved: true,
    confirm: async () => true,
  });
  const info = await provider.getInfo();
  assert.equal(info.protocol, 'RGB_L1');
  assert.ok(!info.methods.includes('signMessage'));
  await assert.rejects(
    provider.signMessage('message'),
    (e) => e.code === 'METHOD_NOT_SUPPORTED'
  );
  await wallet.dispose();
});
test('constructor rejects mixed backend credentials and missing RLN signer', () => {
  const keys = { getMnemonic: async () => 'unused' };
  for (const args of [
    [params],
    [{ protocol: 'RGB_L1', params, keys }, {}],
    [{ protocol: 'RGB_L1', params, keys, signer: {} }],
    [{ protocol: 'RGB_LN', params, keys, signer: {} }],
    [{ protocol: 'other', params, keys }],
    [{ protocol: 'RGB_L1', params }],
    [{ backend: 'rgb-lib', params, keys }],
    [{ protocol: 'RGB_L1', backend: 'rln', params, keys }],
    [{ protocol: 'rgb-lib', params, keys }],
  ])
    assert.throws(() => new UTEXOWallet(...args), code('INVALID_CONFIG'));
});
test('protocol is immutable and WebRGB reports the same mode for either constructor', async () => {
  let reads = 0;
  const options = {
    protocol: 'RGB_L1',
    params,
    keys: {
      getMnemonic: async () => {
        reads++;
        return 'unused';
      },
    },
  };
  const rgb = new UTEXOWallet(options);
  const legacy = new UTEXOWallet(params, {});
  options.protocol = 'RGB_LN';
  for (const [wallet, expected] of [
    [rgb, 'RGB_L1'],
    [legacy, 'RGB_LN'],
  ]) {
    assert.equal(wallet.protocol, expected);
    assert.equal('backend' in wallet, false);
    assert.throws(() => {
      wallet.protocol = 'other';
    }, TypeError);
    const provider = new WebRgbProvider(wallet, {
      origin: 'https://example.com',
      sessionApproved: true,
      confirm: async () => true,
    });
    const info = await provider.getInfo();
    assert.equal(info.protocol, wallet.protocol);
    assert.equal(info.methods.includes('signMessage'), expected === 'RGB_LN');
  }
  assert.equal(reads, 0);
});
test('missing native artifacts fail explicitly without loading key material', async () => {
  let reads = 0;
  const w = new UTEXOWallet({
    protocol: 'RGB_L1',
    params,
    keys: {
      async getMnemonic() {
        reads++;
        return 'unused';
      },
    },
  });
  await assert.rejects(w.init(), code('NATIVE_BACKEND_UNAVAILABLE'));
  assert.equal(reads, 0);
});
test('init joins concurrent requests and validates artifacts before reading keys', async () => {
  const { wallet, calls } = fixture();
  await Promise.all([wallet.init(), wallet.initialize(), wallet.init()]);
  assert.equal(calls.filter((c) => c === 'keys').length, 1);
  assert.equal(
    calls.filter((c) => Array.isArray(c) && c[0] === 'open').length,
    1
  );
  assert.deepEqual(await wallet.getWalletIdentity(), {
    id: 'identity',
    protocol: 'RGB_L1',
    network: 'regtest',
  });
  const mismatch = fixture({
    async getRuntimeInfo() {
      return { ...runtime, bridgeVersion: 99 };
    },
  });
  await assert.rejects(mismatch.wallet.init(), code('NATIVE_VERSION_MISMATCH'));
  assert.deepEqual(mismatch.calls, []);
});
test('online methods reject before unlock; matching config is idempotent and changes require restart', async () => {
  const { wallet, calls } = fixture();
  await assert.rejects(wallet.getAddress(), code('WALLET_NOT_INITIALIZED'));
  await wallet.init();
  await assert.rejects(
    wallet.sendBtc({ address: 'btc', amount: 1 }),
    code('WALLET_OFFLINE')
  );
  await Promise.all([wallet.unlock(config), wallet.unlock({ ...config })]);
  await wallet.unlock(config);
  assert.equal(
    calls.filter((c) => Array.isArray(c) && c[0] === 'online').length,
    1
  );
  await assert.rejects(
    wallet.unlock({ ...config, indexerUrl: 'http://localhost:3002' }),
    code('WALLET_CONFIG_MISMATCH')
  );
});
test('shutdown waits for accepted operations, rejects later work, and supports reopening', async () => {
  const gate = deferred(),
    started = deferred();
  const { wallet, calls } = fixture({
    async getAddress() {
      started.resolve();
      await gate.promise;
      return 'address';
    },
  });
  await wallet.init();
  const read = wallet.getAddress();
  await started.promise;
  const close = wallet.shutdown();
  await assert.rejects(wallet.getAddress(), code('WALLET_STOPPING'));
  assert.ok(!calls.some((c) => Array.isArray(c) && c[0] === 'close'));
  gate.resolve();
  assert.equal(await read, 'address');
  await close;
  assert.equal(wallet.isDisposed(), false);
  await wallet.reinit(config);
  assert.equal(
    calls.filter((c) => Array.isArray(c) && c[0] === 'open').length,
    2
  );
});
test('dispose during init drains the created handle exactly once and permanently closes the facade', async () => {
  const gate = deferred(),
    started = deferred();
  const { wallet, calls } = fixture({
    async openWallet() {
      started.resolve();
      await gate.promise;
      return 'handle-1';
    },
  });
  const opening = wallet.init();
  await started.promise;
  const disposing = wallet.dispose();
  const duplicate = wallet.destroy();
  await assert.rejects(wallet.init(), code('WALLET_DISPOSED'));
  gate.resolve();
  await Promise.all([opening, disposing, duplicate]);
  assert.equal(
    calls.filter((c) => Array.isArray(c) && c[0] === 'close').length,
    1
  );
  assert.equal(wallet.isDisposed(), true);
  await assert.rejects(wallet.reinit(), code('WALLET_DISPOSED'));
});
test('failed cleanup retains ownership and blocks operations until cleanup succeeds', async () => {
  let attempts = 0;
  const { wallet } = fixture({
    async closeWallet() {
      if (++attempts === 1) throw new Error('close failed');
    },
  });
  await wallet.init();
  await assert.rejects(wallet.shutdown(), /close failed/);
  await assert.rejects(wallet.getAddress(), code('WALLET_STOPPING'));
  await wallet.shutdown();
  await wallet.init();
  await wallet.dispose();
  assert.equal(attempts, 3);
});
test('a close retry that finds the handle already released by native completes cleanup', async () => {
  // Mirrors RgbLibSessionStore.kt: the handle is unregistered even when close fails.
  let attempts = 0;
  const { wallet } = fixture({
    async closeWallet() {
      if (++attempts === 1) throw new Error('close failed');
      throw {
        code: 'WALLET_NOT_INITIALIZED',
        message: 'Unknown or closed wallet',
      };
    },
  });
  await wallet.init();
  await assert.rejects(wallet.dispose(), /close failed/);
  await wallet.dispose();
  assert.equal(wallet.isDisposed(), true);
  assert.equal(attempts, 2);
});
test('failed native calls do not poison the queue or cause transaction retries', async () => {
  let sends = 0;
  const { wallet } = fixture({
    async sendBtc() {
      sends++;
      throw new Error('ambiguous broadcast');
    },
  });
  await wallet.init();
  await wallet.unlock(config);
  await assert.rejects(
    wallet.sendBtc({ address: 'btc', amount: 1 }),
    /ambiguous broadcast/
  );
  assert.equal(await wallet.getAddress(), 'address');
  assert.equal(sends, 1);
});
test('init preserves its validation error when native already released the failed handle', async () => {
  let invalidIdentity = true;
  const { wallet, calls } = fixture({
    async getWalletIdentity() {
      return {
        id: 'identity',
        network: invalidIdentity ? 'signet' : 'regtest',
      };
    },
    async closeWallet() {
      throw {
        code: 'WALLET_NOT_INITIALIZED',
        message: 'Unknown or closed wallet',
      };
    },
  });
  await assert.rejects(wallet.init(), code('WALLET_CONFIG_MISMATCH'));
  invalidIdentity = false;
  await wallet.init();
  assert.equal(
    calls.filter((c) => Array.isArray(c) && c[0] === 'open').length,
    2
  );
  assert.equal(await wallet.getAddress(), 'address');
  await wallet.dispose();
  assert.equal(wallet.isDisposed(), true);
});
test('queued transactions own their input even when the caller mutates the original object', async () => {
  const gate = deferred(),
    started = deferred();
  const { wallet, calls } = fixture({
    async getAddress() {
      started.resolve();
      await gate.promise;
      return 'address';
    },
  });
  await wallet.init();
  await wallet.unlock(config);
  const read = wallet.getAddress();
  await started.promise;
  const request = {
    invoice: 'original',
    amount: 7,
    witnessData: { amountSat: 1000 },
  };
  const send = wallet.onchainSend(request);
  request.amount = 99;
  request.invoice = 'changed';
  request.witnessData.amountSat = 99999;
  gate.resolve();
  await Promise.all([read, send]);
  const sent = calls.find((c) => Array.isArray(c) && c[0] === 'send');
  assert.equal(sent[2], 'original');
  assert.equal(sent[4], '7');
  assert.equal(sent[5], '1000');
});
test('identity validation cleans up a handle and allows init to be retried', async () => {
  let reads = 0;
  const { wallet, calls } = fixture({
    async getWalletIdentity() {
      return { id: 'id', network: ++reads === 1 ? 'mainnet' : 'regtest' };
    },
  });
  await assert.rejects(wallet.init(), code('WALLET_CONFIG_MISMATCH'));
  assert.equal(
    calls.filter((c) => Array.isArray(c) && c[0] === 'close').length,
    1
  );
  await wallet.init();
});
test('native operation results and full invoice reach the public API unchanged', async () => {
  const { wallet, calls } = fixture();
  await wallet.init();
  await wallet.unlock(config);
  assert.equal(await wallet.createUtxos({ num: 5 }), 3);
  const invoice = 'rgb:full-invoice?pk=preserved&enc=required&expiry=123';
  const result = await wallet.onchainSend({ invoice, amount: 7, feeRate: 2 });
  assert.deepEqual(result, {
    txid: 'txid',
    batchTransferIdx: 17,
    entropy: '18446744073709551615',
  });
  const sent = calls.find((c) => Array.isArray(c) && c[0] === 'send');
  assert.equal(sent[2], invoice);
  assert.equal(sent[4], '7');
  assert.equal(sent.at(-1), 'rpc://localhost:3001/json-rpc');
  assert.equal(
    (await wallet.refreshTransfers()).transfers[17].updatedStatus,
    'WaitingSafeHeight'
  );
});
test('native rejections reach callers only as SDK errors and map to WebRGB codes', async () => {
  const reject = (nativeCode, message) => async () => {
    throw Object.assign(new Error(message), { code: nativeCode });
  };
  const { wallet } = fixture({
    getAssetBalance: reject('RGB_LIB_AssetNotFound', 'Asset not found'),
    decodeInvoice: reject('RGB_LIB_InvalidInvoice', 'Invalid invoice'),
    listTransfers: reject('WALLET_PROFILE_MISMATCH', 'Profile mismatch'),
    listAssets: reject('NATIVE_BRIDGE_ERROR', 'RGB Lib native bridge failed'),
    sendBtc: reject('RGB_LIB_InsufficientBitcoins', 'Not enough sats'),
  });
  await wallet.init();
  await wallet.unlock(config);
  const sdk = (expected, operation) => (error) => {
    assert.equal(error.name, 'WalletBackendError');
    assert.equal(error.code, expected);
    assert.equal(error.operation, operation);
    return true;
  };
  await assert.rejects(
    wallet.getAssetBalance('rgb:unknown'),
    sdk('ASSET_NOT_FOUND', 'getAssetBalance')
  );
  await assert.rejects(
    wallet.decodeRGBInvoice({ invoice: 'rgb:malformed' }),
    sdk('INVALID_PARAMS', 'decodeInvoice')
  );
  await assert.rejects(
    wallet.listTransfers(),
    sdk('WALLET_PROFILE_MISMATCH', 'listTransfers')
  );
  await assert.rejects(wallet.listAssets(), sdk('NATIVE_ERROR', 'listAssets'));
  await assert.rejects(
    wallet.sendBtc({ address: 'btc', amount: 1 }),
    sdk('INSUFFICIENT_FUNDS', 'sendBtc')
  );
  const provider = new WebRgbProvider(wallet, {
    origin: 'https://example.com',
    sessionApproved: true,
    confirm: async () => true,
  });
  await provider.enable();
  await assert.rejects(
    provider.getAssetBalance('rgb:unknown'),
    code('ASSET_NOT_FOUND')
  );
  await assert.rejects(
    provider.decodeRgbInvoice('rgb:malformed'),
    code('INVALID_PARAMS')
  );
  await wallet.dispose();
});
test('init and restore translate native rejections without changing key-provider errors', async () => {
  const opening = fixture({
    async openWallet() {
      throw Object.assign(new Error('Storage busy'), {
        code: 'WALLET_STORAGE_IN_USE',
      });
    },
  });
  await assert.rejects(opening.wallet.init(), code('WALLET_STORAGE_IN_USE'));
  const keyError = new Error('keychain locked');
  const locked = fixture();
  locked.keys.getMnemonic = async () => {
    throw keyError;
  };
  await assert.rejects(locked.wallet.init(), (error) => error === keyError);
  await assert.rejects(
    restoreRgbLibBackupWith(
      {
        backupPath: '/backups/a.rgb',
        password: 'pw',
        storageDirPath: '/wallets/restored',
      },
      () => ({
        getRuntimeInfo: async () => runtime,
        restoreBackup: async () => {
          throw Object.assign(new Error('Wrong password'), {
            code: 'RGB_LIB_WrongPassword',
          });
        },
      })
    ),
    (error) =>
      error.name === 'WalletBackendError' && error.code === 'NATIVE_ERROR'
  );
});
test('refresh failures use the cross-platform RGB_LIB_<Variant> name', async () => {
  let failure = {
    name: 'RGB_LIB_InsufficientAssignments',
    message: 'Insufficient assignments',
  };
  const { wallet } = fixture({
    async refresh() {
      return [
        { batchTransferIdx: 4, updatedStatus: 'Failed', failure },
        { batchTransferIdx: 5, updatedStatus: null, failure: null },
      ];
    },
  });
  await wallet.init();
  await wallet.unlock(config);
  const { transfers } = await wallet.refreshTransfers();
  assert.deepEqual(transfers[4].failure, {
    name: 'RGB_LIB_InsufficientAssignments',
    message: 'Insufficient assignments',
  });
  assert.equal(transfers[5].failure, undefined);
  // The pre-fix iOS shape lost the variant; it must not reach callers.
  for (const name of ['RgbLibError', 'RGB_LIB_', 'InsufficientAssignments']) {
    failure = { name, message: 'x' };
    await assert.rejects(
      wallet.refreshTransfers(),
      code('INVALID_NATIVE_RESPONSE')
    );
  }
});
test('receive converts durationSeconds to absolute Unix seconds and uses the proxy endpoint', async () => {
  const received = [];
  const { wallet } = fixture({
    async receive(...args) {
      received.push(args);
      return {
        invoice: 'rgb:invoice',
        recipientId: 'recipient',
        expirationTimestamp: args[4],
        batchTransferIdx: 9,
        publicKey: 'pk',
      };
    },
  });
  await wallet.init();
  await wallet.unlock(config);
  const realNow = Date.now;
  Date.now = () => 1_700_000_000_999;
  try {
    const blind = await wallet.blindReceive({
      assetId: 'rgb:asset',
      amount: 9,
      durationSeconds: 60,
      minConfirmations: 2,
    });
    await wallet.witnessReceive({});
    await wallet.onchainReceive({ durationSeconds: 1 });
    await wallet.onchainReceive({ witness: false });
    assert.deepEqual(blind, {
      invoice: 'rgb:invoice',
      recipientId: 'recipient',
      expirationTimestamp: 1_700_000_060,
      batchTransferIdx: 9,
      publicKey: 'pk',
    });
  } finally {
    Date.now = realNow;
  }
  const endpoints = [config.proxyEndpoint.replace('http:', 'rpc:')];
  assert.deepEqual(received, [
    ['handle-1', false, 'rgb:asset', '9', '1700000060', endpoints, 2],
    ['handle-1', true, null, null, '1700086400', endpoints, 0],
    ['handle-1', true, null, null, '1700000001', endpoints, 0],
    ['handle-1', false, null, null, '1700086400', endpoints, 0],
  ]);
  for (const durationSeconds of [0, 1.5, -1, 2 ** 32]) {
    await assert.rejects(wallet.witnessReceive({ durationSeconds }));
  }
  assert.equal(received.length, 4);
});
test('fee rates and amounts reject lossy inputs instead of silently rounding', () => {
  assert.equal(
    amounts.u64(18446744073709551615n, 'amount'),
    '18446744073709551615'
  );
  assert.throws(
    () => amounts.u64(Number.MAX_SAFE_INTEGER + 1, 'amount'),
    code('INVALID_AMOUNT')
  );
  assert.throws(
    () => amounts.u64('18446744073709551616', 'amount'),
    code('INVALID_AMOUNT')
  );
  assert.throws(() => amounts.u64('-1', 'amount'), code('INVALID_AMOUNT'));
  assert.throws(() => amounts.feeRate(1.5), code('FEE_RATE_UNSUPPORTED'));
  assert.throws(
    () =>
      map.balance({ settled: '9007199254740993', future: '0', spendable: '0' }),
    code('AMOUNT_OVERFLOW')
  );
});
test('history preserves new statuses, mint rights, exact amounts and real batch IDs', () => {
  const transfer = map.transfer({
    idx: 4,
    batchTransferIdx: 19,
    createdAt: '100',
    updatedAt: '101',
    status: 'WaitingBroadcast',
    requestedAssignment: null,
    assignments: [
      { type: 'Fungible', amount: '9007199254740993' },
      { type: 'MintRight', amount: null },
    ],
    kind: 'Mint',
    txid: 'txid',
    recipientId: null,
    receiveUtxo: null,
    changeUtxo: null,
    expiration: null,
    transportEndpoints: [],
    invoiceString: null,
    consignmentPath: null,
  });
  assert.equal(transfer.batchTransferIdx, 19);
  assert.equal(transfer.amount, undefined);
  assert.equal(transfer.amountBaseUnits, '9007199254740993');
  assert.equal(transfer.assignments[1].type, 'MintRight');
  assert.throws(
    () => map.transferStatus('new-unknown-status'),
    code('INVALID_NATIVE_RESPONSE')
  );
});
test('configuration normalizes transport URLs and compares auth independently of property order', () => {
  const a = resolveRgbLibConfig({
    ...config,
    indexerUrl: undefined,
    indexer: {
      type: 'bitcoind',
      url: 'http://localhost',
      auth: { username: 'user', password: 'pass' },
    },
  });
  const b = resolveRgbLibConfig({
    ...config,
    indexerUrl: undefined,
    indexer: {
      auth: { password: 'pass', username: 'user' },
      url: 'http://localhost',
      type: 'bitcoind',
    },
  });
  assert.ok(configEquals(a, b));
  assert.equal(a.proxyEndpoint, 'rpc://localhost:3001/json-rpc');
  assert.throws(
    () =>
      resolveRgbLibConfig({
        ...config,
        indexer: { type: 'electrum', url: 'ssl://host:50002' },
      }),
    code('INVALID_CONFIG')
  );
});
test('transport validation works without a browser URL implementation on React Native', () => {
  const original = globalThis.URL;
  try {
    globalThis.URL = class {
      constructor() {
        throw new Error('No WHATWG URL polyfill');
      }
    };
    const value = resolveRgbLibConfig({
      indexerUrl: 'ssl://[::1]:50002',
      proxyEndpoint: 'rpcs://proxy.example/json-rpc',
    });
    assert.equal(value.indexer.type, 'electrum');
    assert.equal(value.proxyEndpoint, 'rpcs://proxy.example/json-rpc');
    assert.throws(
      () => resolveRgbLibConfig({ ...config, indexerUrl: 'tcp://host:70000' }),
      code('INVALID_CONFIG')
    );
  } finally {
    globalThis.URL = original;
  }
});
test('WebRGB accepts the common wallet API and advertises only verified capabilities', async () => {
  const { wallet } = fixture();
  await wallet.init();
  let prompts = 0;
  const provider = new WebRgbProvider(wallet, {
    origin: 'https://example.com',
    sessionApproved: true,
    confirm: async () => {
      prompts++;
      return true;
    },
    burn: { operations: {} },
  });
  const info = await provider.getInfo();
  assert.equal(info.protocol, 'RGB_L1');
  assert.ok(!info.methods.includes('signMessage'));
  assert.ok(info.methods.includes('burnAsset'));
  assert.ok(info.methods.includes('getConsignment'));
  assert.deepEqual(info.burnRecipientNamespaces, ['eip155', 'tron']);
  assert.equal(info.burnDestinationVersion, undefined);
  await assert.rejects(
    provider.signMessage('test'),
    code('METHOD_NOT_SUPPORTED')
  );
  assert.equal(prompts, 0);
});
test('legacy aliases dispatch through subclass overrides of init, destroy and refreshTransfers', async () => {
  const calls = [];
  class AppWallet extends UTEXOWallet {
    async init() {
      calls.push('init');
    }
    async destroy() {
      calls.push('destroy');
    }
    async refreshTransfers() {
      calls.push('refreshTransfers');
      return { transfers: {} };
    }
  }
  for (const wallet of [
    new AppWallet(params, {}),
    new AppWallet({
      protocol: 'RGB_L1',
      params,
      keys: { getMnemonic: async () => 'unused' },
    }),
  ]) {
    calls.length = 0;
    await wallet.initialize();
    assert.equal(await wallet.refreshWallet(), undefined);
    await wallet.dispose();
    assert.deepEqual(calls, ['init', 'refreshTransfers', 'destroy']);
  }
});
test('issuance rejects totals the numeric asset model cannot represent before any native call', async () => {
  const { wallet, calls } = fixture();
  await wallet.init();
  const safe = Number.MAX_SAFE_INTEGER;
  await assert.rejects(
    wallet.issueAssetNia({
      ticker: 'T',
      name: 'Token',
      precision: 0,
      amounts: [safe, 1],
    }),
    code('AMOUNT_OVERFLOW')
  );
  await assert.rejects(
    wallet.issueAssetNia({
      ticker: 'T',
      name: 'Token',
      precision: 0,
      amounts: ['18446744073709551615'],
    }),
    code('AMOUNT_OVERFLOW')
  );
  await assert.rejects(
    wallet.issueAssetIfa({
      ticker: 'T',
      name: 'Token',
      precision: 0,
      amounts: [1],
      inflationAmounts: [safe],
      rejectListUrl: null,
    }),
    code('AMOUNT_OVERFLOW')
  );
  assert.ok(!calls.some((c) => Array.isArray(c) && c[0].startsWith('issue')));
  assert.deepEqual(amounts.issuanceAmounts([safe - 1], [1]), {
    amounts: [String(safe - 1)],
    inflationAmounts: ['1'],
  });
  await wallet.dispose();
});
const assetId = 'rgb:asset-id';
const txid = 'a'.repeat(64);
const burnParams = {
  assetId,
  amount: '18446744073709551615',
  burnRecipient: 'b'.repeat(64),
  feeRate: 3,
  minConfirmations: 1,
};
test('burn validates input and maps burnRecipient before a single native call', async () => {
  const { wallet, calls } = fixture();
  await wallet.init();
  await wallet.unlock(config);
  const burns = () => calls.filter((c) => Array.isArray(c) && c[0] === 'burn');
  for (const invalid of [
    { amount: '1.5' },
    { amount: 10 },
    { amount: '0' },
    { amount: '18446744073709551616' },
    { feeRate: 1.5 },
    { burnRecipient: '0x' + 'b'.repeat(64) },
    { assetId: 'asset' },
    { minConfirmations: 0 },
  ]) {
    await assert.rejects(wallet.burn({ ...burnParams, ...invalid }));
  }
  assert.equal(burns().length, 0);
  assert.deepEqual(await wallet.burn(burnParams), {
    txid: 'burn-txid',
    batchTransferIdx: 21,
  });
  assert.deepEqual(burns()[0], [
    'burn',
    'handle-1',
    assetId,
    '18446744073709551615',
    'b'.repeat(64),
    '3',
    1,
  ]);
  const unaddressed = { ...burnParams };
  delete unaddressed.burnRecipient;
  await wallet.burn(unaddressed);
  assert.equal(burns()[1][4], null);
  await wallet.dispose();
});
test('burn is rejected when the runtime lacks the capability and is never retried', async () => {
  const unsupported = fixture({
    async getRuntimeInfo() {
      return { ...runtime, burn: false };
    },
  });
  await unsupported.wallet.init();
  await unsupported.wallet.unlock(config);
  assert.equal((await unsupported.wallet.getBfaCapabilities()).burn, false);
  await assert.rejects(
    unsupported.wallet.burn(burnParams),
    code('UNSUPPORTED_CAPABILITY')
  );
  assert.ok(
    !unsupported.calls.some((c) => Array.isArray(c) && c[0] === 'burn')
  );
  let attempts = 0;
  const failing = fixture({
    async burn() {
      attempts++;
      throw new Error('ambiguous broadcast');
    },
  });
  await failing.wallet.init();
  await failing.wallet.unlock(config);
  await assert.rejects(failing.wallet.burn(burnParams), /ambiguous broadcast/);
  assert.equal(attempts, 1);
  assert.equal(await failing.wallet.getAddress(), 'address');
});
test('a subclass that disables burn is honoured on both protocols', async () => {
  class NoBurn extends UTEXOWallet {
    async getBfaCapabilities() {
      return { ...(await super.getBfaCapabilities()), burn: false };
    }
  }
  const rln = new NoBurn(params, { supportsBurn: true });
  let rlnBurns = 0;
  rln.engine.rln.rlnBfaCapabilities = async () => ({
    burn: true,
    consignment: true,
    bfa: true,
  });
  rln.engine.rln.rlnBurn = async () => {
    rlnBurns++;
    return { txid };
  };
  const f = fixture();
  const l1 = new NoBurn({ protocol: 'RGB_L1', params, keys: f.keys });
  l1.engine.ports.loadBinding = () => f.native;
  await l1.init();
  await l1.unlock(config);
  for (const wallet of [rln, l1]) {
    await assert.rejects(
      wallet.burn(burnParams),
      code('UNSUPPORTED_CAPABILITY')
    );
  }
  assert.equal(rlnBurns, 0);
  assert.ok(!f.calls.some((c) => Array.isArray(c) && c[0] === 'burn'));
  await l1.dispose();
});
test('inflate converts inputs exactly and returns only the public result', async () => {
  const { wallet, calls } = fixture({
    async inflate(...args) {
      calls.push(['inflate', ...args]);
      return { txid, batchTransferIdx: 4, entropy: '1' };
    },
  });
  await wallet.init();
  await wallet.unlock(config);
  const request = { assetId, inflationAmounts: ['18446744073709551615', 2] };
  for (const invalid of [
    { inflationAmounts: [Number.MAX_SAFE_INTEGER + 1] },
    { inflationAmounts: ['18446744073709551616'] },
    { minConfirmations: 0 },
    { feeRate: 1.5 },
  ]) {
    await assert.rejects(wallet.inflate({ ...request, ...invalid }));
  }
  assert.ok(!calls.some((c) => Array.isArray(c) && c[0] === 'inflate'));
  assert.deepEqual(await wallet.inflate({ ...request, feeRate: 5 }), {
    txid,
    batchTransferIdx: 4,
  });
  assert.deepEqual(calls.at(-1), [
    'inflate',
    'handle-1',
    assetId,
    ['18446744073709551615', '2'],
    '5',
    1,
  ]);
  const malformed = fixture({
    async inflate() {
      return { txid: 'x', batchTransferIdx: 4 };
    },
  });
  await malformed.wallet.init();
  await malformed.wallet.unlock(config);
  await assert.rejects(
    malformed.wallet.inflate(request),
    code('INVALID_NATIVE_RESPONSE')
  );
  await wallet.dispose();
  await malformed.wallet.dispose();
});
test('burn snapshots parameters before awaiting a subclass capability check', async () => {
  const gate = deferred();
  const started = deferred();
  class AppWallet extends UTEXOWallet {
    async getBfaCapabilities() {
      started.resolve();
      await gate.promise;
      return super.getBfaCapabilities();
    }
  }
  const f = fixture();
  const wallet = new AppWallet({ protocol: 'RGB_L1', params, keys: f.keys });
  wallet.engine.ports.loadBinding = () => f.native;
  await wallet.init();
  await wallet.unlock(config);
  const request = { ...burnParams, amount: '5' };
  const burning = wallet.burn(request);
  await started.promise;
  request.amount = '999';
  request.assetId = 'rgb:changed';
  gate.resolve();
  await burning;
  const calls = f.calls.filter((c) => Array.isArray(c) && c[0] === 'burn');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], assetId);
  assert.equal(calls[0][3], '5');
  await wallet.dispose();
});
test('a subclass cannot enable burn when the native runtime does not support it', async () => {
  class AppWallet extends UTEXOWallet {
    async getBfaCapabilities() {
      return { burn: true, consignment: true, bfa: true };
    }
  }
  const f = fixture({
    getRuntimeInfo: async () => ({ ...runtime, burn: false }),
  });
  const wallet = new AppWallet({ protocol: 'RGB_L1', params, keys: f.keys });
  wallet.engine.ports.loadBinding = () => f.native;
  await wallet.init();
  await wallet.unlock(config);
  await assert.rejects(wallet.burn(burnParams), code('UNSUPPORTED_CAPABILITY'));
  assert.ok(!f.calls.some((c) => Array.isArray(c) && c[0] === 'burn'));
  await wallet.dispose();
});
test('instance and bound capability overrides both prevent native burn', async () => {
  class BoundWallet extends UTEXOWallet {
    constructor(options) {
      super(options);
      this.getBfaCapabilities = this.getBfaCapabilities.bind(this);
    }
    async getBfaCapabilities() {
      return { ...(await super.getBfaCapabilities()), burn: false };
    }
  }
  for (const bound of [false, true]) {
    const f = fixture();
    const options = { protocol: 'RGB_L1', params, keys: f.keys };
    const wallet = bound ? new BoundWallet(options) : new UTEXOWallet(options);
    wallet.engine.ports.loadBinding = () => f.native;
    if (!bound) wallet.getBfaCapabilities = async () => ({ burn: false });
    await wallet.init();
    await wallet.unlock(config);
    await assert.rejects(
      wallet.burn(burnParams),
      code('UNSUPPORTED_CAPABILITY')
    );
    assert.ok(!f.calls.some((c) => Array.isArray(c) && c[0] === 'burn'));
    await wallet.dispose();
  }
});
test('consignment lookups validate assetId and txid before reaching native', async () => {
  const { wallet, calls } = fixture();
  await wallet.init();
  for (const [a, t] of [
    ['asset', txid],
    [assetId, 'z'.repeat(64)],
    [assetId, 'a'.repeat(63)],
  ]) {
    await assert.rejects(wallet.getConsignment(a, t), /Invalid assetId/);
    await assert.rejects(wallet.getConsignmentPath(a, t), /Invalid assetId/);
  }
  assert.ok(
    !calls.some((c) => Array.isArray(c) && c[0].startsWith('consignment'))
  );
  assert.equal(await wallet.getConsignment(assetId, txid), 'consignment-bytes');
  assert.equal(
    await wallet.getConsignmentPath(assetId, txid),
    '/wallets/consignment.rgb'
  );
  assert.deepEqual(
    calls.find((c) => Array.isArray(c) && c[0] === 'consignment'),
    ['consignment', 'handle-1', assetId, txid]
  );
  await wallet.dispose();
});
test('createBackup requires an absolute path and nonempty password', async () => {
  const { wallet, calls } = fixture();
  await wallet.init();
  for (const invalid of [
    { backupPath: 'relative/backup', password: 'pw' },
    { backupPath: '/backup', password: '' },
    { backupPath: '/backup' },
  ]) {
    await assert.rejects(wallet.createBackup(invalid), code('INVALID_CONFIG'));
  }
  assert.ok(!calls.some((c) => Array.isArray(c) && c[0] === 'backup'));
  assert.deepEqual(
    await wallet.createBackup({ backupPath: '/backups/w.rgb', password: 'pw' }),
    { message: 'Backup created successfully', backupPath: '/backups/w.rgb' }
  );
  assert.deepEqual(
    calls.find((c) => Array.isArray(c) && c[0] === 'backup'),
    ['backup', 'handle-1', '/backups/w.rgb', 'pw']
  );
  await wallet.dispose();
});
test('restoreRgbLibBackup validates paths and runtime version before restoring', async () => {
  const valid = {
    backupPath: '/backups/w.rgb',
    password: 'pw',
    storageDirPath: '/wallets/restored',
  };
  for (const invalid of [
    { backupPath: 'backups/w.rgb' },
    { storageDirPath: 'wallets/restored' },
    { password: '' },
    { backupPath: '/backups/w\0.rgb' },
    { storageDirPath: '/wallets/\0restored' },
  ]) {
    const { native, calls } = fixture();
    await assert.rejects(
      restoreRgbLibBackupWith({ ...valid, ...invalid }, () => native),
      code('INVALID_CONFIG')
    );
    assert.deepEqual(calls, []);
  }
  // The public entry point validates before it even loads the native module.
  for (const missing of [null, undefined]) {
    await assert.rejects(restoreRgbLibBackup(missing), code('INVALID_CONFIG'));
  }
  await assert.rejects(
    restoreRgbLibBackup({ ...valid, backupPath: 'relative' }),
    code('INVALID_CONFIG')
  );
  for (const mismatch of [
    { version: '0.0.0' },
    { sourceRevision: 'other' },
    { bridgeVersion: -1 },
  ]) {
    const { native, calls } = fixture({
      async getRuntimeInfo() {
        return { ...runtime, ...mismatch };
      },
    });
    await assert.rejects(
      restoreRgbLibBackupWith(valid, () => native),
      code('NATIVE_VERSION_MISMATCH')
    );
    assert.ok(!calls.some((c) => Array.isArray(c) && c[0] === 'restore'));
  }
  const { native, calls } = fixture();
  await restoreRgbLibBackupWith(valid, () => native);
  assert.deepEqual(calls.at(-1), [
    'restore',
    valid.backupPath,
    valid.password,
    valid.storageDirPath,
  ]);
});
