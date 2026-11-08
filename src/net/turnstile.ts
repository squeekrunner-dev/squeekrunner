interface Turnstile {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: Turnstile } }
let loading: Promise<void> | undefined;
function load(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { loading = undefined; script.remove(); reject(new Error('Challenge unavailable')); };
    document.head.append(script);
  });
}

/** Only rendered when API mode is configured. No wallet UI is introduced here. */
export async function challenge(sitekey: string, action: 'session' | 'application', signal: AbortSignal,
  prompt = 'Verify to start a ranked run', cancelLabel = 'Play offline instead'): Promise<string> {
  if (!sitekey) throw new Error('Challenge is not configured');
  return new Promise<string>((resolve, reject) => {
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;z-index:1000;left:50%;top:30%;transform:translateX(-50%);padding:20px;background:#fff;color:#131b27;border:2px solid #46673d;border-radius:12px';
    const title = document.createElement('p'); title.textContent = prompt;
    const widget = document.createElement('div');
    const cancel = document.createElement('button'); cancel.textContent = cancelLabel;
    panel.append(title, widget, cancel); document.body.append(panel);
    let id: string | undefined, settled = false;
    const finish = (token?: string): void => {
      if (settled) return; settled = true;
      clearTimeout(timer); signal.removeEventListener('abort', abort);
      if (id) window.turnstile?.remove(id);
      panel.remove();
      if (token) resolve(token); else reject(new Error('Challenge cancelled or unavailable'));
    };
    const abort = (): void => finish();
    const timer = setTimeout(abort, 60000);
    cancel.onclick = abort;
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { finish(); return; }
    void load().then(() => {
      if (settled) return;
      id = window.turnstile!.render(widget, { sitekey, action, callback: (token: string) => finish(token), 'error-callback': abort, 'expired-callback': abort });
    }).catch(abort);
  });
}
