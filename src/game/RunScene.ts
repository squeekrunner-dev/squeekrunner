import Phaser from 'phaser';
import { CONFIG } from '../config';
import { BlockDetector } from '../chain/blocks';
import type { ChainSnapshot } from '../chain/types';
import { pendingBlocks } from '../chain/pending';
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
import { centerCamera, MAX_PAD, sideFades } from './viewport';
import { startRanked, submitRanked, type RankedRun } from '../net/ranked';
import { RunFx } from './fx/RunFx';
import { rpmDrive } from './fx/profile';
import { nutStep } from '../net/timeline';

type RunState = 'ready' | 'playing' | 'paused' | 'ended';

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

  private fx!: RunFx;

  private state: RunState = 'ready';
  private detector = new BlockDetector();
  private distance = 0;
  private speed: number = CONFIG.speed.base;
  private elapsed = 0;

  private hasShield = false;
  private airJumps = 0;
  private noticeUntil = 0;
  private runBlock: RunBlock | null = null;
  private lastMode = '';
  /** Server session of a ranked run; null for offline/unranked runs. */
  private ranked: RankedRun | null = null;
  private starting = false;
  /** Smoothed real-wheel RPM driving presentation effects. */
  private fxRpm = 0;
  private abort = new AbortController();

  constructor(private readonly context: GameContext) {
    super('Run');
  }

  create(data: { immediate?: boolean } = {}): void {
    this.state = 'ready';
    this.distance = this.elapsed = 0;
    this.noticeUntil = 0;
    this.hasShield = false; this.airJumps = CONFIG.doubleJumps.start;
    this.speed = CONFIG.speed.base;
    // Offline seed; a ranked run replaces the driver with the server-issued seed on start.
    this.driver = new RunDriver(crypto.getRandomValues(new Uint32Array(1))[0], this.context.source.kind);
    this.ranked = null;
    this.starting = false;
    this.fxRpm = 0;
    this.abort = new AbortController();
    this.obstacleSprites = new Map();
    this.nutSprite = null;
    this.coinSprite = null;
    this.runBlock = null;
    this.detector = new BlockDetector();
    this.lastMode = '';

    backdrop(this);

    // Parallax background layers
    this.bgFar = this.add.tileSprite(-MAX_PAD, 80, (CONFIG.width + 2 * MAX_PAD), 280, TEXTURES.bgFar).setOrigin(0).setDepth(0);
    this.bgMid = this.add.tileSprite(-MAX_PAD, 236, (CONFIG.width + 2 * MAX_PAD), 180, TEXTURES.bgMid).setOrigin(0).setDepth(1);

    this.createWheel();

    // Ground running track
    this.ground = this.add.tileSprite(-MAX_PAD, CONFIG.groundY, (CONFIG.width + 2 * MAX_PAD), 36, TEXTURES.ground).setOrigin(0).setDepth(2);

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

    this.fx = new RunFx(this, this.wheelGlow);

    this.createHud();
    this.createNoticeCard();
    this.createIntro();
    centerCamera(this);
    sideFades(this, 108, CONFIG.groundY + 36 - 108, 8);

    this.pauseOverlay = this.add.container(0, 0, [
      this.add.rectangle(480, 270, (CONFIG.width + 2 * MAX_PAD), 540, COLORS.background, 0.88),
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
      document.body.classList.remove('is-playing');
      sound.stopMusic(0.1);
      sound.stopComet(0.1);
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
    hudBar.fillStyle(0x0f1822, 0.92).fillRect(-MAX_PAD, 0, (CONFIG.width + 2 * MAX_PAD), 108);
    hudBar.lineStyle(1, 0x223644, 0.9).lineBetween(-MAX_PAD, 108, CONFIG.width + MAX_PAD, 108);

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

    this.shieldText = label(this, 932, 466, `DOUBLE JUMPS  ${CONFIG.doubleJumps.start}`, 16, '#ffcf75', true).setOrigin(1, 0).setDepth(15);
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
    const practice = this.context.source.kind === 'demo';
    const bg = this.add.rectangle(480, 258, 660, 290, COLORS.background, 0.95)
      .setStrokeStyle(2, 0x3e5649);
    const kicker = label(this, 480, 132, practice ? 'PRACTICE · SIMULATED WHEEL' : 'A REAL WHEEL. YOUR RUN.', 15, '#c4ef6e', true).setOrigin(0.5);
    const title = label(this, 480, 166, 'SMALL PAWS. BIG MOMENTUM.', 30).setOrigin(0.5).setFontStyle('bold');
    const heading = label(this, 480, 204, practice ? 'DOES NOT COUNT · WHITELIST RULES FOR RANKED RUNS' : 'WHITELIST RULES',
      13, practice ? '#ffcf75' : '#ffcf75', true).setOrigin(0.5);
    const rules = [
      `•  Score ${(100000).toLocaleString('en-US')}+ points in a ranked run, verified by the server`,
      `•  Catch all ${CONFIG.coins.count} coins: double-jump height, all before ${(100000).toLocaleString('en-US')} points`,
      `•  ${CONFIG.doubleJumps.start} double jumps per run, then single jumps only`,
      `•  Golden nut: a shield until your next hit + ${CONFIG.doubleJumps.perNut} double jumps`,
    ].map((text, i) => label(this, 246, 226 + i * 22, text, 15, '#d8e0d9').setOrigin(0, 0));

    const button = this.add.rectangle(480, 340, 294, 48, COLORS.lime).setInteractive({ useHandCursor: true });
    const call = label(this, 480, 340, 'START RUN  →', 22, '#131b27').setOrigin(0.5).setFontStyle('bold');
    const controls = label(this, 480, 381, 'SPACE / ↑ / TAP   ·   TAP IN AIR FOR DOUBLE JUMP', 13, '#8b9ba6', true).setOrigin(0.5);

    button.on('pointerover', () => button.setFillStyle(0xd8ffa0));
    button.on('pointerout', () => button.setFillStyle(COLORS.lime));

    this.intro = this.add.container(0, 0, [bg, kicker, title, heading, ...rules, button, call, controls]).setDepth(22);
  }

  private begin(): void {
    this.state = 'playing';
    document.body.classList.add('is-playing');
    this.intro.setVisible(false);
    this.player.play('hamster-run');
    this.detector = new BlockDetector();
    const current = this.context.source.read();
    sound.startMusic(current.mode === 'NO DATA' ? 0 : current.rpm);
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
      this.fx.stopMotion();
      this.driver.pause();
      this.player.anims.pause();
      this.pauseOverlay.setVisible(true);
      sound.stopMusic(0.15);
      sound.stopComet(0.15);
      sound.playUiClick();
    } else if (this.state === 'paused' && !document.hidden) {
      this.detector.rebaseNext();
      this.state = 'playing';
      this.player.anims.resume();
      this.pauseOverlay.setVisible(false);
      sound.playUiClick();
      const resumed = this.context.source.read();
      sound.startMusic(resumed.mode === 'NO DATA' ? 0 : resumed.rpm);
      if (this.driver.sim.unstoppable) sound.startComet();
    }
  }

  private onSnapshot(snapshot: ChainSnapshot): void {
    // squeek-6: nuts follow projected (pending) blocks, not batch-settled confirmations.
    const { bonus, reset } = this.detector.observe(snapshot.installationId, nutStep(snapshot.projectedHeight));
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
    this.hasShield = s.shield;
    this.airJumps = s.airJumps;
    this.player.setPosition(CONFIG.playerX, s.player.y / UNIT);
    for (const event of events) {
      if (event === 'jump' || event === 'airJump') {
        if (event === 'jump') sound.playJump();
        else { sound.playDoubleJump(); this.fx.airJump(); }
        this.fx.dust(this.player.x - 10, this.player.y - 4, 8);
      } else if (event === 'collect') {
        sound.playCollectNut();
        this.fx.collect(this.player.x, this.player.y - 28, false);
        sound.vibrate(CONFIG.fx.haptics.collectMs);
        this.notice(`GOLDEN NUT  +${CONFIG.bonus.points}  ·  SHIELD  ·  +${CONFIG.doubleJumps.perNut} DOUBLE JUMPS`);
      } else if (event === 'shieldHit') {
        sound.playShieldHit();
        sound.vibrate(CONFIG.fx.haptics.shieldMs);
        if (!this.fx.reduced) this.cameras.main.shake(CONFIG.fx.shake.shieldMs, CONFIG.fx.shake.shieldIntensity);
        this.fx.dust(this.player.x + 28, this.player.y - 20, 14);
        this.notice('SHIELD DEFLECTED IMPACT!');
      } else if (event === 'unstoppable') {
        this.fx.setUnstoppable(true);
        if (!sound.cometPlaying) sound.startComet(true); // not pre-rolled (practice/offline): fast attack
        sound.playNewBlock();
        sound.vibrate(CONFIG.fx.haptics.shieldMs);
        this.notice("🔥 UNSTOPPABLE! 70+ RPM · CRATES CAN'T STOP YOU · KEEP CATCHING COINS");
      } else if (event === 'unstoppableEnd') {
        this.fx.setUnstoppable(false);
        sound.stopComet();
      } else if (event === 'smash') {
        sound.playShieldHit();
        sound.vibrate(CONFIG.fx.haptics.shieldMs);
        if (!this.fx.reduced) this.cameras.main.shake(CONFIG.fx.shake.shieldMs, CONFIG.fx.shake.shieldIntensity);
        this.fx.smash(this.player.x + 30, this.player.y - 24);
      } else if (event === 'nut') {
        this.fx.newBlock();
        if (this.ranked) {
          sound.playNewBlock();
          this.notice('⚡ NEW SQUEEK BLOCK! GOLDEN NUT INCOMING!');
        }
      } else if (event === 'coinSpawn') {
        this.notice('WHITELIST COIN AHEAD · DOUBLE JUMP!');
      } else if (event === 'coin') {
        sound.playCollectNut();
        this.fx.collect(this.player.x, this.player.y - 60, true);
        sound.vibrate(CONFIG.fx.haptics.coinMs);
        this.notice(`WHITELIST COIN ${s.coins.collected} / ${CONFIG.coins.count}`);
      } else if (event === 'coinMissed') {
        sound.playShieldHit();
        this.notice('COIN MISSED · THE WHITELIST NEEDS ALL 10');
      } else if (event === 'gameOver') this.endRun();
    }
    this.fx.observeScore(s.score);
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
    this.fx.collectibles(this.nutSprite, this.coinSprite);
  }

  private endRun(): void {
    document.body.classList.remove('is-playing');
    this.fx.setUnstoppable(false);
    sound.stopComet(0.4);
    sound.stopMusic(0.6);
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
    this.fx.stopMotion();
    if (this.driver.sim.endReason === 'collision') sound.vibrate(CONFIG.fx.haptics.hitMs);
    if (!this.fx.reduced) this.cameras.main.shake(CONFIG.fx.shake.hitMs, CONFIG.fx.shake.hitIntensity);

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

  update(_time: number, delta: number): void {
    const dt = Math.min(CONFIG.maxFrameSeconds, delta / 1000);
    const view = this.context.source.read();

    // Update HUD telemetry
    this.modeText
      .setText(`${view.mode === 'LIVE' ? '●' : '○'}  ${view.mode}`)
      .setColor(view.mode === 'LIVE' ? '#c4ef6e' : view.mode === 'WHEEL IDLE' ? '#81cce4' : '#ec8a79');
    this.rpmText.setText(view.mode === 'NO DATA' ? '—' : view.rpm.toFixed(1));
    if (this.state === 'playing') sound.setMusicRpm(view.mode === 'NO DATA' ? 0 : view.rpm);

    // Gauge bar for RPM (0 to 100 RPM)
    const rpmClamped = Math.min(100, Math.max(0, view.rpm));
    this.rpmGaugeFill.width = Math.max(1, (rpmClamped / 100) * 130);
    this.rpmGaugeFill.setFillStyle(view.mode === 'LIVE' ? COLORS.lime : 0x48606f);

    this.heightText.setText(`#${compactHeight(view.snapshot?.confirmedHeight ?? null)}`);
    const pending = pendingBlocks(view.snapshot?.confirmedHeight, view.snapshot?.projectedHeight);
    this.provisionalText.setText(
      view.snapshot?.confirmedHeight === null || !view.snapshot
        ? 'awaiting confirmed height'
        : view.mode === 'NO DATA'
          ? 'last known confirmed height'
          : pending
            ? pending
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

    if (this.state !== 'playing') {
      if (this.state === 'ended') this.fx.update(dt, 0, this.speed, this.player, false, false);
      return;
    }

    if (this.ranked) this.driver.advanceRanked(this.ranked.timeline.targetTick(), this.ranked.timeline, events => this.onTick(events));
    else this.driver.advance(delta, rpmSample(view), events => this.onTick(events));
    this.renderObjects();
    if (this.driver.sim.gameOver) return;

    // Parallax scrolling is drawn in renderObjects() from the simulated travel.

    // Spinning hamster wheel
    this.wheel.rotation += ((view.rpm / 60) * Math.PI * 2 * dt);

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

    // Effects follow the real wheel (smoothed), not world speed: full at 75 RPM, overdrive toward 90 RPM.
    const live = this.context.source.read();
    const rpm = live.mode === 'NO DATA' ? 0 : live.rpm;
    this.fxRpm += (rpm - this.fxRpm) * Math.min(1, dt / CONFIG.fx.drive.smoothingSeconds);
    const drive = rpmDrive(this.fxRpm);
    this.fx.overdrive = drive.overdrive;
    // Ranked runs know the wheel ~5 s ahead: pre-roll the comet sound ~1 s before UNSTOPPABLE starts,
    // and cancel it if the wheel never gets there. Read-only look-ahead; the simulation is untouched.
    if (this.ranked && this.state === 'playing') {
      const ahead = this.ranked.timeline.peekRpmMilli(this.driver.sim.tick, 1000) ?? 0;
      if (!this.driver.sim.unstoppable) {
        if (ahead >= CONFIG.unstoppable.onRpmMilli && !sound.cometPlaying) sound.startComet();
        else if (ahead < CONFIG.unstoppable.offRpmMilli && sound.cometPlaying) sound.stopComet();
      }
    }
    this.fx.update(dt, drive.intensity, this.speed, this.player, grounded, true);
    this.fx.collectibles(this.nutSprite, this.coinSprite);

    this.shadow.setScale(Math.max(0.3, 1 - (CONFIG.groundY - this.player.y) / 300));

    // Shield forcefield animation
    const hasShield = this.hasShield;
    this.shieldSprite.setVisible(hasShield);
    this.shieldRing.setVisible(hasShield);
    if (hasShield) {
      this.shieldSprite.setPosition(this.player.x, this.player.y - 28);
      this.shieldRing.setPosition(this.player.x, this.player.y - 28);
      this.shieldSprite.rotation += 0.035;

      // The shield has no timer: a calm glow until it absorbs a hit.
      this.shieldSprite.setAlpha(0.85);
      this.shieldRing.setAlpha(0.6 + Math.sin(this.elapsed / 300) * 0.15);
    }

    this.shieldText.setText(`${hasShield ? 'SHIELD ON  ·  ' : ''}DOUBLE JUMPS  ${this.airJumps}`)
      .setColor(this.airJumps === 0 ? '#ec8a79' : hasShield ? '#81cce4' : '#ffcf75');

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
