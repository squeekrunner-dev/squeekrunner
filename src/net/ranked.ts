import type { ReplayV1 } from '../sim/replay';
import { NetworkError, rememberRun, type ApiClient } from './api';
import { RankedTimeline, ServerSource } from './source';
import { challenge } from './turnstile';
import type { SessionReply } from './timeline';
import type { RankedOutcome } from '../game/context';

export interface RankedRun { session: SessionReply; timeline: RankedTimeline }

/** Turnstile → server session. Any failure (cancel, network, warming up) means an offline run. */
export async function startRanked(api: ApiClient, source: ServerSource, sitekey: string, signal: AbortSignal): Promise<RankedRun> {
  const token = await challenge(sitekey, 'session', signal);
  const session = await api.session(token, signal);
  return { session, timeline: new RankedTimeline(session, source, signal) };
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Waits until the run's real duration has elapsed on the server clock, then submits once. */
export async function submitRanked(api: ApiClient, ranked: RankedRun, replay: ReplayV1, serverNow: () => number): Promise<RankedOutcome> {
  const endsAt = ranked.session.startedAt + replay.endTick * 1000 / 60;
  const wait = endsAt + 500 - serverNow();
  if (wait > 0) await sleep(Math.min(wait, 20000));
  try {
    const run = await api.run(ranked.session.sessionId, replay);
    rememberRun(run);
    return { status: 'verified', score: run.score, coins: run.coins, eligible: run.eligible };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    if (error instanceof NetworkError && error.status >= 400 && error.status < 500) return { status: 'rejected', message };
    return { status: 'error', message };
  }
}
