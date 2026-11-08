import Phaser from 'phaser';
import { CONFIG } from '../config';

/**
 * Wide screens (phones held sideways are ~20:9) get a wider view instead of black side bars. The playfield stays
 * the same 960×540 design in the centre; extra width (up to MAX_WIDTH) shows more background on both sides.
 * Rendering only: the simulation never sees the view size.
 */
import { MAX_PAD, viewWidth } from './viewSize';
export { MAX_PAD, MAX_WIDTH, viewWidth } from './viewSize';

/** Resizes the game to the parent's aspect (FIT then fills it without bars up to MAX_WIDTH). */
export function bindViewport(game: Phaser.Game, parent: HTMLElement): () => void {
  let frame = 0;
  const apply = (): void => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const width = viewWidth(parent.clientWidth, parent.clientHeight);
      if (game.scale.gameSize.width !== width) game.scale.setGameSize(width, CONFIG.height);
    });
  };
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  game.events.once(Phaser.Core.Events.READY, apply);
  apply();
  return () => { window.removeEventListener('resize', apply); window.removeEventListener('orientationchange', apply); };
}

/** Keeps the 960-wide design centred in the camera, now and on every resize. */
export function centerCamera(scene: Phaser.Scene): void {
  const update = (): void => {
    const pad = (scene.scale.gameSize.width - CONFIG.width) / 2;
    scene.cameras.main.setScroll(-pad, 0);
  };
  update();
  scene.scale.on(Phaser.Scale.Events.RESIZE, update);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, update));
}

/** Soft dark fades over the extra side areas, so obstacles do not pop in or out of view abruptly. */
export function sideFades(scene: Phaser.Scene, top: number, height: number, depth: number): void {
  const key = 'side-fade';
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, MAX_PAD, 4)!;
    const ctx = texture.getContext();
    const gradient = ctx.createLinearGradient(0, 0, MAX_PAD, 0);
    gradient.addColorStop(0, 'rgba(19,27,39,0.95)');
    gradient.addColorStop(0.55, 'rgba(19,27,39,0.55)');
    gradient.addColorStop(1, 'rgba(19,27,39,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, MAX_PAD, 4);
    texture.refresh();
  }
  scene.add.image(-MAX_PAD, top, key).setOrigin(0).setDisplaySize(MAX_PAD, height).setDepth(depth);
  scene.add.image(CONFIG.width + MAX_PAD, top, key).setOrigin(0).setDisplaySize(MAX_PAD, height).setDepth(depth).setFlipX(true)
    .setOrigin(1, 0);
}
