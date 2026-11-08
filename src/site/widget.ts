import type { TelemetrySource, TelemetryView } from '../chain/types';

/** Refresh freshness even without successful HTTP responses, and suspend all work off-page. */
export function watchTelemetry(source: TelemetrySource, render: (view: TelemetryView) => void,
  page: EventTarget, visibility: EventTarget & { readonly hidden: boolean }): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let onPage = true;
  const refresh = (): void => render(source.read());
  const synchronize = (): void => {
    clearInterval(timer); timer = undefined;
    if (onPage && !visibility.hidden) {
      source.start();
      timer = setInterval(refresh, 1000);
    } else source.stop();
    refresh();
  };
  const hide = (): void => { onPage = false; synchronize(); };
  const show = (): void => { onPage = true; synchronize(); };
  const unsubscribe = source.subscribe(refresh);
  page.addEventListener('pagehide', hide);
  page.addEventListener('pageshow', show);
  visibility.addEventListener('visibilitychange', synchronize);
  synchronize();
  return () => {
    clearInterval(timer);
    unsubscribe();
    source.stop();
    page.removeEventListener('pagehide', hide);
    page.removeEventListener('pageshow', show);
    visibility.removeEventListener('visibilitychange', synchronize);
  };
}
