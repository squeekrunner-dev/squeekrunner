import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api';
import { ServerSource } from './source';
import { TimelineCursor, type TimelinePage, type TimelinePoint } from './timeline';
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

  it('awards nuts only for confirmed growth, with identical timeline inputs whether projected exists or not', () => {
    const points = [point(at, '4332', '4357'), point(at + 1000, '4332', '99999'), point(at + 2000, '4333', '4357')];
    const page: TimelinePage = { points, serverNow: at, completeThrough: at + 3000 };
    const withDisplay = new TimelineCursor(page.points, at);
    const legacy = new TimelineCursor(points.map(({ projected: _projected, ...confirmed }) => confirmed), at);
    for (let tick = 0; tick <= 180; tick++) {
      const input = withDisplay.input(tick);
      expect(input).toEqual(legacy.input(tick));
      if (tick === 60) expect(input.nut).toBeUndefined();
      if (tick === 120) expect(input.nut).toBe(true);
    }
  });
});
