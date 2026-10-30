#!/usr/bin/env node
// Stage 1 checks the TurboModule dispatcher on the host with a fake store.
// Stage 2 requires the RGB Lib frameworks (plus RLN when package.json enables it)
// and an installed iOS Simulator runtime.
// Creates and removes its own simulator; never uses an existing user's device.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rgb-native-smoke-'));
const run = (command, args, capture = false) => {
  const result = spawnSync(command, args, {
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status})`);
  return result.stdout?.trim();
};
let device;
try {
  // Stage 1 runs on the host without frameworks: the TurboModule dispatcher.
  const dispatcherChecks = path.join(tmp, 'rgb-lib-dispatcher-checks');
  run('xcrun', [
    'clang',
    '-fobjc-arc',
    '-Wall',
    '-I',
    path.join(root, 'ios'),
    '-framework',
    'Foundation',
    path.join(root, 'ios/RgbLibDispatcher.m'),
    path.join(root, 'tests/native/rgb-lib-dispatcher-checks.m'),
    '-o',
    dispatcherChecks,
  ]);
  run(dispatcherChecks, []);

  const runtimes = JSON.parse(
    run('xcrun', ['simctl', 'list', 'runtimes', '-j'], true)
  ).runtimes;
  const runtime = runtimes
    .filter((r) => r.isAvailable && r.identifier.includes('.iOS-'))
    .sort((a, b) =>
      b.version.localeCompare(a.version, undefined, { numeric: true })
    )[0];
  if (!runtime)
    throw new Error('Install an iOS Simulator runtime in Xcode first.');
  const types = JSON.parse(
    run('xcrun', ['simctl', 'list', 'devicetypes', '-j'], true)
  ).devicetypes;
  const model =
    types.find((t) => t.identifier.endsWith('.iPhone-17')) ??
    types.find((t) => t.name.startsWith('iPhone'));
  if (!model) throw new Error('No iPhone Simulator device type is available.');
  for (const name of ['RGBLib', 'rgb_libFFI']) {
    const framework = path.join(tmp, `${name}.framework`);
    fs.cpSync(
      path.join(
        root,
        'ios/RgbLibBindings',
        `${name}.xcframework`,
        'ios-arm64_x86_64-simulator',
        `${name}.framework`
      ),
      framework,
      { recursive: true }
    );
    run('codesign', ['--force', '--sign', '-', framework]);
  }
  const sdk = run(
    'xcrun',
    ['--sdk', 'iphonesimulator', '--show-sdk-path'],
    true
  );
  const triple = `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-ios${runtime.version}-simulator`;
  const object = path.join(tmp, 'smoke.o');
  const binary = path.join(tmp, 'rgb-uniffi-smoke');
  // RLN is linked in only when package.json enables it, as in the podspec.
  // Then the smoke also proves both native libraries coexist in one binary.
  const rlnEnabled =
    JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).rgbSdk
      ?.rln === true;
  const rln = path.join(
    root,
    'ios/RGBLightningNode.xcframework/ios-arm64_x86_64-simulator'
  );
  if (rlnEnabled && !fs.existsSync(path.join(rln, 'librgb_lightning_node.a')))
    throw new Error(
      'RLN is enabled but RGBLightningNode.xcframework is missing. Run `node scripts/download-rln-bindings.mjs` first.'
    );
  const rlnCompile = rlnEnabled
    ? ['-DRGB_SMOKE_WITH_RLN', '-I', path.join(rln, 'Headers')]
    : [];
  const rlnLink = rlnEnabled ? [path.join(rln, 'librgb_lightning_node.a')] : [];
  console.log(
    `[smoke] RLN ${rlnEnabled ? 'linked in' : 'disabled; RGB Lib only'}`
  );
  run('xcrun', [
    'clang',
    '-fobjc-arc',
    '-target',
    triple,
    '-isysroot',
    sdk,
    ...rlnCompile,
    '-c',
    path.join(root, 'tests/native/rgb-lib-smoke.m'),
    '-o',
    object,
  ]);
  run('xcrun', [
    'swiftc',
    '-parse-as-library',
    '-emit-executable',
    '-module-cache-path',
    path.join(tmp, 'module-cache'),
    '-target',
    triple,
    '-sdk',
    sdk,
    '-F',
    tmp,
    '-framework',
    'RGBLib',
    '-framework',
    'rgb_libFFI',
    path.join(root, 'ios/RgbLibDtos.swift'),
    path.join(root, 'ios/RgbLibSwiftHelper.swift'),
    path.join(root, 'ios/RlnStorageClaim.swift'),
    object,
    ...rlnLink,
    '-framework',
    'Foundation',
    '-framework',
    'Security',
    '-framework',
    'SystemConfiguration',
    '-lc++',
    '-lresolv',
    '-lsqlite3',
    '-lz',
    '-liconv',
    '-Xlinker',
    '-rpath',
    '-Xlinker',
    tmp,
    '-o',
    binary,
  ]);
  run('codesign', ['--force', '--sign', '-', binary]);
  device = run(
    'xcrun',
    [
      'simctl',
      'create',
      'RGB Lib SDK smoke',
      model.identifier,
      runtime.identifier,
    ],
    true
  );
  run('xcrun', ['simctl', 'boot', device]);
  run('xcrun', ['simctl', 'bootstatus', device, '-b']);
  run('xcrun', ['simctl', 'spawn', device, binary]);
} finally {
  if (device) {
    spawnSync('xcrun', ['simctl', 'shutdown', device], { stdio: 'ignore' });
    spawnSync('xcrun', ['simctl', 'delete', device], { stdio: 'inherit' });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
