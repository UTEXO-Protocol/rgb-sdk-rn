import {
  DEFAULT_INDEXER_URLS as CORE_DEFAULT_INDEXER_URLS,
  DEFAULT_TRANSPORT_ENDPOINTS as CORE_DEFAULT_TRANSPORT_ENDPOINTS,
} from '@utexo/rgb-sdk-core';
import type { Network } from '@utexo/rgb-sdk-core';

export interface NetworkEndpoints {
  indexerUrl: string;
  proxyEndpoint: string;
}

/**
 * Default indexer URLs for this SDK, used by both RGB_LN and RGB_L1.
 * Differs from rgb-sdk-core for `mainnet` and `utexo`. The public entry point
 * exports this table, not core's.
 */
export const DEFAULT_INDEXER_URLS: Readonly<Record<Network, string>> =
  Object.freeze({
    ...CORE_DEFAULT_INDEXER_URLS,
    mainnet: 'ssl://electrs-01.utexo.com:50002',
    utexo: 'https://dev.esplora-01.mint.utexo.com',
  });

/**
 * Default RGB proxy endpoints for this SDK, used by both RGB_LN and RGB_L1.
 * Differs from rgb-sdk-core for `mainnet`, `utexo` and `signet`, which use
 * protocol 1.0 proxies. The public entry point exports this table, not core's.
 */
export const DEFAULT_TRANSPORT_ENDPOINTS: Readonly<Record<Network, string>> =
  Object.freeze({
    ...CORE_DEFAULT_TRANSPORT_ENDPOINTS,
    mainnet: 'rpcs://rgb-proxy.utexo.com/json-rpc',
    utexo: 'rpcs://dev.rgb-proxy.utexo.com/json-rpc',
    signet: 'rpcs://staging.rgb-proxy.utexo.com/json-rpc',
  });

export function getNetworkDefaults(
  network: string
): NetworkEndpoints | undefined {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_INDEXER_URLS, network))
    return undefined;
  const indexerUrl = DEFAULT_INDEXER_URLS[network as Network];
  const proxyEndpoint = DEFAULT_TRANSPORT_ENDPOINTS[network as Network];
  if (!indexerUrl || !proxyEndpoint) return undefined;
  return { indexerUrl, proxyEndpoint };
}
