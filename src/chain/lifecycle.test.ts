import { afterEach, expect, it, vi } from 'vitest';
import { DemoSource } from './demo';
import { bindPageLifecycle } from './lifecycle';

afterEach(() => vi.useRealTimers());

it('resumes a cached page but cannot resurrect a destroyed game', () => {
  vi.useFakeTimers();
  const source = new DemoSource();
  const target = new EventTarget();
  const dispose = bindPageLifecycle(source, target);
  const restored = new Event('pageshow');
  Object.defineProperty(restored, 'persisted', { value: true });
  source.start();
  target.dispatchEvent(new Event('pagehide'));
  expect(vi.getTimerCount()).toBe(0);
  target.dispatchEvent(new Event('pageshow'));
  expect(vi.getTimerCount()).toBe(0);
  target.dispatchEvent(restored);
  expect(vi.getTimerCount()).toBe(1);
  dispose(); dispose();
  target.dispatchEvent(restored);
  expect(vi.getTimerCount()).toBe(0);
  expect(source.read().mode).toBe('NO DATA');
});
