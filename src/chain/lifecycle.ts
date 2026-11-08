import type { TelemetrySource } from './types';

/** The source lives across scene restarts, but must not outlive its game. */
export function bindPageLifecycle(source: TelemetrySource, target: EventTarget = window): () => void {
  const hide = (): void => source.stop();
  const show = (event: Event): void => {
    if ('persisted' in event && event.persisted === true) source.start();
  };
  target.addEventListener('pagehide', hide);
  target.addEventListener('pageshow', show);
  return () => {
    target.removeEventListener('pagehide', hide);
    target.removeEventListener('pageshow', show);
    source.stop();
  };
}
