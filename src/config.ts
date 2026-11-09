/** Balance and timing live here; texture names live in game/textures.ts. */
export const CONFIG = {
  /** Presentation only. Never consumed by the deterministic simulation. */
  fx: {
    /** Effects follow the real wheel RPM (not world speed). Full strength at fullRpm (typical hard run);
     *  between fullRpm and overdriveRpm everything ramps far beyond normal (rare peaks, ~never seen). */
    drive: { fullRpm: 70, overdriveRpm: 85, smoothingSeconds: 0.8 },
    overdrive: { dust: 1.6, dustReach: 0.7, wind: 0.8, vignette: 1.4, glow: 0.9, glowSize: 0.45, shake: 7, shakeInterval: 0.5 },
    dust: { pool: 320, intervalSlow: 0.12, intervalFast: 0.035, countSlow: 1, countFast: 5,
      life: 0.48, lifeBoost: 0.85, scale: 0.55, scaleRandom: 0.65, scaleBoost: 0.45, grow: 0.9,
      spread: 65, spreadBoost: 170, rise: 28, riseBoost: 34 },
    wind: { pool: 18, threshold: 0.5, alpha: 0.32, reducedFactor: 0.22, speedFactor: 1.5, extraSpeed: 200 },
    vignette: { alpha: 0.22, reducedFactor: 0.6 },
    shake: { threshold: 0.95, intensity: 0.00045, durationMs: 90, interval: 0.24,
      shieldMs: 120, shieldIntensity: 0.005, hitMs: 220, hitIntensity: 0.009 },
    glow: { nutSize: 100, coinSize: 112, alpha: 0.65, pulseAlpha: 0.12, pulseScale: 0.08, periodMs: 1600 },
    block: { duration: 0.55, flashAlpha: 0.1, hubScale: 2.2, reducedFactor: 0.4 },
    milestones: { scores: [25000, 50000, 100000], duration: 1.4, fade: 0.22, y: 204, fontSize: 32 },
    sparks: { pool: 64, nutCount: 24, coinCount: 32, life: 0.65, speed: 160, gravity: 140 },
    unstoppable: { auraSize: 150, auraAlpha: 0.7, auraPulse: 0.18, auraPeriodMs: 420, smashSparks: 18,
      /** Ghost trail: 3x longer and 3x denser than the double-jump trail. */
      ghostLife: 0.72, trailInterval: 0.012, ghostAlpha: 0.22,
      wings: { appear: 0.35, vanish: 0.45, flapHz: 3.2, flapDeg: 14, scale: 0.34, spreadDeg: 34, glowSize: 46, glowAlpha: 0.75, feathers: 10 },
      comet: { offsetX: 31, offsetY: 28, scale: 0.36, alpha: 0.95, flicker: 0.14, fade: 0.25, sparkInterval: 0.06,
        /** Sonic-boom ripples: copies of the arc that expand forward and fade, one every `every` seconds. */
        ripple: { count: 3, every: 0.16, life: 0.32, grow: 0.9, drift: 10, alpha: 0.55 },
        /** The bow itself is fire: puffs born on a crescent ahead of the snout flow back around it. */
        bow: { pool: 110, rate: 280, radius: 19, stretch: 1.25, spanDeg: 130, life: 0.2, size: 0.34, grow: 0.5,
          flow: 80, alpha: 0.65, waveEvery: 0.2, wavePuffs: 16, waveSpeed: 110 },
        /** Animated comet-head fire: puffs born on a bow in front of the face stream back and cool down. */
        fire: { pool: 90, rate: 120, radius: 16, spreadDeg: 110, life: 0.34, back: 120, size: 0.42, grow: 0.7, alpha: 0.6 } } },
    trail: { pool: 72, duration: 0.3, interval: 0.05, life: 0.24, alpha: 0.25 },
    celebration: { count: 72, reducedCount: 20, durationMs: 1600, staggerMs: 450, spread: 180 },
    haptics: { collectMs: 15, coinMs: 22, shieldMs: 30, hitMs: 45 },
  },
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
  doubleJumps: { start: 15, perNut: 5 },
  /** squeek-6 rule: at ≥ onRpmMilli live wheel RPM crates break on contact; ends below offRpmMilli, but never
   *  before minTicks (3 s) have passed, so a wobbling wheel does not flicker the mode on and off. */
  unstoppable: { onRpmMilli: 70000, offRpmMilli: 66000, minTicks: 180 },
  /** squeek-6: one golden nut per this many projected (pending) Squeek blocks. */
  blocksPerNut: 5,
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
    /** Server collector cadence (one Squeekchain /v1/status read → one timeline point). */
    collectMs: 2500,
    /** A lone 0 RPM right after live RPM is held at the last live value for up to this long. */
    zeroHoldMs: 6000,
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
