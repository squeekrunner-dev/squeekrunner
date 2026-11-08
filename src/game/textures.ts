import Phaser from 'phaser';

/** Replace these generated textures with loaded art without changing scene logic. */
export const TEXTURES = {
  hamster: 'hamster', obstacle: 'obstacle', nut: 'golden-nut', ground: 'ground', dust: 'dust',
} as const;

export const COLORS = {
  background: 0x131b27, panel: 0x1d2b39, muted: 0x8b9ba6,
  light: 0xf4f1df, lime: 0xc4ef6e, gold: 0xffcf75, blue: 0x81cce4, danger: 0xec8a79,
} as const;

export function createTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 });
  // A compact, readable hamster silhouette. Physics bounds are defined independently.
  g.fillStyle(0xb57954).fillEllipse(27, 32, 46, 39);
  g.fillStyle(0xf2c28f).fillEllipse(34, 29, 45, 39);
  g.fillStyle(0xf7dfb3).fillEllipse(45, 37, 25, 22);
  g.fillStyle(0xeebc88).fillCircle(31, 9, 10);
  g.fillStyle(0xd08a7c).fillCircle(32, 9, 5);
  g.fillStyle(0x16202d).fillCircle(46, 23, 3.8).fillCircle(57, 34, 2.6);
  g.fillStyle(0xffffff).fillCircle(47, 22, 1.2);
  g.fillStyle(0xd39465).fillRoundedRect(10, 44, 17, 9, 4).fillRoundedRect(35, 44, 17, 9, 4);
  g.fillStyle(0xefc28d).fillCircle(5, 38, 5);
  g.generateTexture(TEXTURES.hamster, 64, 56);
  g.clear();
  g.fillStyle(0x293c4d).fillRoundedRect(0, 0, 56, 68, 7);
  g.lineStyle(2, COLORS.danger).strokeRoundedRect(1, 1, 54, 66, 7);
  g.fillStyle(COLORS.danger).fillTriangle(14, 35, 28, 12, 42, 35);
  g.fillStyle(COLORS.background).fillRect(26, 20, 4, 8).fillCircle(28, 32, 2);
  g.fillStyle(0x3d4a52).fillRect(7, 49, 42, 5).fillRect(7, 59, 42, 3);
  g.generateTexture(TEXTURES.obstacle, 56, 68);
  g.clear();
  g.fillStyle(COLORS.gold).fillEllipse(17, 20, 25, 29);
  g.lineStyle(2, 0xd49250).strokeEllipse(17, 20, 25, 29);
  g.lineStyle(2, 0xffedb7).lineBetween(18, 9, 12, 28);
  g.fillStyle(0x98653f).fillRoundedRect(3, 5, 28, 9, 4);
  g.fillStyle(COLORS.lime).fillEllipse(22, 4, 11, 6);
  g.generateTexture(TEXTURES.nut, 36, 38);
  g.clear();
  g.fillStyle(0x21332c).fillRect(0, 0, 96, 36);
  g.fillStyle(COLORS.lime).fillRect(0, 0, 96, 3);
  g.fillStyle(0x526b46).fillRect(12, 14, 17, 2).fillRect(64, 24, 12, 2);
  g.generateTexture(TEXTURES.ground, 96, 36);
  g.clear();
  g.fillStyle(COLORS.gold).fillCircle(3, 3, 3);
  g.generateTexture(TEXTURES.dust, 6, 6);
  g.destroy();
}
