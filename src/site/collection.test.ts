import { describe, expect, it } from 'vitest';
import featuredList from '../../public/collection/featured.json';
import rarityData from '../../public/collection/rarity.json';
import {
  buildAltText,
  findHamsterById,
  GalleryModalController,
  type FeaturedHamster,
} from './collection';

const SAMPLE_HAMSTERS: FeaturedHamster[] = [
  {
    id: 1,
    name: 'SqueekRunner Prime — The First Runner',
    description: 'The founding champion of SqueekRunner.',
    isLegendary: true,
    image: './images/1.svg',
    attributes: [
      { trait_type: 'Edition', value: '1 of 1 Legendary' },
      { trait_type: 'Character', value: 'SqueekRunner Prime' },
    ],
  },
  {
    id: 2,
    name: 'SqueekRunner Hamster #2',
    description: 'A unique generative hamster athlete.',
    isLegendary: false,
    image: './images/2.svg',
    attributes: [
      { trait_type: 'Background', value: 'Cyber Grid' },
      { trait_type: 'Fur Color', value: 'Caramel Cream' },
      { trait_type: 'Eyes', value: 'Happy Wink' },
      { trait_type: 'Headwear', value: 'Retro Sweatband' },
      { trait_type: 'Held Item', value: 'Giant Sunflower Seed' },
    ],
  },
];

describe('buildAltText', () => {
  it('formats legendary hamster alt text correctly', () => {
    const alt = buildAltText(SAMPLE_HAMSTERS[0]);
    expect(alt).toContain('SqueekRunner Prime');
    expect(alt).toContain('1 of 1 Legendary');
  });

  it('formats standard hamster alt text with traits', () => {
    const alt = buildAltText(SAMPLE_HAMSTERS[1]);
    expect(alt).toContain('Hamster #2');
    expect(alt).toContain('Caramel Cream');
    expect(alt).toContain('Happy Wink eyes');
    expect(alt).toContain('wearing Retro Sweatband');
    expect(alt).toContain('holding Giant Sunflower Seed');
  });
});

describe('findHamsterById', () => {
  it('locates hamster by token id', () => {
    expect(findHamsterById(SAMPLE_HAMSTERS, 1)?.name).toContain('Prime');
    expect(findHamsterById(SAMPLE_HAMSTERS, 2)?.name).toContain('#2');
    expect(findHamsterById(SAMPLE_HAMSTERS, 999)).toBeUndefined();
  });
});

function createMockModal() {
  const classes = new Set<string>();
  const attrs = new Map<string, string>();
  const elements = new Map<string, Record<string, unknown>>();

  for (const selector of [
    '[data-modal-img]',
    '[data-modal-title]',
    '[data-modal-desc]',
    '[data-modal-traits]',
    '[data-modal-badge]',
    '[data-modal-close]',
  ]) {
    elements.set(selector, { textContent: '', className: '', src: '', alt: '', focus: () => {} });
  }

  const modalEl = {
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      contains: (c: string) => classes.has(c),
    },
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
    querySelector: (selector: string) => elements.get(selector) ?? null,
  } as unknown as HTMLElement;

  return { modalEl, elements, classes, attrs };
}

describe('GalleryModalController', () => {
  it('updates modal DOM and attributes on open and close', () => {
    const { modalEl, elements, classes, attrs } = createMockModal();
    const controller = new GalleryModalController(modalEl, SAMPLE_HAMSTERS);
    expect(controller.getActiveId()).toBeNull();

    const opened = controller.open(2);
    expect(opened).toBe(true);
    expect(controller.getActiveId()).toBe(2);
    expect(classes.has('is-open')).toBe(true);
    expect(attrs.get('aria-hidden')).toBe('false');

    const titleEl = elements.get('[data-modal-title]');
    expect(titleEl?.textContent).toBe('SqueekRunner Hamster #2');

    const badgeEl = elements.get('[data-modal-badge]');
    expect(badgeEl?.textContent).toContain('Token #2');

    controller.close();
    expect(controller.getActiveId()).toBeNull();
    expect(classes.has('is-open')).toBe(false);
    expect(attrs.get('aria-hidden')).toBe('true');
  });

  it('returns false when opening a non-existent token', () => {
    const { modalEl } = createMockModal();
    const controller = new GalleryModalController(modalEl, SAMPLE_HAMSTERS);
    expect(controller.open(9999)).toBe(false);
    expect(controller.getActiveId()).toBeNull();
  });
});

describe('Exported site assets integrity', () => {
  it('has valid public/collection/featured.json with exactly 24 tokens', () => {
    const list = featuredList as unknown as FeaturedHamster[];

    expect(list.length).toBe(24);
    expect(list[0].id).toBe(1);
    expect(list[0].isLegendary).toBe(true);
    expect(list[1].id).toBe(77);
    expect(list[1].isLegendary).toBe(true);

    for (const h of list) {
      expect(h.id).toBeGreaterThanOrEqual(1);
      expect(h.id).toBeLessThanOrEqual(1000);
      expect(h.name).toBeTruthy();
      expect(h.attributes.length).toBeGreaterThan(0);
      expect(h.image).toBe(`./images/${h.id}.svg`);
    }
  });

  it('has valid rarity.json with 1000 total supply', () => {
    expect(rarityData.totalSupply).toBe(1000);
    expect(rarityData.legendarySupply).toBe(10);
    expect(rarityData.standardSupply).toBe(990);
    expect(rarityData.traitDistribution.background).toBeDefined();
    expect(rarityData.traitDistribution.furColor).toBeDefined();
  });
});
