export type DataMode = 'LIVE' | 'WHEEL IDLE' | 'NO DATA';
export type SourceKind = 'live' | 'demo';

export interface Measurement {
  rpm: number;
  freshness: 'online' | 'stale';
  coreStatus: 'IDLE' | 'ACTIVE' | 'COUNTER_FAULT';
  observedAt: number;
  receivedAt: number;
  staleAfterMs: number;
}

export interface ChainSnapshot {
  installationId: string;
  fetchedAt: number;
  measurement: Measurement | null;
  builderAvailable: boolean;
  confirmedHeight: bigint | null;
  projectedHeight: bigint | null;
}

export interface TelemetryView {
  mode: DataMode;
  rpm: number;
  reason: string;
  snapshot: ChainSnapshot | null;
}

export interface TelemetrySource {
  readonly kind: SourceKind;
  start(): void;
  stop(): void;
  read(now?: number): TelemetryView;
  subscribe(listener: (snapshot: ChainSnapshot) => void): () => void;
}
