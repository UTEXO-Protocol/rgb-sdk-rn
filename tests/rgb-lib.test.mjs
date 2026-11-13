import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SDKError } from '@utexo/rgb-sdk-core';
import { WalletBackendError } from '../lib/module/wallet/wallet-errors.js';
import { RgbLibRn } from '../lib/module/wallet/rgb-lib/rgb-lib-rn.js';
import {
  restoreBackupFromFile,
  restoreBackupFromFileWith,
  restoreFromBackup,
  restoreFromBackupWith,
} from '../lib/module/wallet/rgb-lib/restore.js';
import {
  RGB_LIB_VERSION,
  RGB_LIB_REVISION,
  RGB_LIB_BRIDGE_VERSION,
  resolveRgbLibConfig,
  configEquals,
  DEFAULT_EVM_MINT_LOCK_BLOCKS,
} from '../lib/module/wallet/rgb-lib/config.js';
import * as amounts from '../lib/module/wallet/rgb-lib/amounts.js';
import * as map from '../lib/module/wallet/rgb-lib/mappers.js';
import { decodeNativeBase64 } from '../lib/module/wallet/rgb-lib/base64.js';
import { toBackendError } from '../lib/module/wallet/rgb-lib/errors.js';
import {
  DEFAULT_INDEXER_URLS,
  DEFAULT_TRANSPORT_ENDPOINTS,
  getNetworkDefaults,
} from '../lib/module/wallet/network-endpoints.js';
import { HDKey } from '@scure/bip32';

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
    async exportBackup(...args) {
      calls.push(['exportBackup', ...args]);
      return 'AAEC/w==';
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
  const wallet = new RgbLibRn(params, keys, () => native);
  return { wallet, native, calls, keys };
}

function publicWalletFixture(overrides = {}, walletParams = params) {
  const f = fixture(overrides);
  // The engine itself is the public API; only the native transport is faked.
  const wallet = new RgbLibRn(walletParams, f.keys, () => f.native);
  return { ...f, wallet };
}

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
test('native bridges report the manifest bridge version and read artifact provenance', () => {
  const source = (file) =>
    fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const swift = source('ios/RgbLibSwiftHelper.swift');
  const kotlin = source(
    'android/src/main/java/com/utexo/rgblibrn/RgbLibSessionStore.kt'
  );
  assert.match(
    swift,
    new RegExp(`"bridgeVersion": ${RGB_LIB_BRIDGE_VERSION},`)
  );
  assert.match(
    kotlin,
    new RegExp(`"bridgeVersion" to ${RGB_LIB_BRIDGE_VERSION},`)
  );
  // Version and revision come from the artifacts, never from constants.
  for (const text of [swift, kotlin]) {
    assert.ok(!text.includes(RGB_LIB_REVISION));
    assert.ok(text.includes('source_commit'));
  }
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
    await wallet.unlock(config);
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
test('missing native artifacts fail explicitly without loading key material', async () => {
  let reads = 0;
  // No fake transport: the real binding loader finds no native module.
  const w = new RgbLibRn(params, {
    async getMnemonic() {
      reads++;
      return 'unused';
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
test('a different config is rejected while the first connection is still pending', async () => {
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
  await wallet.init();
  const connecting = wallet.unlock(online);
  const joining = wallet.unlock({ ...online });
  let outcome = 'pending';
  wallet.unlock({ ...online, proxyEndpoint: 'http://localhost:3002' }).then(
    () => (outcome = 'resolved'),
    (error) => (outcome = error)
  );
  try {
    // A timer tick drains every microtask while the connection stays gated.
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(connections, 1);
    assert.equal(outcome?.code, 'WALLET_CONFIG_MISMATCH');
    assert.equal(outcome?.operation, 'unlock');
  } finally {
    gate.resolve();
  }
  await Promise.all([connecting, joining]);
  assert.equal(connections, 1);
  assert.equal(await wallet.sendBtc({ address: 'btc', amount: 1 }), 'txid');
  await wallet.dispose();
});
// unlock() is optional on networks with defaults; regtest still needs it.
const utexoFixture = (overrides = {}) =>
  publicWalletFixture(
    {
      async getWalletIdentity() {
        return {
          id: 'identity',
          network: 'signet',
          masterFingerprint: 'abc12345',
        };
      },
      ...overrides,
    },
    { ...params, network: 'utexo' }
  );
const onlineCalls = (calls) =>
  calls.filter((c) => Array.isArray(c) && c[0] === 'online');

test('goOnline is the rgb-lib connect; lazy, explicit goOnline and unlock share one native goOnline', async () => {
  const { wallet, calls } = utexoFixture();
  await wallet.init();
  // Lazy connect, then explicit calls with the same config: one native goOnline.
  assert.equal(await wallet.sendBtc({ address: 'btc', amount: 1 }), 'txid');
  await wallet.goOnline();
  await wallet.unlock();
  assert.equal(await wallet.sendBtc({ address: 'btc', amount: 1 }), 'txid');
  assert.equal(onlineCalls(calls).length, 1);
  // Each public name reports itself.
  await assert.rejects(
    wallet.goOnline({ proxyEndpoint: 'http://localhost:3999' }),
    (error) =>
      error.code === 'WALLET_CONFIG_MISMATCH' && error.operation === 'goOnline'
  );
  await assert.rejects(
    wallet.unlock({ proxyEndpoint: 'http://localhost:3999' }),
    (error) =>
      error.code === 'WALLET_CONFIG_MISMATCH' && error.operation === 'unlock'
  );
  assert.equal(onlineCalls(calls).length, 1);
  await wallet.dispose();
});
test('without unlock, the first online operation connects once with the network defaults', async () => {
  const { wallet, calls } = utexoFixture();
  await wallet.init();
  // Offline operations never connect.
  assert.equal(await wallet.getAddress(), 'address');
  assert.equal(onlineCalls(calls).length, 0);
  // Concurrent first calls share one connection.
  await Promise.all([
    wallet.sendBtc({ address: 'btc', amount: 1 }),
    wallet.sendBtc({ address: 'btc', amount: 2 }),
  ]);
  const online = onlineCalls(calls);
  assert.equal(online.length, 1);
  assert.equal(online[0][3], DEFAULT_INDEXER_URLS.utexo);
  await wallet.sendBtc({ address: 'btc', amount: 3 });
  assert.equal(onlineCalls(calls).length, 1);
  // An explicit unlock() with the defaults is now a no-op; other endpoints need a restart.
  await wallet.unlock({});
  await assert.rejects(wallet.unlock(config), code('WALLET_CONFIG_MISMATCH'));
  await wallet.dispose();
});

// Reads with skipSync: true use the stored state; native rgb-lib needs no
// Online object for them, so they work before unlock, also on regtest.
const btcReads = (calls) => ({
  async getBtcBalance(handle, skipSync) {
    calls.push(['btcBalance', skipSync]);
    const zero = { settled: '0', future: '0', spendable: '0' };
    return { vanilla: zero, colored: zero };
  },
  async listUnspents(handle, skipSync) {
    calls.push(['unspents', skipSync]);
    return [];
  },
  async listTransactions(handle, skipSync) {
    calls.push(['transactions', skipSync]);
    return [];
  },
});

test('BTC reads with skipSync: true work offline; without it they need a connection', async () => {
  const reads = [];
  const { wallet, calls } = fixture(btcReads(reads));
  await wallet.init();
  const zero = { settled: 0, future: 0, spendable: 0 };
  assert.deepEqual(await wallet.getBtcBalance({ skipSync: true }), {
    vanilla: zero,
    colored: zero,
  });
  assert.deepEqual(await wallet.listUnspents({ skipSync: true }), []);
  assert.deepEqual(await wallet.listTransactions({ skipSync: true }), []);
  assert.deepEqual(
    await wallet.listTransactionsByTxid('a'.repeat(64), true),
    []
  );
  assert.deepEqual(reads, [
    ['btcBalance', true],
    ['unspents', true],
    ['transactions', true],
    ['transactions', true],
  ]);
  assert.equal(onlineCalls(calls).length, 0);
  // Without skipSync (or with false) they sync, so regtest needs unlock first.
  for (const read of [
    () => wallet.getBtcBalance(),
    () => wallet.getBtcBalance({ skipSync: false }),
    () => wallet.listUnspents({}),
    () => wallet.listTransactions(null),
    () => wallet.listTransactionsByTxid('a'.repeat(64)),
  ]) {
    await assert.rejects(read(), code('WALLET_OFFLINE'));
  }
  assert.equal(reads.length, 4);
  // A skipSync getter is read once, from the owned snapshot.
  let getterReads = 0;
  const options = {
    get skipSync() {
      getterReads++;
      return getterReads === 1;
    },
  };
  await wallet.getBtcBalance(options);
  assert.equal(getterReads, 1);
  assert.deepEqual(reads.at(-1), ['btcBalance', true]);
  await wallet.dispose();
});

test('skipSync must be a boolean; it is checked before connecting and reaches native as a boolean', async () => {
  const reads = [];
  const native = [];
  const { wallet, calls } = utexoFixture({
    ...btcReads(reads),
    async refresh(handle, skipSync) {
      native.push(['refresh', skipSync]);
      return [];
    },
  });
  await wallet.init();
  for (const bad of ['false', 'true', 0, 1, {}, []]) {
    for (const call of [
      () => wallet.getBtcBalance({ skipSync: bad }),
      () => wallet.listUnspents({ skipSync: bad }),
      () => wallet.listTransactions({ skipSync: bad }),
      () => wallet.listTransactionsByTxid('a'.repeat(64), { skipSync: bad }),
      // The old positional flag; an object there is the options form.
      ...(typeof bad === 'object'
        ? []
        : [() => wallet.listTransactionsByTxid('a'.repeat(64), bad)]),
      () => wallet.refreshTransfers(bad),
      () => wallet.refresh({ skipSync: bad }),
      () => wallet.createUtxos({ num: 1, feeRate: 1, skipSync: bad }),
      () => wallet.sendBtc({ address: 'btc', amount: 1, skipSync: bad }),
    ]) {
      await assert.rejects(call(), (error) => {
        assert.equal(error.code, 'INVALID_PARAMS');
        assert.equal(error.cause?.field, 'skipSync');
        return true;
      });
    }
  }
  // Rejected before any connect or native call.
  assert.equal(onlineCalls(calls).length, 0);
  assert.deepEqual(reads, []);
  assert.deepEqual(native, []);
  // null and omitted mean false (sync), so these connect once and pass false.
  await wallet.getBtcBalance({ skipSync: null });
  await wallet.listTransactionsByTxid('a'.repeat(64), null);
  await wallet.listTransactionsByTxid('a'.repeat(64), { skipSync: true });
  await wallet.refreshTransfers();
  await wallet.refresh({ skipSync: null });
  await wallet.refresh({ skipSync: true });
  assert.deepEqual(reads, [
    ['btcBalance', false],
    ['transactions', false],
    ['transactions', true],
  ]);
  assert.deepEqual(native, [
    ['refresh', false],
    ['refresh', false],
    ['refresh', true],
  ]);
  assert.equal(onlineCalls(calls).length, 1);
  await wallet.dispose();
});

test('BTC reads with skipSync: true do not connect lazily on networks with defaults', async () => {
  const reads = [];
  const { wallet, calls } = utexoFixture(btcReads(reads));
  await wallet.init();
  await wallet.getBtcBalance({ skipSync: true });
  await wallet.listUnspents({ skipSync: true });
  assert.equal(onlineCalls(calls).length, 0);
  await wallet.getBtcBalance();
  assert.equal(onlineCalls(calls).length, 1);
  await wallet.dispose();
});

test('an explicit unlock keeps its endpoints, even while it is still connecting', async () => {
  const gate = deferred();
  const { wallet, calls } = utexoFixture({
    async goOnline(...args) {
      calls.push(['online', ...args]);
      await gate.promise;
    },
  });
  await wallet.init();
  const connecting = wallet.unlock(config);
  const send = wallet.sendBtc({ address: 'btc', amount: 1 });
  gate.resolve();
  await connecting;
  assert.equal(await send, 'txid');
  const online = onlineCalls(calls);
  assert.equal(online.length, 1);
  assert.equal(online[0][3], config.indexerUrl);
  await wallet.dispose();
});

test('a failed lazy connection reaches the caller and the next operation retries', async () => {
  let attempts = 0;
  const { wallet, calls } = utexoFixture({
    async goOnline(...args) {
      calls.push(['online', ...args]);
      if (++attempts === 1) throw new Error('indexer unavailable');
    },
  });
  await wallet.init();
  await assert.rejects(
    wallet.sendBtc({ address: 'btc', amount: 1 }),
    /indexer unavailable/
  );
  assert.equal(await wallet.sendBtc({ address: 'btc', amount: 1 }), 'txid');
  assert.equal(onlineCalls(calls).length, 2);
  await wallet.dispose();
});

test('constructor connection settings: lazy connect on regtest, unlock() and goOnline() defaults, explicit fields override', async () => {
  const withOnline = { ...params, ...config };
  // Lazy: the first online operation connects with the constructor's settings.
  const lazy = publicWalletFixture({}, withOnline);
  withOnline.indexerUrl = 'http://changed-after-construction:1'; // owned copy is used
  await lazy.wallet.init();
  assert.equal(onlineCalls(lazy.calls).length, 0);
  assert.equal(
    await lazy.wallet.sendBtc({ address: 'btc', amount: 1 }),
    'txid'
  );
  const [lazyCall] = onlineCalls(lazy.calls);
  assert.deepEqual(lazyCall.slice(2, 4), ['esplora', config.indexerUrl]);
  await lazy.wallet.dispose();

  // unlock() and goOnline() without params, or with undefined fields, use it too.
  for (const call of [
    (w) => w.unlock(),
    (w) => w.goOnline(),
    (w) => w.unlock({ indexerUrl: undefined }),
  ]) {
    const f = publicWalletFixture({}, { ...params, ...config });
    await f.wallet.init();
    await call(f.wallet);
    assert.deepEqual(onlineCalls(f.calls)[0].slice(2, 4), [
      'esplora',
      config.indexerUrl,
    ]);
    await f.wallet.dispose();
  }

  // An explicit indexer replaces the configured one; the deprecated alias behaves the same.
  const explicit = publicWalletFixture({}, { ...params, ...config });
  await explicit.wallet.init();
  await explicit.wallet.goOnline({ indexerUrl: 'tcp://localhost:50001' });
  assert.deepEqual(onlineCalls(explicit.calls)[0].slice(2, 4), [
    'electrum',
    'tcp://localhost:50001',
  ]);
  await explicit.wallet.dispose();
});

test('invalid constructor connection settings are rejected at construction', () => {
  const keys = { getMnemonic: () => 'test mnemonic' };
  for (const connection of [
    { indexerUrl: 'ftp://localhost:3000' },
    { indexerUrl: 'http://x', indexer: { type: 'esplora', url: 'http://x' } },
    { ...config, proxyEndpoint: 'ftp://localhost:3000' },
    { ...config, evmRpcUrls: { 0: 'http://localhost:8545' } },
  ]) {
    assert.throws(
      () => new RgbLibRn({ ...params, ...connection }, keys, () => ({})),
      code('INVALID_CONFIG'),
      JSON.stringify(connection)
    );
  }
});

test('regtest never connects lazily and online operations before init report WALLET_NOT_INITIALIZED', async () => {
  const { wallet, calls } = fixture();
  await assert.rejects(
    wallet.sendBtc({ address: 'btc', amount: 1 }),
    code('WALLET_NOT_INITIALIZED')
  );
  await wallet.init();
  await assert.rejects(
    wallet.sendBtc({ address: 'btc', amount: 1 }),
    (error) => {
      assert.equal(error.code, 'WALLET_OFFLINE');
      assert.match(error.message, /goOnline\(params\)/);
      return true;
    }
  );
  assert.equal(onlineCalls(calls).length, 0);
  // An init() in progress is awaited before deciding.
  const u = utexoFixture();
  const opening = u.wallet.init();
  assert.equal(await u.wallet.sendBtc({ address: 'btc', amount: 1 }), 'txid');
  await opening;
  await u.wallet.dispose();
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

// Same-turn calls: an operation accepted before shutdown()/destroy() must run
// before the close, including its own connect step.
const callIndex = (calls, name) =>
  calls.findIndex((c) => (Array.isArray(c) ? c[0] : c) === name);
test('shutdown in the same turn as an offline read runs the read first', async () => {
  const { wallet, calls } = fixture();
  await wallet.init();
  const read = wallet.getAddress();
  const close = wallet.shutdown();
  assert.equal(await read, 'address');
  await close;
  assert.ok(callIndex(calls, 'address') !== -1);
  assert.ok(callIndex(calls, 'address') < callIndex(calls, 'close'));
});
test('shutdown in the same turn as unlock connects before closing', async () => {
  const { wallet, calls } = fixture();
  await wallet.init();
  const unlock = wallet.unlock(config);
  const close = wallet.shutdown();
  await unlock;
  await close;
  assert.ok(callIndex(calls, 'online') !== -1);
  assert.ok(callIndex(calls, 'online') < callIndex(calls, 'close'));
});
test('an accepted send runs before a failing destroy, never after it', async () => {
  const { wallet, calls } = fixture({
    async closeWallet(h) {
      calls.push(['close', h]);
      throw new Error('close failed');
    },
  });
  await wallet.init();
  await wallet.unlock(config);
  const send = wallet.sendBtc({ address: 'btc', amount: 1, feeRate: 1 });
  const disposing = wallet.destroy();
  assert.equal(await send, 'txid');
  await assert.rejects(disposing, /close failed/);
  assert.ok(callIndex(calls, 'btc') !== -1);
  assert.ok(callIndex(calls, 'btc') < callIndex(calls, 'close'));
  await assert.rejects(
    wallet.sendBtc({ address: 'btc', amount: 1, feeRate: 1 }),
    code('WALLET_DISPOSED')
  );
});
test('shutdown does not cut off an accepted operation that is still connecting lazily', async () => {
  const gate = deferred();
  const { wallet, calls } = utexoFixture({
    async goOnline(...args) {
      calls.push(['online', ...args]);
      await gate.promise;
    },
  });
  await wallet.init();
  const send = wallet.sendBtc({ address: 'btc', amount: 1 });
  const close = wallet.shutdown();
  await assert.rejects(wallet.getAddress(), code('WALLET_STOPPING'));
  gate.resolve();
  assert.equal(await send, 'txid');
  await close;
  const online = callIndex(calls, 'online');
  const btc = callIndex(calls, 'btc');
  assert.ok(online !== -1 && online < btc);
  assert.ok(btc < callIndex(calls, 'close'));
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
    sdk('INVALID_PARAMS', 'decodeRGBInvoice')
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
  await wallet.dispose();
});
// Every public rejection is a WalletBackendError with the public operation name.
const publicError = (expected, operation) => (error) => {
  assert.ok(error instanceof WalletBackendError, String(error));
  assert.equal(error.code, expected);
  assert.equal(error.operation, operation);
  assert.equal(error.protocol, 'RGB_L1');
  return true;
};
test('JS validation failures are normalized before any native call', async () => {
  const { wallet, calls } = fixture();
  await wallet.init();
  await wallet.unlock(config);
  await assert.rejects(
    wallet.getConsignment('rgb:asset', 'not-a-txid'),
    publicError('INVALID_PARAMS', 'getConsignment')
  );
  await assert.rejects(
    wallet.getConsignmentPath('not-an-asset', 'a'.repeat(64)),
    publicError('INVALID_PARAMS', 'getConsignmentPath')
  );
  await assert.rejects(
    wallet.burn({
      assetId: 'rgb:asset',
      amount: '-1',
      feeRate: 1,
      minConfirmations: 1,
    }),
    (error) => {
      publicError('INVALID_PARAMS', 'burn')(error);
      assert.ok(error.cause instanceof Error);
      assert.match(error.message, /Burn amount/);
      return true;
    }
  );
  await assert.rejects(
    wallet.blindReceive({ assignmentKind: 'NonFungible', amount: 5 }),
    publicError('INVALID_PARAMS', 'blindReceive')
  );
  await assert.rejects(
    wallet.listAssets({ filterAssetSchemas: ['Nope'] }),
    publicError('INVALID_PARAMS', 'listAssets')
  );
  for (const name of ['consignment', 'consignmentPath', 'burn']) {
    assert.ok(!calls.some((c) => Array.isArray(c) && c[0] === name), name);
  }
  await wallet.dispose();
});
test('native failures report the public operation, not the bridge method', async () => {
  const reject = (nativeCode) => async () => {
    throw Object.assign(new Error('native failed'), { code: nativeCode });
  };
  const { wallet } = fixture({
    decodeInvoice: reject('RGB_LIB_InvalidInvoice'),
    send: reject('RGB_LIB_InsufficientBitcoins'),
    receive: reject('RGB_LIB_InvalidAmount'),
    sync: reject('NATIVE_BRIDGE_ERROR'),
  });
  await wallet.init();
  await wallet.unlock(config);
  await assert.rejects(
    wallet.decodeRGBInvoice({ invoice: 'rgb:x' }),
    publicError('INVALID_PARAMS', 'decodeRGBInvoice')
  );
  await assert.rejects(
    wallet.onchainSend({ invoice: 'rgb:x' }),
    publicError('INSUFFICIENT_FUNDS', 'onchainSend')
  );
  await assert.rejects(
    wallet.witnessReceive({}),
    publicError('INVALID_PARAMS', 'witnessReceive')
  );
  await assert.rejects(
    wallet.onchainReceive({}),
    publicError('INVALID_PARAMS', 'onchainReceive')
  );
  await assert.rejects(
    wallet.syncWallet(),
    publicError('NATIVE_ERROR', 'syncWallet')
  );
  await wallet.dispose();
});
test('lifecycle rejections carry the public operation', async () => {
  const { wallet } = fixture({
    async closeWallet() {
      throw new Error('close failed');
    },
  });
  await wallet.init();
  await assert.rejects(
    wallet.shutdown(),
    publicError('NATIVE_ERROR', 'shutdown')
  );
  await assert.rejects(
    wallet.getAddress(),
    publicError('WALLET_STOPPING', 'getAddress')
  );
  await assert.rejects(
    wallet.destroy(),
    publicError('NATIVE_ERROR', 'destroy')
  );
  await assert.rejects(
    wallet.unlock(config),
    publicError('WALLET_DISPOSED', 'unlock')
  );
});
test('a structurally valid error from another SDK copy keeps its code', async () => {
  // Same shape as WalletBackendError, but not this copy's class.
  const foreign = Object.assign(new Error('watch-only'), {
    code: 'UNSUPPORTED_CAPABILITY',
    operation: 'getAddress',
    protocol: 'RGB_L1',
  });
  const { wallet } = fixture({
    async getAddress() {
      throw foreign;
    },
  });
  await wallet.init();
  // Passed through as is: right code, operation and protocol, same object.
  await assert.rejects(wallet.getAddress(), (error) => {
    assert.equal(error, foreign);
    assert.equal(error.code, 'UNSUPPORTED_CAPABILITY');
    return true;
  });
  await wallet.dispose();
});
test('a non-Error native rejection is kept as the cause', async () => {
  const rejection = { code: 'RGB_LIB_InvalidAddress', message: 'bad address' };
  const { wallet } = fixture({
    async getAddress() {
      throw rejection;
    },
  });
  await wallet.init();
  await assert.rejects(wallet.getAddress(), (error) => {
    publicError('INVALID_PARAMS', 'getAddress')(error);
    assert.equal(error.message, 'bad address');
    assert.ok(error.cause instanceof Error);
    assert.equal(error.cause.rejection, rejection);
    return true;
  });
  await wallet.dispose();
});
test('init and restore translate native rejections; key reader failures become KEYS_UNAVAILABLE', async () => {
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
  await assert.rejects(locked.wallet.init(), (error) => {
    assert.ok(error instanceof WalletBackendError);
    assert.equal(error.code, 'KEYS_UNAVAILABLE');
    assert.equal(error.protocol, 'RGB_L1');
    assert.equal(error.cause, keyError);
    return true;
  });
  await assert.rejects(
    restoreFromBackupWith(
      {
        backupFilePath: '/backups/a.rgb',
        password: 'pw',
        dataDir: '/wallets/restored',
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
  // refresh() is the contract name; it returns the same mapped result.
  assert.deepEqual(await wallet.refresh(), { transfers });
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
    [
      'handle-1',
      false,
      'rgb:asset',
      '9',
      '1700000060',
      endpoints,
      2,
      'Fungible',
    ],
    ['handle-1', true, null, null, '1700086400', endpoints, 0, 'Any'],
    ['handle-1', true, null, null, '1700000001', endpoints, 0, 'Any'],
    ['handle-1', false, null, null, '1700086400', endpoints, 0, 'Any'],
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
    changeUtxos: [],
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
test('history maps link transfers and link rights', () => {
  const transfer = map.transfer({
    idx: 5,
    batchTransferIdx: 20,
    createdAt: '100',
    updatedAt: '101',
    status: 'Settled',
    requestedAssignment: null,
    assignments: [{ type: 'LinkRight', amount: null }],
    kind: 'Link',
    txid: 'txid',
    recipientId: null,
    receiveUtxo: null,
    changeUtxos: [],
    expiration: null,
    transportEndpoints: [],
    invoiceString: null,
    consignmentPath: null,
  });
  assert.equal(transfer.kind, 'Link');
  assert.deepEqual(transfer.assignments, [{ type: 'LinkRight' }]);
  assert.equal(transfer.amountBaseUnits, undefined);
});
test('history keeps every change output and the first one as the deprecated changeUtxo', () => {
  const change = [
    { txid: 'a', vout: 1 },
    { txid: 'b', vout: 0 },
  ];
  const transfer = map.transfer({
    idx: 6,
    batchTransferIdx: 21,
    createdAt: '100',
    updatedAt: '101',
    status: 'Settled',
    requestedAssignment: null,
    assignments: [],
    kind: 'Send',
    txid: 'txid',
    recipientId: null,
    receiveUtxo: null,
    changeUtxos: change,
    expiration: null,
    transportEndpoints: [],
    invoiceString: null,
    consignmentPath: null,
  });
  assert.deepEqual(transfer.changeUtxos, change);
  assert.deepEqual(transfer.changeUtxo, change[0]);
  const none = map.transfer({
    ...transfer,
    createdAt: '100',
    updatedAt: '101',
    status: 'Settled',
    kind: 'Send',
    assignments: [],
    requestedAssignment: null,
    txid: null,
    recipientId: null,
    receiveUtxo: null,
    changeUtxos: [],
    expiration: null,
    invoiceString: null,
    consignmentPath: null,
  });
  assert.deepEqual(none.changeUtxos, []);
  assert.equal(none.changeUtxo, undefined);
});
test('BFA assets report the known circulating supply', () => {
  const listed = map.assets([
    {
      schema: 'Bfa',
      assetId: 'bfa-id',
      ticker: 'BFA',
      name: 'Bridged',
      details: null,
      precision: 0,
      issuedSupply: null,
      initialSupply: '1000',
      maxSupply: null,
      knownCirculatingSupply: '750',
      timestamp: '1',
      addedAt: '2',
      balance: { settled: '0', future: '0', spendable: '0' },
      media: null,
      token: null,
      rejectListUrl: null,
    },
  ]);
  assert.equal(listed.bfa[0].knownCirculatingSupply, 750);
});
test('EVM mint lock bounds default per chain and reach native in order', async () => {
  const evmRpcUrls = {
    1: 'https://eth.example',
    137: 'http://polygon.example',
  };
  const evmMintLockBlocks = { 137: { min: 5, max: 5 } };
  assert.deepEqual(DEFAULT_EVM_MINT_LOCK_BLOCKS, { min: 1200, max: 28800 });
  const resolved = resolveRgbLibConfig({
    ...config,
    evmRpcUrls,
    evmMintLockBlocks,
  });
  assert.deepEqual(resolved.evmRpcUrls, evmRpcUrls);
  // Chain 1 has no entry, so it takes the default bounds.
  assert.deepEqual(resolved.evmMintLockBlocks, {
    1: { min: 1200, max: 28800 },
    137: { min: 5, max: 5 },
  });
  assert.ok(
    configEquals(
      resolved,
      resolveRgbLibConfig({ ...config, evmRpcUrls, evmMintLockBlocks })
    )
  );
  assert.ok(!configEquals(resolved, resolveRgbLibConfig(config)));
  assert.ok(
    !configEquals(resolved, resolveRgbLibConfig({ ...config, evmRpcUrls }))
  );
  const bad =
    (bounds, urls = { 1: 'https://eth.example' }) =>
    () =>
      resolveRgbLibConfig({
        ...config,
        evmRpcUrls: urls,
        evmMintLockBlocks: bounds,
      });
  assert.throws(bad({ 1: { min: 3, max: 2 } }), code('INVALID_CONFIG'));
  assert.throws(bad({ 1: { min: 1 } }), code('INVALID_CONFIG'));
  assert.throws(bad({ 1: { min: -1, max: 2 } }), code('INVALID_CONFIG'));
  assert.throws(bad({ 1: { min: 1.5, max: 2 } }), code('INVALID_CONFIG'));
  assert.throws(
    bad({ 1: { min: 0, max: Number.MAX_SAFE_INTEGER + 1 } }),
    code('INVALID_CONFIG')
  );
  assert.throws(bad({ 1: '1200' }), code('INVALID_CONFIG'));
  // Bounds for a chain without an RPC URL are a mistake, not ignored.
  assert.throws(bad({ 2: { min: 1, max: 2 } }), code('INVALID_CONFIG'));
  assert.throws(bad({}, { 1: 'wss://eth.example' }), code('INVALID_CONFIG'));
  assert.throws(bad({}, { 0: 'https://eth.example' }), code('INVALID_CONFIG'));

  const { wallet, calls } = fixture();
  await wallet.init();
  await wallet.goOnline({ ...config, evmRpcUrls, evmMintLockBlocks });
  const online = calls.filter((c) => Array.isArray(c) && c[0] === 'online');
  assert.equal(online.length, 1);
  // goOnline(handle, kind, url, user, password, cookie, ids, rpcUrls, minLocks, maxLocks, proxies, keys)
  assert.deepEqual(online[0].slice(7), [
    ['1', '137'],
    ['https://eth.example', 'http://polygon.example'],
    ['1200', '5'],
    ['28800', '5'],
    [],
    [],
  ]);
  await wallet.dispose();
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
// WebRGB (now in @utexo/rgb-sdk/webrgb) advertises burnAsset and
// getConsignment from these flags.
test('a signing wallet reports burn and consignment in its BFA capabilities', async () => {
  const { wallet, calls } = fixture();
  await wallet.init();
  const caps = await wallet.getBfaCapabilities();
  assert.equal(caps.burn, true);
  assert.equal(caps.consignment, true);
  assert.equal(
    calls.some((c) => Array.isArray(c) && c[0] === 'burn'),
    false
  );
  await wallet.dispose();
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
test('exportBackupToFile requires an absolute filePath and nonempty password', async () => {
  const { wallet, calls } = fixture();
  await wallet.init();
  for (const invalid of [
    { filePath: 'relative/backup', password: 'pw' },
    { filePath: '/backup', password: '' },
    { filePath: '/backup' },
    // The deprecated field name is not read by the new method.
    { backupPath: '/backup', password: 'pw' },
  ]) {
    await assert.rejects(
      wallet.exportBackupToFile(invalid),
      (e) => e.code === 'INVALID_CONFIG' && e.operation === 'exportBackupToFile'
    );
  }
  assert.ok(!calls.some((c) => Array.isArray(c) && c[0] === 'backup'));
  assert.deepEqual(
    await wallet.exportBackupToFile({
      filePath: '/backups/w.rgb',
      password: 'pw',
    }),
    { message: 'Backup created successfully', backupPath: '/backups/w.rgb' }
  );
  assert.deepEqual(
    calls.find((c) => Array.isArray(c) && c[0] === 'backup'),
    ['backup', 'handle-1', '/backups/w.rgb', 'pw']
  );
  // The deprecated name reports its own operation.
  await assert.rejects(
    wallet.createBackup({ backupPath: 'relative', password: 'pw' }),
    (e) => e.code === 'INVALID_CONFIG' && e.operation === 'createBackup'
  );
  await wallet.dispose();
});
test('exportBackup returns the native backup as bytes, offline', async () => {
  const { wallet, calls } = fixture();
  await wallet.init();
  const bytes = await wallet.exportBackup({ password: 'pw' });
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual([...bytes], [0, 1, 2, 255]);
  assert.deepEqual(
    calls.find((c) => Array.isArray(c) && c[0] === 'exportBackup'),
    ['exportBackup', 'handle-1', 'pw']
  );
  assert.equal(onlineCalls(calls).length, 0);
  await wallet.dispose();
});
test('exportBackup requires a nonempty password and checks the native bytes', async () => {
  const { wallet, calls } = fixture({
    async exportBackup() {
      return 'not base64!';
    },
  });
  await wallet.init();
  for (const invalid of [{}, { password: '' }, { password: 1 }])
    await assert.rejects(
      wallet.exportBackup(invalid),
      (e) => e.code === 'INVALID_CONFIG' && e.operation === 'exportBackup'
    );
  assert.ok(!calls.some((c) => Array.isArray(c) && c[0] === 'exportBackup'));
  await assert.rejects(
    wallet.exportBackup({ password: 'pw' }),
    (e) =>
      e.code === 'INVALID_NATIVE_RESPONSE' && e.operation === 'exportBackup'
  );
  await wallet.dispose();
});
test('native base64 decodes strictly', () => {
  for (let length = 0; length < 12; length++) {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 97 + 13) & 0xff);
    const encoded = Buffer.from(bytes).toString('base64');
    assert.deepEqual(decodeNativeBase64(encoded, 'backup'), bytes);
  }
  for (const invalid of [
    null,
    'AAE',
    'AA=A',
    'AAE=\n',
    'A===',
    'AAF=',
    'AB==',
    '-_==',
  ]) {
    assert.throws(
      () => decodeNativeBase64(invalid, 'backup'),
      (e) => e.code === 'INVALID_NATIVE_RESPONSE'
    );
  }
});
test('restoreBackupFromFile takes filePath and reports its own name', async () => {
  const valid = {
    filePath: '/backups/w.rgb',
    password: 'pw',
    dataDir: '/wallets/restored',
  };
  for (const invalid of [
    { filePath: 'backups/w.rgb' },
    { filePath: undefined, backupFilePath: '/backups/w.rgb' },
    { dataDir: 'wallets/restored' },
    { password: '' },
    { filePath: '/backups/w\0.rgb' },
  ]) {
    const { native, calls } = fixture();
    await assert.rejects(
      restoreBackupFromFileWith({ ...valid, ...invalid }, () => native),
      (e) =>
        e.code === 'INVALID_CONFIG' &&
        e.operation === 'restoreBackupFromFile' &&
        /filePath/.test(e.message)
    );
    assert.deepEqual(calls, []);
  }
  for (const missing of [null, undefined]) {
    await assert.rejects(
      restoreBackupFromFile(missing),
      (e) =>
        e.code === 'INVALID_CONFIG' && e.operation === 'restoreBackupFromFile'
    );
  }
  const nativeError = Object.assign(new Error('bad pw'), {
    code: 'RGB_LIB_WrongPassword',
  });
  {
    const { native } = fixture({
      async restoreBackup() {
        throw nativeError;
      },
    });
    await assert.rejects(
      restoreBackupFromFileWith(valid, () => native),
      (e) =>
        e.code === 'NATIVE_ERROR' &&
        e.operation === 'restoreBackupFromFile' &&
        e.cause === nativeError
    );
  }
  const { native, calls } = fixture();
  assert.deepEqual(await restoreBackupFromFileWith(valid, () => native), {
    message: 'Wallet restored successfully',
  });
  assert.deepEqual(calls.at(-1), [
    'restore',
    valid.filePath,
    valid.password,
    valid.dataDir,
  ]);
});
test('restoreFromBackup validates paths and runtime version before restoring', async () => {
  const valid = {
    backupFilePath: '/backups/w.rgb',
    password: 'pw',
    dataDir: '/wallets/restored',
  };
  for (const invalid of [
    { backupFilePath: 'backups/w.rgb' },
    { dataDir: 'wallets/restored' },
    { password: '' },
    { backupFilePath: '/backups/w\0.rgb' },
    { dataDir: '/wallets/\0restored' },
  ]) {
    const { native, calls } = fixture();
    await assert.rejects(
      restoreFromBackupWith({ ...valid, ...invalid }, () => native),
      (e) =>
        e.code === 'INVALID_CONFIG' &&
        e.operation === 'restoreFromBackup' &&
        e.protocol === 'RGB_L1'
    );
    assert.deepEqual(calls, []);
  }
  // The public entry point validates before it even loads the native module.
  for (const missing of [null, undefined]) {
    await assert.rejects(restoreFromBackup(missing), code('INVALID_CONFIG'));
  }
  await assert.rejects(
    restoreFromBackup({ ...valid, backupFilePath: 'relative' }),
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
      restoreFromBackupWith(valid, () => native),
      (e) =>
        e.code === 'NATIVE_VERSION_MISMATCH' &&
        e.operation === 'restoreFromBackup'
    );
    assert.ok(!calls.some((c) => Array.isArray(c) && c[0] === 'restore'));
  }
  // A native rejection names the public operation, not the bridge method.
  {
    const nativeError = Object.assign(new Error('bad pw'), {
      code: 'RGB_LIB_WrongPassword',
    });
    const { native } = fixture({
      async restoreBackup() {
        throw nativeError;
      },
    });
    await assert.rejects(
      restoreFromBackupWith(valid, () => native),
      (e) =>
        e.code === 'NATIVE_ERROR' &&
        e.operation === 'restoreFromBackup' &&
        e.protocol === 'RGB_L1' &&
        e.cause === nativeError
    );
  }
  // A missing native module is reported the same way.
  await assert.rejects(
    restoreFromBackupWith(valid, () => {
      throw Object.assign(new Error('no module'), {
        code: 'NATIVE_BACKEND_UNAVAILABLE',
      });
    }),
    (e) =>
      e.code === 'NATIVE_BACKEND_UNAVAILABLE' &&
      e.operation === 'restoreFromBackup'
  );
  // Each parameter is read once: a throwing getter is an INVALID_CONFIG with
  // the original as cause, and a changing one cannot slip past validation.
  {
    const boom = new Error('getter failed');
    const { native, calls } = fixture();
    await assert.rejects(
      restoreFromBackupWith(
        {
          backupFilePath: valid.backupFilePath,
          dataDir: valid.dataDir,
          get password() {
            throw boom;
          },
        },
        () => native
      ),
      (e) =>
        e.code === 'INVALID_CONFIG' &&
        e.operation === 'restoreFromBackup' &&
        e.protocol === 'RGB_L1' &&
        e.cause === boom
    );
    let dataDirReads = 0;
    await restoreFromBackupWith(
      {
        backupFilePath: valid.backupFilePath,
        password: valid.password,
        get dataDir() {
          return dataDirReads++ === 0 ? '/validated' : 'relative-unvalidated';
        },
      },
      () => native
    );
    assert.equal(dataDirReads, 1);
    assert.deepEqual(calls.at(-1), [
      'restore',
      valid.backupFilePath,
      valid.password,
      '/validated',
    ]);
  }
  const { native, calls } = fixture();
  assert.deepEqual(await restoreFromBackupWith(valid, () => native), {
    message: 'Wallet restored successfully',
  });
  assert.deepEqual(calls.at(-1), [
    'restore',
    valid.backupFilePath,
    valid.password,
    valid.dataDir,
  ]);
});

const nativeAsset = (schema, extra = {}) => ({
  schema,
  assetId: `rgb:${schema.toLowerCase()}`,
  ticker: null,
  name: schema,
  details: null,
  precision: 0,
  issuedSupply: null,
  initialSupply: null,
  maxSupply: null,
  knownCirculatingSupply: null,
  timestamp: '1700000000',
  addedAt: '1700000001',
  balance: { settled: '10', future: '10', spendable: '10' },
  media: null,
  token: null,
  rejectListUrl: null,
  ...extra,
});

test('rgb-lib exposes native read options, issuance, metadata and maintenance through the facade', async () => {
  const seen = [];
  const record =
    (name, value) =>
    async (...args) => {
      seen.push([name, ...args]);
      return typeof value === 'function' ? value(...args) : value;
    };
  const zero = { settled: '0', future: '0', spendable: '0' };
  const { wallet } = publicWalletFixture({
    listAssets: record('listAssets', []),
    getBtcBalance: record('getBtcBalance', { vanilla: zero, colored: zero }),
    listUnspents: record('listUnspents', []),
    listTransactions: record('listTransactions', []),
    getAssetMetadata: record('getAssetMetadata', {
      assetSchema: 'Ifa',
      initialSupply: '18446744073709551615',
      maxSupply: '18446744073709551615',
      knownCirculatingSupply: '5',
      timestamp: '1700000000',
      name: 'Inflatable',
      precision: 2,
      ticker: 'IFA',
      details: null,
      rejectListUrl: 'https://reject.example',
      linkedFromContract: 'rgb:linked-from',
      linkedToContract: null,
    }),
    issueAssetCfa: record(
      'issueAssetCfa',
      nativeAsset('Cfa', { issuedSupply: '10' })
    ),
    issueAssetUda: record(
      'issueAssetUda',
      nativeAsset('Uda', { ticker: 'UDA' })
    ),
    checkIndexerUrl: record('checkIndexerUrl', 'electrum'),
    drainTo: record('drainTo', 'drain-txid'),
    deleteTransfers: record('deleteTransfers', true),
  });
  await wallet.init();
  await wallet.unlock(config);

  await wallet.listAssets({ filterAssetSchemas: ['Cfa', 'Uda'] });
  await wallet.listAssets();
  await wallet.getBtcBalance({ skipSync: true });
  await wallet.listUnspents({ skipSync: true });
  await wallet.listTransactions({ skipSync: true });
  const metadata = await wallet.getAssetMetadata('rgb:ifa');
  assert.deepEqual(metadata, {
    assetSchema: 'Ifa',
    name: 'Inflatable',
    precision: 2,
    ticker: 'IFA',
    details: undefined,
    timestamp: 1700000000,
    initialSupply: '18446744073709551615',
    maxSupply: '18446744073709551615',
    knownCirculatingSupply: '5',
    rejectListUrl: 'https://reject.example',
    linkedFromContract: 'rgb:linked-from',
    linkedToContract: undefined,
  });
  const cfa = await wallet.issueAssetCfa({
    name: 'Cfa',
    precision: 0,
    amounts: [10],
    filePath: 'file:///media/my%20logo.png',
  });
  assert.equal(cfa.issuedSupply, 10);
  const uda = await wallet.issueAssetUda({
    ticker: 'UDA',
    name: 'Uda',
    precision: 0,
    attachmentsFilePaths: ['file://localhost/media/a.png'],
  });
  assert.equal(uda.ticker, 'UDA');
  assert.deepEqual(await wallet.checkIndexerUrl('tcp://localhost:50001'), {
    indexerProtocol: 'electrum',
  });
  assert.equal(
    await wallet.drainTo({ address: 'bcrt1qdrain', feeRate: 3 }),
    'drain-txid'
  );
  assert.equal(await wallet.deleteTransfers({ batchTransferIdx: 4 }), true);

  const args = (name) =>
    seen.filter(([n]) => n === name).map(([, ...rest]) => rest);
  assert.deepEqual(args('listAssets'), [
    ['handle-1', ['Cfa', 'Uda']],
    ['handle-1', []],
  ]);
  assert.deepEqual(args('getBtcBalance'), [['handle-1', true]]);
  assert.deepEqual(args('listUnspents'), [['handle-1', true]]);
  assert.deepEqual(args('listTransactions'), [['handle-1', true]]);
  assert.deepEqual(args('issueAssetCfa'), [
    ['handle-1', 'Cfa', null, 0, ['10'], '/media/my logo.png'],
  ]);
  assert.deepEqual(args('issueAssetUda'), [
    ['handle-1', 'UDA', 'Uda', null, 0, null, ['/media/a.png']],
  ]);
  assert.deepEqual(args('drainTo'), [['handle-1', 'bcrt1qdrain', '3']]);
  assert.deepEqual(args('deleteTransfers'), [['handle-1', 4, false]]);
});

test('rgb-lib rejects invalid schema filters and receive assignments before native', async () => {
  const seen = [];
  const { wallet } = publicWalletFixture({
    async listAssets(...args) {
      seen.push(args);
      return [];
    },
    async receive(...args) {
      seen.push(args);
      throw new Error('unexpected receive');
    },
  });
  await wallet.init();
  await wallet.unlock(config);
  await assert.rejects(
    wallet.listAssets({ filterAssetSchemas: ['Rgb20'] }),
    /Unknown asset schema/
  );
  await assert.rejects(
    wallet.blindReceive({ assignmentKind: 'Fungible' }),
    /requires amount/
  );
  await assert.rejects(
    wallet.witnessReceive({ assignmentKind: 'NonFungible', amount: 1 }),
    /takes no amount/
  );
  for (const assignmentKind of ['toString', '__proto__', 'constructor'])
    await assert.rejects(
      wallet.blindReceive({ assignmentKind, amount: 1 }),
      /Unknown assignmentKind/
    );
  assert.equal(seen.length, 0);
});

test('rgb-lib issuance rejects non-file URIs and relative paths before native', async () => {
  const seen = [];
  const { wallet } = publicWalletFixture({
    async issueAssetCfa(...args) {
      seen.push(args);
      throw new Error('unexpected issueAssetCfa');
    },
    async issueAssetUda(...args) {
      seen.push(args);
      throw new Error('unexpected issueAssetUda');
    },
  });
  await wallet.init();
  await wallet.unlock(config);
  for (const filePath of [
    'content://media/1',
    'media/logo.png',
    'file://host/x',
  ])
    await assert.rejects(
      wallet.issueAssetCfa({ name: 'C', precision: 0, amounts: [1], filePath }),
      /filePath must be an absolute path or a file:\/\/ URI/
    );
  await assert.rejects(
    wallet.issueAssetUda({
      ticker: 'U',
      name: 'U',
      precision: 0,
      attachmentsFilePaths: ['/ok.png', 'https://x/y.png'],
    }),
    /attachmentsFilePaths/
  );
  assert.deepEqual(seen, []);
});

test('RGB_L1 fills a missing indexer and proxy from the network defaults', () => {
  for (const network of ['utexo', 'signet', 'mainnet', 'regtest']) {
    const resolved = resolveRgbLibConfig({}, network);
    assert.equal(resolved.indexer.url, DEFAULT_INDEXER_URLS[network]);
    assert.equal(resolved.proxyEndpoint, DEFAULT_TRANSPORT_ENDPOINTS[network]);
    assert.deepEqual(getNetworkDefaults(network), {
      indexerUrl: DEFAULT_INDEXER_URLS[network],
      proxyEndpoint: DEFAULT_TRANSPORT_ENDPOINTS[network],
    });
  }
  assert.equal(
    DEFAULT_INDEXER_URLS.utexo,
    'https://dev.esplora-01.mint.utexo.com'
  );
  assert.equal(
    DEFAULT_TRANSPORT_ENDPOINTS.utexo,
    'rpcs://dev.rgb-proxy.utexo.com/json-rpc'
  );
  assert.equal(
    DEFAULT_TRANSPORT_ENDPOINTS.signet,
    'rpcs://staging.rgb-proxy.utexo.com/json-rpc'
  );
  assert.equal(resolveRgbLibConfig({}, 'signet').indexer.type, 'electrum');
  assert.equal(
    DEFAULT_INDEXER_URLS.mainnet,
    'ssl://electrs-01.utexo.com:50002'
  );
  assert.equal(
    DEFAULT_TRANSPORT_ENDPOINTS.mainnet,
    'rpcs://rgb-proxy.utexo.com/json-rpc'
  );
  assert.equal(resolveRgbLibConfig({}, 'mainnet').indexer.type, 'electrum');
  assert.equal(resolveRgbLibConfig({}, 'utexo').indexer.type, 'esplora');
  assert.equal(getNetworkDefaults('toString'), undefined);
});

test('RGB_L1 explicit endpoints override the defaults; without a network they stay required', () => {
  const resolved = resolveRgbLibConfig(config, 'utexo');
  assert.equal(resolved.indexer.url, 'http://localhost:3000');
  assert.equal(resolved.proxyEndpoint, 'rpc://localhost:3001/json-rpc');
  const proxyOnly = resolveRgbLibConfig(
    { proxyEndpoint: 'rpcs://p.example/json-rpc' },
    'utexo'
  );
  assert.equal(proxyOnly.indexer.url, DEFAULT_INDEXER_URLS.utexo);
  assert.equal(proxyOnly.proxyEndpoint, 'rpcs://p.example/json-rpc');
  assert.throws(() => resolveRgbLibConfig({}), code('INVALID_CONFIG'));
  assert.throws(
    () => resolveRgbLibConfig({ indexerUrl: 'http://localhost:3000' }),
    code('INVALID_CONFIG')
  );
});

// ── keys forms ───────────────────────────────────────────────────────────────

// Real account keys: the SDK decodes them fully before native sees them.
const TESTNET_VERSIONS = { private: 0x04358394, public: 0x043587cf };
const MAINNET_VERSIONS = { private: 0x0488ade4, public: 0x0488b21e };
const testKey = (byte, versions = TESTNET_VERSIONS) =>
  HDKey.fromMasterSeed(new Uint8Array(32).fill(byte), versions);
const TPUB_VANILLA = testKey(1).publicExtendedKey;
const TPUB_COLORED = testKey(2).publicExtendedKey;
const PUBLIC_KEYS = {
  accountXpubVanilla: TPUB_VANILLA,
  accountXpubColored: TPUB_COLORED,
  masterFingerprint: 'ABCDEF12',
};

/** Opens a wallet with `keys` and returns the mnemonic and public keys sent to native. */
async function openWith(keys) {
  const { native, calls } = fixture();
  const wallet = new RgbLibRn(params, keys, () => native);
  await wallet.init();
  const open = calls.find((c) => Array.isArray(c) && c[0] === 'open');
  await wallet.dispose();
  return open.slice(3, 7);
}

test('keys accepts a mnemonic string, a sync or async function, and a provider object', async () => {
  const fromMnemonic = ['words', null, null, null];
  assert.deepEqual(await openWith('words'), fromMnemonic);
  assert.deepEqual(await openWith(() => 'words'), fromMnemonic);
  assert.deepEqual(await openWith(async () => 'words'), fromMnemonic);
  assert.deepEqual(await openWith({ mnemonic: 'words' }), fromMnemonic);
  class KeychainService {
    constructor() {
      this.secret = 'words';
    }
    async getMnemonic() {
      return this.secret;
    }
  }
  assert.deepEqual(await openWith(new KeychainService()), fromMnemonic);
});

test('keys with a mnemonic and public keys send both; public keys alone open watch-only', async () => {
  const sent = [TPUB_VANILLA, TPUB_COLORED, 'abcdef12'];
  assert.deepEqual(await openWith({ mnemonic: 'words', ...PUBLIC_KEYS }), [
    'words',
    ...sent,
  ]);
  assert.deepEqual(
    await openWith({ getMnemonic: () => 'words', ...PUBLIC_KEYS }),
    ['words', ...sent]
  );
  assert.deepEqual(await openWith(PUBLIC_KEYS), [null, ...sent]);
});

test('the mnemonic reader is called on each native session and never cached', async () => {
  let reads = 0;
  const { native } = fixture();
  const wallet = new RgbLibRn(
    params,
    () => {
      reads += 1;
      return 'words';
    },
    () => native
  );
  await wallet.init();
  await wallet.shutdown();
  await wallet.reinit();
  assert.equal(reads, 2);
  await wallet.dispose();
});

test('a reader with no mnemonic or a failing reader rejects init with KEYS_UNAVAILABLE', async () => {
  for (const value of [null, undefined, '', '   ']) {
    await assert.rejects(
      openWith(() => value),
      code('KEYS_UNAVAILABLE')
    );
  }
  const keychain = new Error('keychain locked');
  for (const reader of [
    () => {
      throw keychain;
    },
    async () => {
      throw keychain;
    },
  ]) {
    await assert.rejects(openWith(reader), (error) => {
      assert.equal(error.code, 'KEYS_UNAVAILABLE');
      assert.equal(error.cause, keychain);
      assert.doesNotMatch(error.message, /keychain locked/);
      return true;
    });
  }
  // A reader that is called but does not return text is a programming error.
  await assert.rejects(
    openWith(() => 42),
    code('INVALID_CONFIG')
  );
});

test('a mismatch reported by native keeps its own code after the mnemonic is read', async () => {
  const { native } = fixture({
    async openWallet() {
      throw Object.assign(
        new Error('Storage belongs to a different wallet profile'),
        {
          code: 'WALLET_PROFILE_MISMATCH',
        }
      );
    },
  });
  const wallet = new RgbLibRn(params, 'words', () => native);
  await assert.rejects(wallet.init(), code('WALLET_PROFILE_MISMATCH'));
});

test('invalid keys are rejected at construction with INVALID_CONFIG', () => {
  const { native } = fixture();
  const reject = (keys, message) =>
    assert.throws(
      () => new RgbLibRn(params, keys, () => native),
      (error) => {
        assert.equal(error.code, 'INVALID_CONFIG');
        assert.equal(error.protocol, 'RGB_L1');
        if (message) assert.match(error.message, message);
        return true;
      }
    );
  reject(undefined);
  reject(42);
  reject('  ', /must not be empty/);
  reject({}, /need a mnemonic/);
  reject({ getMnemonic: 'words' }, /getMnemonic must be a function/);
  reject({ mnemonic: 'a', getMnemonic: () => 'b' }, /not both/);
  reject(
    { accountXpubVanilla: TPUB_VANILLA },
    /missing accountXpubColored, masterFingerprint/
  );
  reject({ mnemonic: 'words', masterFingerprint: 'abcdef12' }, /incomplete/);
  reject({ ...PUBLIC_KEYS, masterFingerprint: 'xyz' }, /8 hex characters/);
  reject(
    { ...PUBLIC_KEYS, accountXpubColored: 'xpubColored' },
    /must be a tpub for network regtest/
  );
  // Native writes the wallet profile before rgb-lib checks the keys, so any
  // key that does not decode must stop here.
  const tpub = TPUB_COLORED;
  const broken = tpub.slice(0, -1) + (tpub.endsWith('a') ? 'b' : 'a');
  for (const bad of ['tpubNotAValidKey', broken]) {
    reject(
      { ...PUBLIC_KEYS, accountXpubColored: bad },
      /accountXpubColored is not a valid tpub/
    );
  }
  assert.throws(
    () =>
      new RgbLibRn(
        { ...params, network: 'mainnet' },
        { ...PUBLIC_KEYS, accountXpubVanilla: 'xpubNotAValidKey' },
        () => native
      ),
    /accountXpubVanilla is not a valid xpub/
  );
  // A real mainnet xpub is accepted on mainnet.
  new RgbLibRn(
    { ...params, network: 'mainnet' },
    {
      accountXpubVanilla: testKey(1, MAINNET_VERSIONS).publicExtendedKey,
      accountXpubColored: testKey(2, MAINNET_VERSIONS).publicExtendedKey,
      masterFingerprint: 'abcdef12',
    },
    () => native
  );
});

test('a watch-only wallet reports burn unavailable and refuses it before native', async () => {
  const { native, calls } = fixture();
  const wallet = new RgbLibRn(params, PUBLIC_KEYS, () => native);
  await wallet.init();
  await wallet.unlock(config);
  const caps = await wallet.getBfaCapabilities();
  assert.equal(caps.burn, false);
  assert.equal(caps.consignment, true);
  await assert.rejects(wallet.burn(burnParams), code('UNSUPPORTED_CAPABILITY'));
  assert.ok(!calls.some((c) => Array.isArray(c) && c[0] === 'burn'));
  // The same wallet with a mnemonic can burn.
  const signing = new RgbLibRn(
    params,
    { mnemonic: 'words', ...PUBLIC_KEYS },
    () => fixture().native
  );
  await signing.init();
  assert.equal((await signing.getBfaCapabilities()).burn, true);
  await signing.dispose();
  await wallet.dispose();
});

test('watch-only signing failures map to UNSUPPORTED_CAPABILITY', () => {
  const error = toBackendError(
    Object.assign(new Error('Invalid operation for a watch only wallet'), {
      code: 'RGB_LIB_WatchOnly',
    }),
    'sendBtc'
  );
  assert.equal(error.code, 'UNSUPPORTED_CAPABILITY');
  assert.equal(error.operation, 'sendBtc');
  assert.match(error.message, /watch-only/);
});

// Review follow-ups (docs/01-contract-rgb-lib.md §11).
const calledNames = (calls) => calls.map((c) => (Array.isArray(c) ? c[0] : c));

test('work accepted during an init whose cleanup fails never uses the retained handle', async () => {
  let closes = 0;
  const { wallet, calls } = utexoFixture({
    async getWalletIdentity() {
      // Wrong network: identity validation fails after the open.
      return { id: 'identity', network: 'regtest', masterFingerprint: 'f' };
    },
    async closeWallet(h) {
      calls.push(['close', h]);
      if (++closes === 1) throw new Error('close failed');
    },
  });
  const init = wallet.init();
  const send = wallet.sendBtc({ address: 'btc', amount: 1 });
  // The cleanup failure is what init reports; the handle stays owned.
  await assert.rejects(init, /close failed/);
  await assert.rejects(send, (error) => {
    assert.equal(error.code, 'WALLET_STOPPING');
    assert.equal(error.operation, 'sendBtc');
    return true;
  });
  assert.ok(!calledNames(calls).includes('online'));
  assert.ok(!calledNames(calls).includes('btc'));
  // Cleanup can still be retried, and it clears the failed state.
  await wallet.shutdown();
  assert.equal(closes, 2);
  await assert.rejects(wallet.init(), code('WALLET_CONFIG_MISMATCH'));
});

test('shutdown in the same turn as reinit(config) waits for the whole restart', async () => {
  const { wallet, calls } = fixture();
  await wallet.init();
  await wallet.shutdown();
  calls.length = 0;
  const restart = wallet.reinit(config);
  const close = wallet.shutdown();
  await restart;
  await close;
  const names = calledNames(calls);
  for (const name of ['open', 'online', 'close'])
    assert.equal(names.filter((n) => n === name).length, 1, name);
  assert.ok(names.indexOf('open') < names.indexOf('online'));
  assert.ok(names.indexOf('online') < names.indexOf('close'));
  assert.equal(wallet.isDisposed(), false);
});

test('malformed arguments reject as INVALID_PARAMS and never throw synchronously', async () => {
  const { wallet, calls } = fixture();
  await wallet.init();
  await wallet.unlock(config);
  const before = calls.length;
  const getterError = new Error('getter failed');
  const throwing = {
    get address() {
      throw getterError;
    },
    amount: 1,
  };
  for (const [operation, call] of [
    ['decodeRGBInvoice', () => wallet.decodeRGBInvoice(null)],
    ['onchainReceive', () => wallet.onchainReceive(null)],
    ['sendBtc', () => wallet.sendBtc(null)],
    ['sendBtc', () => wallet.sendBtc(throwing)],
  ]) {
    let pending;
    assert.doesNotThrow(() => {
      pending = call();
    }, operation);
    assert.ok(pending instanceof Promise, operation);
    await assert.rejects(pending, publicError('INVALID_PARAMS', operation));
  }
  await assert.rejects(wallet.sendBtc(throwing), (error) => {
    assert.equal(error.cause, getterError);
    return true;
  });
  assert.equal(calls.length, before);
  await wallet.dispose();
});

test('aliases normalize once under their own name and keep the native cause', async () => {
  const cause = Object.assign(new Error('Invalid asset'), {
    code: 'RGB_LIB_InvalidAssetId',
  });
  const { wallet } = fixture({
    async listTransfers() {
      throw cause;
    },
    async refresh() {
      throw cause;
    },
  });
  await wallet.init();
  await wallet.unlock(config);
  for (const [operation, call] of [
    ['listOnchainTransfers', () => wallet.listOnchainTransfers()],
    ['listTransfers', () => wallet.listTransfers()],
    ['refreshWallet', () => wallet.refreshWallet()],
    ['refresh', () => wallet.refresh()],
  ]) {
    await assert.rejects(call(), (error) => {
      publicError('INVALID_PARAMS', operation)(error);
      assert.equal(error.cause, cause);
      return true;
    });
  }
  await wallet.dispose();
});

test('a foreign error renamed to the public operation is kept whole as the cause', async () => {
  const inner = new Error('inner');
  const foreign = Object.assign(new Error('from another copy'), {
    code: 'UNSUPPORTED_CAPABILITY',
    operation: 'bridgeGetAddress',
    protocol: 'RGB_L1',
    cause: inner,
    detail: 'extra',
  });
  const { wallet } = fixture({
    async getAddress() {
      throw foreign;
    },
  });
  await wallet.init();
  await assert.rejects(wallet.getAddress(), (error) => {
    publicError('UNSUPPORTED_CAPABILITY', 'getAddress')(error);
    assert.equal(error.cause, foreign);
    assert.equal(error.cause.detail, 'extra');
    assert.equal(foreign.operation, 'bridgeGetAddress');
    return true;
  });
  await wallet.dispose();
});

test('a key source rejecting with a non-Error value keeps it as the cause', async () => {
  const rejection = { reason: 'locked' };
  const wallet = new RgbLibRn(
    params,
    {
      async getMnemonic() {
        throw rejection;
      },
    },
    () => fixture().native
  );
  await assert.rejects(wallet.init(), (error) => {
    publicError('KEYS_UNAVAILABLE', 'init')(error);
    assert.equal(error.cause.rejection, rejection);
    return true;
  });
});

test('consignment lookup reports the argument that is invalid', async () => {
  // The engine uses core's check; this pins the engine's dependency on it.
  const { validateConsignmentLookup } = await import('@utexo/rgb-sdk-core');
  const assetId = 'rgb:asset';
  const txid = 'a'.repeat(64);
  for (const [args, field] of [
    [['bad', txid], 'assetId'],
    [[assetId, 'bad'], 'txid'],
  ]) {
    assert.throws(
      () => validateConsignmentLookup(...args),
      (error) => {
        assert.equal(error.code, 'VALIDATION_ERROR');
        assert.equal(error.field, field);
        return true;
      }
    );
  }
});

// Second review round (docs §12).
test('a config getter that calls shutdown() cannot slip between admission and tracking', async () => {
  const reentrant = (wallet) => {
    let fired = false;
    return {
      ...config,
      get indexerUrl() {
        if (!fired) {
          fired = true;
          void wallet.shutdown();
        }
        return config.indexerUrl;
      },
    };
  };
  {
    const { wallet, calls } = fixture();
    await wallet.init();
    await assert.rejects(
      wallet.unlock(reentrant(wallet)),
      publicError('WALLET_STOPPING', 'unlock')
    );
    assert.ok(!calledNames(calls).includes('online'));
  }
  {
    const { wallet, calls } = fixture();
    await wallet.init();
    await wallet.shutdown();
    calls.length = 0;
    await assert.rejects(
      wallet.reinit(reentrant(wallet)),
      publicError('WALLET_STOPPING', 'reinit')
    );
    assert.ok(!calledNames(calls).includes('open'));
  }
});

test('throwing config and option getters are INVALID_PARAMS and run before any connect', async () => {
  const getterError = new Error('getter failed');
  const throwingConfig = {
    ...config,
    get indexerUrl() {
      throw getterError;
    },
  };
  const { wallet, calls } = fixture();
  await wallet.init();
  for (const [operation, call] of [
    ['unlock', () => wallet.unlock(throwingConfig)],
    ['reinit', () => wallet.reinit(throwingConfig)],
  ]) {
    await assert.rejects(call(), (error) => {
      publicError('INVALID_PARAMS', operation)(error);
      assert.equal(error.cause, getterError);
      return true;
    });
  }
  await wallet.dispose();
  // An offline wallet that would connect lazily rejects before connecting.
  const offline = utexoFixture();
  await offline.wallet.init();
  await assert.rejects(
    offline.wallet.getBtcBalance({
      get skipSync() {
        throw getterError;
      },
    }),
    (error) => {
      publicError('INVALID_PARAMS', 'getBtcBalance')(error);
      assert.equal(error.cause, getterError);
      return true;
    }
  );
  assert.equal(onlineCalls(offline.calls).length, 0);
  // null still means "no options".
  await offline.wallet.listAssets(null);
  await offline.wallet.dispose();
  assert.ok(!calledNames(calls).includes('online'));
});

test('a foreign error with another protocol is rewrapped as RGB_L1', async () => {
  const foreign = Object.freeze(
    Object.assign(new Error('lightning'), {
      code: 'NATIVE_ERROR',
      operation: 'getAddress',
      protocol: 'RGB_LN',
    })
  );
  const { wallet } = fixture({
    async getAddress() {
      throw foreign;
    },
  });
  await wallet.init();
  await assert.rejects(wallet.getAddress(), (error) => {
    assert.notEqual(error, foreign);
    publicError('NATIVE_ERROR', 'getAddress')(error);
    assert.equal(error.cause, foreign);
    return true;
  });
  await wallet.dispose();
});

// Small fixes (docs §13).
const utexoParams = { ...params, network: 'utexo' };
const signetIdentity = {
  async getWalletIdentity() {
    return { id: 'identity', network: 'signet', masterFingerprint: 'f' };
  },
};

test('the facade has no messageSigning carrier and reports canSignTransactions', () => {
  const signing = fixture().wallet;
  assert.equal('messageSigning' in signing, false);
  assert.equal(signing.capabilities.canSignTransactions, true);
  const watchOnly = new RgbLibRn(params, PUBLIC_KEYS, () => fixture().native);
  assert.equal(watchOnly.capabilities.canSignTransactions, false);
});

test('reinit on an active session rejects with WALLET_INVALID_STATE', async () => {
  const { wallet } = fixture();
  await wallet.init();
  await assert.rejects(
    wallet.reinit(config),
    publicError('WALLET_INVALID_STATE', 'reinit')
  );
  await wallet.dispose();
});

test('onchainSend refuses skipSync: true before connecting and passes false otherwise', async () => {
  const { native, calls } = fixture(signetIdentity);
  const wallet = new RgbLibRn(utexoParams, fixture().keys, () => native);
  await wallet.init();
  const send = { invoice: 'rgb:invoice', amount: 1, feeRate: 1 };
  await assert.rejects(
    wallet.onchainSend({ ...send, skipSync: true }),
    publicError('UNSUPPORTED_CAPABILITY', 'onchainSend')
  );
  assert.equal(onlineCalls(calls).length, 0);
  await wallet.onchainSend({ ...send, skipSync: false });
  const sent = calls.find((c) => Array.isArray(c) && c[0] === 'send');
  assert.equal(sent[10], false);
  await wallet.dispose();
});

test('a watch-only wallet refuses signing operations before connecting or calling native', async () => {
  const { native, calls } = fixture({
    ...signetIdentity,
    async getBtcBalance() {
      const zero = { settled: '0', future: '0', spendable: '0' };
      return { vanilla: zero, colored: zero };
    },
  });
  const wallet = new RgbLibRn(utexoParams, PUBLIC_KEYS, () => native);
  await wallet.init();
  const before = calls.length;
  for (const [operation, call] of [
    ['sendBtc', () => wallet.sendBtc({ address: 'btc', amount: 1 })],
    ['createUtxos', () => wallet.createUtxos({})],
    ['onchainSend', () => wallet.onchainSend({ invoice: 'rgb:invoice' })],
    ['drainTo', () => wallet.drainTo({ address: 'btc', feeRate: 1 })],
    [
      'inflate',
      () => wallet.inflate({ assetId, inflationAmounts: [1], feeRate: 1 }),
    ],
    ['burn', () => wallet.burn(burnParams)],
  ]) {
    await assert.rejects(
      call(),
      publicError('UNSUPPORTED_CAPABILITY', operation)
    );
  }
  assert.equal(calls.length, before);
  // Reads still work and connect lazily as before.
  await wallet.getBtcBalance();
  assert.equal(onlineCalls(calls).length, 1);
  await wallet.dispose();
});

test('receive and send arguments are validated before the lazy connect', async () => {
  const { native, calls } = fixture(signetIdentity);
  const wallet = new RgbLibRn(utexoParams, fixture().keys, () => native);
  await wallet.init();
  for (const [operation, call] of [
    ['blindReceive', () => wallet.blindReceive({ assignmentKind: 'Nope' })],
    ['witnessReceive', () => wallet.witnessReceive({ durationSeconds: 0 })],
    ['sendBtc', () => wallet.sendBtc({ address: 'btc', amount: -1 })],
    [
      'onchainSend',
      () => wallet.onchainSend({ invoice: 'rgb:invoice', minConfirmations: 0 }),
    ],
    ['failTransfers', () => wallet.failTransfers({ batchTransferIdx: 0 })],
  ]) {
    await assert.rejects(call(), (error) => {
      assert.equal(error.operation, operation);
      assert.ok(
        [
          'INVALID_PARAMS',
          // integer() reports out-of-range numbers as INVALID_CONFIG.
          'INVALID_CONFIG',
          'INVALID_AMOUNT',
        ].includes(error.code),
        `${operation}: ${error.code}`
      );
      return true;
    });
  }
  assert.equal(onlineCalls(calls).length, 0);
  await wallet.dispose();
});

// Cleanup states (docs §5 #7, §14).
const failingClose = (failures, calls) => {
  let attempts = 0;
  return {
    get attempts() {
      return attempts;
    },
    async closeWallet(h) {
      calls?.push(['close', h]);
      if (++attempts <= failures) throw new Error(`close failed ${attempts}`);
    },
  };
};
const wrongNetwork = {
  async getWalletIdentity() {
    return { id: 'identity', network: 'signet', masterFingerprint: 'f' };
  },
};

test('failed init with failed cleanup keeps both errors; destroy() retries and finishes', async () => {
  const close = failingClose(1);
  const { wallet } = fixture({
    ...wrongNetwork,
    closeWallet: (h) => close.closeWallet(h),
  });
  await assert.rejects(wallet.init(), (error) => {
    publicError('WALLET_STOPPING', 'init')(error);
    assert.match(error.message, /does not match the profile/);
    assert.match(error.message, /close failed 1/);
    assert.equal(error.cause.error.code, 'WALLET_CONFIG_MISMATCH');
    assert.equal(error.cause.cleanupError.message, 'close failed 1');
    return true;
  });
  assert.equal(wallet.isDisposed(), false);
  await assert.rejects(wallet.getAddress(), code('WALLET_STOPPING'));
  await assert.rejects(wallet.init(), code('WALLET_STOPPING'));
  await wallet.destroy();
  assert.equal(close.attempts, 2);
  assert.equal(wallet.isDisposed(), true);
  await assert.rejects(wallet.init(), code('WALLET_DISPOSED'));
});

test('failed init with successful cleanup can be retried at once', async () => {
  let mismatch = true;
  const { wallet, calls } = fixture({
    async getWalletIdentity() {
      return {
        id: 'identity',
        network: mismatch ? 'signet' : 'regtest',
        masterFingerprint: 'f',
      };
    },
  });
  await assert.rejects(wallet.init(), code('WALLET_CONFIG_MISMATCH'));
  assert.equal(wallet.isDisposed(), false);
  mismatch = false;
  await wallet.init();
  assert.equal(await wallet.getAddress(), 'address');
  assert.equal(calledNames(calls).filter((n) => n === 'open').length, 2);
  assert.equal(calledNames(calls).filter((n) => n === 'close').length, 1);
  await wallet.dispose();
});

test('a failed destroy reports WALLET_DISPOSED for new work and can be retried', async () => {
  const close = failingClose(1);
  const { wallet } = fixture({ closeWallet: (h) => close.closeWallet(h) });
  await wallet.init();
  await assert.rejects(wallet.destroy(), /close failed 1/);
  assert.equal(wallet.isDisposed(), false);
  await assert.rejects(wallet.getAddress(), code('WALLET_DISPOSED'));
  // A shutdown after a failed destroy keeps the terminal intent.
  await wallet.shutdown();
  assert.equal(close.attempts, 2);
  assert.equal(wallet.isDisposed(), true);
  await assert.rejects(wallet.reinit(), code('WALLET_DISPOSED'));
});

test('a failed shutdown keeps WALLET_STOPPING until a retry succeeds, then reopens', async () => {
  const close = failingClose(2);
  const { wallet } = fixture({ closeWallet: (h) => close.closeWallet(h) });
  await wallet.init();
  await assert.rejects(wallet.shutdown(), /close failed 1/);
  await assert.rejects(wallet.shutdown(), /close failed 2/);
  await assert.rejects(wallet.getAddress(), code('WALLET_STOPPING'));
  await wallet.shutdown();
  assert.equal(close.attempts, 3);
  assert.equal(wallet.isDisposed(), false);
  await wallet.reinit();
  assert.equal(await wallet.getAddress(), 'address');
  await wallet.dispose();
});
