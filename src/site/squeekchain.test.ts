import { describe, expect, it, vi } from 'vitest';
import {
  formatCapPercentage,
  formatSqkMillions,
  initSqueekchainLiveCard,
  parseEconomyState,
  type QueryableRoot,
  type VisibilityDocument,
} from './squeekchain';

describe('parseEconomyState', () => {
  it('parses valid economy payload', () => {
    const raw = {
      lifecycle: { currentRound: '669' },
      supply: {
        capBaseUnits: '2100000000000000000000000000',
        totalMintedBaseUnits: '221776999093535297057799194',
      },
    };
    const parsed = parseEconomyState(raw);
    expect(parsed.currentRound).toBe('669');
    expect(parsed.totalMintedBaseUnits).toBe(221776999093535297057799194n);
    expect(parsed.capBaseUnits).toBe(2100000000000000000000000000n);
  });

  it('accepts numeric currentRound', () => {
    const raw = {
      lifecycle: { currentRound: 670 },
      supply: {
        capBaseUnits: '2100000000000000000000000000',
        totalMintedBaseUnits: '221776999093535297057799194',
      },
    };
    const parsed = parseEconomyState(raw);
    expect(parsed.currentRound).toBe('670');
  });

  it('rejects invalid or missing fields', () => {
    expect(() => parseEconomyState(null)).toThrow('not an object');
    expect(() => parseEconomyState({})).toThrow('Missing lifecycle.currentRound');
    expect(() =>
      parseEconomyState({
        lifecycle: { currentRound: 'abc' },
        supply: { capBaseUnits: '2100', totalMintedBaseUnits: '100' },
      })
    ).toThrow('Invalid lifecycle.currentRound format');
    expect(() =>
      parseEconomyState({
        lifecycle: { currentRound: '123' },
        supply: { capBaseUnits: '2100', totalMintedBaseUnits: 'invalid' },
      })
    ).toThrow('Invalid supply.totalMintedBaseUnits');
  });
});

describe('formatSqkMillions', () => {
  it('formats live supply correctly in millions with 1 decimal place', () => {
    // 221,776,999.09... SQK -> rounds to 221.8 M SQK
    expect(formatSqkMillions(221776999093535297057799194n)).toBe('221.8 M SQK');
  });

  it('handles 0 base units', () => {
    expect(formatSqkMillions(0n)).toBe('0.0 M SQK');
  });

  it('handles exactly 1 million SQK (10^24 base units)', () => {
    expect(formatSqkMillions(10n ** 24n)).toBe('1.0 M SQK');
  });

  it('handles rounding to nearest tenth', () => {
    // 1.05 M SQK -> rounds to 1.1 M SQK
    const val = 10n ** 24n + 5n * 10n ** 22n;
    expect(formatSqkMillions(val)).toBe('1.1 M SQK');
  });
});

describe('formatCapPercentage', () => {
  it('formats percentage of 2.1B cap correctly', () => {
    const totalMinted = 221776999093535297057799194n;
    const cap = 2100000000000000000000000000n;
    expect(formatCapPercentage(totalMinted, cap)).toBe('10.6% of the 2.1B cap');
  });

  it('handles 0 cap or 0 minted gracefully', () => {
    expect(formatCapPercentage(0n, 2100000000000000000000000000n)).toBe('0.0% of the 2.1B cap');
    expect(formatCapPercentage(100n, 0n)).toBe('0.0% of the 2.1B cap');
  });

  it('handles 100% cap reached', () => {
    const cap = 2100000000000000000000000000n;
    expect(formatCapPercentage(cap, cap)).toBe('100.0% of the 2.1B cap');
  });
});

describe('initSqueekchainLiveCard', () => {
  function createTestDom(): {
    root: QueryableRoot;
    elements: Map<string, { textContent: string | null; style: { display: string } }>;
  } {
    const elements = new Map<string, { textContent: string | null; style: { display: string } }>();
    for (const selector of [
      '[data-sqk-round]',
      '[data-sqk-minted]',
      '[data-sqk-cap]',
      '[data-sqk-block]',
      '[data-sqk-status]',
      '[data-sqk-rpm]',
      '[data-sqk-error]',
    ]) {
      elements.set(selector, { textContent: '—', style: { display: 'none' } });
    }
    const root: QueryableRoot = {
      querySelector: <E>(selector: string) => (elements.get(selector) as unknown as E) ?? null,
    };
    return { root, elements };
  }

  class MockVisibilityDoc extends EventTarget implements VisibilityDocument {
    visibilityState: DocumentVisibilityState = 'visible';
  }

  it('fetches and updates economy values in DOM', async () => {
    const { root, elements } = createTestDom();
    const doc = new MockVisibilityDoc();
    const mockPayload = {
      lifecycle: { currentRound: '669' },
      supply: {
        capBaseUnits: '2100000000000000000000000000',
        totalMintedBaseUnits: '221776999093535297057799194',
      },
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPayload,
    } as Response);

    const controller = initSqueekchainLiveCard(root, {
      fetchFn: mockFetch as unknown as typeof fetch,
      intervalMs: 100_000,
      doc,
    });

    await vi.waitFor(() => {
      expect(elements.get('[data-sqk-round]')?.textContent).toBe('669');
      expect(elements.get('[data-sqk-minted]')?.textContent).toBe('221.8 M SQK');
      expect(elements.get('[data-sqk-cap]')?.textContent).toBe('10.6% of the 2.1B cap');
    });

    controller.dispose();
  });

  it('updates telemetry states appropriately', () => {
    const { root, elements } = createTestDom();
    const doc = new MockVisibilityDoc();
    const mockFetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    const controller = initSqueekchainLiveCard(root, {
      fetchFn: mockFetch as unknown as typeof fetch,
      intervalMs: 100_000,
      doc,
    });

    // Resting mode
    controller.updateTelemetry({ mode: 'WHEEL IDLE', rpm: '0.0', height: '#3205' });
    expect(elements.get('[data-sqk-block]')?.textContent).toBe('#3205');
    expect(elements.get('[data-sqk-status]')?.textContent).toBe('Squeektoshi is resting');
    expect(elements.get('[data-sqk-rpm]')?.textContent).toBe('He runs mostly at night (UTC)');

    // Live mode
    controller.updateTelemetry({ mode: 'LIVE', rpm: '85.2', height: '#3206' });
    expect(elements.get('[data-sqk-block]')?.textContent).toBe('#3206');
    expect(elements.get('[data-sqk-status]')?.textContent).toBe('Running live');
    expect(elements.get('[data-sqk-rpm]')?.textContent).toBe('85.2 RPM on wheel');

    // No data mode
    controller.updateTelemetry({ mode: 'NO DATA', rpm: '—', height: '#3206' });
    expect(elements.get('[data-sqk-status]')?.textContent).toBe('Telemetry quiet');
    expect(elements.get('[data-sqk-rpm]')?.textContent).toBe('Baseline game speed');

    controller.dispose();
  });

  it('displays fallback error message when fetch fails without throwing', async () => {
    const { root, elements } = createTestDom();
    const doc = new MockVisibilityDoc();
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const controller = initSqueekchainLiveCard(root, {
      fetchFn: mockFetch as unknown as typeof fetch,
      intervalMs: 100_000,
      doc,
    });

    await vi.waitFor(() => {
      const errorEl = elements.get('[data-sqk-error]');
      expect(errorEl?.style.display).toBe('block');
      expect(errorEl?.textContent).toBe('Live data unavailable right now');
    });

    controller.dispose();
  });
});
