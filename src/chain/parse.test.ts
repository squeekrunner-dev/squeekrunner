import { describe, expect, it } from 'vitest';
import { parseStatus, telemetryView } from './parse';
import { sampleStatus, SAMPLE_TIME } from './fixtures';
import { CONFIG } from '../config';

describe('status wire contract and data modes', () => {
  it('converts milli-RPM and preserves distinct confirmed/provisional heights', () => {
    const parsed = parseStatus(sampleStatus(), SAMPLE_TIME);
    expect(parsed?.measurement?.rpm).toBe(98.316);
    expect(parsed?.confirmedHeight).toBe(1999n);
    expect(parsed?.projectedHeight).toBe(2000n);
    expect(telemetryView(parsed, SAMPLE_TIME).mode).toBe('LIVE');
  });

  it('zero RPM is WHEEL IDLE even when device coreStatus is ACTIVE', () => {
    const body = sampleStatus(); body.measurement.rpmMilli = 0;
    expect(telemetryView(parseStatus(body, SAMPLE_TIME), SAMPLE_TIME).mode).toBe('WHEEL IDLE');
  });

  it.each(['stale', 'fault', 'null', 'unavailable'] as const)('%s becomes NO DATA, not sleep', kind => {
    const body = sampleStatus();
    let value: unknown = body;
    if (kind === 'stale') body.measurement.freshness = 'stale';
    if (kind === 'fault') body.measurement.coreStatus = 'COUNTER_FAULT';
    if (kind === 'null') value = { ...body, measurement: null };
    if (kind === 'unavailable') value = { ...body, builder: { status: 'unavailable', reason: 'no_measurement' } };
    const parsed = parseStatus(value, SAMPLE_TIME);
    expect(parsed).not.toBeNull();
    expect(telemetryView(parsed, SAMPLE_TIME)).toMatchObject({ mode: 'NO DATA', rpm: 0 });
  });

  it.each([null, {}, [], 'bad', { status: 'unavailable' }])('rejects malformed root %j', value => {
    expect(parseStatus(value, SAMPLE_TIME)).toBeNull();
  });

  it.each([-1, 1.5, NaN, Infinity, '98000', Number.MAX_SAFE_INTEGER + 1])('rejects malformed RPM %s', rpm => {
    const body = sampleStatus();
    expect(parseStatus({ ...body, measurement: { ...body.measurement, rpmMilli: rpm } }, SAMPLE_TIME)).toBeNull();
  });

  it('rejects unknown enums, missing fields, malformed time, schema drift and heights', () => {
    const body = sampleStatus();
    for (const measurement of [undefined, {}, { ...body.measurement, coreStatus: 'SLEEPING' },
      { ...body.measurement, freshness: 'fresh' }, { ...body.measurement, receivedAt: 'yesterday' },
      { ...body.measurement, staleAfterSeconds: 0 }]) {
      expect(parseStatus({ ...body, measurement }, SAMPLE_TIME)).toBeNull();
    }
    expect(parseStatus({ ...body, schemaVersion: 2 }, SAMPLE_TIME)).toBeNull();
    for (const blockHeight of ['1.5', '-1', '0xff', '18446744073709551616', 1999]) {
      expect(parseStatus({ ...body, builder: { ...body.builder, anchor: { blockHeight } } }, SAMPLE_TIME)).toBeNull();
    }
  });

  it('keeps uint64 heights above Number.MAX_SAFE_INTEGER exact', () => {
    const body = sampleStatus(); body.builder.anchor.blockHeight = '18446744073709551615';
    expect(parseStatus(body, SAMPLE_TIME)?.confirmedHeight).toBe(18446744073709551615n);
  });

  it('accepts additive unrelated fields', () => {
    expect(parseStatus({ ...sampleStatus(), futureField: { anything: true } }, SAMPLE_TIME)).not.toBeNull();
  });

  it('expires successful reads even if a cached response still claims online', () => {
    const parsed = parseStatus(sampleStatus(), SAMPLE_TIME);
    expect(telemetryView(parsed, SAMPLE_TIME + CONFIG.telemetry.maxReadAgeMs + 1).mode).toBe('NO DATA');
  });

  it('does not let fresh HTTP make an old measurement live', () => {
    const later = SAMPLE_TIME + 121000;
    expect(telemetryView(parseStatus(sampleStatus(), later), later).mode).toBe('NO DATA');
  });

  it('rejects future measurement times and honors a shorter stale threshold', () => {
    const body = sampleStatus();
    body.measurement.receivedAt = new Date(SAMPLE_TIME + 60000).toISOString();
    expect(telemetryView(parseStatus(body, SAMPLE_TIME), SAMPLE_TIME).mode).toBe('NO DATA');
    body.measurement.receivedAt = new Date(SAMPLE_TIME).toISOString();
    body.measurement.staleAfterSeconds = 1;
    expect(telemetryView(parseStatus(body, SAMPLE_TIME + 2000), SAMPLE_TIME + 2000).mode).toBe('NO DATA');
  });
});
