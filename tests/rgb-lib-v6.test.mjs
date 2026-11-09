import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RgbLibWalletBackend } from '../lib/module/wallet/rgb-lib/backend.js';
import {
  resolveRgbLibConfig,
  configEquals,
} from '../lib/module/wallet/rgb-lib/config.js';
import { transfer } from '../lib/module/wallet/rgb-lib/mappers.js';
const runtime = {
  version: '0.3.0-beta.7-upstream-dev-bfa.6-bfa.devnext.1',
  sourceRevision: '5010eefa355beb9c42a4c1b69883f7651241a111',
  bridgeVersion: 5,
};
const config = {
  indexer: { type: 'esplora', url: 'https://dev.esplora-01.mint.utexo.com' },
  proxyEndpoint: 'rpcs://dev.rgb-proxy.utexo.com/json-rpc',
  evmRpcUrls: { 42161: 'https://arb1.arbitrum.io/rpc' },
  evmMintLockBlocks: { 42161: { min: 1200, max: 28800 } },
};
test('v6 rejects missing, inverted or unsafe mint lock policy before native work', () => {
  assert.throws(
    () => resolveRgbLibConfig({ ...config, evmMintLockBlocks: undefined }),
    /bounds are required/
  );
  assert.throws(
    () =>
      resolveRgbLibConfig({
        ...config,
        evmMintLockBlocks: { 42161: { min: 20, max: 10 } },
      }),
    /exceed/
  );
  assert.throws(
    () =>
      resolveRgbLibConfig({
        ...config,
        evmMintLockBlocks: {
          42161: { min: 0, max: Number.MAX_SAFE_INTEGER + 1 },
        },
      }),
    /integer/
  );
  const a = resolveRgbLibConfig(config);
  const b = resolveRgbLibConfig({
    ...config,
    evmMintLockBlocks: { 42161: { min: 1200, max: 20000 } },
  });
  assert.equal(configEquals(a, b), false);
});
test('v6 passes chain-specific bounds as aligned decimal-string arrays and keeps sender proxy', async () => {
  let onlineArgs, sendArgs;
  const native = {
    getRuntimeInfo: async () => runtime,
    openWallet: async () => 'handle',
    getWalletIdentity: async () => ({
      id: 'public-wallet-id',
      network: 'signet',
    }),
    goOnline: async (...args) => {
      onlineArgs = args;
    },
    closeWallet: async () => {},
    send: async (...args) => {
      sendArgs = args;
      return { txid: 'a'.repeat(64) };
    },
  };
  const backend = new RgbLibWalletBackend(
    { network: 'utexo', storageDirPath: '/isolated/v6' },
    () => 'TEST KEY',
    () => native
  );
  await backend.lifecycle.init();
  await backend.lifecycle.unlock({
    ...config,
    evmRpcUrls: {
      ...config.evmRpcUrls,
      1: 'https://ethereum.example.test/rpc',
    },
    evmMintLockBlocks: {
      ...config.evmMintLockBlocks,
      1: { min: 30, max: 600 },
    },
  });
  const ids = onlineArgs[6],
    urls = onlineArgs[7],
    mins = onlineArgs[8],
    maxs = onlineArgs[9];
  for (let i = 0; i < ids.length; i++) {
    const expected =
      ids[i] === '42161'
        ? ['https://arb1.arbitrum.io/rpc', '1200', '28800']
        : ['https://ethereum.example.test/rpc', '30', '600'];
    assert.deepEqual([urls[i], mins[i], maxs[i]], expected);
  }
  await backend.rgb.onchainSend({
    invoice: 'test invoice',
    assetId: 'test-asset',
    amount: 25,
    feeRate: 2,
    minConfirmations: 3,
  });
  assert.equal(sendArgs.at(-1), config.proxyEndpoint);
  assert.equal(sendArgs[3], '25');
  await backend.lifecycle.destroy();
});
test('v6 transfer mapping preserves every change output', () => {
  const change = [
    { txid: 'a'.repeat(64), vout: 0 },
    { txid: 'a'.repeat(64), vout: 2 },
  ];
  const result = transfer({
    idx: 1,
    batchTransferIdx: 2,
    createdAt: '1793970000',
    updatedAt: '1793970001',
    status: 'WaitingConfirmations',
    kind: 'Send',
    requestedAssignment: { type: 'Fungible', amount: '25' },
    assignments: [{ type: 'Fungible', amount: '25' }],
    txid: 'a'.repeat(64),
    recipientId: null,
    receiveUtxo: null,
    changeUtxo: change[0],
    changeUtxos: change,
    expiration: null,
    transportEndpoints: [],
    invoiceString: null,
    consignmentPath: null,
  });
  assert.deepEqual(result.changeUtxos, change);
  assert.deepEqual(result.changeUtxo, change[0]);
  assert.equal(result.amount, 25);
});
