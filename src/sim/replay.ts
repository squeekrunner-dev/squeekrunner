import { createSim, distance, MAX_TICKS, SIM_VERSION, step, TICK_HZ, type SimState, type TickInput } from './core';

export const MAX_REPLAY_BYTES = 8 * 1024 * 1024;
export const MAX_RPM_MILLI = 1000000; // speed saturates at 98316, but retain the observed sample
export interface ReplayV1 {
  v: 1; simVersion: string; seed: number; tickHz: 60;
  inputs: number[]; telemetry: { tick: number; rpmMilli: number | null }[]; nuts: number[];
  /** Optional sparse extension: chain resets remove a previously spawned, uncollected nut. */
  nutResets?: number[];
  endTick: number; clientScore: number; mode: 'live' | 'demo';
}
export type Validation = { ok: true; replay: ReplayV1 } | { ok: false; reason: string };
const integer = (x: unknown, max: number): x is number => Number.isSafeInteger(x) && (x as number) >= 0 && (x as number) <= max;
const object = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export function validateReplay(value: unknown): Validation {
  const fail = (reason: string): Validation => ({ ok: false, reason });
  if (!object(value)) return fail('Replay must be an object');
  const required = ['v', 'simVersion', 'seed', 'tickHz', 'inputs', 'telemetry', 'nuts', 'endTick', 'clientScore', 'mode'];
  if (Object.keys(value).some(k => !required.includes(k) && k !== 'nutResets') ||
      required.some(k => !Object.prototype.hasOwnProperty.call(value, k))) return fail('Unexpected or missing fields');
  if (value.v !== 1 || value.simVersion !== SIM_VERSION || value.tickHz !== TICK_HZ) return fail('Unsupported replay/simulation version or tick rate');
  if (value.mode !== 'live') return fail('Only live replays are eligible');
  if (!integer(value.seed, 0xffffffff)) return fail('Invalid uint32 seed');
  if (!integer(value.endTick, MAX_TICKS) || value.endTick === 0) return fail('Invalid endTick');
  if (!integer(value.clientScore, Number.MAX_SAFE_INTEGER)) return fail('Invalid clientScore');
  const endTick = value.endTick;
  const ticks = (xs: unknown): boolean => Array.isArray(xs) && xs.length <= endTick &&
    // Array.from makes holes explicit, so sparse arrays cannot bypass validation.
    Array.from(xs).every((t, i) => integer(t, endTick - 1) && (i === 0 || t > xs[i - 1]));
  if (!ticks(value.inputs) || !ticks(value.nuts) || (value.nutResets !== undefined && !ticks(value.nutResets))) return fail('Invalid/nonmonotonic event ticks');
  const samples = value.telemetry;
  if (!Array.isArray(samples) || samples.length === 0 || samples.length > endTick) return fail('Invalid telemetry size');
  let previousTick = -1;
  let previousRpm: unknown = undefined;
  for (const sample of samples) {
    if (!object(sample) || Object.keys(sample).length !== 2 || Object.keys(sample).some(k => k !== 'tick' && k !== 'rpmMilli') ||
        !integer(sample.tick, endTick - 1) || sample.tick <= previousTick ||
        (previousTick === -1 && sample.tick !== 0) ||
        (sample.rpmMilli !== null && !integer(sample.rpmMilli, MAX_RPM_MILLI)) ||
        sample.rpmMilli === previousRpm) return fail('Invalid/noncanonical telemetry');
    previousTick = sample.tick; previousRpm = sample.rpmMilli;
  }
  return { ok: true, replay: value as unknown as ReplayV1 };
}

export function parseReplayJSON(text: string): Validation {
  // Valid format is ASCII only, so a valid document's characters equal its UTF-8 bytes.
  if (text.length > MAX_REPLAY_BYTES) return { ok: false, reason: 'Replay exceeds byte limit' };
  try { return validateReplay(JSON.parse(text)); }
  catch { return { ok: false, reason: 'Invalid JSON' }; }
}

/** For trusted/validated streams. Consumes at most MAX_TICKS even when called directly. */
export function simulateReplay(replay: ReplayV1): SimState {
  const s = createSim(replay.seed);
  let input = 0, telemetry = 0, nut = 0, reset = 0;
  while (!s.gameOver && s.tick < Math.min(replay.endTick, MAX_TICKS)) {
    const event: TickInput = {};
    if (replay.inputs[input] === s.tick) { event.jump = true; input++; }
    if (replay.telemetry[telemetry]?.tick === s.tick) { event.rpmMilli = replay.telemetry[telemetry++].rpmMilli; }
    if (replay.nuts[nut] === s.tick) { event.nut = true; nut++; }
    if (replay.nutResets?.[reset] === s.tick) { event.resetNut = true; reset++; }
    step(s, event);
  }
  return s;
}

export interface Verification { score: number; distance: number; endTick: number; ok: boolean; reason: string }
export function verifyReplay(value: unknown): Verification {
  const valid = validateReplay(value);
  if (!valid.ok) return { score: 0, distance: 0, endTick: 0, ok: false, reason: valid.reason };
  const s = simulateReplay(valid.replay);
  const reason = !s.gameOver ? 'Run has not ended' : s.tick !== valid.replay.endTick ? 'Incorrect endTick' :
    s.score !== valid.replay.clientScore ? 'Score mismatch' : 'ok';
  return { score: s.score, distance: distance(s), endTick: s.tick, ok: reason === 'ok', reason };
}

/** Records applied ticks, never wall time or callbacks that happened between ticks. */
export class ReplayRecorder {
  private readonly replay: ReplayV1;
  private nextTick = 0;
  private lastRpm: number | null | undefined;
  constructor(seed: number, mode: 'live' | 'demo') {
    createSim(seed); // validate the injected seed before recording
    this.replay = { v: 1, simVersion: SIM_VERSION, seed, tickHz: TICK_HZ, inputs: [], telemetry: [], nuts: [],
      endTick: 0, clientScore: 0, mode };
  }
  record(tick: number, input: TickInput): void {
    if (tick !== this.nextTick || tick >= MAX_TICKS) throw new Error('Record each applied tick exactly once');
    this.nextTick++;
    if (input.jump) this.replay.inputs.push(tick);
    if (input.nut) this.replay.nuts.push(tick);
    if (input.resetNut) (this.replay.nutResets ??= []).push(tick);
    const rpm = input.rpmMilli === undefined ? this.lastRpm ?? null : input.rpmMilli;
    if (rpm !== this.lastRpm) { this.replay.telemetry.push({ tick, rpmMilli: rpm }); this.lastRpm = rpm; }
  }
  finish(state: SimState): ReplayV1 {
    if (!state.gameOver || state.tick !== this.nextTick) throw new Error('Cannot finalize an incomplete run');
    return { ...this.replay, inputs: [...this.replay.inputs], telemetry: this.replay.telemetry.map(s => ({ ...s })),
      nuts: [...this.replay.nuts], ...(this.replay.nutResets ? { nutResets: [...this.replay.nutResets] } : {}),
      endTick: state.tick, clientScore: state.score };
  }
}
