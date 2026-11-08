import Phaser from 'phaser';
import { CONFIG } from './config';
import { LiveSource } from './chain/live';
import { DemoSource } from './chain/demo';
import { bindPageLifecycle } from './chain/lifecycle';
import { RecordStore } from './logic/records';
import { BootScene } from './game/BootScene';
import { RunScene } from './game/RunScene';
import { GameOverScene } from './game/GameOverScene';
import type { GameContext } from './game/context';

const source = new URLSearchParams(window.location.search).get('demo') === '1' ? new DemoSource() : new LiveSource();
const context: GameContext = { source, records: new RecordStore(source.kind) };
const game = new Phaser.Game({
  // The MVP uses 2D textures only; Canvas also works without a WebGL device.
  type: Phaser.CANVAS,
  audio: { noAudio: true },
  parent: 'game',
  backgroundColor: '#131b27',
  scale: {
    mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH,
    width: CONFIG.width, height: CONFIG.height,
  },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: CONFIG.gravity }, debug: false } },
  scene: [new BootScene(context), new RunScene(context), new GameOverScene(context)],
});

game.events.once(Phaser.Core.Events.DESTROY, bindPageLifecycle(source));
