import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { sampleStatus, SAMPLE_TIME } from '../chain/fixtures';
import { parseStatus, telemetryView } from '../chain/parse';
import { formatTelemetry } from './telemetry';

describe('landing telemetry presentation', () => {
  it('formats real milli-RPM via the shared parser and shows only the confirmed height', () => {
    const view = telemetryView(parseStatus(sampleStatus(), SAMPLE_TIME), SAMPLE_TIME);
    expect(formatTelemetry(view)).toMatchObject({ mode: 'LIVE', rpm: '98,3', height: '#1999', heightLabel: 'Подтверждённый блок' });
  });
  it('keeps a fresh zero distinct from missing data, even with ACTIVE coreStatus', () => {
    const body = sampleStatus(); body.measurement.rpmMilli = 0;
    expect(formatTelemetry(telemetryView(parseStatus(body, SAMPLE_TIME), SAMPLE_TIME))).toMatchObject({ mode: 'WHEEL IDLE', rpm: '0,0' });
    expect(formatTelemetry(telemetryView(null, SAMPLE_TIME))).toMatchObject({ mode: 'NO DATA', rpm: '—', height: '—' });
  });
  it('does not round a small positive LIVE measurement down to an apparent zero', () => {
    const body = sampleStatus(); body.measurement.rpmMilli = 1;
    expect(formatTelemetry(telemetryView(parseStatus(body, SAMPLE_TIME), SAMPLE_TIME))).toMatchObject({ mode: 'LIVE', rpm: '<0,1' });
  });
  it('labels a retained height as last known after expiry instead of showing a stale RPM', () => {
    const view = telemetryView(parseStatus(sampleStatus(), SAMPLE_TIME), SAMPLE_TIME + CONFIG.telemetry.maxReadAgeMs + 1);
    expect(formatTelemetry(view)).toMatchObject({ mode: 'NO DATA', rpm: '—', height: '#1999', heightLabel: 'Последний известный блок' });
  });
  it.each(['stale', 'COUNTER_FAULT', 'unavailable', 'null', 'network'])('preserves the shared NO DATA result for %s', reason => {
    const body = sampleStatus();
    const value = reason === 'null' ? { ...body, measurement: null } : reason === 'unavailable'
      ? { ...body, builder: { status: 'unavailable' } } : body;
    if (reason === 'stale') body.measurement.freshness = 'stale';
    if (reason === 'COUNTER_FAULT') body.measurement.coreStatus = 'COUNTER_FAULT';
    const view = telemetryView(parseStatus(value, SAMPLE_TIME), SAMPLE_TIME, reason === 'network' ? 'Network unavailable' : undefined);
    expect(formatTelemetry(view)).toMatchObject({ mode: 'NO DATA', rpm: '—' });
  });
  it('preserves height zero and every digit of uint64 without Number conversion', () => {
    const body = sampleStatus();
    for (const height of ['0', '18446744073709551615']) {
      body.builder.anchor.blockHeight = height;
      expect(formatTelemetry(telemetryView(parseStatus(body, SAMPLE_TIME), SAMPLE_TIME)).height).toBe(`#${height}`);
    }
  });
});
