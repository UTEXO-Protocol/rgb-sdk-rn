#!/usr/bin/env node
// Stage a locally built, verified Android artifact. No download or publication.
import { readFileSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/stage-bfa-native.mjs <RLN artifact directory>');
}
const version = '0.17.0-bfa.local.2';
const revision = '3f571ac58909400046d69143ebb535f4da1f4d42';
const source = resolve(input);
const metadata = JSON.parse(readFileSync(join(source, 'native-provenance.json'), 'utf8'));
const artifact = join(source, `rgb-lightning-node-android-${version}.aar`);
const digest = data => createHash('sha256').update(data).digest('hex');
const native = execFileSync('unzip', ['-p', artifact, 'jni/arm64-v8a/librgb_lightning_node.so'], {
  maxBuffer: 512 * 1024 * 1024,
});
const buildInfo = `rgb-lib=${revision};proxy=1.0;vss=off;lightning=off;android-ca=apex-preferred;proxy-http=1.1;decode-cause=on`;
if (metadata.rgb_lib_sha !== revision || metadata.abi !== 'arm64-v8a' ||
    metadata.vss !== false || metadata.lightning_runtime !== false ||
    metadata.aar_sha256 !== digest(readFileSync(artifact)) ||
    metadata.native_sha256 !== digest(native) || !native.includes(Buffer.from(buildInfo))) {
  throw new Error('The Android artifact does not match the expected BFA build/provenance');
}
const output = join(root, 'android/local-maven/com/utexo/local/rgb-lightning-node-android', version);
mkdirSync(output, { recursive: true });
copyFileSync(artifact, join(output, `rgb-lightning-node-android-${version}.aar`));
writeFileSync(join(output, `rgb-lightning-node-android-${version}.pom`),
  `<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>` +
  `<groupId>com.utexo.local</groupId><artifactId>rgb-lightning-node-android</artifactId>` +
  `<version>${version}</version><packaging>aar</packaging><dependencies>` +
  `<dependency><groupId>net.java.dev.jna</groupId><artifactId>jna</artifactId>` +
  `<version>5.17.0</version><type>aar</type></dependency>` +
  `<dependency><groupId>androidx.annotation</groupId><artifactId>annotation</artifactId>` +
  `<version>1.9.1</version></dependency></dependencies></project>\n`);
writeFileSync(join(root, 'android/local-maven/native-provenance.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log('Verified BFA Android artifact staged in the SDK local Maven repository.');
