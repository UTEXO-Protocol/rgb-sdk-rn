import type { BitcoinNetwork } from '@utexo/rgb-sdk-core';
import { getNetworkDefaults } from '../network-endpoints';
import { WalletBackendError } from '../wallet-errors';

/** Release of the Swift and Kotlin bindings, as written in their `version.json`. */
export const RGB_LIB_VERSION = '0.3.0-beta.7-upstream-dev-bfa.3-bfa';
export const RGB_LIB_REVISION = '4b78c2285b7e9d719dd5b465d186b2fe8ad6450b';
export const RGB_LIB_BRIDGE_VERSION = 4;

export interface RgbLibWalletParams {
  network: BitcoinNetwork;
  /** Dedicated to this profile; never point this at an existing RLN directory. */
  storageDirPath: string;
  witnessVersion?: 'taproot' | 'segwit-v0';
  maxAllocationsPerUtxo?: number;
  reuseAddresses?: boolean;
}

export type RgbLibIndexer =
  | { type: 'electrum' | 'esplora'; url: string }
  | {
      type: 'bitcoind';
      url: string;
      auth:
        | { username: string; password: string; cookieFile?: never }
        | { cookieFile: string; username?: never; password?: never };
    };

type RgbLibOnlineConfig = {
  /**
   * Defaults to `DEFAULT_TRANSPORT_ENDPOINTS[network]`. This release needs a
   * protocol 1.0 proxy; older proxies may not support it.
   */
  proxyEndpoint?: string;
  evmRpcUrls?: Readonly<Record<string, string>>;
  proxyAuthKeys?: Readonly<Record<string, string>>;
};
/** Omit both `indexer` and `indexerUrl` to use `DEFAULT_INDEXER_URLS[network]`. */
export type RgbLibUnlockParams = RgbLibOnlineConfig &
  (
    | { indexer: RgbLibIndexer; indexerUrl?: never }
    | { indexerUrl?: string; indexer?: never }
  );

export interface ResolvedRgbLibConfig {
  indexer: RgbLibIndexer;
  proxyEndpoint: string;
  evmRpcUrls: Readonly<Record<string, string>>;
  proxyAuthKeys: Readonly<Record<string, string>>;
}

const NETWORKS: readonly string[] = [
  'mainnet',
  'testnet',
  'testnet4',
  'regtest',
  'signet',
  'utexo',
];

export function invalidConfig(message: string): never {
  throw new WalletBackendError('INVALID_CONFIG', message, undefined, 'RGB_L1');
}

export function integer(
  value: number,
  field: string,
  min: number,
  max: number
) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    invalidConfig(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function validateWalletParams(params: RgbLibWalletParams) {
  if (!NETWORKS.includes(params.network)) invalidConfig('Unsupported network');
  if (
    typeof params.storageDirPath !== 'string' ||
    !params.storageDirPath.startsWith('/') ||
    params.storageDirPath.includes('\0')
  ) {
    invalidConfig('storageDirPath must be an absolute native filesystem path');
  }
  if (
    params.witnessVersion !== undefined &&
    !['taproot', 'segwit-v0'].includes(params.witnessVersion)
  ) {
    invalidConfig('Unsupported witnessVersion');
  }
  integer(
    params.maxAllocationsPerUtxo ?? 5,
    'maxAllocationsPerUtxo',
    1,
    0xffffffff
  );
  if (
    params.reuseAddresses !== undefined &&
    typeof params.reuseAddresses !== 'boolean'
  ) {
    invalidConfig('reuseAddresses must be a boolean');
  }
}

function url(value: string, protocols: readonly string[], field: string) {
  if (
    typeof value !== 'string' ||
    !protocols.some((p) => value.startsWith(p))
  ) {
    invalidConfig(`${field} has an unsupported URL scheme`);
  }
  // React Native's built-in URL parser only recognizes HTTP(S) hostnames.
  // Check the transport envelope here; the native indexer/proxy validates its URL.
  const parsed =
    /^[a-z]+:\/\/(?:[^/@\s?#\\]+@)?(\[[0-9a-fA-F:.]+\]|[^:/@\s?#\\]+)(?::(\d{1,5}))?(?:[/?][^\s#\\]*)?$/.exec(
      value
    );
  if (
    !parsed ||
    (parsed[2] !== undefined &&
      (Number(parsed[2]) < 1 || Number(parsed[2]) > 65535))
  ) {
    invalidConfig(`Invalid ${field}`);
  }
  return value;
}

function proxyEndpoint(value: string) {
  url(value, ['https://', 'http://', 'rpcs://', 'rpc://'], 'proxyEndpoint');
  return value.replace(/^https:/, 'rpcs:').replace(/^http:/, 'rpc:');
}

/**
 * Validates online parameters. With `network`, a missing indexer or proxy
 * falls back to the same network defaults RGB_LN uses.
 */
export function resolveRgbLibConfig(
  params: RgbLibUnlockParams,
  network?: string
): ResolvedRgbLibConfig {
  if (
    !params ||
    (params.indexer !== undefined && params.indexerUrl !== undefined)
  ) {
    invalidConfig('Provide either indexer or indexerUrl');
  }
  const defaults =
    network === undefined ? undefined : getNetworkDefaults(network);
  let indexer = params.indexer;
  if (!indexer) {
    const endpoint = params.indexerUrl ?? defaults?.indexerUrl;
    if (!endpoint) invalidConfig('An indexer is required');
    indexer = {
      type: /^(ssl|tcp):\/\//.test(endpoint) ? 'electrum' : 'esplora',
      url: endpoint,
    };
  }
  if (!['electrum', 'esplora', 'bitcoind'].includes(indexer.type)) {
    invalidConfig('Unsupported indexer type');
  }
  url(
    indexer.url,
    indexer.type === 'electrum'
      ? ['ssl://', 'tcp://']
      : ['https://', 'http://'],
    'indexer'
  );
  if (indexer.type === 'bitcoind') {
    const auth = indexer.auth;
    if (
      !auth ||
      ('cookieFile' in auth && auth.cookieFile !== undefined
        ? typeof auth.cookieFile !== 'string' ||
          !auth.cookieFile.startsWith('/') ||
          auth.username !== undefined ||
          auth.password !== undefined
        : typeof auth.username !== 'string' ||
          typeof auth.password !== 'string')
    ) {
      invalidConfig(
        'Bitcoind requires user/password or an absolute cookieFile'
      );
    }
    indexer = { ...indexer, auth: { ...auth } };
  } else {
    indexer = { ...indexer };
  }
  const requestedProxy = params.proxyEndpoint ?? defaults?.proxyEndpoint;
  if (!requestedProxy) invalidConfig('A proxy endpoint is required');
  const proxy = proxyEndpoint(requestedProxy);
  const evmRpcUrls = { ...params.evmRpcUrls };
  for (const [chainId, endpoint] of Object.entries(evmRpcUrls)) {
    if (
      !/^[1-9]\d{0,19}$/.test(chainId) ||
      BigInt(chainId) > 0xffffffffffffffffn
    ) {
      invalidConfig('EVM chain IDs must be positive u64 decimal strings');
    }
    url(endpoint, ['https://', 'http://'], 'EVM RPC');
  }
  const proxyAuthKeys: Record<string, string> = {};
  for (const [endpoint, key] of Object.entries(params.proxyAuthKeys ?? {})) {
    const normalized = proxyEndpoint(endpoint);
    if (typeof key !== 'string' || !/^[a-fA-F0-9]{64}$/.test(key)) {
      invalidConfig('Proxy authentication keys must be 32-byte hex strings');
    }
    if (proxyAuthKeys[normalized] && proxyAuthKeys[normalized] !== key) {
      invalidConfig('Conflicting proxy authentication keys');
    }
    proxyAuthKeys[normalized] = key;
  }
  return { indexer, proxyEndpoint: proxy, evmRpcUrls, proxyAuthKeys };
}

export function configEquals(a: ResolvedRgbLibConfig, b: ResolvedRgbLibConfig) {
  const entries = (value: object) =>
    JSON.stringify(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([x], [y]) => x.localeCompare(y))
    );
  return (
    a.indexer.type === b.indexer.type &&
    a.indexer.url === b.indexer.url &&
    (a.indexer.type !== 'bitcoind' ||
      b.indexer.type !== 'bitcoind' ||
      entries(a.indexer.auth) === entries(b.indexer.auth)) &&
    a.proxyEndpoint === b.proxyEndpoint &&
    entries(a.evmRpcUrls) === entries(b.evmRpcUrls) &&
    entries(a.proxyAuthKeys) === entries(b.proxyAuthKeys)
  );
}
