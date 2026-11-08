import Phaser from 'phaser';
import { CONFIG } from '../config';
import { BlockDetector } from '../chain/blocks';
import type { ChainSnapshot } from '../chain/types';
import { baseSpeed, obstacleGap, rpmMultiplier, smoothSpeed } from '../logic/speed';
import type { RunBlock } from '../logic/records';
import { onSceneExit } from '../logic/lifecycle';
import type { GameContext, RunResult } from './context';
import { COLORS, TEXTURES } from './textures';
import { backdrop, compactHeight, label, pill } from './ui';

type RunState = 'ready' | 'playing' | 'paused' | 'ended';

export class RunScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private obstacles!: Phaser.Physics.Arcade.Group;
  private nuts!: Phaser.Physics.Arcade.Group;
  private ground!: Phaser.GameObjects.TileSprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private shieldRing!: Phaser.GameObjects.Arc;
  private wheel!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private rpmText!: Phaser.GameObjects.Text;
  private heightText!: Phaser.GameObjects.Text;
  private provisionalText!: Phaser.GameObjects.Text;
  private detailText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private notification!: Phaser.GameObjects.Text;
  private speedBar!: Phaser.GameObjects.Rectangle;
  private intro!: Phaser.GameObjects.Container;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private state: RunState = 'ready';
  private detector = new BlockDetector();
  private distance = 0;
  private bonusPoints = 0;
  private speed: number = CONFIG.speed.base;
  private spawnIn: number = CONFIG.obstacles.firstDelaySeconds;
  private elapsed = 0;
  private jumpsUsed = 0;
  private lastGrounded = 0;
  private jumpQueuedAt = -Infinity;
  private shieldUntil = 0;
  private invulnerableUntil = 0;
  private noticeUntil = 0;
  private runBlock: RunBlock | null = null;
  private lastMode = '';
  private dustIn = 0;

  constructor(private readonly context: GameContext) { super('Run'); }

  create(data: { immediate?: boolean } = {}): void {
    this.state = 'ready';
    this.distance = this.bonusPoints = this.elapsed = this.jumpsUsed = this.lastGrounded = 0;
    this.shieldUntil = this.invulnerableUntil = this.noticeUntil = this.dustIn = 0;
    this.jumpQueuedAt = -Infinity;
    this.speed = CONFIG.speed.base;
    this.spawnIn = CONFIG.obstacles.firstDelaySeconds;
    this.runBlock = null;
    this.detector = new BlockDetector();
    this.lastMode = '';
    backdrop(this);
    this.createWheel();
    this.ground = this.add.tileSprite(0, CONFIG.groundY, CONFIG.width, 36, TEXTURES.ground).setOrigin(0);
    this.shadow = this.add.ellipse(CONFIG.playerX, CONFIG.groundY - 1, 58, 9, 0x07140e, 0.45);
    const floor = this.add.rectangle(CONFIG.width / 2, CONFIG.groundY + 14, CONFIG.width, 28, 0, 0);
    this.physics.add.existing(floor, true);
    this.player = this.physics.add.sprite(CONFIG.playerX, CONFIG.groundY, TEXTURES.hamster).setOrigin(0.5, 1);
    this.player.setSize(42, 44).setOffset(13, 12).setDepth(3);
    this.player.setCollideWorldBounds(true);
    this.obstacles = this.physics.add.group({ allowGravity: false, immovable: true });
    this.nuts = this.physics.add.group({ allowGravity: false, immovable: true });
    this.physics.add.collider(this.player, floor);
    this.physics.add.collider(this.player, this.obstacles, (_player, obstacle) => this.hit(obstacle as Phaser.Physics.Arcade.Sprite));
    this.physics.add.overlap(this.player, this.nuts, (_player, nut) => this.collect(nut as Phaser.Physics.Arcade.Sprite));
    this.shieldRing = this.add.circle(CONFIG.playerX, CONFIG.groundY - 28, 39)
      .setStrokeStyle(3, COLORS.gold).setDepth(4).setVisible(false);
    this.createHud();
    this.createIntro();
    this.pauseOverlay = this.add.container(0, 0, [
      this.add.rectangle(480, 270, 960, 540, COLORS.background, 0.85),
      label(this, 480, 225, 'TAKE A BREATHER', 36).setOrigin(0.5),
      label(this, 480, 280, 'SPACE / TAP TO RESUME', 20, '#c4ef6e', true).setOrigin(0.5),
    ]).setDepth(20).setVisible(false);

    const current = this.context.source.read().snapshot;
    if (current) this.onSnapshot(current);
    const unsubscribe = this.context.source.subscribe(snapshot => this.onSnapshot(snapshot));
    const pointer = (): void => this.action();
    const keyboard = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      if (event.code === 'Space' || event.code === 'ArrowUp') this.action();
      if (event.code === 'KeyP' || event.code === 'Escape') this.togglePause();
    };
    const visibility = (): void => {
      if (document.hidden && this.state === 'playing') this.togglePause();
    };
    this.input.on('pointerdown', pointer);
    this.input.keyboard?.addCapture(['SPACE', 'UP']);
    this.input.keyboard?.on('keydown', keyboard);
    document.addEventListener('visibilitychange', visibility);
    onSceneExit(this.events, () => {
      unsubscribe();
      this.input.off('pointerdown', pointer);
      this.input.keyboard?.off('keydown', keyboard);
      document.removeEventListener('visibilitychange', visibility);
    });
    this.physics.pause();
    if (data.immediate) this.begin();
  }

  private createWheel(): void {
    const ring = this.add.graphics({ x: 780, y: 275 });
    ring.lineStyle(2, 0x6d8c78, 0.22).strokeCircle(0, 0, 86).strokeCircle(0, 0, 93);
    this.wheel = this.add.graphics({ x: 780, y: 275 });
    this.wheel.lineStyle(2, 0x6d8c78, 0.22);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      this.wheel.lineBetween(0, 0, Math.cos(angle) * 86, Math.sin(angle) * 86);
    }
  }

  private createHud(): void {
    label(this, 28, 18, 'SQUEEK / RUNNER', 17, '#c4ef6e', true).setFontStyle('bold');
    this.scoreText = label(this, 26, 43, '00000', 49).setFontStyle('bold');
    label(this, 230, 50, 'PERSONAL BEST', 13, '#8b9ba6', true);
    label(this, 230, 71, this.context.records.best.toLocaleString(), 26);
    this.modeText = label(this, 490, 21, '○  NO DATA', 17, '#ec8a79', true).setFontStyle('bold');
    this.rpmText = label(this, 490, 52, '—', 36);
    label(this, 603, 69, 'RPM', 14, '#8b9ba6', true);
    label(this, 932, 20, 'CONFIRMED BLOCK', 13, '#8b9ba6', true).setOrigin(1, 0);
    this.heightText = label(this, 932, 48, '#—', 27, '#ffcf75', true).setOrigin(1, 0);
    this.provisionalText = label(this, 932, 88, '', 12, '#8b9ba6', true).setOrigin(1, 0);
    this.detailText = label(this, 28, 464, '', 18, '#8b9ba6');
    this.speedText = label(this, 28, 493, 'WORLD  1.00×', 16, '#c4ef6e', true);
    this.add.rectangle(213, 502, 166, 5, 0x31403f).setOrigin(0, 0.5);
    this.speedBar = this.add.rectangle(213, 502, 1, 5, COLORS.lime).setOrigin(0, 0.5);
    this.shieldText = label(this, 932, 463, 'DOUBLE JUMP', 17, '#ffcf75', true).setOrigin(1, 0);
    label(this, 932, 495, 'SPACE / ↑ / TAP    ·    P PAUSES', 14, '#8b9ba6', true).setOrigin(1, 0);
    this.notification = label(this, 480, 148, '', 22, '#ffcf75').setOrigin(0.5).setDepth(8);
    if (this.context.source.kind === 'demo') pill(this, 355, 17, 'DEMO', COLORS.gold).setDepth(10);
  }

  private createIntro(): void {
    const bg = this.add.rectangle(480, 267, 620, 265, COLORS.background, 0.94).setStrokeStyle(1, 0x46574c);
    const kicker = label(this, 480, 165, 'A REAL WHEEL. YOUR RUN.', 16, '#c4ef6e', true).setOrigin(0.5);
    const title = label(this, 480, 215, 'SMALL PAWS.\nBIG MOMENTUM.', 40).setOrigin(0.5).setAlign('center').setFontStyle('bold');
    const hint = label(this, 480, 283, 'Jump the crates. Catch a golden nut for a shield.', 18, '#b6c2bc').setOrigin(0.5);
    const button = this.add.rectangle(480, 330, 294, 48, COLORS.lime);
    const call = label(this, 480, 330, 'START RUN  →', 22, '#131b27').setOrigin(0.5).setFontStyle('bold');
    const controls = label(this, 480, 375, 'SPACE / ↑ / TAP   ·   TAP AGAIN IN AIR', 14, '#8b9ba6', true).setOrigin(0.5);
    this.intro = this.add.container(0, 0, [bg, kicker, title, hint, button, call, controls]).setDepth(12);
  }

  private begin(): void {
    this.state = 'playing';
    this.intro.setVisible(false);
    this.physics.resume();
    this.detector = new BlockDetector();
    const current = this.context.source.read();
    // An expired cached response must not seed a new run's block rewards.
    if (current.mode !== 'NO DATA' && current.snapshot) this.onSnapshot(current.snapshot);
  }

  private action(): void {
    if (this.state === 'ready') this.begin();
    else if (this.state === 'paused') this.togglePause();
    else if (this.state === 'playing') { this.jumpQueuedAt = this.elapsed; this.tryJump(); }
  }

  private togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused'; this.physics.pause(); this.pauseOverlay.setVisible(true);
    } else if (this.state === 'paused' && !document.hidden) {
      // The next response may contain growth that happened while hidden.
      this.detector.rebaseNext();
      this.state = 'playing'; this.physics.resume(); this.pauseOverlay.setVisible(false);
    }
  }

  private tryJump(): void {
    if (this.elapsed - this.jumpQueuedAt > CONFIG.jumpBufferMs) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const grounded = body.blocked.down && body.velocity.y >= 0;
    if (grounded) this.jumpsUsed = 0;
    if (!grounded && this.jumpsUsed === 0 && this.elapsed - this.lastGrounded > CONFIG.coyoteMs) this.jumpsUsed = 1;
    if (this.jumpsUsed >= CONFIG.maxJumps) return;
    this.player.setVelocityY(this.jumpsUsed === 0 ? CONFIG.jumpVelocity : CONFIG.airJumpVelocity);
    this.jumpsUsed++;
    this.jumpQueuedAt = -Infinity;
    this.emitDust(this.player.x, this.player.y - 5, 6);
  }

  private onSnapshot(snapshot: ChainSnapshot): void {
    const { bonus, reset } = this.detector.observe(snapshot.installationId, snapshot.confirmedHeight);
    if (reset) {
      this.nuts.clear(true, true);
      this.noticeUntil = 0;
      this.notification.setVisible(false);
    }
    if (this.state !== 'playing') return;
    if (!this.runBlock && snapshot.confirmedHeight !== null) {
      this.runBlock = { installationId: snapshot.installationId, height: snapshot.confirmedHeight };
    }
    if (bonus) {
      this.nuts.clear(true, true);
      const nut = this.nuts.create(CONFIG.width + 24, CONFIG.groundY - CONFIG.bonus.floatHeight, TEXTURES.nut) as Phaser.Physics.Arcade.Sprite;
      nut.setCircle(16, 2, 3).setDepth(4).setVelocityX(-this.speed);
      this.notice(`Squeek block #${compactHeight(bonus.height)}! Golden nut incoming.`);
    }
  }

  private spawnObstacle(): void {
    const obstacle = this.obstacles.create(CONFIG.width + CONFIG.obstacles.spawnMargin, CONFIG.groundY, TEXTURES.obstacle) as Phaser.Physics.Arcade.Sprite;
    obstacle.setOrigin(0.5, 1).setDisplaySize(
      Phaser.Math.Between(CONFIG.obstacles.minWidth, CONFIG.obstacles.maxWidth),
      Phaser.Math.Between(CONFIG.obstacles.minHeight, CONFIG.obstacles.maxHeight),
    );
    obstacle.setSize(48, 64).setOffset(4, 4).setVelocityX(-this.speed).setDepth(2);
    this.spawnIn = obstacleGap(this.distance, Math.random());
  }

  private collect(nut: Phaser.Physics.Arcade.Sprite): void {
    if (this.state !== 'playing' || !nut.active) return;
    nut.destroy();
    this.bonusPoints += CONFIG.bonus.points;
    this.shieldUntil = this.elapsed + CONFIG.bonus.shieldSeconds * 1000;
    this.emitDust(this.player.x, this.player.y - 28, 16);
    this.notice(`GOLDEN NUT  +${CONFIG.bonus.points}  ·  SHIELD ${CONFIG.bonus.shieldSeconds}s`);
  }

  private hit(obstacle: Phaser.Physics.Arcade.Sprite): void {
    if (this.state !== 'playing' || !obstacle.active) return;
    if (this.shieldUntil > this.elapsed || this.invulnerableUntil > this.elapsed) {
      obstacle.destroy();
      this.shieldUntil = 0;
      this.invulnerableUntil = this.elapsed + CONFIG.bonus.shieldInvulnerabilityMs;
      this.player.setVelocityX(0).setX(CONFIG.playerX);
      this.emitDust(this.player.x + 28, this.player.y - 20, 12);
      this.notice('SHIELD SAVED THE RUN!');
      return;
    }
    this.state = 'ended';
    this.physics.pause();
    this.cameras.main.shake(180, 0.006);
    this.player.setTint(COLORS.danger);
    const score = this.score();
    const newBest = score > this.context.records.best;
    this.context.records.save(score, this.runBlock);
    const result: RunResult = {
      score, distance: Math.floor(this.distance), best: this.context.records.best,
      blockBest: this.context.records.bestFor(this.runBlock), runBlock: this.runBlock,
      newBest, demo: this.context.source.kind === 'demo',
    };
    this.time.delayedCall(350, () => this.scene.start('GameOver', result));
  }

  private score(): number { return Math.floor(this.distance * CONFIG.pointsPerMetre) + this.bonusPoints; }

  private notice(message: string): void {
    this.notification.setText(message);
    this.noticeUntil = this.elapsed + CONFIG.bonus.noticeMs;
  }

  private emitDust(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const dust = this.add.image(x, y, TEXTURES.dust).setDepth(5).setAlpha(0.65).setScale(0.5 + Math.random());
      this.tweens.add({ targets: dust, x: x - 20 - Math.random() * 35, y: y - Math.random() * 35,
        alpha: 0, duration: 320 + Math.random() * 180, onComplete: () => dust.destroy() });
    }
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(CONFIG.maxFrameSeconds, delta / 1000);
    const view = this.context.source.read();
    const target = baseSpeed(this.distance) * rpmMultiplier(view.rpm);
    this.modeText.setText(`${view.mode === 'LIVE' ? '●' : '○'}  ${view.mode}`)
      .setColor(view.mode === 'LIVE' ? '#c4ef6e' : view.mode === 'WHEEL IDLE' ? '#81cce4' : '#ec8a79');
    this.rpmText.setText(view.mode === 'NO DATA' ? '—' : view.rpm.toFixed(1));
    this.heightText.setText(`#${compactHeight(view.snapshot?.confirmedHeight ?? null)}`);
    const projected = view.snapshot?.projectedHeight;
    this.provisionalText.setText(view.snapshot?.confirmedHeight === null || !view.snapshot
      ? 'awaiting confirmed height'
      : view.mode === 'NO DATA' ? 'last known confirmed height'
        : projected !== null && projected !== undefined && projected !== view.snapshot.confirmedHeight
          ? `provisional #${compactHeight(projected)}` : this.context.source.kind === 'demo' ? 'DEMO · SIMULATED' : 'SEPOLIA · SETTLED');
    this.detailText.setText(view.reason);
    if (this.lastMode !== view.mode) {
      const accessibleStatus = document.getElementById('status');
      if (accessibleStatus) accessibleStatus.textContent = `${this.context.source.kind === 'demo' ? 'Demo. ' : ''}${view.mode}. ${view.reason}`;
      this.lastMode = view.mode;
    }
    if (this.state !== 'playing') return;
    this.elapsed += dt * 1000;
    this.speed = smoothSpeed(this.speed, target, dt);
    this.distance += this.speed * dt / CONFIG.pixelsPerMetre;
    this.ground.tilePositionX += this.speed * dt;
    this.wheel.rotation += view.rpm / 60 * Math.PI * 2 * dt;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) this.spawnObstacle();
    for (const group of [this.obstacles, this.nuts]) {
      for (const child of [...group.getChildren()]) {
        const sprite = child as Phaser.Physics.Arcade.Sprite;
        sprite.setVelocityX(-this.speed);
        if (sprite.x < -80) sprite.destroy();
      }
    }
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    this.player.setX(CONFIG.playerX).setVelocityX(0);
    if (body.blocked.down && body.velocity.y >= 0) {
      this.jumpsUsed = 0;
      this.lastGrounded = this.elapsed;
      this.dustIn -= dt;
      if (this.dustIn <= 0) { this.emitDust(this.player.x - 25, CONFIG.groundY - 3, 1); this.dustIn = 0.12; }
    }
    this.tryJump();
    this.player.setAngle(body.blocked.down ? Math.sin(this.elapsed / 55) * 3 : -8 + this.jumpsUsed * 3);
    this.shadow.setScale(Math.max(0.3, 1 - (CONFIG.groundY - this.player.y) / 300));
    this.shieldRing.setPosition(this.player.x, this.player.y - 28).setVisible(this.shieldUntil > this.elapsed);
    this.shieldText.setText(this.shieldUntil > this.elapsed
      ? `SHIELD  ${Math.ceil((this.shieldUntil - this.elapsed) / 1000)}s` : `${CONFIG.maxJumps - this.jumpsUsed} JUMPS READY`);
    this.scoreText.setText(this.score().toString().padStart(5, '0'));
    this.speedText.setText(`WORLD  ${(this.speed / baseSpeed(this.distance)).toFixed(2)}×`);
    this.speedBar.width = 166 * Math.max(0.06, (this.speed / baseSpeed(this.distance) - 1) / (CONFIG.speed.maximumMultiplier - 1));
    this.notification.setVisible(this.noticeUntil > this.elapsed);
  }
}
