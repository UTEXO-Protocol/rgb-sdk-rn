import { WalletBackendError } from '../wallet-errors';

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VALUES = new Map([...ALPHABET].map((char, index) => [char, index]));

/**
 * Strict standard base64 (padded, no whitespace) from the native bridge.
 * Anything else is `INVALID_NATIVE_RESPONSE`: a malformed value is never
 * decoded into partial bytes.
 */
export function decodeNativeBase64(value: unknown, field: string): Uint8Array {
  const invalid = () =>
    new WalletBackendError(
      'INVALID_NATIVE_RESPONSE',
      `Invalid native ${field}`,
      undefined,
      'RGB_L1'
    );
  if (
    typeof value !== 'string' ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw invalid();
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((value.length / 4) * 3 - padding);
  let offset = 0;
  for (let i = 0; i < value.length; i += 4) {
    const chunk = value.slice(i, i + 4);
    const n = [...chunk].map((char) => (char === '=' ? 0 : VALUES.get(char)!));
    const triple = (n[0]! << 18) | (n[1]! << 12) | (n[2]! << 6) | n[3]!;
    for (const shift of [16, 8, 0])
      if (offset < bytes.length) bytes[offset++] = (triple >> shift) & 0xff;
  }
  // Non-canonical padding bits mean the value was not produced by a base64 encoder.
  const last = value.slice(-4);
  if (
    (padding === 2 && (VALUES.get(last[1]!)! & 0x0f) !== 0) ||
    (padding === 1 && (VALUES.get(last[2]!)! & 0x03) !== 0)
  )
    throw invalid();
  return bytes;
}
