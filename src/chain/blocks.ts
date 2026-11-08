export interface BlockBonus { installationId: string; height: bigint }

/** One event per observed rise, never per missing intermediate block. */
export class BlockDetector {
  private installation: string | null = null;
  private height: bigint | null = null;

  observe(installationId: string, height: bigint | null): BlockBonus | null {
    if (installationId !== this.installation) {
      this.installation = installationId;
      this.height = height;
      return null;
    }
    if (height === null) return null;
    const previous = this.height;
    this.height = height;
    return previous !== null && height > previous ? { installationId, height } : null;
  }
}
