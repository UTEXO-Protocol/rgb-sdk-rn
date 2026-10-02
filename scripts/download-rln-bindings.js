const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// iOS xcframework is downloaded from GitHub releases,
// or used from a local zip in src/bindings/ if present.
// Android AAR is resolved from Maven Central by Gradle — no download needed here.

// Set this to a published BFA-capable release; beta.3 is incompatible.
const VERSION = process.env.UTEXO_RLN_IOS_VERSION;
const BASE_URL = `https://github.com/UTEXO-Protocol/rgb-lightning-node/releases/download/v${VERSION}`;

const ROOT = path.join(__dirname, '..');
const SRC_BINDINGS = path.join(ROOT, 'src', 'bindings');
const LOCAL_IOS_ZIP =
  process.env.UTEXO_RLN_IOS_ARCHIVE ||
  path.join(SRC_BINDINGS, 'swift-release.zip');

const IOS_DIR = path.join(ROOT, 'ios');
const IOS_ZIP = path.join(IOS_DIR, 'rgb-lightning-node-swift.zip');
const IOS_FRAMEWORK_DIR = path.join(IOS_DIR, 'RGBLightningNode.xcframework');

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    const req = https
      .get(url, { timeout: 60000 }, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close();
          fs.unlinkSync(dest);
          return downloadFile(response.headers.location, dest)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
          reject(
            new Error(
              `Failed to download: ${response.statusCode} ${response.statusMessage}`
            )
          );
          return;
        }

        let downloaded = 0;
        response.on('data', (chunk) => {
          downloaded += chunk.length;
          process.stdout.write(
            `\r  ${(downloaded / 1024 / 1024).toFixed(1)} MB`
          );
        });

        response.pipe(file);

        file.on('finish', () => {
          process.stdout.write('\n');
          file.close();
          resolve();
        });
      })
      .on('timeout', () => {
        req.destroy();
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(new Error('Download timed out after 30s'));
      })
      .on('error', (err) => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
  });
}

function unzip(zipPath, outDir) {
  execFileSync('unzip', ['-q', '-o', zipPath, '-d', outDir], {
    stdio: 'inherit',
  });
}

function validateIosBindings(directory) {
  const swiftPath = path.join(directory, 'RGBLightningNode.swift');
  if (!fs.existsSync(swiftPath))
    throw new Error(
      'Missing RGBLightningNode.swift alongside the native framework'
    );
  const swift = fs.readFileSync(swiftPath, 'utf8');
  const required = [
    'func burn(',
    'func getConsignment(',
    'func getConsignmentPath(',
    'struct AssetBfa',
    'ethRpcUrl:',
  ];
  const missing = required.filter((symbol) => !swift.includes(symbol));
  if (missing.length)
    throw new Error(
      `Incompatible RLN iOS bindings (missing ${missing.join(', ')}). Install a BFA-capable build; 0.13.0-beta.3 is unsupported.`
    );
}

async function setupIos() {
  if (process.platform !== 'darwin') {
    console.log('[rln] Skipping iOS framework: not macOS.');
    return;
  }

  if (fs.existsSync(IOS_FRAMEWORK_DIR)) {
    validateIosBindings(IOS_DIR);
    console.log('[rln] RGBLightningNode.xcframework already exists, skipping.');
    return;
  }

  if (!fs.existsSync(LOCAL_IOS_ZIP) && !VERSION) {
    throw new Error(
      'A BFA-capable RLN iOS build is required. Set UTEXO_RLN_IOS_ARCHIVE to your build archive or UTEXO_RLN_IOS_VERSION to a published compatible release.'
    );
  }
  if (VERSION && !/^[0-9][0-9A-Za-z.+-]*$/.test(VERSION))
    throw new Error('Invalid UTEXO_RLN_IOS_VERSION');
  if (!fs.existsSync(IOS_DIR)) fs.mkdirSync(IOS_DIR, { recursive: true });

  // Extract to a temp dir — the zip contains a swift/ subdirectory
  const tmpDir = path.join(IOS_DIR, '.tmp-rln-swift');
  if (fs.existsSync(tmpDir))
    fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  if (fs.existsSync(LOCAL_IOS_ZIP)) {
    // Local wrapper zip found — extract the inner release zip from it
    console.log(`[rln] Using local iOS zip: ${LOCAL_IOS_ZIP}`);
    const innerTmp = path.join(IOS_DIR, '.tmp-rln-swift-inner');
    if (fs.existsSync(innerTmp))
      fs.rmSync(innerTmp, { recursive: true, force: true });
    fs.mkdirSync(innerTmp, { recursive: true });
    unzip(LOCAL_IOS_ZIP, innerTmp);
    const innerZip = fs.readdirSync(innerTmp).find((f) => f.endsWith('.zip'));
    if (innerZip) fs.renameSync(path.join(innerTmp, innerZip), IOS_ZIP);
    else if (
      fs.existsSync(path.join(innerTmp, 'swift', 'RGBLightningNode.swift'))
    )
      fs.copyFileSync(LOCAL_IOS_ZIP, IOS_ZIP);
    else
      throw new Error('Archive must contain a release zip or swift/ bindings');
    fs.rmSync(innerTmp, { recursive: true, force: true });
  } else {
    const url = `${BASE_URL}/rgb-lightning-node-swift-${VERSION}.zip`;
    console.log(`[rln] Downloading iOS xcframework (${VERSION})...`);
    await downloadFile(url, IOS_ZIP);
  }

  console.log('[rln] Extracting...');
  unzip(IOS_ZIP, tmpDir);
  fs.unlinkSync(IOS_ZIP);

  // The zip extracts as swift/{xcframework,swift,header files}
  const swiftDir = path.join(tmpDir, 'swift');
  const srcFramework = path.join(swiftDir, 'RGBLightningNode.xcframework');
  if (!fs.existsSync(srcFramework)) {
    throw new Error(
      'RGBLightningNode.xcframework not found inside swift/ in zip'
    );
  }

  validateIosBindings(swiftDir);

  // Move xcframework to ios/
  fs.cpSync(srcFramework, IOS_FRAMEWORK_DIR, { recursive: true });

  // Update generated binding files (Swift wrapper + FFI header + modulemap)
  for (const file of [
    'RGBLightningNode.swift',
    'RGBLightningNodeFFI.h',
    'RGBLightningNodeFFI.modulemap',
  ]) {
    const src = path.join(swiftDir, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(IOS_DIR, file));
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('[rln] RGBLightningNode.xcframework ready.');
}

if (require.main === module)
  (async () => {
    try {
      await setupIos();
      console.log('[rln] Done.');
    } catch (err) {
      console.error(`[rln] Error: ${err.message}`);
      process.exit(1);
    }
  })();

module.exports = { validateIosBindings };
