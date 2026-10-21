#!/usr/bin/env node
// Requires built RGB Lib/RLN frameworks and an installed iOS Simulator runtime.
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
  const rln = path.join(
    root,
    'ios/RGBLightningNode.xcframework/ios-arm64_x86_64-simulator'
  );
  run('xcrun', [
    'clang',
    '-fobjc-arc',
    '-target',
    triple,
    '-isysroot',
    sdk,
    '-I',
    path.join(rln, 'Headers'),
    '-c',
    path.join(root, 'scripts/native/rgb-lib-smoke.m'),
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
    path.join(rln, 'librgb_lightning_node.a'),
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
