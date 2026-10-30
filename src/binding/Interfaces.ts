/**
 * Network names accepted at the **native rgb-lib boundary**.
 *
 * Deliberately distinct from core's `BitcoinNetwork` (the SDK-level set): this
 * adds `signet_custom`, which exists only inside the native module and is not a
 * network the SDK serves. Naming it `NetworkName` rather than `BitcoinNetwork`
 * keeps one identifier from meaning two things in this package — the same rule
 * applied to the `Rln*StatusWire` types.
 */
export type NetworkName =
  | 'mainnet'
  | 'testnet'
  | 'testnet4'
  | 'regtest'
  | 'signet'
  | 'signet_custom'
  | 'utexo';

export const NetworkName = {
  MAINNET: 'mainnet' as const,
  TESTNET: 'testnet' as const,
  TESTNET4: 'testnet4' as const,
  REGTEST: 'regtest' as const,
  SIGNET: 'signet' as const,
  SIGNET_CUSTOM: 'signet_custom' as const,
  UTEXO: 'utexo' as const,
} as const;

/**
 * Maps SDK network names to the names understood by the native rgb-lib module.
 * `utexo` is a UTEXO Protocol-specific network that rgb-lib treats as signet.
 *
 * Stays RN-local: this is a uniffi-boundary concern, like the binding
 * interfaces themselves.
 */
export type NativeBitcoinNetwork = Exclude<NetworkName, 'utexo'>;

export function toNativeNetwork(network: NetworkName): NativeBitcoinNetwork {
  if (network === 'utexo') return 'signet';
  if (network === 'signet_custom') return 'signet_custom';
  return network;
}
