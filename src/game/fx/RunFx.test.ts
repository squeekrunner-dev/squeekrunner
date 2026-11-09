import type Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../config';
import { RunFx } from './RunFx';
import { TEXTURES } from '../textures';

/** Minimal rendering port: tests pool bounds and event lifetimes, without pretending to test pixels. */
class Visual {
  x = 0; y = 0; alpha = 1; visible = true; scaleX = 1; scaleY = 1; angle = 0; depth = 0;
  width = 0; height = 0; text = ''; texture = { key: '' }; frame = { name: '' };
  setPosition(x: number, y: number): this { this.x = x; this.y = y; return this; }
  setScale(x: number, y = x): this { this.scaleX = x; this.scaleY = y; return this; }
  setAlpha(alpha: number): this { this.alpha = alpha; return this; }
  setVisible(visible: boolean): this { this.visible = visible; return this; }
  setDepth(depth: number): this { this.depth = depth; return this; }
  setTexture(key: string, frame = ''): this { this.texture.key = key; this.frame.name = frame; return this; }
  setAngle(angle: number): this { this.angle = angle; return this; }
  setText(text: string): this { this.text = text; return this; }
  setDisplaySize(width: number, height: number): this { this.width = width; this.height = height; return this; }
  setSize(width: number, height: number): this { return this.setDisplaySize(width, height); }
  setOrigin(): this { return this; }
  setFontStyle(): this { return this; }
  setStroke(): this { return this; }
  setBlendMode(): this { return this; }
}

function harness() {
  const media = { matches: false };
  vi.stubGlobal('window', { matchMedia: () => media });
  const objects: Visual[] = [];
  const add = (x: number, y: number, key = ''): Visual => {
    const object = new Visual().setPosition(x, y).setTexture(key);
    objects.push(object); return object;
  };
  const shakeEffect = { isRunning: false, reset: vi.fn(() => { shakeEffect.isRunning = false; }) };
  const camera = { width: 1200, scrollX: -120, shakeEffect, shake: vi.fn() };
  const scene = { add: { image: add, rectangle: (x: number, y: number) => add(x, y), text: add }, cameras: { main: camera } };
  const hub = new Visual();
  const fx = new RunFx(scene as unknown as Phaser.Scene, hub as unknown as Phaser.GameObjects.Graphics);
  const player = new Visual().setPosition(156, 416).setTexture(TEXTURES.hamsterJump) as unknown as Phaser.GameObjects.Sprite;
  const step = (t = 1, grounded = true, dt = 1 / 60, playing = true): void => fx.update(dt, t, 783, player, grounded, playing);
  const visible = (key: string): Visual[] => objects.filter(o => o.texture.key === key && o.visible);
  return { fx, hub, objects, media, camera, player, step, visible };
}

afterEach(() => vi.unstubAllGlobals());

describe('RunFx presentation lifecycle', () => {
  it('reuses bounded pools across sustained peak speed and simultaneous bursts', () => {
    const h = harness(), created = h.objects.length;
    for (let i = 0; i < 120; i++) h.step(0);
    const slow = h.visible(TEXTURES.dust).length;
    for (let i = 0; i < 120; i++) h.step();
    expect(h.visible(TEXTURES.dust).length).toBeGreaterThan(slow * 5);
    for (let i = 0; i < 100; i++) { h.fx.dust(156, 413, 100); h.fx.collect(156, 380, i % 2 === 0); }
    expect(h.objects).toHaveLength(created);
    expect(h.visible(TEXTURES.dust)).toHaveLength(CONFIG.fx.dust.pool);
    expect(h.visible(TEXTURES.sparkBlue).length + h.visible(TEXTURES.sparkGold).length).toBe(CONFIG.fx.sparks.pool);
    // Peak-speed dust lives up to life + lifeBoost (~1.33 s); wait 1.5 s.
    for (let i = 0; i < 90; i++) h.step(0, false, 1 / 60, false);
    expect(h.visible(TEXTURES.dust)).toHaveLength(0);
    expect(h.visible(TEXTURES.sparkBlue).length + h.visible(TEXTURES.sparkGold).length).toBe(0);
  });

  it('preserves impact shake, respects live reduced-motion changes, and stops wind on pause', () => {
    const h = harness();
    h.camera.shakeEffect.isRunning = true;
    h.step();
    expect(h.camera.shake).not.toHaveBeenCalled();
    expect(h.visible(TEXTURES.speedLine)).toHaveLength(CONFIG.fx.wind.pool);
    h.media.matches = true;
    h.step();
    expect(h.camera.shakeEffect.reset).toHaveBeenCalledOnce();
    expect(h.camera.shake).not.toHaveBeenCalled();
    expect(h.visible(TEXTURES.speedLine).length).toBeLessThan(CONFIG.fx.wind.pool / 2);
    h.fx.stopMotion();
    expect(h.visible(TEXTURES.speedLine)).toHaveLength(0);
    expect(h.objects.find(o => o.texture.key === TEXTURES.vignette)?.alpha).toBe(0);
  });

  it('queues catch-up milestones once, with finite lifetimes', () => {
    const h = harness();
    h.fx.observeScore(100150); h.fx.observeScore(100150);
    const text = h.objects.find(o => o.depth === 19)!;
    const titles: string[] = [];
    for (let i = 0; i < 300; i++) {
      h.step(0, false);
      if (text.visible && !titles.includes(text.text)) titles.push(text.text);
    }
    expect(titles).toEqual(['25,000!', '50,000!\nHALFWAY TO WHITELIST', '100,000!\nWHITELIST SCORE!']);
    expect(text.visible).toBe(false);
  });

  it('flashes the wheel, follows collectibles on a wide viewport, and fades air-jump ghosts', () => {
    const h = harness();
    h.fx.newBlock(); h.fx.airJump(); h.step(1, false, 0.1);
    expect(h.hub.scaleX).toBeGreaterThan(1);
    expect(h.objects.find(o => o.depth === 10)?.width).toBe(1200);
    expect(h.objects.find(o => o.depth === 10)?.x).toBe(-120);
    expect(h.visible(TEXTURES.hamsterJump)).toHaveLength(1);
    h.fx.collectibles(h.player, h.player);
    expect(h.visible(TEXTURES.glowBlue)[0].x).toBe(h.player.x);
    expect(h.visible(TEXTURES.glowGold)[0].y).toBe(h.player.y);
    h.fx.collectibles(null, null);
    for (let i = 0; i < 60; i++) h.step(0, false);
    expect(h.hub.scaleX).toBe(1);
    expect(h.visible(TEXTURES.hamsterJump)).toHaveLength(0);
    expect(h.visible(TEXTURES.glowBlue)).toHaveLength(0);
    expect(h.visible(TEXTURES.glowGold)).toHaveLength(0);
  });

  it('unstoppable: comet fire, wings and ghosts stay within their pools and clear after it ends', () => {
    const h = harness(), created = h.objects.length;
    h.fx.setUnstoppable(true);
    for (let i = 0; i < 240; i++) h.step(1, true);
    expect(h.visible(TEXTURES.flameHot).length + h.visible(TEXTURES.flameMid).length + h.visible(TEXTURES.flameCool).length)
      .toBeGreaterThan(10);
    expect(h.visible(TEXTURES.wing)).toHaveLength(1);
    expect(h.objects).toHaveLength(created);
    h.fx.setUnstoppable(false);
    for (let i = 0; i < 120; i++) h.step(1, true);
    expect(h.visible(TEXTURES.flameHot).length + h.visible(TEXTURES.flameMid).length + h.visible(TEXTURES.flameCool).length).toBe(0);
    expect(h.visible(TEXTURES.wing)).toHaveLength(0);
  });
});

