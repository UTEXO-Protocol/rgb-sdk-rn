#!/usr/bin/env node
// Installs the pinned rgb-lib iOS bindings from the rgb-lib-swift release.
// Android needs no install step: Gradle resolves the AAR from Maven Central.
//
// The release ships a static `rgb_libFFI.xcframework` and the generated
// `RgbLib.swift`. RLN links its own copy of rgb-lib, so both cannot be linked
// statically into one app. This script wraps the release library unchanged in
// a dynamic `rgb_libFFI.framework` that exports only the UniFFI symbols, and
// compiles `RgbLib.swift` into a separate `RGBLib` module. No Rust is built.
//
// Usage: node scripts/setup-rgb-lib-bindings.mjs [--optional] [--force]
//   --optional  warn instead of failing (used by postinstall)
//   --force     rebuild even when matching bindings are installed
// Set RGB_LIB_SKIP_IOS=1 to skip the iOS install.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(
  fs.readFileSync(path.join(root, 'src/bindings/rgb-lib/manifest.json'), 'utf8')
);
const args = process.argv.slice(2);
const optional = args.includes('--optional');
const force = args.includes('--force');
const target = path.join(root, 'ios/RgbLibBindings');
const log = (message) => console.log(`[rgb-lib] ${message}`);

// Fields the podspec compares against the installed manifest.
const PINNED_FIELDS = [
  'version',
  'sourceRevision',
  'uniffiVersion',
  'swiftModule',
];

function installedMatches() {
  try {
    const installed = JSON.parse(
      fs.readFileSync(path.join(target, 'manifest.json'), 'utf8')
    );
    return (
      PINNED_FIELDS.every((field) => installed[field] === pin[field]) &&
      installed.ios?.sha256 === pin.ios.sha256
    );
  } catch {
    return false;
  }
}

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    https
      .get(url, { timeout: 60000 }, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          response.resume();
          return download(response.headers.location, dest, redirects + 1)
            .then(resolve)
            .catch(reject);
        }
        if (response.statusCode !== 200) {
          response.resume();
          return reject(
            new Error(`Download failed: HTTP ${response.statusCode} ${url}`)
          );
        }
        const file = fs.createWriteStream(dest);
        response.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      })
      .on('timeout', function () {
        this.destroy(new Error(`Download timed out: ${url}`));
      })
      .on('error', reject);
  });
}

const sha256 = (file) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    fs.createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });

const run = (command, commandArgs) =>
  execFileSync(command, commandArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim();

function frameworkPlist(name, identifier) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleExecutable</key><string>${name}</string>
  <key>CFBundleIdentifier</key><string>${identifier}</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>${name}</string>
  <key>CFBundlePackageType</key><string>FMWK</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>MinimumOSVersion</key><string>${pin.ios.minIosVersion}</string>
</dict>
</plist>
`;
}

// One xcframework slice: device (arm64) or simulator (arm64 + x86_64).
const SLICES = [
  { id: 'ios-arm64', sdk: 'iphoneos', archs: ['arm64'], suffix: '' },
  {
    id: 'ios-arm64_x86_64-simulator',
    sdk: 'iphonesimulator',
    archs: ['arm64', 'x86_64'],
    suffix: '-simulator',
  },
];

function buildSlice(release, work, slice) {
  const sdkPath = run('xcrun', ['--sdk', slice.sdk, '--show-sdk-path']);
  const staticLib = path.join(
    release,
    'rgb_libFFI.xcframework',
    slice.id,
    'librgblibuniffi.a'
  );
  const header = path.join(
    release,
    'rgb_libFFI.xcframework',
    slice.id,
    'Headers/rgb_libFFI.h'
  );
  const out = path.join(work, slice.id);
  const ffi = path.join(out, 'rgb_libFFI.framework');
  const swift = path.join(out, 'RGBLib.framework');
  const swiftmodule = path.join(swift, 'Modules/RGBLib.swiftmodule');
  fs.mkdirSync(path.join(ffi, 'Headers'), { recursive: true });
  fs.mkdirSync(path.join(ffi, 'Modules'), { recursive: true });
  fs.mkdirSync(swiftmodule, { recursive: true });
  fs.copyFileSync(header, path.join(ffi, 'Headers/rgb_libFFI.h'));
  fs.writeFileSync(
    path.join(ffi, 'Modules/module.modulemap'),
    'framework module rgb_libFFI { umbrella header "rgb_libFFI.h" export * }\n'
  );
  fs.writeFileSync(
    path.join(ffi, 'Info.plist'),
    frameworkPlist('rgb_libFFI', 'org.utexo.rgb-lib-bfa.ffi')
  );
  fs.writeFileSync(
    path.join(swift, 'Info.plist'),
    frameworkPlist('RGBLib', 'org.utexo.rgb-lib-bfa')
  );

  const ffiBinaries = [];
  const swiftBinaries = [];
  for (const arch of slice.archs) {
    const triple = `${arch}-apple-ios${pin.ios.minIosVersion}${slice.suffix}`;
    const archDir = path.join(out, arch);
    const archFfi = path.join(archDir, 'rgb_libFFI.framework');
    fs.mkdirSync(archDir, { recursive: true });
    fs.cpSync(ffi, archFfi, { recursive: true });
    let archLib = staticLib;
    if (slice.archs.length > 1) {
      archLib = path.join(archDir, 'librgblibuniffi.a');
      run('xcrun', ['lipo', staticLib, '-thin', arch, '-output', archLib]);
    }
    // Only the UniFFI entry points are exported, so the Rust and C symbols
    // RLN also links stay private to this image.
    run('xcrun', [
      '--sdk',
      slice.sdk,
      'clang',
      '-target',
      triple,
      '-isysroot',
      sdkPath,
      '-dynamiclib',
      `-Wl,-force_load,${archLib}`,
      '-Wl,-exported_symbol,_uniffi_rgblibuniffi_*',
      '-Wl,-exported_symbol,_ffi_rgblibuniffi_*',
      '-Wl,-dead_strip',
      '-install_name',
      '@rpath/rgb_libFFI.framework/rgb_libFFI',
      '-framework',
      'Security',
      '-framework',
      'SystemConfiguration',
      '-framework',
      'CoreFoundation',
      '-lc++',
      '-lresolv',
      '-lsqlite3',
      '-lz',
      '-liconv',
      '-o',
      path.join(archFfi, 'rgb_libFFI'),
    ]);
    ffiBinaries.push(path.join(archFfi, 'rgb_libFFI'));

    const moduleTriple = `${arch}-apple-ios${slice.suffix}`;
    const swiftBinary = path.join(archDir, 'RGBLib');
    run('xcrun', [
      '--sdk',
      slice.sdk,
      'swiftc',
      '-target',
      triple,
      '-sdk',
      sdkPath,
      '-module-name',
      'RGBLib',
      '-parse-as-library',
      '-emit-library',
      '-O',
      '-wmo',
      '-enable-library-evolution',
      '-emit-module-interface-path',
      path.join(swiftmodule, `${moduleTriple}.swiftinterface`),
      '-emit-private-module-interface-path',
      path.join(swiftmodule, `${moduleTriple}.private.swiftinterface`),
      '-emit-module-path',
      path.join(swiftmodule, `${moduleTriple}.swiftmodule`),
      '-module-cache-path',
      path.join(work, 'module-cache'),
      '-F',
      archDir,
      '-framework',
      'rgb_libFFI',
      '-Xlinker',
      '-install_name',
      '-Xlinker',
      '@rpath/RGBLib.framework/RGBLib',
      '-o',
      swiftBinary,
      path.join(release, 'Sources/RgbLib/RgbLib.swift'),
    ]);
    swiftBinaries.push(swiftBinary);
  }
  run('xcrun', [
    'lipo',
    '-create',
    ...ffiBinaries,
    '-output',
    path.join(ffi, 'rgb_libFFI'),
  ]);
  run('xcrun', [
    'lipo',
    '-create',
    ...swiftBinaries,
    '-output',
    path.join(swift, 'RGBLib'),
  ]);
  return { ffi, swift };
}

async function installIos() {
  if (process.platform !== 'darwin') {
    log('Skipping iOS bindings: not running on macOS.');
    return;
  }
  if (process.env.RGB_LIB_SKIP_IOS === '1') {
    log('Skipping iOS bindings: RGB_LIB_SKIP_IOS=1.');
    return;
  }
  if (!force && installedMatches()) {
    log(`iOS bindings ${pin.ios.release} already installed.`);
    return;
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rgb-lib-ios-'));
  try {
    const zip = path.join(work, 'release.zip');
    log(`Downloading ${pin.ios.url}`);
    await download(pin.ios.url, zip);
    const actual = await sha256(zip);
    if (actual !== pin.ios.sha256)
      throw new Error(
        `Checksum mismatch for the rgb-lib-swift release: ${actual}`
      );
    // Extract into its own empty directory; nothing from it is executed.
    const release = path.join(work, 'release');
    fs.mkdirSync(release);
    run('unzip', ['-q', zip, '-d', release]);
    const provenance = JSON.parse(
      fs.readFileSync(path.join(release, 'version.json'), 'utf8')
    );
    if (
      provenance.version !== pin.ios.release ||
      provenance.source_commit !== pin.sourceRevision
    )
      throw new Error('The rgb-lib-swift release does not match the pin');

    log('Building RGBLib and rgb_libFFI frameworks (takes about a minute)...');
    const built = SLICES.map((slice) => buildSlice(release, work, slice));
    const stage = `${target}.pending`;
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });
    for (const [name, key] of [
      ['rgb_libFFI', 'ffi'],
      ['RGBLib', 'swift'],
    ])
      run('xcodebuild', [
        '-create-xcframework',
        ...built.flatMap((slice) => ['-framework', slice[key]]),
        '-output',
        path.join(stage, `${name}.xcframework`),
      ]);
    fs.copyFileSync(
      path.join(release, 'version.json'),
      path.join(stage, 'version.json')
    );
    fs.writeFileSync(
      path.join(stage, 'manifest.json'),
      JSON.stringify(pin, null, 2) + '\n'
    );
    const previous = `${target}.previous`;
    fs.rmSync(previous, { recursive: true, force: true });
    if (fs.existsSync(target)) fs.renameSync(target, previous);
    try {
      fs.renameSync(stage, target);
    } catch (error) {
      if (fs.existsSync(previous)) fs.renameSync(previous, target);
      throw error;
    }
    fs.rmSync(previous, { recursive: true, force: true });
    log(
      `Installed iOS bindings ${pin.ios.release}. Run pod install and rebuild the app.`
    );
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

try {
  await installIos();
  log(
    `Android uses com.utexo:rgb-lib-bfa-android:${pin.androidVersion} from Maven Central.`
  );
} catch (error) {
  const detail = error.stderr?.toString().trim() || error.message;
  if (!optional) throw new Error(`[rgb-lib] ${detail}`);
  console.warn(
    `[rgb-lib] iOS bindings were not installed; RGB_L1 is unavailable on iOS until \`npm run bindings:rgb-lib\` succeeds.\n${detail}`
  );
}
