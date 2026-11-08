import { describe, expect, it } from 'vitest';
import { BlockDetector } from './blocks';
import { parseStatus } from './parse';
import { sampleStatus, SAMPLE_TIME } from './fixtures';

describe('confirmed block bonuses', () => {
  it('baseline and identical heights never award a bonus, including height zero', () => {
    const d = new BlockDetector();
    expect(d.observe('a', 0n)).toBeNull();
    expect(d.observe('a', 0n)).toBeNull();
    expect(d.observe('a', 1n)).toEqual({ installationId: 'a', height: 1n });
  });
  it('awards one bonus for +1 and one for a large jump', () => {
    const d = new BlockDetector(); d.observe('a', 1999n);
    expect(d.observe('a', 2000n)?.height).toBe(2000n);
    expect(d.observe('a', 9000n)).toEqual({ installationId: 'a', height: 9000n });
    expect(d.observe('a', 9000n)).toBeNull();
  });
  it('a falling height resets the baseline without a bonus', () => {
    const d = new BlockDetector(); d.observe('a', 100n);
    expect(d.observe('a', 20n)).toBeNull();
    expect(d.observe('a', 21n)?.height).toBe(21n);
  });
  it('installation changes reset even when the new height is larger', () => {
    const d = new BlockDetector(); d.observe('a', 100n);
    expect(d.observe('b', 1000n)).toBeNull();
    expect(d.observe('b', 1001n)?.height).toBe(1001n);
  });
  it('handles missing heights and installation changes while unavailable', () => {
    const d = new BlockDetector();
    expect(d.observe('a', null)).toBeNull();
    expect(d.observe('a', 100n)).toBeNull();
    expect(d.observe('a', null)).toBeNull();
    expect(d.observe('a', 110n)?.height).toBe(110n);
    d.observe('b', null);
    expect(d.observe('b', 500n)).toBeNull();
  });
  it('does not award a projected-only change', () => {
    const d = new BlockDetector(); const body = sampleStatus();
    const first = parseStatus(body, SAMPLE_TIME)!;
    d.observe(first.installationId, first.confirmedHeight);
    body.builder.projected.blockHeight = '99999';
    const next = parseStatus(body, SAMPLE_TIME)!;
    expect(d.observe(next.installationId, next.confirmedHeight)).toBeNull();
  });
  it('keeps one-block differences above the safe integer range', () => {
    const d = new BlockDetector(); d.observe('a', 9007199254740992n);
    expect(d.observe('a', 9007199254740993n)?.height).toBe(9007199254740993n);
  });
});
