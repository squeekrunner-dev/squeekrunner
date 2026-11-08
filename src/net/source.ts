import { LiveSource } from '../chain/live';
import type { ChainSnapshot, TelemetrySource, TelemetryView } from '../chain/types';
import { CHUNK_TICKS, MAX_TICKS, type TickInput } from '../sim/core';
import { TimelineCursor, type MapPage, type SessionReply, type TimelinePage, type TimelinePoint } from './timeline';
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
  /** Best estimate of the server clock from the latest timeline reply. */
  serverNow(): number { return Date.now() + this.offset; }
}

/** Fetches map chunk seeds as the server releases them (a few seconds before each chunk starts). */
export class MapFeed {
  readonly seeds: number[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  constructor(private readonly api: ApiClient, private readonly sessionId: string, first: MapPage,
    private readonly serverNow: () => number, private readonly signal?: AbortSignal) {
    this.merge(first);
    signal?.addEventListener('abort', () => this.stop(), { once: true });
  }
  merge(page: MapPage): number {
    for (const chunk of page.chunks) {
      if (chunk.index === this.seeds.length && Number.isInteger(chunk.seed) && chunk.seed >= 0 && chunk.seed <= 0xffffffff) this.seeds.push(chunk.seed);
    }
    return page.nextAt;
  }
  start(): void { if (!this.stopped) this.schedule(0); }
  stop(): void { this.stopped = true; clearTimeout(this.timer); }
  private schedule(ms: number): void {
    if (this.stopped || this.seeds.length * CHUNK_TICKS >= MAX_TICKS) return;
    this.timer = setTimeout(() => void this.poll(), Math.max(0, ms));
  }
  private async poll(): Promise<void> {
    try {
      const nextAt = this.merge(await this.api.map(this.sessionId, this.seeds.length, this.signal));
      this.schedule(Math.min(5000, Math.max(200, nextAt - this.serverNow() + 100)));
    } catch { this.schedule(1000); }
  }
}

export class RankedTimeline {
  private readonly points: TimelinePoint[];
  private readonly cursor: TimelineCursor;
  readonly map: MapFeed;
  constructor(readonly session: SessionReply, private readonly source: ServerSource, signal?: AbortSignal) {
    source.merge(session.timeline);
    this.points = [...session.timeline.points];
    this.cursor = new TimelineCursor(this.points, session.startedAt);
    this.map = new MapFeed(source.api, session.sessionId, session.map, () => source.serverNow(), signal);
    this.map.start();
  }
  /** A tick runs only once its telemetry is complete and its map chunk has been released. */
  ready(tick: number): boolean {
    return this.session.startedAt + tick * 1000 / 60 <= this.source.completeThrough && Math.floor(tick / CHUNK_TICKS) < this.map.seeds.length;
  }
  stop(): void { this.map.stop(); }
  /** Server-time tick the run should have reached by now. */
  targetTick(): number { return Math.floor(this.exactTick()); }
  /** Fractional server-time tick, for smooth rendering between simulation ticks. */
  exactTick(): number { return Math.max(0, (this.source.serverNow() - this.session.startedAt) * 60 / 1000); }
  input(tick: number): TickInput {
    const last = this.points[this.points.length - 1]?.at ?? -1;
    for (const point of this.source.points) if (point.at > last) this.points.push(point);
    const input = this.cursor.input(tick);
    if (tick % CHUNK_TICKS === 0) input.chunkSeed = this.map.seeds[tick / CHUNK_TICKS];
    return input;
  }
}
