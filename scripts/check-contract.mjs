#!/usr/bin/env node
/**
 * Runtime contract conformance for rgb-sdk-rn.
 *
 * Runs the shared suite from `@utexo/rgb-sdk-core/conformance` — the same one
 * rgb-sdk-web runs under Jest — but with a minimal runner supplied here, so
 * this package needs no test toolchain. `runConformanceChecks` is deliberately
 * runner-agnostic for exactly this case.
 *
 * What it proves that TypeScript cannot: at runtime this wallet reports all
 * three capabilities as `false` and carries none of the optional groups. The
 * type system allows `psbt?: IPsbtSigning` to be present or absent; nothing in
 * it verifies the flags agree with reality, or that a present carrier does more
 * than throw. Reinstating any of the 18 deleted stubs fails this check.
 *
 * Usage:
 *   npm run build && npm run check:contract
 *
 * Exit 0 when every check passes, 1 otherwise.
 */

import assert from 'node:assert/strict';
import { ValidationError } from '@utexo/rgb-sdk-core';
import { runConformanceChecks } from '@utexo/rgb-sdk-core/conformance';
import { UTEXOWallet } from '../lib/module/wallet/utexo-wallet.js';

// ── Minimal describe/it/expect ───────────────────────────────────────────────

let passed = 0;
const failures = [];
const stack = [];
const pending = [];

const describe = (name, fn) => {
  stack.push(name);
  fn();
  stack.pop();
};

const it = (name, fn) => {
  const title = [...stack, name].join(' › ');
  pending.push(async () => {
    try {
      await fn();
      passed += 1;
    } catch (e) {
      failures.push({
        title,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });
};

const expect = (actual) => ({
  toBe(expected) {
    if (!Object.is(actual, expected)) {
      throw new Error(
        `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  },
  toContain(expected) {
    if (!Array.isArray(actual) || !actual.includes(expected)) {
      throw new Error(
        `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`
      );
    }
  },
});

// ── Wallet factory ───────────────────────────────────────────────────────────

/**
 * Construction only stores params and creates an RLNManager; no native call is
 * made until a method runs. Carriers and `capabilities` are set at
 * construction, so this is all the capability block needs.
 */
const createWalletSync = (params = {}) =>
  new UTEXOWallet(
    {
      storageDirPath: '/tmp/rgb-sdk-rn-conformance',
      daemonListeningPort: 3001,
      ldkPeerListeningPort: 9735,
      network: 'regtest',
      ...params,
    },
    { initNode: async () => {}, unlockNode: async () => {} }
  );

runConformanceChecks({
  name: 'rgb-sdk-rn',
  walletClass: UTEXOWallet,
  createWalletSync,
  describe,
  it,
  expect,
});

describe('UniFFI 0.13 response mapping', () => {
  it('preserves WaitingBroadcast and rejects unknown transfer states', async () => {
    const wallet = createWalletSync();
    for (const status of [
      'WaitingBroadcast',
      'WAITING_BROADCAST',
      'waitingBroadcast',
    ]) {
      wallet.rln.rlnListTransfers = async () => [
        { idx: 7, status, kind: 'ReceiveWitness', assignments: [] },
      ];
      assert.equal(
        (await wallet.listTransfers('asset'))[0].status,
        'WaitingBroadcast'
      );
      wallet.rln.rlnListTransfersByTxid = wallet.rln.rlnListTransfers;
      assert.equal(
        (await wallet.listTransfersByTxid('txid'))[0].status,
        'WaitingBroadcast'
      );
    }
    wallet.rln.rlnListTransfers = async () => [
      { idx: 7, status: 'FutureStatus' },
    ];
    await assert.rejects(() => wallet.listTransfers('asset'), ValidationError);
  });

  it('preserves false as well as true for utxo.exists', async () => {
    const wallet = createWalletSync();
    wallet.rln.rlnListUnspents = async () =>
      [false, true].map((exists) => ({
        utxo: {
          outpoint: `${'a'.repeat(64)}:0`,
          btcAmount: 1000,
          colorable: true,
          exists,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      }));
    assert.deepEqual(
      (await wallet.listUnspents()).map((u) => u.utxo.exists),
      [false, true]
    );
  });

  it('returns refresh statuses and individual failures, including unchanged records', async () => {
    const wallet = createWalletSync();
    wallet.rln.rlnRefreshTransfers = async (skipSync) => {
      assert.equal(skipSync, false);
      return {
        transfers: {
          7: { updatedStatus: 'WAITING_BROADCAST', failure: null },
          8: {
            updatedStatus: null,
            failure: {
              name: 'InvalidConsignment',
              message: 'Invalid transfer',
            },
          },
          9: { updatedStatus: null, failure: null },
        },
      };
    };
    assert.deepEqual(await wallet.refreshTransfers(), {
      transfers: {
        7: { updatedStatus: 'WaitingBroadcast', failure: undefined },
        8: {
          updatedStatus: undefined,
          failure: { name: 'InvalidConsignment', message: 'Invalid transfer' },
        },
        9: { updatedStatus: undefined, failure: undefined },
      },
    });
    wallet.rln.rlnRefreshTransfers = async () => ({ transfers: {} });
    assert.deepEqual(await wallet.refreshTransfers(), { transfers: {} });
    wallet.rln.rlnRefreshTransfers = async () => ({
      transfers: { 7: { updatedStatus: 'FutureStatus' } },
    });
    await assert.rejects(() => wallet.refreshTransfers(), ValidationError);
  });

  it('keeps shared refreshWallet void and forwards skipSync on the RN-specific method', async () => {
    const wallet = createWalletSync();
    const calls = [];
    wallet.rln.rlnRefreshTransfers = async (skipSync) => {
      calls.push(skipSync);
      return { transfers: {} };
    };
    assert.equal(await wallet.refreshWallet(), undefined);
    assert.deepEqual(calls, [false]);
    assert.deepEqual(await wallet.refreshTransfers(true), { transfers: {} });
    assert.deepEqual(calls, [false, true]);
  });

  it('passes invoice descriptions and hashes through and normalizes nulls', async () => {
    const wallet = createWalletSync();
    for (const extra of [
      { description: 'Order 123', descriptionHash: null },
      { description: null, descriptionHash: 'a'.repeat(64) },
      {},
    ]) {
      wallet.rln.rlnDecodeLnInvoice = async () => ({
        paymentHash: 'hash',
        expirySec: 60,
        timestamp: 1,
        paymentSecret: 'secret',
        network: 'regtest',
        ...extra,
      });
      const decoded = await wallet.decodeLnInvoice('invoice');
      assert.equal(decoded.description, extra.description ?? undefined);
      assert.equal(decoded.descriptionHash, extra.descriptionHash ?? undefined);
    }
  });
});

describe('Mainnet Lightning gate', () => {
  const lightningCalls = [
    ['createLightningInvoice', [{}]],
    ['createHodlInvoice', [{ paymentHash: 'hash', expirySec: 3600 }]],
    ['claimHodlInvoice', ['hash', 'preimage']],
    ['cancelHodlInvoice', ['hash']],
    ['listPayments', []],
    ['apayNew', ['host']],
    ['apayNewWithAddress', ['host', 'user', 'example.com']],
    ['getLightningReceiveStatus', ['invoice']],
    ['getLightningSendStatus', ['hash']],
    ['payLightningInvoice', [{ lnInvoice: 'invoice' }]],
    ['listLightningPayments', []],
    ['connectPeer', ['peer@host:9735']],
    ['listPeers', []],
    ['disconnectPeer', ['peer']],
    ['listChannels', []],
    [
      'openChannel',
      [{ peerPubkey: 'peer', capacitySat: 10000, isPublic: false }],
    ],
    ['closeChannel', ['channel', 'peer', false]],
    ['getChannelId', ['temporary-channel']],
    ['keysend', ['peer', 1000]],
    ['decodeLnInvoice', ['invoice']],
    ['invoiceStatus', ['invoice']],
  ];
  const peer = {
    baseUrl: 'https://lsp.example.com',
    peerPubkey: 'peer',
    peerHost: 'lsp.example.com',
    peerPort: 9735,
  };

  it('rejects every LN/LSP call before accessing the manager or HTTP', async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error('Unexpected HTTP request');
    };
    try {
      for (const network of ['mainnet', 'bitcoin', ' MAINNET ']) {
        const wallet = createWalletSync({ network, lspBaseUrl: peer.baseUrl });
        let managerCalls = 0;
        wallet.rln = new Proxy(
          {},
          {
            get: () => () => {
              managerCalls += 1;
              throw new Error('Unexpected manager call');
            },
          }
        );
        for (const [method, args] of [
          ...lightningCalls,
          ['createLsp', []],
          ['createLsp', [peer]],
        ]) {
          await assert.rejects(
            wallet[method](...args),
            {
              code: 'LIGHTNING_DISABLED_ON_MAINNET',
            },
            method
          );
        }
        assert.equal(managerCalls, 0);
      }
      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps Lightning methods available on the other supported networks', async () => {
    for (const network of [
      'regtest',
      'testnet',
      'testnet4',
      'signet',
      'utexo',
    ]) {
      const wallet = createWalletSync({ network });
      const reachedManager = new Error('Reached manager');
      wallet.rln = new Proxy(
        {},
        {
          get: () => async () => {
            throw reachedManager;
          },
        }
      );
      for (const [method, args] of lightningCalls) {
        await assert.rejects(
          wallet[method](...args),
          (error) => error === reachedManager,
          method
        );
      }
      assert.ok(await wallet.createLsp(peer));
    }
  });

  it('keeps on-chain calls available and snapshots the configured network', async () => {
    const params = { network: 'mainnet' };
    const wallet = new UTEXOWallet(params, {
      initNode: async () => {},
      unlockNode: async () => {},
    });
    params.network = 'regtest';
    assert.equal(wallet.getNetwork(), 'mainnet');
    await assert.rejects(wallet.connectPeer('peer'), {
      code: 'LIGHTNING_DISABLED_ON_MAINNET',
    });
    wallet.rln.rlnAddress = async () => ({ address: 'bc1qexample' });
    wallet.rln.rlnSendBtc = async () => ({ txid: 'txid' });
    wallet.rln.rlnRgbInvoice = async () => ({ invoice: 'rgb:invoice' });
    assert.equal(await wallet.getAddress(), 'bc1qexample');
    assert.equal(
      await wallet.sendBtc({
        amount: 1000,
        address: 'bc1qrecipient',
        feeRate: 1,
      }),
      'txid'
    );
    assert.equal((await wallet.onchainReceive({})).invoice, 'rgb:invoice');
  });
});

describe('BFA mapping', () => {
  it('retains exact balances and rejects values rounded by the numeric native bridge', async () => {
    const wallet = createWalletSync();
    const asset = {
      assetId: 'rgb:bfa',
      ticker: 'BFA',
      name: 'BFA',
      precision: 0,
      initialSupply: 0,
      timestamp: 1,
      addedAt: 1,
      balance: { settled: 5, future: 5, spendable: 5 },
    };
    wallet.rln.rlnListAssets = async () => ({ bfa: [asset] });
    assert.equal((await wallet.listAssets()).bfa[0].balance.spendable, 5);
    asset.balance.spendable = Number.MAX_SAFE_INTEGER + 1;
    await assert.rejects(wallet.listAssets(), /exact integer range/);
  });
});

// ── Run ──────────────────────────────────────────────────────────────────────

for (const run of pending) await run();

if (failures.length > 0) {
  console.error(
    `\n✗ rgb-sdk-rn contract conformance — ${failures.length} failed, ${passed} passed\n`
  );
  for (const f of failures) console.error(`  ✗ ${f.title}\n      ${f.message}`);
  process.exit(1);
}

console.log(`✓ rgb-sdk-rn contract conformance — ${passed} checks passed`);
