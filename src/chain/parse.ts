import { CONFIG } from '../config';
import type { ChainSnapshot, Measurement, TelemetryView } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT.*Z$/.test(value)) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function height(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(value)) return null;
  const result = BigInt(value);
  return result <= 18446744073709551615n ? result : null;
}

/** Validate the consumed wire contract, tolerate unrelated/additive API fields. */
export function parseStatus(value: unknown, now = Date.now()): ChainSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== 1 ||
      typeof value.installationId !== 'string' || value.installationId.length === 0 ||
      value.installationId.length > 128 || timestamp(value.generatedAt) === null ||
      (value.status !== undefined && value.status !== 'available') || !isRecord(value.builder)) return null;

  let measurement: Measurement | null = null;
  if (value.measurement !== null) {
    const m = value.measurement;
    if (!isRecord(m) || (m.freshness !== 'online' && m.freshness !== 'stale') ||
        !['IDLE', 'ACTIVE', 'COUNTER_FAULT'].includes(String(m.coreStatus)) ||
        typeof m.rpmMilli !== 'number' || !Number.isSafeInteger(m.rpmMilli) || m.rpmMilli < 0 ||
        typeof m.staleAfterSeconds !== 'number' || !Number.isSafeInteger(m.staleAfterSeconds) ||
        m.staleAfterSeconds <= 0) return null;
    const observedAt = timestamp(m.observedAt);
    const receivedAt = timestamp(m.receivedAt);
    if (observedAt === null || receivedAt === null) return null;
    measurement = {
      rpm: m.rpmMilli / 1000,
      freshness: m.freshness,
      coreStatus: m.coreStatus as Measurement['coreStatus'],
      observedAt, receivedAt,
      staleAfterMs: Math.min(m.staleAfterSeconds * 1000, CONFIG.telemetry.maxMeasurementAgeMs),
    };
  }

  const builder = value.builder;
  if (builder.status !== 'available' && builder.status !== 'unavailable') return null;
  let confirmedHeight: bigint | null = null;
  let projectedHeight: bigint | null = null;
  if (builder.status === 'available') {
    if (!isRecord(builder.anchor) || !isRecord(builder.projected)) return null;
    confirmedHeight = height(builder.anchor.blockHeight);
    projectedHeight = height(builder.projected.blockHeight);
    if (confirmedHeight === null || projectedHeight === null || builder.projected.lifecycle !== 'optimistic') return null;
  }
  return {
    installationId: value.installationId, fetchedAt: now, measurement,
    builderAvailable: builder.status === 'available', confirmedHeight, projectedHeight,
  };
}

export function telemetryView(snapshot: ChainSnapshot | null, now = Date.now(), error?: string): TelemetryView {
  const noData = (reason: string): TelemetryView => ({ mode: 'NO DATA', rpm: 0, reason, snapshot });
  if (error) return noData(error);
  if (!snapshot) return noData('Connecting to the wheel');
  if (now - snapshot.fetchedAt > CONFIG.telemetry.maxReadAgeMs) return noData('No recent successful read');
  if (!snapshot.builderAvailable) return noData('Block data unavailable');
  const m = snapshot.measurement;
  if (!m) return noData('No measurement yet');
  if (m.coreStatus === 'COUNTER_FAULT') return noData('Wheel sensor fault');
  if (m.freshness !== 'online' || now - m.receivedAt > m.staleAfterMs ||
      now - m.observedAt > m.staleAfterMs) return noData('Measurement is stale');
  if (m.receivedAt - now > CONFIG.telemetry.futureToleranceMs ||
      m.observedAt - now > CONFIG.telemetry.futureToleranceMs) return noData('Measurement clock mismatch');
  return {
    mode: m.rpm > 0 ? 'LIVE' : 'WHEEL IDLE', rpm: m.rpm,
    reason: m.rpm > 0 ? 'The real wheel is turning' : 'Wheel still. Keep running.', snapshot,
  };
}
