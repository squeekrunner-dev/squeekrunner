import { LiveSource } from '../chain/live';
import { formatTelemetry } from './telemetry';
import { watchTelemetry } from './widget';
import { initSqueekchainLiveCard } from './squeekchain';

const squeekchainCard = document.querySelector<HTMLElement>('[data-squeekchain-live]');
const squeekchainLive = squeekchainCard ? initSqueekchainLiveCard(squeekchainCard) : null;

const root = document.querySelector<HTMLElement>('[data-telemetry]');
if (root) {
  const rpm = root.querySelector<HTMLElement>('[data-rpm]')!;
  const height = root.querySelector<HTMLElement>('[data-height]')!;
  const heightLabel = root.querySelector<HTMLElement>('[data-height-label]')!;
  const mode = root.querySelector<HTMLElement>('[data-mode]')!;
  const modeText = root.querySelector<HTMLElement>('[data-mode-text]')!;
  const explanation = root.querySelector<HTMLElement>('[data-explanation]')!;
  const announcement = root.querySelector<HTMLElement>('[data-announcement]')!;
  let lastMode = '';
  const dispose = watchTelemetry(new LiveSource(), view => {
    const display = formatTelemetry(view);
    rpm.textContent = display.rpm;
    height.textContent = display.height;
    heightLabel.textContent = display.heightLabel;
    mode.dataset.mode = display.mode;
    modeText.textContent = display.mode;
    explanation.textContent = display.explanation;
    if (squeekchainLive) {
      squeekchainLive.updateTelemetry(display);
    }
    // Screen readers hear state transitions, not every RPM tick.
    if (lastMode !== display.mode) {
      announcement.textContent = `${display.mode}. ${display.explanation}`;
      lastMode = display.mode;
    }
  }, window, document);
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      dispose();
      squeekchainLive?.dispose();
    });
  }
}
