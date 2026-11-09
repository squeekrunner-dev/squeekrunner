import { describe, expect, it } from 'vitest';
import { pendingBlocks, projectedHeight } from './pending';
import { DemoSource } from './demo';
import { CONFIG } from '../config';

describe('pending block display', () => {
  it('subtracts uint64 heights exactly and formats the delta in English', () => {
    expect(pendingBlocks(4332n, 4357n)).toBe('+25 pending');
    expect(pendingBlocks(18446744073709551590n, 18446744073709551615n)).toBe('+25 pending');
    expect(pendingBlocks(0n, 18446744073709551615n)).toBe('+18,446,744,073,709,551,615 pending');
  });
  it('hides absent, equal and backward projections', () => {
    for (const [confirmed, projected] of [[null, 10n], [10n, null], [10n, undefined], [10n, 10n], [10n, 9n]] as const) {
      expect(pendingBlocks(confirmed, projected)).toBe('');
    }
  });
  it('accepts only exact unsigned uint64 strings from optional server metadata', () => {
    expect(projectedHeight('18446744073709551615')).toBe(18446744073709551615n);
    expect(projectedHeight('0')).toBe(0n);
    for (const value of [undefined, null, 4357, '-1', '1.5', '0xff', '18446744073709551616', '01', {}]) {
      expect(projectedHeight(value)).toBeNull();
    }
  });
  it('preserves demo pending work without changing its confirmed height', () => {
    const start = Date.now(); let now = start;
    const demo = new DemoSource(() => now);
    demo.start();
    expect(pendingBlocks(demo.read().snapshot?.confirmedHeight, demo.read().snapshot?.projectedHeight)).toBe('');
    demo.stop();
    now += CONFIG.demo.idleMs + 1000;
    demo.start();
    const snapshot = demo.read().snapshot!;
    expect(snapshot.confirmedHeight).toBe(CONFIG.demo.initialHeight);
    expect(pendingBlocks(snapshot.confirmedHeight, snapshot.projectedHeight)).toBe('+1 pending');
    demo.stop();
  });
});
