// RGB PSBT Signer — bdk-rn-based signing for rgb-lib PSBTs.
// Handles both create_utxo_begin and send_begin PSBT types.

import {
  Network as BDKNetwork,
  Descriptor,
  Wallet,
  Persister,
  Psbt,
} from 'bdk-rn';
import {
  ValidationError,
  CryptoError,
  validateMnemonic,
  validatePsbt,
  normalizeNetwork,
  bip39,
  bip32Factory,
  calculateMasterFingerprint,
  getNetworkVersions,
  detectPsbtType,
  deriveDescriptors,
} from '@utexo/rgb-sdk-core';
import type { Network, EstimateFeeResult, PsbtType } from '@utexo/rgb-sdk-core';

export interface SignPsbtOptions {
  // Reserved for future options
}

function toBDKNetwork(network: Network): BDKNetwork {
  const NetworkEnum = BDKNetwork as any;
  switch (network) {
    case 'mainnet':
      return NetworkEnum.Mainnet;
    case 'testnet':
      return NetworkEnum.Testnet;
    case 'signet':
    case 'utexo':
      return NetworkEnum.Signet;
    case 'regtest':
      return NetworkEnum.Regtest;
    default:
      return NetworkEnum.Testnet;
  }
}

export async function signPsbt(
  mnemonic: string,
  psbtBase64: string,
  network: Network = 'testnet'
): Promise<string> {
  try {
    validateMnemonic(mnemonic, 'mnemonic');
    validatePsbt(psbtBase64, 'psbtBase64');

    const normalizedNetwork = normalizeNetwork(network);
    // utexo shares BDK's signet parameters — toBDKNetwork handles the mapping
    const bdkNetwork = toBDKNetwork(normalizedNetwork);
    // utexo and signet share the same BIP32 derivation paths
    const bip32Network: Network = normalizedNetwork === 'utexo' ? 'signet' : normalizedNetwork;

    const seed = bip39.mnemonicToSeedSync(mnemonic.trim());
    const rootNode = bip32Factory().fromSeed(
      seed,
      getNetworkVersions(normalizedNetwork)
    );
    const fp = await calculateMasterFingerprint(rootNode);
    const psbtType = detectPsbtType(psbtBase64);

    // Try signing with the detected descriptor type; fall back to the other if it fails.
    // No PSBT preprocessing needed — rgb-lib PSBTs already carry correct metadata.
    const trySign = (type: PsbtType) => {
      const { external, internal } = deriveDescriptors(
        rootNode,
        fp,
        bip32Network,
        type
      );
      const wallet = new Wallet(
        new Descriptor(internal, bdkNetwork),
        new Descriptor(external, bdkNetwork),
        bdkNetwork,
        Persister.newInMemory()
      );
      const psbt = new Psbt(psbtBase64.trim());
      return { signed: wallet.sign(psbt), psbt };
    };

    let { signed, psbt } = trySign(psbtType);

    if (!signed) {
      const fallback: PsbtType =
        psbtType === 'create_utxo' ? 'send' : 'create_utxo';
      ({ signed, psbt } = trySign(fallback));
    }

    if (!signed) {
      throw new CryptoError(
        'Failed to sign PSBT — wallet.sign returned false for both descriptor types'
      );
    }

    return psbt.serialize();
  } catch (error) {
    if (error instanceof ValidationError || error instanceof CryptoError)
      throw error;
    throw new CryptoError(
      `Unexpected error during PSBT signing: ${error instanceof Error ? error.message : String(error)}`,
      error as Error
    );
  }
}

export async function signPsbtFromSeed(
  _seed: string | Uint8Array,
  _psbtBase64: string,
  _network: Network = 'testnet',
  _options: SignPsbtOptions = {}
): Promise<string> {
  throw new CryptoError(
    'signPsbtFromSeed is not supported in React Native. Use signPsbt with a mnemonic instead.'
  );
}

export async function estimatePsbt(
  _psbtBase64: string
): Promise<EstimateFeeResult> {
  throw new CryptoError('estimatePsbt is not yet supported in React Native.');
}
