import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { coinSchedule, createSim, step, UNIT, type SimEvent, type SimState } from './core';

const metres = (milli: number): number => milli / (CONFIG.pixelsPerMetre * UNIT);

/** A clean sim with no obstacles and one coin placed `ahead` metres in front of the player. */
function arena(aheadMetres: number): SimState {
  const s = createSim(7);
  s.spawnAt = Number.MAX_SAFE_INTEGER; // no obstacles: test only the jump reach
  s.coins.schedule = [aheadMetres * CONFIG.pixelsPerMetre * UNIT];
  return s;
}
function run(s: SimState, jumps: number[], ticks = 600): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < ticks && !s.gameOver; t++) events.push(...step(s, { jump: jumps.includes(t) }));
  return events;
}

describe('raffle coins', () => {
  it('places exactly 10 coins, one per segment of the first 10,000 m, deterministically per seed', () => {
    for (const seed of [0, 1, 42, 0xffffffff]) {
      const schedule = coinSchedule(seed).map(metres);
      expect(schedule).toHaveLength(10);
      const segment = Math.floor((CONFIG.coins.lastMetres - CONFIG.coins.firstMetres) / 10);
      schedule.forEach((m, i) => {
        expect(m).toBeGreaterThanOrEqual(CONFIG.coins.firstMetres + i * segment + CONFIG.coins.segmentMarginMetres);
        expect(m).toBeLessThanOrEqual(CONFIG.coins.firstMetres + (i + 1) * segment - CONFIG.coins.segmentMarginMetres);
      });
      expect(coinSchedule(seed)).toEqual(coinSchedule(seed));
      expect(Math.max(...schedule)).toBeLessThan(10000); // all inside the first 100,000 distance points
    }
    expect(coinSchedule(1)).not.toEqual(coinSchedule(2));
  });

  it('does not change the obstacle sequence (separate random stream)', () => {
    const a = createSim(99), b = createSim(99);
    b.coins.schedule = [];
    for (let t = 0; t < 2000; t++) { step(a, { jump: t % 50 === 0 }); step(b, { jump: t % 50 === 0 }); }
    expect(a.obstacles.map(o => [o.kind, o.width, o.height])).toEqual(b.obstacles.map(o => [o.kind, o.width, o.height]));
    expect(a.score).toBe(b.score);
  });

  it('a single jump can never reach a coin, whatever the timing', () => {
    for (let t = 0; t < 120; t += 2) {
      const s = arena(20);
      run(s, [t]);
      expect(s.coins.collected).toBe(0);
      expect(s.coins.missed).toBe(1);
    }
  });

  it('a well-timed double jump collects it; a hasty one does not', () => {
    let best = 0;
    for (let first = 0; first < 90; first++) {
      for (const gap of [1, 25, 30, 35]) {
        const s = arena(20);
        run(s, [first, first + gap]);
        if (gap === 1) expect(s.coins.collected).toBe(0); // instant double jump is too low
        best = Math.max(best, s.coins.collected);
      }
    }
    expect(best).toBe(1);
  });

  it('emits spawn/collect/miss events and stops after the tenth coin', () => {
    const s = arena(15);
    const events = run(s, []);
    expect(events).toContain('coinSpawn');
    expect(events).toContain('coinMissed');
    const full = createSim(3);
    full.spawnAt = Number.MAX_SAFE_INTEGER;
    full.travel = 10000 * CONFIG.pixelsPerMetre * UNIT; // past every coin
    step(full);
    const spawned = full.coins.next;
    expect(spawned).toBeLessThanOrEqual(1);
    for (let t = 0; t < 30; t++) step(full);
    expect(full.coins.collected + full.coins.missed + (full.coins.active ? 1 : 0)).toBeLessThanOrEqual(10);
  });
});
