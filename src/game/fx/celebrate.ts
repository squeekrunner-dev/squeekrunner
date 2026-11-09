import type Phaser from 'phaser';
import { CONFIG } from '../../config';
import { TEXTURES } from '../textures';
import { reducedMotion } from './profile';

/** Called only on the server-verified, eligible ('apply') path. One bounded burst per verdict. */
export function celebrateQualification(scene: Phaser.Scene): void {
  const fx = CONFIG.fx.celebration, reduced = reducedMotion();
  const count = reduced ? fx.reducedCount : fx.count;
  for (let i = 0; i < count; i++) {
    // Keep the fireworks to the sides so the score and application CTA remain readable.
    const x = i % 2 ? 100 : CONFIG.width - 100, y = 155 + Math.random() * 140;
    const particle = scene.add.image(x, y, i % 4 ? TEXTURES.sparkGold : TEXTURES.sparkBlue)
      .setDepth(14).setScale(0.8 + Math.random()).setAlpha(0);
    const angle = Math.random() * Math.PI * 2;
    const radius = fx.spread * (0.3 + Math.random() * 0.7) * (reduced ? 0.25 : 1);
    scene.tweens.add({
      targets: particle, delay: Math.random() * fx.staggerMs,
      x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius + (reduced ? 0 : 80),
      alpha: { from: 1, to: 0 }, scale: 0.2, angle: reduced ? 0 : 180,
      duration: fx.durationMs, ease: 'Cubic.easeOut', onComplete: () => particle.destroy(),
    });
  }
}
