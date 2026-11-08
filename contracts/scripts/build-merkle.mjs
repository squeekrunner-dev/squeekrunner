import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getAddress, ZeroAddress } from 'ethers';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';

export function parseList(text, extension) {
  const clean = text.replace(/^\uFEFF/, '').trim();
  if (extension.toLowerCase() === '.json') return JSON.parse(clean);
  if (extension.toLowerCase() !== '.csv') throw new Error('Input must be .json or .csv');
  // Fields contain only addresses/integers: accept plain or simply quoted fields.
  const field = value => value.trim().replace(/^"([^"\r\n]*)"$/, '$1');
  const rows = clean.split(/\r?\n/).filter(line => line.trim()).map(line => line.split(',').map(field));
  if (rows.shift()?.join(',') !== 'address,allowance') throw new Error('CSV header must be address,allowance');
  return rows.map((row, index) => {
    if (row.length !== 2) throw new Error(`CSV row ${index + 2} must have two fields`);
    return { address: row[0], allowance: row[1] };
  });
}

export function buildAllowlist(records) {
  if (!Array.isArray(records) || records.length === 0 || records.length > 900) throw new Error('Expected 1–900 address/allowance records');
  const seen = new Set();
  let totalAllowance = 0;
  const values = records.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`Invalid record ${index + 1}`);
    let address;
    try { address = getAddress(record.address); } catch { throw new Error(`Invalid address in record ${index + 1}`); }
    if (address === ZeroAddress) throw new Error('Zero address is not eligible');
    if (seen.has(address)) throw new Error(`Duplicate address: ${address}; consolidate its cumulative allowance first`);
    seen.add(address);
    const allowance = record.allowance;
    if (!((typeof allowance === 'number' && Number.isSafeInteger(allowance)) ||
      (typeof allowance === 'string' && /^[1-9]\d{0,2}$/.test(allowance)))) throw new Error(`Invalid allowance for ${address}`);
    const count = Number(allowance);
    if (count < 1 || count > 900) throw new Error(`Allowance must be 1–900 for ${address}`);
    totalAllowance += count;
    if (totalAllowance > 900) throw new Error('Combined whitelist/X allowance exceeds 900');
    return [address, String(count)];
  }).sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en'));
  const tree = StandardMerkleTree.of(values, ['address', 'uint256']);
  return {
    format: 'squeekrunner-allowlist-v1', leafEncoding: ['address', 'uint256'],
    root: tree.root, totalAllowance,
    entries: [...tree.entries()].map(([index, [address, allowance]]) => ({ address, allowance, proof: tree.getProof(index) })),
    tree: tree.dump(),
  };
}

export async function buildMerkleFile(input, output) {
  const result = buildAllowlist(parseList(await readFile(input, 'utf8'), extname(input)));
  await mkdir(dirname(output), { recursive: true });
  // Existing published roots/proofs must not be silently overwritten.
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  return result;
}

async function main() {
  const [input, output, ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length) throw new Error('Usage: npm run merkle -- input.csv output.json');
  const result = await buildMerkleFile(resolve(input), resolve(output));
  console.log(JSON.stringify({ root: result.root, addresses: result.entries.length, totalAllowance: result.totalAllowance, output }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
