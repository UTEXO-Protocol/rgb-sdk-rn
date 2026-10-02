const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// iOS xcframework is downloaded from the pinned GitHub release.
// Android AAR is resolved from Maven Central by Gradle — no download needed here.

const VERSION = '0.15.0-beta.3';
const BASE_URL = `https://github.com/UTEXO-Protocol/rgb-lightning-node/releases/download/v${VERSION}`;

const ROOT = path.join(__dirname, '..');
const IOS_DIR = path.join(ROOT, 'ios');
const IOS_ZIP = path.join(IOS_DIR, 'rgb-lightning-node-swift.zip');
const IOS_FRAMEWORK_DIR = path.join(IOS_DIR, 'RGBLightningNode.xcframework');
const IOS_VERSION_FILE = path.join(IOS_DIR, '.rln-ios-version');

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

async function setupIos() {
  if (process.platform !== 'darwin') {
    console.log('[rln] Skipping iOS framework: not macOS.');
    return;
  }

  if (
    fs.existsSync(IOS_FRAMEWORK_DIR) &&
    fs.existsSync(IOS_VERSION_FILE) &&
    fs.readFileSync(IOS_VERSION_FILE, 'utf8').trim() === VERSION
  ) {
    console.log(
      `[rln] RGBLightningNode.xcframework (${VERSION}) already installed, skipping.`
    );
    return;
  }

  if (!fs.existsSync(IOS_DIR)) fs.mkdirSync(IOS_DIR, { recursive: true });

  // Extract to a temp dir — the zip contains a swift/ subdirectory
  const tmpDir = path.join(IOS_DIR, '.tmp-rln-swift');
  if (fs.existsSync(tmpDir))
    fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const url = `${BASE_URL}/rgb-lightning-node-swift-${VERSION}.zip`;
  console.log(`[rln] Downloading iOS xcframework (${VERSION})...`);
  await downloadFile(url, IOS_ZIP);

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

  // Replace the previous framework after extracting the release.
  fs.rmSync(IOS_VERSION_FILE, { force: true });
  fs.rmSync(IOS_FRAMEWORK_DIR, { recursive: true, force: true });
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
  fs.writeFileSync(IOS_VERSION_FILE, `${VERSION}\n`);
  console.log('[rln] RGBLightningNode.xcframework ready.');
}

(async () => {
  try {
    await setupIos();
    console.log('[rln] Done.');
  } catch (err) {
    console.error(`[rln] Error: ${err.message}`);
    process.exit(1);
  }
})();
