import { describe, expect, it } from 'vitest';
import { CHUNK_TICKS, createSim, step, TICK_HZ } from '../../src/sim/core';
import { chunkSeeds } from '../src/map';
import { ReplayRecorder, type ReplayV1 } from '../../src/sim/replay';
import { TimelineCursor, type SessionReply, type TimelinePoint } from '../../src/net/timeline';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { harness, ORIGIN, type Harness } from './harness';


function points(h: Harness): TimelinePoint[] {
  return h.db.prepare('SELECT at, valid_until AS validUntil, rpm_milli AS rpmMilli, installation_id AS installationId, height FROM telemetry ORDER BY at').all() as unknown as TimelinePoint[];
}
/** Plays like the browser: same server timeline, optional jumps; returns a canonical replay. */
/** The server's chunk seeds for a session (the browser receives them over /v1/map as they are released). */
async function seedsOf(h: Harness, session: SessionReply, count = 400): Promise<number[]> {
  const row = h.db.prepare('SELECT map_secret FROM sessions WHERE id=?').get(session.sessionId) as { map_secret: string };
  return chunkSeeds(row.map_secret, count);
}
async function play(h: Harness, session: SessionReply, jumps: number[] = [], tamper?: (input: { rpmMilli?: number | null; nut?: boolean; chunkSeed?: number }, tick: number) => void): Promise<ReplayV1> {
  const seeds = await seedsOf(h, session);
  const cursor = new TimelineCursor(points(h), session.startedAt);
  const sim = createSim(session.seed), recorder = new ReplayRecorder(session.seed, 'live');
  while (!sim.gameOver) {
    const input = cursor.input(sim.tick);
    if (sim.tick % CHUNK_TICKS === 0) input.chunkSeed = seeds[sim.tick / CHUNK_TICKS];
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
  const reply = await submit(h, s, await play(h, s));
  expect(reply.status).toBe(200);
  const run = await json<{ runToken: string; runId: string; score: number; eligible: boolean }>(reply);
  expect(run.eligible).toBe(true);
  return run;
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
    const replay = await play(h, s, [150, 151]);
    const reply = await submit(h, s, replay);
    expect(reply.status).toBe(200);
    const run = await json<{ score: number; eligible: boolean; endTick: number }>(reply);
    expect(run).toMatchObject({ score: replay.clientScore, endTick: replay.endTick, eligible: true });
    expect((await h.call('POST', '/v1/run', { sessionId: s.sessionId, replay })).status).toBe(409);
  });

  it('by default a run qualifies only with the threshold AND all 10 coins', async () => {
    const h = harness({ THRESHOLD: '1' });
    seedTelemetry(h);
    const s = await session(h);
    const run = await json<{ score: number; coins: number; eligible: boolean }>(await submit(h, s, await play(h, s)));
    expect(run.score).toBeGreaterThanOrEqual(1);
    expect(run.coins).toBe(0);
    expect(run.eligible).toBe(false);
    const status = await json<{ requiredCoins: number }>(await h.call('GET', '/v1/whitelist/status'));
    expect(status.requiredCoins).toBe(10);
  });

  it('rejects submissions faster than real time and very late ones', async () => {
    const h = harness();
    seedTelemetry(h);
    const s = await session(h);
    const replay = await play(h, s);
    expect((await submit(h, s, replay, 2000)).status).toBe(400);
    const late = await session(h);
    const lateReplay = await play(h, late);
    h.clock.now = late.startedAt + lateReplay.endTick * 1000 / TICK_HZ + 60000;
    expect((await h.call('POST', '/v1/run', { sessionId: late.sessionId, replay: lateReplay })).status).toBe(410);
  });

  it('ignores client telemetry: claiming a stopped wheel during a fast run is a mismatch', async () => {
    const h = harness();
    seedTelemetry(h, 98316);
    const s = await session(h);
    const cheated = await play(h, s, [], input => { input.rpmMilli = null; });
    const reply = await submit(h, s, cheated);
    expect(reply.status).toBe(409);
    expect((await json<{ error: { code: string } }>(reply)).error.code).toBe('score_mismatch');
  });

  it('does not credit invented golden nuts', async () => {
    const h = harness();
    seedTelemetry(h);
    const s = await session(h);
    const cheated = await play(h, s, [], (input, tick) => { if (tick === 30) input.nut = true; });
    const reply = await submit(h, s, cheated);
    // A fabricated nut either changes nothing (then the run is honest) or changes the score (rejected).
    const honest = await play(h, s);
    if (honest.clientScore !== cheated.clientScore || honest.endTick !== cheated.endTick) expect(reply.status).toBe(409);
  });

  it('releases map chunks only shortly before they start, and only to the session owner', async () => {
    const h = harness();
    seedTelemetry(h);
    const s = await session(h);
    expect(s.map.chunks.map(c => c.index)).toEqual([0]);
    const seeds = await seedsOf(h, s, 3);
    expect(s.map.chunks[0].seed).toBe(seeds[0]);
    const chunkMs = CHUNK_TICKS * 1000 / TICK_HZ;
    expect(s.map.nextAt).toBe(s.startedAt + chunkMs - 3000);
    const map = (from: number, headers?: Record<string, string>) => h.call('POST', '/v1/map', { sessionId: s.sessionId, from }, headers);
    h.clock.now = s.map.nextAt - 1;
    expect((await json<{ chunks: unknown[] }>(await map(1))).chunks).toEqual([]);
    h.clock.now = s.map.nextAt;
    expect((await json<{ chunks: { index: number; seed: number }[] }>(await map(1))).chunks).toEqual([{ index: 1, seed: seeds[1] }]);
    h.clock.now = s.startedAt + 10 * chunkMs;
    expect((await json<{ chunks: unknown[] }>(await map(0))).chunks).toHaveLength(8); // paged
    expect((await map(-1)).status).toBe(400);
    expect((await map(1, { 'CF-Connecting-IP': '203.0.113.9' })).status).toBe(409); // another network
    expect((await h.call('POST', '/v1/map', { sessionId: 'nope', from: 0 })).status).toBe(409);
  });

  it('a replay played on locally derived chunks (not the server map) is rejected', async () => {
    const h = harness();
    seedTelemetry(h);
    const jumps = Array.from({ length: 200 }, (_, i) => 20 + i * 37);
    let diverged = 0;
    for (let i = 0; i < 6; i++) {
      const s = await session(h);
      const offline = await play(h, s, jumps, (input, tick) => { if (tick % CHUNK_TICKS === 0) delete input.chunkSeed; });
      const honest = await play(h, s, jumps);
      if (offline.endTick === honest.endTick && offline.clientScore === honest.clientScore) { h.clock.now += 61000; continue; }
      diverged++;
      expect((await submit(h, s, offline)).status).toBe(409);
      h.clock.now += 61000;
    }
    expect(diverged).toBeGreaterThan(0);
  });

  it('rejects a replay for a different seed', async () => {
    const h = harness();
    seedTelemetry(h);
    const s = await session(h);
    const replay = { ...(await play(h, s)), seed: (s.seed + 1) >>> 0 };
    expect((await submit(h, s, replay)).status).toBe(400);
  });
});

describe('whitelist applications (manual review, not a raffle)', () => {
  const open = { THRESHOLD: '1', APPLICATIONS_OPEN: 'true', REQUIRED_COINS: '0' };
  const ADDRESS = '0x52908400098527886E0F7030069857D2E4169EE7'; // valid EIP-55
  const ADMIN = { Authorization: `Bearer ${'a'.repeat(40)}` };
  async function code(h: Harness, runToken: string): Promise<string> {
    const reply = await h.call('POST', '/v1/application/code', { runToken });
    expect(reply.status).toBe(200);
    return (await json<{ code: string }>(reply)).code;
  }
  async function applyWith(h: Harness, runToken: string, patch: Record<string, unknown> = {}) {
    return h.call('POST', '/v1/application', { runToken, address: ADDRESS, xHandle: '@Runner', postUrl: 'https://x.com/Runner/status/1234567890123?s=20', turnstileToken: 't', ...patch });
  }
  async function ready(h: Harness) {
    const run = await eligibleRun(h);
    const c = await code(h, run.runToken);
    h.x.author = 'Runner'; h.x.text = `I ran ${run.score} in SqueekRunner. Whitelist application ${c}`;
    return { run, code: c };
  }

  it('issues a stable SQR code for a qualifying run, only while applications are open', async () => {
    const h = harness(open);
    const run = await eligibleRun(h);
    const c = await code(h, run.runToken);
    expect(c).toMatch(/^SQR-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(await code(h, run.runToken)).toBe(c);
    expect((await h.call('POST', '/v1/application/code', { runToken: 'f'.repeat(64) })).status).toBe(403);
    const closed = harness({ ...open, APPLICATIONS_OPEN: 'false' });
    const closedRun = await eligibleRun(closed);
    expect((await closed.call('POST', '/v1/application/code', { runToken: closedRun.runToken })).status).toBe(403);
  });

  it('a run without all coins cannot apply by default', async () => {
    const h = harness({ THRESHOLD: '1', APPLICATIONS_OPEN: 'true' });
    seedTelemetry(h);
    const s = await session(h);
    const run = await json<{ runToken: string; eligible: boolean }>(await submit(h, s, await play(h, s)));
    expect(run.eligible).toBe(false);
    expect((await h.call('POST', '/v1/application/code', { runToken: run.runToken })).status).toBe(403);
  });

  it('accepts a verified application once per run, address, X account and post', async () => {
    const h = harness(open);
    const { run, code: c } = await ready(h);
    const reply = await applyWith(h, run.runToken);
    expect(reply.status).toBe(200);
    expect(await json(reply)).toEqual({ code: c, status: 'pending', xStatus: 'verified', address: ADDRESS.toLowerCase(), xHandle: 'runner' });
    expect((await applyWith(h, run.runToken)).status).toBe(409);
    expect((await json<{ code: string }>(await h.call('POST', '/v1/application/code', { runToken: run.runToken }))).code).toBe(c);
    const lookup = await json<{ status: string; xStatus: string }>(await h.call('GET', `/v1/application?code=${c}`));
    expect(lookup).toMatchObject({ status: 'pending', xStatus: 'verified' });

    h.clock.now += 61000;
    const second = await ready(h);
    const sameAddress = await applyWith(h, second.run.runToken, { xHandle: 'other', postUrl: 'https://x.com/other/status/99' });
    expect((await json<{ error: { code: string } }>(sameAddress)).error.code).toBe('duplicate_address');
    const sameX = await applyWith(h, second.run.runToken, { address: '0x' + '1'.repeat(40), postUrl: 'https://x.com/runner/status/98' });
    expect((await json<{ error: { code: string } }>(sameX)).error.code).toBe('duplicate_x');
    const status = await json<{ applications: number; approved: number; applicationsOpen: boolean }>(await h.call('GET', '/v1/whitelist/status'));
    expect(status).toMatchObject({ applications: 1, approved: 0, applicationsOpen: true });
  });

  it.each([
    ['a bad address', { address: '0x1234' }, 400, 'address'],
    ['a wrong checksum', { address: '0x52908400098527886E0F7030069857D2E4169Ee7' }, 400, 'address'],
    ['the zero address', { address: '0x' + '0'.repeat(40) }, 400, 'address'],
    ['a bad handle', { xHandle: 'no spaces!' }, 400, 'x_handle'],
    ['a non-X link', { postUrl: 'https://evil.example/Runner/status/1' }, 400, 'post_url'],
    ['a post by another account in the link', { postUrl: 'https://x.com/someone/status/1' }, 400, 'post_url'],
  ])('rejects %s', async (_name, patch, status, code) => {
    const h = harness(open);
    const { run } = await ready(h);
    const reply = await applyWith(h, run.runToken, patch);
    expect(reply.status).toBe(status);
    expect((await json<{ error: { code: string } }>(reply)).error.code).toBe(code);
    expect(h.x.calls).toBe(0);
  });

  it('rejects posts that X shows with another author, without the code, or not at all', async () => {
    const h = harness(open);
    const { run } = await ready(h);
    h.x.author = 'impostor';
    expect((await json<{ error: { code: string } }>(await applyWith(h, run.runToken))).error.code).toBe('x_author');
    h.x.author = 'Runner'; h.x.text = 'no code here';
    expect((await json<{ error: { code: string } }>(await applyWith(h, run.runToken))).error.code).toBe('x_code');
    h.x.mode = 404;
    expect((await json<{ error: { code: string } }>(await applyWith(h, run.runToken))).error.code).toBe('x_missing');
  });

  it.each([[429], ['down']] as const)('accepts and flags the application when X oEmbed is unavailable (%s)', async mode => {
    const h = harness(open);
    const { run } = await ready(h);
    h.x.mode = mode;
    const reply = await applyWith(h, run.runToken);
    expect(reply.status).toBe(200);
    expect((await json<{ xStatus: string }>(reply)).xStatus).toBe('unchecked');
  });

  it('requires a valid Turnstile challenge', async () => {
    const h = harness(open);
    const { run } = await ready(h);
    h.siteverify.success = false;
    expect((await applyWith(h, run.runToken)).status).toBe(403);
  });

  it('review panel: list with signals, chain check, X recheck, approve and export', async () => {
    const h = harness({ ...open, ALCHEMY_KEY: 'test-key' });
    const { run } = await ready(h);
    h.x.mode = 'down';
    expect((await applyWith(h, run.runToken)).status).toBe(200);
    expect((await h.call('GET', '/v1/admin/applications')).status).toBe(401);
    expect((await h.call('GET', '/v1/admin/applications', undefined, { Authorization: 'Bearer wrong' })).status).toBe(401);
    const list = await json<{ applications: Record<string, any>[]; counts: Record<string, number> }>(await h.call('GET', '/v1/admin/applications', undefined, ADMIN));
    expect(list.counts).toEqual({ pending: 1 });
    const app = list.applications[0];
    expect(app).toMatchObject({ address: ADDRESS.toLowerCase(), xHandle: 'runner', xStatus: 'unchecked', status: 'pending', coins: 0, runIpRuns: 1, runIpApplications: 1, applyIpApplications: 1 });
    expect(app.signals).toMatchObject({ jumps: 0, airJumps: 0 });
    expect(app.chain).toBeNull();

    const chain = await json<Record<string, any>>(await h.call('POST', `/v1/admin/applications/${app.id}/chain`, {}, ADMIN));
    expect(chain.chain.mainnet).toMatchObject({ txCount: 42, balanceWei: '1000000000000000000', isContract: false, delegated: true, firstSeen: '2021-05-01T00:00:00.000Z' });
    expect(chain.chain.sepolia).toMatchObject({ txCount: 42, sqkBalance: '5000000000000000000' });
    expect(chain.chain.squeekchain).toMatchObject({ squeeks: 2, staked: 1, activity: 12, rewardsClaimable: '7' });
    expect(h.outbound.some(u => u.includes('eth-mainnet')) && h.outbound.some(u => u.includes('eth-sepolia'))).toBe(true);

    h.x.mode = 'ok';
    expect((await json<{ xStatus: string }>(await h.call('POST', `/v1/admin/applications/${app.id}/xcheck`, {}, ADMIN))).xStatus).toBe('verified');

    expect((await h.call('POST', `/v1/admin/applications/${app.id}/review`, { status: 'maybe', note: null }, ADMIN)).status).toBe(400);
    const approved = await json<{ status: string; reviewNote: string }>(await h.call('POST', `/v1/admin/applications/${app.id}/review`, { status: 'approved', note: 'real player' }, ADMIN));
    expect(approved).toMatchObject({ status: 'approved', reviewNote: 'real player' });
    const csv = await (await h.call('GET', '/v1/admin/export?format=csv', undefined, ADMIN)).text();
    expect(csv).toBe(`address,allowance\n${ADDRESS.toLowerCase()},1\n`);
    // Same header and column order as contracts/examples/allowlist.csv, which build-merkle accepts.
    expect(readFileSync(fileURLToPath(new URL('../../contracts/examples/allowlist.csv', import.meta.url).href), 'utf8').startsWith('address,allowance')).toBe(true);
    expect((await json<{ approved: number }>(await h.call('GET', '/v1/whitelist/status'))).approved).toBe(1);
    const rejected = await json<{ status: string }>(await h.call('POST', `/v1/admin/applications/${app.id}/review`, { status: 'rejected', note: null }, ADMIN));
    expect(rejected.status).toBe('rejected');
    expect(await (await h.call('GET', '/v1/admin/export?format=csv', undefined, ADMIN)).text()).toBe('address,allowance\n');
  });

  it('chain signals degrade gracefully without an Alchemy key', async () => {
    const h = harness(open);
    const { run } = await ready(h);
    expect((await applyWith(h, run.runToken)).status).toBe(200);
    const [app] = (await json<{ applications: { id: string }[] }>(await h.call('GET', '/v1/admin/applications', undefined, ADMIN))).applications;
    const chain = await json<Record<string, any>>(await h.call('POST', `/v1/admin/applications/${app.id}/chain`, {}, ADMIN));
    expect(chain.chain.mainnet.error).toBe('ALCHEMY_KEY not configured');
    expect(chain.chain.squeekchain.squeeks).toBe(2);
    expect(h.outbound.some(u => u.includes('alchemy'))).toBe(false);
  });
});
describe('stats, export and transport rules', () => {
  it('publishes score percentiles and a histogram', async () => {
    const h = harness();
    seedTelemetry(h);
    for (let i = 0; i < 3; i++) { const s = await session(h); expect((await submit(h, s, await play(h, s))).status).toBe(200); h.clock.now += 61000; }
    const stats = await json<{ verifiedRuns: number; percentiles: Record<string, number | null>; histogram: { count: number }[] }>(await h.call('GET', '/v1/stats'));
    expect(stats.verifiedRuns).toBe(3);
    expect(stats.percentiles.p50).not.toBeNull();
    expect(stats.histogram.reduce((a, b) => a + b.count, 0)).toBe(3);
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
