/** Synthetic protocol sample for unit tests; the recorded HTTP fixture is separate. */
export const SAMPLE_TIME = Date.parse('2026-11-07T20:48:00.000Z');
export function sampleStatus() {
  return {
    schemaVersion: 1,
    installationId: 'test-installation',
    generatedAt: new Date(SAMPLE_TIME).toISOString(),
    measurement: {
      freshness: 'online', coreStatus: 'ACTIVE', rpmMilli: 98316,
      observedAt: new Date(SAMPLE_TIME).toISOString(),
      receivedAt: new Date(SAMPLE_TIME).toISOString(), staleAfterSeconds: 120,
    },
    builder: {
      status: 'available', anchor: { blockHeight: '1999' },
      projected: { blockHeight: '2000', lifecycle: 'optimistic' },
    },
  };
}
