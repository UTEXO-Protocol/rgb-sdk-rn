import { getNetworkDefaults } from '../network-endpoints';
import type { IRLNUnlockParams } from '../../binding/IRLN';

// Shared with RGB_L1; re-exported for import-site compatibility.
export {
  DEFAULT_INDEXER_URLS,
  DEFAULT_TRANSPORT_ENDPOINTS,
  getNetworkDefaults,
} from '../network-endpoints';
export type { NetworkEndpoints } from '../network-endpoints';

// LSP defaults moved to @utexo/rgb-sdk-core (they were duplicated here and in
// rgb-sdk-web). Re-exported for import-site compatibility.
export {
  DEFAULT_LSP_BASE_URLS,
  getDefaultLspBaseUrl,
  resolveLspBaseUrl,
} from '@utexo/rgb-sdk-core';

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
