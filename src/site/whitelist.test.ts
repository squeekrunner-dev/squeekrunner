import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_STATUS,
  DefaultWhitelistApi,
  formatAddress,
  MockWhitelistApi,
  WhitelistController,
  type WhitelistApi,
  type WhitelistResult,
} from './whitelist';

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

describe('DefaultWhitelistApi', () => {
  it('returns status and instructs about mock mode on submit', async () => {
    const api = new DefaultWhitelistApi();
    const status = await api.getStatus();
    expect(status.thresholdLabel).toBe('TBA');

    const result = await api.submitEntry();
    expect(result.success).toBe(false);
    expect(result.error).toContain('T008');
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
