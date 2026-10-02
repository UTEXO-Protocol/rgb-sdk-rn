import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const { validateIosBindings } = createRequire(import.meta.url)(
  './download-rln-bindings.js'
);

test('installer rejects old or missing bindings and accepts the required BFA surface', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rln-bindings-test-'));
  try {
    assert.throws(
      () => validateIosBindings(directory),
      /Missing RGBLightningNode.swift/
    );
    const filename = join(directory, 'RGBLightningNode.swift');
    writeFileSync(filename, 'public func listAssets() {}');
    assert.throws(() => validateIosBindings(directory), /Incompatible RLN/);
    writeFileSync(
      filename,
      'func burn(\nfunc getConsignment(\nfunc getConsignmentPath(\nstruct AssetBfa\nethRpcUrl:'
    );
    assert.doesNotThrow(() => validateIosBindings(directory));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
