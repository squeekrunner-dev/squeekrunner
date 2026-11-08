import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { TelemetryCollector } from '../src/telemetry';
import { handle } from '../src/index';
import type { Env, Runtime } from '../src/security';
import type { TimelinePoint } from '../../src/net/timeline';

/** Minimal D1 facade over node:sqlite: enough for prepare/bind/first/all/run/batch. */
class Statement {
  constructor(private readonly db: DatabaseSync, readonly sql: string, private readonly args: SQLInputValue[] = []) {}
  bind(...args: unknown[]): Statement {
    return new Statement(this.db, this.sql, args.map(a => (typeof a === 'boolean' ? Number(a) : a) as SQLInputValue));
  }
  async first<T>(): Promise<T | null> { return (this.db.prepare(this.sql).get(...this.args) as T | undefined) ?? null; }
  async all<T>(): Promise<{ results: T[] }> { return { results: this.db.prepare(this.sql).all(...this.args) as T[] }; }
  async run(): Promise<{ success: true }> { this.db.prepare(this.sql).run(...this.args); return { success: true }; }
}
export function fakeD1(): D1Database & { raw: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  for (const m of ['0001_initial.sql', '0002_coins.sql', '0003_map.sql', '0004_applications.sql']) db.exec(readFileSync(fileURLToPath(new URL(`../migrations/${m}`, import.meta.url).href), 'utf8'));
  const facade = {
    raw: db,
    prepare: (sql: string) => new Statement(db, sql),
    batch: async (statements: Statement[]) => Promise.all(statements.map(s => /^\s*select/i.test(s.sql) ? s.all() : s.run())),
  };
  return facade as unknown as D1Database & { raw: DatabaseSync };
}

function fakeCollector(env: Env, rt: Runtime): DurableObjectNamespace {
  let alarm: number | null = null;
  const storage = new Map<string, unknown>();
  const state = {
    blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn(),
    storage: {
      getAlarm: async () => alarm, setAlarm: async (at: number) => { alarm = at; },
      get: async (key: string) => storage.get(key), put: async (key: string, value: unknown) => { storage.set(key, value); },
    },
  };
  const object = new TelemetryCollector(state as unknown as DurableObjectState, env, rt);
  const stub = { fetch: (input: string) => object.fetch(new Request(input)) };
  return { idFromName: () => ({}), get: () => stub } as unknown as DurableObjectNamespace;
}

export const ORIGIN = 'http://127.0.0.1:5179';
export interface Harness {
  env: Env; db: DatabaseSync; clock: { now: number }; rt: Runtime; siteverify: { success: boolean; calls: number };
  /** Fake X oEmbed: 'ok' returns a post by `author` with `text`; otherwise an HTTP status or a network failure. */
  x: { mode: 'ok' | 404 | 429 | 'down'; author: string; text: string; calls: number };
  /** Requests made to Alchemy / Squeekchain (URL list) for the signal tests. */
  outbound: string[];
  call(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
  addPoint(point: Partial<TimelinePoint> & { at: number }): void;
}
export function harness(overrides: Partial<Env> = {}): Harness {
  const db = fakeD1();
  const env = {
    DB: db, ENVIRONMENT: 'development', THRESHOLD: '', APPLICATIONS_OPEN: 'false',
    SITE_URL: ORIGIN, ALLOWED_ORIGINS: ORIGIN,
    TURNSTILE_SECRET: '1x0000000000000000000000000000000AA', ADMIN_TOKEN: 'a'.repeat(40), IP_HASH_SALT: 's'.repeat(40),
    APPLICATION_DEADLINE: '', ...overrides,
  } as Env;
  const clock = { now: 1_800_000_000_000 };
  const siteverify = { success: true, calls: 0 };
  const x: Harness['x'] = { mode: 'ok', author: 'runner', text: '', calls: 0 };
  const outbound: string[] = [];
  const rt: Runtime = {
    now: () => clock.now,
    fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('turnstile')) { siteverify.calls++; return Response.json({ success: siteverify.success }); }
      if (url.startsWith('https://publish.twitter.com/oembed')) {
        x.calls++;
        if (x.mode === 'down') throw new Error('network');
        if (x.mode !== 'ok') return new Response('{}', { status: x.mode });
        return Response.json({ author_url: `https://twitter.com/${x.author}`, html: `<blockquote><p>${x.text}</p></blockquote>` });
      }
      if (url.includes('.g.alchemy.com/v2/')) {
        outbound.push(url);
        const calls = JSON.parse(String((init as RequestInit).body)) as { id: number; method: string }[];
        return Response.json(calls.map(c => ({ jsonrpc: '2.0', id: c.id, result:
          c.method === 'eth_getTransactionCount' ? '0x2a' : c.method === 'eth_getBalance' ? '0xde0b6b3a7640000' : c.method === 'eth_getCode' ? (url.includes('mainnet') ? '0xef0100' + 'ab'.repeat(20) : '0x') :
          c.method === 'eth_call' ? '0x' + (5n * 10n ** 18n).toString(16).padStart(64, '0') :
          { transfers: [{ metadata: { blockTimestamp: url.includes('mainnet') ? '2021-05-01T00:00:00.000Z' : '2024-01-01T00:00:00.000Z' } }] } })));
      }
      if (url.startsWith('https://api.squeekchain.com/v1/accounts/')) {
        outbound.push(url);
        return url.includes('/activity') ? Response.json({ total: '12' }) :
          Response.json({ tokens: [{ custody: 'wallet' }, { custody: 'staking' }], power: { sqkPower: '0' }, stake: { principalBaseUnits: '0' }, rewards: { claimableBaseUnits: '7', lifetimePaidBaseUnits: '0' } });
      }
      throw new Error(`unexpected fetch ${String(input)}`);
    }) as typeof fetch,
  };
  env.COLLECTOR = fakeCollector(env, rt);
  return {
    env, db: db.raw, clock, rt, siteverify, x, outbound,
    call: (method, path, body, headers = {}) => handle(new Request(`http://api.test${path}`, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { Origin: ORIGIN, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    }), env, rt),
    addPoint: p => db.raw.prepare('INSERT INTO telemetry(at,valid_until,rpm_milli,installation_id,height) VALUES(?,?,?,?,?)')
      .run(p.at, p.validUntil ?? p.at + 120000, p.rpmMilli ?? null, p.installationId ?? 'inst-1', p.height ?? '100'),
  };
}
