import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { SoundManager, type StoragePort } from './sound';

function createMemoryStorage(): StoragePort {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe('SoundManager', () => {
  afterEach(() => vi.unstubAllGlobals());
  let storage: StoragePort;
  let sound: SoundManager;

  beforeEach(() => {
    storage = createMemoryStorage();
    sound = new SoundManager(() => storage);
  });

  it('starts unmuted by default when storage is empty', () => {
    expect(sound.isMuted()).toBe(false);
  });

  it('toggles mute state and saves to storage', () => {
    expect(sound.toggleMute()).toBe(true);
    expect(sound.isMuted()).toBe(true);
    expect(storage.getItem('squeekrunner.audio.muted')).toBe('true');

    expect(sound.toggleMute()).toBe(false);
    expect(sound.isMuted()).toBe(false);
    expect(storage.getItem('squeekrunner.audio.muted')).toBe('false');
  });

  it('restores muted state from storage on construction', () => {
    storage.setItem('squeekrunner.audio.muted', 'true');
    const restored = new SoundManager(() => storage);
    expect(restored.isMuted()).toBe(true);
  });

  it('safely handles playback calls in headless test environment without throwing', () => {
    expect(() => {
      sound.unlock();
      sound.playJump();
      sound.playDoubleJump();
      sound.playCollectNut();
      sound.playShieldHit();
      sound.playHit();
      sound.playNewBlock();
      sound.playUiClick();
    }).not.toThrow();
  });

  it('does not construct audio before a gesture and closes its shared context on disposal', () => {
    const close = vi.fn(async () => {});
    const createGain = () => ({ gain: { setValueAtTime: vi.fn() }, connect: vi.fn() });
    const construct = vi.fn();
    class Context {
      state = 'running'; currentTime = 0; destination = {};
      createGain = createGain; close = close;
      constructor() { construct(); }
    }
    vi.stubGlobal('window', { AudioContext: Context });
    sound.playNewBlock(); sound.playJump(); expect(construct).not.toHaveBeenCalled();
    sound.unlock(); sound.unlock(); expect(construct).toHaveBeenCalledTimes(1);
    sound.dispose(); sound.dispose(); expect(close).toHaveBeenCalledTimes(1);
    sound.playNewBlock(); expect(construct).toHaveBeenCalledTimes(1);
  });

  it('keeps mute usable when storage and audio initialization fail', () => {
    const manager = new SoundManager(() => { throw new Error('Storage denied'); });
    vi.stubGlobal('window', { AudioContext: class { constructor() { throw new Error('Audio denied'); } } });
    expect(() => { manager.unlock(); manager.playJump(); manager.toggleMute(); manager.dispose(); }).not.toThrow();
    expect(manager.isMuted()).toBe(true);
  });
});
