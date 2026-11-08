import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import { LiveSource, retryAfterMs, type VisibilityPort } from './live';
import { sampleStatus, SAMPLE_TIME } from './fixtures';

function visibilityControl() {
  let hidden = false;
  const callbacks = new Set<() => void>();
  const port: VisibilityPort = {
    hidden: () => hidden,
    subscribe(listener) { callbacks.add(listener); return () => { callbacks.delete(listener); }; },
  };
  return { port, subscriberCount: () => callbacks.size,
    set(value: boolean) { hidden = value; for (const callback of callbacks) callback(); } };
}
const okay = (): Response => Response.json(sampleStatus());

describe('live source scheduling and failure handling', () => {
  const active: LiveSource[] = [];
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(SAMPLE_TIME); });
  afterEach(() => { for (const source of active) source.stop(); active.length = 0; vi.useRealTimers(); });

  function setup(fetcher: typeof fetch) {
    const visibility = visibilityControl();
    const source = new LiveSource(fetcher, Date.now, visibility.port);
    active.push(source);
    return { source, visibility };
  }

  it('uses exact URL, no credentials or query, 1.5 second polling, and no duplicate start', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => okay());
    const { source } = setup(fetcher); const listener = vi.fn(); source.subscribe(listener);
    source.start(); source.start(); await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(CONFIG.telemetry.url, expect.objectContaining({ method: 'GET', credentials: 'omit', signal: expect.any(AbortSignal) }));
    expect(source.read().mode).toBe('LIVE'); expect(listener).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1499); expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('backs off exponentially and resets after a successful response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(new Response('', { status: 503 })).mockImplementation(async () => okay());
    const { source } = setup(fetcher); source.start(); await vi.advanceTimersByTimeAsync(0);
    expect(source.read()).toMatchObject({ mode: 'NO DATA', rpm: 0 });
    await vi.advanceTimersByTimeAsync(2999); expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5999); expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); expect(source.read().mode).toBe('LIVE');
    await vi.advanceTimersByTimeAsync(1500); expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('honors Retry-After even across a hidden/visible transition', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '20' } }))
      .mockImplementation(async () => okay());
    const { source, visibility } = setup(fetcher); source.start(); await vi.advanceTimersByTimeAsync(0);
    visibility.set(true); await vi.advanceTimersByTimeAsync(4000); visibility.set(false);
    await vi.advanceTimersByTimeAsync(15999); expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('pauses polling in a hidden document and resumes without concurrent requests', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => okay());
    const { source, visibility } = setup(fetcher); visibility.set(true); source.start();
    await vi.advanceTimersByTimeAsync(3000); expect(fetcher).not.toHaveBeenCalled();
    visibility.set(false); await vi.advanceTimersByTimeAsync(0); expect(fetcher).toHaveBeenCalledTimes(1);
    visibility.set(true); await vi.advanceTimersByTimeAsync(10000); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(source.read().mode).toBe('NO DATA');
    source.stop(); visibility.set(false); await vi.advanceTimersByTimeAsync(10000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('invalidates a late in-flight response after visibility cancellation', async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => { resolveResponse = resolve; }));
    const { source, visibility } = setup(fetcher); const listener = vi.fn(); source.subscribe(listener);
    source.start(); await vi.advanceTimersByTimeAsync(0); visibility.set(true);
    resolveResponse?.(okay()); await vi.advanceTimersByTimeAsync(0);
    expect(listener).not.toHaveBeenCalled(); expect(source.read().mode).toBe('NO DATA');
  });

  it('timeouts abort requests and an old successful read expires', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(okay()).mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const { source } = setup(fetcher); source.start(); await vi.advanceTimersByTimeAsync(0);
    expect(source.read().mode).toBe('LIVE');
    await vi.advanceTimersByTimeAsync(CONFIG.telemetry.pollMs + CONFIG.telemetry.timeoutMs);
    expect(source.read()).toMatchObject({ mode: 'NO DATA', reason: 'Request timed out; retrying' });
    expect(source.read(SAMPLE_TIME + CONFIG.telemetry.maxReadAgeMs + 1).rpm).toBe(0);
  });

  it('malformed JSON and malformed payloads never notify the game or crash', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('not json'))
      .mockResolvedValueOnce(Response.json({ schemaVersion: 999 }));
    const { source } = setup(fetcher); const listener = vi.fn(); source.subscribe(listener);
    source.start(); await vi.advanceTimersByTimeAsync(0); expect(source.read().mode).toBe('NO DATA');
    await vi.advanceTimersByTimeAsync(3000); expect(source.read().mode).toBe('NO DATA');
    expect(listener).not.toHaveBeenCalled();
  });

  it('parses numeric and HTTP-date Retry-After without retrying too early', () => {
    expect(retryAfterMs('12', SAMPLE_TIME)).toBe(12000);
    expect(retryAfterMs(new Date(SAMPLE_TIME + 20000).toUTCString(), SAMPLE_TIME)).toBe(20000);
    expect(retryAfterMs('bad', SAMPLE_TIME)).toBe(0);
    expect(retryAfterMs(null, SAMPLE_TIME)).toBe(0);
  });

  it('clears all timers immediately on stop even when fetch ignores cancellation', async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => { resolveResponse = resolve; }));
    const { source } = setup(fetcher); const listener = vi.fn(); source.subscribe(listener);
    source.start(); await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    source.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    resolveResponse?.(okay()); await vi.advanceTimersByTimeAsync(0);
    expect(listener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not keep LIVE after stop or a failed poll, even with a recent snapshot', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(okay()).mockRejectedValue(new Error('offline'));
    const { source } = setup(fetcher); source.start(); await vi.advanceTimersByTimeAsync(0);
    expect(source.read().mode).toBe('LIVE');
    source.stop(); expect(source.read()).toMatchObject({ mode: 'NO DATA', rpm: 0 });
    source.start(); await vi.advanceTimersByTimeAsync(CONFIG.telemetry.pollMs);
    expect(source.read()).toMatchObject({ mode: 'NO DATA', rpm: 0 });
    expect(source.read().snapshot?.confirmedHeight).toBe(1999n);
  });

  it('does not accumulate scene subscribers or source timers across restarts', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => okay());
    const { source, visibility } = setup(fetcher);
    const previousScene = vi.fn();
    for (let i = 0; i < 20; i++) {
      const unsubscribe = source.subscribe(previousScene);
      source.start(); source.start();
      expect(visibility.subscriberCount()).toBe(1);
      unsubscribe(); source.stop();
      expect(visibility.subscriberCount()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    }
    const currentScene = vi.fn(); const unsubscribe = source.subscribe(currentScene);
    source.start(); await vi.advanceTimersByTimeAsync(0);
    expect(previousScene).not.toHaveBeenCalled();
    expect(currentScene).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    unsubscribe(); await vi.advanceTimersByTimeAsync(CONFIG.telemetry.pollMs);
    expect(currentScene).toHaveBeenCalledTimes(1);
  });

  it('an obsolete response cannot clear the restarted request deadline or publish a snapshot', async () => {
    const resolveResponses: Array<(response: Response) => void> = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => { resolveResponses.push(resolve); }));
    const { source } = setup(fetcher); const listener = vi.fn(); source.subscribe(listener);
    source.start(); await vi.advanceTimersByTimeAsync(0);
    source.stop(); source.start(); await vi.advanceTimersByTimeAsync(0);
    resolveResponses[0]!(okay()); await vi.advanceTimersByTimeAsync(0);
    expect(listener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(CONFIG.telemetry.timeoutMs);
    expect(fetcher.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    resolveResponses[1]!(okay()); await vi.advanceTimersByTimeAsync(0);
    expect(listener).not.toHaveBeenCalled();
    expect(source.read()).toMatchObject({ mode: 'NO DATA', reason: 'Request timed out; retrying' });
    source.stop(); expect(vi.getTimerCount()).toBe(0);
  });
});
