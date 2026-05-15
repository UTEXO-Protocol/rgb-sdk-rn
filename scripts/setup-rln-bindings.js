const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// iOS xcframework: extracted from swift-xcframework.zip if present (fallback for local builds).
// Android: resolved by Gradle via com.utexo:rgb-lightning-node-android — no zip needed.

const ROOT = path.join(__dirname, '..');
const SRC_BINDINGS = path.join(ROOT, 'src', 'bindings');

const IOS_ZIP = path.join(SRC_BINDINGS, 'swift-xcframework.zip');
const IOS_DIR = path.join(ROOT, 'ios');
const IOS_FRAMEWORK_DIR = path.join(IOS_DIR, 'RGBLightningNode.xcframework');

function unzip(zipPath, outDir) {
  execSync(`unzip -q -o "${zipPath}" -d "${outDir}"`, { stdio: 'inherit' });
}

function setupIos() {
  if (!fs.existsSync(IOS_ZIP)) {
    console.log('[rln-bindings] iOS zip not found in src/bindings, skipping.');
    return;
  }

  if (fs.existsSync(IOS_FRAMEWORK_DIR)) {
    console.log('[rln-bindings] RGBLightningNode.xcframework already exists, skipping.');
    return;
  }

  if (!fs.existsSync(IOS_DIR)) fs.mkdirSync(IOS_DIR, { recursive: true });
  unzip(IOS_ZIP, IOS_DIR);

  if (!fs.existsSync(IOS_FRAMEWORK_DIR)) {
    throw new Error('Failed to extract RGBLightningNode.xcframework');
  }
  console.log('[rln-bindings] iOS framework ready.');
}

try {
  setupIos();
  console.log('[rln-bindings] setup complete.');
} catch (e) {
  console.error(`[rln-bindings] setup failed: ${e.message}`);
  process.exit(1);
}
