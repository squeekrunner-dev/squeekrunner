import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '../..');
const outDir = resolve(__dirname, 'out');
const targetDir = resolve(root, 'public/collection');
const imagesTargetDir = resolve(targetDir, 'images');

// Deterministic selection rule:
// - 2 Legendaries: Token #1 (SqueekRunner Prime) and Token #77 (The 98.3 RPM Sprinter)
// - 22 Generative Hamsters: Tokens #2 through #23 (covering all 9 backgrounds, 9 fur colors, and varied traits)
export const SELECTED_TOKEN_IDS = [
  1, 77, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
];

export async function exportCollectionSiteAssets() {
  await mkdir(imagesTargetDir, { recursive: true });

  // 1. Copy rarity.json
  const raritySrc = resolve(outDir, 'rarity.json');
  const rarityDest = resolve(targetDir, 'rarity.json');
  const rarityRaw = await readFile(raritySrc, 'utf8');
  await copyFile(raritySrc, rarityDest);

  // 2. Build featured.json and copy SVGs
  const featured = [];
  let totalBytes = (await stat(rarityDest)).size;

  for (const id of SELECTED_TOKEN_IDS) {
    const metaPath = resolve(outDir, `metadata/${id}.json`);
    const svgSrc = resolve(outDir, `images/${id}.svg`);
    const svgDest = resolve(imagesTargetDir, `${id}.svg`);

    await copyFile(svgSrc, svgDest);
    const svgStat = await stat(svgDest);
    totalBytes += svgStat.size;

    const meta = JSON.parse(await readFile(metaPath, 'utf8'));
    const isLegendary = id === 1 || id === 77;

    featured.push({
      id,
      name: meta.name,
      description: meta.description,
      isLegendary,
      image: `./images/${id}.svg`,
      attributes: meta.attributes,
    });
  }

  const featuredDest = resolve(targetDir, 'featured.json');
  const featuredContent = JSON.stringify(featured, null, 2);
  await writeFile(featuredDest, featuredContent, 'utf8');
  totalBytes += (await stat(featuredDest)).size;

  const totalKb = (totalBytes / 1024).toFixed(1);
  console.log(`Successfully exported 24 featured hamsters to public/collection/`);
  console.log(`- Images: 24 SVGs in public/collection/images/`);
  console.log(`- Data: public/collection/rarity.json and featured.json`);
  console.log(`- Total exported size: ${totalKb} KB (budget: <= 400 KB)`);

  if (totalBytes > 400 * 1024) {
    throw new Error(`Exported collection assets exceed 400 KB budget: ${totalKb} KB`);
  }

  return { totalBytes, count: SELECTED_TOKEN_IDS.length };
}

// Run when executed directly
if (process.argv[1] === __filename) {
  exportCollectionSiteAssets().catch(error => {
    console.error('Export failed:', error);
    process.exit(1);
  });
}
