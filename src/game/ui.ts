import Phaser from 'phaser';
import { CONFIG } from '../config';
import { COLORS } from './textures';
import { sound } from '../audio/sound';

export const FONT = '"Trebuchet MS", Arial, sans-serif';
export const MONO = 'Consolas, "Courier New", monospace';

export function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 18,
  color = '#f4f1df',
  mono = false,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, {
    fontFamily: mono ? MONO : FONT,
    fontSize: `${size}px`,
    color,
  });
}

export function backdrop(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(COLORS.background).fillRect(0, 0, CONFIG.width, CONFIG.height);
  g.fillStyle(0x15222d).fillRect(0, 110, CONFIG.width, CONFIG.groundY - 110);
  // Warm ambient starfield / ceiling speckles
  for (let i = 0; i < 28; i++) {
    const sx = (i * 137 + 39) % CONFIG.width;
    const sy = 120 + (i * 47) % 250;
    g.fillStyle(0x78918a, i % 2 === 0 ? 0.3 : 0.18).fillCircle(sx, sy, i % 3 === 0 ? 2 : 1);
  }
  // Subtle top border divider
  g.lineStyle(1, 0x2b3d4a, 0.8).lineBetween(20, 108, CONFIG.width - 20, 108);
}

export function compactHeight(height: bigint | null): string {
  if (height === null) return '—';
  const text = height.toString();
  return text.length > 11 ? `…${text.slice(-10)}` : text;
}

export function pill(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: number,
): Phaser.GameObjects.Container {
  const bg = scene.add.rectangle(0, 0, text.length * 10 + 26, 30, color).setOrigin(0);
  const caption = label(scene, 13, 5, text, 16, '#131b27', true).setFontStyle('bold');
  return scene.add.container(x, y, [bg, caption]);
}

/**
 * Reusable interactive mute toggle button.
 */
export function createMuteButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  initialMuted: boolean,
  onToggle: () => void,
): { container: Phaser.GameObjects.Container; setMuted: (muted: boolean) => void } {
  const bg = scene.add
    .rectangle(0, 0, 104, 28, 0x1d2e3b, 0.9)
    .setOrigin(0.5)
    .setStrokeStyle(1, 0x3d5466)
    .setInteractive({ useHandCursor: true });

  const text = label(
    scene,
    0,
    0,
    initialMuted ? '🔇 MUTED [M]' : '🔊 SOUND [M]',
    12,
    initialMuted ? '#ec8a79' : '#c4ef6e',
    true,
  )
    .setOrigin(0.5)
    .setFontStyle('bold');

  bg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    sound.unlock();
    onToggle();
  });
  bg.on('pointerover', () => bg.setFillStyle(0x283e4f));
  bg.on('pointerout', () => bg.setFillStyle(0x1d2e3b));

  const container = scene.add.container(x, y, [bg, text]).setDepth(25);

  const setMuted = (muted: boolean): void => {
    text.setText(muted ? '🔇 MUTED [M]' : '🔊 SOUND [M]');
    text.setColor(muted ? '#ec8a79' : '#c4ef6e');
  };

  return { container, setMuted };
}
