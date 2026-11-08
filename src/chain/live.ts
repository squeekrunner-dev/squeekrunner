import { CONFIG } from '../config';
import { parseStatus, telemetryView } from './parse';
import type { ChainSnapshot, TelemetrySource, TelemetryView } from './types';

export interface VisibilityPort {
  hidden(): boolean;
  subscribe(listener: () => void): () => void;
}

export const browserVisibility: VisibilityPort = {
  hidden: () => document.hidden,
  subscribe(listener) {
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
};

export function retryAfterMs(value: string | null, now: number): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export class LiveSource implements TelemetrySource {
  readonly kind = 'live' as const;
  private snapshot: ChainSnapshot | null = null;
  private error = 'Connecting to the wheel';
  private listeners = new Set<(snapshot: ChainSnapshot) => void>();
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;
  private requestTimeout: ReturnType<typeof setTimeout> | undefined;
  private unsubscribeVisibility: (() => void) | undefined;
  private generation = 0;
  private failures = 0;
  private nextAllowedAt = 0;

  constructor(
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
    private readonly clock: () => number = Date.now,
    private readonly visibility: VisibilityPort = browserVisibility,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.unsubscribeVisibility = this.visibility.subscribe(() => this.onVisibility());
    this.onVisibility();
  }

  stop(): void {
    this.running = false;
    this.cancel();
    this.unsubscribeVisibility?.();
    this.unsubscribeVisibility = undefined;
  }

  read(now = this.clock()): TelemetryView {
    const error = !this.running ? 'Telemetry stopped' :
      this.visibility.hidden() ? 'Polling paused while hidden' : this.error;
    return telemetryView(this.snapshot, now, error);
  }

  subscribe(listener: (snapshot: ChainSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private cancel(): void {
    this.generation++;
    clearTimeout(this.timer);
    this.timer = undefined;
    clearTimeout(this.requestTimeout);
    this.requestTimeout = undefined;
    this.controller?.abort();
    this.controller = undefined;
  }

  private onVisibility(): void {
    this.cancel();
    if (this.running && !this.visibility.hidden()) this.schedule(Math.max(0, this.nextAllowedAt - this.clock()));
  }

  private schedule(delay: number): void {
    // Chunk very large Retry-After values without overflowing browser timers.
    this.timer = setTimeout(() => {
      if (this.clock() < this.nextAllowedAt) this.schedule(this.nextAllowedAt - this.clock());
      else void this.poll();
    }, Math.min(delay, 2147483647));
  }

  private async poll(): Promise<void> {
    if (!this.running || this.visibility.hidden()) return;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), CONFIG.telemetry.timeoutMs);
    this.requestTimeout = timeout;
    let retry = 0;
    let delay: number = CONFIG.telemetry.pollMs;
    try {
      const response = await this.fetcher(CONFIG.telemetry.url, {
        method: 'GET', credentials: 'omit', signal: controller.signal,
      });
      retry = retryAfterMs(response.headers.get('Retry-After'), this.clock());
      if (!response.ok) throw new Error(response.status === 429 ? 'Rate limited; waiting to retry' : `HTTP ${response.status}; retrying`);
      const body: unknown = await response.json();
      const snapshot = parseStatus(body, this.clock());
      if (!snapshot) throw new Error('Invalid telemetry; retrying');
      if (generation !== this.generation) return;
      this.snapshot = snapshot;
      this.error = '';
      this.failures = 0;
      for (const listener of this.listeners) listener(snapshot);
    } catch (error: unknown) {
      if (generation !== this.generation) return;
      this.failures++;
      this.error = controller.signal.aborted ? 'Request timed out; retrying' :
        error instanceof Error && /^(HTTP|Rate limited|Invalid telemetry)/.test(error.message)
          ? error.message : 'Network unavailable; retrying';
      delay = Math.max(retry, Math.min(CONFIG.telemetry.maxBackoffMs,
        CONFIG.telemetry.pollMs * 2 ** Math.min(this.failures, 16)));
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) {
        this.controller = undefined;
        this.requestTimeout = undefined;
      }
      if (generation === this.generation && this.running && !this.visibility.hidden()) {
        this.nextAllowedAt = this.clock() + delay;
        this.schedule(delay);
      }
    }
  }
}
