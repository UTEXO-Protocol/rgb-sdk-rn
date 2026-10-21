import {
  createUtexoWallet,
  type RgbLibWallet,
  UTEXOWallet,
  type AnyUtexoWallet,
  type WalletTransfer,
  type OnchainWalletApi,
  type RgbLibUnlockParams,
  type IRLNUnlockParams,
  type RgbLibWalletParams,
  type IRgbLibKeyProvider,
  type IRLNSigner,
  type UTEXOWalletNodeParams,
  type WalletProtocol,
} from '../src';
import type { RgbInfo } from '@utexo/webrgb';
import { WebRgbProvider } from '../src/integrations/webrgb/provider';
export { createDemoSession } from '../examples/dual-backend';

// Compile-only checks: demo-facing contracts must accept both implementations.
export function sharedApi(rln: UTEXOWallet, rgb: RgbLibWallet) {
  const a: OnchainWalletApi<IRLNUnlockParams> = rln;
  const b: OnchainWalletApi<RgbLibUnlockParams> = rgb;
  const options = { origin: 'https://example.com', confirm: async () => true };
  return [
    a,
    b,
    new WebRgbProvider(rln, options),
    new WebRgbProvider(rgb, options),
  ];
}
export function factoryTypes(
  params: RgbLibWalletParams,
  keys: IRgbLibKeyProvider,
  signer: IRLNSigner,
  rlnParams: UTEXOWalletNodeParams
) {
  const rgb = createUtexoWallet({ protocol: 'RGB_L1', params, keys });
  const rln = createUtexoWallet({
    protocol: 'RGB_LN',
    params: rlnParams,
    signer,
  });
  // @ts-expect-error Lightning requires the RLN backend.
  void rgb.createLightningInvoice({ amountSats: 1 });
  // @ts-expect-error External RLN signers cannot be used as RGB Lib key providers.
  createUtexoWallet({ protocol: 'RGB_L1', params, signer });
  // @ts-expect-error Credentials for different engines cannot be mixed.
  createUtexoWallet({ protocol: 'RGB_LN', params: rlnParams, signer, keys });
  void rln.createLightningInvoice;
  return [rgb, rln];
}

// Compile-only coverage of the public constructor, including old annotations/subclasses.
export async function constructorTypes(
  params: RgbLibWalletParams,
  keys: IRgbLibKeyProvider,
  signer: IRLNSigner,
  rlnParams: UTEXOWalletNodeParams,
  unlock: RgbLibUnlockParams,
  mixed: AnyUtexoWallet
) {
  const legacy: UTEXOWallet = new UTEXOWallet(rlnParams, signer);
  const rgb = new UTEXOWallet({ protocol: 'RGB_L1', params, keys });
  const explicitRln = new UTEXOWallet({
    protocol: 'RGB_LN',
    params: rlnParams,
    signer,
  });
  const inferred: UTEXOWallet<'RGB_L1'> = rgb;
  const rgbProtocol: 'RGB_L1' = rgb.protocol;
  const rlnProtocol: 'RGB_LN' = legacy.protocol;
  const publicProtocol: WalletProtocol = rgbProtocol;
  const webRgbProtocol: RgbInfo['protocol'] = publicProtocol;
  const onchain: OnchainWalletApi<RgbLibUnlockParams> = rgb;
  const transfers: WalletTransfer[] = await rgb.listTransfers();
  await rgb.unlock(unlock);
  await legacy.unlock({});
  await explicitRln.createLightningInvoice({ amountSats: 1 });
  // @ts-expect-error A new RGB Lib instance has no default endpoints.
  void rgb.unlock({});
  // @ts-expect-error Lightning is only callable on an RLN wallet.
  void rgb.createLightningInvoice({ amountSats: 1 });
  // @ts-expect-error RLN node identity is not an RGB Lib capability.
  void rgb.getNodeInfo();
  // @ts-expect-error Native message signing belongs to RLN.
  void rgb.signMessage('message');
  // @ts-expect-error The legacy wallet annotation continues to mean RLN.
  const wrongLegacy: UTEXOWallet = rgb;
  // @ts-expect-error A supplied generic cannot change the legacy constructor backend.
  new UTEXOWallet<'RGB_L1'>(rlnParams, signer);
  // @ts-expect-error RGB Lib credentials are required.
  new UTEXOWallet({ protocol: 'RGB_L1', params });
  // @ts-expect-error The new options form cannot also accept an RLN signer.
  new UTEXOWallet({ protocol: 'RGB_L1', params, keys }, signer);
  // @ts-expect-error Mixed credentials are rejected.
  new UTEXOWallet({ protocol: 'RGB_L1', params, keys, signer });
  // @ts-expect-error Public construction uses protocol, not an implementation name.
  new UTEXOWallet({ backend: 'rgb-lib', params, keys });
  const conflicting = {
    protocol: 'RGB_L1' as const,
    backend: 'rln',
    params,
    keys,
  };
  // @ts-expect-error Even a prebuilt config cannot specify two selectors.
  new UTEXOWallet(conflicting);
  // @ts-expect-error Only WebRGB's two protocol values are accepted.
  new UTEXOWallet({ protocol: 'rgb-lib', params, keys });
  // @ts-expect-error Protocol is immutable for the lifetime of the wallet.
  rgb.protocol = 'RGB_L1';
  // @ts-expect-error Backend is no longer a public wallet property.
  void rgb.backend;
  // @ts-expect-error Legacy callers still supply a signer.
  new UTEXOWallet(rlnParams);
  if (mixed.protocol === 'RGB_LN') {
    await mixed.createLightningInvoice({ amountSats: 1 });
    await mixed.unlock({});
  } else {
    await mixed.unlock(unlock);
    // @ts-expect-error Discriminant narrowing preserves the on-chain restriction.
    void mixed.createLightningInvoice({ amountSats: 1 });
  }
  class AppWallet extends UTEXOWallet {
    override getAddress() {
      return super.getAddress();
    }
  }
  const child: UTEXOWallet = new AppWallet(rlnParams, signer);
  return [
    rgbProtocol,
    rlnProtocol,
    webRgbProtocol,
    inferred,
    onchain,
    transfers,
    child,
    wrongLegacy,
    new WebRgbProvider(rgb, {
      origin: 'https://example.com',
      confirm: async () => true,
    }),
  ];
}

// Wide generics must not silently select either engine's unlock signature.
export function wideProtocolTypes(
  wide: UTEXOWallet<WalletProtocol>,
  rlnUnlock: IRLNUnlockParams,
  rgbUnlock: RgbLibUnlockParams,
  rlnParams: UTEXOWalletNodeParams,
  signer: IRLNSigner,
  mixed: AnyUtexoWallet
) {
  // @ts-expect-error A wide generic cannot identify the native protocol.
  void wide.unlock(rlnUnlock);
  // @ts-expect-error RGB Lib params are equally unsafe on a wide generic.
  void wide.unlock(rgbUnlock);
  // @ts-expect-error Reinit also accepts protocol-specific params.
  void wide.reinit(rlnUnlock);
  // @ts-expect-error Reinit must not silently default a wide type to RGB Lib.
  void wide.reinit(rgbUnlock);
  // @ts-expect-error The legacy constructor always has the concrete RGB_LN type.
  new UTEXOWallet<WalletProtocol>(rlnParams, signer);
  // Safe shared operations remain available without a protocol discriminator.
  void wide.getAddress();
  void wide.dispose();
  if (mixed.protocol === 'RGB_LN') {
    void mixed.unlock(rlnUnlock);
    void mixed.reinit(rlnUnlock);
  } else {
    void mixed.unlock(rgbUnlock);
    void mixed.reinit(rgbUnlock);
    // @ts-expect-error Narrowing preserves the RGB Lib unlock requirements.
    void mixed.unlock(rlnUnlock);
  }
}
