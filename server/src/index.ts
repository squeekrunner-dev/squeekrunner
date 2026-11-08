import { SIM_VERSION } from '../../src/sim/core';
import { MAX_REPLAY_BYTES } from '../../src/sim/replay';
import { TelemetryCollector, timeline } from './telemetry';
import { authoritativeRun, checkRun, type SessionRow } from './verification';
import { enter, SIWE_STATEMENT } from './entry';
import { ApiError, digest, entriesOpen, fail, fields, ipHash, randomToken, rateLimit, readJSON, runtime,
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
  return { verifiedRuns: count, percentiles, histogram: edges.map((from, i) => ({ from, to: edges[i + 1] ?? null, count: (histogram[i].results[0] as { count: number }).count })) };
}

async function route(request: Request, env: Env, rt: Runtime): Promise<Response> {
  const url = new URL(request.url), path = url.pathname, now = rt.now();
  if (path === '/v1/admin/export' && request.method === 'GET') {
    if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) fail(503, 'configuration', 'Service unavailable');
    const auth = request.headers.get('Authorization') ?? '';
    const a = await digest(auth), b = await digest(`Bearer ${env.ADMIN_TOKEN}`);
    let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
    if (difference) fail(401, 'unauthorized', 'Authentication required');
    const rows = await env.DB.prepare('SELECT address,1 AS allowance FROM entries ORDER BY address LIMIT 100001').all<{ address: string; allowance: number }>();
    if (rows.results.length > 100000) fail(413, 'export_limit', 'Use a database export for this snapshot');
    if (url.searchParams.get('format') === 'csv') return new Response('address,allowance\n' + rows.results.map(r => `${r.address},1`).join('\n') + '\n', { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="raffle-participants.csv"' } });
    return Response.json(rows.results);
  }
  const hash = await ipHash(request, env);
  await rateLimit(env, hash, 'api', 120, now);
  if (request.method === 'GET' && path === '/v1/telemetry') {
    const since = Number(url.searchParams.get('since') ?? now - 60000);
    if (!Number.isSafeInteger(since) || since < 0 || since > now + 5000) fail(400, 'since', 'Invalid telemetry cursor');
    return Response.json(await timeline(env, since));
  }
  if (request.method === 'GET' && path === '/v1/stats') return Response.json(await stats(env));
  if (request.method === 'GET' && path === '/v1/raffle/status') {
    const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM entries').first<{ count: number }>();
    return Response.json({ threshold: threshold(env), entriesOpen: entriesOpen(env, now), entriesCount: row?.count ?? 0, snapshotAt: env.SNAPSHOT_AT || null, deadline: env.ENTRY_DEADLINE || null });
  }
  if (request.method === 'GET' && path === '/v1/nonce') {
    await rateLimit(env, hash, 'nonce', 10, now);
    const nonce = randomToken(), expiresAt = now + 5 * 60000;
    await env.DB.prepare('INSERT INTO nonces(nonce,created_at,expires_at,ip_hash) VALUES(?,?,?,?)').bind(nonce, now, expiresAt, hash).run();
    return Response.json({ nonce, issuedAt: new Date(now).toISOString(), expirationTime: new Date(expiresAt).toISOString(), domain: env.SIWE_DOMAIN, uri: env.SIWE_URI, chainId: 11155111, statement: SIWE_STATEMENT });
  }
  if (request.method === 'POST' && path === '/v1/session') {
    await rateLimit(env, hash, 'session', 3, now);
    const body = await readJSON(request, 4096); fields(body, ['turnstileToken']);
    await turnstile(body.turnstileToken, 'session', env, rt);
    const startedAt = rt.now();
    const page = await timeline(env, startedAt);
    if (!page.points.some(p => p.at <= startedAt)) fail(503, 'warming_up', 'Telemetry is warming up. Try again shortly.');
    const sessionId = randomToken(), seed = crypto.getRandomValues(new Uint32Array(1))[0], expiresAt = startedAt + 30 * 60000 + 15000;
    await env.DB.prepare('INSERT INTO sessions(id,seed,sim_version,started_at,expires_at,ip_hash) VALUES(?,?,?,?,?,?)')
      .bind(sessionId, seed, SIM_VERSION, startedAt, expiresAt, hash).run();
    return Response.json({ sessionId, seed, startedAt, expiresAt, simVersion: SIM_VERSION, timeline: page });
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
    const result = authoritativeRun(replay, session, page.points);
    const minimum = threshold(env), eligible = minimum !== null && result.score >= minimum;
    const runToken = randomToken(), runId = randomToken();
    await env.DB.prepare(`INSERT INTO runs(id,session_id,score,distance,end_tick,created_at,ip_hash,eligible,token_hash,token_expires)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(runId, id, result.score, result.distance, result.endTick, now, hash, eligible ? 1 : 0, await digest(runToken), now + 24 * 3600000).run();
    return Response.json({ ...result, eligible, runToken, runId });
  }
  if (request.method === 'POST' && path === '/v1/entry') {
    await rateLimit(env, hash, 'entry', 5, now);
    return Response.json(await enter(await readJSON(request, 8192), env, hash, rt));
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
    // Cron is a watchdog only; the singleton alarm collects every ~10 seconds.
    await env.COLLECTOR.get(env.COLLECTOR.idFromName('wheel')).fetch('https://collector/wake');
  },
};
