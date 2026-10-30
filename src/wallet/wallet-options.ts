import type { UTEXOWalletNodeParams } from './rln/rln-wallet';
import type { IRLNSigner } from './rln/rln-signers';
import type { RgbLibWalletParams } from './rgb-lib/config';
import type { RgbLibKeys } from './rgb-lib/key-provider';
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
  keys: RgbLibKeys;
  signer?: never;
};
export type WalletInit = RlnWalletInit | RgbLibWalletInit;
/** `protocol` may be omitted for RGB_L1, the default protocol. RGB_LN must be named. */
export type UTEXOWalletOptions<P extends WalletProtocol = WalletProtocol> =
  P extends 'RGB_LN'
    ? RlnWalletInit & { protocol: P }
    : Omit<RgbLibWalletInit, 'protocol'> & { protocol?: P };
