import { describe, expect, it, beforeEach } from 'vitest';
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
});
