import { CONFIG } from '../../config';

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

/** Normalize the actual, smoothed world speed against the current distance base. */
export function speedIntensity(speed: number, base: number): number {
  return Number.isFinite(speed) && base > 0
    ? clamp((speed / base - 1) / (CONFIG.speed.maximumMultiplier - 1)) : 0;
}

export function dustProfile(intensity: number): { interval: number; count: number } {
  const t = clamp(intensity), fx = CONFIG.fx.dust;
  return {
    interval: fx.intervalSlow + (fx.intervalFast - fx.intervalSlow) * t,
    // Fractional counts accumulate across emissions, avoiding abrupt density steps.
    count: fx.countSlow + (fx.countFast - fx.countSlow) * t,
  };
}

export function crossedMilestones(previous: number, score: number): number[] {
  return CONFIG.fx.milestones.scores.filter(mark => previous < mark && score >= mark);
}

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
