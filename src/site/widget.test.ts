import { afterEach, expect, it, vi } from 'vitest';
import { DemoSource } from '../chain/demo';
import { LiveSource } from '../chain/live';
import { CONFIG } from '../config';
import { sampleStatus, SAMPLE_TIME } from '../chain/fixtures';
import { watchTelemetry } from './widget';

class Visibility extends EventTarget {
  hidden = false;
  setHidden(hidden: boolean): void { this.hidden = hidden; this.dispatchEvent(new Event('visibilitychange')); }
}
afterEach(() => vi.useRealTimers());

it('suspends rendering and polling off-page, resumes BFCache, and disposes all observers', async () => {
  vi.useFakeTimers(); vi.setSystemTime(SAMPLE_TIME);
  const page = new EventTarget(); const visibility = new Visibility();
  const source = new DemoSource(); const render = vi.fn();
  const dispose = watchTelemetry(source, render, page, visibility);
  expect(vi.getTimerCount()).toBe(2);
  page.dispatchEvent(new Event('pageshow'));
  expect(vi.getTimerCount()).toBe(2);
  visibility.setHidden(true); expect(vi.getTimerCount()).toBe(0);
  const calls = render.mock.calls.length;
  await vi.advanceTimersByTimeAsync(20000); expect(render).toHaveBeenCalledTimes(calls);
  visibility.setHidden(false); expect(vi.getTimerCount()).toBe(2);
  page.dispatchEvent(new Event('pagehide')); expect(vi.getTimerCount()).toBe(0);
  visibility.setHidden(false); expect(vi.getTimerCount()).toBe(0);
  page.dispatchEvent(new Event('pageshow')); expect(vi.getTimerCount()).toBe(2);
  dispose(); dispose(); expect(vi.getTimerCount()).toBe(0);
  const afterDispose = render.mock.calls.length;
  page.dispatchEvent(new Event('pageshow')); visibility.setHidden(false);
  source.start(); await vi.advanceTimersByTimeAsync(250);
  expect(render).toHaveBeenCalledTimes(afterDispose);
  source.stop();
});

it('updates the widget to NO DATA after a failed poll without needing a successful snapshot event', async () => {
  vi.useFakeTimers(); vi.setSystemTime(SAMPLE_TIME);
  const page = new EventTarget(); const visibility = new Visibility();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(sampleStatus())).mockRejectedValue(new Error('offline'));
  const source = new LiveSource(fetcher, Date.now, {
    hidden: () => visibility.hidden,
    subscribe: callback => { visibility.addEventListener('visibilitychange', callback); return () => visibility.removeEventListener('visibilitychange', callback); },
  });
  const render = vi.fn(); const dispose = watchTelemetry(source, render, page, visibility);
  await vi.advanceTimersByTimeAsync(0);
  expect(render.mock.lastCall?.[0].mode).toBe('LIVE');
  await vi.advanceTimersByTimeAsync(2000);
  expect(render.mock.lastCall?.[0]).toMatchObject({ mode: 'NO DATA', rpm: 0 });
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(CONFIG.telemetry.maxReadAgeMs);
  expect(render.mock.lastCall?.[0].mode).toBe('NO DATA');
  dispose(); expect(vi.getTimerCount()).toBe(0);
});

it('does not start a request or a UI interval when loaded in a hidden tab', () => {
  vi.useFakeTimers();
  const source = new DemoSource(); const visibility = new Visibility(); visibility.hidden = true;
  const render = vi.fn(); const dispose = watchTelemetry(source, render, new EventTarget(), visibility);
  expect(vi.getTimerCount()).toBe(0);
  expect(render.mock.lastCall?.[0].mode).toBe('NO DATA');
  visibility.setHidden(false); expect(vi.getTimerCount()).toBe(2);
  dispose();
});
