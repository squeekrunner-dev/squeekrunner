import Phaser from 'phaser';
import { CONFIG } from '../config';
import { COLORS } from './textures';

export const FONT = '"Trebuchet MS", Arial, sans-serif';
export const MONO = 'Consolas, "Courier New", monospace';

export function label(scene: Phaser.Scene, x: number, y: number, text: string, size = 18,
  color = '#f4f1df', mono = false): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { fontFamily: mono ? MONO : FONT, fontSize: `${size}px`, color });
}

export function backdrop(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(COLORS.background).fillRect(0, 0, CONFIG.width, CONFIG.height);
  g.fillStyle(0x172531).fillRect(0, 124, CONFIG.width, CONFIG.groundY - 124);
  for (let i = 0; i < 20; i++) {
    g.fillStyle(0x78918a, 0.24).fillCircle((i * 149 + 39) % CONFIG.width, 155 + (i * 47) % 170, i % 3 === 0 ? 2 : 1);
  }
  g.fillStyle(0x1e343c).fillPoints([
    { x: 0, y: 375 }, { x: 110, y: 297 }, { x: 215, y: 374 }, { x: 360, y: 265 },
    { x: 490, y: 374 }, { x: 650, y: 294 }, { x: 790, y: 365 }, { x: 960, y: 280 },
    { x: 960, y: 416 }, { x: 0, y: 416 },
  ], true);
  g.fillStyle(0x20342f).fillPoints([
    { x: 0, y: 395 }, { x: 145, y: 365 }, { x: 330, y: 399 }, { x: 575, y: 358 },
    { x: 770, y: 400 }, { x: 960, y: 365 }, { x: 960, y: 416 }, { x: 0, y: 416 },
  ], true);
  g.lineStyle(1, 0x344550).lineBetween(28, 122, 932, 122);
}

export function compactHeight(height: bigint | null): string {
  if (height === null) return '—';
  const text = height.toString();
  return text.length > 11 ? `…${text.slice(-10)}` : text;
}

export function pill(scene: Phaser.Scene, x: number, y: number, text: string, color: number): Phaser.GameObjects.Container {
  const bg = scene.add.rectangle(0, 0, text.length * 10 + 26, 30, color).setOrigin(0);
  const caption = label(scene, 13, 5, text, 16, '#131b27', true).setFontStyle('bold');
  return scene.add.container(x, y, [bg, caption]);
}
