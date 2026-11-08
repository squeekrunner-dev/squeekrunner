import { describe, expect, it } from 'vitest';
import { offer } from './mobile';
import { MAX_WIDTH, viewWidth } from '../game/viewSize';

describe('wide view', () => {
  it('keeps 960 for 16:9 and narrower, widens for phones held sideways, caps at MAX_WIDTH', () => {
    expect(viewWidth(1920, 1080)).toBe(960);
    expect(viewWidth(1024, 768)).toBe(960);
    expect(viewWidth(844, 390)).toBe(1169);             // iPhone landscape ~2.16:1
    expect(viewWidth(1000, 400)).toBe(MAX_WIDTH);       // 2.5:1 → capped
    expect(viewWidth(800, 400)).toBe(1080);              // 2:1
    expect(viewWidth(0, 0)).toBe(960);
  });
});

describe('mobile offer', () => {
  const base = { fullscreenEnabled: false, touch: true, ios: false, standalone: false };
  it('Android with fullscreen → button; iPhone Safari → home-screen tip; installed app or desktop → nothing', () => {
    expect(offer({ ...base, fullscreenEnabled: true })).toBe('fullscreen');
    expect(offer({ ...base, ios: true })).toBe('ios-tip');
    expect(offer({ ...base, ios: true, standalone: true })).toBeNull();
    expect(offer({ ...base, touch: false, fullscreenEnabled: true })).toBeNull();
  });
});
