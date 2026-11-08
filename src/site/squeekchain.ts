export interface EconomyRawResponse {
  lifecycle?: {
    currentRound?: string | number;
  };
  supply?: {
    capBaseUnits?: string;
    totalMintedBaseUnits?: string;
  };
}

export interface EconomyState {
  currentRound: string;
  totalMintedBaseUnits: bigint;
  capBaseUnits: bigint;
}

export interface TelemetrySummary {
  mode: string;
  rpm: string;
  height: string;
}

export function parseEconomyState(raw: unknown): EconomyState {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid response: not an object');
  }
  const obj = raw as EconomyRawResponse;
  const round = obj.lifecycle?.currentRound;
  if (round === undefined || round === null) {
    throw new Error('Missing lifecycle.currentRound');
  }
  const currentRound = String(round);
  if (!/^\d+$/.test(currentRound)) {
    throw new Error('Invalid lifecycle.currentRound format');
  }

  const totalMinted = obj.supply?.totalMintedBaseUnits;
  if (typeof totalMinted !== 'string' || !/^\d+$/.test(totalMinted)) {
    throw new Error('Invalid supply.totalMintedBaseUnits');
  }

  const cap = obj.supply?.capBaseUnits;
  if (typeof cap !== 'string' || !/^\d+$/.test(cap)) {
    throw new Error('Invalid supply.capBaseUnits');
  }

  return {
    currentRound,
    totalMintedBaseUnits: BigInt(totalMinted),
    capBaseUnits: BigInt(cap),
  };
}

/**
 * Formats $SQK minted base units (18 decimals) into millions of SQK with 1 decimal place.
 * 1 million SQK = 10^24 base units.
 * Tenths of a million = 10^23 base units.
 */
export function formatSqkMillions(baseUnits: bigint): string {
  if (baseUnits < 0n) return '0.0 M SQK';
  // Round to nearest tenth of a million
  const tenths = (baseUnits + 5n * 10n ** 22n) / (10n ** 23n);
  const wholeMillions = tenths / 10n;
  const decimalPart = tenths % 10n;
  return `${wholeMillions.toLocaleString('en-US')}.${decimalPart} M SQK`;
}

/**
 * Formats the percentage of total minted against the 2.1B cap with 1 decimal place.
 */
export function formatCapPercentage(totalMinted: bigint, cap: bigint): string {
  if (cap <= 0n || totalMinted <= 0n) return '0.0% of the 2.1B cap';
  // Round to nearest tenth of a percent
  const tenthsOfPercent = (totalMinted * 1000n + cap / 2n) / cap;
  const wholePercent = tenthsOfPercent / 10n;
  const decimalPercent = tenthsOfPercent % 10n;
  return `${wholePercent}.${decimalPercent}% of the 2.1B cap`;
}

export async function fetchEconomyState(
  fetchFn: typeof fetch = globalThis.fetch,
  timeoutMs = 8000
): Promise<EconomyState> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn('https://api.squeekchain.com/v1/economy/state', {
      signal: controller.signal,
      credentials: 'omit',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return parseEconomyState(data);
  } finally {
    clearTimeout(timer);
  }
}

export interface LiveCardController {
  updateTelemetry: (summary: TelemetrySummary) => void;
  dispose: () => void;
}

export interface QueryableRoot {
  querySelector<E = { textContent: string | null; style?: { display: string } }>(selector: string): E | null;
}

export interface VisibilityDocument extends EventTarget {
  visibilityState: DocumentVisibilityState;
}

export function initSqueekchainLiveCard(
  root: QueryableRoot,
  options: {
    fetchFn?: typeof fetch;
    intervalMs?: number;
    doc?: VisibilityDocument | null;
  } = {}
): LiveCardController {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const intervalMs = options.intervalMs ?? 60_000;
  const doc = options.doc !== undefined ? options.doc : (typeof document !== 'undefined' ? document : null);

  const roundEl = root.querySelector<{ textContent: string | null }>('[data-sqk-round]');
  const mintedEl = root.querySelector<{ textContent: string | null }>('[data-sqk-minted]');
  const capEl = root.querySelector<{ textContent: string | null }>('[data-sqk-cap]');
  const blockEl = root.querySelector<{ textContent: string | null }>('[data-sqk-block]');
  const statusEl = root.querySelector<{ textContent: string | null }>('[data-sqk-status]');
  const rpmEl = root.querySelector<{ textContent: string | null }>('[data-sqk-rpm]');
  const errorEl = root.querySelector<{ textContent: string | null; style: { display: string } }>('[data-sqk-error]');

  let timerId: ReturnType<typeof setInterval> | null = null;
  let disposed = false;
  let lastFetchedAt = 0;

  async function refreshEconomy() {
    if (disposed) return;
    if (doc && doc.visibilityState === 'hidden') return;

    try {
      const state = await fetchEconomyState(fetchFn);
      if (disposed) return;
      lastFetchedAt = Date.now();
      if (roundEl) roundEl.textContent = state.currentRound;
      if (mintedEl) mintedEl.textContent = formatSqkMillions(state.totalMintedBaseUnits);
      if (capEl) capEl.textContent = formatCapPercentage(state.totalMintedBaseUnits, state.capBaseUnits);
      if (errorEl) errorEl.style.display = 'none';
    } catch {
      if (disposed) return;
      // Show graceful fallback message without crashing
      if (errorEl) {
        errorEl.textContent = 'Live data unavailable right now';
        errorEl.style.display = 'block';
      }
    }
  }

  function handleVisibilityChange() {
    if (doc && doc.visibilityState === 'visible') {
      const elapsed = Date.now() - lastFetchedAt;
      if (elapsed >= intervalMs) {
        void refreshEconomy();
      }
    }
  }

  if (doc) {
    doc.addEventListener('visibilitychange', handleVisibilityChange);
  }

  // Initial fetch
  void refreshEconomy();
  timerId = setInterval(() => {
    void refreshEconomy();
  }, intervalMs);

  function updateTelemetry(summary: TelemetrySummary) {
    if (disposed) return;
    if (blockEl && summary.height) {
      blockEl.textContent = summary.height;
    }
    if (statusEl && rpmEl) {
      if (summary.mode === 'LIVE') {
        statusEl.textContent = 'Running live';
        rpmEl.textContent = `${summary.rpm} RPM on wheel`;
      } else if (summary.mode === 'WHEEL IDLE') {
        statusEl.textContent = 'Squeektoshi is resting';
        rpmEl.textContent = 'He runs mostly at night (UTC)';
      } else if (summary.mode === 'NO DATA') {
        statusEl.textContent = 'Telemetry quiet';
        rpmEl.textContent = 'Baseline game speed';
      } else {
        statusEl.textContent = summary.mode;
        rpmEl.textContent = `${summary.rpm} RPM`;
      }
    }
  }

  function dispose() {
    disposed = true;
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
    if (doc) {
      doc.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  }

  return { updateTelemetry, dispose };
}
