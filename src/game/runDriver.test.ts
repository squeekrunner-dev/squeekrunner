import { expect, it } from 'vitest';
import { RunDriver, rpmSample } from './runDriver';
import { verifyReplay } from '../sim/replay';
import { stateHash } from '../sim/core';
import type { TelemetryView } from '../chain/types';

it('records the applied stream at any frame rate and verifies its final score', () => {
  const hashes: string[] = [];
  for (const delta of [1000 / 30, 1000 / 60, 1000 / 120, 1000 / 144]) {
    const driver = new RunDriver(123, 'live');
    driver.nut();
    let endings = 0;
    while (!driver.sim.gameOver) driver.advance(delta, 72000, events => { if (events.includes('gameOver')) endings++; });
    expect(endings).toBe(1);
    expect(verifyReplay(driver.replay)).toMatchObject({ ok: true, score: driver.sim.score, endTick: driver.sim.tick });
    expect(driver.replay?.telemetry).toEqual([{ tick: 0, rpmMilli: 72000 }]);
    hashes.push(stateHash(driver.sim));
  }
  expect(new Set(hashes).size).toBe(1);
});

it('queues events once, records changes/null, drops stalled wall time and resets pause input', () => {
  const driver = new RunDriver(1, 'live');
  driver.jump(); driver.jump(); driver.nut(); driver.resetNut(); driver.nut();
  driver.advance(5000, 98316, () => {});
  expect(driver.sim.tick).toBe(3);
  expect(driver.sim.player.jumps).toBe(1);
  driver.jump(); driver.pause();
  driver.advance(1000 / 60, null, () => {});
  expect(driver.sim.player.jumps).toBe(1);
  while (!driver.sim.gameOver) driver.advance(50, null, () => {});
  expect(driver.replay?.inputs).toEqual([0]);
  expect(driver.replay?.nuts).toEqual([0]);
  expect(driver.replay?.nutResets).toEqual([0]);
  expect(driver.replay?.telemetry).toEqual([{ tick: 0, rpmMilli: 98316 }, { tick: 3, rpmMilli: null }]);
  expect(verifyReplay(driver.replay).ok).toBe(true);
});

it('a restarted driver has no old pending input, nut, accumulator or recording', () => {
  const old = new RunDriver(0, 'live'); old.jump(); old.nut(); old.advance(1, 0, () => {});
  const fresh = new RunDriver(0, 'demo'); fresh.advance(50, 0, () => {});
  expect(fresh.sim.player.jumps).toBe(0); expect(fresh.sim.nut).toBeNull();
  expect(fresh.replay).toBeNull(); expect(fresh.sim.tick).toBe(3);
});

it('maps stale, missing and faulted views to explicit null even with a retained RPM', () => {
  const view: TelemetryView = { mode: 'NO DATA', rpm: 72, snapshot: null, reason: 'stale' };
  expect(rpmSample(view)).toBeNull();
  expect(rpmSample({ ...view, mode: 'LIVE' })).toBe(72000);
  expect(rpmSample({ ...view, mode: 'WHEEL IDLE', rpm: 0 })).toBe(0);
  expect(rpmSample({ ...view, mode: 'LIVE', rpm: NaN })).toBeNull();
});
