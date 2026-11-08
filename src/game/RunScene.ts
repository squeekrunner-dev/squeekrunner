import Phaser from 'phaser';
import { CONFIG } from '../config';
import { BlockDetector } from '../chain/blocks';
import type { ChainSnapshot } from '../chain/types';
import { baseSpeed } from '../logic/speed';
import { coinX, COIN_Y, distance, TICK_HZ, UNIT, type SimEvent } from '../sim/core';
import { RunDriver, rpmSample } from './runDriver';
import type { RunBlock } from '../logic/records';
import { onSceneExit } from '../logic/lifecycle';
import { sound } from '../audio/sound';
import type { GameContext, RunResult } from './context';
import { COLORS, TEXTURES } from './textures';
import { backdrop, compactHeight, createMuteButton, label, pill } from './ui';
import { ServerSource } from '../net/source';
import { startRanked, submitRanked, type RankedRun } from '../net/ranked';

type RunState = 'ready' | 'playing' | 'paused' | 'ended';

interface SpeedLine {
  sprite: Phaser.GameObjects.Image;
  speedFactor: number;
}

export class RunScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private obstacleSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private nutSprite: Phaser.GameObjects.Sprite | null = null;
  private coinSprite: Phaser.GameObjects.Image | null = null;
  private coinText!: Phaser.GameObjects.Text;
  private driver!: RunDriver;
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
  private speed: number = CONFIG.speed.base;
  private elapsed = 0;
  private jumpsUsed = 0;
  private shieldUntil = 0;
  private noticeUntil = 0;
  private runBlock: RunBlock | null = null;
  private lastMode = '';
  private dustIn = 0;
  /** Server session of a ranked run; null for offline/unranked runs. */
  private ranked: RankedRun | null = null;
  private starting = false;
  private abort = new AbortController();

  constructor(private readonly context: GameContext) {
    super('Run');
  }

  create(data: { immediate?: boolean } = {}): void {
    this.state = 'ready';
    this.distance = this.elapsed = this.jumpsUsed = 0;
    this.shieldUntil = this.noticeUntil = this.dustIn = 0;
    this.speed = CONFIG.speed.base;
    // Offline seed; a ranked run replaces the driver with the server-issued seed on start.
    this.driver = new RunDriver(crypto.getRandomValues(new Uint32Array(1))[0], this.context.source.kind);
    this.ranked = null;
    this.starting = false;
    this.abort = new AbortController();
    this.obstacleSprites = new Map();
    this.nutSprite = null;
    this.coinSprite = null;
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

    // Hamster shadow
    this.shadow = this.add.ellipse(CONFIG.playerX, CONFIG.groundY - 1, 58, 9, 0x07140e, 0.45).setDepth(3);

    // Player sprite
    this.player = this.add.sprite(CONFIG.playerX, CONFIG.groundY, TEXTURES.hamsterRun1).setOrigin(0.5, 1).setDepth(5);

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
      this.abort.abort();
      unsubscribe();
      this.input.off('pointerdown', pointer);
      this.input.keyboard?.off('keydown', keyboard);
      document.removeEventListener('visibilitychange', visibility);
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.obstacleSprites.clear();
      this.nutSprite = null;
      this.coinSprite = null;
    });

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
    this.add.image(400, 501, TEXTURES.coin).setScale(0.5).setDepth(15);
    this.coinText = label(this, 414, 494, `0 / ${CONFIG.coins.count}`, 15, '#ffcf75', true).setDepth(15);
    label(this, 932, 495, 'SPACE / ↑ / TAP    ·    P PAUSES    ·    M MUTE', 13, '#8b9ba6', true).setOrigin(1, 0).setDepth(15);

    if (this.context.source.kind === 'demo') {
      pill(this, 305, 14, 'PRACTICE', COLORS.gold).setDepth(16);
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
    this.player.play('hamster-run');
    this.detector = new BlockDetector();
    const current = this.context.source.read();
    if (current.mode !== 'NO DATA' && current.snapshot) this.onSnapshot(current.snapshot);
  }

  /** With a server configured, try a ranked session first; any failure falls back to an offline run. */
  private start(): void {
    const { api, source, turnstileSiteKey } = this.context;
    if (!api || !(source instanceof ServerSource) || !turnstileSiteKey) { this.begin(); return; }
    this.starting = true;
    this.notice('VERIFYING · STARTING A RANKED RUN…');
    startRanked(api, source, turnstileSiteKey, this.abort.signal)
      .then(ranked => {
        this.ranked = ranked;
        this.driver = new RunDriver(ranked.session.seed, 'live');
        this.notice('RANKED RUN · VERIFIED BY THE SERVER');
      })
      .catch(() => { if (!this.abort.signal.aborted) this.notice('OFFLINE RUN · DOES NOT QUALIFY'); })
      .finally(() => {
        this.starting = false;
        if (!this.abort.signal.aborted && this.state === 'ready') this.begin();
      });
  }

  private action(): void {
    if (this.state === 'ready') {
      if (this.starting) return;
      sound.playUiClick();
      this.start();
    } else if (this.state === 'paused') {
      sound.playUiClick();
      this.togglePause();
    } else if (this.state === 'playing') {
      this.driver.jump();
    }
  }

  private togglePause(): void {
    // A ranked run follows server time and cannot be paused (that would desync it from the verifier).
    if (this.ranked && this.state === 'playing') return;
    if (this.state === 'playing') {
      this.state = 'paused';
      this.driver.pause();
      this.player.anims.pause();
      this.pauseOverlay.setVisible(true);
      sound.playUiClick();
    } else if (this.state === 'paused' && !document.hidden) {
      this.detector.rebaseNext();
      this.state = 'playing';
      this.player.anims.resume();
      this.pauseOverlay.setVisible(false);
      sound.playUiClick();
    }
  }

  private onSnapshot(snapshot: ChainSnapshot): void {
    const { bonus, reset } = this.detector.observe(snapshot.installationId, snapshot.confirmedHeight);
    if (this.ranked) {
      // Ranked nuts come only from the server timeline inside the simulation ('nut' events).
      if (this.state === 'playing' && !this.runBlock && snapshot.confirmedHeight !== null) {
        this.runBlock = { installationId: snapshot.installationId, height: snapshot.confirmedHeight };
      }
      return;
    }
    if (reset) {
      this.driver.resetNut();
      this.noticeUntil = 0;
      this.tweens.killTweensOf(this.noticeContainer);
      this.noticeContainer.setAlpha(0);
    }
    if (this.state !== 'playing') return;
    if (!this.runBlock && snapshot.confirmedHeight !== null) {
      this.runBlock = { installationId: snapshot.installationId, height: snapshot.confirmedHeight };
    }
    if (bonus) {
      this.driver.nut();
      sound.playNewBlock();
      this.notice(`⚡ SQUEEK BLOCK #${compactHeight(bonus.height)}! GOLDEN NUT INCOMING!`);
    }
  }

  /** Effects consume simulation events; they never write gameplay state. */
  private onTick(events: SimEvent[]): void {
    const s = this.driver.sim;
    this.distance = distance(s);
    this.speed = s.speed / UNIT;
    this.elapsed = s.tick * 1000 / TICK_HZ;
    this.jumpsUsed = s.player.jumps;
    this.shieldUntil = s.shieldUntil * 1000 / TICK_HZ;
    this.player.setPosition(CONFIG.playerX, s.player.y / UNIT);
    for (const event of events) {
      if (event === 'jump' || event === 'airJump') {
        if (event === 'jump') sound.playJump(); else sound.playDoubleJump();
        this.emitDust(this.player.x - 10, this.player.y - 4, 8);
      } else if (event === 'collect') {
        sound.playCollectNut();
        this.emitDust(this.player.x, this.player.y - 28, 18);
        this.notice(`GOLDEN NUT  +${CONFIG.bonus.points}  ·  SHIELD ${CONFIG.bonus.shieldSeconds}s`);
      } else if (event === 'shieldHit') {
        sound.playShieldHit();
        this.cameras.main.shake(120, 0.005);
        this.emitDust(this.player.x + 28, this.player.y - 20, 14);
        this.notice('SHIELD DEFLECTED IMPACT!');
      } else if (event === 'nut' && this.ranked) {
        sound.playNewBlock();
        this.notice('⚡ NEW SQUEEK BLOCK! GOLDEN NUT INCOMING!');
      } else if (event === 'coinSpawn') {
        this.notice('WHITELIST COIN AHEAD · DOUBLE JUMP!');
      } else if (event === 'coin') {
        sound.playCollectNut();
        this.emitDust(this.player.x, this.player.y - 60, 16);
        this.notice(`WHITELIST COIN ${s.coins.collected} / ${CONFIG.coins.count}`);
      } else if (event === 'coinMissed') {
        sound.playShieldHit();
        this.notice('COIN MISSED · THE WHITELIST NEEDS ALL 10');
      } else if (event === 'gameOver') this.endRun();
    }
    this.coinText.setText(`${s.coins.collected} / ${CONFIG.coins.count}`)
      .setColor(s.coins.missed ? '#ec8a79' : '#ffcf75');
  }

  /**
   * Everything that scrolls is drawn from the same simulated travel plus the same sub-tick offset, so
   * obstacles, collectibles and the ground move in lockstep. The simulation itself runs at 60 Hz; on
   * displays faster than that (or with uneven frames) drawing raw tick positions made obstacles judder
   * against a ground that scrolled per frame.
   */
  private renderObjects(): void {
    const s = this.driver.sim;
    const fraction = s.gameOver ? 0 : this.ranked
      ? Math.min(1, Math.max(0, this.ranked.timeline.exactTick() - s.tick))
      : this.driver.fraction();
    const shift = Math.trunc(s.speed / TICK_HZ) * fraction; // milli-px still to travel before the next tick
    const scroll = (s.travel + shift) / UNIT;
    this.bgFar.tilePositionX = scroll * 0.12;
    this.bgMid.tilePositionX = scroll * 0.38;
    this.ground.tilePositionX = scroll;
    const variants = [TEXTURES.obstacleCrate, TEXTURES.obstacleSprocket, TEXTURES.obstacleBattery];
    const present = new Set(s.obstacles.map(o => o.id));
    for (const [id, sprite] of this.obstacleSprites) {
      if (!present.has(id)) { sprite.destroy(); this.obstacleSprites.delete(id); }
    }
    for (const obstacle of s.obstacles) {
      let sprite = this.obstacleSprites.get(obstacle.id);
      if (!sprite) {
        sprite = this.add.sprite(0, CONFIG.groundY, variants[obstacle.kind]).setOrigin(0.5, 1)
          .setDisplaySize(obstacle.width, obstacle.height).setDepth(3);
        this.obstacleSprites.set(obstacle.id, sprite);
      }
      sprite.x = (obstacle.x - shift) / UNIT;
    }
    if (s.nut) {
      this.nutSprite ??= this.add.sprite(0, CONFIG.groundY - CONFIG.bonus.floatHeight, TEXTURES.nut).setDepth(4);
      this.nutSprite.x = (s.nut.x - shift) / UNIT;
    } else { this.nutSprite?.destroy(); this.nutSprite = null; }
    if (s.coins.active) {
      this.coinSprite ??= this.add.image(0, COIN_Y / UNIT, TEXTURES.coin).setDepth(4);
      this.coinSprite.x = (coinX(s, s.coins.active) - shift) / UNIT;
    } else { this.coinSprite?.destroy(); this.coinSprite = null; }
  }

  private endRun(): void {
    this.ranked?.timeline.stop();
    if (this.driver.replay) this.context.lastReplay = this.driver.replay;
    const { api, source } = this.context;
    const ranked = !!(this.ranked && this.driver.replay && api && source instanceof ServerSource);
    this.context.submission = ranked
      ? submitRanked(api!, this.ranked!, this.driver.replay!, () => (source as ServerSource).serverNow())
      : undefined;
    this.state = 'ended';
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
      ranked,
      coins: this.driver.sim.coins.collected,
    };
    this.time.delayedCall(350, () => this.scene.start('GameOver', result));
  }

  private score(): number {
    return this.driver.sim.score;
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
              ? 'PRACTICE · SIMULATED WHEEL'
              : 'SEPOLIA · SETTLED',
    );
    this.detailText.setText(view.reason);

    if (this.lastMode !== view.mode) {
      const accessibleStatus = document.getElementById('status');
      if (accessibleStatus) {
        accessibleStatus.textContent = `${this.context.source.kind === 'demo' ? 'Practice. ' : ''}${view.mode}. ${view.reason}`;
      }
      this.lastMode = view.mode;
    }

    if (this.state !== 'playing') return;

    if (this.ranked) this.driver.advanceRanked(this.ranked.timeline.targetTick(), this.ranked.timeline, events => this.onTick(events));
    else this.driver.advance(delta, rpmSample(view), events => this.onTick(events));
    this.renderObjects();
    if (this.driver.sim.gameOver) return;

    // Parallax scrolling is drawn in renderObjects() from the simulated travel.

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

    // Player grounded / jump animation logic
    const player = this.driver.sim.player;
    const grounded = player.y === CONFIG.groundY * UNIT && player.vy >= 0;

    if (grounded) {
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
      if (player.vy < 0) {
        this.player.setTexture(TEXTURES.hamsterJump);
        this.player.setAngle(-12);
      } else {
        this.player.setTexture(TEXTURES.hamsterFall);
        this.player.setAngle(5);
      }
    }

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
