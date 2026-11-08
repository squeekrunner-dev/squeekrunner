import { expect, it } from 'vitest';
import { RunDriver } from '../game/runDriver';
import { createSim, step } from '../sim/core';
import { TimelineCursor, type TimelinePoint } from './timeline';

const startedAt = 1_800_000_000_000;
const points: TimelinePoint[] = [];
for (let i = -2; i < 120; i++) {
  points.push({ at: startedAt + i * 10000, validUntil: startedAt + i * 10000 + 120000, rpmMilli: i % 3 ? 98316 : 0,
    installationId: 'inst', height: String(100 + Math.max(0, Math.floor(i / 2))) });
}

it('a ranked client run equals the verifier recomputation, whatever the frame pacing', () => {
  for (const framesPerStep of [1, 3, 17]) {
    const cursor = new TimelineCursor(points, startedAt);
    const driver = new RunDriver(4242, 'live');
    let target = 0;
    while (!driver.sim.gameOver) {
      target += framesPerStep;
      if (target % 45 === 0) driver.jump();
      driver.advanceRanked(target, { input: t => cursor.input(t), ready: () => true }, () => {});
    }
    // Server side: same seed, same server timeline, only the recorded jump ticks.
    const server = createSim(4242), verifier = new TimelineCursor(points, startedAt);
    let i = 0;
    while (!server.gameOver) {
      const input = verifier.input(server.tick);
      if (driver.replay!.inputs[i] === server.tick) { input.jump = true; i++; }
      step(server, input);
    }
    expect(server.score).toBe(driver.sim.score);
    expect(server.tick).toBe(driver.replay!.endTick);
  }
});

it('waits instead of guessing when the timeline is not yet complete', () => {
  const cursor = new TimelineCursor(points, startedAt);
  const driver = new RunDriver(1, 'live');
  driver.advanceRanked(600, { input: t => cursor.input(t), ready: t => t < 30 }, () => {});
  expect(driver.sim.tick).toBe(30);
});
