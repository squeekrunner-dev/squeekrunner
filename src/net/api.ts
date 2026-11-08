import type { ReplayV1 } from '../sim/replay';
import type { RunReply, SessionReply, TimelinePage } from './timeline';

export interface NonceReply { nonce: string; issuedAt: string; expirationTime: string; domain: string; uri: string; chainId: number; statement: string }
export class NetworkError extends Error {
  constructor(message: string, readonly status = 0, readonly code = 'network', readonly score?: number) { super(message); }
}
export class ApiClient {
  constructor(readonly base: string, private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {}
  async request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 10000);
    try {
      const reply = await this.fetcher(`${this.base.replace(/\/$/, '')}${path}`, {
        method: body === undefined ? 'GET' : 'POST', credentials: 'omit', signal: controller.signal,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await reply.json();
      if (!reply.ok) throw new NetworkError(data.error?.message ?? 'Service unavailable', reply.status, data.error?.code, data.score);
      return data as T;
    } catch (error) {
      if (error instanceof NetworkError) throw error;
      throw new NetworkError(controller.signal.aborted ? 'Request cancelled or timed out' : 'Network unavailable');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  session(turnstileToken: string, signal?: AbortSignal): Promise<SessionReply> { return this.request('/v1/session', { turnstileToken }, signal); }
  run(sessionId: string, replay: ReplayV1, signal?: AbortSignal): Promise<RunReply> { return this.request('/v1/run', { sessionId, replay }, signal); }
  telemetry(since?: number, signal?: AbortSignal): Promise<TimelinePage> { return this.request(`/v1/telemetry${since === undefined ? '' : `?since=${since}`}`, undefined, signal); }
  nonce(signal?: AbortSignal): Promise<NonceReply> { return this.request('/v1/nonce', undefined, signal); }
  entry(runToken: string, siweMessage: string, signature: string, turnstileToken: string, signal?: AbortSignal): Promise<{ address: string; entered: true }> {
    return this.request('/v1/entry', { runToken, siweMessage, signature, turnstileToken }, signal);
  }
  raffleStatus(signal?: AbortSignal): Promise<RaffleStatusReply> { return this.request('/v1/raffle/status', undefined, signal); }
}
export interface RaffleStatusReply { threshold: number | null; entriesOpen: boolean; entriesCount: number; snapshotAt: string | null; deadline: string | null }

/** The best eligible run token survives navigation to /whitelist/ (and new tabs) for its 24 h lifetime. */
export const RUN_TOKEN_KEY = 'squeekrunner.raffle-run.v1';
export interface StoredRun { runToken: string; runId: string; score: number; savedAt: number }
const RUN_TTL_MS = 23 * 3600000;

export function rememberRun(run: RunReply, now = Date.now()): void {
  if (!run.eligible) return;
  const previous = loadRun(now);
  if (previous && previous.score >= run.score) return; // keep the best qualifying run
  try { localStorage.setItem(RUN_TOKEN_KEY, JSON.stringify({ runToken: run.runToken, runId: run.runId, score: run.score, savedAt: now })); }
  catch { /* Storage may be blocked; the Game Over link still works within this page. */ }
}
export function loadRun(now = Date.now()): StoredRun | null {
  try {
    const value = JSON.parse(localStorage.getItem(RUN_TOKEN_KEY) ?? 'null') as Partial<StoredRun> | null;
    if (!value || typeof value.runToken !== 'string' || !/^[0-9a-f]{64}$/.test(value.runToken) || typeof value.runId !== 'string' ||
        !Number.isSafeInteger(value.score) || !Number.isSafeInteger(value.savedAt) || now - value.savedAt! > RUN_TTL_MS) return null;
    return value as StoredRun;
  } catch { return null; }
}
export function forgetRun(): void { try { localStorage.removeItem(RUN_TOKEN_KEY); } catch { /* ignore */ } }
