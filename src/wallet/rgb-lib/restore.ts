import { WalletBackendError } from '../wallet-errors';
import { getRgbLibBinding, assertRuntime } from './native';
import { guardNative } from './errors';

/** Restores an RGB Lib archive into a new, empty profile directory before init(). */
export async function restoreRgbLibBackup(params: {
  backupPath: string;
  password: string;
  storageDirPath: string;
}): Promise<void> {
  return restoreRgbLibBackupWith(params, getRgbLibBinding);
}

/** @internal Transport-injectable implementation; not exported from the package. */
export async function restoreRgbLibBackupWith(
  params: { backupPath: string; password: string; storageDirPath: string },
  loadBinding: typeof getRgbLibBinding
): Promise<void> {
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
      'Restore requires absolute paths and a nonempty password',
      undefined,
      'RGB_L1'
    );
  }
  params = { ...params };
  const native = guardNative(loadBinding());
  const runtime = await native.getRuntimeInfo();
  assertRuntime(runtime);
  await native.restoreBackup(
    params.backupPath,
    params.password,
    params.storageDirPath
  );
}
