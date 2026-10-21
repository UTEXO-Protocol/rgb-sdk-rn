import { UTEXOWallet } from './utexo-wallet';
import type {
  RlnWalletInit,
  RgbLibWalletInit,
  WalletInit,
} from './wallet-options';
import { WalletBackendError } from './backend-errors';
import { getRgbLibBinding } from '../binding/RgbLibBinding';
import {
  RGB_LIB_VERSION,
  RGB_LIB_REVISION,
  RGB_LIB_BRIDGE_VERSION,
} from './backends/rgb-lib/config';

export { RgbLibWallet } from './rgb-lib-wallet';
export type {
  RlnWalletInit,
  RgbLibWalletInit,
  WalletInit,
} from './wallet-options';
export type AnyUtexoWallet = UTEXOWallet<'RGB_LN'> | UTEXOWallet<'RGB_L1'>;

/** Optional shorthand for the public constructor. Both modes return UTEXOWallet. */
export function createUtexoWallet(input: RlnWalletInit): UTEXOWallet<'RGB_LN'>;
export function createUtexoWallet(
  input: RgbLibWalletInit
): UTEXOWallet<'RGB_L1'>;
export function createUtexoWallet(input: WalletInit): AnyUtexoWallet;
export function createUtexoWallet(input: WalletInit): AnyUtexoWallet {
  if (!input)
    throw new WalletBackendError(
      'INVALID_CONFIG',
      'Wallet configuration is required'
    );
  if (input.protocol === 'RGB_L1') return new UTEXOWallet(input);
  return new UTEXOWallet(input);
}

/** Restores an RGB Lib archive into a new, empty profile directory before init(). */
export async function restoreRgbLibBackup(params: {
  backupPath: string;
  password: string;
  storageDirPath: string;
}): Promise<void> {
  params = { ...params };
  if (
    !params ||
    !params.backupPath?.startsWith('/') ||
    !params.storageDirPath?.startsWith('/') ||
    typeof params.password !== 'string' ||
    !params.password ||
    params.backupPath.includes('\0') ||
    params.storageDirPath.includes('\0')
  ) {
    throw new WalletBackendError(
      'INVALID_CONFIG',
      'Restore requires absolute paths and a nonempty password'
    );
  }
  const native = getRgbLibBinding();
  const runtime = await native.getRuntimeInfo();
  if (
    runtime.version !== RGB_LIB_VERSION ||
    runtime.sourceRevision !== RGB_LIB_REVISION ||
    runtime.bridgeVersion !== RGB_LIB_BRIDGE_VERSION
  ) {
    throw new WalletBackendError(
      'NATIVE_VERSION_MISMATCH',
      'RGB Lib native artifacts do not match this SDK'
    );
  }
  await native.restoreBackup(
    params.backupPath,
    params.password,
    params.storageDirPath
  );
}
