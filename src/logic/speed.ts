import { CONFIG } from '../config';

export function rpmMultiplier(rpm: number): number {
  const fraction = Number.isFinite(rpm) ? Math.min(1, Math.max(0, rpm / CONFIG.speed.peakRpm)) : 0;
  return 1 + fraction * (CONFIG.speed.maximumMultiplier - 1);
}

export function baseSpeed(distance: number): number {
  const progress = Math.min(1, Math.max(0, distance / CONFIG.speed.rampDistance));
  return CONFIG.speed.base + progress * (CONFIG.speed.maximumBase - CONFIG.speed.base);
}

export function smoothSpeed(current: number, target: number, deltaSeconds: number): number {
  const alpha = 1 - Math.exp(-Math.max(0, deltaSeconds) / CONFIG.speed.smoothingSeconds);
  return current + (target - current) * alpha;
}

export function obstacleGap(distance: number, random: number): number {
  const progress = Math.min(1, Math.max(0, distance / CONFIG.obstacles.rampDistance));
  return CONFIG.obstacles.initialGapSeconds +
    progress * (CONFIG.obstacles.minimumGapSeconds - CONFIG.obstacles.initialGapSeconds) +
    Math.max(0, Math.min(1, random)) * CONFIG.obstacles.randomGapSeconds;
}
