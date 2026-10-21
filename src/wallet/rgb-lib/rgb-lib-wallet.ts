import { OnchainWallet } from './onchain-wallet';
import { RgbLibWalletBackend } from './backend';
import type {
  RgbLibUnlockParams,
  RgbLibWalletParams,
} from './config';
import type { IRgbLibKeyProvider } from './key-provider';

/** On-chain implementation used by UTEXOWallet's rgb-lib mode. */
export class RgbLibWallet extends OnchainWallet<RgbLibUnlockParams, 'RGB_L1'> {
  constructor(params: RgbLibWalletParams, keys: IRgbLibKeyProvider) {
    super('RGB_L1', new RgbLibWalletBackend(params, keys));
  }
}
