import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createSim, distance, HITBOX, MAX_TICKS, obstacleRect, playerRect, SPEED_ALPHA, step, TICK_HZ, UNIT, type SimEvent, type SimState } from './core';

const obstacle = (s: SimState, x = CONFIG.playerX): void => {
  s.obstacles.push({ id: s.nextId++, kind: 0, x: x * UNIT, width: 56, height: 68 });
};

describe('fixed-step rules', () => {
  it('retains the texture hitboxes and configured balance', () => {
    const s = createSim(0);
    expect(TICK_HZ).toBe(60);
    expect(HITBOX).toBe(CONFIG.hitboxes);
    expect(SPEED_ALPHA).toBe(Math.round((1 - Math.exp(-1 / (TICK_HZ * CONFIG.speed.smoothingSeconds))) * 1000000));
    expect(playerRect(s)).toEqual({ left: 137000, top: 372000, right: 179000, bottom: 416000 });
    obstacle(s);
    expect(obstacleRect(s.obstacles[0])).toEqual({ left: 132000, top: 352000, right: 180000, bottom: 416000 });
    expect(HITBOX.nut).toMatchObject({ radius: 16, offsetX: 2, offsetY: 3 });
    expect(s.speed).toBe(CONFIG.speed.base * UNIT);
    expect(s.spawnAt).toBe(CONFIG.obstacles.firstDelaySeconds * TICK_HZ);
  });
  it('double jumps, refuses a third jump, and restores both on landing', () => {
    const s = createSim(4);
    expect(step(s, { jump: true })).toContain('jump');
    expect(s.player.vy).toBe((CONFIG.jumpVelocity + CONFIG.gravity / TICK_HZ) * UNIT);
    expect(step(s, { jump: true })).toContain('airJump');
    expect(s.player.vy).toBe((CONFIG.airJumpVelocity + CONFIG.gravity / TICK_HZ) * UNIT);
    expect(step(s, { jump: true })).not.toContain('airJump');
    expect(s.player.jumps).toBe(2);
    for (let i = 0; i < 100; i++) step(s);
    expect(s.player.jumps).toBe(0);
    expect(s.player.y).toBe(CONFIG.groundY * UNIT);
  });
  it('allows coyote jump through 90ms but consumes the first jump afterwards', () => {
    for (const [tick, event] of [[5, 'jump'], [6, 'airJump']] as const) {
      const s = createSim(0);
      s.tick = tick; s.player.y -= 10000;
      expect(step(s, { jump: true })).toContain(event);
    }
  });
  it('consumes a buffered third input on landing and expires an old input', () => {
    for (const [age, jumps] of [[7, 1], [8, 0]]) {
      const s = createSim(0);
      s.tick = 10; s.player.y -= 1000; s.player.vy = 60000;
      s.player.jumps = 2; s.player.queuedAt = 10 - age;
      step(s);
      expect(s.player.jumps).toBe(jumps);
      expect(s.player.queuedAt).toBeNull();
    }
  });
  it('ends on an unshielded obstacle; subsequent ticks are inert', () => {
    const s = createSim(0); obstacle(s);
    expect(step(s)).toContain('gameOver');
    const final = JSON.stringify(s);
    expect(s.endReason).toBe('collision');
    expect(step(s, { jump: true })).toEqual([]);
    expect(JSON.stringify(s)).toBe(final);
  });
  it('collects a circular nut for points, +5 double jumps and a one-hit shield held until a hit', () => {
    const s = createSim(0);
    s.nut = { id: s.nextId++, x: CONFIG.playerX * UNIT };
    expect(step(s)).toContain('collect');
    expect(s.bonus).toBe(CONFIG.bonus.points);
    expect(s.shield).toBe(true);
    expect(s.airJumps).toBe(CONFIG.doubleJumps.start + CONFIG.doubleJumps.perNut);
    expect(s.score).toBe(Math.floor(distance(s) * CONFIG.pointsPerMetre) + CONFIG.bonus.points);
    obstacle(s);
    expect(step(s)).toContain('shieldHit');
    expect(s.obstacles).toHaveLength(0);
    expect(s.gameOver).toBe(false);
    expect(s.shield).toBe(false);
    expect(s.invulnerableUntil).toBe(1 + CONFIG.bonus.shieldInvulnerabilityMs * TICK_HZ / 1000);
    obstacle(s); expect(step(s)).toContain('shieldHit');
    s.tick = s.invulnerableUntil; obstacle(s);
    expect(step(s)).toContain('gameOver');
  });
  it('squeek-5: at >= 80 RPM the hamster smashes crates without spending a shield (hysteresis to 78)', () => {
    const { onRpmMilli, offRpmMilli } = CONFIG.unstoppable;
    const s = createSim(0); s.spawnAt = Number.MAX_SAFE_INTEGER;
    expect(step(s, { rpmMilli: onRpmMilli - 1 })).not.toContain('unstoppable');
    expect(s.unstoppable).toBe(false);
    expect(step(s, { rpmMilli: onRpmMilli })).toContain('unstoppable');
    s.shield = true; obstacle(s);
    const events = step(s);
    expect(events).toContain('smash');
    expect(events).not.toContain('shieldHit');
    expect(s.gameOver).toBe(false);
    expect(s.shield).toBe(true);                  // the shield is kept for later
    expect(s.obstacles).toHaveLength(0);
    expect(step(s, { rpmMilli: offRpmMilli })).not.toContain('unstoppableEnd'); // still on at 78.000
    expect(s.unstoppable).toBe(true);
    expect(step(s, { rpmMilli: offRpmMilli - 1 })).toContain('unstoppableEnd');
    s.shield = false; obstacle(s);
    expect(step(s)).toContain('gameOver');      // back to normal rules
  });
  it('squeek-5: no data or a stopped wheel never makes the hamster unstoppable', () => {
    const s = createSim(0);
    for (const rpmMilli of [null, 0, 79999]) { step(s, { rpmMilli }); expect(s.unstoppable).toBe(false); }
  });
  it('does not treat a circle bounding-box corner as a nut collision', () => {
    const s = createSim(0);
    s.nut = { id: 1, x: 127000 }; // after movement: dx ~15px, dy 10px -> outside radius 16
    expect(step(s)).not.toContain('collect');
    expect(s.bonus).toBe(0);
  });
  it('keeps the shield with no time limit, and a second nut does not stack it', () => {
    const s = createSim(0); s.spawnAt = Number.MAX_SAFE_INTEGER;
    s.nut = { id: s.nextId++, x: CONFIG.playerX * UNIT }; step(s);
    for (let i = 0; i < 60 * 120; i++) step(s);   // two minutes later
    expect(s.shield).toBe(true);
    s.nut = { id: s.nextId++, x: CONFIG.playerX * UNIT }; step(s);
    expect(s.shield).toBe(true);
    expect(s.airJumps).toBe(CONFIG.doubleJumps.start + 2 * CONFIG.doubleJumps.perNut);
    obstacle(s); expect(step(s)).toContain('shieldHit');
    expect(s.shield).toBe(false);                    // one hit removes the only shield
    s.tick = s.invulnerableUntil; obstacle(s);
    expect(step(s)).toContain('gameOver');
  });
  it('spends a double jump per air jump; with none left only single jumps work', () => {
    const s = createSim(0); s.spawnAt = Number.MAX_SAFE_INTEGER; s.airJumps = 2;
    const doubleJump = (): SimEvent[] => {
      const events: SimEvent[] = [];
      events.push(...step(s, { jump: true }));
      for (let i = 0; i < 20; i++) events.push(...step(s));
      events.push(...step(s, { jump: true }));
      for (let i = 0; i < 120 && !(s.player.y === CONFIG.groundY * UNIT && s.player.vy === 0 && i > 5); i++) events.push(...step(s));
      return events;
    };
    expect(doubleJump()).toEqual(expect.arrayContaining(['jump', 'airJump']));
    expect(s.airJumps).toBe(1);
    expect(doubleJump()).toContain('airJump');
    expect(s.airJumps).toBe(0);
    const third = doubleJump();
    expect(third).toContain('jump');
    expect(third).not.toContain('airJump');
    expect(s.airJumps).toBe(0);
  });
  it('clears an old nut on reset and replaces it on another block', () => {
    const s = createSim(0);
    step(s, { nut: true }); const first = s.nut?.id;
    step(s, { nut: true }); expect(s.nut?.id).not.toBe(first);
    step(s, { resetNut: true }); expect(s.nut).toBeNull();
    step(s, { resetNut: true, nut: true }); expect(s.nut).not.toBeNull();
  });
  it('falls smoothly toward baseline on NO DATA and caps excessive RPM', () => {
    const a = createSim(3), b = createSim(3);
    for (let i = 0; i < 120; i++) {
      step(a, { rpmMilli: 98316 }); step(b, { rpmMilli: 1000000 });
    }
    expect(a.speed).toBe(b.speed);
    const speed = a.speed;
    step(a, { rpmMilli: null });
    expect(a.speed).toBeLessThan(speed);
    expect(a.speed).toBeGreaterThan(CONFIG.speed.base * UNIT);
    expect(a.rpmMilli).toBeNull();
  });
  it('ends at the replay time limit and uses safe integer state', () => {
    const s = createSim(0); s.tick = MAX_TICKS - 1; s.spawnAt = MAX_TICKS + 1;
    step(s);
    expect(s.gameOver).toBe(true); expect(s.endReason).toBe('limit');
    expect(s.tick).toBe(MAX_TICKS);
  });
  it('accepts all uint32 seeds, including zero, and rejects invalid ones', () => {
    expect(createSim(0xffffffff).seed).toBe(0xffffffff);
    for (const seed of [-1, 0.5, NaN, Infinity, 0x100000000]) expect(() => createSim(seed)).toThrow();
  });
});
