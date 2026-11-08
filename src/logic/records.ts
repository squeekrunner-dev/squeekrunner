import { CONFIG } from '../config';
import { isRecord } from '../chain/parse';
import type { SourceKind } from '../chain/types';

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
interface Records { version: 1; best: number; blocks: Record<string, number> }
export interface RunBlock { installationId: string; height: bigint }

export function runBlockKey(block: RunBlock): string {
  return `${block.installationId}:${block.height.toString()}`;
}

function validScore(score: unknown): score is number {
  return typeof score === 'number' && Number.isSafeInteger(score) && score >= 0;
}

/** In-memory records survive denied/quota-full storage for this page session. */
export class RecordStore {
  private records: Records = { version: 1, best: 0, blocks: {} };
  private readonly key: string;

  constructor(kind: SourceKind, private readonly storage: () => StoragePort = () => window.localStorage) {
    this.key = `${CONFIG.records.key}.${kind}`;
    try {
      const text = this.storage().getItem(this.key);
      const value: unknown = text === null ? null : JSON.parse(text);
      if (isRecord(value) && value.version === 1 && validScore(value.best) && isRecord(value.blocks)) {
        const entries = Object.entries(value.blocks)
          .filter(([key, score]) => key.length <= 150 && key.includes(':') && validScore(score))
          .slice(-CONFIG.records.maxBlocks) as [string, number][];
        this.records = { version: 1, best: Math.max(value.best, ...entries.map(([, score]) => score)), blocks: Object.fromEntries(entries) };
      }
    } catch { /* Storage access, malformed JSON and privacy modes must never stop play. */ }
  }

  get best(): number { return this.records.best; }

  bestFor(block: RunBlock | null): number {
    return block ? this.records.blocks[runBlockKey(block)] ?? 0 : 0;
  }

  save(score: number, block: RunBlock | null): void {
    if (!validScore(score)) return;
    this.records.best = Math.max(this.records.best, score);
    if (block) {
      const key = runBlockKey(block);
      const best = Math.max(this.records.blocks[key] ?? 0, score);
      const entries = Object.entries(this.records.blocks).filter(([existing]) => existing !== key);
      entries.push([key, best]);
      this.records.blocks = Object.fromEntries(entries.slice(-CONFIG.records.maxBlocks));
    }
    try { this.storage().setItem(this.key, JSON.stringify(this.records)); }
    catch { /* Keep the in-memory result even when persistence is unavailable. */ }
  }
}
