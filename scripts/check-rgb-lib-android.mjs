#!/usr/bin/env node
// Compiles and runs Android Kotlin storage/session code on the JVM: the RLN
// storage claim and the RgbLibDispatcher checks. No native artifacts needed.
// The session store against the real rgb-lib AAR runs as an instrumentation
// test: android/src/androidTest/.../RgbLibSessionStoreInstrumentationTest.kt.
// Requires kotlinc (or KOTLINC) and java on PATH.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kotlinc = process.env.KOTLINC ?? 'kotlinc';
const java = process.env.JAVA ?? 'java';
const src = (name) =>
  path.join(root, 'android/src/main/java/com/rgbsdkrn', name);
const native = (name) => path.join(root, 'tests/native', name);
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status})`);
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rgb-kotlin-smoke-'));
try {
  const claimJar = path.join(tmp, 'rln-storage-claim.jar');
  run(kotlinc, [
    src('RlnStorageClaim.kt'),
    native('RlnStorageClaimChecks.kt'),
    native('RlnStorageClaimMain.kt'),
    '-include-runtime',
    '-d',
    claimJar,
  ]);
  run(java, ['-cp', claimJar, 'com.rgbsdkrn.RlnStorageClaimMainKt']);

  // RgbLibModule's per-handle dispatch, with a gated fake store.
  const dispatcherJar = path.join(tmp, 'rgb-lib-dispatcher.jar');
  run(kotlinc, [
    src('RgbLibDispatcher.kt'),
    native('RgbLibDispatcherChecks.kt'),
    '-include-runtime',
    '-d',
    dispatcherJar,
  ]);
  run(java, ['-cp', dispatcherJar, 'com.rgbsdkrn.RgbLibDispatcherChecksKt']);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
