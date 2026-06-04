import type {
  LspGetInfoResponse,
  LspLightningAddressByPubkeyResponse,
  LspOnchainSendRequest,
  LspOnchainSendResponse,
  LspLightningReceiveRequest,
  LspLightningReceiveResponse,
  LspLnurlpCallbackResponse,
} from './lsp-types';

export interface IUtexoLSPClient {
  getInfo(): Promise<LspGetInfoResponse>;

  /**
   * Full LUD-06 resolution: discovers callback URL from LNURL metadata then
   * fetches the BOLT11 invoice. Works for any Lightning Address host.
   */
  resolveAddress(
    username: string,
    amtMsat: number,
    assetId?: string,
    assetAmount?: number
  ): Promise<LspLnurlpCallbackResponse>;

  /**
   * Direct LSP callback — skips LNURL discovery and calls
   * /pay/callback/{username} on the LSP base URL directly.
   */
  lnurlCallback(
    username: string,
    amtMsat: number,
    assetId?: string,
    assetAmount?: number
  ): Promise<LspLnurlpCallbackResponse>;

  /**
   * Resolve the haiku username + domain for a recipient peer pubkey
   * (after `apayNew` / `async_order/new`).
   */
  getLightningAddressByPubkey(
    peerPubkey: string
  ): Promise<LspLightningAddressByPubkeyResponse>;

  /** RGB → Lightning: submit RGB invoice; get BOLT11 to pay. */
  onchainSend(params: LspOnchainSendRequest): Promise<LspOnchainSendResponse>;

  /** Lightning → RGB: submit BOLT11 + RGB params; get RGB invoice. */
  lightningReceive(
    params: LspLightningReceiveRequest
  ): Promise<LspLightningReceiveResponse>;
}
