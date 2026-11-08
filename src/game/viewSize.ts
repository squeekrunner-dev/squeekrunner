import { CONFIG } from '../config';

/** Widest view (≈2.2:1). Beyond that, bars are kept so obstacles never pop into a wide empty area. */
export const MAX_WIDTH = 1200;
export const MAX_PAD = (MAX_WIDTH - CONFIG.width) / 2;

export function viewWidth(width: number, height: number): number {
  if (!(width > 0 && height > 0)) return CONFIG.width;
  return Math.max(CONFIG.width, Math.min(MAX_WIDTH, Math.round(CONFIG.height * width / height)));
}
