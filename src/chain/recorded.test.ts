import { expect, it } from 'vitest';
import recorded from './test-data/status-recorded.json';
import { parseStatus, telemetryView } from './parse';

it('parses the captured public HTTP 200 response, not a made-up API example', () => {
  const capturedAt = Date.parse(recorded.capture.fetchedAt);
  expect(recorded.capture.httpStatus).toBe(200);
  expect(recorded.capture.cors).toBe('*');
  expect(recorded.capture.url).toBe('https://api.squeekchain.com/v1/status');
  const parsed = parseStatus(recorded.body, capturedAt);
  expect(parsed).not.toBeNull();
  expect(parsed?.installationId).toBe('sepolia-core-sepolia-20261103');
  expect(parsed?.confirmedHeight).toBe(1999n);
  expect(parsed?.measurement?.rpm).toBe(0);
  expect(telemetryView(parsed, capturedAt).mode).toBe('WHEEL IDLE');
  expect(telemetryView(parsed, capturedAt + 180000).mode).toBe('NO DATA');
});
