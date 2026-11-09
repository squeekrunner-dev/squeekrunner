import Phaser from 'phaser';
import { CONFIG } from '../../config';
import { TEXTURES } from '../textures';
import { label } from '../ui';
import { crossedMilestones, dustProfile } from './profile';

interface Particle {
  image: Phaser.GameObjects.Image;
  life: number;
  duration: number;
  vx: number;
  vy: number;
  gravity: number;
  alpha: number;
  /** Starting scale and how much it grows by the end of life (dust puffs expand as they fade). */
  scale?: number;
  grow?: number;
}

/** Bounded, presentation-only pools. No simulation object or RNG is passed to this class. */
export class RunFx {
  private readonly dustPool: Particle[];
  private readonly sparks: Particle[];
  private readonly ghosts: Particle[];
  private readonly lines: Phaser.GameObjects.Image[];
  private readonly vignette: Phaser.GameObjects.Image;
  private readonly flash: Phaser.GameObjects.Rectangle;
  private readonly nutGlow: Phaser.GameObjects.Image;
  private readonly coinGlow: Phaser.GameObjects.Image;
  private readonly milestone: Phaser.GameObjects.Text;
  private readonly media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  private dustIn = 0;
  private dustRemainder = 0;
  private trailLeft = 0;
  private trailIn = 0;
  private blockLeft = 0;
  private shakeIn = 0;
  private score = 0;
  private milestoneLeft = 0;
  private pendingMilestones: number[] = [];
  private clock = 0;
  /** 0..1 beyond full strength (fullRpm → overdriveRpm). Set by the scene each frame. */
  overdrive = 0;
  private unstoppable = false;
  private readonly aura: Phaser.GameObjects.Image;

  constructor(private readonly scene: Phaser.Scene, private readonly wheelGlow: Phaser.GameObjects.Graphics) {
    this.dustPool = this.pool(CONFIG.fx.dust.pool, TEXTURES.dust, 4);
    this.sparks = this.pool(CONFIG.fx.sparks.pool, TEXTURES.sparkGold, 7);
    this.ghosts = this.pool(CONFIG.fx.trail.pool, TEXTURES.hamsterJump, 4);
    for (const ghost of this.ghosts) ghost.image.setOrigin(0.5, 1);
    this.lines = Array.from({ length: CONFIG.fx.wind.pool }, () =>
      scene.add.image(0, 0, TEXTURES.speedLine).setDepth(2.5).setVisible(false));
    this.vignette = scene.add.image(0, 0, TEXTURES.vignette).setOrigin(0).setDepth(9).setAlpha(0);
    this.flash = scene.add.rectangle(0, 0, 1, 1, 0xffe8b3).setOrigin(0).setDepth(10).setAlpha(0);
    this.nutGlow = scene.add.image(0, 0, TEXTURES.glowBlue).setDepth(3.8).setVisible(false);
    this.coinGlow = scene.add.image(0, 0, TEXTURES.glowGold).setDepth(3.8).setVisible(false);
    this.aura = scene.add.image(0, 0, TEXTURES.glowGold).setDepth(3.9).setVisible(false);
    this.milestone = label(scene, CONFIG.width / 2, CONFIG.fx.milestones.y, '', CONFIG.fx.milestones.fontSize, '#ffdf96', true)
      .setOrigin(0.5).setDepth(19).setFontStyle('bold').setStroke('#131b27', 5).setVisible(false);
  }

  get reduced(): boolean { return !!this.media?.matches; }

  private pool(count: number, texture: string, depth: number): Particle[] {
    return Array.from({ length: count }, () => ({
      image: this.scene.add.image(0, 0, texture).setDepth(depth).setVisible(false),
      life: 0, duration: 1, vx: 0, vy: 0, gravity: 0, alpha: 1,
    }));
  }

  dust(x: number, y: number, count: number, intensity = 0): void {
    const fx = CONFIG.fx.dust;
    for (const p of this.dustPool) {
      if (count <= 0) break;
      if (p.life > 0) continue;
      count--;
      // Faster wheel: puffs live longer, fly farther back and spread higher, so the trail stretches out.
      p.duration = p.life = (fx.life + intensity * fx.lifeBoost) * (0.65 + Math.random() * 0.35);
      p.vx = -(fx.spread + intensity * fx.spreadBoost) * (0.5 + Math.random());
      p.vy = -Math.random() * (fx.rise + intensity * fx.riseBoost) / p.life;
      p.alpha = 0.7;
      p.scale = fx.scale + Math.random() * fx.scaleRandom + intensity * fx.scaleBoost;
      p.grow = fx.grow * intensity;
      p.image.setPosition(x, y).setScale(p.scale).setAlpha(p.alpha).setVisible(true);
    }
  }

  collect(x: number, y: number, coin: boolean, burst?: number): void {
    const fx = CONFIG.fx.sparks;
    let count: number = burst ?? (coin ? fx.coinCount : fx.nutCount);
    if (this.reduced) count = Math.ceil(count / 2);
    for (const p of this.sparks) {
      if (count <= 0) break;
      if (p.life > 0) continue;
      const angle = Math.random() * Math.PI * 2;
      const speed = fx.speed * (0.4 + Math.random() * 0.6) * (this.reduced ? 0.5 : 1);
      p.duration = p.life = fx.life * (0.7 + Math.random() * 0.3);
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.gravity = fx.gravity;
      p.alpha = 1;
      p.image.setTexture(coin || count % 3 === 0 ? TEXTURES.sparkGold : TEXTURES.sparkBlue)
        .setPosition(x, y).setScale(0.6 + Math.random() * 0.7).setAlpha(1).setVisible(true);
      count--;
    }
  }

  /** ≥80 RPM (sim rule): glowing aura plus a continuous ghost trail until it ends. */
  setUnstoppable(on: boolean): void {
    this.unstoppable = on;
    if (!on) this.aura.setVisible(false);
    this.trailIn = 0;
  }

  /** A crate shattered by an unstoppable hamster. */
  smash(x: number, y: number): void {
    this.dust(x, y, 16, 1);
    this.collect(x, y, true, CONFIG.fx.unstoppable.smashSparks);
  }

  airJump(): void { this.trailLeft = CONFIG.fx.trail.duration; this.trailIn = 0; }
  newBlock(): void { this.blockLeft = CONFIG.fx.block.duration; }

  observeScore(score: number): void {
    this.pendingMilestones.push(...crossedMilestones(this.score, score));
    this.score = Math.max(this.score, score);
  }

  collectibles(nut: Phaser.GameObjects.Sprite | null, coin: Phaser.GameObjects.Image | null): void {
    const fx = CONFIG.fx.glow;
    const pulse = this.reduced ? 0 : Math.sin(this.clock * 1000 / fx.periodMs * Math.PI * 2);
    for (const [sprite, glow, size] of [[nut, this.nutGlow, fx.nutSize], [coin, this.coinGlow, fx.coinSize]] as const) {
      glow.setVisible(!!sprite);
      const od = this.overdrive * (this.reduced ? 0.4 : 1), big = size * (1 + pulse * fx.pulseScale) * (1 + od * CONFIG.fx.overdrive.glowSize);
      if (sprite) glow.setPosition(sprite.x, sprite.y).setDisplaySize(big, big)
        .setAlpha(Math.min(1, (fx.alpha + pulse * fx.pulseAlpha) * (1 + od * CONFIG.fx.overdrive.glow)));
    }
  }

  stopMotion(): void {
    this.scene.cameras.main.shakeEffect.reset();
    this.trailLeft = 0;
    for (const line of this.lines) line.setVisible(false);
    this.vignette.setAlpha(0);
  }

  update(dt: number, intensity: number, speed: number, player: Phaser.GameObjects.Sprite, grounded: boolean, playing: boolean): void {
    const fx = CONFIG.fx, reduced = this.reduced, camera = this.scene.cameras.main;
    this.clock += dt;
    if (reduced && camera.shakeEffect.isRunning) camera.shakeEffect.reset();
    for (const pool of [this.dustPool, this.sparks, this.ghosts]) {
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life = Math.max(0, p.life - dt);
        p.image.x += p.vx * dt;
        p.image.y += p.vy * dt;
        p.vy += p.gravity * dt;
        p.image.setAlpha(p.alpha * p.life / p.duration).setVisible(p.life > 0);
        if (p.grow) p.image.setScale(p.scale! * (1 + p.grow * (1 - p.life / p.duration)));
      }
    }
    if (playing && grounded) {
      this.dustIn -= dt;
      if (this.dustIn <= 0) {
        const profile = dustProfile(intensity), od = this.overdrive;
        this.dustRemainder += profile.count * (1 + od * fx.overdrive.dust);
        const count = Math.floor(this.dustRemainder);
        this.dustRemainder -= count;
        this.dust(player.x - 24, CONFIG.groundY - 3, count, intensity + od * fx.overdrive.dustReach);
        this.dustIn += profile.interval;
      }
    } else this.dustIn = 0;

    const wind = playing ? Math.max(0, (intensity - fx.wind.threshold) / (1 - fx.wind.threshold)) : 0;
    const lineCount = Math.ceil(this.lines.length * wind * (reduced ? fx.wind.reducedFactor : 1));
    this.lines.forEach((line, index) => {
      if (index >= lineCount) { line.setVisible(false); return; }
      if (!line.visible || line.x < camera.scrollX - 100) {
        line.setPosition(camera.scrollX + camera.width + Math.random() * 180, 118 + Math.random() * 260);
      }
      line.setVisible(true).setAlpha(Math.min(1, fx.wind.alpha * wind * (1 + this.overdrive * fx.overdrive.wind)) * (reduced ? fx.wind.reducedFactor : 1))
        .setScale(0.8 + wind, 0.7);
      line.x -= (speed * (fx.wind.speedFactor + index % 4 * 0.2) + fx.wind.extraSpeed) * dt;
    });
    this.vignette.setPosition(camera.scrollX, 0).setDisplaySize(camera.width, CONFIG.height)
      .setAlpha(Math.min(1, wind * fx.vignette.alpha * (1 + this.overdrive * fx.overdrive.vignette)) * (reduced ? fx.vignette.reducedFactor : 1));
    this.shakeIn -= dt;
    if (playing && !reduced && intensity > fx.shake.threshold && this.shakeIn <= 0 && !camera.shakeEffect.isRunning) {
      const base = (intensity - fx.shake.threshold) / (1 - fx.shake.threshold), od = this.overdrive;
      camera.shake(fx.shake.durationMs * (1 + od), fx.shake.intensity * (base + od * fx.overdrive.shake), false);
      this.shakeIn = fx.shake.interval * (1 - od * fx.overdrive.shakeInterval);
    }

    // Unstoppable: pulsing golden aura behind the hamster and a continuous ghost trail.
    const u = fx.unstoppable, on = playing && this.unstoppable;
    this.aura.setVisible(on);
    if (on) {
      const beat = reduced ? 0 : Math.sin(this.clock * 1000 / u.auraPeriodMs * Math.PI * 2);
      const size = u.auraSize * (1 + beat * u.auraPulse) * (1 + this.overdrive * fx.overdrive.glowSize);
      this.aura.setPosition(player.x, player.y - player.displayHeight / 2).setDisplaySize(size, size)
        .setAlpha(Math.min(1, u.auraAlpha * (1 + beat * 0.15)));
    }
    if (playing && !reduced && (on || (!grounded && this.trailLeft > 0))) {
      this.trailIn -= dt;
      if (this.trailIn <= 0) {
        const ghost = this.ghosts.find(p => p.life <= 0);
        if (ghost) {
          ghost.duration = ghost.life = fx.trail.life;
          ghost.vx = -speed * 0.25;
          ghost.alpha = fx.trail.alpha;
          ghost.image.setTexture(player.texture.key, player.frame.name).setPosition(player.x, player.y)
            .setAngle(player.angle).setScale(player.scaleX, player.scaleY).setAlpha(ghost.alpha).setVisible(true);
        }
        this.trailIn = on ? u.trailInterval : fx.trail.interval;
      }
    }
    this.trailLeft = Math.max(0, this.trailLeft - dt);
    this.blockLeft = Math.max(0, this.blockLeft - dt);
    const pulse = Math.sin(this.blockLeft / fx.block.duration * Math.PI) * (reduced ? fx.block.reducedFactor : 1);
    this.flash.setPosition(camera.scrollX, 0).setSize(camera.width, CONFIG.height).setAlpha(pulse * fx.block.flashAlpha);
    this.wheelGlow.setScale(1 + pulse * (fx.block.hubScale - 1));

    if (this.milestoneLeft <= 0 && this.pendingMilestones.length) {
      const score = this.pendingMilestones.shift()!;
      const caption = score === 50000 ? 'HALFWAY TO WHITELIST' : score === 100000 ? 'WHITELIST SCORE!' : '';
      this.milestone.setText(`${score.toLocaleString('en-US')}!${caption ? `\n${caption}` : ''}`).setVisible(true);
      this.milestoneLeft = fx.milestones.duration;
    }
    this.milestoneLeft = Math.max(0, this.milestoneLeft - dt);
    const age = fx.milestones.duration - this.milestoneLeft;
    const alpha = Math.min(1, age / fx.milestones.fade, this.milestoneLeft / fx.milestones.fade);
    this.milestone.setAlpha(alpha).setVisible(this.milestoneLeft > 0)
      .setScale(reduced ? 1 : 0.94 + 0.06 * Math.min(1, age / fx.milestones.fade));
  }
}
