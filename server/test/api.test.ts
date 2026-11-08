import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { createSim, step, TICK_HZ } from '../../src/sim/core';
import { ReplayRecorder, type ReplayV1 } from '../../src/sim/replay';
import { TimelineCursor, type SessionReply, type TimelinePoint } from '../../src/net/timeline';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { harness, ORIGIN, type Harness } from './harness';
import { formatSiweMessage } from '../../src/site/siwe';

const ACCOUNT = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const SECOND_ACCOUNT = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');

function points(h: Harness): TimelinePoint[] {
  return h.db.prepare('SELECT at, valid_until AS validUntil, rpm_milli AS rpmMilli, installation_id AS installationId, height FROM telemetry ORDER BY at').all() as unknown as TimelinePoint[];
}
/** Plays like the browser: same server timeline, optional jumps; returns a canonical replay. */
function play(h: Harness, session: SessionReply, jumps: number[] = [], tamper?: (input: { rpmMilli?: number | null; nut?: boolean }, tick: number) => void): ReplayV1 {
  const cursor = new TimelineCursor(points(h), session.startedAt);
  const sim = createSim(session.seed), recorder = new ReplayRecorder(session.seed, 'live');
  while (!sim.gameOver) {
    const input = cursor.input(sim.tick);
    if (jumps.includes(sim.tick)) input.jump = true;
    tamper?.(input, sim.tick);
    recorder.record(sim.tick, input);
    step(sim, input);
  }
  return recorder.finish(sim);
}
async function json<T = Record<string, unknown>>(response: Response): Promise<T> { return response.json() as Promise<T>; }
async function session(h: Harness): Promise<SessionReply> {
  const reply = await h.call('POST', '/v1/session', { turnstileToken: 'XXXX.DUMMY.TOKEN' });
  expect(reply.status).toBe(200);
  return json<SessionReply>(reply);
}
function seedTelemetry(h: Harness, rpmMilli: number | null = 60000, height = '100'): void {
  for (let i = -3; i < 200; i++) h.addPoint({ at: h.clock.now + i * 10000, rpmMilli, height });
}
async function submit(h: Harness, s: SessionReply, replay: ReplayV1, early = 0): Promise<Response> {
  h.clock.now = s.startedAt + Math.ceil(replay.endTick * 1000 / TICK_HZ) - early;
  return h.call('POST', '/v1/run', { sessionId: s.sessionId, replay });
}
async function eligibleRun(h: Harness): Promise<{ runToken: string; runId: string; score: number }> {
  seedTelemetry(h);
  const s = await session(h);
  const reply = await submit(h, s, play(h, s));
  expect(reply.status).toBe(200);
  const run = await json<{ runToken: string; runId: string; score: number; eligible: boolean }>(reply);
  expect(run.eligible).toBe(true);
  return run;
}
async function siwe(h: Harness, runId: string, patch: Partial<Parameters<typeof createSiweMessage>[0]> = {}, account = ACCOUNT) {
  const n = await json<{ nonce: string; issuedAt: string; expirationTime: string; domain: string; uri: string; chainId: number; statement: string }>(await h.call('GET', '/v1/nonce'));
  const message = createSiweMessage({
    address: account.address, chainId: n.chainId, domain: n.domain, uri: n.uri, nonce: n.nonce, version: '1',
    statement: n.statement, issuedAt: new Date(n.issuedAt), expirationTime: new Date(n.expirationTime),
    resources: [`urn:squeekrunner:run:${runId}`], ...patch,
  });
  return { siweMessage: message, signature: await account.signMessage({ message }) };
}

describe('sessions and authoritative runs', () => {
  it('refuses a session before telemetry exists and requires a Turnstile token', async () => {
    const h = harness();
    expect((await h.call('POST', '/v1/session', { turnstileToken: 'x' })).status).toBe(503);
    seedTelemetry(h);
    h.siteverify.success = false;
    expect((await h.call('POST', '/v1/session', { turnstileToken: 'x' })).status).toBe(403);
    expect((await h.call('POST', '/v1/session', {})).status).toBe(400);
  });

  it('scores an honest run from the server timeline, once', async () => {
    const h = harness({ THRESHOLD: '1', REQUIRED_COINS: '0' });
    seedTelemetry(h);
    const s = await session(h);
    const replay = play(h, s, [150, 151]);
    const reply = await submit(h, s, replay);
    expect(reply.status).toBe(200);
    const run = await json<{ score: number; eligible: boolean; endTick: number }>(reply);
    expect(run).toMatchObject({ score: replay.clientScore, endTick: replay.endTick, eligible: true });
    expect((await h.call('POST', '/v1/run', { sessionId: s.sessionId, replay })).status).toBe(409);
  });

  it('by default a run is raffle-eligible only with the threshold AND all 10 coins', async () => {
    const h = harness({ THRESHOLD: '1' });
    seedTelemetry(h);
    const s = await session(h);
    const run = await json<{ score: number; coins: number; eligible: boolean }>(await submit(h, s, play(h, s)));
    expect(run.score).toBeGreaterThanOrEqual(1);
    expect(run.coins).toBe(0);
    expect(run.eligible).toBe(false);
    const status = await json<{ requiredCoins: number }>(await h.call('GET', '/v1/raffle/status'));
    expect(status.requiredCoins).toBe(10);
  });

  it('rejects submissions faster than real time and very late ones', async () => {
    const h = harness();
    seedTelemetry(h);
    const s = await session(h);
    const replay = play(h, s);
    expect((await submit(h, s, replay, 2000)).status).toBe(400);
    const late = await session(h);
    const lateReplay = play(h, late);
    h.clock.now = late.startedAt + lateReplay.endTick * 1000 / TICK_HZ + 60000;
    expect((await h.call('POST', '/v1/run', { sessionId: late.sessionId, replay: lateReplay })).status).toBe(410);
  });

  it('ignores client telemetry: claiming a stopped wheel during a fast run is a mismatch', async () => {
    const h = harness();
    seedTelemetry(h, 98316);
    const s = await session(h);
    const cheated = play(h, s, [], input => { input.rpmMilli = null; });
    const reply = await submit(h, s, cheated);
    expect(reply.status).toBe(409);
    expect((await json<{ error: { code: string } }>(reply)).error.code).toBe('score_mismatch');
  });

  it('does not credit invented golden nuts', async () => {
    const h = harness();
    seedTelemetry(h);
    const s = await session(h);
    const cheated = play(h, s, [], (input, tick) => { if (tick === 30) input.nut = true; });
    const reply = await submit(h, s, cheated);
    // A fabricated nut either changes nothing (then the run is honest) or changes the score (rejected).
    const honest = play(h, s);
    if (honest.clientScore !== cheated.clientScore || honest.endTick !== cheated.endTick) expect(reply.status).toBe(409);
  });

  it('rejects a replay for a different seed', async () => {
    const h = harness();
    seedTelemetry(h);
    const s = await session(h);
    const replay = { ...play(h, s), seed: (s.seed + 1) >>> 0 };
    expect((await submit(h, s, replay)).status).toBe(400);
  });
});

describe('SIWE raffle entries', () => {
  const open = { THRESHOLD: '1', ENTRIES_OPEN: 'true', REQUIRED_COINS: '0' };

  it('accepts the message produced by the website formatter (lowercase wallet address)', async () => {
    const h = harness(open);
    const run = await eligibleRun(h);
    const n = await json<{ nonce: string; issuedAt: string; expirationTime: string; domain: string; uri: string; chainId: number; statement: string }>(await h.call('GET', '/v1/nonce'));
    const address = ACCOUNT.address.toLowerCase();
    const siweMessage = formatSiweMessage({ ...n, address, resources: [`urn:squeekrunner:run:${run.runId}`] });
    expect(siweMessage).toBe(createSiweMessage({ address: address as `0x${string}`, chainId: n.chainId, domain: n.domain, uri: n.uri,
      nonce: n.nonce, version: '1', statement: n.statement, issuedAt: new Date(n.issuedAt), expirationTime: new Date(n.expirationTime),
      resources: [`urn:squeekrunner:run:${run.runId}`] }));
    const signature = await ACCOUNT.signMessage({ message: siweMessage });
    const reply = await h.call('POST', '/v1/entry', { runToken: run.runToken, siweMessage, signature, turnstileToken: 't' });
    expect(reply.status).toBe(200);
  });

  it('accepts one signed entry per wallet and per run', async () => {
    const h = harness(open);
    const run = await eligibleRun(h);
    const entry = await siwe(h, run.runId);
    const reply = await h.call('POST', '/v1/entry', { runToken: run.runToken, ...entry, turnstileToken: 't' });
    expect(reply.status).toBe(200);
    expect(await json(reply)).toEqual({ address: ACCOUNT.address.toLowerCase(), entered: true });
    const again = await siwe(h, run.runId);
    expect((await h.call('POST', '/v1/entry', { runToken: run.runToken, ...again, turnstileToken: 't' })).status).toBe(409);
    const other = await eligibleRun(h);
    const sameWallet = await siwe(h, other.runId);
    expect((await h.call('POST', '/v1/entry', { runToken: other.runToken, ...sameWallet, turnstileToken: 't' })).status).toBe(409);
    const status = await json<{ entriesCount: number }>(await h.call('GET', '/v1/raffle/status'));
    expect(status.entriesCount).toBe(1);
  });

  it.each([
    ['wrong chain', { chainId: 1 }],
    ['wrong domain', { domain: 'evil.example' }],
    ['wrong uri', { uri: 'https://evil.example/whitelist/' }],
    ['wrong statement', { statement: 'Sign anything' }],
    ['other run', { resources: ['urn:squeekrunner:run:deadbeef'] }],
  ])('rejects a message with %s', async (_name, patch) => {
    const h = harness(open);
    const run = await eligibleRun(h);
    const entry = await siwe(h, run.runId, patch);
    expect((await h.call('POST', '/v1/entry', { runToken: run.runToken, ...entry, turnstileToken: 't' })).status).toBe(403);
  });

  it('rejects a signature from another wallet, an expired nonce and closed entries', async () => {
    const h = harness(open);
    const run = await eligibleRun(h);
    const entry = await siwe(h, run.runId);
    const forged = await SECOND_ACCOUNT.signMessage({ message: entry.siweMessage });
    expect((await h.call('POST', '/v1/entry', { runToken: run.runToken, siweMessage: entry.siweMessage, signature: forged, turnstileToken: 't' })).status).toBe(403);
    const stale = await siwe(h, run.runId);
    h.clock.now += 6 * 60000;
    expect((await h.call('POST', '/v1/entry', { runToken: run.runToken, ...stale, turnstileToken: 't' })).status).toBe(403);

    const closed = harness({ THRESHOLD: '1', ENTRIES_OPEN: 'false', REQUIRED_COINS: '0' });
    const closedRun = await eligibleRun(closed);
    const closedEntry = await siwe(closed, closedRun.runId);
    expect((await closed.call('POST', '/v1/entry', { runToken: closedRun.runToken, ...closedEntry, turnstileToken: 't' })).status).toBe(403);
  });
});

describe('stats, export and transport rules', () => {
  it('publishes score percentiles and a histogram', async () => {
    const h = harness();
    seedTelemetry(h);
    for (let i = 0; i < 3; i++) { const s = await session(h); expect((await submit(h, s, play(h, s))).status).toBe(200); h.clock.now += 61000; }
    const stats = await json<{ verifiedRuns: number; percentiles: Record<string, number | null>; histogram: { count: number }[] }>(await h.call('GET', '/v1/stats'));
    expect(stats.verifiedRuns).toBe(3);
    expect(stats.percentiles.p50).not.toBeNull();
    expect(stats.histogram.reduce((a, b) => a + b.count, 0)).toBe(3);
  });

  it('exports entries for build-merkle only with the admin token', async () => {
    const h = harness({ THRESHOLD: '1', ENTRIES_OPEN: 'true', REQUIRED_COINS: '0' });
    const run = await eligibleRun(h);
    const entry = await siwe(h, run.runId);
    expect((await h.call('POST', '/v1/entry', { runToken: run.runToken, ...entry, turnstileToken: 't' })).status).toBe(200);
    expect((await h.call('GET', '/v1/admin/export')).status).toBe(401);
    const csv = await (await h.call('GET', '/v1/admin/export?format=csv', undefined, { Authorization: `Bearer ${'a'.repeat(40)}` })).text();
    expect(csv).toBe(`address,allowance\n${ACCOUNT.address.toLowerCase()},1\n`);
    // Same header and column order as contracts/examples/allowlist.csv, which build-merkle accepts.
    expect(readFileSync(fileURLToPath(new URL('../../contracts/examples/allowlist.csv', import.meta.url).href), 'utf8').startsWith('address,allowance')).toBe(true);
  });

  it('enforces CORS origin and body limits', async () => {
    const h = harness();
    expect((await h.call('GET', '/v1/stats', undefined, { Origin: 'https://evil.example' })).status).toBe(403);
    const preflight = await h.call('OPTIONS', '/v1/run');
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const huge = 'x'.repeat(5000);
    expect((await h.call('POST', '/v1/session', { turnstileToken: huge })).status).toBe(413);
  });
});
