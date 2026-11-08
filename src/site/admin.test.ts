import { describe, expect, it } from 'vitest';
import { AdminApi, ether, flags, type Application } from './admin';

const base: Application = {
  id: 'a'.repeat(32), code: 'SQR-ABCD-1234', address: '0x' + '1'.repeat(40), xHandle: 'runner', postUrl: 'https://x.com/runner/status/1',
  xStatus: 'verified', xDetail: 'ok', createdAt: 0, status: 'pending', reviewNote: null, reviewedAt: null, chain: null, chainCheckedAt: null,
  applyIp: 'aaaa1111', runIp: 'aaaa1111', score: 123456, coins: 10, endTick: 36000, runAt: 0,
  signals: { jumps: 200, airJumps: 40, leadMean: 120, leadStd: 30, airDelayMean: 20, airDelayStd: 5 },
  applyIpApplications: 1, runIpApplications: 1, runIpRuns: 4, runIpQualified: 1, runIpBest: 123456,
};
const chain = (patch: Partial<NonNullable<Application['chain']>> = {}): NonNullable<Application['chain']> => ({
  checkedAt: 0, mainnet: { txCount: 12, balanceWei: '0', isContract: false, firstSeen: '2021-01-01T00:00:00Z' },
  sepolia: { txCount: 3, balanceWei: '0', isContract: false, firstSeen: '2024-01-01T00:00:00Z', sqkBalance: '0' },
  squeekchain: { squeeks: 0, staked: 0, activity: 0, rewardsClaimable: '0', rewardsPaid: '0' }, ...patch,
});
const texts = (a: Application) => flags(a).map(f => `${f.level}:${f.text}`);

describe('review flags', () => {
  it('highlights an unchecked X post and missing chain data', () => {
    const t = texts({ ...base, xStatus: 'unchecked' });
    expect(t.some(x => x.startsWith('warn:X post NOT checked'))).toBe(true);
    expect(t.some(x => x.includes('Chain signals not checked'))).toBe(true);
  });
  it('flags network clusters, uniform input, fresh addresses and contracts', () => {
    const t = texts({ ...base, applyIpApplications: 3, runIpApplications: 2,
      signals: { jumps: 200, airJumps: 40, leadMean: 100, leadStd: 1.2, airDelayMean: 18, airDelayStd: 0.4 },
      chain: chain({ mainnet: { txCount: 0, balanceWei: '0', isContract: true, firstSeen: null }, sepolia: { txCount: 0, balanceWei: '0', isContract: false, firstSeen: null, sqkBalance: '0' } }) });
    for (const needle of ['bad:3 applications', 'bad:2 applications', 'bad:Very uniform jump', 'bad:Very uniform double', 'bad:Fresh address', 'warn:Address is a contract']) {
      expect(t.some(x => x.startsWith(needle)), needle).toBe(true);
    }
  });
  it('credits Squeekchain activity and $SQK, and stays quiet for an ordinary player', () => {
    const t = texts({ ...base, chain: chain({ squeekchain: { squeeks: 2, staked: 1, activity: 9, rewardsClaimable: '0', rewardsPaid: '0' },
      sepolia: { txCount: 3, balanceWei: '0', isContract: false, firstSeen: '2024-01-01T00:00:00Z', sqkBalance: '5' } }) });
    expect(t).toEqual(['good:Squeekchain activity', 'good:Holds $SQK']);
  });
});

it('formats token amounts', () => {
  expect(ether('1500000000000000000')).toBe('1.5000');
  expect(ether(null)).toBe('—');
});

it('admin API sends the bearer token and surfaces server errors', async () => {
  const calls: [string, RequestInit][] = [];
  const api = new AdminApi('https://api.test/', 'tok', (async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    return url.includes('review') ? Response.json({ error: { message: 'Invalid' } }, { status: 400 }) : Response.json({ applications: [], counts: {}, serverNow: 1 });
  }) as typeof fetch);
  await api.list('pending');
  expect(calls[0][0]).toBe('https://api.test/v1/admin/applications?status=pending');
  expect((calls[0][1].headers as Record<string, string>).Authorization).toBe('Bearer tok');
  await expect(api.review('x', 'approved', null)).rejects.toThrow('Invalid');
});
