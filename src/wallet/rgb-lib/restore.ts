import { asCause, WalletBackendError } from '../wallet-errors';
import type {
  RestoreBackupFromFileParams,
  RestoreFromBackupParams,
  WalletRestoreResponse,
} from '../types';
import { getRgbLibBinding, assertRuntime } from './native';
import { guardNative, toPublicError } from './errors';

type Operation = 'restoreBackupFromFile' | 'restoreFromBackup';

const invalid = (operation: Operation, message: string, cause?: unknown) =>
  new WalletBackendError(
    'INVALID_CONFIG',
    message,
    operation,
    'RGB_L1',
    cause === undefined ? undefined : asCause(cause)
  );

/**
 * Reads each parameter once (a getter may throw or change between reads),
 * then validates the captured values; only those reach native.
 */
function readParams(
  operation: Operation,
  params: RestoreBackupFromFileParams | RestoreFromBackupParams
) {
  let backupFilePath: unknown;
  let password: unknown;
  let dataDir: unknown;
  try {
    backupFilePath =
      operation === 'restoreFromBackup'
        ? (params as RestoreFromBackupParams).backupFilePath
        : (params as RestoreBackupFromFileParams).filePath;
    ({ password, dataDir } = params);
  } catch (error) {
    throw invalid(
      operation,
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
      operation,
      operation === 'restoreFromBackup'
        ? 'Restore requires an absolute backupFilePath and dataDir and a nonempty password'
        : 'Restore requires an absolute filePath and dataDir and a nonempty password'
    );
  }
  return { backupFilePath, password, dataDir };
}

/**
 * RGB_L1 only. Restores an `exportBackupToFile()` archive into a new, empty
 * wallet directory. Call it before `init()`, then create the wallet with
 * `storageDirPath: dataDir`. A backup restores only on this engine: a web
 * (`exportBackup()`) backup does not open here. RGB_LN restores from VSS
 * during `unlock()`.
 */
export async function restoreBackupFromFile(
  params: RestoreBackupFromFileParams
): Promise<WalletRestoreResponse> {
  return restoreWith('restoreBackupFromFile', params, getRgbLibBinding);
}

/** @deprecated Use `restoreBackupFromFile({ filePath, password, dataDir })`. */
export async function restoreFromBackup(
  params: RestoreFromBackupParams
): Promise<WalletRestoreResponse> {
  return restoreWith('restoreFromBackup', params, getRgbLibBinding);
}

/** @internal Transport-injectable implementation; not exported from the package. */
export async function restoreFromBackupWith(
  params: RestoreFromBackupParams,
  loadBinding: typeof getRgbLibBinding
): Promise<WalletRestoreResponse> {
  return restoreWith('restoreFromBackup', params, loadBinding);
}

/** @internal Transport-injectable implementation; not exported from the package. */
export async function restoreBackupFromFileWith(
  params: RestoreBackupFromFileParams,
  loadBinding: typeof getRgbLibBinding
): Promise<WalletRestoreResponse> {
  return restoreWith('restoreBackupFromFile', params, loadBinding);
}

async function restoreWith(
  operation: Operation,
  params: RestoreBackupFromFileParams | RestoreFromBackupParams,
  loadBinding: typeof getRgbLibBinding
): Promise<WalletRestoreResponse> {
  const { backupFilePath, password, dataDir } = readParams(operation, params);
  try {
    const native = guardNative(loadBinding());
    const runtime = await native.getRuntimeInfo();
    assertRuntime(runtime);
    await native.restoreBackup(backupFilePath, password, dataDir);
  } catch (error) {
    // Report the public name, not the native method (`restoreBackup`).
    throw toPublicError(error, operation);
  }
  return { message: 'Wallet restored successfully' };
}
