import Phaser from 'phaser';
import { CONFIG } from '../config';
import type { GameContext, RunResult } from './context';
import { COLORS, TEXTURES } from './textures';
import { backdrop, label, pill } from './ui';

export class GameOverScene extends Phaser.Scene {
  constructor(private readonly context: GameContext) { super('GameOver'); }

  create(result: RunResult): void {
    backdrop(this);
    this.add.tileSprite(0, CONFIG.groundY, CONFIG.width, 36, TEXTURES.ground).setOrigin(0);
    label(this, 28, 18, 'SQUEEK / RUNNER', 17, '#c4ef6e', true);
    if (result.demo) pill(this, 830, 17, 'DEMO', COLORS.gold);
    label(this, 480, 68, result.newBest ? 'A NEW PERSONAL BEST' : 'ONE MORE RUN?', 16, '#c4ef6e', true).setOrigin(0.5);
    label(this, 480, 114, 'SMALL PAWS. BIG TRY.', 43).setOrigin(0.5).setFontStyle('bold');
    this.add.rectangle(480, 238, 650, 175, COLORS.background, 0.96).setStrokeStyle(1, 0x405248);
    label(this, 270, 170, 'YOUR SCORE', 14, '#8b9ba6', true).setOrigin(0.5);
    label(this, 270, 218, result.score.toLocaleString(), 50, '#ffcf75').setOrigin(0.5).setFontStyle('bold');
    label(this, 270, 275, `${result.distance} m travelled`, 17, '#8b9ba6').setOrigin(0.5);
    label(this, 550, 172, `BEST EVER    ${result.best.toLocaleString()}`, 21);
    label(this, 550, 212, `BLOCK BEST   ${result.runBlock ? result.blockBest.toLocaleString() : '—'}`, 21);
    label(this, 480, 307, result.runBlock ? `Run pinned to block #${result.runBlock.height}` : 'No confirmed block was available for this run', 15, '#8b9ba6', true).setOrigin(0.5);
    const button = this.add.rectangle(480, 371, 294, 50, COLORS.lime).setInteractive({ useHandCursor: true });
    label(this, 480, 371, 'RUN AGAIN  →', 23, '#131b27').setOrigin(0.5).setFontStyle('bold');
    this.add.image(140, CONFIG.groundY, TEXTURES.hamster).setOrigin(0.5, 1);
    label(this, 480, 466, 'SPACE / ↑ / TAP TO RESTART', 19, '#c4ef6e', true).setOrigin(0.5);
    label(this, 480, 501, result.demo ? 'DEMO · Simulated wheel. Separate local records.' : 'A fresh run. The same real wheel. No wallet needed.', 16, '#8b9ba6').setOrigin(0.5);
    let restarting = false;
    const restart = (): void => {
      if (restarting) return;
      restarting = true;
      this.scene.start('Run', { immediate: true });
    };
    const key = (event: KeyboardEvent): void => {
      if (!event.repeat && (event.code === 'Space' || event.code === 'ArrowUp')) restart();
    };
    this.input.once('pointerdown', restart);
    this.input.keyboard?.on('keydown', key);
    button.on('pointerover', () => button.setFillStyle(0xd6ffa2));
    button.on('pointerout', () => button.setFillStyle(COLORS.lime));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', restart);
      this.input.keyboard?.off('keydown', key);
    });
    const status = document.getElementById('status');
    if (status) status.textContent = `Game over. Score ${result.score}. Best ${this.context.records.best}. Press Space to restart.`;
  }
}
