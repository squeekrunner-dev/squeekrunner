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
import { ApiClient } from './net/api';
import { ServerSource } from './net/source';
import type { TelemetrySource } from './chain/types';

const demo = new URLSearchParams(window.location.search).get('demo') === '1';
// Without VITE_API_BASE the game is a pure client exactly as before (no ranked runs).
const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() ?? '';
const api = !demo && apiBase ? new ApiClient(apiBase) : undefined;
const source: TelemetrySource = demo ? new DemoSource() : api ? new ServerSource(api) : new LiveSource();
const context: GameContext = {
  source, records: new RecordStore(source.kind), api,
  turnstileSiteKey: (import.meta.env.VITE_TURNSTILE_SITEKEY as string | undefined)?.trim() ?? '',
};
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
  scene: [new BootScene(context), new RunScene(context), new GameOverScene(context)],
});

game.events.once(Phaser.Core.Events.DESTROY, bindPageLifecycle(source));
// Dev server only: lets local tooling inspect the running scenes (stripped from production builds).
if (import.meta.env.DEV) (window as unknown as { __squeekGame?: Phaser.Game }).__squeekGame = game;
