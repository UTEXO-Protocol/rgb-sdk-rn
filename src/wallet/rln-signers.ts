import { mnemonicToSeedSync } from '@scure/bip39';
import type { RLNManager } from './rln-manager';
import type { IRLNUnlockParams } from '../binding/IRLN';

// Accepts a mnemonic string or raw BIP39 seed bytes; always returns 32-byte hex.
export type RLNKeyMaterial = string | Uint8Array;

function toSeedHex(input: RLNKeyMaterial): string {
  const bytes = typeof input === 'string' ? mnemonicToSeedSync(input) : input;
  return Buffer.from(bytes).slice(0, 32).toString('hex');
}

export interface IRLNSigner {
  /** Called once on first-time node creation. Sets up keys on disk. */
  initNode(rln: RLNManager): Promise<void>;
  /** Called on every start (first time and restarts). */
  unlockNode(rln: RLNManager, params: IRLNUnlockParams): Promise<void>;
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
  constructor(keys: RLNKeyMaterial, network: string, permissivePolicy?: boolean) {
    this.seedHex = toSeedHex(keys);
    this.network = network;
    this.permissivePolicy = permissivePolicy;
  }

  async initNode(rln: RLNManager): Promise<void> {
    this.signerId = await rln.rlnCreateNativeExternalSigner(
      this.seedHex,
      this.network,
      this.permissivePolicy,
    );
    await rln.rlnInitNodeWithNativeExternalSigner(this.signerId);
  }

  async unlockNode(rln: RLNManager, params: IRLNUnlockParams): Promise<void> {
    if (this.signerId === null) {
      // Fresh instance (app cold start) — recreate signer from seed then attach.
      this.signerId = await rln.rlnCreateNativeExternalSigner(
        this.seedHex,
        this.network,
        this.permissivePolicy,
      );
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
