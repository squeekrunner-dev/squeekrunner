import { CONFIG } from '../config';

/** Changing rules, constants or operation order requires a new sim version. */
export const SIM_VERSION = 'squeek-3';
export const TICK_HZ = 60;
export const UNIT = 1000; // milli-pixels; velocities are milli-pixels / second
export const MAX_TICKS = 30 * 60 * TICK_HZ;
// round((1 - exp(-1 / (60 * 1.4))) * 1e6), evaluated offline, never at runtime.
export const SPEED_ALPHA = 11834;
export const HITBOX = CONFIG.hitboxes;
/**
 * The map is generated in chunks: at the first tick of every chunk the obstacle and coin random
 * streams restart from that chunk's seed. A ranked server reveals each chunk seed shortly before
 * the chunk starts, so a run cannot be precomputed offline from the session seed.
 */
export const CHUNK_TICKS = 300;

export interface Obstacle { id: number; kind: number; x: number; width: number; height: number }
export interface Nut { id: number; x: number }
/** A whitelist coin: `at` is the travel (milli-px) at which the coin is level with the player. */
export interface Coin { id: number; at: number }
/** `next`: index of the next coin to place; `pending`: travel of a placed coin not yet on screen. */
export interface CoinState { next: number; pending: number | null; active: Coin | null; collected: number; missed: number }
export interface SimState {
  seed: number; tick: number; rng: number; coinRng: number; nextId: number;
  player: { y: number; vy: number; jumps: number; lastGrounded: number; queuedAt: number | null };
  obstacles: Obstacle[]; nut: Nut | null; coins: CoinState;
  rpmMilli: number | null; speed: number; travel: number; score: number;
  bonus: number; spawnAt: number; shieldUntil: number; invulnerableUntil: number;
  gameOver: boolean; endReason: 'collision' | 'limit' | null;
}
export interface TickInput {
  jump?: boolean;
  rpmMilli?: number | null;
  /** Seed of the chunk starting at this tick (tick % CHUNK_TICKS === 0). Omitted: derived locally from the run seed. */
  chunkSeed?: number;
  nut?: boolean;
  /** Chain installation/height reset: clear an outstanding nut before any new spawn. */
  resetNut?: boolean;
}
export type SimEvent = 'jump' | 'airJump' | 'nut' | 'collect' | 'shieldHit' | 'coinSpawn' | 'coin' | 'coinMissed' | 'gameOver';
export interface Rect { left: number; top: number; right: number; bottom: number }

export function createSim(seed: number): SimState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be uint32');
  return {
    seed, tick: 0, rng: 0, coinRng: 0, nextId: 1,
    player: { y: CONFIG.groundY * UNIT, vy: 0, jumps: 0, lastGrounded: 0, queuedAt: null },
    obstacles: [], nut: null, coins: { next: 0, pending: null, active: null, collected: 0, missed: 0 },
    rpmMilli: null, speed: CONFIG.speed.base * UNIT,
    travel: 0, score: 0, bonus: 0, spawnAt: Math.ceil(CONFIG.obstacles.firstDelaySeconds * TICK_HZ),
    shieldUntil: 0, invulnerableUntil: 0, gameOver: false, endReason: null,
  };
}

/** Offline/demo chunk seeds; ranked runs receive server seeds instead. */
export function localChunkSeed(seed: number, chunk: number): number {
  return random({ rng: (seed ^ Math.imul(chunk + 1, 0x85ebca6b)) >>> 0 });
}

/**
 * Whitelist coins: one per equal segment of [firstMetres, lastMetres], at a random point inside it.
 * Coin i is placed lazily, when its segment comes within spawn reach, from the current chunk's
 * coin stream (separate from obstacles), so its position is unknown until shortly before.
 */
const COIN_SEGMENT = Math.floor((CONFIG.coins.lastMetres - CONFIG.coins.firstMetres) / CONFIG.coins.count);
export const COIN_REACH = (CONFIG.width + 40 - CONFIG.playerX) * UNIT;
export function coinSegmentStart(i: number): number {
  return (CONFIG.coins.firstMetres + i * COIN_SEGMENT) * CONFIG.pixelsPerMetre * UNIT;
}
function placeCoin(s: SimState, i: number): number {
  const c = CONFIG.coins, holder = { rng: s.coinRng };
  const metres = c.firstMetres + i * COIN_SEGMENT + rangeOf(holder, c.segmentMarginMetres, COIN_SEGMENT - c.segmentMarginMetres);
  s.coinRng = holder.rng;
  return metres * CONFIG.pixelsPerMetre * UNIT;
}

/** Mulberry32; uint32 wrap and imul have specified ECMAScript integer semantics. */
function random(s: { rng: number }): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

function rangeOf(s: { rng: number }, min: number, max: number): number {
  return min + Math.floor(random(s) * (max - min + 1) / 0x100000000);
}
const range = (s: SimState, min: number, max: number): number => rangeOf(s, min, max);

/** Screen x (milli-px) of a coin; it scrolls with the world like obstacles. */
export function coinX(s: SimState, coin: Coin): number { return CONFIG.playerX * UNIT + coin.at - s.travel; }
export const COIN_Y = (CONFIG.groundY - CONFIG.coins.heightAboveGround) * UNIT;

function playerTouches(player: Rect, cx: number, cy: number, radius: number): boolean {
  const dx = cx - Math.max(player.left, Math.min(player.right, cx));
  const dy = cy - Math.max(player.top, Math.min(player.bottom, cy));
  const r = radius * UNIT;
  return dx * dx + dy * dy <= r * r;
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
  if (s.tick % CHUNK_TICKS === 0) {
    const seed = input.chunkSeed ?? localChunkSeed(s.seed, s.tick / CHUNK_TICKS);
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Chunk seed must be uint32');
    s.rng = seed; s.coinRng = (seed ^ 0x9e3779b9) >>> 0;
  }
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

  // Whitelist coins: high enough that only a well-timed double jump reaches them.
  const coins = s.coins;
  if (coins.pending === null && coins.next < CONFIG.coins.count && coinSegmentStart(coins.next) - s.travel <= COIN_REACH) {
    coins.pending = placeCoin(s, coins.next++);
  }
  if (!coins.active && coins.pending !== null && coins.pending - s.travel <= COIN_REACH) {
    coins.active = { id: s.nextId++, at: coins.pending };
    coins.pending = null;
    events.push('coinSpawn');
  }
  if (!s.gameOver && coins.active) {
    const x = coinX(s, coins.active);
    if (playerTouches(rect, x, COIN_Y, CONFIG.coins.radius)) {
      coins.active = null; coins.collected++;
      events.push('coin');
    } else if (x + CONFIG.coins.radius * UNIT < rect.left) {
      coins.active = null; coins.missed++;
      events.push('coinMissed');
    }
  }
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
