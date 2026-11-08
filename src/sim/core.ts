import { CONFIG } from '../config';

/** Changing rules, constants or operation order requires a new sim version. */
export const SIM_VERSION = 'squeek-1';
export const TICK_HZ = 60;
export const UNIT = 1000; // milli-pixels; velocities are milli-pixels / second
export const MAX_TICKS = 30 * 60 * TICK_HZ;
// round((1 - exp(-1 / (60 * 1.4))) * 1e6), evaluated offline, never at runtime.
export const SPEED_ALPHA = 11834;
export const HITBOX = CONFIG.hitboxes;

export interface Obstacle { id: number; kind: number; x: number; width: number; height: number }
export interface Nut { id: number; x: number }
export interface SimState {
  tick: number; rng: number; nextId: number;
  player: { y: number; vy: number; jumps: number; lastGrounded: number; queuedAt: number | null };
  obstacles: Obstacle[]; nut: Nut | null;
  rpmMilli: number | null; speed: number; travel: number; score: number;
  bonus: number; spawnAt: number; shieldUntil: number; invulnerableUntil: number;
  gameOver: boolean; endReason: 'collision' | 'limit' | null;
}
export interface TickInput {
  jump?: boolean;
  rpmMilli?: number | null;
  nut?: boolean;
  /** Chain installation/height reset: clear an outstanding nut before any new spawn. */
  resetNut?: boolean;
}
export type SimEvent = 'jump' | 'airJump' | 'nut' | 'collect' | 'shieldHit' | 'gameOver';
export interface Rect { left: number; top: number; right: number; bottom: number }

export function createSim(seed: number): SimState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be uint32');
  return {
    tick: 0, rng: seed, nextId: 1,
    player: { y: CONFIG.groundY * UNIT, vy: 0, jumps: 0, lastGrounded: 0, queuedAt: null },
    obstacles: [], nut: null, rpmMilli: null, speed: CONFIG.speed.base * UNIT,
    travel: 0, score: 0, bonus: 0, spawnAt: Math.ceil(CONFIG.obstacles.firstDelaySeconds * TICK_HZ),
    shieldUntil: 0, invulnerableUntil: 0, gameOver: false, endReason: null,
  };
}

/** Mulberry32; uint32 wrap and imul have specified ECMAScript integer semantics. */
function random(s: SimState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

function range(s: SimState, min: number, max: number): number {
  return min + Math.floor(random(s) * (max - min + 1) / 0x100000000);
}

export function distance(s: SimState): number { return s.travel / (UNIT * CONFIG.pixelsPerMetre); }

export function playerRect(s: SimState): Rect {
  const h = HITBOX.player;
  const left = (CONFIG.playerX - h.textureWidth / 2 + h.offsetX) * UNIT;
  const top = s.player.y + (h.offsetY - h.textureHeight) * UNIT;
  return { left, top, right: left + h.width * UNIT, bottom: top + h.height * UNIT };
}

export function obstacleRect(o: Obstacle): Rect {
  const h = HITBOX.obstacle;
  const left = o.x - o.width * UNIT / 2 + Math.trunc(h.offsetX * o.width * UNIT / h.textureWidth);
  const top = (CONFIG.groundY - o.height) * UNIT + Math.trunc(h.offsetY * o.height * UNIT / h.textureHeight);
  return { left, top, right: left + Math.trunc(h.width * o.width * UNIT / h.textureWidth),
    bottom: top + Math.trunc(h.height * o.height * UNIT / h.textureHeight) };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function catchesNut(player: Rect, nut: Nut): boolean {
  const y = (CONFIG.groundY - CONFIG.bonus.floatHeight) * UNIT;
  const dx = nut.x - Math.max(player.left, Math.min(player.right, nut.x));
  const dy = y - Math.max(player.top, Math.min(player.bottom, y));
  const r = HITBOX.nut.radius * UNIT;
  return dx * dx + dy * dy <= r * r;
}

function jump(s: SimState, events: SimEvent[]): void {
  const p = s.player;
  if (p.queuedAt === null) return;
  if ((s.tick - p.queuedAt) * 1000 > CONFIG.jumpBufferMs * TICK_HZ) { p.queuedAt = null; return; }
  if (p.jumps === 0 && (s.tick - p.lastGrounded) * 1000 > CONFIG.coyoteMs * TICK_HZ) p.jumps = 1;
  if (p.jumps >= CONFIG.maxJumps) return;
  events.push(p.jumps === 0 ? 'jump' : 'airJump');
  p.vy = (p.jumps === 0 ? CONFIG.jumpVelocity : CONFIG.airJumpVelocity) * UNIT;
  p.jumps++;
  p.queuedAt = null;
}

/** Mutates one state by exactly one tick. Trusted inputs: validate untrusted replays first. */
export function step(s: SimState, input: TickInput = {}): SimEvent[] {
  const events: SimEvent[] = [];
  if (s.gameOver) return events;
  if (input.rpmMilli !== undefined) s.rpmMilli = input.rpmMilli;
  if (input.resetNut) s.nut = null;
  if (input.nut) { s.nut = { id: s.nextId++, x: (CONFIG.width + 24) * UNIT }; events.push('nut'); }

  const ramp = CONFIG.speed.rampDistance * CONFIG.pixelsPerMetre * UNIT;
  const base = CONFIG.speed.base * UNIT + Math.trunc(
    Math.min(s.travel, ramp) * (CONFIG.speed.maximumBase - CONFIG.speed.base) * UNIT / ramp);
  const peak = Math.round(CONFIG.speed.peakRpm * 1000);
  const multiplier = 1000000 + Math.trunc(Math.min(peak, Math.max(0, s.rpmMilli ?? 0)) *
    Math.round((CONFIG.speed.maximumMultiplier - 1) * 1000000) / peak);
  const target = Math.trunc(base * multiplier / 1000000);
  s.speed += Math.trunc((target - s.speed) * SPEED_ALPHA / 1000000);
  const movement = Math.trunc(s.speed / TICK_HZ);
  s.travel += movement;

  const p = s.player;
  if (p.y === CONFIG.groundY * UNIT && p.vy >= 0) { p.jumps = 0; p.lastGrounded = s.tick; }
  if (input.jump) p.queuedAt = s.tick;
  jump(s, events);
  p.vy += CONFIG.gravity * UNIT / TICK_HZ;
  p.y += Math.trunc(p.vy / TICK_HZ);
  if (p.y < HITBOX.player.height * UNIT) { p.y = HITBOX.player.height * UNIT; p.vy = 0; }
  if (p.y >= CONFIG.groundY * UNIT) {
    p.y = CONFIG.groundY * UNIT; p.vy = 0; p.jumps = 0; p.lastGrounded = s.tick;
    jump(s, events); // buffered input on the landing tick
  }

  if (s.tick + 1 >= s.spawnAt) {
    s.obstacles.push({ id: s.nextId++, kind: range(s, 0, 2), x: (CONFIG.width + CONFIG.obstacles.spawnMargin) * UNIT,
      width: range(s, CONFIG.obstacles.minWidth, CONFIG.obstacles.maxWidth),
      height: range(s, CONFIG.obstacles.minHeight, CONFIG.obstacles.maxHeight) });
    const obstacleRamp = CONFIG.obstacles.rampDistance * CONFIG.pixelsPerMetre * UNIT;
    const gapMs = Math.round(CONFIG.obstacles.initialGapSeconds * 1000) - Math.trunc(
      Math.min(s.travel, obstacleRamp) * Math.round((CONFIG.obstacles.initialGapSeconds - CONFIG.obstacles.minimumGapSeconds) * 1000) / obstacleRamp)
      + range(s, 0, Math.round(CONFIG.obstacles.randomGapSeconds * 1000));
    s.spawnAt = s.tick + 1 + Math.ceil(gapMs * TICK_HZ / 1000);
  }
  for (const obstacle of s.obstacles) obstacle.x -= movement;
  if (s.nut) s.nut.x -= movement;

  // Obstacles precede collectibles, like the old Arcade collider registration order.
  const rect = playerRect(s);
  s.obstacles = s.obstacles.filter(o => {
    if (o.x < -80 * UNIT) return false;
    if (!s.gameOver && overlaps(rect, obstacleRect(o))) {
      if (s.shieldUntil > s.tick || s.invulnerableUntil > s.tick) {
        s.shieldUntil = 0;
        s.invulnerableUntil = s.tick + Math.ceil(CONFIG.bonus.shieldInvulnerabilityMs * TICK_HZ / 1000);
        events.push('shieldHit');
        return false;
      }
      s.gameOver = true; s.endReason = 'collision';
    }
    return true;
  });
  if (!s.gameOver && s.nut && catchesNut(rect, s.nut)) {
    s.nut = null; s.bonus += CONFIG.bonus.points;
    s.shieldUntil = s.tick + CONFIG.bonus.shieldSeconds * TICK_HZ;
    events.push('collect');
  }
  if (s.nut && s.nut.x < -80 * UNIT) s.nut = null;
  s.score = Math.floor(s.travel * CONFIG.pointsPerMetre / (UNIT * CONFIG.pixelsPerMetre)) + s.bonus;
  s.tick++;
  if (!s.gameOver && s.tick >= MAX_TICKS) { s.gameOver = true; s.endReason = 'limit'; }
  if (s.gameOver) events.push('gameOver');
  return events;
}

/** Non-cryptographic golden-test fingerprint, never an authentication mechanism. */
export function stateHash(state: SimState): string {
  let h = 0x811c9dc5;
  const text = JSON.stringify(state);
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
