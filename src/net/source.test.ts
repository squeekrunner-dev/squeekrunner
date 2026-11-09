import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api';
import { ServerSource } from './source';
import { TimelineCursor, type TimelinePoint } from './timeline';
import type { ProjectedPoint } from '../chain/pending';
import { pendingBlocks } from '../chain/pending';
import { formatTelemetry } from '../site/telemetry';

const at = 1800000000000;
function point(time: number, height: string, projected?: string | null): TimelinePoint & ProjectedPoint {
  return { at: time, validUntil: time + 120000, rpmMilli: 98316, installationId: 'wheel', height, projected };
}
afterEach(() => vi.useRealTimers());

describe('server projected display metadata', () => {
  it('hydrates the ranked HUD snapshot and landing format from the same exact BigInt values', () => {
    vi.useFakeTimers(); vi.setSystemTime(at);
    const source = new ServerSource(new ApiClient('https://unused.test'));
    const points = [point(at, '18446744073709551590', '18446744073709551615')];
    source.merge({ points, serverNow: at, completeThrough: at + 5000 });
    const view = source.read();
    expect(view.snapshot).toMatchObject({ confirmedHeight: 18446744073709551590n, projectedHeight: 18446744073709551615n });
    expect(pendingBlocks(view.snapshot!.confirmedHeight, view.snapshot!.projectedHeight)).toBe('+25 pending');
    expect(formatTelemetry(view).height).toBe('#18,446,744,073,709,551,590 · +25 pending');
  });

  it('keeps old server pages compatible and waits for the effective point instead of leaking future pending', () => {
    vi.useFakeTimers(); vi.setSystemTime(at);
    const source = new ServerSource(new ApiClient('https://unused.test'));
    const legacy = point(at, '4332'); delete legacy.projected;
    source.merge({ points: [legacy, point(at + 5000, '4332', '4357')], serverNow: at, completeThrough: at + 10000 });
    expect(source.read().snapshot?.projectedHeight).toBeNull();
    vi.setSystemTime(at + 5000);
    expect(source.read().snapshot?.projectedHeight).toBe(4357n);
    vi.setSystemTime(at + 10001);
    expect(formatTelemetry(source.read()).height).toBe('#4,332');
  });

  it('ignores malformed projected metadata without invalidating the confirmed height', () => {
    const source = new ServerSource(new ApiClient('https://unused.test'));
    source.merge({ points: [point(at, '4332', 'not a height')], serverNow: at, completeThrough: at + 5000 });
    expect(source.read().snapshot).toMatchObject({ confirmedHeight: 4332n, projectedHeight: null });
  });

  it('squeek-6: awards a nut each time projected crosses a multiple of 5, ignoring confirmed (batch) growth', () => {
    const points = [point(at, '4332', '4357'), point(at + 1000, '4332', '4359'), point(at + 2000, '4350', '4360'),
      point(at + 3000, '4355', '4362')];
    const cursor = new TimelineCursor(points, at);
    const nuts: number[] = [];
    for (let tick = 0; tick <= 240; tick++) if (cursor.input(tick).nut) nuts.push(tick);
    expect(nuts).toEqual([120]);          // 4359→4360 crosses 4360; batch settlement 4332→4355 gives nothing
    const legacy = new TimelineCursor(points.map(({ projected: _p, ...confirmed }) => confirmed), at);
    for (let tick = 0; tick <= 240; tick++) expect(legacy.input(tick).nut).toBeUndefined();
  });
});
