/**
 * Phones: a Full screen button where the browser allows it (Android Chrome and most desktop browsers), and
 * an "Add to Home Screen" tip on iPhone Safari, which does not allow page fullscreen but runs a home-screen
 * web app without browser bars (see the manifest and apple-mobile-web-app tags in play/index.html).
 */
export interface MobileEnv {
  fullscreenEnabled: boolean; touch: boolean; ios: boolean; standalone: boolean;
}
export function detect(doc: Document, nav: Navigator = navigator, win: Window = window): MobileEnv {
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const standalone = (nav as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches);
  const touch = typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches;
  return { fullscreenEnabled: !!doc.fullscreenEnabled, touch, ios, standalone };
}
/** What to offer: the fullscreen button, the iPhone tip, or nothing. */
export function offer(env: MobileEnv): 'fullscreen' | 'ios-tip' | null {
  if (env.standalone) return null;
  if (env.fullscreenEnabled && env.touch) return 'fullscreen';
  if (env.ios) return 'ios-tip';
  return null;
}

export async function enterFullscreen(doc: Document): Promise<void> {
  try {
    await doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.('landscape').catch(() => undefined);
  } catch { /* the browser refused: the game still works in the page */ }
}

export function bindMobileControls(doc: Document): void {
  const button = doc.getElementById('fullscreen');
  const tip = doc.getElementById('ios-tip');
  const what = offer(detect(doc));
  if (button && what === 'fullscreen') {
    button.hidden = false;
    button.addEventListener('click', () => void enterFullscreen(doc));
    doc.addEventListener('fullscreenchange', () => { button.hidden = !!doc.fullscreenElement; });
  }
  if (tip && what === 'ios-tip') {
    let dismissed = false;
    try { dismissed = localStorage.getItem('squeekrunner.ios-tip') === 'hidden'; } catch { /* storage blocked */ }
    tip.hidden = dismissed;
    tip.querySelector('button')?.addEventListener('click', () => {
      tip.hidden = true;
      try { localStorage.setItem('squeekrunner.ios-tip', 'hidden'); } catch { /* ignore */ }
    });
  }
}
