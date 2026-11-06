import { asCause, WalletBackendError } from '../wallet-errors';
import type { RestoreFromBackupParams, WalletRestoreResponse } from '../types';
import { getRgbLibBinding, assertRuntime } from './native';
import { guardNative, toPublicError } from './errors';

const OPERATION = 'restoreFromBackup';

const invalid = (message: string, cause?: unknown) =>
  new WalletBackendError(
    'INVALID_CONFIG',
    message,
    OPERATION,
    'RGB_L1',
    cause === undefined ? undefined : asCause(cause)
  );

/**
 * Reads each parameter once (a getter may throw or change between reads),
 * then validates the captured values; only those reach native.
 */
function readParams(params: RestoreFromBackupParams) {
  let backupFilePath: unknown;
  let password: unknown;
  let dataDir: unknown;
  try {
    ({ backupFilePath, password, dataDir } = params);
  } catch (error) {
    throw invalid(
      params == null
        ? 'Restore requires parameters'
        : 'Could not read the restore parameters',
      params == null ? undefined : error
    );
  }
  if (
    typeof backupFilePath !== 'string' ||
    !backupFilePath.startsWith('/') ||
    backupFilePath.includes('\0') ||
    typeof dataDir !== 'string' ||
    !dataDir.startsWith('/') ||
    dataDir.includes('\0') ||
    typeof password !== 'string' ||
    !password
  ) {
    throw invalid(
      'Restore requires an absolute backupFilePath and dataDir and a nonempty password'
    );
  }
  return { backupFilePath, password, dataDir };
}

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
  const { backupFilePath, password, dataDir } = readParams(params);
  try {
    const native = guardNative(loadBinding());
    const runtime = await native.getRuntimeInfo();
    assertRuntime(runtime);
    await native.restoreBackup(backupFilePath, password, dataDir);
  } catch (error) {
    // Report the public name, not the native method (`restoreBackup`).
    throw toPublicError(error, OPERATION);
  }
  return { message: 'Wallet restored successfully' };
}
