import { WalletBackendError } from '../wallet-errors';
import type { RestoreFromBackupParams, WalletRestoreResponse } from '../types';
import { getRgbLibBinding, assertRuntime } from './native';
import { guardNative } from './errors';

/**
 * RGB_L1 only. Restores a `createBackup()` archive into a new, empty wallet
 * directory. Call it before `init()`, then create the wallet with
 * `storageDirPath: dataDir`. RGB_LN restores from VSS during `unlock()`.
 */
export async function restoreFromBackup(
  params: RestoreFromBackupParams
): Promise<WalletRestoreResponse> {
  return restoreFromBackupWith(params, getRgbLibBinding);
}

/** @internal Transport-injectable implementation; not exported from the package. */
export async function restoreFromBackupWith(
  params: RestoreFromBackupParams,
  loadBinding: typeof getRgbLibBinding
): Promise<WalletRestoreResponse> {
  if (
    !params ||
    typeof params.backupFilePath !== 'string' ||
    !params.backupFilePath.startsWith('/') ||
    typeof params.dataDir !== 'string' ||
    !params.dataDir.startsWith('/') ||
    typeof params.password !== 'string' ||
    !params.password ||
    params.backupFilePath.includes('\0') ||
    params.dataDir.includes('\0')
  ) {
    throw new WalletBackendError(
      'INVALID_CONFIG',
      'Restore requires an absolute backupFilePath and dataDir and a nonempty password',
      undefined,
      'RGB_L1'
    );
  }
  const { backupFilePath, password, dataDir } = params;
  const native = guardNative(loadBinding());
  const runtime = await native.getRuntimeInfo();
  assertRuntime(runtime);
  await native.restoreBackup(backupFilePath, password, dataDir);
  return { message: 'Wallet restored successfully' };
}
