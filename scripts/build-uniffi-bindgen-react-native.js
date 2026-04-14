/**
 * bdk-rn depends on uniffi-bindgen-react-native, which ships TS sources and
 * expects `typescript/dist/index.js` to exist after `tsc`. npm hoists that
 * package to the app root, so a fixed `cd node_modules/uniffi-bindgen-react-native`
 * from this package fails. Resolve the real install path, then run `tsc`.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createRequire } = require('module');

const packageRoot = path.join(__dirname, '..');

function findUniffiBindgenDir() {
  const req = createRequire(path.join(packageRoot, 'package.json'));
  try {
    return path.dirname(
      req.resolve('uniffi-bindgen-react-native/package.json')
    );
  } catch {
    // Fallback: walk up (covers some pnpm / nested layouts)
  }

  let dir = packageRoot;
  for (let i = 0; i < 25; i++) {
    const candidate =
      path.basename(dir) === 'node_modules'
        ? path.join(dir, 'uniffi-bindgen-react-native')
        : path.join(dir, 'node_modules', 'uniffi-bindgen-react-native');
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

const uniffiDir = findUniffiBindgenDir();
if (!uniffiDir) {
  console.error(
    'Could not find uniffi-bindgen-react-native (required by bdk-rn). Run npm install from your app root.'
  );
  process.exit(1);
}

const distIndex = path.join(uniffiDir, 'typescript', 'dist', 'index.js');
if (fs.existsSync(distIndex)) {
  console.log(
    'uniffi-bindgen-react-native: typescript/dist already present, skipping tsc'
  );
  process.exit(0);
}

console.log('uniffi-bindgen-react-native: building TypeScript in', uniffiDir);
try {
  execSync('npx tsc --project tsconfig.json', {
    cwd: uniffiDir,
    stdio: 'inherit',
    env: process.env,
  });
} catch {
  process.exit(1);
}
