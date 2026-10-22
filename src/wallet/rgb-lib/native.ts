import NativeRgbLib from '../../binding/NativeRgbLib';
import type { Spec, NativeRuntimeInfo } from '../../binding/NativeRgbLib';
import { WalletBackendError } from '../wallet-errors';
import {
  RGB_LIB_VERSION,
  RGB_LIB_REVISION,
  RGB_LIB_BRIDGE_VERSION,
} from './config';

/** Session creation and archive restore must accept exactly the same runtime. */
export function assertRuntime(runtime: NativeRuntimeInfo): void {
  if (
    runtime.version !== RGB_LIB_VERSION ||
    runtime.sourceRevision !== RGB_LIB_REVISION ||
    runtime.bridgeVersion !== RGB_LIB_BRIDGE_VERSION
  ) {
    throw new WalletBackendError(
      'NATIVE_VERSION_MISMATCH',
      'RGB Lib native artifacts do not match this SDK',
      undefined,
      'RGB_L1'
    );
  }
}

/** Native transport. Session ownership and serialization live in the backend. */
export function getRgbLibBinding(): Spec {
  if (!NativeRgbLib) {
    throw new WalletBackendError(
      'NATIVE_BACKEND_UNAVAILABLE',
      'RGB Lib native bindings are not installed. Build/install RGB Lib artifacts and rebuild the app.',
      undefined,
      'RGB_L1'
    );
  }
  return NativeRgbLib;
}
