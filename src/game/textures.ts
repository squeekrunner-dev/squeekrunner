import Phaser from 'phaser';

/**
 * Procedural textures and palette for SqueekRunner.
 * Handcrafted vector graphics generated at runtime via Phaser Canvas Graphics.
 * No external image files, no licensed assets, 100% original cozy hamster theme.
 */

export const TEXTURES = {
  // Hamster animation frames
  hamster: 'hamster',
  hamsterRun1: 'hamster-run-1',
  hamsterRun2: 'hamster-run-2',
  hamsterRun3: 'hamster-run-3',
  hamsterRun4: 'hamster-run-4',
  hamsterJump: 'hamster-jump',
  hamsterFall: 'hamster-fall',
  hamsterHit: 'hamster-hit',

  // Obstacle variants (all share 56x68 canvas, exact 48x64 hitbox)
  obstacle: 'obstacle',
  obstacleCrate: 'obstacle-crate',
  obstacleSprocket: 'obstacle-sprocket',
  obstacleBattery: 'obstacle-battery',

  // Collectibles & Effects
  nut: 'golden-nut',
  coin: 'whitelist-coin',
  shield: 'shield-bubble',
  ground: 'ground',
  bgFar: 'bg-far',
  bgMid: 'bg-mid',
  dust: 'dust',
  speedLine: 'speed-line',
  star: 'star',
} as const;

export const COLORS = {
  background: 0x131b27,
  panel: 0x1d2b39,
  muted: 0x8b9ba6,
  light: 0xf4f1df,
  lime: 0xc4ef6e,
  gold: 0xffcf75,
  blue: 0x81cce4,
  danger: 0xec8a79,
  // Warm hamster world accents
  woodDark: 0x2a1a10,
  woodMid: 0x4d3220,
  woodLight: 0x7c5335,
  furMain: 0xd9833b,
  furLight: 0xf0aa65,
  furShadow: 0xa8561d,
  furBelly: 0xffeed9,
  pinkSoft: 0xf5a6b3,
  amberGlow: 0xffaa2b,
} as const;

/**
 * Generate all procedural game textures onto the Phaser texture manager.
 */
export function createTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 });

  // -------------------------------------------------------------
  // 1. HAMSTER ANIMATION FRAMES (64x56)
  // Physics bounds in sim/core.ts: 42x44 with offset (13, 12)
  // -------------------------------------------------------------

  const drawHamsterBase = (
    bodyX: number,
    bodyY: number,
    bodyW: number,
    bodyH: number,
    earX: number,
    earY: number,
    eyeX: number,
    eyeY: number,
    cheekX: number,
    cheekY: number,
    tailX: number,
    tailY: number,
  ): void => {
    // Tail
    g.fillStyle(COLORS.furLight).fillCircle(tailX, tailY, 5);
    g.fillStyle(COLORS.pinkSoft).fillCircle(tailX - 1, tailY, 2.5);

    // Back leg shadow
    g.fillStyle(COLORS.furShadow).fillEllipse(bodyX - 10, bodyY + 12, 16, 12);

    // Main body (plump bean silhouette)
    g.fillStyle(COLORS.furShadow).fillEllipse(bodyX, bodyY, bodyW + 2, bodyH + 2);
    g.fillStyle(COLORS.furMain).fillEllipse(bodyX, bodyY, bodyW, bodyH);
    // Back fur highlight
    g.fillStyle(COLORS.furLight).fillEllipse(bodyX - 4, bodyY - 6, bodyW * 0.7, bodyH * 0.5);

    // Cream belly / chest
    g.fillStyle(COLORS.furBelly).fillEllipse(cheekX, cheekY, 24, 20);

    // Ear (back & front)
    g.fillStyle(COLORS.furShadow).fillCircle(earX - 5, earY + 1, 7.5);
    g.fillStyle(COLORS.furMain).fillCircle(earX, earY, 8.5);
    g.fillStyle(COLORS.pinkSoft).fillCircle(earX + 1, earY, 5);

    // Chubby cheek pouch
    g.fillStyle(COLORS.furBelly).fillCircle(cheekX + 5, cheekY + 3, 7.5);
    g.fillStyle(COLORS.pinkSoft).fillCircle(cheekX + 8, cheekY + 5, 2.2); // tiny pink nose

    // Big shiny bead eye
    g.fillStyle(0x131b24).fillCircle(eyeX, eyeY, 4.2);
    g.fillStyle(0xffffff).fillCircle(eyeX + 1.2, eyeY - 1.2, 1.6);
    g.fillStyle(0xffffff).fillCircle(eyeX - 1.2, eyeY + 1.2, 0.8);

    // Whiskers
    g.lineStyle(1, 0x6e3b18, 0.7);
    g.lineBetween(cheekX + 6, cheekY + 2, cheekX + 17, cheekY);
    g.lineBetween(cheekX + 6, cheekY + 5, cheekX + 16, cheekY + 7);
  };

  // Frame 1: Stride start (front paw forward, back foot down)
  g.clear();
  drawHamsterBase(32, 28, 38, 32, 26, 12, 41, 23, 38, 34, 11, 32);
  // Paws
  g.fillStyle(COLORS.pinkSoft)
    .fillRoundedRect(42, 42, 13, 8, 3) // front paw landing
    .fillRoundedRect(16, 44, 12, 7, 3); // back foot
  g.generateTexture(TEXTURES.hamsterRun1, 64, 56);

  // Frame 2: Downwards bounce (body compressed, feet cycling under)
  g.clear();
  drawHamsterBase(32, 30, 41, 30, 25, 14, 41, 25, 38, 36, 9, 34);
  // Paws
  g.fillStyle(COLORS.pinkSoft)
    .fillRoundedRect(36, 45, 12, 7, 3) // front paw under chest
    .fillRoundedRect(22, 45, 12, 7, 3); // back foot pushing
  g.generateTexture(TEXTURES.hamsterRun2, 64, 56);

  // Frame 3: Leap / extension (back foot pushing off, front paw reaching up)
  g.clear();
  drawHamsterBase(32, 26, 39, 32, 27, 10, 42, 21, 39, 32, 11, 30);
  // Paws
  g.fillStyle(COLORS.pinkSoft)
    .fillRoundedRect(46, 38, 13, 7, 3) // front paw reaching high
    .fillRoundedRect(13, 44, 14, 7, 3); // back foot kicking back
  g.generateTexture(TEXTURES.hamsterRun3, 64, 56);

  // Frame 4: Mid-air float stride (cycling forward)
  g.clear();
  drawHamsterBase(32, 27, 40, 31, 26, 11, 41, 22, 38, 33, 10, 31);
  // Paws
  g.fillStyle(COLORS.pinkSoft)
    .fillRoundedRect(40, 41, 13, 7, 3)
    .fillRoundedRect(18, 43, 13, 7, 3);
  g.generateTexture(TEXTURES.hamsterRun4, 64, 56);

  // Also assign fallback 'hamster' key to run-1 for compatibility
  g.generateTexture(TEXTURES.hamster, 64, 56);

  // Jump Frame (rising in air: stretched diagonally, paws tucked, ears aerodynamic)
  g.clear();
  drawHamsterBase(32, 26, 36, 34, 24, 11, 41, 19, 38, 31, 13, 31);
  // Front paws tucked up eagerly, back legs streamlined
  g.fillStyle(COLORS.pinkSoft)
    .fillRoundedRect(44, 33, 12, 7, 3)
    .fillRoundedRect(16, 42, 12, 7, 3);
  g.generateTexture(TEXTURES.hamsterJump, 64, 56);

  // Fall Frame (falling downwards: paws spread, ears perked looking down)
  g.clear();
  drawHamsterBase(32, 28, 40, 33, 27, 12, 42, 24, 38, 34, 10, 32);
  // Paws reaching down anticipating landing
  g.fillStyle(COLORS.pinkSoft)
    .fillRoundedRect(42, 44, 12, 8, 3)
    .fillRoundedRect(17, 44, 12, 8, 3);
  g.generateTexture(TEXTURES.hamsterFall, 64, 56);

  // Hit Frame (collision / dizzy: slumped on ground, dizzy X eyes, drooping ears)
  g.clear();
  // Tail
  g.fillStyle(COLORS.furLight).fillCircle(9, 36, 5);
  g.fillStyle(COLORS.pinkSoft).fillCircle(8, 36, 2.5);

  // Body slumped slightly back
  g.fillStyle(COLORS.furShadow).fillEllipse(32, 34, 44, 32);
  g.fillStyle(COLORS.furMain).fillEllipse(32, 34, 42, 30);
  g.fillStyle(COLORS.furLight).fillEllipse(28, 26, 28, 14);

  // Big cream belly
  g.fillStyle(COLORS.furBelly).fillEllipse(38, 37, 26, 20);

  // Drooping ears
  g.fillStyle(COLORS.furShadow).fillCircle(19, 20, 7);
  g.fillStyle(COLORS.furMain).fillCircle(20, 19, 7.5);
  g.fillStyle(COLORS.pinkSoft).fillCircle(20, 20, 4.5);

  g.fillStyle(COLORS.furShadow).fillCircle(29, 17, 7);
  g.fillStyle(COLORS.furMain).fillCircle(30, 16, 7.5);
  g.fillStyle(COLORS.pinkSoft).fillCircle(31, 17, 4.5);

  // Chubby dazed cheek & tiny nose
  g.fillStyle(COLORS.furBelly).fillCircle(44, 36, 7);
  g.fillStyle(COLORS.pinkSoft).fillCircle(47, 37, 2.5);

  // Dizzy eye: prominent 'X' mark
  g.lineStyle(2.5, 0x131b24, 1);
  g.lineBetween(38, 23, 44, 29);
  g.lineBetween(44, 23, 38, 29);

  // Drooping whiskers
  g.lineStyle(1, 0x6e3b18, 0.7);
  g.lineBetween(45, 38, 54, 43);
  g.lineBetween(45, 40, 52, 47);

  // Paws slumped on ground
  g.fillStyle(COLORS.pinkSoft)
    .fillRoundedRect(42, 44, 13, 8, 3)
    .fillRoundedRect(16, 45, 13, 7, 3);

  g.generateTexture(TEXTURES.hamsterHit, 64, 56);

  // -------------------------------------------------------------
  // 2. OBSTACLES (3 VARIANTS, all 56x68, exact 48x64 hitbox)
  // -------------------------------------------------------------

  // Variant A: Industrial Wooden Crate with cedar bedding & SQK stencil
  g.clear();
  // Wood crate background
  g.fillStyle(0x382315).fillRoundedRect(2, 2, 52, 64, 6);
  g.fillStyle(0x563923).fillRoundedRect(4, 4, 48, 60, 4);
  // Wood planks
  g.lineStyle(2, 0x382315, 0.9);
  g.lineBetween(4, 24, 52, 24);
  g.lineBetween(4, 44, 52, 44);
  // Diagonal cross brace
  g.fillStyle(0x432a19).fillPoints([
    { x: 7, y: 7 }, { x: 12, y: 7 }, { x: 49, y: 57 }, { x: 44, y: 57 },
  ], true);
  // Steel corner brackets & rivets
  g.fillStyle(0x2f3e4a)
    .fillRect(4, 4, 12, 12).fillRect(40, 4, 12, 12)
    .fillRect(4, 52, 12, 12).fillRect(40, 52, 12, 12);
  g.fillStyle(COLORS.gold)
    .fillCircle(7, 7, 1.5).fillCircle(49, 7, 1.5)
    .fillCircle(7, 61, 1.5).fillCircle(49, 61, 1.5);
  // Warning hazard chevron stripe on center plank
  g.fillStyle(COLORS.gold).fillTriangle(20, 28, 28, 38, 36, 28);
  g.fillStyle(COLORS.danger).fillTriangle(22, 30, 28, 37, 34, 30);
  // Cedar sawdust clinging to top edge
  g.fillStyle(0xd49b65)
    .fillCircle(14, 3, 2).fillCircle(26, 2, 2.5).fillCircle(38, 3, 2);
  g.generateTexture(TEXTURES.obstacleCrate, 56, 68);
  // Default 'obstacle' texture maps to obstacleCrate
  g.generateTexture(TEXTURES.obstacle, 56, 68);

  // Variant B: WHEELY9000 Bronze Sprocket / Cog obstacle
  g.clear();
  // Heavy industrial machine gear tooth assembly
  g.fillStyle(0x231b14).fillRoundedRect(2, 2, 52, 64, 6);
  g.fillStyle(0x3d2c1e).fillRoundedRect(4, 4, 48, 60, 4);
  // Big bronze gear teeth protruding
  g.fillStyle(0xa66d28);
  for (let i = 0; i < 6; i++) {
    const toothY = 7 + i * 10;
    g.fillRoundedRect(1, toothY, 6, 6, 2);
    g.fillRoundedRect(49, toothY, 6, 6, 2);
  }
  // Circular bronze hub
  g.fillStyle(0xd99538).fillCircle(28, 34, 19);
  g.fillStyle(0x704717).fillCircle(28, 34, 15);
  g.fillStyle(0x251a11).fillCircle(28, 34, 8);
  g.fillStyle(COLORS.gold).fillCircle(28, 34, 4);
  // Spokes
  g.lineStyle(2, 0xd99538, 0.9);
  g.lineBetween(28, 19, 28, 49);
  g.lineBetween(13, 34, 43, 34);
  // Warning stripes top and bottom
  g.fillStyle(COLORS.danger).fillRect(6, 6, 44, 4).fillRect(6, 58, 44, 4);
  g.generateTexture(TEXTURES.obstacleSprocket, 56, 68);

  // Variant C: Squeek High-Voltage Power Cell / Battery
  g.clear();
  g.fillStyle(0x192732).fillRoundedRect(2, 2, 52, 64, 6);
  // Top/bottom metal battery terminals
  g.fillStyle(0x405364).fillRoundedRect(6, 4, 44, 10, 3);
  g.fillStyle(0x405364).fillRoundedRect(6, 54, 44, 10, 3);
  g.fillStyle(COLORS.gold).fillCircle(28, 6, 3);
  // Glass chamber
  g.fillStyle(0x122a36).fillRect(8, 15, 40, 38);
  // Glowing energy plasma coil inside
  g.fillStyle(COLORS.lime).fillEllipse(28, 34, 28, 14);
  g.fillStyle(0xffffff).fillEllipse(28, 34, 16, 6);
  // Lightning bolt emblem
  g.fillStyle(COLORS.gold).fillPoints([
    { x: 30, y: 22 }, { x: 23, y: 34 }, { x: 28, y: 34 },
    { x: 26, y: 46 }, { x: 34, y: 32 }, { x: 29, y: 32 },
  ], true);
  // Corner warning lights
  g.fillStyle(COLORS.danger).fillCircle(11, 9, 2).fillCircle(45, 9, 2);
  g.generateTexture(TEXTURES.obstacleBattery, 56, 68);

  // -------------------------------------------------------------
  // 3. GOLDEN NUT COLLECTIBLE (36x38)
  // Exact circle hitbox: radius 16, offset (2, 3)
  // -------------------------------------------------------------
  g.clear();
  // Outer warm golden aura
  g.fillStyle(0xffaa2b, 0.28).fillCircle(18, 20, 18);
  g.fillStyle(0xffd54f, 0.4).fillCircle(18, 20, 15);
  // Acorn nut base
  g.fillStyle(0xc98218).fillEllipse(18, 22, 26, 28);
  g.fillStyle(0xffc83b).fillEllipse(17, 21, 23, 25);
  g.fillStyle(0xffe785).fillEllipse(15, 18, 15, 18); // glossy shine
  g.fillStyle(0xffffff, 0.85).fillEllipse(13, 15, 6, 8); // specular highlight

  // Acorn cap with carved texture
  g.fillStyle(0x5a3418).fillRoundedRect(4, 6, 28, 12, 5);
  g.fillStyle(0x824e27).fillRoundedRect(5, 7, 26, 9, 4);
  // Little sprout stem and fresh leaf
  g.fillStyle(0x432611).fillRect(17, 2, 3, 6);
  g.fillStyle(COLORS.lime).fillEllipse(22, 3, 10, 5);
  g.fillStyle(0xffffff, 0.6).fillEllipse(21, 2, 5, 2);
  g.generateTexture(TEXTURES.nut, 36, 38);

  // -------------------------------------------------------------
  // 3b. WHITELIST COIN (40x40) — circle radius 18 centred at (20, 20)
  // -------------------------------------------------------------
  g.clear();
  g.fillStyle(0x81cce4, 0.22).fillCircle(20, 20, 20); // cool glow, distinct from the warm nut
  g.fillStyle(0x9c6a12).fillCircle(20, 21, 17);
  g.fillStyle(0xf2b630).fillCircle(20, 20, 16);
  g.lineStyle(2, 0xffe08a, 1).strokeCircle(20, 20, 12);
  // Paw print emblem
  g.fillStyle(0x9c6a12).fillEllipse(20, 23, 9, 7);
  g.fillCircle(14.5, 16.5, 2.4).fillCircle(18, 14, 2.4).fillCircle(22, 14, 2.4).fillCircle(25.5, 16.5, 2.4);
  g.fillStyle(0xffffff, 0.8).fillEllipse(13, 11, 6, 3);
  g.generateTexture(TEXTURES.coin, 40, 40);

  // -------------------------------------------------------------
  // 4. SHIELD BUBBLE (96x96)
  // -------------------------------------------------------------
  g.clear();
  // Concentric glowing forcefield with hex facets
  g.fillStyle(0x81cce4, 0.12).fillCircle(48, 48, 46);
  g.lineStyle(2, 0x81cce4, 0.65).strokeCircle(48, 48, 44);
  g.lineStyle(2, COLORS.gold, 0.85).strokeCircle(48, 48, 40);
  // Hex shield nodes
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const nx = 48 + Math.cos(angle) * 40;
    const ny = 48 + Math.sin(angle) * 40;
    g.fillStyle(COLORS.gold).fillCircle(nx, ny, 3.5);
    g.fillStyle(0xffffff).fillCircle(nx, ny, 1.5);
  }
  g.generateTexture(TEXTURES.shield, 96, 96);

  // -------------------------------------------------------------
  // 5. PARALLAX BACKGROUND LAYERS
  // -------------------------------------------------------------

  // Layer 1: Far background (480x280) - giant wheel curves & cozy terrarium night
  g.clear();
  // Deep warm twilight backdrop
  g.fillStyle(0x0e1722).fillRect(0, 0, 480, 280);
  g.fillStyle(0x13222e).fillRect(0, 60, 480, 220);
  // Giant WHEELY9000 outer ring curves in distance
  g.lineStyle(6, 0x1d3744, 0.35).strokeCircle(240, -120, 360);
  g.lineStyle(2, 0x27495b, 0.25).strokeCircle(240, -120, 380);
  // Distant hamster hab silhouettes (domes, tubes)
  g.fillStyle(0x172c3a, 0.5);
  g.fillCircle(100, 220, 70);
  g.fillCircle(380, 210, 80);
  g.fillRect(80, 220, 320, 60);
  // Little glowing data / status lights
  for (let i = 0; i < 18; i++) {
    const lx = (i * 73 + 29) % 480;
    const ly = 90 + (i * 37) % 130;
    const col = i % 3 === 0 ? COLORS.lime : i % 3 === 1 ? COLORS.gold : COLORS.blue;
    g.fillStyle(col, 0.4).fillCircle(lx, ly, i % 4 === 0 ? 2.5 : 1.5);
  }
  g.generateTexture(TEXTURES.bgFar, 480, 280);

  // Layer 2: Mid background (480x180) - cedar sawdust drifts, ramps & sprockets
  g.clear();
  // Distant warm bedding mounds
  g.fillStyle(0x1a2e33).fillPoints([
    { x: 0, y: 140 }, { x: 70, y: 105 }, { x: 160, y: 135 },
    { x: 260, y: 95 }, { x: 370, y: 130 }, { x: 440, y: 110 },
    { x: 480, y: 135 }, { x: 480, y: 180 }, { x: 0, y: 180 },
  ], true);
  // Closer wooden track pillars & hamster tube trusses
  g.fillStyle(0x223c3d).fillPoints([
    { x: 0, y: 155 }, { x: 90, y: 130 }, { x: 210, y: 160 },
    { x: 320, y: 125 }, { x: 410, y: 150 }, { x: 480, y: 138 },
    { x: 480, y: 180 }, { x: 0, y: 180 },
  ], true);
  // Wooden posts with brass rivets
  for (let i = 0; i < 4; i++) {
    const px = 40 + i * 120;
    g.fillStyle(0x2b4644).fillRect(px, 120, 14, 60);
    g.fillStyle(COLORS.gold, 0.4).fillCircle(px + 7, 130, 2);
  }
  // Acrylic tube highlight line across midground
  g.lineStyle(2, 0x47706d, 0.35);
  g.lineBetween(0, 115, 480, 115);
  g.generateTexture(TEXTURES.bgMid, 480, 180);

  // -------------------------------------------------------------
  // 6. GROUND RUNNING TRACK (128x36)
  // High-speed hamster wheel slat surface with wood grain & neon track
  // -------------------------------------------------------------
  g.clear();
  // Track base
  g.fillStyle(0x231810).fillRect(0, 0, 128, 36);
  // Slats / planks
  for (let i = 0; i < 4; i++) {
    const sx = i * 32;
    g.fillStyle(0x38261a).fillRect(sx + 1, 4, 30, 32);
    g.fillStyle(0x4a3424).fillRect(sx + 2, 5, 28, 12);
    // Plank divider
    g.fillStyle(0x19100a).fillRect(sx, 4, 2, 32);
    // Brass nails / rivets
    g.fillStyle(0x8a602d).fillCircle(sx + 8, 8, 1.5).fillCircle(sx + 24, 8, 1.5);
  }
  // Neon-lime track guide on top surface
  g.fillStyle(COLORS.lime).fillRect(0, 0, 128, 3);
  g.fillStyle(COLORS.gold).fillRect(0, 3, 128, 1);
  // Sawdust flakes scattered on track
  g.fillStyle(0xd49b65)
    .fillRect(18, 16, 3, 2).fillRect(50, 22, 4, 2)
    .fillRect(82, 14, 3, 2).fillRect(110, 26, 4, 2);
  g.generateTexture(TEXTURES.ground, 128, 36);

  // -------------------------------------------------------------
  // 7. PARTICLES & SPEED EFFECTS
  // -------------------------------------------------------------

  // Dust / sawdust crumb (6x6)
  g.clear();
  g.fillStyle(0xd99859).fillCircle(3, 3, 3);
  g.fillStyle(0xffe2b8).fillCircle(2, 2, 1.5);
  g.generateTexture(TEXTURES.dust, 6, 6);

  // Speed streak line (64x4)
  g.clear();
  g.fillStyle(0xffffff, 0.7).fillRoundedRect(0, 1, 64, 2, 1);
  g.generateTexture(TEXTURES.speedLine, 64, 4);

  // Star for game-over dizziness (16x16)
  g.clear();
  g.fillStyle(COLORS.gold).fillPoints([
    { x: 8, y: 0 }, { x: 10, y: 6 }, { x: 16, y: 8 }, { x: 10, y: 10 },
    { x: 8, y: 16 }, { x: 6, y: 10 }, { x: 0, y: 8 }, { x: 6, y: 6 },
  ], true);
  g.fillStyle(0xffffff).fillCircle(8, 8, 2);
  g.generateTexture(TEXTURES.star, 16, 16);

  g.destroy();
}
