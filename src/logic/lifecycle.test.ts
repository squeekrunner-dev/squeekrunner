import { expect, it, vi } from 'vitest';
import { onSceneExit } from './lifecycle';

function eventBus() {
  const target = new EventTarget();
  return {
    once: (event: string, listener: () => void) => target.addEventListener(event, listener, { once: true }),
    off: vi.fn((event: string, listener: () => void) => target.removeEventListener(event, listener)),
    emit: (event: string) => target.dispatchEvent(new Event(event)),
  };
}

it('cleans direct destruction and removes the dormant shutdown callback', () => {
  const events = eventBus(); const cleanup = vi.fn();
  onSceneExit(events, cleanup);
  events.emit('destroy'); events.emit('shutdown');
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(events.off).toHaveBeenCalledWith('shutdown', expect.any(Function));
  expect(events.off).toHaveBeenCalledWith('destroy', expect.any(Function));
});

it('restarting a scene does not accumulate destruction callbacks or dispose old runs again', () => {
  const events = eventBus(); const cleanup = vi.fn();
  for (let run = 0; run < 30; run++) {
    onSceneExit(events, cleanup);
    events.emit('shutdown');
  }
  const activeRun = vi.fn(); onSceneExit(events, activeRun);
  events.emit('destroy');
  expect(cleanup).toHaveBeenCalledTimes(30);
  expect(activeRun).toHaveBeenCalledTimes(1);
});
