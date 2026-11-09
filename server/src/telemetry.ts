import { CONFIG } from '../../src/config';
import { parseStatus, telemetryView } from '../../src/chain/parse';
import type { ProjectedPoint } from '../../src/chain/pending';
import { TELEMETRY_LEAD_MS, type TimelinePage, type TimelinePoint } from '../../src/net/timeline';
import { MAX_RPM_MILLI } from '../../src/sim/replay';
import { type Env, type Runtime, runtime } from './security';

const RETENTION = 48 * 60 * 60 * 1000;
const PROJECTION_HOUR = 60 * 60 * 1000;
const projectionKey = (at: number): string => `projected:${Math.floor(at / PROJECTION_HOUR).toString().padStart(12, '0')}`;
type Projections = Record<string, string | null>;
const SELECT = 'SELECT at, valid_until AS validUntil, rpm_milli AS rpmMilli, installation_id AS installationId, height FROM telemetry';
export async function history(db: D1Database, since: number, until: number): Promise<TimelinePoint[]> {
  const baseline = await db.prepare(`${SELECT} WHERE at <= ? ORDER BY at DESC LIMIT 1`).bind(since).first<TimelinePoint>();
  const later = await db.prepare(`${SELECT} WHERE at > ? AND at <= ? ORDER BY at LIMIT 18000`).bind(since, until).all<TimelinePoint>();
  return [...(baseline ? [baseline] : []), ...later.results];
}
/** Last live (non-zero) RPM reading, used to bridge a brief 0 between live readings. */
export interface LiveRpm { at: number; rpmMilli: number }

export async function collect(env: Env, rt: Runtime, lastLive: LiveRpm | null = null):
  Promise<{ at: number; projected: string | null; live: LiveRpm | null }> {
  let snapshot = null;
  try {
    const reply = await rt.fetcher(CONFIG.telemetry.url, { signal: AbortSignal.timeout(4000) });
    if (reply.ok) snapshot = parseStatus(await reply.json(), rt.now());
  } catch { /* Failure is an explicit NO DATA point, never stale RPM. */ }
  const now = rt.now(), at = now + TELEMETRY_LEAD_MS;
  const view = telemetryView(snapshot, now);
  const m = snapshot?.measurement;
  const remaining = m ? Math.max(0, Math.min(CONFIG.telemetry.maxReadAgeMs, m.receivedAt + m.staleAfterMs - now, m.observedAt + m.staleAfterMs - now)) : 0;
  const raw = view.mode === 'NO DATA' ? null : Math.min(MAX_RPM_MILLI, Math.round(view.rpm * 1000));
  // Squeekchain occasionally reports a single 0 in the middle of a run; hold the last live RPM briefly so
  // the world does not lurch. A real stop is published once zeros last longer than zeroHoldMs.
  const held = raw === 0 && lastLive && lastLive.rpmMilli > 0 && now - lastLive.at <= CONFIG.telemetry.zeroHoldMs;
  const rpmMilli = held ? lastLive!.rpmMilli : raw;
  await env.DB.prepare('INSERT OR IGNORE INTO telemetry(at,valid_until,rpm_milli,installation_id,height) VALUES(?,?,?,?,?)')
    .bind(at, at + remaining, rpmMilli,
      snapshot?.installationId ?? null, snapshot?.confirmedHeight?.toString() ?? null).run();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM telemetry WHERE at < ?').bind(now - RETENTION),
    env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now - 60000),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ? AND id NOT IN (SELECT session_id FROM runs)').bind(now - RETENTION),
  ]);
  return { at, projected: snapshot?.projectedHeight?.toString() ?? null,
    live: raw !== null && raw > 0 ? { at: now, rpmMilli: raw } : held ? lastLive : null };
}

/** A single publisher. Serialize collection and reads so no late write can cross a returned watermark. */
export class TelemetryCollector {
  constructor(private readonly state: DurableObjectState, private readonly env: Env, private readonly rt: Runtime = runtime) {}
  async fetch(request: Request): Promise<Response> {
    return this.state.blockConcurrencyWhile(async () => {
      if (!(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(this.rt.now() + 1);
      const url = new URL(request.url);
      if (url.pathname === '/wake') return new Response('ok');
      const now = this.rt.now();
      const since = Math.max(now - RETENTION, Number(url.searchParams.get('since') ?? now - 60000));
      const until = Math.min(now + TELEMETRY_LEAD_MS, Number(url.searchParams.get('until') ?? now + TELEMETRY_LEAD_MS));
      if (!Number.isFinite(since) || !Number.isFinite(until)) return new Response('Invalid time', { status: 400 });
      const points = await history(this.env.DB, since, until);
      // Display-only sidecar in DO storage: no D1 schema change, no change to verifier history().
      const keys = [...new Set(points.map(point => projectionKey(point.at)))];
      const buckets = new Map(await Promise.all(keys.map(async key =>
        [key, await this.state.storage.get<Projections>(key)] as const)));
      const displayPoints: (TimelinePoint & ProjectedPoint)[] = points.map(point => ({
        ...point, projected: buckets.get(projectionKey(point.at))?.[point.at] ?? null,
      }));
      return Response.json({ points: displayPoints, serverNow: now, completeThrough: now + TELEMETRY_LEAD_MS } satisfies TimelinePage);
    });
  }
  async alarm(): Promise<void> {
    await this.state.blockConcurrencyWhile(async () => {
      const now = this.rt.now();
      const last = await this.state.storage.get<number>('lastCollection');
      // At-least-once delivery and retry after restart must not manufacture a burst of points.
      const every = CONFIG.telemetry.collectMs;
      if (last && now - last < every - 1000) { await this.state.storage.setAlarm(last + every); return; }
      await this.state.storage.setAlarm(now + every);
      const projection = await collect(this.env, this.rt, await this.state.storage.get<LiveRpm>('lastLive') ?? null);
      if (projection.live) await this.state.storage.put('lastLive', projection.live);
      else await this.state.storage.delete('lastLive');
      // Hour buckets stay small (~1440 entries at 2.5 s) and survive DO eviction/restart.
      const key = projectionKey(projection.at);
      const bucket = await this.state.storage.get<Projections>(key) ?? {};
      if (!(projection.at in bucket)) {
        bucket[projection.at] = projection.projected;
        await this.state.storage.put(key, bucket);
      }
      const expired = await this.state.storage.list({ prefix: 'projected:', end: projectionKey(now - RETENTION) });
      if (expired.size) await this.state.storage.delete([...expired.keys()]);
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
