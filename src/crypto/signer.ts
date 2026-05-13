import { CryptoError } from '@utexo/rgb-sdk-core';
import type { Network, EstimateFeeResult } from '@utexo/rgb-sdk-core';

export interface SignPsbtOptions {
  // Reserved for future options
}

export async function signPsbt(
  _mnemonic: string,
  _psbtBase64: string,
  _network: Network = 'testnet'
): Promise<string> {
  throw new CryptoError(
    'signPsbt is unavailable: bdk-rn was removed from this SDK. Use NativeExternalRLNSigner for PSBT signing.'
  );
}

export async function signPsbtFromSeed(
  _seed: string | Uint8Array,
  _psbtBase64: string,
  _network: Network = 'testnet',
  _options: SignPsbtOptions = {}
): Promise<string> {
  throw new CryptoError(
    'signPsbtFromSeed is unavailable: bdk-rn was removed from this SDK. Use NativeExternalRLNSigner for PSBT signing.'
  );
}

export async function estimatePsbt(
  _psbtBase64: string
): Promise<EstimateFeeResult> {
  throw new CryptoError(
    'estimatePsbt is unavailable: bdk-rn was removed from this SDK.'
  );
}
