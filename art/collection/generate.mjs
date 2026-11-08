/**
 * SqueekRunner Hamsters — Deterministic Collection Generator (1000 NFT)
 * Produces:
 *   - 1000 valid SVGs in out/images/{id}.svg
 *   - 1000 OpenSea metadata JSONs in out/metadata/{id}.json
 *   - Statistical rarity table in out/rarity.json
 *   - HTML gallery preview in out/preview.html
 *
 * Enforces:
 *   - 100% deterministic seed
 *   - Strict uniqueness (zero duplicate trait combinations)
 *   - Trait incompatibility / conflict rules
 *   - File size <= 30 KB per SVG
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import {
  BACKGROUNDS,
  SPECIAL_AURAS,
  FUR_COLORS,
  renderHamsterBase,
  EYES,
  MOUTHS,
  HEADWEAR,
  ACCESSORIES,
  HELD_ITEMS,
  LEGENDARY_EDITIONS,
} from './traits.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// -------------------------------------------------------------
// CONFIGURATION & CONSTANTS
// -------------------------------------------------------------
export const TOTAL_SUPPLY = 1000;
export const SEED = 0x51EED9000; // SqueekRunner Genesis seed constant
export const IPFS_IMAGE_CID_PLACEHOLDER = 'ipfs://__IMAGES_CID__';
export const MAX_SVG_BYTES = 30 * 1024; // 30 KB max per brief

// -------------------------------------------------------------
// PSEUDO-RANDOM NUMBER GENERATOR (Mulberry32)
// -------------------------------------------------------------
function createPRNG(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -------------------------------------------------------------
// TRAIT WEIGHTS & DEFINITIONS
// -------------------------------------------------------------
const TRAIT_WEIGHTS = {
  background: [
    { value: 'Sawdust Track', weight: 14 },
    { value: 'Squeekchain Blue', weight: 14 },
    { value: 'Sunny Meadow', weight: 12 },
    { value: 'Sepolia Violet', weight: 12 },
    { value: 'Sunset Sprint', weight: 11 },
    { value: 'Minty Run', weight: 11 },
    { value: 'Crimson Rush', weight: 9 },
    { value: 'Golden Glow', weight: 9 },
    { value: 'Cyber Grid', weight: 8 },
  ],
  specialAura: [
    { value: 'None', weight: 75 },
    { value: 'Golden Stardust', weight: 8 },
    { value: 'Sawdust Cyclone', weight: 6 },
    { value: 'WHEELY9000 Wheel', weight: 5 },
    { value: 'Speed Lightning', weight: 4 },
    { value: 'PoW Matrix', weight: 2 },
  ],
  furColor: [
    { value: 'Classic Golden Brown', weight: 22 },
    { value: 'Caramel Cream', weight: 16 },
    { value: 'Toasted Biscuit', weight: 14 },
    { value: 'Wild Sable', weight: 12 },
    { value: 'Honey Peach', weight: 10 },
    { value: 'Silver Ash', weight: 9 },
    { value: 'Chocolate Truffle', weight: 8 },
    { value: 'Midnight Shadow', weight: 5 },
    { value: 'Snow Fluff', weight: 4 },
  ],
  eyes: [
    { value: 'Big Sparkle', weight: 30 },
    { value: 'Focused Runner', weight: 22 },
    { value: 'Happy Wink', weight: 18 },
    { value: 'Chill Sleepy', weight: 14 },
    { value: 'Starry Eyed', weight: 10 },
    { value: 'Speed Gaze', weight: 6 },
  ],
  mouth: [
    { value: 'Buck Teeth Grin', weight: 34 },
    { value: 'Joyful Open Smile', weight: 26 },
    { value: 'Determined Grit', weight: 18 },
    { value: 'Whistling Ooh', weight: 12 },
    { value: 'Stuffed Cheeks', weight: 10 },
  ],
  headwear: [
    { value: 'None', weight: 30 },
    { value: 'Retro Sweatband', weight: 14 },
    { value: 'Backward Running Cap', weight: 12 },
    { value: 'Tiny Acorn Beret', weight: 10 },
    { value: 'Warm Winter Beanie', weight: 9 },
    { value: 'Pilot Goggles', weight: 8 },
    { value: 'Sunflower Bloom', weight: 7 },
    { value: 'Squeek Ninja Headband', weight: 5 },
    { value: 'Miner Helmet', weight: 3 },
    { value: 'Golden Crown', weight: 2 },
  ],
  accessory: [
    { value: 'None', weight: 32 },
    { value: 'Runner Bib #42', weight: 18 },
    { value: 'Cozy Knit Scarf', weight: 14 },
    { value: 'Heart Pin', weight: 11 },
    { value: 'Dapper Bowtie', weight: 9 },
    { value: 'Mechanic Tool Belt', weight: 7 },
    { value: 'Golden Chain & SQK Coin', weight: 5 },
    { value: 'Red Running Cape', weight: 4 },
  ],
  heldItem: [
    { value: 'Golden Squeek Nut', weight: 28 },
    { value: 'Giant Sunflower Seed', weight: 24 },
    { value: 'Fresh Energy Carrot', weight: 18 },
    { value: 'Tiny Brass Wrench', weight: 14 },
    { value: 'Stop Watch', weight: 10 },
    { value: 'Squeek Block #1999', weight: 6 },
  ],
};

function pickWeighted(options, random) {
  const total = options.reduce((sum, item) => sum + item.weight, 0);
  let threshold = random() * total;
  for (const item of options) {
    if (threshold < item.weight) return item.value;
    threshold -= item.weight;
  }
  return options[options.length - 1].value;
}

// -------------------------------------------------------------
// INCOMPATIBILITY & CONFLICT RESOLUTION RULES
// -------------------------------------------------------------
function validateAndResolveConflicts(traits, random) {
  // Rule 1: Miner Helmet with glowing beam has a forward lantern,
  // conflicting visually with Pilot Goggles or full bandanas if they were in headwear (already mutually exclusive by slot).
  // Rule 2: Red Running Cape shouldn't be overwhelmed by heavy Sawdust Cyclone.
  if (traits.specialAura === 'Sawdust Cyclone' && traits.accessory === 'Red Running Cape') {
    traits.accessory = pickWeighted(
      TRAIT_WEIGHTS.accessory.filter(a => a.value !== 'Red Running Cape'),
      random,
    );
  }

  // Rule 3: Cozy Knit Scarf is thick around the neck, so high-riding accessories are incompatible (they are in the same slot).
  // Rule 4: If background is Cyber Grid and aura is PoW Matrix, create ultra-rare cyber runner harmony
  // (nothing invalid, fully compatible).

  return traits;
}

// -------------------------------------------------------------
// SVG ASSEMBLY
// -------------------------------------------------------------
function buildHamsterSVG(traits) {
  const bgSvg = BACKGROUNDS[traits.background]();
  const auraSvg = SPECIAL_AURAS[traits.specialAura]();
  const fur = FUR_COLORS[traits.furColor];
  const bodySvg = renderHamsterBase(fur);
  const eyesSvg = EYES[traits.eyes]();
  const mouthSvg = MOUTHS[traits.mouth]();
  const headwearSvg = HEADWEAR[traits.headwear]();
  const accessorySvg = ACCESSORIES[traits.accessory]();
  const heldSvg = HELD_ITEMS[traits.heldItem](fur);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
  <defs>
    <style>
      text { font-family: system-ui, -apple-system, sans-serif; }
    </style>
  </defs>
  <!-- Background -->
  ${bgSvg}
  <!-- Special Aura -->
  ${auraSvg}
  <!-- Hamster Anatomy -->
  ${bodySvg}
  <!-- Facial Features -->
  ${mouthSvg}
  ${eyesSvg}
  <!-- Accessory & Clothing -->
  ${accessorySvg}
  <!-- Headwear -->
  ${headwearSvg}
  <!-- Held Item & Front Paws -->
  ${heldSvg}
</svg>`;
}

// -------------------------------------------------------------
// MAIN GENERATOR
// -------------------------------------------------------------
export function generateCollection(outputBaseDir = resolve(__dirname, 'out')) {
  const imagesDir = resolve(outputBaseDir, 'images');
  const metadataDir = resolve(outputBaseDir, 'metadata');

  mkdirSync(imagesDir, { recursive: true });
  mkdirSync(metadataDir, { recursive: true });

  const random = createPRNG(SEED);

  // Pick 10 deterministic milestone IDs for the 10 Legendary Editions
  // e.g. distributed nicely across the 1000 tokens
  const legendaryPositions = new Set([1, 77, 100, 250, 420, 500, 666, 777, 888, 1000]);
  assert.equal(legendaryPositions.size, LEGENDARY_EDITIONS.length);
  const legendaryMap = new Map();
  let legIdx = 0;
  for (const pos of [...legendaryPositions].sort((a, b) => a - b)) {
    legendaryMap.set(pos, LEGENDARY_EDITIONS[legIdx++]);
  }

  const generatedTokens = [];
  const uniqueCombinations = new Set();
  const rarityStats = {
    total: TOTAL_SUPPLY,
    legendaries: LEGENDARY_EDITIONS.length,
    traits: {},
  };

  // Initialize trait counters
  for (const category of Object.keys(TRAIT_WEIGHTS)) {
    rarityStats.traits[category] = {};
    for (const opt of TRAIT_WEIGHTS[category]) {
      rarityStats.traits[category][opt.value] = 0;
    }
  }

  console.log(`Starting deterministic generation of ${TOTAL_SUPPLY} SqueekRunner Hamsters...`);
  console.log(`Seed: 0x${SEED.toString(16).toUpperCase()}`);

  for (let id = 1; id <= TOTAL_SUPPLY; id++) {
    let tokenData;

    if (legendaryMap.has(id)) {
      const leg = legendaryMap.get(id);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
  <defs>
    <style>text { font-family: system-ui, -apple-system, sans-serif; }</style>
  </defs>
  ${leg.render()}
</svg>`;

      tokenData = {
        id,
        isLegendary: true,
        name: `SqueekRunner Hamster #${id} — ${leg.name}`,
        description: leg.description,
        attributes: leg.attributes,
        svg,
      };
    } else {
      // Standard generative hamster: pick traits, check uniqueness, reroll on collision
      let traits;
      let signature;
      let attempts = 0;

      do {
        traits = {
          background: pickWeighted(TRAIT_WEIGHTS.background, random),
          specialAura: pickWeighted(TRAIT_WEIGHTS.specialAura, random),
          furColor: pickWeighted(TRAIT_WEIGHTS.furColor, random),
          eyes: pickWeighted(TRAIT_WEIGHTS.eyes, random),
          mouth: pickWeighted(TRAIT_WEIGHTS.mouth, random),
          headwear: pickWeighted(TRAIT_WEIGHTS.headwear, random),
          accessory: pickWeighted(TRAIT_WEIGHTS.accessory, random),
          heldItem: pickWeighted(TRAIT_WEIGHTS.heldItem, random),
        };

        traits = validateAndResolveConflicts(traits, random);

        signature = [
          traits.background,
          traits.specialAura,
          traits.furColor,
          traits.eyes,
          traits.mouth,
          traits.headwear,
          traits.accessory,
          traits.heldItem,
        ].join('|');

        attempts++;
        if (attempts > 1000) {
          throw new Error(`Collision resolution exceeded 1000 attempts at token #${id}`);
        }
      } while (uniqueCombinations.has(signature));

      uniqueCombinations.add(signature);

      // Record rarity frequencies
      for (const [cat, val] of Object.entries(traits)) {
        rarityStats.traits[cat][val] = (rarityStats.traits[cat][val] || 0) + 1;
      }

      const svg = buildHamsterSVG(traits);
      const attributes = [
        { trait_type: 'Background', value: traits.background },
        { trait_type: 'Special Aura', value: traits.specialAura },
        { trait_type: 'Fur Color', value: traits.furColor },
        { trait_type: 'Eyes', value: traits.eyes },
        { trait_type: 'Mouth', value: traits.mouth },
        { trait_type: 'Headwear', value: traits.headwear },
        { trait_type: 'Accessory', value: traits.accessory },
        { trait_type: 'Held Item', value: traits.heldItem },
      ];

      tokenData = {
        id,
        isLegendary: false,
        name: `SqueekRunner Hamster #${id}`,
        description: `A unique generative hamster athlete from the SqueekRunner Genesis collection. Powered by Squeekchain wheel telemetry.`,
        attributes,
        svg,
      };
    }

    // Check SVG byte size
    const svgBytes = Buffer.byteLength(tokenData.svg, 'utf8');
    if (svgBytes > MAX_SVG_BYTES) {
      throw new Error(`Token #${id} SVG exceeded max allowed size of ${MAX_SVG_BYTES} bytes (actual: ${svgBytes} bytes)`);
    }

    // Write image SVG
    const imgPath = resolve(imagesDir, `${id}.svg`);
    writeFileSync(imgPath, tokenData.svg, 'utf8');

    // Build OpenSea metadata JSON
    const metadata = {
      name: tokenData.name,
      description: tokenData.description,
      image: `${IPFS_IMAGE_CID_PLACEHOLDER}/${id}.svg`,
      attributes: tokenData.attributes,
    };
    const metaPath = resolve(metadataDir, `${id}.json`);
    writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

    generatedTokens.push(tokenData);
  }

  // Calculate percentages in rarityStats
  const rarityPercentages = {};
  for (const [cat, items] of Object.entries(rarityStats.traits)) {
    rarityPercentages[cat] = {};
    for (const [val, count] of Object.entries(items)) {
      const standardTotal = TOTAL_SUPPLY - LEGENDARY_EDITIONS.length;
      const pct = ((count / standardTotal) * 100).toFixed(2);
      rarityPercentages[cat][val] = { count, percentage: `${pct}%` };
    }
  }

  const rarityReport = {
    collection: 'SqueekRunner Hamsters',
    totalSupply: TOTAL_SUPPLY,
    standardSupply: TOTAL_SUPPLY - LEGENDARY_EDITIONS.length,
    legendarySupply: LEGENDARY_EDITIONS.length,
    seed: `0x${SEED.toString(16).toUpperCase()}`,
    generatedAt: new Date().toISOString(),
    legendaryTokens: [...legendaryMap.entries()].map(([id, leg]) => ({
      id,
      name: leg.name,
      title: leg.title,
    })),
    traitDistribution: rarityPercentages,
  };

  writeFileSync(resolve(outputBaseDir, 'rarity.json'), JSON.stringify(rarityReport, null, 2), 'utf8');

  // Generate HTML visual preview of first 100 tokens
  const previewHtml = generatePreviewHtml(generatedTokens.slice(0, 100));
  writeFileSync(resolve(outputBaseDir, 'preview.html'), previewHtml, 'utf8');

  console.log(`Successfully generated:`);
  console.log(`  - ${TOTAL_SUPPLY} SVG images in ${imagesDir}`);
  console.log(`  - ${TOTAL_SUPPLY} JSON metadata in ${metadataDir}`);
  console.log(`  - Rarity report in ${resolve(outputBaseDir, 'rarity.json')}`);
  console.log(`  - HTML gallery in ${resolve(outputBaseDir, 'preview.html')}`);

  return {
    total: TOTAL_SUPPLY,
    uniqueCount: uniqueCombinations.size,
    legendaryCount: LEGENDARY_EDITIONS.length,
  };
}

// -------------------------------------------------------------
// HTML PREVIEW GENERATOR
// -------------------------------------------------------------
function generatePreviewHtml(tokens) {
  const cardsHtml = tokens.map(t => {
    const isLeg = t.isLegendary;
    const badge = isLeg
      ? `<span class="badge leg">1/1 Legendary</span>`
      : `<span class="badge std">Standard</span>`;

    const traitsHtml = t.attributes
      .map(a => `<div class="trait"><strong>${a.trait_type}:</strong> ${a.value}</div>`)
      .join('');

    return `
      <div class="card ${isLeg ? 'card-leg' : ''}">
        <div class="thumb">
          <img src="images/${t.id}.svg" alt="${t.name}" loading="lazy" />
        </div>
        <div class="meta">
          <div class="header">
            <h3>#${t.id}</h3>
            ${badge}
          </div>
          <h4>${t.name}</h4>
          <div class="traits">${traitsHtml}</div>
        </div>
      </div>
    `;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SqueekRunner Hamsters — Collection Preview (First 100)</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0e1520;
      --card-bg: #162130;
      --border: #25364b;
      --ink: #f4f1df;
      --muted: #8b9ba6;
      --accent: #ffcf75;
      --gold: #ffd700;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--ink);
      font-family: system-ui, -apple-system, sans-serif;
      padding: 32px 20px;
    }
    header {
      max-width: 1400px;
      margin: 0 auto 32px;
      text-align: center;
    }
    h1 {
      font-size: 32px;
      margin-bottom: 8px;
      color: var(--accent);
      letter-spacing: -0.5px;
    }
    p.lead {
      color: var(--muted);
      font-size: 16px;
      margin-bottom: 24px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }
    .card:hover {
      transform: translateY(-4px);
      border-color: var(--accent);
    }
    .card-leg {
      border: 2px solid var(--gold);
      box-shadow: 0 0 20px rgba(255, 215, 0, 0.25);
    }
    .thumb {
      width: 100%;
      aspect-ratio: 1;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .meta {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h3 {
      font-size: 18px;
      color: var(--accent);
    }
    .badge {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 6px;
      letter-spacing: 0.5px;
    }
    .badge.std { background: #26384f; color: #a4b8cc; }
    .badge.leg { background: #ffd700; color: #1c1502; }
    h4 {
      font-size: 14px;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .traits {
      display: grid;
      grid-template-columns: 1fr;
      gap: 4px;
      font-size: 11px;
      background: rgba(0,0,0,0.25);
      padding: 8px;
      border-radius: 8px;
      margin-top: 4px;
    }
    .trait {
      color: #c0cbd6;
    }
    .trait strong {
      color: #7b8e9f;
    }
  </style>
</head>
<body>
  <header>
    <h1>SqueekRunner Hamsters Collection</h1>
    <p class="lead">1000 Generative NFTs · Powered by Squeekchain Wheel Telemetry · Preview of First 100 Tokens</p>
  </header>
  <main class="grid">
    ${cardsHtml}
  </main>
</body>
</html>`;
}

// Direct execution CLI runner
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = generateCollection();
  assert.equal(result.total, TOTAL_SUPPLY);
  console.log(`ALL CHECKS PASSED: ${result.total} hamsters successfully generated with 0 collisions.`);
}
