import { LiveSource } from '../chain/live';
import type { ChainSnapshot, TelemetrySource, TelemetryView } from '../chain/types';
import { TimelineCursor, type SessionReply, type TimelinePage, type TimelinePoint } from './timeline';
import { ApiClient } from './api';

export class ServerSource implements TelemetrySource {
  readonly kind = 'live' as const;
  readonly points: TimelinePoint[] = [];
  completeThrough = 0;
  private offset = 0;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;
  private listeners = new Set<(snapshot: ChainSnapshot) => void>();
  private lastAt = 0;
  private failed = true;
  private unsubscribe: (() => void) | undefined;
  constructor(readonly api: ApiClient, private readonly fallback: TelemetrySource = new LiveSource()) {}
  merge(page: TimelinePage): void {
    for (const point of page.points) if (point.at > (this.points[this.points.length - 1]?.at ?? -1)) this.points.push(point);
    this.completeThrough = Math.max(this.completeThrough, page.completeThrough);
    this.offset = page.serverNow - Date.now();
    this.failed = false; this.fallback.stop();
  }
  start(): void {
    if (this.running) return;
    this.running = true;
    this.unsubscribe = this.fallback.subscribe(s => { if (this.failed) for (const fn of this.listeners) fn(s); });
    void this.poll();
  }
  stop(): void {
    this.running = false; clearTimeout(this.timer); this.controller?.abort();
    this.fallback.stop(); this.unsubscribe?.(); this.unsubscribe = undefined;
  }
  private async poll(): Promise<void> {
    const controller = new AbortController(); this.controller = controller;
    try {
      const page = await this.api.telemetry(this.points[this.points.length - 1]?.at, controller.signal);
      if (this.running && !controller.signal.aborted) this.merge(page);
    } catch {
      if (this.running && !controller.signal.aborted) { this.failed = true; this.fallback.start(); }
    } finally {
      if (this.running && !controller.signal.aborted) this.timer = setTimeout(() => void this.poll(), 1500);
    }
  }
  read(): TelemetryView {
    if (this.failed) return this.fallback.read();
    const now = Date.now() + this.offset;
    let point: TimelinePoint | undefined;
    for (let i = this.points.length - 1; i >= 0; i--) if (this.points[i].at <= now) { point = this.points[i]; break; }
    if (!point) return { mode: 'NO DATA', rpm: 0, reason: 'Server telemetry warming up', snapshot: null };
    const snapshot: ChainSnapshot = { installationId: point.installationId ?? 'unavailable', fetchedAt: now, measurement: null,
      builderAvailable: point.height !== null, confirmedHeight: point.height === null ? null : BigInt(point.height), projectedHeight: null };
    if (point.at !== this.lastAt) { this.lastAt = point.at; for (const fn of this.listeners) fn(snapshot); }
    const rpm = now >= point.validUntil || now > this.completeThrough ? null : point.rpmMilli;
    return { mode: rpm === null ? 'NO DATA' : rpm === 0 ? 'WHEEL IDLE' : 'LIVE', rpm: (rpm ?? 0) / 1000,
      reason: 'Server wheel timeline · 5s broadcast delay', snapshot };
  }
  subscribe(fn: (snapshot: ChainSnapshot) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

export class RankedTimeline {
  private readonly points: TimelinePoint[];
  private readonly cursor: TimelineCursor;
  constructor(readonly session: SessionReply, private readonly source: ServerSource) {
    source.merge(session.timeline);
    this.points = [...session.timeline.points];
    this.cursor = new TimelineCursor(this.points, session.startedAt);
  }
  ready(tick: number): boolean { return this.session.startedAt + tick * 1000 / 60 <= this.source.completeThrough; }
  input(tick: number) {
    const last = this.points[this.points.length - 1]?.at ?? -1;
    for (const point of this.source.points) if (point.at > last) this.points.push(point);
    return this.cursor.input(tick);
  }
}
