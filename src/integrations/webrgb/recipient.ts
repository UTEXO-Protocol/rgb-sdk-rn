export function encodeEvmBurnRecipient(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/i.test(address))
    throw new Error('A nonzero 20-byte EVM recipient address is required');
  return address.slice(2).toLowerCase().padStart(64, '0');
}
