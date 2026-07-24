/**
 * Wire → domain mappers for the UniFFI binding.
 *
 * Core owns the domain types and the canonical status vocabulary; each platform
 * owns the mapping from its own wire format. The two bindings do not share a
 * wire shape — `bindings/uniffi-bindgen` generates typed structs from
 * `src/uniffi_api/types.rs`, while `bindings/wasm-sdk` hand-serializes with
 * serde — so these mappers are necessarily RN-specific.
 *
 * Every function is typed as `WireMapper<TWire, TDomain>`, so the compiler
 * enforces the domain output and the conformance suite enforces the runtime
 * values.
 */

import type {
  WireMapper,
  LightningChannel,
  LightningNodeInfo,
  LightningNetworkInfo,
  LightningPeer,
  LightningPayment,
  LightningInvoice,
  DecodedLnInvoice,
  SendPaymentResult,
} from '@utexo/rgb-sdk-core';
import {
  satToMsat,
  tryNormalizeChannelStatus,
  tryNormalizePaymentStatus,
  tryNormalizeRlnNetwork,
} from '@utexo/rgb-sdk-core';
import type {
  RlnChannel,
  RlnNodeInfo,
  RlnNetworkInfo,
  RlnPeer,
  RlnPayment,
  RlnLnInvoiceResponse,
  RlnDecodeLnInvoiceResponse,
  RlnKeysendResponse,
} from './rln-types';

/**
 * `RlnChannel` → `LightningChannel`.
 *
 * Two things the wire shape does not line up on:
 *   - `public` is the reserved-ish JS name; core uses `isPublic`.
 *   - `localBalanceSat` is in **sats**; core's `localBalanceMsat` is in msat.
 */
export const toLightningChannel: WireMapper<RlnChannel, LightningChannel> = (
  w
) => ({
  channelId: w.channelId,
  peerPubkey: w.peerPubkey,
  capacitySat: w.capacitySat,
  ready: w.ready,
  isPublic: w.public,
  isUsable: w.isUsable,
  status: w.status ? (tryNormalizeChannelStatus(w.status) ?? undefined) : undefined,
  localBalanceMsat:
    w.localBalanceSat != null ? satToMsat(w.localBalanceSat) : undefined,
  outboundBalanceMsat: w.outboundBalanceMsat,
  inboundBalanceMsat: w.inboundBalanceMsat,
  nextOutboundHtlcLimitMsat: w.nextOutboundHtlcLimitMsat,
  nextOutboundHtlcMinimumMsat: w.nextOutboundHtlcMinimumMsat,
  fundingTxid: w.fundingTxid,
  peerAlias: w.peerAlias,
  shortChannelId: w.shortChannelId,
  assetId: w.assetId,
  assetLocalAmount: w.assetLocalAmount,
  assetRemoteAmount: w.assetRemoteAmount,
  virtualOpenMode: w.virtualOpenMode,
});

export const toLightningNodeInfo: WireMapper<RlnNodeInfo, LightningNodeInfo> = (
  w
) => ({
  pubkey: w.pubkey,
  numChannels: w.numChannels,
  numUsableChannels: w.numUsableChannels,
  numPeers: w.numPeers,
  localBalanceSat: w.localBalanceSat,
  localBalanceMsat:
    w.localBalanceSat != null ? satToMsat(w.localBalanceSat) : undefined,
  maxMediaUploadSizeMb: w.maxMediaUploadSizeMb,
  rgbHtlcMinMsat: w.rgbHtlcMinMsat,
  rgbChannelCapacityMinSat: w.rgbChannelCapacityMinSat,
  channelCapacityMinSat: w.channelCapacityMinSat,
  channelCapacityMaxSat: w.channelCapacityMaxSat,
  channelAssetMinAmount: w.channelAssetMinAmount,
  channelAssetMaxAmount: w.channelAssetMaxAmount,
  networkNodes: w.networkNodes,
  networkChannels: w.networkChannels,
  latestRgsSnapshotTimestamp: w.latestRgsSnapshotTimestamp,
});

export const toLightningNetworkInfo: WireMapper<
  RlnNetworkInfo,
  LightningNetworkInfo
> = (w) => ({
  // `try…`: an unrecognised network stays visible rather than throwing inside
  // a read-only info call.
  network: tryNormalizeRlnNetwork(w.network) ?? w.network,
  blockHeight: w.height,
});

export const toLightningPeer: WireMapper<RlnPeer, LightningPeer> = (w) => ({
  pubkey: w.pubkey,
});

/**
 * `RlnPayment` → `LightningPayment`.
 *
 * `RLNBinding` canonicalizes the native enum to SCREAMING_SNAKE; the core
 * normalizer maps it onto the canonical PascalCase vocabulary. An unknown or
 * absent status falls back to `'Pending'` rather than throwing, so one odd
 * record cannot break a list call.
 */
export const toLightningPayment: WireMapper<RlnPayment, LightningPayment> = (
  w
) => ({
  paymentHash: w.paymentHash,
  status: tryNormalizePaymentStatus(w.status) ?? 'Pending',
  // RlnPaymentType and LightningPaymentType share the same vocabulary, so this
  // passes through; `inbound` is derived from it rather than sent on the wire.
  paymentType: w.paymentType,
  inbound: w.paymentType == null ? undefined : w.paymentType !== 'Outbound',
  amtMsat: w.amtMsat,
  assetId: w.assetId,
  assetAmount: w.assetAmount,
  preimage: w.preimage,
  payeePubkey: w.payeePubkey,
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
});

export const toSendPaymentResult: WireMapper<
  RlnKeysendResponse,
  SendPaymentResult
> = (w) => ({
  paymentHash: w.paymentHash,
  status: tryNormalizePaymentStatus(w.status) ?? 'Pending',
  preimage: w.paymentPreimage,
});

export const toDecodedLnInvoice: WireMapper<
  RlnDecodeLnInvoiceResponse,
  DecodedLnInvoice
> = (w) => ({
  paymentHash: w.paymentHash,
  amtMsat: w.amtMsat,
  expirySeconds: w.expirySec,
  timestamp: w.timestamp,
  payee: w.payeePubkey,
  paymentSecret: w.paymentSecret,
  assetId: w.assetId,
  assetAmount: w.assetAmount,
  network: tryNormalizeRlnNetwork(w.network) ?? w.network,
});

/**
 * `RlnLnInvoiceResponse` → `LightningInvoice`.
 *
 * The wire response carries only the BOLT11 string, so the caller supplies the
 * request context (payment hash, expiry, amounts) it already has.
 */
export function toLightningInvoice(
  wire: RlnLnInvoiceResponse,
  ctx: {
    paymentHash: string;
    expirySeconds: number;
    amtMsat?: number | bigint;
    assetId?: string;
    assetAmount?: number | bigint;
  }
): LightningInvoice {
  return {
    invoice: wire.invoice,
    paymentHash: ctx.paymentHash,
    expirySeconds: ctx.expirySeconds,
    amtMsat: ctx.amtMsat,
    assetId: ctx.assetId,
    assetAmount: ctx.assetAmount,
  };
}
