import { BlockDetector } from '../chain/blocks';
import { TICK_HZ, type TickInput } from '../sim/core';
import { CONFIG } from '../config';

/** Published server points become effective five seconds after collection. */
export const TELEMETRY_LEAD_MS = 5000;
/** A map chunk seed is released this long before its chunk starts on the server clock. */
export const MAP_LEAD_MS = 3000;
export interface MapChunk { index: number; seed: number }
/** Released chunk seeds from the requested index; `nextAt` is the server time of the next release. */
export interface MapPage { chunks: MapChunk[]; nextAt: number; serverNow: number }
export interface TimelinePoint {
  at: number; validUntil: number; rpmMilli: number | null;
  installationId: string | null; height: string | null;
  /** squeek-6: projected (pending) Squeek height; golden nuts follow it. Null on older points. */
  projected?: string | null;
}
export interface TimelinePage { points: TimelinePoint[]; completeThrough: number; serverNow: number }
export interface SessionReply {
  sessionId: string; seed: number; startedAt: number; expiresAt: number; simVersion: string;
  timeline: TimelinePage;
  map: MapPage;
}
export interface RunReply { score: number; distance: number; endTick: number; coins: number; eligible: boolean; runToken: string; runId: string }

/** squeek-6: nuts follow the projected (pending) height, not batch-settled rounds: one nut each time the
 *  projected height crosses a multiple of CONFIG.blocksPerNut. */
export function nutStep(height: bigint | null): bigint | null {
  return height === null ? null : height / BigInt(CONFIG.blocksPerNut);
}
function nutHeight(point: TimelinePoint): bigint | null {
  return nutStep(point.projected === undefined || point.projected === null ? null : BigInt(point.projected));
}

/** Identical chronological interpretation in the browser and verifier. No wall clock reads. */
export class TimelineCursor {
  private index = 0;
  private current: TimelinePoint | undefined;
  private detector = new BlockDetector();
  constructor(private readonly points: TimelinePoint[], private readonly startedAt: number) {
    // Baseline every point already known at start; none awards a pre-run nut.
    while (this.points[this.index]?.at <= startedAt) {
      const point = this.points[this.index++]; this.current = point;
      if (point.installationId) this.detector.observe(point.installationId, nutHeight(point));
    }
  }
  input(tick: number): TickInput {
    const at = this.startedAt + tick * 1000 / TICK_HZ;
    const event: TickInput = {};
    while (this.points[this.index]?.at <= at) {
      const point = this.points[this.index++]; this.current = point;
      if (point.installationId) {
        const update = this.detector.observe(point.installationId, nutHeight(point));
        if (update.reset) { event.resetNut = true; event.nut = false; }
        if (update.bonus) event.nut = true;
      }
    }
    event.rpmMilli = this.current && at < this.current.validUntil ? this.current.rpmMilli : null;
    return event;
  }
}
