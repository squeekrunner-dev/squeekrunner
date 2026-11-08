export interface BlockBonus { installationId: string; height: bigint }
export interface BlockUpdate { bonus: BlockBonus | null; reset: boolean }

/** One event per observed rise, never per missing intermediate block. */
export class BlockDetector {
  private installation: string | null = null;
  private height: bigint | null = null;
  private baselineNext = false;

  /** Ignore growth across a menu/pause gap without losing reset detection. */
  rebaseNext(): void { this.baselineNext = true; }

  observe(installationId: string, height: bigint | null): BlockUpdate {
    if (installationId !== this.installation) {
      const reset = this.installation !== null;
      this.installation = installationId;
      this.height = height;
      this.baselineNext = false;
      return { bonus: null, reset };
    }
    if (height === null) return { bonus: null, reset: false };
    const previous = this.height;
    this.height = height;
    const bonus = !this.baselineNext && previous !== null && height > previous ? { installationId, height } : null;
    this.baselineNext = false;
    return { bonus, reset: previous !== null && height < previous };
  }
}
