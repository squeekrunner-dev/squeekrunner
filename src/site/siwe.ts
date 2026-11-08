import { keccak_256 } from '@noble/hashes/sha3';

/** EIP-55 mixed-case checksum. EIP-4361 requires it; wallets may warn on lowercase addresses. */
export function checksumAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Invalid wallet address');
  const lower = address.slice(2).toLowerCase();
  const hash = keccak_256(new TextEncoder().encode(lower));
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    const nibble = (hash[i >> 1] >> (i % 2 ? 0 : 4)) & 0xf;
    out += nibble >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

/** EIP-4361 (Sign-In with Ethereum) message, formatted exactly like viem's createSiweMessage. */
export interface SiweFields {
  domain: string; address: string; statement: string; uri: string; chainId: number;
  nonce: string; issuedAt: string; expirationTime: string; resources: string[];
}

export function formatSiweMessage(f: SiweFields): string {
  const address = checksumAddress(f.address);
  if (f.statement.includes('\n')) throw new Error('Statement must be one line');
  const lines = [
    `${f.domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    f.statement,
    '',
    `URI: ${f.uri}`,
    'Version: 1',
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${new Date(f.issuedAt).toISOString()}`,
    `Expiration Time: ${new Date(f.expirationTime).toISOString()}`,
  ];
  if (f.resources.length) lines.push('Resources:', ...f.resources.map(r => `- ${r}`));
  return lines.join('\n');
}

/** UTF-8 → 0x-hex, the encoding wallets expect for personal_sign. */
export function toHex(message: string): string {
  return `0x${[...new TextEncoder().encode(message)].map(b => b.toString(16).padStart(2, '0')).join('')}`;
}
