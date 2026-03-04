/**
 * UTEXO module exports
 *
 * Provides the UTEXOWallet class and UTEXO protocol interfaces
 * for Lightning Network and on-chain bridge transfer operations.
 */

export { UTEXOWallet } from './utexo-wallet';
export type { ConfigOptions } from './utexo-wallet';
export { UTEXOProtocol, LightningProtocol, OnchainProtocol } from './utexo-protocol';
export type { IUTEXOProtocol, ILightningProtocol, IOnchainProtocol } from './IUTEXOProtocol';
