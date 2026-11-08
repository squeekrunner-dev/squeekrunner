/** Balance and timing live here; texture names live in game/textures.ts. */
export const CONFIG = {
  width: 960,
  height: 540,
  groundY: 416,
  playerX: 156,
  gravity: 1800,
  jumpVelocity: -630,
  airJumpVelocity: -550,
  maxJumps: 2,
  jumpBufferMs: 120,
  coyoteMs: 90,
  maxFrameSeconds: 0.05,
  hitboxes: {
    player: { width: 42, height: 44, offsetX: 13, offsetY: 12, textureWidth: 64, textureHeight: 56 },
    obstacle: { width: 48, height: 64, offsetX: 4, offsetY: 4, textureWidth: 56, textureHeight: 68 },
    nut: { radius: 16, offsetX: 2, offsetY: 3, textureWidth: 36, textureHeight: 38 },
  },
  pixelsPerMetre: 24,
  pointsPerMetre: 10,
  speed: {
    base: 290,
    maximumBase: 400,
    rampDistance: 1800,
    peakRpm: 98.316,
    maximumMultiplier: 2.7,
    smoothingSeconds: 1.4,
  },
  obstacles: {
    firstDelaySeconds: 2.4,
    initialGapSeconds: 1.9,
    minimumGapSeconds: 1.15,
    randomGapSeconds: 0.5,
    rampDistance: 1400,
    minHeight: 38,
    maxHeight: 68,
    minWidth: 30,
    maxWidth: 56,
    spawnMargin: 48,
  },
  /** Double jumps are a budget (sim squeek-4): a run starts with `start`; every golden nut adds `perNut`. */
  doubleJumps: { start: 20, perNut: 5 },
  bonus: {
    points: 150,
    /** The shield lasts until it absorbs one hit; a second nut does not stack shields. */
    shieldInvulnerabilityMs: 550,
    floatHeight: 54,
    noticeMs: 2600,
  },
  /**
   * Whitelist coins (sim squeek-3): exactly `count` coins, one per equal segment of the first
   * 10,000 m (= 100,000 distance points). Coin centre sits `heightAboveGround` px above the track:
   * a single jump tops out near 110 px (hitbox top ≈ 154 px), a well-timed double jump near
   * 194 px (top ≈ 238 px), so only the double jump can collect them.
   */
  coins: {
    count: 10,
    firstMetres: 400,
    lastMetres: 9800,
    segmentMarginMetres: 60,
    heightAboveGround: 200,
    radius: 18,
  },
  telemetry: {
    url: 'https://api.squeekchain.com/v1/status',
    pollMs: 1500,
    timeoutMs: 8000,
    maxReadAgeMs: 12000,
    maxMeasurementAgeMs: 120000,
    futureToleranceMs: 5000,
    maxBackoffMs: 60000,
  },
  demo: {
    tickMs: 250,
    cycleMs: 26000,
    idleMs: 6000,
    blockIntervalMs: 16000,
    initialHeight: 1000n,
  },
  records: { maxBlocks: 100, key: 'squeekrunner.records.v1' },
} as const;
