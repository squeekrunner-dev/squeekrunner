import Phaser from 'phaser';
import { createTextures, TEXTURES } from './textures';
import type { GameContext } from './context';
import { sound } from '../audio/sound';

export class BootScene extends Phaser.Scene {
  constructor(private readonly context: GameContext) {
    super('Boot');
  }

  create(): void {
    createTextures(this);
    this.game.events.once(Phaser.Core.Events.DESTROY, () => sound.dispose());

    // Register hamster running animation (4-frame cycle)
    this.anims.create({
      key: 'hamster-run',
      frames: [
        { key: TEXTURES.hamsterRun1 },
        { key: TEXTURES.hamsterRun2 },
        { key: TEXTURES.hamsterRun3 },
        { key: TEXTURES.hamsterRun4 },
      ],
      frameRate: 11,
      repeat: -1,
    });

    this.context.source.start();
    this.scene.start('Run');
  }
}
