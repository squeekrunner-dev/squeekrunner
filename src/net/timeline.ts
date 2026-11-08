import { BlockDetector } from '../chain/blocks';
import { TICK_HZ, type TickInput } from '../sim/core';

/** Published server points become effective five seconds after collection. */
export const TELEMETRY_LEAD_MS = 5000;
export interface TimelinePoint {
  at: number; validUntil: number; rpmMilli: number | null;
  installationId: string | null; height: string | null;
}
export interface TimelinePage { points: TimelinePoint[]; completeThrough: number; serverNow: number }
export interface SessionReply {
  sessionId: string; seed: number; startedAt: number; expiresAt: number; simVersion: string;
  timeline: TimelinePage;
}
export interface RunReply { score: number; distance: number; endTick: number; eligible: boolean; runToken: string; runId: string }

/** Identical chronological interpretation in the browser and verifier. No wall clock reads. */
export class TimelineCursor {
  private index = 0;
  private current: TimelinePoint | undefined;
  private detector = new BlockDetector();
  constructor(private readonly points: TimelinePoint[], private readonly startedAt: number) {
    // Baseline every point already known at start; none awards a pre-run nut.
    while (this.points[this.index]?.at <= startedAt) {
      const point = this.points[this.index++]; this.current = point;
      if (point.installationId) this.detector.observe(point.installationId, point.height === null ? null : BigInt(point.height));
    }
  }
  input(tick: number): TickInput {
    const at = this.startedAt + tick * 1000 / TICK_HZ;
    const event: TickInput = {};
    while (this.points[this.index]?.at <= at) {
      const point = this.points[this.index++]; this.current = point;
      if (point.installationId) {
        const update = this.detector.observe(point.installationId, point.height === null ? null : BigInt(point.height));
        if (update.reset) { event.resetNut = true; event.nut = false; }
        if (update.bonus) event.nut = true;
      }
    }
    event.rpmMilli = this.current && at < this.current.validUntil ? this.current.rpmMilli : null;
    return event;
  }
}
