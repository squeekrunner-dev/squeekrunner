interface SceneEvents {
  once(event: string, listener: () => void): unknown;
  off(event: string, listener: () => void): unknown;
}

/** Phaser can destroy an active scene without first emitting shutdown. */
export function onSceneExit(events: SceneEvents, cleanup: () => void): void {
  const dispose = (): void => {
    events.off('shutdown', dispose);
    events.off('destroy', dispose);
    cleanup();
  };
  events.once('shutdown', dispose);
  events.once('destroy', dispose);
}
