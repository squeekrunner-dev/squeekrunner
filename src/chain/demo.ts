import { CONFIG } from '../config';
import { telemetryView } from './parse';
import type { ChainSnapshot, TelemetrySource, TelemetryView } from './types';

/** Deliberately separate installation and storage namespace: never masquerades as live. */
export class DemoSource implements TelemetrySource {
  readonly kind = 'demo' as const;
  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private snapshot: ChainSnapshot | null = null;
  private listeners = new Set<(snapshot: ChainSnapshot) => void>();

  constructor(private readonly clock: () => number = Date.now) {}

  start(): void {
    if (this.timer !== undefined) return;
    this.startedAt = this.clock();
    this.tick();
    this.timer = setInterval(() => this.tick(), CONFIG.demo.tickMs);
  }

  stop(): void { clearInterval(this.timer); this.timer = undefined; }

  read(now = this.clock()): TelemetryView {
    const view = telemetryView(this.snapshot, now);
    return { ...view, reason: view.mode === 'NO DATA' ? view.reason :
      view.rpm > 0 ? 'Simulated wheel is turning' : 'Simulated wheel is still' };
  }

  subscribe(listener: (snapshot: ChainSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private tick(): void {
    const now = this.clock();
    const elapsed = Math.max(0, now - this.startedAt);
    const phase = elapsed % CONFIG.demo.cycleMs;
    const running = phase >= CONFIG.demo.idleMs;
    const rpm = running ? CONFIG.speed.peakRpm * Math.sin(Math.PI *
      (phase - CONFIG.demo.idleMs) / (CONFIG.demo.cycleMs - CONFIG.demo.idleMs)) : 0;
    const confirmedHeight = CONFIG.demo.initialHeight + BigInt(Math.floor(elapsed / CONFIG.demo.blockIntervalMs));
    this.snapshot = {
      installationId: 'squeekrunner-demo-v1', fetchedAt: now, builderAvailable: true,
      confirmedHeight, projectedHeight: confirmedHeight + (running ? 1n : 0n),
      measurement: {
        freshness: 'online', coreStatus: running ? 'ACTIVE' : 'IDLE', rpm: Math.max(0, rpm),
        observedAt: now, receivedAt: now, staleAfterMs: CONFIG.telemetry.maxMeasurementAgeMs,
      },
    };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
