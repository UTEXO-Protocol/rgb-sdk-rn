#!/usr/bin/env node
/**
 * Runtime contract conformance for @utexo/rgb-sdk-rn.
 *
 * Runs core's engine suite (`runEngineConformanceChecks` from
 * `@utexo/rgb-sdk-core/conformance`) on `RgbLibRn` with a minimal runner
 * supplied here, so this package needs no test toolchain.
 *
 * What it proves that TypeScript cannot: at runtime the engine has every base
 * method and every method of the extensions it declares, has no method of an
 * undeclared extension (where always-throwing stubs would hide), embeds the
 * contract version it claims, and reports capabilities that match its
 * carriers. The legacy IUTEXOProtocol suite is RLN-shaped and is not run here.
 *
 * Usage:
 *   npm run build && npm run check:contract
 *
 * Exit 0 when every check passes, 1 otherwise.
 */

import assert from 'node:assert/strict';
import { assertEngineContract, isEngineError } from '@utexo/rgb-sdk-core';
import { runEngineConformanceChecks } from '@utexo/rgb-sdk-core/conformance';
import { RgbLibRn } from '../lib/module/wallet/rgb-lib/rgb-lib-wallet.js';

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

// ── Engine contract (SharedWalletApi), rgb-lib ───────────────────────────────

/** Any native call fails the check: construction and the contract check need none. */
let nativeLoads = 0;
const noNative = () => {
  nativeLoads += 1;
  throw new Error('Unexpected native binding load');
};
const createRgbLibSync = (keys = { mnemonic: 'test mnemonic' }) =>
  new RgbLibRn(
    { network: 'regtest', storageDirPath: '/tmp/rgb-lib-conformance' },
    keys,
    noNative
  );

runEngineConformanceChecks({
  name: 'rgb-sdk-rn RgbLibRn',
  engineClass: RgbLibRn,
  createEngineSync: createRgbLibSync,
  extensions: [
    'restartable',
    'fileBackup',
    'maintenance',
    'burn',
    'consignment',
    'consignmentFile',
    'indexerCheck',
    'assetMetadata',
    'fileIssuance',
    'txidLookup',
    'addressRotation',
  ],
  describe,
  it,
  expect,
});

describe('rgb-sdk-rn RgbLibRn — contract version', () => {
  it('rejects an unaccepted contract version before init, with no native call', () => {
    const wallet = createRgbLibSync();
    assert.throws(
      () => assertEngineContract(wallet, ['2']),
      (error) => isEngineError(error, 'ENGINE_CONTRACT_MISMATCH')
    );
    assert.equal(wallet.isDisposed(), false);
    assert.equal(nativeLoads, 0);
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
