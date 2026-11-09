import type { TelemetryView } from '../chain/types';
import { pendingBlocks } from '../chain/pending';

/** Presentation only: mode and freshness are owned by the shared chain client. */
export function formatTelemetry(view: TelemetryView) {
  const height = view.snapshot?.confirmedHeight ?? null;
  const pending = view.mode === 'NO DATA' ? '' : pendingBlocks(height, view.snapshot?.projectedHeight);
  return {
    mode: view.mode,
    rpm: view.mode === 'NO DATA' ? '—' : view.rpm > 0 && view.rpm < 0.1 ? '<0.1' :
      view.rpm.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    height: height === null ? '—' : `#${height.toLocaleString('en-US')}${pending ? ` · ${pending}` : ''}`,
    heightLabel: height !== null && view.mode === 'NO DATA' ? 'Last known block' : 'Confirmed block',
    explanation: view.mode === 'LIVE' ? 'Squeektoshi is running. The game picks up speed with him.' :
      view.mode === 'WHEEL IDLE' ? 'Squeektoshi is resting: he runs mostly at night (UTC). Meanwhile the game runs at its base speed.' :
        'No fresh data. Game available at base speed.',
  };
}
