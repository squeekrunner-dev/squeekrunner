import type { TelemetrySource } from '../chain/types';
import type { RecordStore, RunBlock } from '../logic/records';
import type { ReplayV1 } from '../sim/replay';

export interface GameContext {
  source: TelemetrySource;
  records: RecordStore;
  /** T008 can inject a server-issued seed here for each new run. */
  seedProvider?: () => number;
  lastReplay?: ReplayV1;
}
export interface RunResult {
  score: number;
  distance: number;
  best: number;
  blockBest: number;
  runBlock: RunBlock | null;
  newBest: boolean;
  demo: boolean;
}
