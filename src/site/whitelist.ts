import { keccak_256 } from '@noble/hashes/sha3';
import { ApiClient, forgetRun, loadRun, NetworkError, type ApplicationLookup, type ApplicationReply, type CodeReply, type StoredRun,
  type WhitelistStatusReply } from '../net/api';
import { challenge } from '../net/turnstile';

/**
 * Whitelist application (not a raffle): a server-verified qualifying run, a pasted Sepolia address,
 * an X account and a public post with the application code. No wallet connection, no signatures.
 * The team reviews every application by hand.
 */

/** EIP-55 mixed-case checksum. */
export function checksumAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Invalid address');
  const lower = address.slice(2).toLowerCase();
  const hash = keccak_256(new TextEncoder().encode(lower));
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    const nibble = (hash[i >> 1] >> (i % 2 ? 0 : 4)) & 0xf;
    out += nibble >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}
/** Null when valid; otherwise a short reason. Mixed case must match the checksum (catches typos). */
export function addressProblem(raw: string): string | null {
  const value = raw.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return 'Use a 0x address with 40 hex characters.';
  if (/^0x0{40}$/i.test(value)) return 'The zero address cannot receive a hamster.';
  const body = value.slice(2);
  if (body !== body.toLowerCase() && body !== body.toUpperCase() && checksumAddress(value) !== value) return 'Checksum mismatch: check for a typo.';
  return null;
}
export function normalizeHandle(raw: string): string | null {
  const value = raw.trim().replace(/^@/, '');
  return /^[A-Za-z0-9_]{1,15}$/.test(value) ? value : null;
}
const POST = /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,20})\/?(?:\?[^#\s]*)?$/;
export function postProblem(raw: string, handle: string | null): string | null {
  const m = POST.exec(raw.trim());
  if (!m) return 'Paste the post link, like https://x.com/yourname/status/123…';
  if (handle && m[1].toLowerCase() !== handle.toLowerCase()) return `The link must be a post by @${handle}.`;
  return null;
}
export function postText(code: string, score: number): string {
  return `I ran ${score.toLocaleString('en-US')} points and caught 10/10 coins in #SqueekRunner, the endless runner powered by the live #Squeekchain hamster wheel.\n\nWhitelist application ${code}\n\nhttps://squeekrunner.app`;
}
export function intentUrl(code: string, score: number): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(postText(code, score))}`;
}
export function shortAddress(address: string): string {
  return address.length === 42 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export type View =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'closed'; status: WhitelistStatusReply | null }
  | { kind: 'no-run'; status: WhitelistStatusReply }
  | { kind: 'form'; status: WhitelistStatusReply; run: StoredRun; code: CodeReply; busy: boolean; error: string | null }
  | { kind: 'applied'; code: string; status: string; reply: ApplicationReply | null }
  | { kind: 'error'; message: string };

export interface Port {
  status(): Promise<WhitelistStatusReply>;
  code(runToken: string): Promise<CodeReply>;
  apply(form: { runToken: string; address: string; xHandle: string; postUrl: string }): Promise<ApplicationReply>;
  lookup(code: string): Promise<ApplicationLookup>;
}
export function livePort(api: ApiClient, sitekey: string): Port {
  return {
    status: () => api.whitelistStatus(),
    code: runToken => api.applicationCode(runToken),
    apply: async form => {
      const turnstileToken = await challenge(sitekey, 'application', new AbortController().signal, 'Verify to submit your application', 'Cancel');
      return api.apply({ ...form, turnstileToken });
    },
    lookup: code => api.application(code),
  };
}

export class ApplicationController {
  view: View = { kind: 'loading' };
  private listeners = new Set<(view: View) => void>();
  constructor(private readonly port: Port | null, private readonly run: () => StoredRun | null = () => loadRun()) {}
  subscribe(fn: (view: View) => void): () => void { this.listeners.add(fn); fn(this.view); return () => this.listeners.delete(fn); }
  private set(view: View): void { this.view = view; for (const fn of this.listeners) fn(view); }

  async init(): Promise<void> {
    if (!this.port) { this.set({ kind: 'offline' }); return; }
    let status: WhitelistStatusReply;
    try { status = await this.port.status(); } catch (error) { this.set({ kind: 'error', message: message(error) }); return; }
    if (!status.applicationsOpen) { this.set({ kind: 'closed', status }); return; }
    const run = this.run();
    if (!run) { this.set({ kind: 'no-run', status }); return; }
    try {
      const code = await this.port.code(run.runToken);
      if (code.applied) { this.set({ kind: 'applied', code: code.code, status: code.status ?? 'pending', reply: null }); return; }
      this.set({ kind: 'form', status, run, code, busy: false, error: null });
    } catch (error) {
      if (error instanceof NetworkError && error.status === 403) { forgetRun(); this.set({ kind: 'no-run', status }); return; }
      this.set({ kind: 'error', message: message(error) });
    }
  }

  async submit(fields: { address: string; xHandle: string; postUrl: string }): Promise<void> {
    const view = this.view;
    if (view.kind !== 'form' || view.busy || !this.port) return;
    const handle = normalizeHandle(fields.xHandle);
    const problem = addressProblem(fields.address) ?? (handle ? null : 'Enter your X username.') ?? postProblem(fields.postUrl, handle);
    if (problem) { this.set({ ...view, error: problem }); return; }
    this.set({ ...view, busy: true, error: null });
    try {
      const reply = await this.port.apply({ runToken: view.run.runToken, address: fields.address.trim(), xHandle: handle!, postUrl: fields.postUrl.trim() });
      this.set({ kind: 'applied', code: reply.code, status: reply.status, reply });
    } catch (error) {
      this.set({ ...view, busy: false, error: message(error) });
    }
  }

  async lookup(code: string): Promise<string> {
    if (!this.port) return 'The application service is not configured on this build.';
    const value = code.trim().toUpperCase();
    if (!/^SQR-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(value)) return 'Codes look like SQR-ABCD-1234.';
    try {
      const reply = await this.port.lookup(value);
      return `${reply.code}: ${label(reply.status)}${reply.xStatus === 'unchecked' ? ' · X post will be checked by hand' : ''}`;
    } catch (error) { return message(error); }
  }
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}
export function label(status: string): string {
  return status === 'approved' ? 'Approved: you are on the allowlist' : status === 'rejected' ? 'Not approved' : 'Pending team review';
}

/* ---------------- DOM ---------------- */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') node.className = v; else node.setAttribute(k, v); }
  node.append(...children);
  return node;
}
function field(id: string, labelText: string, hint: string, input: HTMLInputElement): HTMLElement {
  input.id = id; input.className = 'app-input'; input.setAttribute('aria-describedby', `${id}-hint`);
  return el('div', { class: 'app-field' }, el('label', { for: id }, labelText), input, el('p', { class: 'app-field-hint', id: `${id}-hint` }, hint));
}
function box(title: string, ...body: (Node | string)[]): HTMLElement {
  return el('div', { class: 'app-box' }, el('h3', { class: 'app-title' }, title), ...body);
}
const p = (text: string, cls = 'app-desc') => el('p', { class: cls }, text);
const link = (href: string, text: string, cls = 'button app-action-btn') => el('a', { class: cls, href }, text);

export function render(container: HTMLElement, controller: ApplicationController): () => void {
  const draft = { address: '', xHandle: '', postUrl: '' };
  let posted = false;
  return controller.subscribe(view => {
    const live = el('p', { class: 'sr-only', 'aria-live': 'polite' });
    let content: HTMLElement;
    switch (view.kind) {
      case 'loading': content = el('div', { class: 'app-loading' }, 'Loading application status…'); break;
      case 'offline': content = box('Applications are not available on this build', p('This copy of the site is not connected to the SqueekRunner server. Visit squeekrunner.app to apply.')); break;
      case 'error': content = box('Service unavailable', p(view.message), el('button', { type: 'button', class: 'app-secondary-btn' }, 'Try again')); content.querySelector('button')!.addEventListener('click', () => void controller.init()); break;
      case 'closed': content = box('Applications are not open yet',
        p('Practise now: the qualifying rule is already live. Applications open at launch; dates will be announced on X.'),
        link('../play/', 'Play SqueekRunner ↗')); break;
      case 'no-run': content = box('First, a qualifying run',
        p(`Score ${view.status.threshold?.toLocaleString('en-US') ?? 'the threshold'}+ points in a ranked run and catch all ${view.status.requiredCoins} coins. Coins hang at double-jump height and all appear before 100,000 points. Then come back here within 24 hours, from the same browser.`),
        link('../play/', 'Play to qualify ↗')); break;
      case 'applied': {
        const unchecked = view.reply?.xStatus === 'unchecked';
        content = box('Application received',
          el('p', { class: 'ticket-tag' }, view.code),
          p(label(view.status)),
          p(unchecked ? 'X could not confirm your post automatically right now. That is fine: the team will check it by hand. Keep the post public.' :
            'Your X post is confirmed. Keep it public until the review is over.'),
          p('Save your code. You can check the status below at any time. The team reviews every application by hand; decisions are final.', 'app-hint'));
        break;
      }
      case 'form': {
        const address = el('input', { type: 'text', inputmode: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: '0x…', maxlength: '42' });
        const handle = el('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: '@yourname', maxlength: '16' });
        const post = el('input', { type: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://x.com/yourname/status/…' });
        address.value = draft.address; handle.value = draft.xHandle; post.value = draft.postUrl;
        const share = el('a', { class: 'button app-share-btn', href: intentUrl(view.code.code, view.run.score), target: '_blank', rel: 'noopener' }, 'Post on X ↗');
        const submit = el('button', { type: 'submit', class: 'button app-action-btn' }, view.busy ? 'Submitting…' : 'Submit application');
        const error = el('p', { class: 'app-error', role: 'alert' }, view.error ?? '');
        const form = el('form', { class: 'app-form', novalidate: '' },
          el('div', { class: 'app-details' },
            el('div', { class: 'app-detail-row' }, el('span', {}, 'Qualifying run'), el('strong', {}, `${view.code.score.toLocaleString('en-US')} pts · ${view.code.coins}/10 coins`)),
            el('div', { class: 'app-detail-row' }, el('span', {}, 'Your application code'), el('strong', { class: 'font-mono' }, view.code.code))),
          el('p', { class: 'step-badge' }, 'Step 1 · Your Sepolia address'),
          field('wl-address', 'Sepolia address (paste it; no wallet connection)', 'The address that will receive the free mint. Use one with some on-chain history.', address),
          el('p', { class: 'step-badge' }, 'Step 2 · Your X account'),
          field('wl-handle', 'X username', 'A real, active account. One X account = one application.', handle),
          el('p', { class: 'step-badge' }, 'Step 3 · Post your code on X'),
          p('Opens X with a ready post containing your code. Publish it publicly, then copy its link.', 'app-desc'), share,
          field('wl-post', 'Link to your post', 'Open your post on X and copy the address from the browser bar or Share → Copy link.', post),
          error, submit,
          p('By submitting you agree that the team reviews your run, X account and address history by hand. Not a raffle; decisions are final.', 'app-hint'));
        const sync = (): void => {
          draft.address = address.value; draft.xHandle = handle.value; draft.postUrl = post.value;
          const h = normalizeHandle(handle.value);
          const ready = !addressProblem(address.value) && !!h && !postProblem(post.value, h) && posted;
          submit.disabled = view.busy || !ready;
        };
        for (const input of [address, handle, post]) input.addEventListener('input', sync);
        share.addEventListener('click', () => { posted = true; sync(); });
        post.addEventListener('input', () => { if (post.value.trim()) posted = true; sync(); });
        sync();
        form.addEventListener('submit', event => { event.preventDefault(); void controller.submit({ ...draft }); });
        content = box('Apply for the whitelist', p('Three steps, about two minutes. No wallet connection, no signatures, no fees.'), form);
        break;
      }
    }
    live.textContent = view.kind === 'form' && view.error ? view.error : '';
    container.replaceChildren(content, live, lookupBox(controller));
  });
}

function lookupBox(controller: ApplicationController): HTMLElement {
  const input = el('input', { type: 'text', class: 'app-input', id: 'wl-lookup', placeholder: 'SQR-XXXX-XXXX', autocomplete: 'off', spellcheck: 'false', maxlength: '13' });
  const out = el('p', { class: 'app-desc', 'aria-live': 'polite' });
  const button = el('button', { type: 'submit', class: 'app-secondary-btn' }, 'Check status');
  const form = el('form', { class: 'app-lookup' }, el('label', { for: 'wl-lookup' }, 'Already applied? Check your application'), input, button, out);
  form.addEventListener('submit', event => { event.preventDefault(); void controller.lookup(input.value).then(text => { out.textContent = text; }); });
  return form;
}

function paintStatus(status: WhitelistStatusReply): void {
  const set = (selector: string, text: string): void => { const node = document.querySelector(selector); if (node) node.textContent = text; };
  set('[data-status-threshold]', status.threshold === null ? 'TBA' : status.threshold.toLocaleString('en-US'));
  set('[data-status-coins]', `${status.requiredCoins} / ${status.requiredCoins}`);
  set('[data-status-open]', status.applicationsOpen ? 'Open' : 'Not open yet');
  set('[data-status-applications]', status.applications.toLocaleString('en-US'));
  set('[data-status-approved]', status.approved.toLocaleString('en-US'));
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const container = document.querySelector<HTMLElement>('[data-whitelist-app]');
  if (container) {
    const base = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() ?? '';
    const sitekey = (import.meta.env.VITE_TURNSTILE_SITEKEY as string | undefined)?.trim() ?? '';
    const controller = new ApplicationController(base ? livePort(new ApiClient(base), sitekey) : null);
    render(container, controller);
    controller.subscribe(view => { if ('status' in view && view.status && typeof view.status === 'object') paintStatus(view.status); });
    void controller.init();
  }
}
