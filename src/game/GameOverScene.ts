import Phaser from 'phaser';
import { CONFIG } from '../config';
import { onSceneExit } from '../logic/lifecycle';
import { sound } from '../audio/sound';
import type { GameContext, RunResult } from './context';
import { COLORS, TEXTURES } from './textures';
import { backdrop, createMuteButton, label, pill } from './ui';
import { centerCamera, MAX_PAD, sideFades } from './viewport';

export class GameOverScene extends Phaser.Scene {
  private orbitingStars: Phaser.GameObjects.Image[] = [];
  private muteBtn!: { container: Phaser.GameObjects.Container; setMuted: (muted: boolean) => void };

  constructor(private readonly context: GameContext) {
    super('GameOver');
  }

  create(result: RunResult): void {
    backdrop(this);
    const debug = new URLSearchParams(window.location.search).get('debug') === '1';
    const downloads = new Set<string>();
    if (debug) label(this, 480, 515, 'D · DOWNLOAD REPLAY', 12, '#8b9ba6', true).setOrigin(0.5).setDepth(12);

    // Parallax background & ground preview (layers 1..3)
    this.add.tileSprite(-MAX_PAD, 80, (CONFIG.width + 2 * MAX_PAD), 280, TEXTURES.bgFar).setOrigin(0).setDepth(1);
    this.add.tileSprite(-MAX_PAD, 236, (CONFIG.width + 2 * MAX_PAD), 180, TEXTURES.bgMid).setOrigin(0).setDepth(2);
    this.add.tileSprite(-MAX_PAD, CONFIG.groundY, (CONFIG.width + 2 * MAX_PAD), 36, TEXTURES.ground).setOrigin(0).setDepth(3);
    centerCamera(this);
    sideFades(this, 80, CONFIG.groundY + 36 - 80, 4);

    // Brand and Demo pill (depth 10)
    label(this, 28, 16, 'SQUEEK / RUNNER', 16, '#c4ef6e', true).setFontStyle('bold').setDepth(10);
    if (result.demo) {
      pill(this, 830, 14, 'PRACTICE', COLORS.gold).setDepth(10);
    }

    // Mute button (depth 25)
    this.muteBtn = createMuteButton(this, 735, 28, sound.isMuted(), () => {
      const isMuted = sound.toggleMute();
      this.muteBtn.setMuted(isMuted);
    });

    // Top Header: Kicker (y = 50) and Title (y = 80)
    const kickerText = result.newBest ? '★ NEW ALL-TIME RECORD! ★' : 'ONE MORE RUN?';
    const kicker = label(this, 480, 50, kickerText, 15, result.newBest ? '#ffcf75' : '#c4ef6e', true)
      .setOrigin(0.5)
      .setFontStyle('bold')
      .setDepth(10);

    const title = label(this, 480, 80, 'SMALL PAWS. BIG TRY.', 32)
      .setOrigin(0.5)
      .setFontStyle('bold')
      .setDepth(10);

    // Central Card Container: y = 196 (from y = 118 to 274, height = 156, width = 600)
    this.add.rectangle(480, 196, 600, 156, COLORS.background, 0.96)
      .setStrokeStyle(2, result.newBest ? COLORS.gold : 0x3d5446)
      .setDepth(10);

    // Left Section of Card: Score
    label(this, 310, 138, 'YOUR SCORE', 12, '#8b9ba6', true).setOrigin(0.5).setDepth(12);

    const scoreVal = label(this, 310, 184, '0', 44, '#ffcf75')
      .setOrigin(0.5)
      .setFontStyle('bold')
      .setDepth(12);

    this.tweens.addCounter({
      from: 0,
      to: result.score,
      duration: 650,
      ease: 'Cubic.easeOut',
      onUpdate: tween => {
        const value = Math.floor(tween.getValue() ?? 0);
        scoreVal.setText(value.toLocaleString());
      },
    });

    label(this, 310, 236, `${result.distance} m  ·  coins ${result.coins} / ${CONFIG.coins.count}`, 15,
      result.coins === CONFIG.coins.count ? '#ffcf75' : '#b6c2bc').setOrigin(0.5).setDepth(12);

    // Vertical Divider Line in Card
    const divider = this.add.graphics().setDepth(11);
    divider.lineStyle(1, 0x2e424e, 0.8).lineBetween(445, 135, 445, 258);

    // Right Section of Card: Records
    label(this, 475, 142, 'BEST EVER', 12, '#8b9ba6', true).setDepth(12);
    label(this, 745, 142, result.best.toLocaleString(), 20, '#f4f1df').setOrigin(1, 0.2).setDepth(12);

    label(this, 475, 182, 'BLOCK BEST', 12, '#8b9ba6', true).setDepth(12);
    label(this, 745, 182, result.runBlock ? result.blockBest.toLocaleString() : '—', 20, '#f4f1df').setOrigin(1, 0.2).setDepth(12);

    label(this, 475, 222, 'BLOCK', 12, '#8b9ba6', true).setDepth(12);
    label(
      this,
      745,
      222,
      result.runBlock ? `#${result.runBlock.height}` : 'unpinned',
      16,
      '#ffcf75',
      true,
    ).setOrigin(1, 0.1).setDepth(12);

    // Pinning description subtitle below card (y = 294)
    label(
      this,
      480,
      294,
      result.runBlock ? `Run pinned to block #${result.runBlock.height}` : 'No confirmed block was available for this run',
      13,
      '#8b9ba6',
      true,
    ).setOrigin(0.5).setDepth(12);

    // Hamster sitting on track at x = 140, on top of ground (groundY = 416)
    this.add.ellipse(140, CONFIG.groundY - 1, 60, 11, 0x07140e, 0.55).setDepth(11);
    this.add.image(140, CONFIG.groundY, TEXTURES.hamsterHit)
      .setOrigin(0.5, 1)
      .setScale(1.25)
      .setDepth(12);

    // Orbiting dizzy stars above hamster's head
    this.orbitingStars = [];
    for (let i = 0; i < 3; i++) {
      const star = this.add.image(140, CONFIG.groundY - 65, TEXTURES.star)
        .setScale(0.9)
        .setDepth(13);
      this.orbitingStars.push(star);
    }

    // Celebration golden particle burst if newBest
    if (result.newBest) {
      for (let i = 0; i < 28; i++) {
        const p = this.add.image(310, 184, TEXTURES.dust).setScale(1.2).setAlpha(0.9).setDepth(14);
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 85;
        this.tweens.add({
          targets: p,
          x: 310 + Math.cos(angle) * dist,
          y: 184 + Math.sin(angle) * dist,
          alpha: 0,
          scale: 0.2,
          duration: 600 + Math.random() * 400,
          onComplete: () => p.destroy(),
        });
      }
    }

    // Play button: center (480, 348), width 280, height 48, depth 15
    const button = this.add.rectangle(480, 348, 280, 48, COLORS.lime)
      .setInteractive({ useHandCursor: true })
      .setDepth(15);
    const buttonText = label(this, 480, 348, 'RUN AGAIN  →', 22, '#131b27')
      .setOrigin(0.5)
      .setFontStyle('bold')
      .setDepth(16);

    // Bottom hints
    const hint = label(this, 480, 442, 'SPACE / ↑ / TAP TO RESTART', 18, '#c4ef6e', true)
      .setOrigin(0.5)
      .setDepth(12);
    label(
      this,
      480,
      478,
      result.demo
        ? 'PRACTICE · Simulated wheel. Does not count for the whitelist.'
        : 'A fresh run. The same real wheel. No wallet needed.',
      14,
      '#8b9ba6',
    ).setOrigin(0.5).setDepth(12);

    let restarting = false;
    const restart = (): void => {
      if (restarting) return;
      restarting = true;
      sound.playUiClick();
      this.scene.start('Run', { immediate: true });
    };
    const apply = (): void => {
      if (restarting) return;
      restarting = true;
      sound.playUiClick();
      window.location.assign(new URL('../whitelist/#apply', window.location.href).href);
    };
    /**
     * 'restart': the usual screen. 'hold': a ranked run with every coin is being checked, so a stray tap
     * cannot skip a possible qualification. 'apply': the run qualified; the main button applies.
     */
    let mode: 'restart' | 'hold' | 'apply' = result.ranked && this.context.submission && result.coins === CONFIG.coins.count ? 'hold' : 'restart';
    if (mode === 'hold') hint.setText('CHECKING YOUR RUN…');

    // Ranked run: show the server's verdict (its score is the only one that counts for the whitelist).
    if (result.ranked && this.context.submission) {
      const verdict = label(this, 480, 398, 'VERIFYING RUN WITH THE SERVER…', 15, '#81cce4', true)
        .setOrigin(0.5).setDepth(16);
      void this.context.submission.then(outcome => {
        if (!verdict.active) return;
        if (outcome.status === 'verified' && outcome.eligible) {
          mode = 'apply';
          verdict.setText(`✓ VERIFIED ${outcome.score.toLocaleString()} · ${outcome.coins}/${CONFIG.coins.count} COINS · YOU QUALIFY!`).setColor('#ffcf75');
          this.showApplyButton(button, buttonText, apply);
          kicker.setText('★ WHITELIST QUALIFIED ★').setColor('#ffcf75');
          title.setText('SMALL PAWS. BIG WIN.');
          hint.setText('↻ RUN AGAIN  ·  R').setFontSize(16).setColor('#c4ef6e').setDepth(13)
            .setInteractive({ useHandCursor: true })
            .on('pointerover', () => hint.setColor('#f4f1df'))
            .on('pointerout', () => hint.setColor('#c4ef6e'))
            .on('pointerdown', (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); restart(); });
          this.add.rectangle(hint.x, hint.y, hint.width + 36, hint.height + 12, COLORS.background, 0.85).setStrokeStyle(1, 0x3d5446).setDepth(12);
          const status = document.getElementById('status');
          if (status) status.textContent = `You qualify for the whitelist with ${outcome.score} points and all coins. Press Enter to apply, or R to run again.`;
          return;
        }
        mode = 'restart';
        hint.setText('SPACE / ↑ / TAP TO RESTART');
        if (outcome.status === 'verified') {
          verdict.setText(`✓ VERIFIED ${outcome.score.toLocaleString()} · ${outcome.coins}/${CONFIG.coins.count} COINS · NOT QUALIFIED YET`).setColor('#c4ef6e');
        } else {
          verdict.setText(`RUN NOT VERIFIED · ${outcome.message.toUpperCase()}`.slice(0, 80)).setColor('#ec8a79');
        }
      });
    }

    const key = (event: KeyboardEvent): void => {
      sound.unlock();
      if (!event.repeat && event.code === 'KeyD' && debug && this.context.lastReplay) {
        const url = URL.createObjectURL(new Blob([JSON.stringify(this.context.lastReplay)], { type: 'application/json' }));
        downloads.add(url);
        const link = document.createElement('a');
        link.href = url;
        link.download = `squeek-${this.context.lastReplay.seed}-${this.context.lastReplay.endTick}.json`;
        link.click();
        this.time.delayedCall(1000, () => { URL.revokeObjectURL(url); downloads.delete(url); });
      }
      if (!event.repeat && mode === 'apply' && ['Space', 'ArrowUp', 'Enter', 'NumpadEnter'].includes(event.code)) apply();
      else if (!event.repeat && mode === 'apply' && event.code === 'KeyR') restart();
      else if (!event.repeat && mode === 'restart' && (event.code === 'Space' || event.code === 'ArrowUp')) restart();
      if (!event.repeat && event.code === 'KeyM') {
        const isMuted = sound.toggleMute();
        this.muteBtn.setMuted(isMuted);
      }
    };

    const pointer = (): void => {
      sound.unlock();
      if (mode === 'restart') restart(); // in 'apply' mode only the buttons act
    };
    this.input.on('pointerdown', pointer);
    this.input.keyboard?.on('keydown', key);

    button.on('pointerover', () => { if (mode !== 'apply') button.setFillStyle(0xd8ffa0); });
    button.on('pointerout', () => { if (mode !== 'apply') button.setFillStyle(COLORS.lime); });
    onSceneExit(this.events, () => {
      this.input.off('pointerdown', pointer);
      this.input.keyboard?.off('keydown', key);
      for (const url of downloads) URL.revokeObjectURL(url);
      downloads.clear();
    });

    const status = document.getElementById('status');
    if (status) {
      status.textContent = `Game over. Score ${result.score}. Best ${this.context.records.best}. Press Space to restart.`;
    }
  }

  /** The run qualified: the main button turns into a glowing golden "apply" call to action. */
  private showApplyButton(button: Phaser.GameObjects.Rectangle, text: Phaser.GameObjects.Text, apply: () => void): void {
    const x = button.x, y = button.y, w = 420, h = 58;
    button.setVisible(false).disableInteractive();
    text.setVisible(false);
    const glow = this.add.rectangle(x, y, w + 26, h + 22, COLORS.gold, 0.35).setDepth(14);
    const halo = this.add.rectangle(x, y, w + 60, h + 30, COLORS.gold, 0.12).setDepth(13);
    const cta = this.add.rectangle(x, y, w, h, COLORS.gold).setStrokeStyle(3, 0xfff1c4).setDepth(15)
      .setInteractive({ useHandCursor: true });
    const ctaText = label(this, x, y, 'APPLY FOR THE WHITELIST  →', 23, '#131b27').setOrigin(0.5).setFontStyle('bold').setDepth(16);
    const shine = this.add.rectangle(x - w / 2, y, 26, h - 6, 0xffffff, 0.35).setAngle(18).setDepth(16);
    const mask = this.make.graphics({}, false).fillRect(x - w / 2, y - h / 2, w, h);
    shine.setMask(mask.createGeometryMask());
    this.tweens.add({ targets: [cta, ctaText], scale: 1.045, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: glow, alpha: 0.08, scaleX: 1.06, scaleY: 1.25, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: halo, alpha: 0.02, scaleX: 1.1, scaleY: 1.4, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: shine, x: x + w / 2, duration: 1100, repeat: -1, repeatDelay: 900, ease: 'Cubic.easeInOut' });
    cta.on('pointerover', () => cta.setFillStyle(0xffe2a3));
    cta.on('pointerout', () => cta.setFillStyle(COLORS.gold));
    cta.on('pointerdown', (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); apply(); });
    // Celebration: a burst of golden sparks around the button.
    for (let i = 0; i < 36; i++) {
      const spark = this.add.image(x + (Math.random() - 0.5) * w, y, i % 3 ? TEXTURES.dust : TEXTURES.star)
        .setScale(i % 3 ? 1.3 : 0.7).setDepth(17).setTint(COLORS.gold);
      const angle = Math.random() * Math.PI * 2, distance = 50 + Math.random() * 120;
      this.tweens.add({
        targets: spark, x: spark.x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance * 0.6,
        alpha: 0, scale: 0.2, angle: 180, duration: 700 + Math.random() * 600, ease: 'Cubic.easeOut', onComplete: () => spark.destroy(),
      });
    }
    sound.playCollectNut();
  }

  update(): void {
    const elapsed = this.time.now;
    // Animate dizzy stars circling around hamster head
    this.orbitingStars.forEach((star, idx) => {
      const angle = elapsed / 400 + (idx * (Math.PI * 2)) / 3;
      star.x = 140 + Math.cos(angle) * 22;
      star.y = CONFIG.groundY - 65 + Math.sin(angle) * 9;
      star.rotation += 0.05;
    });
  }
}
