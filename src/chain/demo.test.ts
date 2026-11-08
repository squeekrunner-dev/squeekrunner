import { afterEach, expect, it, vi } from 'vitest';
import { DemoSource } from './demo';
import { CONFIG } from '../config';

afterEach(() => { vi.useRealTimers(); });

it('demo starts idle, reaches the measured peak, settles blocks, and stops cleanly', async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const source = new DemoSource(); const listener = vi.fn(); source.subscribe(listener);
  source.start();
  expect(source.kind).toBe('demo');
  expect(source.read().mode).toBe('WHEEL IDLE');
  expect(source.read().snapshot?.confirmedHeight).toBe(CONFIG.demo.initialHeight);
  await vi.advanceTimersByTimeAsync(CONFIG.demo.idleMs + (CONFIG.demo.cycleMs - CONFIG.demo.idleMs) / 2);
  expect(source.read().rpm).toBeCloseTo(CONFIG.speed.peakRpm);
  expect(source.read().mode).toBe('LIVE');
  expect(source.read().snapshot?.confirmedHeight).toBe(CONFIG.demo.initialHeight + 1n);
  const calls = listener.mock.calls.length; source.stop();
  await vi.advanceTimersByTimeAsync(5000); expect(listener).toHaveBeenCalledTimes(calls);
});
