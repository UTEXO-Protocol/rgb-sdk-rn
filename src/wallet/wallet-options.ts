import type { UTEXOWalletNodeParams } from './rln-wallet';
import type { IRLNSigner } from './rln-signers';
import type { RgbLibWalletParams } from './backends/rgb-lib/config';
import type { IRgbLibKeyProvider } from './credentials/rgb-lib-key-provider';
import type { WalletProtocol } from './wallet-api';

export type RlnWalletInit = {
  protocol: 'RGB_LN';
  backend?: never;
  params: UTEXOWalletNodeParams;
  signer: IRLNSigner;
  keys?: never;
};
export type RgbLibWalletInit = {
  protocol: 'RGB_L1';
  backend?: never;
  params: RgbLibWalletParams;
  keys: IRgbLibKeyProvider;
  signer?: never;
};
export type WalletInit = RlnWalletInit | RgbLibWalletInit;
export type UTEXOWalletOptions<P extends WalletProtocol = WalletProtocol> = {
  protocol: P;
} & (P extends 'RGB_LN' ? RlnWalletInit : RgbLibWalletInit);
