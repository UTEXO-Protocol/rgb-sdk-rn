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
const createWalletSync = () =>
  new UTEXOWallet(
    {
      storageDirPath: '/tmp/rgb-sdk-rn-conformance',
      daemonListeningPort: 3001,
      ldkPeerListeningPort: 9735,
      network: 'regtest',
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
