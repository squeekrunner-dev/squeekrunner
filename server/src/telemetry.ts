import { CONFIG } from '../../src/config';
import { parseStatus, telemetryView } from '../../src/chain/parse';
import { TELEMETRY_LEAD_MS, type TimelinePage, type TimelinePoint } from '../../src/net/timeline';
import { MAX_RPM_MILLI } from '../../src/sim/replay';
import { type Env, type Runtime, runtime } from './security';

const RETENTION = 48 * 60 * 60 * 1000;
const SELECT = 'SELECT at, valid_until AS validUntil, rpm_milli AS rpmMilli, installation_id AS installationId, height FROM telemetry';
export async function history(db: D1Database, since: number, until: number): Promise<TimelinePoint[]> {
  const baseline = await db.prepare(`${SELECT} WHERE at <= ? ORDER BY at DESC LIMIT 1`).bind(since).first<TimelinePoint>();
  const later = await db.prepare(`${SELECT} WHERE at > ? AND at <= ? ORDER BY at LIMIT 18000`).bind(since, until).all<TimelinePoint>();
  return [...(baseline ? [baseline] : []), ...later.results];
}
export async function collect(env: Env, rt: Runtime): Promise<void> {
  let snapshot = null;
  try {
    const reply = await rt.fetcher(CONFIG.telemetry.url, { credentials: 'omit', signal: AbortSignal.timeout(4000) });
    if (reply.ok) snapshot = parseStatus(await reply.json(), rt.now());
  } catch { /* Failure is an explicit NO DATA point, never stale RPM. */ }
  const now = rt.now(), at = now + TELEMETRY_LEAD_MS;
  const view = telemetryView(snapshot, now);
  const m = snapshot?.measurement;
  const remaining = m ? Math.max(0, Math.min(CONFIG.telemetry.maxReadAgeMs, m.receivedAt + m.staleAfterMs - now, m.observedAt + m.staleAfterMs - now)) : 0;
  await env.DB.prepare('INSERT OR IGNORE INTO telemetry(at,valid_until,rpm_milli,installation_id,height) VALUES(?,?,?,?,?)')
    .bind(at, at + remaining, view.mode === 'NO DATA' ? null : Math.min(MAX_RPM_MILLI, Math.round(view.rpm * 1000)),
      snapshot?.installationId ?? null, snapshot?.confirmedHeight?.toString() ?? null).run();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM telemetry WHERE at < ?').bind(now - RETENTION),
    env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now - 60000),
    env.DB.prepare('DELETE FROM nonces WHERE expires_at < ? AND nonce NOT IN (SELECT nonce FROM entries)').bind(now),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ? AND id NOT IN (SELECT session_id FROM runs)').bind(now - RETENTION),
  ]);
}

/** A single publisher. Serialize collection and reads so no late write can cross a returned watermark. */
export class TelemetryCollector {
  constructor(private readonly state: DurableObjectState, private readonly env: Env) {}
  async fetch(request: Request): Promise<Response> {
    return this.state.blockConcurrencyWhile(async () => {
      if (!(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(Date.now() + 1);
      const url = new URL(request.url);
      if (url.pathname === '/wake') return new Response('ok');
      const now = Date.now();
      const since = Math.max(now - RETENTION, Number(url.searchParams.get('since') ?? now - 60000));
      const until = Math.min(now + TELEMETRY_LEAD_MS, Number(url.searchParams.get('until') ?? now + TELEMETRY_LEAD_MS));
      if (!Number.isFinite(since) || !Number.isFinite(until)) return new Response('Invalid time', { status: 400 });
      const points = await history(this.env.DB, since, until);
      return Response.json({ points, serverNow: now, completeThrough: now + TELEMETRY_LEAD_MS } satisfies TimelinePage);
    });
  }
  async alarm(): Promise<void> {
    await this.state.blockConcurrencyWhile(async () => {
      const now = Date.now();
      const last = await this.state.storage.get<number>('lastCollection');
      // At-least-once delivery and retry after restart must not manufacture a burst of points.
      if (last && now - last < 9000) { await this.state.storage.setAlarm(last + 10000); return; }
      await this.state.storage.setAlarm(now + 10000);
      await collect(this.env, runtime);
      await this.state.storage.put('lastCollection', now);
    });
  }
}
export async function timeline(env: Env, since: number, until?: number): Promise<TimelinePage> {
  const stub = env.COLLECTOR.get(env.COLLECTOR.idFromName('wheel'));
  const reply = await stub.fetch(`https://collector/history?since=${since}${until === undefined ? '' : `&until=${until}`}`);
  if (!reply.ok) throw new Error('Collector unavailable');
  return reply.json<TimelinePage>();
}
