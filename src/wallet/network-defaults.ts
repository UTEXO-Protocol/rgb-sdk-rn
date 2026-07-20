import {
  DEFAULT_INDEXER_URLS,
  DEFAULT_TRANSPORT_ENDPOINTS,
} from '@utexo/rgb-sdk-core';
import type { Network } from '@utexo/rgb-sdk-core';
import type { IRLNUnlockParams } from '../binding/IRLN';

export interface NetworkEndpoints {
  indexerUrl: string;
  proxyEndpoint: string;
}

/**
 * RLN-specific overrides for networks where the rgb-sdk-core defaults point to
 * the wrong endpoint for the RLN proxy infrastructure.
 */
const RLN_NETWORK_OVERRIDES: Partial<
  Record<string, Partial<NetworkEndpoints>>
> = {
  utexo: { proxyEndpoint: 'rpcs://rgb-proxy.utexo.com/json-rpc' },
  signet: { proxyEndpoint: 'rpcs://rgb-proxy.utexo.com/json-rpc' },
};

// LSP defaults moved to @utexo/rgb-sdk-core (they were duplicated here and in
// rgb-sdk-web). Re-exported for import-site compatibility.
export {
  DEFAULT_LSP_BASE_URLS,
  getDefaultLspBaseUrl,
  resolveLspBaseUrl,
} from '@utexo/rgb-sdk-core';

export function getNetworkDefaults(
  network: string
): NetworkEndpoints | undefined {
  const indexerUrl = DEFAULT_INDEXER_URLS[network as Network];
  const proxyEndpoint = DEFAULT_TRANSPORT_ENDPOINTS[network as Network];
  if (!indexerUrl || !proxyEndpoint) return undefined;
  const overrides = RLN_NETWORK_OVERRIDES[network];
  return {
    indexerUrl: overrides?.indexerUrl ?? indexerUrl,
    proxyEndpoint: overrides?.proxyEndpoint ?? proxyEndpoint,
  };
}

/**
 * Fills indexerUrl and proxyEndpoint from network defaults when the caller
 * omits them, then validates that at least one chain backend is configured.
 * Throws if neither indexerUrl nor bitcoind RPC credentials are present after
 * applying defaults.
 */
export function resolveUnlockParams(
  network: string,
  params: IRLNUnlockParams
): IRLNUnlockParams {
  const defaults = getNetworkDefaults(network);

  const resolved: IRLNUnlockParams = {
    ...params,
    indexerUrl: params.indexerUrl ?? defaults?.indexerUrl ?? null,
    proxyEndpoint: params.proxyEndpoint ?? defaults?.proxyEndpoint ?? null,
  };

  const hasChainBackend =
    resolved.indexerUrl != null ||
    (resolved.bitcoindRpcHost != null && resolved.bitcoindRpcUsername != null);

  if (!hasChainBackend) {
    throw new Error(
      `No chain backend configured for network "${network}". ` +
        'Provide indexerUrl or bitcoindRpcHost + bitcoindRpcUsername in unlock params.'
    );
  }

  return resolved;
}
