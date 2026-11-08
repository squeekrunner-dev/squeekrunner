import { CHUNK_TICKS, MAX_TICKS, TICK_HZ } from '../../src/sim/core';
import { MAP_LEAD_MS, type MapChunk, type MapPage } from '../../src/net/timeline';

export const MAX_CHUNKS = Math.ceil(MAX_TICKS / CHUNK_TICKS);
const PAGE = 8;
const chunkStart = (startedAt: number, index: number): number => startedAt + index * CHUNK_TICKS * 1000 / TICK_HZ;

/** Highest chunk index whose seed may be revealed at `now` (-1 before the first release). */
export function releasedThrough(startedAt: number, now: number): number {
  return Math.min(MAX_CHUNKS - 1, Math.floor((now + MAP_LEAD_MS - startedAt) * TICK_HZ / (1000 * CHUNK_TICKS)));
}
/** Chunk seed = first 32 bits of SHA-256 over the session's private map secret and the chunk index. */
export async function chunkSeed(secret: string, index: number): Promise<number> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`squeek-map:${secret}:${index}`)));
  return ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
}
export async function chunkSeeds(secret: string, count: number): Promise<number[]> {
  return Promise.all(Array.from({ length: count }, (_, i) => chunkSeed(secret, i)));
}
export async function mapPage(secret: string, startedAt: number, from: number, now: number): Promise<MapPage> {
  const last = Math.min(releasedThrough(startedAt, now), from + PAGE - 1);
  const chunks: MapChunk[] = [];
  for (let index = from; index <= last; index++) chunks.push({ index, seed: await chunkSeed(secret, index) });
  return { chunks, nextAt: chunkStart(startedAt, Math.max(from, releasedThrough(startedAt, now) + 1)) - MAP_LEAD_MS, serverNow: now };
}
