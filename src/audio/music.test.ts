import { describe, expect, it } from 'vitest';
import { LOOP_STEPS, MUSIC, planStep, rpmToTempoFactor } from './music';

describe('run music tempo', () => {
  it('maps the wheel RPM linearly onto 0.85×–1.25× with clamping', () => {
    expect(rpmToTempoFactor(0)).toBeCloseTo(MUSIC.minFactor);
    expect(rpmToTempoFactor(MUSIC.peakRpm)).toBeCloseTo(MUSIC.maxFactor);
    expect(rpmToTempoFactor(MUSIC.peakRpm / 2)).toBeCloseTo((MUSIC.minFactor + MUSIC.maxFactor) / 2);
    expect(rpmToTempoFactor(400)).toBeCloseTo(MUSIC.maxFactor);
    expect(rpmToTempoFactor(-5)).toBeCloseTo(MUSIC.minFactor);
    expect(rpmToTempoFactor(Number.NaN)).toBeCloseTo(MUSIC.minFactor);
  });

  it('is monotonic: a faster wheel never plays slower', () => {
    let previous = 0;
    for (let rpm = 0; rpm <= 100; rpm += 0.5) {
      const factor = rpmToTempoFactor(rpm);
      expect(factor).toBeGreaterThanOrEqual(previous);
      previous = factor;
    }
  });
});

describe('Zero Kelvin arrangement', () => {
  const never = (): number => 0;

  it('opens with kick and bass only, then layers hats, snare, arpeggio and claps', () => {
    const bar = (b: number) => Array.from({ length: 16 }, (_, s) => planStep(b * 16 + s, never));
    expect(bar(0).some(p => p.kick)).toBe(true);
    expect(bar(0).some(p => p.bass !== null)).toBe(true);
    expect(bar(0).some(p => p.hat || p.snare || p.arp !== null || p.clap)).toBe(false);
    expect(bar(2).some(p => p.hat)).toBe(true);
    expect(bar(4).some(p => p.snare)).toBe(true);
    expect(bar(8).some(p => p.arp !== null)).toBe(true);
    expect(bar(16).some(p => p.clap)).toBe(true);
    expect(bar(28).some(p => p.arp !== null)).toBe(false);
  });

  it('loops seamlessly every 32 bars', () => {
    for (let step = 0; step < LOOP_STEPS; step += 7) {
      expect(planStep(step + LOOP_STEPS, never)).toEqual(planStep(step, never));
    }
  });
});
