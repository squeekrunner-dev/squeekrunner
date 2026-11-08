// Provably fair whitelist raffle for SqueekRunner Hamsters.
//
//   1. commit  — freeze the entry list: publish its Merkle root, entry count and a FUTURE Sepolia block number.
//   2. draw    — after that block is final, its hash seeds an unbiased partial Fisher–Yates shuffle.
//   3. verify  — anyone recomputes the winners from the public entry list, commitment and block hash.
//
// Nobody (including the organizers) knows the block hash when the commitment is published, and the
// entry list cannot change afterwards without changing the published root.
import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AbiCoder, getAddress, keccak256, ZeroAddress, JsonRpcProvider } from 'ethers';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { parseList } from './build-merkle.mjs';

export const SEPOLIA_CHAIN_ID = 11155111;
export const RAFFLE_WINNERS = 700;
const COMMIT_FORMAT = 'squeekrunner-raffle-commit-v1';
const RESULT_FORMAT = 'squeekrunner-raffle-result-v1';
const coder = AbiCoder.defaultAbiCoder();
const TWO_256 = 1n << 256n;

/** Entries from the server export: one ticket per address. Canonical order = lowercase ascending. */
export function canonicalEntries(records) {
  if (!Array.isArray(records) || records.length === 0) throw new Error('The entry list is empty');
  const seen = new Set();
  const addresses = records.map((record, index) => {
    let address;
    try { address = getAddress(record?.address); } catch { throw new Error(`Invalid address in entry ${index + 1}`); }
    if (address === ZeroAddress) throw new Error('Zero address cannot enter');
    if (String(record.allowance ?? '1') !== '1') throw new Error(`Each entry must have allowance 1 (${address})`);
    if (seen.has(address)) throw new Error(`Duplicate entry: ${address}`);
    seen.add(address);
    return address;
  });
  return addresses.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en'));
}

export function entriesRoot(addresses) {
  return StandardMerkleTree.of(addresses.map(a => [a]), ['address']).root;
}

export function createCommitment(addresses, targetBlock, winners = RAFFLE_WINNERS) {
  if (!Number.isSafeInteger(targetBlock) || targetBlock <= 0) throw new Error('Target block must be a positive integer');
  if (!Number.isSafeInteger(winners) || winners <= 0) throw new Error('Winner count must be a positive integer');
  return {
    format: COMMIT_FORMAT, chainId: SEPOLIA_CHAIN_ID, targetBlock, winners,
    entries: addresses.length, entriesRoot: entriesRoot(addresses),
    algorithm: 'partial Fisher-Yates; j = i + uniform(n - i); uniform via keccak256(abi.encode(blockHash, entriesRoot, counter)) with rejection sampling',
  };
}

/** Deterministic, unbiased integer stream seeded by the block hash and the committed root. */
function uniformSource(blockHash, root) {
  let counter = 0n;
  const word = () => BigInt(keccak256(coder.encode(['bytes32', 'bytes32', 'uint256'], [blockHash, root, counter++])));
  return m => {
    const bound = BigInt(m);
    const limit = TWO_256 - (TWO_256 % bound); // reject the biased tail
    for (;;) { const x = word(); if (x < limit) return Number(x % bound); }
  };
}

export function drawWinners(addresses, commitment, blockHash) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(blockHash)) throw new Error('Block hash must be 0x + 64 hex characters');
  if (commitment?.format !== COMMIT_FORMAT || commitment.chainId !== SEPOLIA_CHAIN_ID) throw new Error('Unknown commitment format');
  const root = entriesRoot(addresses);
  if (root !== commitment.entriesRoot || addresses.length !== commitment.entries) {
    throw new Error('Entry list does not match the published commitment');
  }
  const pool = [...addresses];
  const k = Math.min(commitment.winners, pool.length);
  const uniform = uniformSource(blockHash.toLowerCase(), root);
  for (let i = 0; i < k; i++) {
    const j = i + uniform(pool.length - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return {
    format: RESULT_FORMAT, commitment, blockHash: blockHash.toLowerCase(),
    winners: pool.slice(0, k),
  };
}

export function verifyResult(addresses, commitment, blockHash, result) {
  const expected = drawWinners(addresses, commitment, blockHash);
  return result?.format === RESULT_FORMAT && JSON.stringify(result.winners) === JSON.stringify(expected.winners) &&
    result.blockHash === expected.blockHash && JSON.stringify(result.commitment) === JSON.stringify(commitment);
}

export function winnersCsv(result) {
  return 'address,allowance\n' + result.winners.map(a => `${a},1`).join('\n') + '\n';
}

async function loadEntries(path) {
  return canonicalEntries(parseList(await readFile(path, 'utf8'), extname(path)));
}
async function resolveBlockHash(arg, commitment) {
  if (arg !== 'rpc') return arg;
  const url = process.env.SEPOLIA_RPC_URL;
  if (!url) throw new Error('Set SEPOLIA_RPC_URL or pass the block hash explicitly');
  const provider = new JsonRpcProvider(url, SEPOLIA_CHAIN_ID, { staticNetwork: true });
  const block = await provider.getBlock('finalized');
  if (!block || block.number < commitment.targetBlock) throw new Error(`Block ${commitment.targetBlock} is not finalized yet`);
  const target = await provider.getBlock(commitment.targetBlock);
  if (!target?.hash) throw new Error('Target block not found');
  return target.hash;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const usage = 'Usage:\n  raffle commit <entries.csv|json> <targetBlock> <commit.json>\n' +
    '  raffle draw <entries> <commit.json> <blockHash|rpc> <result.json>\n  raffle verify <entries> <commit.json> <blockHash|rpc> <result.json>';
  if (command === 'commit' && args.length === 3) {
    const [entries, block, out] = args;
    const commitment = createCommitment(await loadEntries(resolve(entries)), Number(block));
    await writeFile(resolve(out), JSON.stringify(commitment, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(commitment, null, 2));
  } else if ((command === 'draw' || command === 'verify') && args.length === 4) {
    const [entries, commitPath, hashArg, out] = args;
    const addresses = await loadEntries(resolve(entries));
    const commitment = JSON.parse(await readFile(resolve(commitPath), 'utf8'));
    const blockHash = await resolveBlockHash(hashArg, commitment);
    if (command === 'draw') {
      const result = drawWinners(addresses, commitment, blockHash);
      await writeFile(resolve(out), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
      await writeFile(resolve(out).replace(/\.json$/, '') + '.winners.csv', winnersCsv(result), { flag: 'wx' });
      console.log(JSON.stringify({ blockHash: result.blockHash, winners: result.winners.length, entries: addresses.length }, null, 2));
    } else {
      const ok = verifyResult(addresses, commitment, blockHash, JSON.parse(await readFile(resolve(out), 'utf8')));
      console.log(ok ? 'VERIFIED: winners match the commitment and block hash' : 'MISMATCH: the published winners are NOT reproducible');
      if (!ok) process.exitCode = 2;
    }
  } else {
    throw new Error(usage);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
