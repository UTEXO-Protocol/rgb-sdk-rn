/**
 * UTEXO network and asset mapping
 *
 * Provides network configurations and asset mappings for cross-network transfers
 * between Bitcoin L1, Lightning Network, and UTEXO layer.
 */

import type { Network } from '../crypto/types';

/**
 * Maps network names to their corresponding Bitcoin network
 */
export const utexoNetworkMap = {
  mainnet: 'testnet',
  utexo: 'signet',
} as const satisfies Record<string, Network>;

type NetworkConfig = {
  networkName: string;
  networkId: number;
  assets: {
    assetId: string;
    tokenName: string;
    longName: string;
    precision: number;
    tokenId: number;
  }[];
};

/**
 * Adds getAssetById helper method to network configuration
 */
function withGetAssetById<T extends NetworkConfig>(
  config: T
): T & { getAssetById(tokenId: number): T['assets'][number] | undefined } {
  return {
    ...config,
    getAssetById(tokenId: number) {
      return config.assets.find((a) => a.tokenId === tokenId);
    },
  };
}

/**
 * Network ID mapping with asset configurations
 *
 * Each network (mainnet, Lightning, UTEXO) has:
 * - networkName: Human-readable name
 * - networkId: Unique network identifier
 * - assets: List of supported assets with tokenId for cross-network mapping
 */
export const utexoNetworkIdMap = {
  mainnet: withGetAssetById({
    networkName: 'RGB',
    networkId: 36,
    assets: [
      {
        assetId: 'rgb:WPRv95Nj-icdrgPp-zpQhIp_-2TyJ~Ge-k~FvuMZ-~vVnkA0',
        tokenName: 'tUSD',
        longName: 'USDT',
        precision: 6,
        tokenId: 4,
      },
    ],
  }),
  mainnetLightning: withGetAssetById({
    networkName: 'RGB Lightning',
    networkId: 94,
    assets: [
      {
        assetId: 'rgb:WPRv95Nj-icdrgPp-zpQhIp_-2TyJ~Ge-k~FvuMZ-~vVnkA0',
        tokenName: 'tUSD',
        longName: 'USDT',
        precision: 6,
        tokenId: 4,
      },
    ],
  }),
  utexo: withGetAssetById({
    networkName: 'UTEXO',
    networkId: 96,
    assets: [
      {
        assetId: 'rgb:yJW4k8si-~8JdNfl-nM91qFu-r5rH_HS-1hM7jpi-L~lBf90',
        tokenName: 'tUSD',
        longName: 'USDT',
        precision: 6,
        tokenId: 4,
      },
    ],
  }),
};

const networkConfigs = utexoNetworkIdMap;

export type NetworkAsset =
  (typeof networkConfigs)[keyof typeof networkConfigs]['assets'][number];

export type UtxoNetworkId = keyof typeof networkConfigs;

/**
 * Resolves the destination network's asset object from sender network, destination network, and sender asset ID.
 * Uses tokenId as the cross-network identifier (same tokenId = same logical asset).
 *
 * @param senderNetwork - Source network ID
 * @param destinationNetwork - Destination network ID
 * @param assetIdSender - Asset ID on sender network (null for default asset)
 * @returns Corresponding asset on destination network, or undefined if not found
 *
 * @example
 * ```typescript
 * // Get USDT asset on Lightning network from mainnet USDT
 * const destinationAsset = getDestinationAsset(
 *   'mainnet',
 *   'mainnetLightning',
 *   'rgb:WPRv95Nj-icdrgPp-zpQhIp_-2TyJ~Ge-k~FvuMZ-~vVnkA0'
 * );
 * ```
 */
export function getDestinationAsset(
  senderNetwork: UtxoNetworkId,
  destinationNetwork: UtxoNetworkId,
  assetIdSender: string | null
): NetworkAsset | undefined {
  const destinationConfig = utexoNetworkIdMap[destinationNetwork];
  if (assetIdSender == null) return destinationConfig.assets[0];
  const senderConfig = utexoNetworkIdMap[senderNetwork];
  const senderAsset = senderConfig.assets.find(
    (a) => a.assetId === assetIdSender
  );
  if (!senderAsset) return undefined;
  return destinationConfig.assets.find(
    (a) => a.tokenId === senderAsset.tokenId
  );
}
