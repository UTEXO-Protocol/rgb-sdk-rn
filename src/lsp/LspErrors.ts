import type { ReceiveStatus } from './lsp-types';

export class LspChannelTimeoutError extends Error {
  readonly name = 'LspChannelTimeoutError';
  constructor(
    public readonly assetId: string,
    public readonly elapsedMs: number
  ) {
    super(
      `No usable RGB channel for ${assetId} after ${Math.round(elapsedMs / 1000)}s`
    );
  }
}

export class LspSettlementError extends Error {
  readonly name = 'LspSettlementError';
  constructor(
    public readonly step: 'ln_invoice',
    public readonly status: ReceiveStatus
  ) {
    super(`Settlement ended with status "${status}" at step ${step}`);
  }
}
