import { expect, it } from 'vitest';
import { CONFIG } from '../config';
import whitepaper from '../../whitepaper/index.html?raw';

it('keeps published balance and telemetry constants equal to the running game configuration', () => {
  const values = [...whitepaper.matchAll(/data-config="([^"]+)">([^<]+)</g)];
  expect(values.length).toBeGreaterThanOrEqual(25);
  for (const [, path, printed] of values) {
    let configured: unknown = CONFIG;
    for (const part of path.split('.')) {
      expect(configured, path).toBeTypeOf('object');
      configured = (configured as Record<string, unknown>)[part];
    }
    expect(printed, `Whitepaper constant ${path}`).toBe(String(configured));
  }
});
