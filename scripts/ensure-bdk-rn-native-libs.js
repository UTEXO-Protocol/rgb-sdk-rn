'use strict';

/**
 * The published bdk-rn tarball ships prebuilt libbdkffi.a under android/src/main/jniLibs.
 * Occasionally installs end up without those binaries (incomplete extract, cache, etc.).
 * CMake then fails: missing libbdkffi.a for arm64-v8a.
 *
 * If jniLibs are absent, re-download the release tarball for the installed bdk-rn version
 * and copy jniLibs (and merge xcframework slices if any static libs are missing).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

function readPkg(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function androidLibPresent(bdkRoot) {
  const marker = path.join(
    bdkRoot,
    'android/src/main/jniLibs/arm64-v8a/libbdkffi.a'
  );
  return fs.existsSync(marker);
}

function xcframeworkSlicesMissing(bdkRoot) {
  const roots = [
    path.join(
      bdkRoot,
      'BdkRnFramework.xcframework/ios-arm64/libbdkffi.a'
    ),
    path.join(
      bdkRoot,
      'BdkRnFramework.xcframework/ios-arm64_x86_64-simulator/libbdkffi.a'
    ),
  ];
  return roots.some((p) => !fs.existsSync(p));
}

function main() {
  let bdkPkgPath;
  try {
    bdkPkgPath = require.resolve('bdk-rn/package.json');
  } catch {
    console.warn('[ensure-bdk-rn-native-libs] bdk-rn not installed; skip.');
    process.exit(0);
  }

  const bdkRoot = path.dirname(bdkPkgPath);
  const needAndroid = !androidLibPresent(bdkRoot);
  const needIos = xcframeworkSlicesMissing(bdkRoot);

  if (!needAndroid && !needIos) {
    return;
  }

  const pkg = readPkg(bdkPkgPath);
  const version = pkg.version;
  const tag = `v${version}`;
  const tarballUrl = `https://github.com/UTEXO-Protocol/bdk-rn/releases/download/${tag}/bdk-rn-${version}.tgz`;

  console.warn(
    `[ensure-bdk-rn-native-libs] Restoring native libs from ${tarballUrl}`
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdk-rn-native-'));
  const tgz = path.join(tmpDir, 'bdk-rn.tgz');

  try {
    execFileSync('curl', ['-fsSL', '-o', tgz, tarballUrl], {
      stdio: 'inherit',
    });

    execFileSync('tar', ['-xzf', tgz, '-C', tmpDir], { stdio: 'inherit' });

    const unpacked = path.join(tmpDir, 'package');

    if (needAndroid) {
      const srcJni = path.join(unpacked, 'android/src/main/jniLibs');
      const destJni = path.join(bdkRoot, 'android/src/main/jniLibs');
      fs.mkdirSync(path.dirname(destJni), { recursive: true });
      fs.cpSync(srcJni, destJni, { recursive: true });
    }

    if (needIos) {
      const srcXc = path.join(unpacked, 'BdkRnFramework.xcframework');
      const destXc = path.join(bdkRoot, 'BdkRnFramework.xcframework');
      fs.cpSync(srcXc, destXc, { recursive: true });
    }

    if (!androidLibPresent(bdkRoot)) {
      throw new Error(
        `Android lib still missing after restore: ${path.join(
          bdkRoot,
          'android/src/main/jniLibs/arm64-v8a/libbdkffi.a'
        )}`
      );
    }

    console.warn('[ensure-bdk-rn-native-libs] Done.');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
