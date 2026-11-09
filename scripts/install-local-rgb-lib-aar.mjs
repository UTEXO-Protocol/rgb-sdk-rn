// Install an externally built v6 AAR without committing native binaries.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(
  fs.readFileSync(path.join(root, 'src/bindings/rgb-lib/manifest.json'))
);
const input = process.argv[2];
if (!input || !pin.localAndroidBuild) {
  throw new Error(
    'Usage: npm run bindings:rgb-lib:android -- /path/to/rgb-lib-bfa-v6-release.aar'
  );
}
const aar = path.resolve(input);
const provenance = JSON.parse(
  execFileSync('unzip', ['-p', aar, 'assets/rgb-lib-bfa-version.json'], {
    encoding: 'utf8',
  })
);
if (
  provenance.version !== pin.version ||
  provenance.source_commit !== pin.sourceRevision ||
  provenance.uniffi_version !== pin.uniffiVersion
) {
  throw new Error(
    'AAR provenance does not match the pinned version, source revision and UniFFI version'
  );
}
const dest = path.join(
  root,
  'android/local-maven/com/utexo/rgb-lib-bfa-android',
  pin.version
);
const stem = `rgb-lib-bfa-android-${pin.version}`;
if (fs.existsSync(path.join(dest, `${stem}.aar`))) {
  throw new Error(
    `An AAR is already installed at ${dest}; use a fresh SDK checkout to replace it`
  );
}
fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(aar, path.join(dest, `${stem}.aar`));
fs.writeFileSync(
  path.join(dest, `${stem}.pom`),
  `<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>com.utexo</groupId><artifactId>rgb-lib-bfa-android</artifactId><version>${pin.version}</version><packaging>aar</packaging></project>\n`
);
console.log(`Installed the pinned local Android AAR at ${dest}`);
