import { checkPost } from './application';
import { chainSignals } from './signals';
import { fail, fields, readJSON, sameSecret, type Env, type Runtime } from './security';

/** Review panel API. Every route requires `Authorization: Bearer <ADMIN_TOKEN>`. */
async function authorize(request: Request, env: Env): Promise<void> {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) fail(503, 'configuration', 'Service unavailable');
  if (!(await sameSecret(request.headers.get('Authorization') ?? '', `Bearer ${env.ADMIN_TOKEN}`))) fail(401, 'unauthorized', 'Authentication required');
}

const STATUSES = ['pending', 'approved', 'rejected'] as const;
type Status = typeof STATUSES[number];
interface ApplicationRow { id: string; code: string; address: string; x_handle: string; post_id: string; status: string }

const LIST = `SELECT a.id, a.code, a.address, a.x_handle AS xHandle, a.post_url AS postUrl, a.x_status AS xStatus, a.x_detail AS xDetail,
  a.created_at AS createdAt, a.status, a.review_note AS reviewNote, a.reviewed_at AS reviewedAt, a.chain, a.chain_checked_at AS chainCheckedAt,
  substr(a.ip_hash,1,8) AS applyIp, substr(r.ip_hash,1,8) AS runIp,
  r.score, r.coins, r.end_tick AS endTick, r.created_at AS runAt, r.signals,
  (SELECT COUNT(*) FROM applications b WHERE b.ip_hash=a.ip_hash) AS applyIpApplications,
  (SELECT COUNT(*) FROM applications b JOIN runs rb ON rb.id=b.run_id WHERE rb.ip_hash=r.ip_hash) AS runIpApplications,
  (SELECT COUNT(*) FROM runs x WHERE x.ip_hash=r.ip_hash) AS runIpRuns,
  (SELECT COUNT(*) FROM runs x WHERE x.ip_hash=r.ip_hash AND x.eligible=1) AS runIpQualified,
  (SELECT MAX(x.score) FROM runs x WHERE x.ip_hash=r.ip_hash) AS runIpBest
  FROM applications a JOIN runs r ON r.id=a.run_id`;

function parsed<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const key of ['chain', 'signals']) if (typeof out[key] === 'string') { try { out[key] = JSON.parse(out[key] as string); } catch { out[key] = null; } }
  return out as T;
}
async function one(env: Env, id: string): Promise<ApplicationRow> {
  if (!/^[0-9a-f]{32}$/.test(id)) fail(400, 'id', 'Invalid application id');
  const row = await env.DB.prepare('SELECT id,code,address,x_handle,post_id,status FROM applications WHERE id=?').bind(id).first<ApplicationRow>();
  if (!row) fail(404, 'not_found', 'Application not found');
  return row!;
}

export async function admin(request: Request, env: Env, rt: Runtime, path: string, url: URL): Promise<Response> {
  await authorize(request, env);
  const now = rt.now();
  if (request.method === 'GET' && path === '/v1/admin/applications') {
    const status = url.searchParams.get('status') ?? 'all';
    if (status !== 'all' && !STATUSES.includes(status as Status)) fail(400, 'status', 'Invalid status filter');
    const rows = await env.DB.prepare(`${LIST} WHERE (?='all' OR a.status=?) ORDER BY a.created_at LIMIT 5000`).bind(status, status).all<Record<string, unknown>>();
    const counts = await env.DB.prepare('SELECT status, COUNT(*) AS count FROM applications GROUP BY status').all<{ status: string; count: number }>();
    return Response.json({ applications: rows.results.map(parsed), counts: Object.fromEntries(counts.results.map(c => [c.status, c.count])), serverNow: now });
  }
  if (request.method === 'GET' && path === '/v1/admin/export') {
    const rows = await env.DB.prepare("SELECT address FROM applications WHERE status='approved' ORDER BY address LIMIT 100001").all<{ address: string }>();
    if (rows.results.length > 100000) fail(413, 'export_limit', 'Use a database export for this snapshot');
    if (url.searchParams.get('format') === 'csv') {
      return new Response('address,allowance\n' + rows.results.map(r => `${r.address},1`).join('\n') + (rows.results.length ? '\n' : ''), {
        headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="approved-allowlist.csv"' } });
    }
    return Response.json(rows.results.map(r => ({ address: r.address, allowance: 1 })));
  }
  const m = /^\/v1\/admin\/applications\/([^/]+)\/(review|chain|xcheck)$/.exec(path);
  if (request.method === 'POST' && m) {
    const application = await one(env, m[1]);
    if (m[2] === 'review') {
      const body = await readJSON(request, 2048); fields(body, ['status', 'note']);
      if (!STATUSES.includes(body.status as Status)) fail(400, 'status', 'Status must be pending, approved or rejected');
      if (body.note !== null && (typeof body.note !== 'string' || body.note.length > 500)) fail(400, 'note', 'Note must be text up to 500 characters');
      await env.DB.prepare('UPDATE applications SET status=?, review_note=?, reviewed_at=? WHERE id=?')
        .bind(body.status, body.note || null, body.status === 'pending' ? null : now, application.id).run();
    } else if (m[2] === 'chain') {
      const signals = await chainSignals(env, rt, application.address);
      await env.DB.prepare('UPDATE applications SET chain=?, chain_checked_at=? WHERE id=?').bind(JSON.stringify(signals), now, application.id).run();
    } else {
      const check = await checkPost(rt, application.x_handle, application.post_id, application.code);
      const status = check.result === 'ok' ? 'verified' : check.result === 'unavailable' ? 'unchecked' : 'failed';
      await env.DB.prepare('UPDATE applications SET x_status=?, x_detail=? WHERE id=?').bind(status, check.detail, application.id).run();
    }
    const row = await env.DB.prepare(`${LIST} WHERE a.id=?`).bind(application.id).first<Record<string, unknown>>();
    return Response.json(parsed(row!));
  }
  fail(404, 'not_found', 'Endpoint not found');
}
