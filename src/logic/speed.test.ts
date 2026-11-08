import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { baseSpeed, obstacleGap, rpmMultiplier, smoothSpeed } from './speed';

describe('playable and bounded speed', () => {
  it('zero RPM keeps full baseline running speed', () => {
    expect(rpmMultiplier(0)).toBe(1);
    expect(baseSpeed(0) * rpmMultiplier(0)).toBe(CONFIG.speed.base);
    expect(baseSpeed(0)).toBeGreaterThan(0);
  });
  it('reaches 2.7x at the observed peak and clamps above it', () => {
    expect(rpmMultiplier(98.316)).toBeCloseTo(2.7);
    expect(rpmMultiplier(400)).toBeCloseTo(2.7);
    expect(rpmMultiplier(49.158)).toBeCloseTo(1.85);
  });
  it.each([-20, NaN, Infinity])('unusable RPM %s defaults to 1x', value => {
    expect(rpmMultiplier(value)).toBe(1);
  });
  it('distance difficulty has a ceiling and preserves time to react', () => {
    expect(baseSpeed(CONFIG.speed.rampDistance)).toBe(CONFIG.speed.maximumBase);
    expect(baseSpeed(1e9)).toBe(CONFIG.speed.maximumBase);
    expect(obstacleGap(1e9, 0)).toBeCloseTo(CONFIG.obstacles.minimumGapSeconds);
    expect(obstacleGap(0, 1)).toBeGreaterThan(obstacleGap(1000, 1));
  });
  it('smooths without overshoot and is independent of frame partitioning', () => {
    const one = smoothSpeed(290, 1000, 1);
    let many = 290;
    for (let i = 0; i < 100; i++) many = smoothSpeed(many, 1000, 0.01);
    expect(many).toBeCloseTo(one, 8);
    expect(one).toBeGreaterThan(290);
    expect(one).toBeLessThan(1000);
    expect(smoothSpeed(1000, 290, 0.016)).toBeGreaterThan(290);
  });
});
