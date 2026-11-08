import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { CHUNK_TICKS, COIN_REACH, coinSegmentStart, createSim, localChunkSeed, step, UNIT, type SimEvent, type SimState, type TickInput } from './core';

const metres = (milli: number): number => milli / (CONFIG.pixelsPerMetre * UNIT);
const segment = Math.floor((CONFIG.coins.lastMetres - CONFIG.coins.firstMetres) / CONFIG.coins.count);

/** A clean sim with no obstacles and one coin placed `ahead` metres in front of the player. */
function arena(aheadMetres: number): SimState {
  const s = createSim(7);
  s.spawnAt = Number.MAX_SAFE_INTEGER; // no obstacles: test only the jump reach
  s.coins.next = CONFIG.coins.count;   // no further placements
  s.coins.pending = aheadMetres * CONFIG.pixelsPerMetre * UNIT;
  return s;
}
function run(s: SimState, jumps: number[], ticks = 600): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < ticks && !s.gameOver; t++) events.push(...step(s, { jump: jumps.includes(t) }));
  return events;
}
/** Places every coin by teleporting to each segment's reach point; returns positions in metres. */
function placements(seed: number, chunkSeed?: (tick: number) => number | undefined): number[] {
  const s = createSim(seed); s.spawnAt = Number.MAX_SAFE_INTEGER;
  const out: number[] = [];
  for (let i = 0; i < CONFIG.coins.count; i++) {
    s.travel = coinSegmentStart(i) - COIN_REACH;
    const input: TickInput = {}; const c = chunkSeed?.(s.tick); if (c !== undefined) input.chunkSeed = c;
    step(s, input);
    expect(s.coins.next).toBe(i + 1);
    out.push(metres(s.coins.pending!));
    s.coins.pending = null; s.coins.active = null;
  }
  return out;
}

describe('whitelist coins', () => {
  it('places exactly 10 coins, one per segment of the first 10,000 m', () => {
    for (const seed of [0, 1, 42, 0xffffffff]) {
      const m = placements(seed);
      expect(m).toHaveLength(10);
      m.forEach((x, i) => {
        expect(x).toBeGreaterThanOrEqual(CONFIG.coins.firstMetres + i * segment + CONFIG.coins.segmentMarginMetres);
        expect(x).toBeLessThanOrEqual(CONFIG.coins.firstMetres + (i + 1) * segment - CONFIG.coins.segmentMarginMetres);
      });
      expect(placements(seed)).toEqual(m);
      expect(Math.max(...m)).toBeLessThan(10000); // all inside the first 100,000 distance points
    }
    expect(placements(1)).not.toEqual(placements(2));
  });

  it('coin positions come from the chunk seed, not the run seed', () => {
    const fixed = () => 12345;
    expect(placements(1, fixed)).toEqual(placements(2, fixed));
    expect(placements(1, () => 777)).not.toEqual(placements(1, fixed));
  });

  it('a coin is placed only when its segment comes within reach', () => {
    const s = createSim(5); s.spawnAt = Number.MAX_SAFE_INTEGER;
    s.travel = coinSegmentStart(0) - COIN_REACH - 50 * UNIT * CONFIG.pixelsPerMetre;
    step(s);
    expect(s.coins.next).toBe(0); expect(s.coins.pending).toBeNull();
  });

  it('does not change the obstacle sequence (separate random stream)', () => {
    const a = createSim(99), b = createSim(99);
    b.coins.next = CONFIG.coins.count;
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
    full.travel = 10000 * CONFIG.pixelsPerMetre * UNIT; // past every segment
    for (let t = 0; t < 30; t++) step(full);
    expect(full.coins.next).toBe(CONFIG.coins.count); // never more than ten
    expect(full.coins.collected).toBe(0);
    expect(full.coins.missed + (full.coins.active ? 1 : 0) + (full.coins.pending === null ? 0 : 1)).toBeLessThanOrEqual(10);
  });
});

describe('map chunks', () => {
  type Shape = number[];
  const shapes = (chunk: Shape[]) => chunk;
  /** Obstacles spawned in each chunk (the player is kept invulnerable so the run never ends). */
  function play(seed: number, chunkSeed: (k: number) => number | undefined, ticks: number): Shape[][] {
    const s = createSim(seed), chunks: Shape[][] = [], seen = new Set<number>();
    for (let t = 0; t < ticks; t++) {
      const input: TickInput = {};
      if (t % CHUNK_TICKS === 0) { chunks.push([]); const c = chunkSeed(t / CHUNK_TICKS); if (c !== undefined) input.chunkSeed = c; }
      s.invulnerableUntil = Number.MAX_SAFE_INTEGER;
      step(s, input);
      for (const o of s.obstacles) if (!seen.has(o.id)) { seen.add(o.id); chunks[chunks.length - 1].push([o.kind, o.width, o.height]); }
    }
    return chunks;
  }
  it('omitted chunk seeds equal the local derivation', () => {
    const a = play(11, () => undefined, 1500), b = play(11, k => localChunkSeed(11, k), 1500);
    expect(a.map(shapes)).toEqual(b.map(shapes));
  });
  it('a chunk seed affects only obstacles spawned from that chunk on', () => {
    const a = play(11, k => localChunkSeed(11, k), 1500);
    const b = play(11, k => (k === 2 ? 424242 : localChunkSeed(11, k)), 1500);
    expect(shapes(b[0])).toEqual(shapes(a[0]));
    expect(shapes(b[1])).toEqual(shapes(a[1]));
    expect(JSON.stringify(b.slice(2).map(shapes))).not.toBe(JSON.stringify(a.slice(2).map(shapes)));
  });
  it('rejects a malformed chunk seed', () => {
    for (const bad of [-1, 0.5, 2 ** 32, NaN]) expect(() => step(createSim(1), { chunkSeed: bad })).toThrow();
  });
});
