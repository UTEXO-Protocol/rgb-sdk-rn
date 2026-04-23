const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC_BINDINGS = path.join(ROOT, 'src', 'bindings');

const IOS_ZIP = path.join(SRC_BINDINGS, 'swift-xcframework.zip');
const IOS_DIR = path.join(ROOT, 'ios');
const IOS_FRAMEWORK_DIR = path.join(IOS_DIR, 'RGBLightningNode.xcframework');

const ANDROID_ZIP = path.join(SRC_BINDINGS, 'kotlin-android-jni.zip');
const ANDROID_DIR = path.join(ROOT, 'android');
const ANDROID_JNI_DIR = path.join(ANDROID_DIR, 'src', 'main', 'jniLibs');
const ANDROID_KT_OUT_DIR = path.join(
  ANDROID_DIR,
  'src',
  'main',
  'java',
  'org',
  'utexo',
  'rgblightningnode'
);

function unzip(zipPath, outDir) {
  execSync(`unzip -q -o "${zipPath}" -d "${outDir}"`, { stdio: 'inherit' });
}

function removeIfExists(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function setupIos() {
  if (!fs.existsSync(IOS_ZIP)) {
    console.log('[rln-bindings] iOS zip not found, skipping.');
    return;
  }

  ensureDir(IOS_DIR);
  removeIfExists(IOS_FRAMEWORK_DIR);
  unzip(IOS_ZIP, IOS_DIR);

  if (!fs.existsSync(IOS_FRAMEWORK_DIR)) {
    throw new Error('Failed to extract RGBLightningNode.xcframework');
  }
  console.log('[rln-bindings] iOS framework ready.');
}

function setupAndroid() {
  if (!fs.existsSync(ANDROID_ZIP)) {
    console.log('[rln-bindings] Android zip not found, skipping.');
    return;
  }

  const tempDir = path.join(SRC_BINDINGS, '.tmp-rln-android');
  removeIfExists(tempDir);
  ensureDir(tempDir);

  unzip(ANDROID_ZIP, tempDir);

  const extractedJniDir = path.join(tempDir, 'jniLibs');
  const extractedKt = path.join(
    tempDir,
    'org',
    'utexo',
    'rgblightningnode',
    'rgb_lightning_node.kt'
  );

  if (!fs.existsSync(extractedJniDir)) {
    throw new Error('Android jniLibs not found in artifact');
  }
  if (!fs.existsSync(extractedKt)) {
    throw new Error('Android Kotlin wrapper not found in artifact');
  }

  removeIfExists(ANDROID_JNI_DIR);
  ensureDir(path.dirname(ANDROID_JNI_DIR));
  fs.cpSync(extractedJniDir, ANDROID_JNI_DIR, { recursive: true });

  ensureDir(ANDROID_KT_OUT_DIR);
  fs.copyFileSync(
    extractedKt,
    path.join(ANDROID_KT_OUT_DIR, 'rgb_lightning_node.kt')
  );

  removeIfExists(tempDir);
  console.log('[rln-bindings] Android JNI + Kotlin wrapper ready.');
}

try {
  setupIos();
  setupAndroid();
  console.log('[rln-bindings] setup complete.');
} catch (e) {
  console.error(`[rln-bindings] setup failed: ${e.message}`);
  process.exit(1);
}
