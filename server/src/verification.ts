import { createSim, distance, step, SIM_VERSION, TICK_HZ } from '../../src/sim/core';
import { validateReplay } from '../../src/sim/replay';
import { TimelineCursor, type TimelinePoint } from '../../src/net/timeline';
import { ApiError, fail } from './security';

export interface SessionRow { id: string; seed: number; sim_version: string; started_at: number; expires_at: number; used: number; ip_hash: string }
export function checkRun(value: unknown, session: SessionRow, now: number) {
  const valid = validateReplay(value);
  if (!valid.ok) fail(400, 'replay', valid.reason);
  const replay = valid.ok ? valid.replay : neverReplay();
  if (replay.seed !== session.seed || replay.simVersion !== session.sim_version || replay.simVersion !== SIM_VERSION) fail(400, 'session_mismatch', 'Seed or version does not match session');
  const endsAt = session.started_at + replay.endTick * 1000 / TICK_HZ;
  if (now < endsAt - 250) fail(400, 'too_early', 'Run submitted before its real duration elapsed');
  if (now > session.expires_at || now > endsAt + 15000) fail(410, 'expired', 'Session expired or run submitted too late');
  return replay;
}
function neverReplay(): never { throw new Error('Unreachable'); }

export function authoritativeRun(replay: ReturnType<typeof checkRun>, session: SessionRow, points: TimelinePoint[]) {
  if (!points.some(p => p.at <= session.started_at)) fail(503, 'history', 'Session telemetry unavailable');
  const cursor = new TimelineCursor(points, session.started_at), state = createSim(session.seed);
  let index = 0;
  while (!state.gameOver && state.tick < replay.endTick) {
    const input = cursor.input(state.tick);
    if (replay.inputs[index] === state.tick) { input.jump = true; index++; }
    step(state, input);
  }
  if (!state.gameOver || state.tick !== replay.endTick || state.score !== replay.clientScore) {
    throw new ApiError(409, 'score_mismatch', 'Replay differs from the server timeline. This run is not eligible.', { score: state.score, endTick: state.tick, eligible: false });
  }
  return { score: state.score, distance: distance(state), endTick: state.tick };
}
