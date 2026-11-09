import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { crossedMilestones, dustProfile, speedIntensity } from './profile';

describe('presentation speed and milestones', () => {
  it('tracks world speed at both distance bases and clamps outliers', () => {
    for (const base of [CONFIG.speed.base, CONFIG.speed.maximumBase]) {
      expect(speedIntensity(base, base)).toBe(0);
      expect(speedIntensity(base * CONFIG.speed.maximumMultiplier, base)).toBe(1);
      expect(speedIntensity(base * 1.85, base)).toBeCloseTo(0.5);
      expect(speedIntensity(base * 5, base)).toBe(1);
    }
    expect(speedIntensity(NaN, 290)).toBe(0);
    expect(speedIntensity(100, 290)).toBe(0);
  });

  it('grows density smoothly and keeps the peak trail within the fixed pool', () => {
    let previousRate = 0;
    for (let i = 0; i <= 100; i++) {
      const profile = dustProfile(i / 100);
      const rate = profile.count / profile.interval;
      expect(rate).toBeGreaterThan(previousRate);
      previousRate = rate;
    }
    const peak = dustProfile(1), slow = dustProfile(0);
    expect(peak.count / peak.interval).toBeGreaterThan(10 * slow.count / slow.interval);
    expect(Math.ceil(peak.count / peak.interval * (CONFIG.fx.dust.life + CONFIG.fx.dust.lifeBoost)) + 22).toBeLessThanOrEqual(CONFIG.fx.dust.pool);
  });

  it('detects threshold crossings including catch-up, without repeats', () => {
    expect(crossedMilestones(24999, 25000)).toEqual([25000]);
    expect(crossedMilestones(25000, 25001)).toEqual([]);
    expect(crossedMilestones(24900, 100150)).toEqual([25000, 50000, 100000]);
    expect(crossedMilestones(100150, 100200)).toEqual([]);
  });
});
