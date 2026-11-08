import Phaser from 'phaser';
import { CONFIG } from '../config';
import { BlockDetector } from '../chain/blocks';
import type { ChainSnapshot } from '../chain/types';
import { baseSpeed, obstacleGap, rpmMultiplier, smoothSpeed } from '../logic/speed';
import type { RunBlock } from '../logic/records';
import { onSceneExit } from '../logic/lifecycle';
import { sound } from '../audio/sound';
import type { GameContext, RunResult } from './context';
import { COLORS, TEXTURES } from './textures';
import { backdrop, compactHeight, createMuteButton, label, pill } from './ui';

type RunState = 'ready' | 'playing' | 'paused' | 'ended';

interface SpeedLine {
  sprite: Phaser.GameObjects.Image;
  speedFactor: number;
}

export class RunScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private obstacles!: Phaser.Physics.Arcade.Group;
  private nuts!: Phaser.Physics.Arcade.Group;
  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgMid!: Phaser.GameObjects.TileSprite;
  private ground!: Phaser.GameObjects.TileSprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private shieldSprite!: Phaser.GameObjects.Image;
  private shieldRing!: Phaser.GameObjects.Arc;
  private wheel!: Phaser.GameObjects.Graphics;
  private wheelGlow!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private rpmText!: Phaser.GameObjects.Text;
  private rpmGaugeFill!: Phaser.GameObjects.Rectangle;
  private heightText!: Phaser.GameObjects.Text;
  private provisionalText!: Phaser.GameObjects.Text;
  private detailText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private speedBar!: Phaser.GameObjects.Rectangle;
  private intro!: Phaser.GameObjects.Container;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private noticeContainer!: Phaser.GameObjects.Container;
  private noticeCardText!: Phaser.GameObjects.Text;
  private muteBtn!: { container: Phaser.GameObjects.Container; setMuted: (muted: boolean) => void };

  private speedLines: SpeedLine[] = [];
  private dustPool: Phaser.GameObjects.Image[] = [];

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

  constructor(private readonly context: GameContext) {
    super('Run');
  }

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

    // Parallax background layers
    this.bgFar = this.add.tileSprite(0, 80, CONFIG.width, 280, TEXTURES.bgFar).setOrigin(0).setDepth(0);
    this.bgMid = this.add.tileSprite(0, 236, CONFIG.width, 180, TEXTURES.bgMid).setOrigin(0).setDepth(1);

    this.createWheel();

    // Ground running track
    this.ground = this.add.tileSprite(0, CONFIG.groundY, CONFIG.width, 36, TEXTURES.ground).setOrigin(0).setDepth(2);

    // Static floor for Arcade physics
    const floor = this.add.rectangle(CONFIG.width / 2, CONFIG.groundY + 14, CONFIG.width, 28, 0, 0);
    this.physics.add.existing(floor, true);

    // Hamster shadow
    this.shadow = this.add.ellipse(CONFIG.playerX, CONFIG.groundY - 1, 58, 9, 0x07140e, 0.45).setDepth(3);

    // Player sprite
    this.player = this.physics.add.sprite(CONFIG.playerX, CONFIG.groundY, TEXTURES.hamsterRun1).setOrigin(0.5, 1);
    this.player.setSize(42, 44).setOffset(13, 12).setDepth(5);
    this.player.setCollideWorldBounds(true);

    // Obstacles and Collectibles groups
    this.obstacles = this.physics.add.group({ allowGravity: false, immovable: true });
    this.nuts = this.physics.add.group({ allowGravity: false, immovable: true });

    this.physics.add.collider(this.player, floor);
    this.physics.add.collider(this.player, this.obstacles, (_player, obstacle) =>
      this.hit(obstacle as Phaser.Physics.Arcade.Sprite),
    );
    this.physics.add.overlap(this.player, this.nuts, (_player, nut) =>
      this.collect(nut as Phaser.Physics.Arcade.Sprite),
    );

    // Shield visuals: outer forcefield bubble and glowing core ring
    this.shieldSprite = this.add.image(CONFIG.playerX, CONFIG.groundY - 28, TEXTURES.shield)
      .setDepth(6)
      .setScale(0.85)
      .setVisible(false);
    this.shieldRing = this.add.circle(CONFIG.playerX, CONFIG.groundY - 28, 36)
      .setStrokeStyle(2, COLORS.gold, 0.8)
      .setDepth(6)
      .setVisible(false);

    // Speed lines pool (12 pooled images)
    this.speedLines = [];
    for (let i = 0; i < 12; i++) {
      const line = this.add.image(-100, -100, TEXTURES.speedLine).setDepth(7).setAlpha(0).setVisible(false);
      this.speedLines.push({ sprite: line, speedFactor: 1.2 + (i % 4) * 0.35 });
    }

    // Dust particles pool (24 pooled images)
    this.dustPool = [];
    for (let i = 0; i < 24; i++) {
      const d = this.add.image(-50, -50, TEXTURES.dust).setDepth(4).setVisible(false);
      this.dustPool.push(d);
    }

    this.createHud();
    this.createNoticeCard();
    this.createIntro();

    this.pauseOverlay = this.add.container(0, 0, [
      this.add.rectangle(480, 270, 960, 540, COLORS.background, 0.88),
      label(this, 480, 220, 'TAKE A BREATHER', 36, '#ffcf75').setOrigin(0.5).setFontStyle('bold'),
      label(this, 480, 275, 'SPACE / TAP TO RESUME', 20, '#c4ef6e', true).setOrigin(0.5),
    ]).setDepth(30).setVisible(false);

    const current = this.context.source.read().snapshot;
    if (current) this.onSnapshot(current);
    const unsubscribe = this.context.source.subscribe(snapshot => this.onSnapshot(snapshot));

    const pointer = (): void => {
      sound.unlock();
      this.action();
    };

    const keyboard = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      sound.unlock();
      if (event.code === 'Space' || event.code === 'ArrowUp') this.action();
      if (event.code === 'KeyP' || event.code === 'Escape') this.togglePause();
      if (event.code === 'KeyM') this.toggleMute();
    };

    const visibility = (): void => {
      if (document.hidden && this.state === 'playing') this.togglePause();
    };

    this.input.on('pointerdown', pointer);
    this.input.keyboard?.addCapture(['SPACE', 'UP', 'M']);
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

  private toggleMute(): void {
    const isMuted = sound.toggleMute();
    this.muteBtn.setMuted(isMuted);
  }

  private createWheel(): void {
    // Outer ambient wheel ring
    const ring = this.add.graphics({ x: 780, y: 275 }).setDepth(1);
    ring.lineStyle(3, 0x6d8c78, 0.28).strokeCircle(0, 0, 86).strokeCircle(0, 0, 93);
    ring.lineStyle(1, COLORS.gold, 0.18).strokeCircle(0, 0, 90);

    // Glowing hub
    this.wheelGlow = this.add.graphics({ x: 780, y: 275 }).setDepth(1);
    this.wheelGlow.fillStyle(COLORS.amberGlow, 0.15).fillCircle(0, 0, 24);
    this.wheelGlow.fillStyle(0x3e5246, 0.5).fillCircle(0, 0, 14);
    this.wheelGlow.fillStyle(COLORS.gold, 0.8).fillCircle(0, 0, 5);

    // Spinning wheel spokes
    this.wheel = this.add.graphics({ x: 780, y: 275 }).setDepth(1);
    this.wheel.lineStyle(2, 0x7da48c, 0.35);
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      this.wheel.lineBetween(0, 0, Math.cos(angle) * 86, Math.sin(angle) * 86);
    }
  }

  private createHud(): void {
    // Top banner frosted card background
    const hudBar = this.add.graphics().setDepth(14);
    hudBar.fillStyle(0x0f1822, 0.92).fillRect(0, 0, CONFIG.width, 108);
    hudBar.lineStyle(1, 0x223644, 0.9).lineBetween(0, 108, CONFIG.width, 108);

    // Left brand & score
    label(this, 28, 14, 'SQUEEK / RUNNER', 16, '#c4ef6e', true).setFontStyle('bold').setDepth(15);
    this.scoreText = label(this, 26, 38, '00000', 44).setFontStyle('bold').setDepth(15);
    label(this, 205, 46, 'PERSONAL BEST', 12, '#8b9ba6', true).setDepth(15);
    label(this, 205, 66, this.context.records.best.toLocaleString(), 24, '#ffcf75').setDepth(15);

    // Center telemetry
    this.modeText = label(this, 400, 16, '○  NO DATA', 16, '#ec8a79', true).setFontStyle('bold').setDepth(15);
    this.rpmText = label(this, 400, 44, '—', 34).setDepth(15);
    label(this, 510, 60, 'RPM', 13, '#8b9ba6', true).setDepth(15);

    // Mini RPM gauge bar
    this.add.rectangle(400, 88, 130, 4, 0x223644).setOrigin(0, 0.5).setDepth(15);
    this.rpmGaugeFill = this.add.rectangle(400, 88, 1, 4, COLORS.lime).setOrigin(0, 0.5).setDepth(15);

    // Right block info
    label(this, 932, 16, 'CONFIRMED BLOCK', 12, '#8b9ba6', true).setOrigin(1, 0).setDepth(15);
    this.heightText = label(this, 932, 38, '#—', 26, '#ffcf75', true).setOrigin(1, 0).setDepth(15);
    this.provisionalText = label(this, 932, 72, '', 12, '#8b9ba6', true).setOrigin(1, 0).setDepth(15);

    // Mute button
    this.muteBtn = createMuteButton(this, 750, 52, sound.isMuted(), () => this.toggleMute());

    // Bottom status HUD
    this.detailText = label(this, 28, 466, '', 16, '#8b9ba6').setDepth(15);
    this.speedText = label(this, 28, 494, 'WORLD  1.00×', 15, '#c4ef6e', true).setDepth(15);
    this.add.rectangle(205, 502, 166, 5, 0x2b3d3f).setOrigin(0, 0.5).setDepth(15);
    this.speedBar = this.add.rectangle(205, 502, 1, 5, COLORS.lime).setOrigin(0, 0.5).setDepth(15);

    this.shieldText = label(this, 932, 466, 'DOUBLE JUMP', 16, '#ffcf75', true).setOrigin(1, 0).setDepth(15);
    label(this, 932, 495, 'SPACE / ↑ / TAP    ·    P PAUSES    ·    M MUTE', 13, '#8b9ba6', true).setOrigin(1, 0).setDepth(15);

    if (this.context.source.kind === 'demo') {
      pill(this, 305, 14, 'DEMO', COLORS.gold).setDepth(16);
    }
  }

  private createNoticeCard(): void {
    const cardBg = this.add.rectangle(0, 0, 480, 46, 0x1d2f2b, 0.96)
      .setStrokeStyle(2, COLORS.gold)
      .setOrigin(0.5);
    this.noticeCardText = label(this, 0, 0, '', 16, '#ffcf75', true)
      .setOrigin(0.5)
      .setFontStyle('bold');
    this.noticeContainer = this.add.container(480, 146, [cardBg, this.noticeCardText])
      .setDepth(20)
      .setAlpha(0)
      .setScale(0.85);
  }

  private createIntro(): void {
    const bg = this.add.rectangle(480, 267, 620, 275, COLORS.background, 0.95)
      .setStrokeStyle(2, 0x3e5649);
    const kicker = label(this, 480, 160, 'A REAL WHEEL. YOUR RUN.', 16, '#c4ef6e', true).setOrigin(0.5);
    const title = label(this, 480, 212, 'SMALL PAWS.\nBIG MOMENTUM.', 38)
      .setOrigin(0.5)
      .setAlign('center')
      .setFontStyle('bold');
    const hint = label(this, 480, 280, 'Jump over obstacles. Catch golden nuts for a 12s shield.', 17, '#b6c2bc').setOrigin(0.5);

    const button = this.add.rectangle(480, 332, 294, 48, COLORS.lime).setInteractive({ useHandCursor: true });
    const call = label(this, 480, 332, 'START RUN  →', 22, '#131b27').setOrigin(0.5).setFontStyle('bold');
    const controls = label(this, 480, 377, 'SPACE / ↑ / TAP   ·   TAP IN AIR FOR DOUBLE JUMP', 13, '#8b9ba6', true).setOrigin(0.5);

    button.on('pointerover', () => button.setFillStyle(0xd8ffa0));
    button.on('pointerout', () => button.setFillStyle(COLORS.lime));


    this.intro = this.add.container(0, 0, [bg, kicker, title, hint, button, call, controls]).setDepth(22);
  }

  private begin(): void {
    this.state = 'playing';
    this.intro.setVisible(false);
    this.physics.resume();
    this.player.play('hamster-run');
    this.detector = new BlockDetector();
    const current = this.context.source.read();
    if (current.mode !== 'NO DATA' && current.snapshot) this.onSnapshot(current.snapshot);
  }

  private action(): void {
    if (this.state === 'ready') {
      sound.playUiClick();
      this.begin();
    } else if (this.state === 'paused') {
      sound.playUiClick();
      this.togglePause();
    } else if (this.state === 'playing') {
      this.jumpQueuedAt = this.elapsed;
      this.tryJump();
    }
  }

  private togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.physics.pause();
      this.player.anims.pause();
      this.pauseOverlay.setVisible(true);
      sound.playUiClick();
    } else if (this.state === 'paused' && !document.hidden) {
      this.detector.rebaseNext();
      this.state = 'playing';
      this.physics.resume();
      this.player.anims.resume();
      this.pauseOverlay.setVisible(false);
      sound.playUiClick();
    }
  }

  private tryJump(): void {
    if (this.elapsed - this.jumpQueuedAt > CONFIG.jumpBufferMs) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const grounded = body.blocked.down && body.velocity.y >= 0;

    if (grounded) this.jumpsUsed = 0;
    if (!grounded && this.jumpsUsed === 0 && this.elapsed - this.lastGrounded > CONFIG.coyoteMs) {
      this.jumpsUsed = 1;
    }
    if (this.jumpsUsed >= CONFIG.maxJumps) return;

    if (this.jumpsUsed === 0) {
      sound.playJump();
    } else {
      sound.playDoubleJump();
    }

    this.player.setVelocityY(this.jumpsUsed === 0 ? CONFIG.jumpVelocity : CONFIG.airJumpVelocity);
    this.jumpsUsed++;
    this.jumpQueuedAt = -Infinity;
    this.emitDust(this.player.x - 10, this.player.y - 4, 8);
  }

  private onSnapshot(snapshot: ChainSnapshot): void {
    const { bonus, reset } = this.detector.observe(snapshot.installationId, snapshot.confirmedHeight);
    if (reset) {
      this.nuts.clear(true, true);
      this.noticeUntil = 0;
      this.tweens.killTweensOf(this.noticeContainer);
      this.noticeContainer.setAlpha(0);
    }
    if (this.state !== 'playing') return;
    if (!this.runBlock && snapshot.confirmedHeight !== null) {
      this.runBlock = { installationId: snapshot.installationId, height: snapshot.confirmedHeight };
    }
    if (bonus) {
      this.nuts.clear(true, true);
      const nut = this.nuts.create(
        CONFIG.width + 24,
        CONFIG.groundY - CONFIG.bonus.floatHeight,
        TEXTURES.nut,
      ) as Phaser.Physics.Arcade.Sprite;
      nut.setCircle(16, 2, 3).setDepth(4).setVelocityX(-this.speed);
      sound.playNewBlock();
      this.notice(`⚡ SQUEEK BLOCK #${compactHeight(bonus.height)}! GOLDEN NUT INCOMING!`);
    }
  }

  private spawnObstacle(): void {
    const variants = [TEXTURES.obstacleCrate, TEXTURES.obstacleSprocket, TEXTURES.obstacleBattery];
    const textureKey = variants[Math.floor(Math.random() * variants.length)];

    const obstacle = this.obstacles.create(
      CONFIG.width + CONFIG.obstacles.spawnMargin,
      CONFIG.groundY,
      textureKey,
    ) as Phaser.Physics.Arcade.Sprite;

    obstacle.setOrigin(0.5, 1).setDisplaySize(
      Phaser.Math.Between(CONFIG.obstacles.minWidth, CONFIG.obstacles.maxWidth),
      Phaser.Math.Between(CONFIG.obstacles.minHeight, CONFIG.obstacles.maxHeight),
    );
    obstacle.setSize(48, 64).setOffset(4, 4).setVelocityX(-this.speed).setDepth(3);
    this.spawnIn = obstacleGap(this.distance, Math.random());
  }

  private collect(nut: Phaser.Physics.Arcade.Sprite): void {
    if (this.state !== 'playing' || !nut.active) return;
    nut.destroy();
    this.bonusPoints += CONFIG.bonus.points;
    this.shieldUntil = this.elapsed + CONFIG.bonus.shieldSeconds * 1000;
    sound.playCollectNut();
    this.emitDust(this.player.x, this.player.y - 28, 18);
    this.notice(`GOLDEN NUT  +${CONFIG.bonus.points}  ·  SHIELD ${CONFIG.bonus.shieldSeconds}s`);
  }

  private hit(obstacle: Phaser.Physics.Arcade.Sprite): void {
    if (this.state !== 'playing' || !obstacle.active) return;

    if (this.shieldUntil > this.elapsed || this.invulnerableUntil > this.elapsed) {
      obstacle.destroy();
      this.shieldUntil = 0;
      this.invulnerableUntil = this.elapsed + CONFIG.bonus.shieldInvulnerabilityMs;
      this.player.setVelocityX(0).setX(CONFIG.playerX);
      sound.playShieldHit();
      this.cameras.main.shake(120, 0.005);
      this.emitDust(this.player.x + 28, this.player.y - 20, 14);
      this.notice('SHIELD DEFLECTED IMPACT!');
      return;
    }

    this.state = 'ended';
    this.physics.pause();
    this.player.anims.stop();
    this.player.setTexture(TEXTURES.hamsterHit);
    this.player.setAngle(22);
    this.player.setTint(COLORS.danger);
    sound.playHit();
    this.cameras.main.shake(220, 0.009);

    const score = this.score();
    const newBest = score > this.context.records.best;
    this.context.records.save(score, this.runBlock);
    const result: RunResult = {
      score,
      distance: Math.floor(this.distance),
      best: this.context.records.best,
      blockBest: this.context.records.bestFor(this.runBlock),
      runBlock: this.runBlock,
      newBest,
      demo: this.context.source.kind === 'demo',
    };
    this.time.delayedCall(350, () => this.scene.start('GameOver', result));
  }

  private score(): number {
    return Math.floor(this.distance * CONFIG.pointsPerMetre) + this.bonusPoints;
  }

  private notice(message: string): void {
    this.noticeCardText.setText(message);
    this.noticeUntil = this.elapsed + CONFIG.bonus.noticeMs;
    this.tweens.killTweensOf(this.noticeContainer);
    this.noticeContainer.setScale(0.8).setAlpha(0);
    this.tweens.add({
      targets: this.noticeContainer,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 180,
      ease: 'Back.easeOut',
    });
  }

  private emitDust(x: number, y: number, count: number): void {
    let emitted = 0;
    for (const d of this.dustPool) {
      if (emitted >= count) break;
      if (!d.visible) {
        d.setPosition(x, y)
          .setScale(0.5 + Math.random() * 0.9)
          .setAlpha(0.75)
          .setVisible(true);

        const targetX = x - 20 - Math.random() * 40;
        const targetY = y - Math.random() * 25;
        this.tweens.add({
          targets: d,
          x: targetX,
          y: targetY,
          alpha: 0,
          duration: 280 + Math.random() * 160,
          onComplete: () => {
            d.setVisible(false);
          },
        });
        emitted++;
      }
    }
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(CONFIG.maxFrameSeconds, delta / 1000);
    const view = this.context.source.read();
    const target = baseSpeed(this.distance) * rpmMultiplier(view.rpm);

    // Update HUD telemetry
    this.modeText
      .setText(`${view.mode === 'LIVE' ? '●' : '○'}  ${view.mode}`)
      .setColor(view.mode === 'LIVE' ? '#c4ef6e' : view.mode === 'WHEEL IDLE' ? '#81cce4' : '#ec8a79');
    this.rpmText.setText(view.mode === 'NO DATA' ? '—' : view.rpm.toFixed(1));

    // Gauge bar for RPM (0 to 100 RPM)
    const rpmClamped = Math.min(100, Math.max(0, view.rpm));
    this.rpmGaugeFill.width = Math.max(1, (rpmClamped / 100) * 130);
    this.rpmGaugeFill.setFillStyle(view.mode === 'LIVE' ? COLORS.lime : 0x48606f);

    this.heightText.setText(`#${compactHeight(view.snapshot?.confirmedHeight ?? null)}`);
    const projected = view.snapshot?.projectedHeight;
    this.provisionalText.setText(
      view.snapshot?.confirmedHeight === null || !view.snapshot
        ? 'awaiting confirmed height'
        : view.mode === 'NO DATA'
          ? 'last known confirmed height'
          : projected !== null && projected !== undefined && projected !== view.snapshot.confirmedHeight
            ? `provisional #${compactHeight(projected)}`
            : this.context.source.kind === 'demo'
              ? 'DEMO · SIMULATED'
              : 'SEPOLIA · SETTLED',
    );
    this.detailText.setText(view.reason);

    if (this.lastMode !== view.mode) {
      const accessibleStatus = document.getElementById('status');
      if (accessibleStatus) {
        accessibleStatus.textContent = `${this.context.source.kind === 'demo' ? 'Demo. ' : ''}${view.mode}. ${view.reason}`;
      }
      this.lastMode = view.mode;
    }

    if (this.state !== 'playing') return;

    this.elapsed += dt * 1000;
    this.speed = smoothSpeed(this.speed, target, dt);
    this.distance += (this.speed * dt) / CONFIG.pixelsPerMetre;

    // Parallax scrolling
    this.bgFar.tilePositionX += this.speed * 0.12 * dt;
    this.bgMid.tilePositionX += this.speed * 0.38 * dt;
    this.ground.tilePositionX += this.speed * dt;

    // Spinning hamster wheel
    this.wheel.rotation += ((view.rpm / 60) * Math.PI * 2 * dt);

    // Speed effects (Speed Lines when RPM is elevated in LIVE mode)
    const isHighRpm = view.mode === 'LIVE' && view.rpm > 18;
    const speedIntensity = isHighRpm ? Phaser.Math.Clamp((view.rpm - 18) / 75, 0, 1) : 0;
    const activeLinesCount = Math.floor(speedIntensity * this.speedLines.length);

    this.speedLines.forEach((line, idx) => {
      if (idx < activeLinesCount) {
        if (!line.sprite.visible) {
          line.sprite.setPosition(CONFIG.width + Math.random() * 200, 115 + Math.random() * 270)
            .setAlpha(0.15 + speedIntensity * 0.45)
            .setScale(1 + speedIntensity * 0.8, 1)
            .setVisible(true);
        } else {
          line.sprite.x -= (this.speed * line.speedFactor + 200) * dt;
          if (line.sprite.x < -80) {
            line.sprite.setPosition(CONFIG.width + Math.random() * 120, 115 + Math.random() * 270);
          }
        }
      } else {
        line.sprite.setVisible(false);
      }
    });

    // Spawn obstacles
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) this.spawnObstacle();

    // Move obstacles & nuts
    for (const group of [this.obstacles, this.nuts]) {
      for (const child of [...group.getChildren()]) {
        const sprite = child as Phaser.Physics.Arcade.Sprite;
        sprite.setVelocityX(-this.speed);
        if (sprite.x < -80) sprite.destroy();
      }
    }

    // Player grounded / jump animation logic
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    this.player.setX(CONFIG.playerX).setVelocityX(0);

    const grounded = body.blocked.down && body.velocity.y >= 0;

    if (grounded) {
      this.jumpsUsed = 0;
      this.lastGrounded = this.elapsed;

      if (!this.player.anims.isPlaying || this.player.anims.currentAnim?.key !== 'hamster-run') {
        this.player.play('hamster-run');
      }
      // Speed up animation with world speed
      const speedRamp = Phaser.Math.Clamp(this.speed / CONFIG.speed.base, 0.9, 2.4);
      this.player.anims.timeScale = speedRamp;
      this.player.setAngle(Math.sin(this.elapsed / 50) * 2.5);

      // Paws dust frequency
      this.dustIn -= dt;
      if (this.dustIn <= 0) {
        const dustCount = speedIntensity > 0.4 ? 2 : 1;
        this.emitDust(this.player.x - 24, CONFIG.groundY - 3, dustCount);
        this.dustIn = speedIntensity > 0.4 ? 0.07 : 0.12;
      }
    } else {
      // In air: show jump or fall sprite
      this.player.anims.stop();
      if (body.velocity.y < 0) {
        this.player.setTexture(TEXTURES.hamsterJump);
        this.player.setAngle(-12);
      } else {
        this.player.setTexture(TEXTURES.hamsterFall);
        this.player.setAngle(5);
      }
    }

    this.tryJump();

    this.shadow.setScale(Math.max(0.3, 1 - (CONFIG.groundY - this.player.y) / 300));

    // Shield forcefield animation
    const hasShield = this.shieldUntil > this.elapsed;
    this.shieldSprite.setVisible(hasShield);
    this.shieldRing.setVisible(hasShield);
    if (hasShield) {
      this.shieldSprite.setPosition(this.player.x, this.player.y - 28);
      this.shieldRing.setPosition(this.player.x, this.player.y - 28);
      this.shieldSprite.rotation += 0.035;

      // Pulsate when shield is running out (< 3 seconds)
      const timeLeftMs = this.shieldUntil - this.elapsed;
      if (timeLeftMs < 3000) {
        const flashAlpha = Math.sin(this.elapsed / 60) > 0 ? 0.85 : 0.25;
        this.shieldSprite.setAlpha(flashAlpha);
        this.shieldRing.setAlpha(flashAlpha);
      } else {
        this.shieldSprite.setAlpha(0.85);
        this.shieldRing.setAlpha(0.7);
      }
    }

    this.shieldText.setText(
      hasShield
        ? `SHIELD  ${Math.ceil((this.shieldUntil - this.elapsed) / 1000)}s`
        : `${CONFIG.maxJumps - this.jumpsUsed} JUMPS READY`,
    );

    this.scoreText.setText(this.score().toString().padStart(5, '0'));
    this.speedText.setText(`WORLD  ${(this.speed / baseSpeed(this.distance)).toFixed(2)}×`);
    this.speedBar.width =
      166 * Math.max(0.06, (this.speed / baseSpeed(this.distance) - 1) / (CONFIG.speed.maximumMultiplier - 1));

    // Notice fadeout
    if (this.noticeUntil > 0 && this.noticeUntil <= this.elapsed) {
      this.noticeUntil = 0;
      this.tweens.add({
        targets: this.noticeContainer,
        alpha: 0,
        duration: 350,
      });
    }
  }
}
