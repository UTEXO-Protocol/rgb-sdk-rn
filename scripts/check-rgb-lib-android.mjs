#!/usr/bin/env node
// Compiles and runs the Android Kotlin storage/session code on the JVM.
// Requires kotlinc (or KOTLINC) and java on PATH.
//
// Stage 1 always runs: RLN storage claim and RgbLibDispatcher checks (no native
// artifacts).
// Stage 2 runs when RGB_LIB_JVM_BINDINGS_DIR points to a desktop UniFFI bundle
// of the pinned revision:
//   manifest.json  { version, sourceRevision, uniffiVersion }
//   kotlin/        generated Kotlin (package uniffi.rgb_lib)
//   lib/           host native library (librgblibuniffi.{so,dylib})
//   jars/          jna.jar and org.json json.jar
// Pass --require-native to fail instead of skipping stage 2.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kotlinc = process.env.KOTLINC ?? 'kotlinc';
const java = process.env.JAVA ?? 'java';
const requireNative = process.argv.includes('--require-native');
const src = (name) => path.join(root, 'android/src/main/java/com/rgbsdkrn', name);
const native = (name) => path.join(root, 'scripts/native', name);
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status})`);
};
const kotlinFiles = (dir) =>
  fs
    .readdirSync(dir, { recursive: true })
    .filter((name) => name.endsWith('.kt'))
    .map((name) => path.join(dir, name));

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

  const bundle = process.env.RGB_LIB_JVM_BINDINGS_DIR;
  if (!bundle) {
    const message =
      'RGB_LIB_JVM_BINDINGS_DIR is not set; skipped the RGB Lib session store smoke test.';
    if (requireNative) throw new Error(message);
    console.log(`[rgb-lib] ${message}`);
  } else {
    const pin = JSON.parse(
      fs.readFileSync(
        path.join(root, 'src/bindings/rgb-lib/manifest.json'),
        'utf8'
      )
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8')
    );
    for (const field of ['version', 'sourceRevision', 'uniffiVersion']) {
      if (manifest[field] !== pin[field])
        throw new Error(`JVM UniFFI bundle ${field} does not match this SDK`);
    }
    const jars = fs
      .readdirSync(path.join(bundle, 'jars'))
      .filter((name) => name.endsWith('.jar'))
      .map((name) => path.join(bundle, 'jars', name));
    const smokeJar = path.join(tmp, 'rgb-lib-smoke.jar');
    run(kotlinc, [
      '-cp',
      jars.join(path.delimiter),
      ...kotlinFiles(path.join(bundle, 'kotlin')),
      src('RgbLibSessionStore.kt'),
      src('RgbLibDtos.kt'),
      src('RlnStorageClaim.kt'),
      native('jvm-shims/android/util/Base64.kt'),
      native('RlnStorageClaimChecks.kt'),
      native('RgbLibKotlinSmoke.kt'),
      '-include-runtime',
      '-d',
      smokeJar,
    ]);
    run(java, [
      `-Djna.library.path=${path.join(bundle, 'lib')}`,
      '-cp',
      [smokeJar, ...jars].join(path.delimiter),
      'com.rgbsdkrn.RgbLibKotlinSmokeKt',
    ]);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
