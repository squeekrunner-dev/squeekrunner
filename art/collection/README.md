# SqueekRunner Hamsters — Generative NFT Collection (1,000 Tokens)

This directory contains the generative art pipeline and trait layer architecture for the **SqueekRunner Hamsters** NFT collection on Ethereum Sepolia.

---

## 1. Overview & Context

- **Total Supply:** 1,000 tokens (Token IDs `1` through `1000`).
- **Standard Generative Hamsters:** 990 unique combinations.
- **Handcrafted 1/1 Legendaries:** 10 special editions distributed deterministically across milestone token IDs.
- **Smart Contract:** [`contracts/src/SqueekRunnerHamsters.sol`](../../contracts/src/SqueekRunnerHamsters.sol).
- **Metadata Standard:** ERC-721 / OpenSea standard (`name`, `description`, `image`, `attributes`).
- **Token URI format:** `baseURI + id + ".json"`.
- **Art Style:** Flat vector illustration matching the warm in-game aesthetic (`src/game/textures.ts`) and hero landing art (`index.html`).

---

## 2. Trait Architecture & Layer Hierarchy

All traits are rendered in pure SVG inside a unified `1000x1000` coordinate space (`viewBox="0 0 1000 1000"`).

### Layer Stack (Render Order)

1. **Background** (9 variants)
2. **Special / Wheel Aura** (6 variants: None, WHEELY9000 Wheel, Speed Lightning, Golden Stardust, PoW Matrix, Sawdust Cyclone)
3. **Hamster Body Base** (Fluffy tail, ground shadow, back running paws, torso, cream belly patch, round ears with pink inner ear, head, chubby cheeks, blush, whiskers, nose)
4. **Mouth & Expression** (5 variants: Buck Teeth Grin, Joyful Open Smile, Stuffed Cheeks, Determined Grit, Whistling Ooh)
5. **Eyes** (6 variants: Big Sparkle, Focused Runner, Happy Wink, Chill Sleepy, Starry Eyed, Speed Gaze)
6. **Accessory / Clothing** (8 variants: None, Runner Bib #42, Cozy Knit Scarf, Heart Pin, Dapper Bowtie, Mechanic Tool Belt, Golden Chain & SQK Coin, Red Running Cape)
7. **Headwear** (10 variants: None, Retro Sweatband, Backward Running Cap, Tiny Acorn Beret, Warm Winter Beanie, Pilot Goggles, Sunflower Bloom, Squeek Ninja Headband, Miner Helmet, Golden Crown)
8. **Held Item & Front Paws** (6 variants: Golden Squeek Nut, Giant Sunflower Seed, Fresh Energy Carrot, Tiny Brass Wrench, Stop Watch, Squeek Block #1999)

---

## 3. Rarity Weights & Distribution

The generator uses deterministic weighted random sampling (Mulberry32 PRNG with seed `0x51EED9000`):

| Category | Trait Value | Target Weight | Estimated % |
|---|---|---|---|
| **Background** | Sawdust Track | 14 | ~14.0% |
| | Squeekchain Blue | 14 | ~14.0% |
| | Sunny Meadow | 12 | ~12.0% |
| | Sepolia Violet | 12 | ~12.0% |
| | Sunset Sprint | 11 | ~11.0% |
| | Minty Run | 11 | ~11.0% |
| | Crimson Rush | 9 | ~9.0% |
| | Golden Glow | 9 | ~9.0% |
| | Cyber Grid | 8 | ~8.0% |
| **Special Aura** | None | 75 | ~75.0% |
| | Golden Stardust | 8 | ~8.0% |
| | Sawdust Cyclone | 6 | ~6.0% |
| | WHEELY9000 Wheel | 5 | ~5.0% |
| | Speed Lightning | 4 | ~4.0% |
| | PoW Matrix | 2 | ~2.0% |
| **Fur Color** | Classic Golden Brown | 22 | ~22.0% |
| | Caramel Cream | 16 | ~16.0% |
| | Toasted Biscuit | 14 | ~14.0% |
| | Wild Sable | 12 | ~12.0% |
| | Honey Peach | 10 | ~10.0% |
| | Silver Ash | 9 | ~9.0% |
| | Chocolate Truffle | 8 | ~8.0% |
| | Midnight Shadow | 5 | ~5.0% |
| | Snow Fluff | 4 | ~4.0% |
| **Eyes** | Big Sparkle | 30 | ~30.0% |
| | Focused Runner | 22 | ~22.0% |
| | Happy Wink | 18 | ~18.0% |
| | Chill Sleepy | 14 | ~14.0% |
| | Starry Eyed | 10 | ~10.0% |
| | Speed Gaze | 6 | ~6.0% |
| **Mouth** | Buck Teeth Grin | 34 | ~34.0% |
| | Joyful Open Smile | 26 | ~26.0% |
| | Determined Grit | 18 | ~18.0% |
| | Whistling Ooh | 12 | ~12.0% |
| | Stuffed Cheeks | 10 | ~10.0% |
| **Headwear** | None | 30 | ~30.0% |
| | Retro Sweatband | 14 | ~14.0% |
| | Backward Running Cap | 12 | ~12.0% |
| | Tiny Acorn Beret | 10 | ~10.0% |
| | Warm Winter Beanie | 9 | ~9.0% |
| | Pilot Goggles | 8 | ~8.0% |
| | Sunflower Bloom | 7 | ~7.0% |
| | Squeek Ninja Headband | 5 | ~5.0% |
| | Miner Helmet | 3 | ~3.0% |
| | Golden Crown | 2 | ~2.0% |
| **Accessory** | None | 32 | ~32.0% |
| | Runner Bib #42 | 18 | ~18.0% |
| | Cozy Knit Scarf | 14 | ~14.0% |
| | Heart Pin | 11 | ~11.0% |
| | Dapper Bowtie | 9 | ~9.0% |
| | Mechanic Tool Belt | 7 | ~7.0% |
| | Golden Chain & SQK Coin | 5 | ~5.0% |
| | Red Running Cape | 4 | ~4.0% |
| **Held Item** | Golden Squeek Nut | 28 | ~28.0% |
| | Giant Sunflower Seed | 24 | ~24.0% |
| | Fresh Energy Carrot | 18 | ~18.0% |
| | Tiny Brass Wrench | 14 | ~14.0% |
| | Stop Watch | 10 | ~10.0% |
| | Squeek Block #1999 | 6 | ~6.0% |

---

## 4. 10 Legendary 1/1 Editions

The collection features 10 handcrafted unique 1/1s with dedicated artwork and special edition metadata:

1. **#1 `Squeektoshi The Wheel Master`** (`Squeektoshi Prime`): The mythical creator of Squeekchain radiating cosmic Genesis energy with the gold WHEELY9000 halo.
2. **#77 `The 98.3 RPM Sprinter`** (`Overclocked Sprinter`): Reached the absolute maximum calibrated speed limit with burning flame rings and glowing amber speed eyes.
3. **#100 `King Squeek XIV`** (`The Sovereign Hamster`): Royal monarch in majestic red cape, sparkling gold crown, and radiant stardust.
4. **#250 `CyberSqueek 2077`** (`Neon Runner`): Cybernetic runner with glowing cyan laser visor, matrix nodes, and holographic Squeek Block #1999.
5. **#420 `AstroHamster Zero-G`** (`Space Wheel Explorer`): Astronaut running in deep space with nano-glass space bubble helmet and orbital Earth backdrop.
6. **#500 `Grand Mechanic WHEELY`** (`Master Engineer`): The creator of the physical wheel sensors in miner helmet, tool belt, and brass wrench.
7. **#666 `Shadow Ninja Squeek`** (`Midnight Shinobi`): Silent runner in midnight shadow fur with glowing ruby eyes, lightning aura, and ninja headband.
8. **#777 `The 24K Golden Runner`** (`Solid Gold Athlete`): Cast in pure 24K solid gold with radiant sunburst and royal chain.
9. **#888 `Forest Druid Squeek`** (`Guardian of the Acorn`): In tune with nature and sunflower bloom, blessing runners with endless stamina.
10. **#1000 `Diamond Paws Hodler`** (`Unbreakable Champion`): Diamond refraction aura and unbreakable silver ash fur that never paper paws.

---

## 5. How to Run the Generator

Prerequisites: Node.js 22.12+ or Node.js 24+. No external dependencies are required.

```bash
# Generate all 1000 SVGs, metadata JSONs, rarity report, and preview gallery:
node art/collection/generate.mjs
```

### Generated Files (in `art/collection/out/`, git-ignored)

- `out/images/{1..1000}.svg`: Vector graphic files (average size: ~8.4 KB, max: 10.2 KB, strictly below 30 KB).
- `out/metadata/{1..1000}.json`: OpenSea-standard metadata files.
- `out/rarity.json`: Complete statistical breakdown of trait occurrences and frequencies.
- `out/preview.html`: Self-contained HTML gallery showcasing the first 100 tokens with full metadata cards.

---

## 6. How to Replace IPFS CID

In the generated `out/metadata/*.json` files, image URIs are formatted as:

```json
"image": "ipfs://__IMAGES_CID__/1.svg"
```

Once the `out/images/` folder is uploaded to IPFS (e.g. via Pinata, NFT.Storage, or a local IPFS node):

1. Note the folder CID (e.g. `bafybeicg7...`).
2. Run a simple find-and-replace across `out/metadata/`:

```bash
# Using Node.js:
node -e "
const fs = require('fs');
const path = require('path');
const cid = process.argv[1];
const dir = 'art/collection/out/metadata';
for (const file of fs.readdirSync(dir)) {
  const p = path.join(dir, file);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll('__IMAGES_CID__', cid));
}
console.log('Updated metadata with CID:', cid);
" bafybeicg7YOURACTUALCIDHERE
```

3. Upload `out/metadata/` to IPFS and set the resulting metadata folder URI as `baseURI` in `SqueekRunnerHamsters.sol`:

```solidity
squeekRunnerHamsters.setBaseURI("ipfs://bafybeiMETADATACID/");
```
