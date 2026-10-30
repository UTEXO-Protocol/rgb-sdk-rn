import { WalletBackendError } from '../wallet-errors';

type MaybePromise<T> = T | Promise<T>;

/** What a mnemonic source may return; `null`, `undefined` or a blank string mean "unavailable". */
export type RgbLibMnemonicResult = string | null | undefined;

/** Reads the mnemonic on each new native session, for example from SecureStore. */
export type RgbLibMnemonicReader = () => MaybePromise<RgbLibMnemonicResult>;

/** A service object that reads the mnemonic on each new native session. */
export interface IRgbLibKeyProvider {
  getMnemonic(): MaybePromise<RgbLibMnemonicResult>;
}

/** Account-level public keys, as returned by `generateKeys()` / `deriveKeysFromMnemonic()`. */
export interface RgbLibPublicKeys {
  accountXpubVanilla: string;
  accountXpubColored: string;
  masterFingerprint: string;
}

/**
 * RGB_L1 wallet keys:
 * - a mnemonic string (kept in memory for the wallet's lifetime);
 * - a function or `{ getMnemonic }` that reads it on each native session;
 * - `{ mnemonic }` or `{ getMnemonic }` plus public keys, which must match it;
 * - public keys only, which open the wallet watch-only (no signing).
 */
export type RgbLibKeys =
  | string
  | RgbLibMnemonicReader
  | IRgbLibKeyProvider
  | (Partial<RgbLibPublicKeys> & { mnemonic: string; getMnemonic?: never })
  | (Partial<RgbLibPublicKeys> & {
      getMnemonic(): MaybePromise<RgbLibMnemonicResult>;
      mnemonic?: never;
    })
  | (RgbLibPublicKeys & { mnemonic?: never; getMnemonic?: never });

/**
 * @deprecated Pass the function directly: `keys: () => readMnemonic()`.
 */
export class CallbackRgbLibKeyProvider implements IRgbLibKeyProvider {
  constructor(private readonly readMnemonic: RgbLibMnemonicReader) {}

  getMnemonic(): MaybePromise<RgbLibMnemonicResult> {
    return this.readMnemonic();
  }
}

/** Keys after validation: a mnemonic source, public keys, or both. */
export interface ResolvedRgbLibKeys {
  readonly readMnemonic?: () => MaybePromise<unknown>;
  readonly publicKeys?: Readonly<RgbLibPublicKeys>;
}

const PUBLIC_KEY_FIELDS = [
  'accountXpubVanilla',
  'accountXpubColored',
  'masterFingerprint',
] as const;

function invalidKeys(message: string): never {
  throw new WalletBackendError('INVALID_CONFIG', message, undefined, 'RGB_L1');
}

function isBlank(value: string) {
  return value.trim().length === 0;
}

function resolvePublicKeys(
  keys: Record<string, unknown>,
  network: string
): RgbLibPublicKeys | undefined {
  const present = PUBLIC_KEY_FIELDS.filter(
    (field) => keys[field] !== undefined
  );
  if (present.length === 0) return undefined;
  const missing = PUBLIC_KEY_FIELDS.filter(
    (field) => keys[field] === undefined
  );
  if (missing.length > 0) {
    invalidKeys(
      `RGB_L1 public keys are incomplete; missing ${missing.join(', ')}`
    );
  }
  for (const field of PUBLIC_KEY_FIELDS) {
    const value = keys[field];
    if (typeof value !== 'string' || isBlank(value)) {
      invalidKeys(`RGB_L1 keys.${field} must be a non-empty string`);
    }
  }
  const fingerprint = (keys.masterFingerprint as string).toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(fingerprint)) {
    invalidKeys('RGB_L1 keys.masterFingerprint must be 8 hex characters');
  }
  // Account xpubs carry the network in their prefix; rgb-lib cannot check
  // that they were derived for the selected witness version.
  const prefix = network === 'mainnet' ? 'xpub' : 'tpub';
  for (const field of ['accountXpubVanilla', 'accountXpubColored'] as const) {
    if (!(keys[field] as string).startsWith(prefix)) {
      invalidKeys(
        `RGB_L1 keys.${field} must be a ${prefix} for network ${network}`
      );
    }
  }
  return {
    accountXpubVanilla: keys.accountXpubVanilla as string,
    accountXpubColored: keys.accountXpubColored as string,
    masterFingerprint: fingerprint,
  };
}

/** Validates the `keys` option once, at construction. */
export function resolveRgbLibKeys(
  keys: unknown,
  network: string
): ResolvedRgbLibKeys {
  if (typeof keys === 'string') {
    if (isBlank(keys)) invalidKeys('The RGB_L1 mnemonic must not be empty');
    return { readMnemonic: () => keys };
  }
  if (typeof keys === 'function') {
    return { readMnemonic: keys as () => unknown };
  }
  if (!keys || typeof keys !== 'object') {
    invalidKeys(
      'RGB_L1 keys must be a mnemonic, a function that returns it, or an object with getMnemonic or public keys'
    );
  }
  const object = keys as Record<string, unknown>;
  if (object.mnemonic !== undefined && object.getMnemonic !== undefined) {
    invalidKeys('Pass either keys.mnemonic or keys.getMnemonic, not both');
  }
  let readMnemonic: (() => unknown) | undefined;
  if (object.mnemonic !== undefined) {
    const mnemonic = object.mnemonic;
    if (typeof mnemonic !== 'string' || isBlank(mnemonic)) {
      invalidKeys('RGB_L1 keys.mnemonic must be a non-empty string');
    }
    readMnemonic = () => mnemonic;
  } else if (object.getMnemonic !== undefined) {
    if (typeof object.getMnemonic !== 'function') {
      invalidKeys('RGB_L1 keys.getMnemonic must be a function');
    }
    // Call through the object so service classes keep `this`.
    const provider = object as unknown as IRgbLibKeyProvider;
    readMnemonic = () => provider.getMnemonic();
  }
  const publicKeys = resolvePublicKeys(object, network);
  if (!readMnemonic && !publicKeys) {
    invalidKeys(
      'RGB_L1 keys need a mnemonic (mnemonic or getMnemonic), or accountXpubVanilla, accountXpubColored and masterFingerprint'
    );
  }
  return {
    ...(readMnemonic ? { readMnemonic } : {}),
    ...(publicKeys ? { publicKeys: Object.freeze(publicKeys) } : {}),
  };
}

/**
 * Calls the mnemonic source for one native session. Only this call is
 * wrapped: errors from opening the wallet keep their own codes.
 */
export async function readRgbLibMnemonic(
  read: () => MaybePromise<unknown>,
  operation: string
): Promise<string> {
  let value: unknown;
  try {
    value = await read();
  } catch (error) {
    throw new WalletBackendError(
      'KEYS_UNAVAILABLE',
      'Could not read the RGB_L1 mnemonic',
      operation,
      'RGB_L1',
      error instanceof Error ? error : undefined
    );
  }
  if (value == null || (typeof value === 'string' && isBlank(value))) {
    throw new WalletBackendError(
      'KEYS_UNAVAILABLE',
      'RGB_L1 keys returned no mnemonic',
      operation,
      'RGB_L1'
    );
  }
  if (typeof value !== 'string') {
    invalidKeys('RGB_L1 keys must return the mnemonic as a string');
  }
  return value;
}
