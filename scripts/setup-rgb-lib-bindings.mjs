#!/usr/bin/env node
// Install an upstream UniFFI mobile bundle. This SDK does not compile or patch Rust.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(
  fs.readFileSync(path.join(root, 'src/bindings/rgb-lib/manifest.json'), 'utf8')
);
const args = process.argv.slice(2);
const from = args.includes('--from')
  ? args[args.indexOf('--from') + 1]
  : process.env.RGB_LIB_BINDINGS_DIR;
const platform = args.includes('--platform')
  ? args[args.indexOf('--platform') + 1]
  : process.platform === 'darwin'
    ? 'all'
    : 'android';
if (!['ios', 'android', 'all'].includes(platform))
  throw new Error('Use --platform ios|android|all');
if (!from) {
  if (args.includes('--optional')) {
    console.log(
      '[rgb-lib] Optional UniFFI bindings: set RGB_LIB_BINDINGS_DIR to install a matching mobile bundle.'
    );
    process.exit(0);
  }
  throw new Error(
    'Provide --from /path/to/mobile-bundle or set RGB_LIB_BINDINGS_DIR to a matching UniFFI mobile bundle.'
  );
}
const source = path.resolve(from);
const manifest = JSON.parse(
  fs.readFileSync(path.join(source, 'manifest.json'), 'utf8')
);
for (const field of [
  'version',
  'sourceRevision',
  'uniffiVersion',
  'swiftModule',
  'kotlinPackage',
]) {
  if (manifest[field] !== pin[field])
    throw new Error(`UniFFI bundle ${field} does not match this SDK`);
}
const checksum = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function verifyTree(relative) {
  const directory = path.join(source, relative);
  if (!fs.statSync(directory).isDirectory())
    throw new Error(`Missing ${relative}`);
  let count = 0;
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) {
        const name = path.relative(source, file).split(path.sep).join('/');
        if (manifest.checksums?.[name] !== checksum(file))
          throw new Error(`Invalid checksum: ${name}`);
        count++;
      } else throw new Error(`Unexpected bundle entry: ${file}`);
    }
  };
  visit(directory);
  if (!count) throw new Error(`Empty ${relative}`);
}
function install(directory, prepare) {
  const stage = directory + '.pending';
  const previous = directory + '.previous';
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  prepare(stage);
  fs.writeFileSync(
    path.join(stage, 'manifest.json'),
    JSON.stringify({ ...pin, checksums: manifest.checksums }, null, 2) + '\n'
  );
  fs.rmSync(previous, { recursive: true, force: true });
  if (fs.existsSync(directory)) fs.renameSync(directory, previous);
  try {
    fs.renameSync(stage, directory);
  } catch (error) {
    if (fs.existsSync(previous)) fs.renameSync(previous, directory);
    throw error;
  }
  fs.rmSync(previous, { recursive: true, force: true });
}
// Validate all requested artifacts before replacing any installed platform.
if (platform !== 'android') {
  verifyTree('ios/RGBLib.xcframework');
  verifyTree('ios/rgb_libFFI.xcframework');
}
if (platform !== 'ios') {
  if (
    manifest.checksums?.['android/rgb-lib-bfa.aar'] !==
    checksum(path.join(source, 'android/rgb-lib-bfa.aar'))
  )
    throw new Error('Invalid Android UniFFI AAR checksum');
}
if (platform !== 'android')
  install(path.join(root, 'ios/RgbLibBindings'), (stage) => {
    for (const name of ['RGBLib.xcframework', 'rgb_libFFI.xcframework'])
      fs.cpSync(path.join(source, 'ios', name), path.join(stage, name), {
        recursive: true,
      });
  });
if (platform !== 'ios')
  install(path.join(root, 'android/rgb-lib-maven'), (stage) => {
    const name = 'rgb-lib-bfa-android';
    const dir = path.join(stage, 'com/utexo', name, pin.androidVersion);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(
      path.join(source, 'android/rgb-lib-bfa.aar'),
      path.join(dir, `${name}-${pin.androidVersion}.aar`)
    );
    fs.writeFileSync(
      path.join(dir, `${name}-${pin.androidVersion}.pom`),
      `<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>com.utexo</groupId><artifactId>${name}</artifactId><version>${pin.androidVersion}</version><packaging>aar</packaging></project>\n`
    );
  });
console.log(
  `[rgb-lib] Installed ${pin.version} UniFFI bindings (${platform}). Rebuild the application; run pod install for iOS.`
);
