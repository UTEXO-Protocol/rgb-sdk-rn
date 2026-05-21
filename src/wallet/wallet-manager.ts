import { generateKeys as coreGenerateKeys } from '@utexo/rgb-sdk-core';
import type { GeneratedKeys } from '@utexo/rgb-sdk-core';

export const createWallet = async (network: string = 'regtest'): Promise<GeneratedKeys> => {
  return coreGenerateKeys(network);
};
