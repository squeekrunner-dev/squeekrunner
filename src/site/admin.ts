/**
 * Team review panel for whitelist applications. Talks to /v1/admin/* with the ADMIN_TOKEN, which is kept
 * only in this tab's sessionStorage. Signals help a human decide; nothing is approved automatically.
 */
export interface RunSignals { jumps: number; airJumps: number; leadMean: number | null; leadStd: number | null; airDelayMean: number | null; airDelayStd: number | null }
export interface NetworkSignals { txCount: number | null; balanceWei: string | null; isContract: boolean | null; delegated?: boolean; firstSeen: string | null; error?: string }
export interface ChainSignals {
  checkedAt: number; mainnet: NetworkSignals; sepolia: NetworkSignals & { sqkBalance: string | null };
  squeekchain: { squeeks: number | null; staked: number | null; activity: number | null; rewardsClaimable: string | null; rewardsPaid: string | null; error?: string };
}
export interface Application {
  id: string; code: string; address: string; xHandle: string; postUrl: string; xStatus: 'verified' | 'unchecked' | 'failed'; xDetail: string | null;
  createdAt: number; status: 'pending' | 'approved' | 'rejected'; reviewNote: string | null; reviewedAt: number | null;
  chain: ChainSignals | null; chainCheckedAt: number | null; applyIp: string; runIp: string;
  score: number; coins: number; endTick: number; runAt: number; signals: RunSignals | null;
  applyIpApplications: number; runIpApplications: number; runIpRuns: number; runIpQualified: number; runIpBest: number | null;
}

/** Warnings shown on a card. Heuristics for a human reviewer, never automatic decisions. */
export function flags(a: Application): { level: 'warn' | 'bad' | 'good'; text: string }[] {
  const out: { level: 'warn' | 'bad' | 'good'; text: string }[] = [];
  if (a.xStatus === 'unchecked') out.push({ level: 'warn', text: 'X post NOT checked automatically: open it and check by hand' });
  if (a.xStatus === 'failed') out.push({ level: 'bad', text: `X post check failed (${a.xDetail ?? 'unknown'})` });
  if (a.applyIpApplications > 1) out.push({ level: 'bad', text: `${a.applyIpApplications} applications from the same network (apply)` });
  if (a.runIpApplications > 1) out.push({ level: 'bad', text: `${a.runIpApplications} applications from the same network (run)` });
  if (a.runIpQualified > 3) out.push({ level: 'warn', text: `${a.runIpQualified} qualifying runs from this network` });
  const s = a.signals;
  if (s && s.jumps >= 30 && s.leadStd !== null && s.leadStd < 4) out.push({ level: 'bad', text: `Very uniform jump timing (lead σ ${s.leadStd}px)` });
  if (s && s.airJumps >= 10 && s.airDelayStd !== null && s.airDelayStd < 1) out.push({ level: 'bad', text: `Very uniform double jumps (σ ${s.airDelayStd} ticks)` });
  const c = a.chain;
  if (c) {
    const fresh = (c.mainnet.txCount ?? 0) === 0 && (c.sepolia.txCount ?? 0) === 0 && !c.mainnet.firstSeen && !c.sepolia.firstSeen;
    if (fresh && !c.mainnet.error && !c.sepolia.error) out.push({ level: 'bad', text: 'Fresh address: no history on mainnet or Sepolia' });
    if (c.mainnet.isContract || c.sepolia.isContract) out.push({ level: 'warn', text: 'Address is a contract' });
    if ((c.squeekchain.squeeks ?? 0) > 0 || (c.squeekchain.activity ?? 0) > 0) out.push({ level: 'good', text: 'Squeekchain activity' });
    if (c.sepolia.sqkBalance && c.sepolia.sqkBalance !== '0') out.push({ level: 'good', text: 'Holds $SQK' });
    if (c.mainnet.error || c.sepolia.error) out.push({ level: 'warn', text: `Chain lookup incomplete: ${c.mainnet.error ?? c.sepolia.error}` });
  } else out.push({ level: 'warn', text: 'Chain signals not checked yet' });
  return out;
}
export function ether(wei: string | null, decimals = 18): string {
  if (wei === null) return '—';
  const v = BigInt(wei), unit = 10n ** BigInt(decimals);
  const whole = v / unit, frac = ((v % unit) * 10000n / unit).toString().padStart(4, '0');
  return `${whole.toLocaleString('en-US')}.${frac}`;
}
const date = (ms: number | string | null): string => ms === null ? '—' : new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const age = (iso: string | null, now: number): string => {
  if (!iso) return 'never';
  const days = Math.floor((now - Date.parse(iso)) / 86400000);
  return days > 365 ? `${(days / 365).toFixed(1)} y` : `${days} d`;
};

export class AdminApi {
  constructor(readonly base: string, private readonly token: string, private readonly fetcher: typeof fetch = (...a) => fetch(...a)) {}
  async call<T>(path: string, body?: unknown): Promise<T> {
    const reply = await this.fetcher(`${this.base.replace(/\/$/, '')}${path}`, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'omit',
      headers: { Authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (reply.headers.get('Content-Type')?.includes('text/csv')) return await reply.text() as T;
    const data = await reply.json();
    if (!reply.ok) throw new Error(data.error?.message ?? `HTTP ${reply.status}`);
    return data as T;
  }
  list(status: string) { return this.call<{ applications: Application[]; counts: Record<string, number>; serverNow: number }>(`/v1/admin/applications?status=${status}`); }
  review(id: string, status: Application['status'], note: string | null) { return this.call<Application>(`/v1/admin/applications/${id}/review`, { status, note }); }
  chain(id: string) { return this.call<Application>(`/v1/admin/applications/${id}/chain`, {}); }
  xcheck(id: string) { return this.call<Application>(`/v1/admin/applications/${id}/xcheck`, {}); }
  csv() { return this.call<string>('/v1/admin/export?format=csv'); }
}

/* ---------------- DOM ---------------- */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') node.className = v; else node.setAttribute(k, v); }
  node.append(...children);
  return node;
}
const ext = (href: string, text: string) => el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);
const row = (label: string, ...value: (Node | string)[]) => el('div', { class: 'admin-row' }, el('span', {}, label), el('strong', {}, ...value));
const TOKEN_KEY = 'squeekrunner.admin-token';

function card(a: Application, now: number, act: (a: Application, action: string, note?: string | null) => Promise<void>): HTMLElement {
  const s = a.signals, c = a.chain;
  const note = el('input', { type: 'text', class: 'app-input', placeholder: 'Review note (optional)', maxlength: '500' });
  note.value = a.reviewNote ?? '';
  const button = (text: string, action: string, cls = 'app-secondary-btn') => {
    const b = el('button', { type: 'button', class: cls }, text);
    b.addEventListener('click', () => { b.disabled = true; void act(a, action, note.value.trim() || null).finally(() => { b.disabled = false; }); });
    return b;
  };
  return el('article', { class: `admin-card status-${a.status}` },
    el('header', { class: 'admin-card-head' },
      el('strong', { class: 'font-mono' }, a.code), el('span', { class: `admin-badge badge-${a.status}` }, a.status.toUpperCase()),
      el('span', { class: `admin-badge x-${a.xStatus}` }, `X ${a.xStatus.toUpperCase()}`), el('span', { class: 'admin-muted' }, date(a.createdAt))),
    el('ul', { class: 'admin-flags' }, ...flags(a).map(f => el('li', { class: `flag-${f.level}` }, f.text))),
    el('div', { class: 'admin-grid' },
      el('section', {}, el('h4', {}, 'Applicant'),
        row('Address', ext(`https://sepolia.etherscan.io/address/${a.address}`, a.address)),
        row('Mainnet', ext(`https://etherscan.io/address/${a.address}`, 'etherscan ↗')),
        row('X', ext(`https://x.com/${a.xHandle}`, `@${a.xHandle}`), ' · ', ext(a.postUrl, 'post ↗')),
        row('X check', a.xDetail ?? '—')),
      el('section', {}, el('h4', {}, 'Run'),
        row('Score', `${a.score.toLocaleString('en-US')} · ${a.coins}/10 coins`),
        row('Duration', `${Math.round(a.endTick / 60)} s · run ${date(a.runAt)}`),
        row('Jumps', s ? `${s.jumps} (air ${s.airJumps})` : '—'),
        row('Jump lead', s && s.leadMean !== null ? `${s.leadMean} ± ${s.leadStd} px` : '—'),
        row('Air delay', s && s.airDelayMean !== null ? `${s.airDelayMean} ± ${s.airDelayStd} ticks` : '—')),
      el('section', {}, el('h4', {}, 'Network'),
        row('Run net', `${a.runIp} · ${a.runIpRuns} runs · ${a.runIpQualified} qualified · best ${a.runIpBest?.toLocaleString('en-US') ?? '—'}`),
        row('Apply net', `${a.applyIp} · ${a.applyIpApplications} applications`),
        row('Same run net', `${a.runIpApplications} applications`)),
      el('section', {}, el('h4', {}, `Chain ${c ? `(checked ${date(c.checkedAt)})` : ''}`),
        row('Mainnet', c ? `${c.mainnet.txCount ?? '?'} tx · first ${age(c.mainnet.firstSeen, now)} · ${ether(c.mainnet.balanceWei)} ETH` : '—'),
        row('Sepolia', c ? `${c.sepolia.txCount ?? '?'} tx · first ${age(c.sepolia.firstSeen, now)} · ${ether(c.sepolia.balanceWei)} ETH` : '—'),
        row('$SQK', c ? ether(c.sepolia.sqkBalance) : '—'),
        row('Squeekchain', c ? (c.squeekchain.error ?? `${c.squeekchain.squeeks ?? '?'} Squeeks (${c.squeekchain.staked ?? '?'} staked) · ${c.squeekchain.activity ?? '?'} events`) : '—'))),
    el('div', { class: 'admin-actions' }, note,
      button('Approve', 'approved', 'button admin-approve'), button('Reject', 'rejected', 'button admin-reject'), button('Reset to pending', 'pending'),
      button('Check chain', 'chain'), button('Recheck X', 'xcheck')));
}

export function mount(root: HTMLElement, base: string): void {
  let token = ''; try { token = sessionStorage.getItem(TOKEN_KEY) ?? ''; } catch { /* storage blocked */ }
  let status = 'pending', apps: Application[] = [], counts: Record<string, number> = {}, now = Date.now(), message = '', search = '';
  const api = () => new AdminApi(base, token);
  const load = async (): Promise<void> => {
    try { const r = await api().list(status); apps = r.applications; counts = r.counts; now = r.serverNow; message = ''; }
    catch (error) { message = error instanceof Error ? error.message : 'Failed'; apps = []; }
    paint();
  };
  const act = async (a: Application, action: string, note?: string | null): Promise<void> => {
    try {
      const updated = action === 'chain' ? await api().chain(a.id) : action === 'xcheck' ? await api().xcheck(a.id) : await api().review(a.id, action as Application['status'], note ?? null);
      if (action === 'approved' || action === 'rejected' || action === 'pending') { await load(); return; }
      apps = apps.map(x => (x.id === updated.id ? updated : x)); paint();
    } catch (error) { message = error instanceof Error ? error.message : 'Failed'; paint(); }
  };
  const paint = (): void => {
    if (!base) { root.replaceChildren(el('p', {}, 'VITE_API_BASE is not configured for this build.')); return; }
    if (!token) {
      const input = el('input', { type: 'password', class: 'app-input', placeholder: 'ADMIN_TOKEN', autocomplete: 'off' });
      const form = el('form', { class: 'app-box' }, el('h1', { class: 'app-title' }, 'Review panel'), el('p', { class: 'app-desc' }, 'Paste the admin token. It stays in this tab only.'), input,
        el('button', { type: 'submit', class: 'button app-action-btn' }, 'Open'));
      form.addEventListener('submit', e => { e.preventDefault(); token = input.value.trim(); try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ } void load(); });
      root.replaceChildren(form); return;
    }
    const tabs = el('div', { class: 'admin-tabs' }, ...['pending', 'approved', 'rejected', 'all'].map(s => {
      const b = el('button', { type: 'button', class: s === status ? 'button' : 'app-secondary-btn' },
        `${s} ${s === 'all' ? Object.values(counts).reduce((x, y) => x + y, 0) : counts[s] ?? 0}`);
      b.addEventListener('click', () => { status = s; void load(); });
      return b;
    }));
    const filter = el('input', { type: 'search', class: 'app-input', placeholder: 'Filter by code, address, @handle or network' });
    filter.value = search;
    filter.addEventListener('input', () => { search = filter.value; paintList(); });
    const bulk = el('button', { type: 'button', class: 'app-secondary-btn' }, 'Check chain for all unchecked');
    bulk.addEventListener('click', async () => {
      bulk.disabled = true;
      for (const a of apps.filter(x => !x.chain)) await act(a, 'chain');
      bulk.disabled = false;
    });
    const exportBtn = el('button', { type: 'button', class: 'app-secondary-btn' }, 'Export approved (CSV for build-merkle)');
    exportBtn.addEventListener('click', async () => {
      try {
        const csv = await api().csv();
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        const link = el('a', { href: url, download: 'approved-allowlist.csv' }); link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) { message = error instanceof Error ? error.message : 'Export failed'; paint(); }
    });
    const logout = el('button', { type: 'button', class: 'app-secondary-btn' }, 'Forget token');
    logout.addEventListener('click', () => { token = ''; try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } paint(); });
    const list = el('div', { class: 'admin-list' });
    const paintList = (): void => {
      const q = search.trim().toLowerCase();
      const shown = apps.filter(a => !q || [a.code, a.address, `@${a.xHandle}`, a.runIp, a.applyIp].some(v => v.toLowerCase().includes(q)));
      list.replaceChildren(...(shown.length ? shown.map(a => card(a, now, act)) : [el('p', { class: 'app-desc' }, 'No applications here.')]));
    };
    paintList();
    root.replaceChildren(el('h1', {}, 'Whitelist applications'), el('p', { class: 'app-error', role: 'alert' }, message),
      el('div', { class: 'admin-toolbar' }, tabs, filter, bulk, exportBtn, logout), list);
  };
  paint();
  if (token) void load();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const root = document.querySelector<HTMLElement>('[data-admin-app]');
  if (root) mount(root, (import.meta.env.VITE_API_BASE as string | undefined)?.trim() ?? '');
}
