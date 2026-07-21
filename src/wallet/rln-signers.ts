import { mnemonicToSeedSync } from '@scure/bip39';
import type { RLNManager } from './rln-manager';
import type { IRLNUnlockParams } from '../binding/IRLN';
import { toNativeNetwork, type NetworkName } from '../binding/Interfaces';

// Accepts a mnemonic string or raw BIP39 seed bytes; always returns 32-byte hex.
export type RLNKeyMaterial = string | Uint8Array;

function toSeedHex(input: RLNKeyMaterial): string {
  const bytes = typeof input === 'string' ? mnemonicToSeedSync(input) : input;
  return Buffer.from(bytes).slice(0, 32).toString('hex');
}

/**
 * `storageDirPath` is injected by the wallet from its own node params, so a signer's
 * on-disk state always lands beside the node it signs for. Implementations that keep
 * no state may ignore it.
 */
export interface IRLNSigner {
  /** Called once on first-time node creation. Sets up keys on disk. */
  initNode(rln: RLNManager, storageDirPath?: string): Promise<void>;
  /** Called on every start (first time and restarts). */
  unlockNode(
    rln: RLNManager,
    params: IRLNUnlockParams,
    storageDirPath?: string
  ): Promise<void>;
  /** Optional cleanup — release signer resources. */
  dispose?(rln: RLNManager): Promise<void>;
}

// ── Password-based signer ─────────────────────────────────────────────────────

export class PasswordRLNSigner implements IRLNSigner {
  private readonly password: string;
  private mnemonic: string | undefined;

  /**
   * @param password  Used for every unlock.
   * @param keys      Mnemonic string only — needed for first-time initNode.
   *                  Seed bytes are not accepted here because rlnInitNode requires a mnemonic string.
   *                  After initNode the mnemonic is cleared from memory.
   */
  constructor(password: string, keys?: RLNKeyMaterial) {
    this.password = password;
    this.mnemonic = typeof keys === 'string' ? keys : undefined;
  }

  async initNode(rln: RLNManager): Promise<void> {
    await rln.rlnInitNode(this.password, this.mnemonic);
    this.mnemonic = undefined;
  }

  async unlockNode(rln: RLNManager, params: IRLNUnlockParams): Promise<void> {
    await rln.rlnUnlockNode({ password: this.password, ...params });
  }
}

// ── Native external signer ────────────────────────────────────────────────────

export class NativeExternalRLNSigner implements IRLNSigner {
  private readonly seedHex: string;
  private readonly network: string;
  private readonly permissivePolicy?: boolean;
  private signerId: number | null = null;

  /**
   * @param keys              Mnemonic string OR raw BIP39 seed bytes — converted to 32-byte hex internally.
   * @param network           Bitcoin network string ('regtest', 'testnet', 'mainnet', …).
   * @param permissivePolicy  Optional — relaxes signer policy checks.
   */
  constructor(
    keys: RLNKeyMaterial,
    network: string,
    permissivePolicy?: boolean
  ) {
    this.seedHex = toSeedHex(keys);
    this.network = toNativeNetwork(network as NetworkName);
    this.permissivePolicy = permissivePolicy;
  }

  /**
   * Without a storage dir the native signer is ephemeral: it can re-derive channel keys
   * from the seed on restart, but it cannot validate commitment state it never tracked,
   * so payments over channels restored from LDK persistence force-close the channel.
   * The wallet always supplies one; the null path exists only for callers driving the
   * signer directly.
   */
  private createSigner(
    rln: RLNManager,
    storageDirPath?: string
  ): Promise<number> {
    return rln.rlnCreateNativeExternalSigner(
      this.seedHex,
      this.network,
      this.permissivePolicy,
      storageDirPath ?? null
    );
  }

  async initNode(rln: RLNManager, storageDirPath?: string): Promise<void> {
    this.signerId = await this.createSigner(rln, storageDirPath);
    await rln.rlnInitNodeWithNativeExternalSigner(this.signerId);
  }

  async unlockNode(
    rln: RLNManager,
    params: IRLNUnlockParams,
    storageDirPath?: string
  ): Promise<void> {
    if (this.signerId === null) {
      // Fresh instance (app cold start) — recreate signer from seed then attach.
      // The storage dir is what lets it pick its channel state back up.
      this.signerId = await this.createSigner(rln, storageDirPath);
      await rln.rlnAttachNativeExternalSigner(this.signerId);
    }
    await rln.rlnUnlockNodeWithNativeExternalSigner(this.signerId, params);
  }

  async dispose(rln: RLNManager): Promise<void> {
    if (this.signerId !== null) {
      await rln.rlnDestroyNativeExternalSigner(this.signerId);
      this.signerId = null;
    }
  }
}
