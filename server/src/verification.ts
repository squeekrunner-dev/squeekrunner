import { CHUNK_TICKS, createSim, distance, obstacleRect, playerRect, step, SIM_VERSION, TICK_HZ, UNIT, type SimState } from '../../src/sim/core';
import { validateReplay } from '../../src/sim/replay';
import { TimelineCursor, type TimelinePoint } from '../../src/net/timeline';
import { ApiError, fail } from './security';

export interface SessionRow { id: string; seed: number; sim_version: string; started_at: number; expires_at: number; used: number; ip_hash: string; map_secret: string }
export function checkRun(value: unknown, session: SessionRow, now: number) {
  const valid = validateReplay(value);
  if (!valid.ok) fail(400, 'replay', valid.reason);
  const replay = valid.ok ? valid.replay : neverReplay();
  if (replay.seed !== session.seed || replay.simVersion !== session.sim_version || replay.simVersion !== SIM_VERSION || !session.map_secret) fail(400, 'session_mismatch', 'Seed or version does not match session');
  const endsAt = session.started_at + replay.endTick * 1000 / TICK_HZ;
  if (now < endsAt - 250) fail(400, 'too_early', 'Run submitted before its real duration elapsed');
  if (now > session.expires_at || now > endsAt + 15000) fail(410, 'expired', 'Session expired or run submitted too late');
  return replay;
}
function neverReplay(): never { throw new Error('Unreachable'); }

/** Input-rhythm signals for the review panel. Humans vary; scripted input tends to be uniform. */
export interface RunSignals {
  jumps: number; airJumps: number;
  /** Gap (px) from the player to the next obstacle at each ground jump: mean / standard deviation. */
  leadMean: number | null; leadStd: number | null;
  /** Ticks between a jump and its air jump: mean / standard deviation. */
  airDelayMean: number | null; airDelayStd: number | null;
}
const stats = (xs: number[]): [number | null, number | null] => {
  if (!xs.length) return [null, null];
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return [Math.round(mean * 10) / 10, Math.round(Math.sqrt(variance) * 10) / 10];
};
function leadToObstacle(s: SimState): number | null {
  const right = playerRect(s).right;
  let best: number | null = null;
  for (const o of s.obstacles) {
    const gap = obstacleRect(o).left - right;
    if (gap >= 0 && (best === null || gap < best)) best = gap;
  }
  return best === null ? null : best / UNIT;
}

export function authoritativeRun(replay: ReturnType<typeof checkRun>, session: SessionRow, points: TimelinePoint[], seeds: number[]) {
  if (!points.some(p => p.at <= session.started_at)) fail(503, 'history', 'Session telemetry unavailable');
  if (seeds.length * CHUNK_TICKS < replay.endTick) fail(503, 'map', 'Session map unavailable');
  const cursor = new TimelineCursor(points, session.started_at), state = createSim(session.seed);
  const leads: number[] = [], airDelays: number[] = [];
  let index = 0, lastJump = -1, airJumps = 0;
  while (!state.gameOver && state.tick < replay.endTick) {
    const input = cursor.input(state.tick);
    if (state.tick % CHUNK_TICKS === 0) input.chunkSeed = seeds[state.tick / CHUNK_TICKS];
    if (replay.inputs[index] === state.tick) { input.jump = true; index++; }
    const before = state.tick, lead = input.jump ? leadToObstacle(state) : null;
    const events = step(state, input);
    if (events.includes('jump')) { lastJump = before; if (lead !== null) leads.push(lead); }
    if (events.includes('airJump')) { airJumps++; if (lastJump >= 0) airDelays.push(before - lastJump); }
  }
  if (!state.gameOver || state.tick !== replay.endTick || state.score !== replay.clientScore) {
    throw new ApiError(409, 'score_mismatch', 'Replay differs from the server timeline. This run is not eligible.', { score: state.score, endTick: state.tick, eligible: false });
  }
  const [leadMean, leadStd] = stats(leads), [airDelayMean, airDelayStd] = stats(airDelays);
  const signals: RunSignals = { jumps: replay.inputs.length, airJumps, leadMean, leadStd, airDelayMean, airDelayStd };
  return { score: state.score, distance: distance(state), endTick: state.tick, coins: state.coins.collected, signals };
}
