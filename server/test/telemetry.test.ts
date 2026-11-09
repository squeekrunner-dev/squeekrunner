import { describe, expect, it } from 'vitest';
import { sampleStatus, SAMPLE_TIME } from '../../src/chain/fixtures';
import type { ProjectedPoint } from '../../src/chain/pending';
import { TELEMETRY_LEAD_MS, TimelineCursor, type TimelinePoint } from '../../src/net/timeline';
import { history, TelemetryCollector } from '../src/telemetry';
import { harness } from './harness';
import { CONFIG } from '../../src/config';

type DisplayPoint = TimelinePoint & ProjectedPoint;

function collectorHarness() {
  const h = harness(); h.clock.now = SAMPLE_TIME;
  let body: unknown = sampleStatus();
  let alarm: number | null = null;
  const values = new Map<string, unknown>();
  const state = {
    blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn(),
    storage: {
      getAlarm: async () => alarm,
      setAlarm: async (at: number) => { alarm = at; },
      get: async (key: string) => structuredClone(values.get(key)),
      put: async (key: string, value: unknown) => { values.set(key, structuredClone(value)); },
      list: async ({ prefix, end }: { prefix: string; end: string }) =>
        new Map([...values].filter(([key]) => key.startsWith(prefix) && key < end)),
      delete: async (keys: string[]) => { for (const key of keys) values.delete(key); },
    },
  };
  const rt = { now: h.rt.now, fetcher: (async () => Response.json(body)) as typeof fetch };
  let collector = new TelemetryCollector(state as unknown as DurableObjectState, h.env, rt);
  const stub = { fetch: (url: string) => collector.fetch(new Request(url)) };
  h.env.COLLECTOR = { idFromName: () => ({}), get: () => stub } as unknown as DurableObjectNamespace;
  return {
    h, values,
    setBody: (next: unknown) => { body = next; },
    alarm: () => collector.alarm(),
    restart: () => { collector = new TelemetryCollector(state as unknown as DurableObjectState, h.env, rt); },
    page: async () => {
      const reply = await h.call('GET', '/v1/telemetry');
      expect(reply.status).toBe(200);
      return reply.json() as Promise<{ points: DisplayPoint[]; completeThrough: number }>;
    },
  };
}

describe('projected telemetry (authoritative since squeek-6)', () => {
  it('publishes projected strings and preserves authoritative DB history across DO restart', async () => {
    const c = collectorHarness(), body = sampleStatus();
    body.builder.anchor.blockHeight = '18446744073709551590';
    body.builder.projected.blockHeight = '18446744073709551615';
    c.setBody(body);
    await c.alarm();
    c.restart();
    const { points, completeThrough } = await c.page();
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ at: SAMPLE_TIME + TELEMETRY_LEAD_MS, height: '18446744073709551590', projected: '18446744073709551615', rpmMilli: 98316 });
    expect(completeThrough).toBe(SAMPLE_TIME + TELEMETRY_LEAD_MS);
    // squeek-6: projected is part of the authoritative D1 history the verifier replays.
    expect(await history(c.h.env.DB, SAMPLE_TIME, completeThrough)).toEqual([points[0]]);
    await c.alarm(); // at-least-once alarm retry does not create duplicate points
    expect((await c.page()).points).toEqual(points);
  });

  it.each([undefined, null])('returns projected=null when the source omits projection (%s), retaining confirmed telemetry', async projected => {
    const c = collectorHarness(), body = sampleStatus();
    c.setBody({ ...body, builder: { ...body.builder, projected } });
    await c.alarm();
    expect((await c.page()).points[0]).toMatchObject({ height: '1999', projected: null, rpmMilli: 98316 });
  });

  it('returns projected=null for pre-upgrade D1 points and unavailable upstream data', async () => {
    const c = collectorHarness();
    c.h.addPoint({ at: SAMPLE_TIME - 1000, height: '4332', projected: null });
    expect((await c.page()).points[0]).toMatchObject({ height: '4332', projected: null });
    c.setBody(null);
    await c.alarm();
    expect((await c.page()).points.at(-1)).toMatchObject({ height: null, projected: null, rpmMilli: null });
  });

  it('squeek-6: a nut drops each time pending crosses a multiple of 5 blocks, not when a batch settles', async () => {
    const c = collectorHarness(), body = sampleStatus();
    body.builder.anchor.blockHeight = '4332'; body.builder.projected.blockHeight = '4357';
    c.setBody(body); await c.alarm();
    c.h.clock.now += 10000;
    body.builder.projected.blockHeight = '4360';           // pending crosses a multiple of 5 → nut
    c.setBody(body); await c.alarm();
    c.h.clock.now += 10000;
    body.builder.anchor.blockHeight = '4350';              // a batch of 18 settles, projected unchanged → no nut
    c.setBody(body); await c.alarm();
    const { points } = await c.page();
    expect(points.map(p => [p.height, p.projected])).toEqual([['4332', '4357'], ['4332', '4360'], ['4350', '4360']]);
    const fromPage = new TimelineCursor(points, points[0].at);
    const fromDb = new TimelineCursor(await history(c.h.env.DB, points[0].at, points[2].at), points[0].at);
    const nutTicks: number[] = [];
    for (let tick = 0; tick <= 1300; tick++) {
      const input = fromPage.input(tick);
      expect(input).toEqual(fromDb.input(tick));
      if (input.nut) nutTicks.push(tick);
    }
    expect(nutTicks).toEqual([600]);
  });

  it('pre-upgrade points without projected never produce a nut', async () => {
    const c = collectorHarness();
    c.h.addPoint({ at: SAMPLE_TIME + 1000, height: '4332', projected: null });
    c.h.addPoint({ at: SAMPLE_TIME + 11000, height: '4340', projected: null });
    const cursor = new TimelineCursor(await history(c.h.env.DB, SAMPLE_TIME, SAMPLE_TIME + 20000), SAMPLE_TIME);
    for (let tick = 0; tick <= 1200; tick++) expect(cursor.input(tick).nut).toBeUndefined();
  });
});
describe('collector cadence and zero smoothing', () => {
  const withRpm = (rpmMilli: number) => { const body = sampleStatus(); body.measurement.rpmMilli = rpmMilli; return body; };

  it('bridges a brief 0 between live readings but publishes a real stop', async () => {
    const c = collectorHarness();
    const rpms: number[] = [];
    const step = async (rpmMilli: number) => {
      c.setBody(withRpm(rpmMilli)); await c.alarm();
      const { points } = await c.page(); rpms.push(points[points.length - 1].rpmMilli!);
      c.h.clock.now += CONFIG.telemetry.collectMs;
    };
    await step(64000);  // live
    await step(0);      // lone dropout → held
    await step(70000);  // live again
    await step(0); await step(0); // still within zeroHoldMs of the last live reading → held
    await step(0);      // beyond the hold → real stop
    await step(0);
    expect(CONFIG.telemetry.zeroHoldMs).toBeLessThan(3 * CONFIG.telemetry.collectMs);
    expect(rpms).toEqual([64000, 64000, 70000, 70000, 70000, 0, 0]);
  });

  it('collects every collectMs and ignores an early alarm retry', async () => {
    const c = collectorHarness();
    await c.alarm();
    c.h.clock.now += 500; await c.alarm(); // at-least-once retry
    c.h.clock.now += CONFIG.telemetry.collectMs; await c.alarm();
    expect((await c.page()).points).toHaveLength(2);
  });
});
