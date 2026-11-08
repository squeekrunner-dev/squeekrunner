import Phaser from 'phaser';
import { CONFIG } from '../config';
import { onSceneExit } from '../logic/lifecycle';
import { sound } from '../audio/sound';
import type { GameContext, RunResult } from './context';
import { COLORS, TEXTURES } from './textures';
import { backdrop, createMuteButton, label, pill } from './ui';

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
    this.add.tileSprite(0, 80, CONFIG.width, 280, TEXTURES.bgFar).setOrigin(0).setDepth(1);
    this.add.tileSprite(0, 236, CONFIG.width, 180, TEXTURES.bgMid).setOrigin(0).setDepth(2);
    this.add.tileSprite(0, CONFIG.groundY, CONFIG.width, 36, TEXTURES.ground).setOrigin(0).setDepth(3);

    // Brand and Demo pill (depth 10)
    label(this, 28, 16, 'SQUEEK / RUNNER', 16, '#c4ef6e', true).setFontStyle('bold').setDepth(10);
    if (result.demo) {
      pill(this, 830, 14, 'DEMO', COLORS.gold).setDepth(10);
    }

    // Mute button (depth 25)
    this.muteBtn = createMuteButton(this, 735, 28, sound.isMuted(), () => {
      const isMuted = sound.toggleMute();
      this.muteBtn.setMuted(isMuted);
    });

    // Top Header: Kicker (y = 50) and Title (y = 80)
    const kickerText = result.newBest ? '★ NEW ALL-TIME RECORD! ★' : 'ONE MORE RUN?';
    label(this, 480, 50, kickerText, 15, result.newBest ? '#ffcf75' : '#c4ef6e', true)
      .setOrigin(0.5)
      .setFontStyle('bold')
      .setDepth(10);

    label(this, 480, 80, 'SMALL PAWS. BIG TRY.', 32)
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
    label(this, 480, 348, 'RUN AGAIN  →', 22, '#131b27')
      .setOrigin(0.5)
      .setFontStyle('bold')
      .setDepth(16);

    // Bottom hints
    label(this, 480, 442, 'SPACE / ↑ / TAP TO RESTART', 18, '#c4ef6e', true)
      .setOrigin(0.5)
      .setDepth(12);
    label(
      this,
      480,
      478,
      result.demo
        ? 'DEMO · Simulated wheel. Separate local records.'
        : 'A fresh run. The same real wheel. No wallet needed.',
      14,
      '#8b9ba6',
    ).setOrigin(0.5).setDepth(12);

    // Ranked run: show the server's verdict (its score is the only one that counts for the raffle).
    if (result.ranked && this.context.submission) {
      const verdict = label(this, 480, 398, 'VERIFYING RUN WITH THE SERVER…', 15, '#81cce4', true)
        .setOrigin(0.5).setDepth(16);
      void this.context.submission.then(outcome => {
        if (!verdict.active) return;
        if (outcome.status === 'verified' && outcome.eligible) {
          verdict.setText(`✓ VERIFIED ${outcome.score.toLocaleString()} · YOU QUALIFY · ENTER THE RAFFLE →`).setColor('#ffcf75')
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
              event.stopPropagation();
              window.location.assign(new URL('../whitelist/', window.location.href).href);
            });
        } else if (outcome.status === 'verified') {
          verdict.setText(`✓ VERIFIED ${outcome.score.toLocaleString()} · ${outcome.coins}/${CONFIG.coins.count} COINS · NOT RAFFLE-ELIGIBLE YET`).setColor('#c4ef6e');
        } else {
          verdict.setText(`RUN NOT VERIFIED · ${outcome.message.toUpperCase()}`.slice(0, 80)).setColor('#ec8a79');
        }
      });
    }

    let restarting = false;
    const restart = (): void => {
      if (restarting) return;
      restarting = true;
      sound.playUiClick();
      this.scene.start('Run', { immediate: true });
    };

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
      if (!event.repeat && (event.code === 'Space' || event.code === 'ArrowUp')) restart();
      if (!event.repeat && event.code === 'KeyM') {
        const isMuted = sound.toggleMute();
        this.muteBtn.setMuted(isMuted);
      }
    };

    const pointer = (): void => {
      sound.unlock();
      restart();
    };
    this.input.on('pointerdown', pointer);
    this.input.keyboard?.on('keydown', key);

    button.on('pointerover', () => button.setFillStyle(0xd8ffa0));
    button.on('pointerout', () => button.setFillStyle(COLORS.lime));
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
