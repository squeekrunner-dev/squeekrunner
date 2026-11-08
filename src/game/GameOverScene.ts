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

    // Parallax background & ground preview
    this.add.tileSprite(0, 80, CONFIG.width, 280, TEXTURES.bgFar).setOrigin(0).setDepth(0);
    this.add.tileSprite(0, 236, CONFIG.width, 180, TEXTURES.bgMid).setOrigin(0).setDepth(1);
    this.add.tileSprite(0, CONFIG.groundY, CONFIG.width, 36, TEXTURES.ground).setOrigin(0).setDepth(2);

    // Brand and Demo pill
    label(this, 28, 16, 'SQUEEK / RUNNER', 16, '#c4ef6e', true).setFontStyle('bold').setDepth(10);
    if (result.demo) {
      pill(this, 830, 14, 'DEMO', COLORS.gold).setDepth(10);
    }

    // Mute button
    this.muteBtn = createMuteButton(this, 740, 30, sound.isMuted(), () => {
      const isMuted = sound.toggleMute();
      this.muteBtn.setMuted(isMuted);
    });

    // Top Header
    const kickerText = result.newBest ? '★ NEW ALL-TIME RECORD! ★' : 'ONE MORE RUN?';
    label(this, 480, 56, kickerText, 16, result.newBest ? '#ffcf75' : '#c4ef6e', true)
      .setOrigin(0.5)
      .setFontStyle('bold');

    label(this, 480, 96, 'SMALL PAWS. BIG TRY.', 38)
      .setOrigin(0.5)
      .setFontStyle('bold');

    // Central Card Container
    this.add.rectangle(480, 236, 660, 180, COLORS.background, 0.95)
      .setStrokeStyle(2, result.newBest ? COLORS.gold : 0x3d5446);

    label(this, 260, 166, 'YOUR SCORE', 13, '#8b9ba6', true).setOrigin(0.5);

    // Score ticker text
    const scoreVal = label(this, 260, 215, '0', 48, '#ffcf75')
      .setOrigin(0.5)
      .setFontStyle('bold');

    // Smooth count-up tween
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

    label(this, 260, 268, `${result.distance} m travelled`, 16, '#b6c2bc').setOrigin(0.5);

    // Right side record comparisons
    this.add.line(400, 236, 0, -65, 0, 65, 0x2e424e);

    label(this, 440, 168, 'BEST EVER', 12, '#8b9ba6', true);
    label(this, 620, 168, result.best.toLocaleString(), 22, '#f4f1df').setOrigin(1, 0.3);

    label(this, 440, 208, 'BLOCK BEST', 12, '#8b9ba6', true);
    label(this, 620, 208, result.runBlock ? result.blockBest.toLocaleString() : '—', 22, '#f4f1df').setOrigin(1, 0.3);

    label(
      this,
      480,
      304,
      result.runBlock ? `Run pinned to block #${result.runBlock.height}` : 'No confirmed block was available for this run',
      14,
      '#8b9ba6',
      true,
    ).setOrigin(0.5);

    // Play button
    const button = this.add.rectangle(480, 370, 294, 50, COLORS.lime).setInteractive({ useHandCursor: true });
    label(this, 480, 370, 'RUN AGAIN  →', 22, '#131b27').setOrigin(0.5).setFontStyle('bold');

    // Hamster sprite in stunned pose on track
    this.add.image(140, CONFIG.groundY, TEXTURES.hamsterHit).setOrigin(0.5, 1);

    // Orbiting dizzy stars above hamster's head
    this.orbitingStars = [];
    for (let i = 0; i < 3; i++) {
      const star = this.add.image(140, CONFIG.groundY - 50, TEXTURES.star).setScale(0.8);
      this.orbitingStars.push(star);
    }

    // Celebration golden particle burst if newBest
    if (result.newBest) {
      for (let i = 0; i < 28; i++) {
        const p = this.add.image(260, 215, TEXTURES.dust).setScale(1.2).setAlpha(0.9);
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 85;
        this.tweens.add({
          targets: p,
          x: 260 + Math.cos(angle) * dist,
          y: 215 + Math.sin(angle) * dist,
          alpha: 0,
          scale: 0.2,
          duration: 600 + Math.random() * 400,
          onComplete: () => p.destroy(),
        });
      }
    }

    label(this, 480, 464, 'SPACE / ↑ / TAP TO RESTART', 18, '#c4ef6e', true).setOrigin(0.5);
    label(
      this,
      480,
      498,
      result.demo
        ? 'DEMO · Simulated wheel. Separate local records.'
        : 'A fresh run. The same real wheel. No wallet needed.',
      15,
      '#8b9ba6',
    ).setOrigin(0.5);

    let restarting = false;
    const restart = (): void => {
      if (restarting) return;
      restarting = true;
      sound.playUiClick();
      this.scene.start('Run', { immediate: true });
    };

    const key = (event: KeyboardEvent): void => {
      sound.unlock();
      if (!event.repeat && (event.code === 'Space' || event.code === 'ArrowUp')) restart();
      if (!event.repeat && event.code === 'KeyM') {
        const isMuted = sound.toggleMute();
        this.muteBtn.setMuted(isMuted);
      }
    };

    this.input.once('pointerdown', () => {
      sound.unlock();
      restart();
    });
    this.input.keyboard?.on('keydown', key);

    button.on('pointerover', () => button.setFillStyle(0xd8ffa0));
    button.on('pointerout', () => button.setFillStyle(COLORS.lime));
    button.on('pointerdown', (e: Phaser.Input.Pointer) => {
      e.event.stopPropagation();
      restart();
    });

    onSceneExit(this.events, () => {
      this.input.off('pointerdown', restart);
      this.input.keyboard?.off('keydown', key);
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
      star.x = 140 + Math.cos(angle) * 18;
      star.y = CONFIG.groundY - 52 + Math.sin(angle) * 7;
      star.rotation += 0.05;
    });
  }
}
