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
}

export const RUN_TOKEN_KEY = 'squeekrunner.raffle-run.v1';
export function rememberRun(run: RunReply): void {
  if (!run.eligible) return;
  try { sessionStorage.setItem(RUN_TOKEN_KEY, JSON.stringify({ runToken: run.runToken, runId: run.runId, score: run.score })); }
  catch { /* In-memory result is still available to this page. */ }
}
