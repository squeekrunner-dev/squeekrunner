import type { Env, Runtime } from './security';

/** Public-chain signals about an applicant address for the review panel. Never used automatically. */
export interface NetworkSignals {
  txCount: number | null; balanceWei: string | null; isContract: boolean | null;
  /** EIP-7702: an ordinary account delegating to code (0xef0100 designator), not a contract. */
  delegated?: boolean;
  firstSeen: string | null; error?: string;
}
export interface SqueekchainSignals {
  squeeks: number | null; staked: number | null; sqkPower: string | null; stakePrincipal: string | null;
  rewardsClaimable: string | null; rewardsPaid: string | null; activity: number | null; error?: string;
}
export interface ChainSignals {
  checkedAt: number;
  mainnet: NetworkSignals; sepolia: NetworkSignals & { sqkBalance: string | null };
  squeekchain: SqueekchainSignals;
}

export const SQK_SEPOLIA = '0xd78a3956cF63164d1Fa1C622ad3c66623162Fa1e';
const SQUEEKCHAIN_API = 'https://api.squeekchain.com/v1';
const NETWORKS = { mainnet: 'eth-mainnet', sepolia: 'eth-sepolia' } as const;

interface RpcReply { id: number; result?: unknown; error?: { message?: string } }
async function rpc(rt: Runtime, network: string, key: string, calls: [string, unknown[]][]): Promise<unknown[]> {
  const reply = await rt.fetcher(`https://${network}.g.alchemy.com/v2/${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
    body: JSON.stringify(calls.map(([method, params], id) => ({ jsonrpc: '2.0', id, method, params }))),
  });
  if (!reply.ok) throw new Error(`Alchemy ${network} HTTP ${reply.status}`);
  const data = await reply.json() as RpcReply[];
  if (!Array.isArray(data)) throw new Error(`Alchemy ${network} returned no batch`);
  return calls.map((_, id) => { const r = data.find(x => x.id === id); return r?.error ? undefined : r?.result; });
}
const hexNumber = (x: unknown): number | null => typeof x === 'string' && /^0x[0-9a-f]+$/i.test(x) ? Number(BigInt(x)) : null;
const hexString = (x: unknown): string | null => typeof x === 'string' && /^0x[0-9a-f]*$/i.test(x) ? BigInt(x === '0x' ? 0 : x).toString() : null;
function earliest(...results: unknown[]): string | null {
  const times = results.flatMap(r => {
    const t = (r as { transfers?: { metadata?: { blockTimestamp?: string } }[] } | undefined)?.transfers?.[0]?.metadata?.blockTimestamp;
    return t && Number.isFinite(Date.parse(t)) ? [t] : [];
  });
  return times.length ? times.sort()[0] : null;
}
const transfers = (address: string, direction: 'fromAddress' | 'toAddress') => ['alchemy_getAssetTransfers', [{
  fromBlock: '0x0', toBlock: 'latest', [direction]: address, category: ['external', 'erc20', 'erc721', 'erc1155'],
  order: 'asc', maxCount: '0x1', withMetadata: true, excludeZeroValue: false,
}]] as [string, unknown[]];

async function network(rt: Runtime, key: string, name: keyof typeof NETWORKS, address: string, extra: [string, unknown[]][] = []) {
  const results = await rpc(rt, NETWORKS[name], key, [
    ['eth_getTransactionCount', [address, 'latest']], ['eth_getBalance', [address, 'latest']], ['eth_getCode', [address, 'latest']],
    transfers(address, 'fromAddress'), transfers(address, 'toAddress'), ...extra,
  ]);
  const code = typeof results[2] === 'string' ? results[2].toLowerCase() : null;
  const delegated = !!code && code.startsWith('0xef0100');
  return { signals: { txCount: hexNumber(results[0]), balanceWei: hexString(results[1]),
    isContract: code === null ? null : code !== '0x' && !delegated, delegated, firstSeen: earliest(results[3], results[4]) }, extra: results.slice(5) };
}
const emptyNetwork = (error: string): NetworkSignals => ({ txCount: null, balanceWei: null, isContract: null, firstSeen: null, error });

async function squeekchain(rt: Runtime, address: string): Promise<SqueekchainSignals> {
  const get = async (path: string) => {
    const reply = await rt.fetcher(`${SQUEEKCHAIN_API}${path}`, { signal: AbortSignal.timeout(8000) });
    if (!reply.ok) throw new Error(`Squeekchain API ${reply.status}`);
    return reply.json() as Promise<Record<string, unknown>>;
  };
  try {
    const [account, activity] = await Promise.all([get(`/accounts/${address}`), get(`/accounts/${address}/activity?limit=1`)]);
    const tokens = Array.isArray(account.tokens) ? account.tokens as { custody?: string }[] : null;
    const str = (x: unknown): string | null => typeof x === 'string' && /^\d+$/.test(x) ? x : null;
    const power = account.power as Record<string, unknown> | undefined, stake = account.stake as Record<string, unknown> | undefined;
    const rewards = account.rewards as Record<string, unknown> | undefined;
    return {
      squeeks: tokens ? tokens.length : null, staked: tokens ? tokens.filter(t => t.custody === 'staking').length : null,
      sqkPower: str(power?.sqkPower), stakePrincipal: str(stake?.principalBaseUnits),
      rewardsClaimable: str(rewards?.claimableBaseUnits), rewardsPaid: str(rewards?.lifetimePaidBaseUnits),
      activity: str(activity.total) === null ? null : Number(activity.total),
    };
  } catch (error) {
    return { squeeks: null, staked: null, sqkPower: null, stakePrincipal: null, rewardsClaimable: null, rewardsPaid: null, activity: null,
      error: error instanceof Error ? error.message : 'Squeekchain API unavailable' };
  }
}

export async function chainSignals(env: Env, rt: Runtime, address: string): Promise<ChainSignals> {
  const key = env.ALCHEMY_KEY?.trim();
  const balanceOf = ['eth_call', [{ to: SQK_SEPOLIA, data: `0x70a08231${address.slice(2).toLowerCase().padStart(64, '0')}` }, 'latest']] as [string, unknown[]];
  const [mainnet, sepolia, sqc] = await Promise.all([
    key ? network(rt, key, 'mainnet', address).then(r => r.signals, (e: Error) => emptyNetwork(e.message)) : Promise.resolve(emptyNetwork('ALCHEMY_KEY not configured')),
    key ? network(rt, key, 'sepolia', address, [balanceOf]).then(r => ({ ...r.signals, sqkBalance: hexString(r.extra[0]) }),
      (e: Error) => ({ ...emptyNetwork(e.message), sqkBalance: null })) : Promise.resolve({ ...emptyNetwork('ALCHEMY_KEY not configured'), sqkBalance: null }),
    squeekchain(rt, address),
  ]);
  return { checkedAt: rt.now(), mainnet, sepolia, squeekchain: sqc };
}
