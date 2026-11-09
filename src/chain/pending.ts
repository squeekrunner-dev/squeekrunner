/** Optional presentation metadata, deliberately separate from the authoritative timeline contract. */
export interface ProjectedPoint { projected?: string | null }

export function projectedHeight(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(value)) return null;
  const height = BigInt(value);
  return height <= 18446744073709551615n ? height : null;
}

/** Shared HUD/landing wording. Never turn a projection into a confirmed height or a bonus. */
export function pendingBlocks(confirmed: bigint | null | undefined, projected: bigint | null | undefined): string {
  if (confirmed == null || projected == null || projected <= confirmed) return '';
  return `+${(projected - confirmed).toLocaleString('en-US')} pending`;
}
