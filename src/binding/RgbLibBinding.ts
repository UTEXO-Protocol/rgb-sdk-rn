import NativeRgbLib from './NativeRgbLib';
import type { Spec } from './NativeRgbLib';
import { WalletBackendError } from '../wallet/backend-errors';

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
