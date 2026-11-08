import type { TelemetrySource } from '../chain/types';
import type { RecordStore, RunBlock } from '../logic/records';
import type { ReplayV1 } from '../sim/replay';
import type { ApiClient } from '../net/api';

/** Outcome of server verification for a ranked (raffle-eligible) run. */
export type RankedOutcome =
  | { status: 'verified'; score: number; coins: number; eligible: boolean }
  | { status: 'rejected'; message: string }
  | { status: 'error'; message: string };

export interface GameContext {
  source: TelemetrySource;
  records: RecordStore;
  /** Present only when VITE_API_BASE is configured and the page is not in DEMO mode. */
  api?: ApiClient;
  turnstileSiteKey?: string;
  lastReplay?: ReplayV1;
  /** Pending verification of the last ranked run; the Game Over scene renders it. */
  submission?: Promise<RankedOutcome>;
}
export interface RunResult {
  score: number;
  distance: number;
  best: number;
  blockBest: number;
  runBlock: RunBlock | null;
  newBest: boolean;
  demo: boolean;
  /** True when the run was played on a server session and is being verified. */
  ranked?: boolean;
  /** Raffle coins collected in this run (all 10 are required for the raffle). */
  coins: number;
}
