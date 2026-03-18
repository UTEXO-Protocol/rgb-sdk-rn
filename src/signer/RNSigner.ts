/**
 * RNSigner — React Native implementation of ISigner.
 *
 * Delegates to signer.ts which uses bdk-rn for PSBT signing.
 * Message signing uses the pure @scure/* implementation from core.
 */
import type { ISigner } from '@utexo/rgb-sdk-core';
import type { Network, EstimateFeeResult } from '@utexo/rgb-sdk-core';
import { signMessage, verifyMessage } from '@utexo/rgb-sdk-core';
import { signPsbt, signPsbtFromSeed, estimatePsbt } from '../crypto/signer';

export class RNSigner implements ISigner {
  async signPsbtWithMnemonic(
    mnemonic: string,
    psbt: string,
    network: Network
  ): Promise<string> {
    return signPsbt(mnemonic, psbt, network);
  }

  async signPsbtWithSeed(
    seed: Uint8Array,
    psbt: string,
    network: Network
  ): Promise<string> {
    return signPsbtFromSeed(seed, psbt, network);
  }

  async signMessage(params: {
    message: string | Uint8Array;
    seed: Uint8Array;
    network: Network;
  }): Promise<string> {
    return signMessage(params);
  }

  async verifyMessage(params: {
    message: string | Uint8Array;
    signature: string;
    accountXpub: string;
    network: Network;
  }): Promise<boolean> {
    return verifyMessage(params);
  }

  async estimateFee(psbt: string): Promise<EstimateFeeResult> {
    return estimatePsbt(psbt);
  }
}
