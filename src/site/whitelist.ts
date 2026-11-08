import { ApiClient, loadRun, NetworkError, type StoredRun } from '../net/api';
import { challenge } from '../net/turnstile';
import { formatSiweMessage } from './siwe';
import { InjectedWallet, type WalletPort } from './wallet';

export interface WhitelistStatus {
  threshold: number | null;
  thresholdLabel: string;
  entriesCount: number | null;
  entriesLabel: string;
  snapshotBlock: number | null;
  snapshotLabel: string;
  isOpen: boolean;
}

export interface WhitelistSubmission {
  address: string;
  signature?: string;
  runScore?: number;
  replayData?: unknown;
  /** Live mode: the verified run token stored by the game, and the wallet signer. */
  run?: StoredRun;
  sign?: (message: string) => Promise<string>;
}

export interface WhitelistResult {
  success: boolean;
  ticketId?: string;
  message?: string;
  error?: string;
}

export interface WhitelistApi {
  getStatus(): Promise<WhitelistStatus>;
  submitEntry(payload: WhitelistSubmission): Promise<WhitelistResult>;
}

export type WhitelistAppState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'signing'
  | 'submitted'
  | 'error';

export interface WhitelistState {
  state: WhitelistAppState;
  address: string | null;
  ticketId: string | null;
  score: number | null;
  error: string | null;
  status: WhitelistStatus | null;
  isMock: boolean;
}

export const DEFAULT_STATUS: WhitelistStatus = {
  threshold: null,
  thresholdLabel: 'TBA',
  entriesCount: null,
  entriesLabel: '—',
  snapshotBlock: null,
  snapshotLabel: 'TBA',
  isOpen: true,
};

export class MockWhitelistApi implements WhitelistApi {
  constructor(private readonly delayMs = 150) {}

  async getStatus(): Promise<WhitelistStatus> {
    if (this.delayMs > 0) await new Promise(resolve => setTimeout(resolve, this.delayMs));
    return { ...DEFAULT_STATUS };
  }

  async submitEntry(payload: WhitelistSubmission): Promise<WhitelistResult> {
    if (this.delayMs > 0) await new Promise(resolve => setTimeout(resolve, this.delayMs));
    const address = payload.address?.trim() ?? '';
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return {
        success: false,
        error: 'Invalid Ethereum address. Must be a 42-character hex address.',
      };
    }
    if (address.toLowerCase().endsWith('000')) {
      return {
        success: false,
        error: 'Simulated anti-cheat error: replay verification failed.',
      };
    }
    const suffix = address.slice(2, 8).toUpperCase();
    return {
      success: true,
      ticketId: `SQK-${suffix}`,
      message: 'Replay verified. 1 raffle ticket assigned.',
    };
  }
}

/** Used when the site is built without VITE_API_BASE: honest "not live yet" state. */
export class OfflineWhitelistApi implements WhitelistApi {
  async getStatus(): Promise<WhitelistStatus> {
    return { ...DEFAULT_STATUS, isOpen: false };
  }

  async submitEntry(): Promise<WhitelistResult> {
    return { success: false, error: 'The raffle server is not live yet. Follow the announcements; add ?mock=1 to the URL to preview the flow.' };
  }
}

export function statusFromServer(reply: { threshold: number | null; entriesOpen: boolean; entriesCount: number; snapshotAt: string | null; deadline: string | null }): WhitelistStatus {
  const date = (iso: string | null): string => {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'TBA';
  };
  return {
    threshold: reply.threshold,
    thresholdLabel: reply.threshold === null ? 'TBA' : reply.threshold.toLocaleString('en-US'),
    entriesCount: reply.entriesCount,
    entriesLabel: reply.entriesCount.toLocaleString('en-US'),
    snapshotBlock: null,
    snapshotLabel: date(reply.snapshotAt ?? reply.deadline),
    isOpen: reply.entriesOpen,
  };
}

/** Real server: SIWE challenge, wallet signature, Turnstile, entry. */
export class LiveWhitelistApi implements WhitelistApi {
  constructor(private readonly api: ApiClient, private readonly sitekey: string,
    private readonly verify: (sitekey: string, action: 'entry', signal: AbortSignal) => Promise<string> = challenge) {}

  async getStatus(): Promise<WhitelistStatus> {
    return statusFromServer(await this.api.raffleStatus());
  }

  async submitEntry(payload: WhitelistSubmission): Promise<WhitelistResult> {
    if (!payload.run || !payload.sign) return { success: false, error: 'A verified qualifying run is required.' };
    try {
      const n = await this.api.nonce();
      const message = formatSiweMessage({
        domain: n.domain, address: payload.address, statement: n.statement, uri: n.uri, chainId: n.chainId,
        nonce: n.nonce, issuedAt: n.issuedAt, expirationTime: n.expirationTime,
        resources: [`urn:squeekrunner:run:${payload.run.runId}`],
      });
      const signature = await payload.sign(message);
      const token = await this.verify(this.sitekey, 'entry', new AbortController().signal);
      const entered = await this.api.entry(payload.run.runToken, message, signature, token);
      return { success: true, ticketId: formatAddress(entered.address), message: '1 raffle ticket recorded for this wallet.' };
    } catch (error) {
      return { success: false, error: error instanceof NetworkError || error instanceof Error ? error.message : 'Entry failed.' };
    }
  }
}

export class WhitelistController {
  private state: WhitelistState;
  private run: StoredRun | null = null;
  private readonly listeners = new Set<(state: WhitelistState) => void>();

  constructor(
    private readonly api: WhitelistApi,
    isMock = false,
    private readonly wallet: WalletPort | null = null,
    private readonly runLoader: () => StoredRun | null = () => null,
  ) {
    this.state = {
      state: 'idle',
      address: null,
      ticketId: null,
      score: null,
      error: null,
      status: null,
      isMock,
    };
  }

  getState(): WhitelistState {
    return { ...this.state };
  }

  subscribe(listener: (state: WhitelistState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const current = this.getState();
    for (const listener of this.listeners) {
      listener(current);
    }
  }

  async init(): Promise<void> {
    try {
      const status = await this.api.getStatus();
      this.state.status = status;
      this.notify();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to load status';
      this.notify();
    }
  }

  async connect(addressOverride?: string): Promise<void> {
    if (this.state.state !== 'idle' && this.state.state !== 'error') return;

    this.state.state = 'connecting';
    this.state.error = null;
    this.notify();

    if (this.state.isMock) {
      // Simulate quick wallet connection
      await new Promise(resolve => setTimeout(resolve, 100));
      const mockAddress = addressOverride ?? '0x71C8A932b1E83F0bE540C1D06f120FDb9c6C3A9F';
      this.state.address = mockAddress;
      this.state.score = 1420;
      this.state.state = 'connected';
      this.notify();
      return;
    }

    if (this.state.status && !this.state.status.isOpen) {
      return this.fail('Raffle entries are not open yet. The threshold and dates will be announced.');
    }
    this.run = this.runLoader();
    if (!this.run) {
      return this.fail('No verified qualifying run found in this browser. Play a ranked run on /play/ and reach the threshold, then come back.');
    }
    if (!this.wallet) return this.fail('No browser wallet available.');
    try {
      this.state.address = await this.wallet.requestAddress();
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : 'Wallet connection failed.');
    }
    this.state.score = this.run.score;
    this.state.state = 'connected';
    this.notify();
  }

  private fail(message: string): void {
    this.state.state = 'error';
    this.state.error = message;
    this.notify();
  }

  async signAndSubmit(): Promise<void> {
    if (this.state.state !== 'connected' || !this.state.address) return;

    this.state.state = 'signing';
    this.state.error = null;
    this.notify();

    const address = this.state.address;
    const submission: WhitelistSubmission = this.state.isMock
      ? { address, signature: '0xmock_signature_for_testing_purposes', runScore: this.state.score ?? 1420 }
      : { address, runScore: this.state.score ?? undefined, run: this.run ?? undefined,
          sign: message => this.wallet!.signMessage(address, message) };

    try {
      const result = await this.api.submitEntry(submission);
      if (result.success && result.ticketId) {
        this.state.state = 'submitted';
        this.state.ticketId = result.ticketId;
        this.notify();
      } else {
        this.state.state = 'error';
        this.state.error = result.error ?? 'Submission was rejected by the verification service.';
        this.notify();
      }
    } catch (error) {
      this.state.state = 'error';
      this.state.error = error instanceof Error ? error.message : 'Network error during submission.';
      this.notify();
    }
  }

  reset(): void {
    this.state = {
      state: 'idle',
      address: null,
      ticketId: null,
      score: null,
      error: null,
      status: this.state.status,
      isMock: this.state.isMock,
    };
    this.notify();
  }
}

export function formatAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function renderWhitelistApp(
  container: HTMLElement,
  controller: WhitelistController,
): () => void {
  const unsubscribe = controller.subscribe(state => {
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'app-box';

    // Live status announcement for screen readers
    const srStatus = document.createElement('div');
    srStatus.className = 'sr-only';
    srStatus.setAttribute('role', 'status');
    srStatus.setAttribute('aria-live', 'polite');

    if (state.state === 'idle') {
      srStatus.textContent = 'Raffle application is ready. Connect your wallet to begin.';
      wrapper.appendChild(srStatus);

      const heading = document.createElement('h3');
      heading.className = 'app-title';
      heading.textContent = 'Enter the Hamster Raffle';
      wrapper.appendChild(heading);

      const desc = document.createElement('p');
      desc.className = 'app-desc';
      desc.textContent =
        'Achieved a qualifying run? Connect your Sepolia wallet and sign a zero-gas message to claim 1 raffle ticket.';
      wrapper.appendChild(desc);

      const modeBadge = document.createElement('p');
      modeBadge.className = 'app-badge-note';
      if (state.isMock) {
        modeBadge.textContent = 'Mode: Interactive Mock (?mock=1 active)';
      } else {
        modeBadge.textContent = 'Sepolia testnet · Zero gas fee · 1 ticket per wallet';
      }
      wrapper.appendChild(modeBadge);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button app-action-btn';
      button.textContent = state.isMock ? 'Connect Mock Wallet (Demo)' : 'Connect Sepolia Wallet';
      button.addEventListener('click', () => {
        void controller.connect();
      });
      wrapper.appendChild(button);

      if (!state.isMock) {
        const hint = document.createElement('p');
        hint.className = 'app-hint';
        hint.innerHTML = 'You need a verified run above the threshold from this browser. <a href="../play/">Play a ranked run →</a>';
        wrapper.appendChild(hint);
      }
    } else if (state.state === 'connecting') {
      srStatus.textContent = 'Connecting to wallet...';
      wrapper.appendChild(srStatus);

      const loading = document.createElement('div');
      loading.className = 'app-loading';
      loading.textContent = 'Connecting wallet...';
      wrapper.appendChild(loading);
    } else if (state.state === 'connected') {
      srStatus.textContent = `Wallet connected: ${state.address ?? ''}. Ready to sign entry.`;
      wrapper.appendChild(srStatus);

      const heading = document.createElement('h3');
      heading.className = 'app-title';
      heading.textContent = 'Wallet Connected';
      wrapper.appendChild(heading);

      const details = document.createElement('div');
      details.className = 'app-details';

      const rowWallet = document.createElement('div');
      rowWallet.className = 'app-detail-row';
      rowWallet.innerHTML = `<span class="detail-label">Wallet:</span> <strong class="detail-val font-mono">${state.address ? formatAddress(state.address) : '—'}</strong>`;
      details.appendChild(rowWallet);

      const rowScore = document.createElement('div');
      rowScore.className = 'app-detail-row';
      rowScore.innerHTML = `<span class="detail-label">Run Score:</span> <strong class="detail-val text-accent">${state.score ? `${state.score} pts (Qualified)` : 'Qualified'}</strong>`;
      details.appendChild(rowScore);

      const rowCost = document.createElement('div');
      rowCost.className = 'app-detail-row';
      rowCost.innerHTML = '<span class="detail-label">Gas Cost:</span> <strong class="detail-val">0 ETH (Off-chain signature)</strong>';
      details.appendChild(rowCost);

      wrapper.appendChild(details);

      const signBtn = document.createElement('button');
      signBtn.type = 'button';
      signBtn.className = 'button app-action-btn';
      signBtn.textContent = 'Sign & Enter Raffle';
      signBtn.addEventListener('click', () => {
        void controller.signAndSubmit();
      });
      wrapper.appendChild(signBtn);

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'app-secondary-btn';
      cancelBtn.textContent = 'Disconnect';
      cancelBtn.addEventListener('click', () => {
        controller.reset();
      });
      wrapper.appendChild(cancelBtn);
    } else if (state.state === 'signing') {
      srStatus.textContent = 'Awaiting signature and verifying replay on server...';
      wrapper.appendChild(srStatus);

      const loading = document.createElement('div');
      loading.className = 'app-loading';
      loading.innerHTML = '<p><strong>Waiting for your wallet signature…</strong></p><p class="app-hint">Sign the message in your wallet. It is an off-chain signature: no transaction, no gas.</p>';
      wrapper.appendChild(loading);
    } else if (state.state === 'submitted') {
      srStatus.textContent = `Success! Ticket ${state.ticketId ?? ''} confirmed for the raffle.`;
      wrapper.appendChild(srStatus);

      const successCard = document.createElement('div');
      successCard.className = 'ticket-card';

      const tag = document.createElement('span');
      tag.className = 'ticket-tag';
      tag.textContent = 'Ticket Confirmed';
      successCard.appendChild(tag);

      const ticketHeading = document.createElement('h3');
      ticketHeading.className = 'ticket-number';
      ticketHeading.textContent = state.ticketId ?? 'SQK-VERIFIED';
      successCard.appendChild(ticketHeading);

      const info = document.createElement('p');
      info.className = 'ticket-info';
      info.textContent = `Wallet: ${state.address ? formatAddress(state.address) : ''} · 1 ticket entered in Merkle pool.`;
      successCard.appendChild(info);

      const notice = document.createElement('p');
      notice.className = 'ticket-note';
      notice.textContent =
        'Your verified run is linked to this wallet. After entries close, winners are drawn from the published entry list using the hash of an announced future Sepolia block. Keep an eye on announcements!';
      successCard.appendChild(notice);

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'app-secondary-btn';
      resetBtn.textContent = 'Done / Reset';
      resetBtn.addEventListener('click', () => {
        controller.reset();
      });
      successCard.appendChild(resetBtn);

      wrapper.appendChild(successCard);
    } else if (state.state === 'error') {
      srStatus.textContent = `Error: ${state.error ?? 'Unknown error occurred'}`;
      wrapper.appendChild(srStatus);

      const errorBox = document.createElement('div');
      errorBox.className = 'app-error-box';
      errorBox.setAttribute('role', 'alert');

      const errTitle = document.createElement('h3');
      errTitle.className = 'error-title';
      errTitle.textContent = 'Unable to Submit Entry';
      errorBox.appendChild(errTitle);

      const errMsg = document.createElement('p');
      errMsg.className = 'error-message';
      errMsg.textContent = state.error ?? 'An unexpected error occurred during submission.';
      errorBox.appendChild(errMsg);

      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'button app-action-btn';
      retryBtn.textContent = 'Try Again';
      retryBtn.addEventListener('click', () => {
        controller.reset();
      });
      errorBox.appendChild(retryBtn);

      wrapper.appendChild(errorBox);
    }

    container.appendChild(wrapper);
  });

  return unsubscribe;
}

function paintStatus(status: WhitelistStatus | null): void {
  if (!status) return;
  const set = (selector: string, text: string): void => {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  };
  set('[data-status-threshold]', status.thresholdLabel);
  set('[data-status-entries]', status.entriesLabel);
  set('[data-status-snapshot]', status.snapshotLabel);
}

// Browser bootstrap when loaded via <script type="module">
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const container = document.querySelector<HTMLElement>('[data-whitelist-app]');
  if (container) {
    const isMock = new URLSearchParams(window.location.search).get('mock') === '1';
    const base = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() ?? '';
    const sitekey = (import.meta.env.VITE_TURNSTILE_SITEKEY as string | undefined)?.trim() ?? '';
    const api: WhitelistApi = isMock ? new MockWhitelistApi() : base ? new LiveWhitelistApi(new ApiClient(base), sitekey) : new OfflineWhitelistApi();
    const controller = new WhitelistController(api, isMock, isMock ? null : new InjectedWallet(), () => loadRun());
    renderWhitelistApp(container, controller);
    controller.subscribe(state => paintStatus(state.status));
    void controller.init();
  }
}
