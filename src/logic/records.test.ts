import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { RecordStore, type StoragePort } from './records';

function memory(): StoragePort {
  const map = new Map<string, string>();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); } };
}
const block = { installationId: 'a', height: 9007199254740993n };

describe('local records', () => {
  it('round-trips global and per-block best, without reducing a record', () => {
    const storage = memory(); const records = new RecordStore('live', () => storage);
    records.save(120, block); records.save(50, block);
    records.save(200, { ...block, height: 2n });
    const reloaded = new RecordStore('live', () => storage);
    expect(reloaded.best).toBe(200);
    expect(reloaded.bestFor(block)).toBe(120);
    expect(reloaded.bestFor({ ...block, installationId: 'b' })).toBe(0);
  });
  it('separates demo and live scores', () => {
    const storage = memory(); new RecordStore('demo', () => storage).save(999, block);
    expect(new RecordStore('live', () => storage).best).toBe(0);
  });
  it('keeps unknown-block scores global without fabricating a block', () => {
    const records = new RecordStore('live', memory); records.save(123, null);
    expect(records.best).toBe(123); expect(records.bestFor(null)).toBe(0);
  });
  it('survives denied access, read failures and quota write failures', () => {
    for (const access of [
      (): StoragePort => { throw new Error('blocked'); },
      (): StoragePort => ({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } }),
      (): StoragePort => ({ getItem: () => null, setItem() { throw new Error('quota'); } }),
    ]) {
      const records = new RecordStore('live', access);
      expect(() => records.save(80, block)).not.toThrow();
      expect(records.best).toBe(80); expect(records.bestFor(block)).toBe(80);
    }
  });
  it.each(['oops', 'null', '{"version":2,"best":9,"blocks":{}}', '{"version":1,"best":-1,"blocks":{}}'])('ignores corrupt saved state %s', text => {
    const records = new RecordStore('live', () => ({ getItem: () => text, setItem() {} }));
    expect(records.best).toBe(0);
  });
  it('bounds block history and rejects unusable scores', () => {
    const storage = memory(); const records = new RecordStore('live', () => storage);
    for (let i = 0; i < CONFIG.records.maxBlocks + 1; i++) records.save(i, { ...block, height: BigInt(i) });
    for (const score of [-1, NaN, Infinity, 3.5]) records.save(score, block);
    const raw = JSON.parse(storage.getItem(`${CONFIG.records.key}.live`)!) as { blocks: Record<string, number> };
    expect(Object.keys(raw.blocks)).toHaveLength(CONFIG.records.maxBlocks);
    expect(records.best).toBe(CONFIG.records.maxBlocks);
  });
});
