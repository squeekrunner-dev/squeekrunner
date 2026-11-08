import type { TelemetrySource } from '../chain/types';
import type { RecordStore, RunBlock } from '../logic/records';

export interface GameContext { source: TelemetrySource; records: RecordStore }
export interface RunResult {
  score: number;
  distance: number;
  best: number;
  blockBest: number;
  runBlock: RunBlock | null;
  newBest: boolean;
  demo: boolean;
}
