// Runs with RN_STUB_WITHOUT_RLN=1: the app was built without the RLN native module.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UTEXOWallet,
  PasswordRLNSigner,
  WalletBackendError,
} from '../lib/module/index.js';

const nodeParams = {
  network: 'regtest',
  storageDirPath: '/wallets/rln/unavailable',
  daemonListeningPort: 3001,
  ldkPeerListeningPort: 9735,
};

function assertRlnUnavailable(error) {
  assert.ok(error instanceof WalletBackendError);
  assert.equal(error.code, 'NATIVE_BACKEND_UNAVAILABLE');
  assert.equal(error.protocol, 'RGB_LN');
  assert.match(error.message, /RGB_LN \(Lightning\) is not available/);
  return true;
}

test('the SDK imports without the RLN native module', () => {
  assert.equal(typeof UTEXOWallet, 'function');
});

test('RGB_LN options form throws in the constructor', () => {
  assert.throws(
    () =>
      new UTEXOWallet({
        protocol: 'RGB_LN',
        params: nodeParams,
        signer: new PasswordRLNSigner('password'),
      }),
    assertRlnUnavailable
  );
});

test('legacy (params, signer) form throws in the constructor', () => {
  assert.throws(
    () => new UTEXOWallet(nodeParams, new PasswordRLNSigner('password')),
    assertRlnUnavailable
  );
});

test('RGB_L1 wallets are still created', () => {
  const wallet = new UTEXOWallet({
    params: {
      network: 'regtest',
      storageDirPath: '/wallets/rgb-lib/unavailable',
    },
    keys: {
      getMnemonic: async () => {
        throw new Error('not called');
      },
    },
  });
  assert.equal(wallet.protocol, 'RGB_L1');
});
