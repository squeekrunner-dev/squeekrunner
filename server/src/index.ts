import { CHUNK_TICKS, SIM_VERSION } from '../../src/sim/core';
import { CONFIG } from '../../src/config';
import { MAX_REPLAY_BYTES } from '../../src/sim/replay';
import { TelemetryCollector, timeline } from './telemetry';
import { authoritativeRun, checkRun, type SessionRow } from './verification';
import { chunkSeeds, MAX_CHUNKS, mapPage } from './map';
import { apply, codeFor, statusOf } from './application';
import { admin } from './admin';
import { ApiError, applicationsOpen, digest, requiredCoins, fail, fields, ipHash, randomToken, rateLimit, readJSON, runtime,
  textField, threshold, turnstile, type Env, type Runtime } from './security';
export { TelemetryCollector };

async function stats(env: Env) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM runs').first<{ count: number }>();
  const count = row?.count ?? 0;
  const percentiles: Record<string, number | null> = {};
  for (const p of [50, 75, 90, 95, 99]) {
    const sample = count ? await env.DB.prepare('SELECT score FROM runs ORDER BY score LIMIT 1 OFFSET ?').bind(Math.max(0, Math.ceil(count * p / 100) - 1)).first<{ score: number }>() : null;
    percentiles[`p${p}`] = sample?.score ?? null;
  }
  const edges = [0, 500, 1000, 2000, 5000, 10000, 25000, 100000];
  const histogram = await env.DB.batch(edges.map((lower, i) => env.DB.prepare('SELECT COUNT(*) AS count FROM runs WHERE score>=? AND score<?').bind(lower, edges[i + 1] ?? Number.MAX_SAFE_INTEGER)));
  const coins = await env.DB.prepare('SELECT coins, COUNT(*) AS count FROM runs GROUP BY coins ORDER BY coins').all<{ coins: number; count: number }>();
  return { verifiedRuns: count, coinsCollected: coins.results, percentiles, histogram: edges.map((from, i) => ({ from, to: edges[i + 1] ?? null, count: (histogram[i].results[0] as { count: number }).count })) };
}

async function route(request: Request, env: Env, rt: Runtime): Promise<Response> {
  const url = new URL(request.url), path = url.pathname, now = rt.now();
  if (path.startsWith('/v1/admin/')) return admin(request, env, rt, path, url);
  const hash = await ipHash(request, env);
  await rateLimit(env, hash, 'api', 120, now);
  if (request.method === 'GET' && path === '/v1/telemetry') {
    const since = Number(url.searchParams.get('since') ?? now - 60000);
    if (!Number.isSafeInteger(since) || since < 0 || since > now + 5000) fail(400, 'since', 'Invalid telemetry cursor');
    return Response.json(await timeline(env, since));
  }
  if (request.method === 'GET' && path === '/v1/stats') return Response.json(await stats(env));
  if (request.method === 'GET' && path === '/v1/whitelist/status') {
    const rows = await env.DB.prepare('SELECT status, COUNT(*) AS count FROM applications GROUP BY status').all<{ status: string; count: number }>();
    return Response.json({ threshold: threshold(env), requiredCoins: requiredCoins(env, CONFIG.coins.count), applicationsOpen: applicationsOpen(env, now),
      applications: rows.results.reduce((sum, r) => sum + r.count, 0), approved: rows.results.find(r => r.status === 'approved')?.count ?? 0,
      deadline: env.APPLICATION_DEADLINE || null });
  }
  if (request.method === 'POST' && path === '/v1/session') {
    await rateLimit(env, hash, 'session', 3, now);
    const body = await readJSON(request, 4096); fields(body, ['turnstileToken']);
    await turnstile(body.turnstileToken, 'session', env, rt);
    const startedAt = rt.now();
    const page = await timeline(env, startedAt);
    if (!page.points.some(p => p.at <= startedAt)) fail(503, 'warming_up', 'Telemetry is warming up. Try again shortly.');
    const sessionId = randomToken(), mapSecret = randomToken(), seed = crypto.getRandomValues(new Uint32Array(1))[0], expiresAt = startedAt + 30 * 60000 + 15000;
    await env.DB.prepare('INSERT INTO sessions(id,seed,sim_version,started_at,expires_at,ip_hash,map_secret) VALUES(?,?,?,?,?,?,?)')
      .bind(sessionId, seed, SIM_VERSION, startedAt, expiresAt, hash, mapSecret).run();
    return Response.json({ sessionId, seed, startedAt, expiresAt, simVersion: SIM_VERSION, timeline: page, map: await mapPage(mapSecret, startedAt, 0, startedAt) });
  }
  if (request.method === 'POST' && path === '/v1/map') {
    await rateLimit(env, hash, 'map', 40, now);
    const body = await readJSON(request, 1024); fields(body, ['sessionId', 'from']);
    const id = textField(body.sessionId, 64), from = body.from;
    if (!Number.isSafeInteger(from) || (from as number) < 0 || (from as number) >= MAX_CHUNKS) fail(400, 'from', 'Invalid chunk index');
    const session = await env.DB.prepare('SELECT * FROM sessions WHERE id=?').bind(id).first<SessionRow>();
    if (!session || session.used || session.ip_hash !== hash || now > session.expires_at || !session.map_secret) fail(409, 'session', 'Session not found or already used');
    return Response.json(await mapPage(session.map_secret, session.started_at, from as number, now));
  }
  if (request.method === 'POST' && path === '/v1/run') {
    await rateLimit(env, hash, 'run', 6, now);
    const body = await readJSON(request, MAX_REPLAY_BYTES + 1024); fields(body, ['sessionId', 'replay']);
    const id = textField(body.sessionId, 64);
    const session = await env.DB.prepare('SELECT * FROM sessions WHERE id=?').bind(id).first<SessionRow>();
    if (!session || session.used || session.ip_hash !== hash) fail(409, 'session', 'Session not found or already used');
    const replay = checkRun(body.replay, session, now);
    const claimed = await env.DB.prepare('UPDATE sessions SET used=1 WHERE id=? AND used=0 RETURNING id').bind(id).first();
    if (!claimed) fail(409, 'session', 'Session already used');
    // Claim before expensive verification: a bad final score consumes the session too.
    const page = await timeline(env, session.started_at, session.started_at + replay.endTick * 1000 / 60);
    const result = authoritativeRun(replay, session, page.points, await chunkSeeds(session.map_secret, Math.ceil(replay.endTick / CHUNK_TICKS)));
    // Qualifying rule: reach the threshold AND collect every coin.
    const minimum = threshold(env), eligible = minimum !== null && result.score >= minimum && result.coins >= requiredCoins(env, CONFIG.coins.count);
    const runToken = randomToken(), runId = randomToken();
    await env.DB.prepare(`INSERT INTO runs(id,session_id,score,distance,end_tick,coins,created_at,ip_hash,eligible,token_hash,token_expires,signals)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(runId, id, result.score, result.distance, result.endTick, result.coins, now, hash, eligible ? 1 : 0,
      await digest(runToken), now + 24 * 3600000, JSON.stringify(result.signals)).run();
    const { signals: _signals, ...reply } = result;
    return Response.json({ ...reply, eligible, runToken, runId });
  }
  if (request.method === 'GET' && path === '/v1/application') {
    await rateLimit(env, hash, 'lookup', 20, now);
    return Response.json(await statusOf(url.searchParams.get('code'), env));
  }
  if (request.method === 'POST' && path === '/v1/application/code') {
    await rateLimit(env, hash, 'code', 20, now);
    return Response.json(await codeFor(await readJSON(request, 1024), env, rt));
  }
  if (request.method === 'POST' && path === '/v1/application') {
    await rateLimit(env, hash, 'apply', 5, now);
    return Response.json(await apply(await readJSON(request, 4096), env, hash, rt));
  }
  fail(404, 'not_found', 'Endpoint not found');
}

export async function handle(request: Request, env: Env, rt: Runtime = runtime): Promise<Response> {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).includes(origin ?? '') && !!origin;
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' });
  if (allowed) { headers.set('Access-Control-Allow-Origin', origin!); headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); }
  let response: Response;
  try {
    if (origin && !allowed) fail(403, 'origin', 'Origin not allowed');
    if (request.method === 'POST' && !allowed) fail(403, 'origin', 'An allowed origin is required');
    if (request.method === 'OPTIONS') {
      if (!allowed) fail(403, 'origin', 'Origin not allowed');
      response = new Response(null, { status: 204 });
    } else response = await route(request, env, rt);
  } catch (error) {
    const known = error instanceof ApiError;
    response = Response.json({ error: { code: known ? error.code : 'unavailable', message: known ? error.message : 'Service temporarily unavailable' }, ...(known ? error.extra : {}) }, { status: known ? error.status : 503 });
  }
  for (const [key, value] of headers) response.headers.set(key, value);
  return response;
}

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    // Cron is a watchdog only; the singleton alarm collects every ~2.5 seconds.
    await env.COLLECTOR.get(env.COLLECTOR.idFromName('wheel')).fetch('https://collector/wake');
  },
};
