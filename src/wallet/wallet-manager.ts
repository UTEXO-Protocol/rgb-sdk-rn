import { generateKeys as coreGenerateKeys } from '@utexo/rgb-sdk-core';
import type { GeneratedKeys } from '@utexo/rgb-sdk-core';
import { toNativeNetwork, type NetworkName } from '../binding/Interfaces';

export const createWallet = async (
  network: string = 'regtest'
): Promise<GeneratedKeys> => {
  return coreGenerateKeys(toNativeNetwork(network as NetworkName));
};
