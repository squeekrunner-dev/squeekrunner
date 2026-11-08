import type { TelemetryView } from '../chain/types';

/** Presentation only: mode and freshness are owned by the shared chain client. */
export function formatTelemetry(view: TelemetryView) {
  const height = view.snapshot?.confirmedHeight ?? null;
  return {
    mode: view.mode,
    rpm: view.mode === 'NO DATA' ? '—' : view.rpm.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    height: height === null ? '—' : `#${height.toString()}`,
    heightLabel: height !== null && view.mode === 'NO DATA' ? 'Последний известный блок' : 'Подтверждённый блок',
    explanation: view.mode === 'LIVE' ? 'Колесо крутится. Забег набирает темп.' :
      view.mode === 'WHEEL IDLE' ? 'Колесо стоит. Можно бежать в своём темпе.' :
        'Свежих данных нет. Игра доступна на базовой скорости.',
  };
}
