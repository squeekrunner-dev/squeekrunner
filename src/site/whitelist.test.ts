import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_STATUS,
  formatAddress,
  LiveWhitelistApi,
  MockWhitelistApi,
  OfflineWhitelistApi,
  WhitelistController,
  type WhitelistApi,
  type WhitelistResult,
} from './whitelist';
import { ApiClient, type StoredRun } from '../net/api';
import { formatSiweMessage } from './siwe';
import type { WalletPort } from './wallet';

describe('formatAddress', () => {
  it('formats standard 42-character Ethereum address', () => {
    expect(formatAddress('0x71C8A932b1E83F0bE540C1D06f120FDb9c6C3A9F')).toBe('0x71C8...3A9F');
  });

  it('keeps short strings unchanged', () => {
    expect(formatAddress('0x123')).toBe('0x123');
    expect(formatAddress('')).toBe('');
  });
});

describe('MockWhitelistApi', () => {
  it('returns default status', async () => {
    const api = new MockWhitelistApi(0);
    const status = await api.getStatus();
    expect(status).toEqual(DEFAULT_STATUS);
    expect(status.thresholdLabel).toBe('TBA');
    expect(status.entriesLabel).toBe('—');
  });

  it('accepts valid Ethereum address and issues ticket', async () => {
    const api = new MockWhitelistApi(0);
    const res = await api.submitEntry({
      address: '0x71C8A932b1E83F0bE540C1D06f120FDb9c6C3A9F',
      runScore: 1450,
    });
    expect(res.success).toBe(true);
    expect(res.ticketId).toBe('SQK-71C8A9');
  });

  it('rejects invalid Ethereum address', async () => {
    const api = new MockWhitelistApi(0);
    const res = await api.submitEntry({ address: 'not-an-address' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Invalid Ethereum address');
  });

  it('simulates anti-cheat error on special suffix 000', async () => {
    const api = new MockWhitelistApi(0);
    const res = await api.submitEntry({
      address: '0x0000000000000000000000000000000000000000',
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('anti-cheat');
  });
});

describe('OfflineWhitelistApi', () => {
  it('reports a closed raffle and refuses entries while no server is configured', async () => {
    const api = new OfflineWhitelistApi();
    const status = await api.getStatus();
    expect(status).toMatchObject({ thresholdLabel: 'TBA', isOpen: false });
    const result = await api.submitEntry();
    expect(result.success).toBe(false);
    expect(result.error).toContain('not live yet');
  });
});

describe('live raffle entry', () => {
  const ADDRESS = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
  const RUN: StoredRun = { runToken: 'a'.repeat(64), runId: 'b'.repeat(64), score: 4200, savedAt: Date.now() };
  const SIGNATURE = `0x${'1'.repeat(130)}`;
  const wallet = (): WalletPort => ({ requestAddress: async () => ADDRESS, signMessage: vi.fn(async () => SIGNATURE) });
  function server(open = true) {
    const calls: { path: string; body?: Record<string, unknown> }[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (path === '/v1/raffle/status') return Response.json({ threshold: 3000, entriesOpen: open, entriesCount: 12, snapshotAt: '2026-12-01T12:00:00Z', deadline: null });
      if (path === '/v1/nonce') return Response.json({ nonce: 'c'.repeat(64), issuedAt: '2026-11-08T10:00:00.000Z', expirationTime: '2026-11-08T10:05:00.000Z', domain: 'squeekrunner.test', uri: 'https://squeekrunner.test/whitelist/', chainId: 11155111, statement: 'Enter the SqueekRunner whitelist raffle. No transaction or fee.' });
      if (path === '/v1/entry') return Response.json({ address: ADDRESS, entered: true });
      return Response.json({ error: { message: 'nope' } }, { status: 404 });
    }) as typeof fetch;
    return { calls, api: new LiveWhitelistApi(new ApiClient('https://api.test', fetcher), 'site-key', async () => 'turnstile-token') };
  }

  it('maps the server status for the page', async () => {
    const { api } = server();
    expect(await api.getStatus()).toMatchObject({ thresholdLabel: '3,000', entriesLabel: '12', snapshotLabel: '2026-12-01 12:00 UTC', isOpen: true });
  });

  it('connects, signs an EIP-4361 message bound to the run, and enters', async () => {
    const { api, calls } = server();
    const w = wallet();
    const controller = new WhitelistController(api, false, w, () => RUN);
    await controller.init();
    await controller.connect();
    expect(controller.getState()).toMatchObject({ state: 'connected', address: ADDRESS, score: 4200 });
    await controller.signAndSubmit();
    expect(controller.getState().state).toBe('submitted');
    const signed = (w.signMessage as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(signed).toContain('squeekrunner.test wants you to sign in with your Ethereum account:');
    expect(signed).toContain(`- urn:squeekrunner:run:${RUN.runId}`);
    expect(signed).toContain('Chain ID: 11155111');
    const entry = calls.find(c => c.path === '/v1/entry')!.body!;
    expect(entry).toEqual({ runToken: RUN.runToken, siweMessage: signed, signature: SIGNATURE, turnstileToken: 'turnstile-token' });
  });

  it('explains what is missing instead of opening the wallet', async () => {
    const closed = new WhitelistController(server(false).api, false, wallet(), () => RUN);
    await closed.init();
    await closed.connect();
    expect(closed.getState()).toMatchObject({ state: 'error', error: expect.stringContaining('not open yet') });
    const noRun = new WhitelistController(server().api, false, wallet(), () => null);
    await noRun.init();
    await noRun.connect();
    expect(noRun.getState()).toMatchObject({ state: 'error', error: expect.stringContaining('No verified qualifying run') });
  });

  it('formats SIWE exactly once per field and rejects a malformed address', () => {
    const message = formatSiweMessage({ domain: 'd.test', address: ADDRESS, statement: 's', uri: 'https://d.test/', chainId: 11155111,
      nonce: 'n', issuedAt: '2026-11-08T10:00:00Z', expirationTime: '2026-11-08T10:05:00Z', resources: ['urn:x'] });
    expect(message.split('\n')).toEqual(['d.test wants you to sign in with your Ethereum account:', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', '', 's', '',
      'URI: https://d.test/', 'Version: 1', 'Chain ID: 11155111', 'Nonce: n', 'Issued At: 2026-11-08T10:00:00.000Z',
      'Expiration Time: 2026-11-08T10:05:00.000Z', 'Resources:', '- urn:x']);
    expect(() => formatSiweMessage({ domain: 'd', address: '0x12', statement: 's', uri: 'u', chainId: 1, nonce: 'n', issuedAt: '2026-01-01T00:00:00Z', expirationTime: '2026-01-01T00:00:00Z', resources: [] })).toThrow();
  });
});

describe('WhitelistController', () => {
  it('initializes in idle state and fetches status', async () => {
    const api = new MockWhitelistApi(0);
    const controller = new WhitelistController(api, true);
    expect(controller.getState().state).toBe('idle');

    await controller.init();
    expect(controller.getState().status).toEqual(DEFAULT_STATUS);
  });

  it('connects mock wallet when isMock is true', async () => {
    const api = new MockWhitelistApi(0);
    const controller = new WhitelistController(api, true);

    await controller.connect();
    const state = controller.getState();
    expect(state.state).toBe('connected');
    expect(state.address).toBe('0x71C8A932b1E83F0bE540C1D06f120FDb9c6C3A9F');
    expect(state.score).toBe(1420);
  });

  it('transitions through signing to submitted on valid submission', async () => {
    const api = new MockWhitelistApi(0);
    const controller = new WhitelistController(api, true);

    await controller.connect();
    expect(controller.getState().state).toBe('connected');

    const stateTransitions: string[] = [];
    controller.subscribe(s => stateTransitions.push(s.state));

    await controller.signAndSubmit();
    const finalState = controller.getState();
    expect(finalState.state).toBe('submitted');
    expect(finalState.ticketId).toBe('SQK-71C8A9');
    expect(stateTransitions).toContain('signing');
    expect(stateTransitions).toContain('submitted');
  });

  it('transitions to error state when submission fails', async () => {
    const customApi: WhitelistApi = {
      getStatus: async () => DEFAULT_STATUS,
      submitEntry: async (): Promise<WhitelistResult> => ({
        success: false,
        error: 'Score did not pass server replay check',
      }),
    };

    const controller = new WhitelistController(customApi, true);
    await controller.connect();
    await controller.signAndSubmit();

    const state = controller.getState();
    expect(state.state).toBe('error');
    expect(state.error).toBe('Score did not pass server replay check');
  });

  it('resets state back to idle', async () => {
    const api = new MockWhitelistApi(0);
    const controller = new WhitelistController(api, true);
    await controller.connect();
    await controller.signAndSubmit();
    expect(controller.getState().state).toBe('submitted');

    controller.reset();
    expect(controller.getState().state).toBe('idle');
    expect(controller.getState().address).toBeNull();
    expect(controller.getState().ticketId).toBeNull();
  });

  it('notifies subscribers on each state change', async () => {
    const api = new MockWhitelistApi(0);
    const controller = new WhitelistController(api, true);
    const listener = vi.fn();

    const unsubscribe = controller.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    await controller.connect();
    expect(listener).toHaveBeenCalledTimes(3); // idle -> connecting -> connected

    unsubscribe();
    controller.reset();
    expect(listener).toHaveBeenCalledTimes(3); // no more calls after unsubscribe
  });
});
