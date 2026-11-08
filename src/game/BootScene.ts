import Phaser from 'phaser';
import { createTextures } from './textures';
import type { GameContext } from './context';

export class BootScene extends Phaser.Scene {
  constructor(private readonly context: GameContext) { super('Boot'); }
  create(): void {
    createTextures(this);
    this.context.source.start();
    this.scene.start('Run');
  }
}
