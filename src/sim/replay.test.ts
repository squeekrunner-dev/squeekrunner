import { describe, expect, it } from 'vitest';
import { createSim, MAX_TICKS, stateHash, step, type TickInput } from './core';
import { MAX_REPLAY_BYTES, parseReplayJSON, ReplayRecorder, simulateReplay, validateReplay, verifyReplay, type ReplayV1 } from './replay';
import idle from './test-data/idle.json';
import dropout from './test-data/rpm-dropout.json';
import nuts from './test-data/nuts-and-resets.json';
import expected from './test-data/expected.json';

const fixtures = { idle, 'rpm-dropout': dropout, 'nuts-and-resets': nuts };
describe('replay contract', () => {
  for (const name of Object.keys(fixtures) as (keyof typeof fixtures)[]) {
    it(`reproduces golden ${name}, including full final state, 50 times`, () => {
      const fixture = fixtures[name];
      const validation = validateReplay(fixture);
      expect(validation.ok).toBe(true);
      if (!validation.ok) throw new Error(validation.reason);
      for (let n = 0; n < 50; n++) {
        const state = simulateReplay(validation.replay);
        expect({ score: state.score, endTick: state.tick, hash: stateHash(state) }).toEqual(expected[name]);
        expect(verifyReplay(fixture)).toMatchObject({ ok: true, score: expected[name].score, endTick: expected[name].endTick });
      }
    });
  }
  it('records inputs, replaces samples only on change, and replays exactly', () => {
    const state = createSim(42), recorder = new ReplayRecorder(42, 'live');
    while (!state.gameOver) {
      const t = state.tick;
      const input: TickInput = { rpmMilli: t < 120 ? 98316 : null, jump: t === 160 || t === 180,
        nut: t === 0 || t === 80, resetNut: t === 90 };
      recorder.record(t, input); step(state, input);
    }
    const replay = recorder.finish(state);
    expect(replay.telemetry).toEqual([{ tick: 0, rpmMilli: 98316 }, { tick: 120, rpmMilli: null }]);
    expect(replay.inputs).toEqual([160, 180]);
    expect(verifyReplay(replay).ok).toBe(true);
    expect(stateHash(simulateReplay(replay))).toBe(stateHash(state));
    replay.inputs.push(999); // exported snapshots do not mutate the recorder
    expect(recorder.finish(state).inputs).toEqual([160, 180]);
  });
  it('requires a naturally ended run and matches its score and exact end tick', () => {
    expect(verifyReplay({ ...idle, endTick: 100 })).toMatchObject({ ok: false, reason: 'Run has not ended' });
    expect(verifyReplay({ ...idle, endTick: idle.endTick + 1 })).toMatchObject({ ok: false, reason: 'Incorrect endTick' });
    expect(verifyReplay({ ...idle, clientScore: idle.clientScore + 1 })).toMatchObject({ ok: false, reason: 'Score mismatch', score: idle.clientScore });
  });
  it('rejects malformed, unsupported, huge and nonmonotonic data before simulation', () => {
    const bad: unknown[] = [null, [], 1, {}, { ...idle, extra: 1 }, { ...idle, v: 2 },
      { ...idle, simVersion: 'future' }, { ...idle, tickHz: 120 }, { ...idle, mode: 'demo' },
      { ...idle, seed: -1 }, { ...idle, seed: 0x100000000 }, { ...idle, seed: 1.5 },
      { ...idle, endTick: 0 }, { ...idle, endTick: Infinity }, { ...idle, endTick: MAX_TICKS + 1 },
      { ...idle, clientScore: NaN }, { ...idle, clientScore: -1 }, { ...idle, inputs: [20, 10] },
      { ...idle, inputs: [10, 10] }, { ...idle, inputs: [idle.endTick] }, { ...idle, inputs: [-1] },
      { ...idle, inputs: [0.5] }, { ...idle, inputs: new Array(3) },
      { ...idle, inputs: new Array(MAX_TICKS + 1).fill(0) }, { ...idle, nuts: [20, 10] },
      { ...idle, nutResets: [1, 1] }, { ...idle, telemetry: [] },
      { ...idle, telemetry: [{ tick: 1, rpmMilli: 0 }] },
      { ...idle, telemetry: [{ tick: 0, rpmMilli: -1 }] },
      { ...idle, telemetry: [{ tick: 0, rpmMilli: 0.1 }] },
      { ...idle, telemetry: [{ tick: 0, rpmMilli: 1000001 }] },
      { ...idle, telemetry: [{ tick: 0, rpmMilli: 0, extra: 1 }] },
      { ...idle, telemetry: [{ tick: 0, rpmMilli: 0 }, { tick: 0, rpmMilli: null }] },
      { ...idle, telemetry: [{ tick: 0, rpmMilli: 0 }, { tick: 1, rpmMilli: 0 }] },
      { ...idle, telemetry: [{ tick: 0, rpmMilli: 0 }, { tick: idle.endTick, rpmMilli: null }] },
    ];
    for (const value of bad) { expect(validateReplay(value).ok).toBe(false); expect(verifyReplay(value).ok).toBe(false); }
    const missing = { ...idle } as Partial<ReplayV1>; delete missing.nuts;
    expect(validateReplay(missing).ok).toBe(false);
    expect(parseReplayJSON('{broken').ok).toBe(false);
    expect(parseReplayJSON(' '.repeat(MAX_REPLAY_BYTES + 1)).ok).toBe(false);
    expect(parseReplayJSON(JSON.stringify(idle)).ok).toBe(true);
  });
  it('refuses duplicate/skipped recording ticks and incomplete finalization', () => {
    const recorder = new ReplayRecorder(0, 'live');
    expect(() => recorder.record(1, {})).toThrow();
    recorder.record(0, {});
    expect(() => recorder.record(0, {})).toThrow();
    expect(() => recorder.finish(createSim(0))).toThrow();
  });
});

it('isolates every production sim module and its only external dependency from impure APIs', () => {
  const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts', '../config.ts'], { query: '?raw', import: 'default', eager: true });
  expect(Object.keys(modules).length).toBeGreaterThanOrEqual(3);
  for (const [path, raw] of Object.entries(modules)) {
    const code = (raw as string).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code, path).not.toMatch(/\b(?:window|document|Date|performance|crypto|Phaser|setTimeout|setInterval|requestAnimationFrame)\b/);
    const maths = [...code.matchAll(/\bMath\s*\.\s*(\w+)/g)].map(match => match[1]);
    for (const method of maths) expect(['floor', 'ceil', 'round', 'trunc', 'min', 'max', 'imul'], `${path}: Math.${method}`).toContain(method);
    expect(code, path).not.toMatch(/\bMath\s*\[|\bimport\s*\(|\brequire\s*\(/);
    const imports = [...code.matchAll(/from\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
    for (const dependency of imports) expect(['../config', './core'], path).toContain(dependency);
  }
});
