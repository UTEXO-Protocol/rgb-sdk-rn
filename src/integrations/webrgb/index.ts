export { WebRgbProvider, WEBRGB_READ_METHODS } from './provider';
export type { WebRgbOptions, WebRgbApproval, WebRgbInfo } from './provider';
export type {
  WebRgbBurnOptions,
  WebRgbBurnAssetArgs,
  WebRgbBurnAssetResult,
} from './burn';
export {
  createBurnDestination,
  burnDestinationHash,
} from '../../wallet/operations/burn-destination';
export type {
  BurnDestination,
  BurnDestinationRoute,
} from '../../wallet/operations/burn-destination';
export { WebRgbError } from './errors';
export { encodeEvmBurnRecipient, encodeTronBurnRecipient } from './recipient';
