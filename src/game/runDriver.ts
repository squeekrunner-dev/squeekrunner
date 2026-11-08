import { CONFIG } from '../config';
import type { TelemetryView } from '../chain/types';
import { createSim, step, TICK_HZ, type SimEvent, type SimState, type TickInput } from '../sim/core';
import { MAX_RPM_MILLI, ReplayRecorder, type ReplayV1 } from '../sim/replay';

/** Converts precisely the sample applied by the client, including read expiry without a callback. */
export function rpmSample(view: TelemetryView): number | null {
  return view.mode === 'NO DATA' || !Number.isFinite(view.rpm) || view.rpm < 0 ? null :
    Math.min(MAX_RPM_MILLI, Math.round(view.rpm * 1000));
}

export interface RankedInputs { input(tick: number): TickInput; ready(tick: number): boolean }

/** Frame-to-tick adapter, independent of rendering, subscriptions and clocks. */
export class RunDriver {
  readonly sim: SimState;
  replay: ReplayV1 | null = null;
  private readonly recorder: ReplayRecorder;
  private accumulator = 0;
  private pending: TickInput = {};

  constructor(seed: number, mode: 'live' | 'demo') {
    this.sim = createSim(seed);
    this.recorder = new ReplayRecorder(seed, mode);
  }
  jump(): void { this.pending.jump = true; }
  nut(): void { this.pending.nut = true; }
  resetNut(): void { this.pending.resetNut = true; this.pending.nut = false; }
  pause(): void { this.accumulator = 0; this.pending.jump = false; }
  /** Progress (0..1) from the last simulated tick towards the next one, for smooth rendering only. */
  fraction(): number { return this.sim.gameOver ? 0 : Math.min(1, Math.max(0, this.accumulator / 1000)); }

  /**
   * Ranked runs are locked to server wall time and take RPM/nuts only from the server timeline,
   * exactly like the verifier. Local frame stalls are caught up (bounded per frame), never dropped,
   * so a submission is never "late" because the browser lagged.
   */
  advanceRanked(targetTick: number, timeline: RankedInputs, onTick: (events: SimEvent[]) => void, maxSteps = 240): void {
    let steps = 0;
    while (!this.sim.gameOver && this.sim.tick < targetTick && steps < maxSteps && timeline.ready(this.sim.tick)) {
      const input: TickInput = timeline.input(this.sim.tick);
      if (this.pending.jump) input.jump = true;
      this.pending = {};
      this.recorder.record(this.sim.tick, input);
      const events = step(this.sim, input);
      if (this.sim.gameOver) this.replay = this.recorder.finish(this.sim);
      onTick(events);
      steps++;
    }
  }

  advance(deltaMs: number, rpmMilli: number | null, onTick: (events: SimEvent[]) => void): void {
    if (this.sim.gameOver || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    // Drop excess wall time after stalls, matching the old 50ms cap. Pause never advances this clock.
    this.accumulator += Math.min(deltaMs, CONFIG.maxFrameSeconds * 1000) * TICK_HZ;
    while (this.accumulator >= 1000 && !this.sim.gameOver) {
      this.accumulator -= 1000;
      const input = { ...this.pending, rpmMilli };
      this.pending = {};
      this.recorder.record(this.sim.tick, input);
      const events = step(this.sim, input);
      if (this.sim.gameOver) this.replay = this.recorder.finish(this.sim);
      onTick(events);
    }
  }
}
