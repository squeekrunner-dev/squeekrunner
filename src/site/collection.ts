export interface TraitAttribute {
  trait_type: string;
  value: string;
}

export interface FeaturedHamster {
  id: number;
  name: string;
  description: string;
  isLegendary: boolean;
  image: string;
  attributes: TraitAttribute[];
}

export interface TraitStat {
  count: number;
  percentage: string;
}

export interface RarityReport {
  collection: string;
  totalSupply: number;
  standardSupply: number;
  legendarySupply: number;
  seed: string;
  traitDistribution: Record<string, Record<string, TraitStat>>;
}

/**
 * Builds an accessible, descriptive alt text for a hamster from its attributes.
 */
export function buildAltText(hamster: FeaturedHamster): string {
  if (hamster.isLegendary) {
    return `${hamster.name}. 1 of 1 Legendary SqueekRunner milestone champion.`;
  }

  const traits = new Map(hamster.attributes.map(a => [a.trait_type, a.value]));
  const fur = traits.get('Fur Color') ?? 'athletic fur';
  const eyes = traits.get('Eyes');
  const headwear = traits.get('Headwear');
  const held = traits.get('Held Item');

  const parts = [`Hamster #${hamster.id} with ${fur}`];
  if (eyes) parts.push(`${eyes} eyes`);
  if (headwear && headwear !== 'None') parts.push(`wearing ${headwear}`);
  if (held) parts.push(`holding ${held}`);

  return parts.join(', ') + '.';
}

export function findHamsterById(
  hamsters: readonly FeaturedHamster[],
  id: number,
): FeaturedHamster | undefined {
  return hamsters.find(h => h.id === id);
}

export class GalleryModalController {
  private activeId: number | null = null;
  private previouslyFocused: HTMLElement | null = null;
  private readonly modalElement: HTMLElement;
  private readonly hamsters: readonly FeaturedHamster[];

  constructor(
    modalElement: HTMLElement,
    hamsters: readonly FeaturedHamster[],
  ) {
    this.modalElement = modalElement;
    this.hamsters = hamsters;
  }

  getActiveId(): number | null {
    return this.activeId;
  }

  open(id: number): boolean {
    const hamster = findHamsterById(this.hamsters, id);
    if (!hamster) return false;

    this.previouslyFocused =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    this.activeId = id;

    const imgEl = this.modalElement.querySelector<HTMLImageElement>('[data-modal-img]');
    const titleEl = this.modalElement.querySelector<HTMLElement>('[data-modal-title]');
    const descEl = this.modalElement.querySelector<HTMLElement>('[data-modal-desc]');
    const traitsEl = this.modalElement.querySelector<HTMLElement>('[data-modal-traits]');
    const badgeEl = this.modalElement.querySelector<HTMLElement>('[data-modal-badge]');

    if (imgEl) {
      imgEl.src = hamster.image;
      imgEl.alt = buildAltText(hamster);
    }
    if (titleEl) titleEl.textContent = hamster.name;
    if (descEl) descEl.textContent = hamster.description;

    if (badgeEl) {
      if (hamster.isLegendary) {
        badgeEl.textContent = '1 of 1 Legendary';
        badgeEl.className = 'token-badge badge-legendary';
      } else {
        badgeEl.textContent = `Token #${hamster.id} · Generative`;
        badgeEl.className = 'token-badge badge-standard';
      }
    }

    if (traitsEl) {
      traitsEl.innerHTML = '';
      for (const attr of hamster.attributes) {
        if (typeof document !== 'undefined') {
          const item = document.createElement('div');
          item.className = 'trait-pill';

          const category = document.createElement('span');
          category.className = 'trait-category';
          category.textContent = attr.trait_type;

          const value = document.createElement('strong');
          value.className = 'trait-val';
          value.textContent = attr.value;

          item.appendChild(category);
          item.appendChild(value);
          traitsEl.appendChild(item);
        }
      }
    }

    this.modalElement.classList.add('is-open');
    this.modalElement.setAttribute('aria-hidden', 'false');

    const closeBtn = this.modalElement.querySelector<HTMLElement>('[data-modal-close]');
    closeBtn?.focus();

    return true;
  }

  close(): void {
    this.activeId = null;
    this.modalElement.classList.remove('is-open');
    this.modalElement.setAttribute('aria-hidden', 'true');
    this.previouslyFocused?.focus();
  }
}

/**
 * Binds interactivity to the collection gallery and modal.
 */
export function initCollectionGallery(
  galleryRoot: HTMLElement,
  modalElement: HTMLElement,
  hamsters: readonly FeaturedHamster[],
): () => void {
  const controller = new GalleryModalController(modalElement, hamsters);

  const handleClick = (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-hamster-id]');
    if (target) {
      const id = Number(target.dataset.hamsterId);
      if (!Number.isNaN(id)) {
        controller.open(id);
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && controller.getActiveId() !== null) {
      controller.close();
    }
  };

  const closeBtn = modalElement.querySelector<HTMLElement>('[data-modal-close]');
  const handleCloseClick = () => controller.close();

  const handleBackdropClick = (event: MouseEvent) => {
    if (event.target === modalElement) {
      controller.close();
    }
  };

  galleryRoot.addEventListener('click', handleClick);
  window.addEventListener('keydown', handleKeyDown);
  closeBtn?.addEventListener('click', handleCloseClick);
  modalElement.addEventListener('click', handleBackdropClick);

  return () => {
    galleryRoot.removeEventListener('click', handleClick);
    window.removeEventListener('keydown', handleKeyDown);
    closeBtn?.removeEventListener('click', handleCloseClick);
    modalElement.removeEventListener('click', handleBackdropClick);
  };
}

// Auto-bootstrapping when loaded via browser script
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const gallery = document.querySelector<HTMLElement>('[data-collection-gallery]');
  const modal = document.querySelector<HTMLElement>('[data-hamster-modal]');

  if (gallery && modal) {
    // Fetch featured.json to power the interactive modal
    fetch('./featured.json')
      .then(response => {
        if (!response.ok) throw new Error('Failed to load featured hamsters');
        return response.json() as Promise<FeaturedHamster[]>;
      })
      .then(hamsters => {
        initCollectionGallery(gallery, modal, hamsters);
      })
      .catch(error => {
        console.warn('Collection interactive gallery initialized without dynamic metadata:', error);
      });
  }
}
