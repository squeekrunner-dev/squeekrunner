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
  db.exec(readFileSync(fileURLToPath(new URL('../migrations/0001_initial.sql', import.meta.url).href), 'utf8'));
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
  call(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
  addPoint(point: Partial<TimelinePoint> & { at: number }): void;
}
export function harness(overrides: Partial<Env> = {}): Harness {
  const db = fakeD1();
  const env = {
    DB: db, ENVIRONMENT: 'development', THRESHOLD: '', ENTRIES_OPEN: 'false',
    SIWE_DOMAIN: '127.0.0.1:5179', SIWE_URI: `${ORIGIN}/whitelist/`, ALLOWED_ORIGINS: ORIGIN,
    TURNSTILE_SECRET: '1x0000000000000000000000000000000AA', ADMIN_TOKEN: 'a'.repeat(40), IP_HASH_SALT: 's'.repeat(40),
    ENTRY_DEADLINE: '', SNAPSHOT_AT: '', ...overrides,
  } as Env;
  const clock = { now: 1_800_000_000_000 };
  const siteverify = { success: true, calls: 0 };
  const rt: Runtime = {
    now: () => clock.now,
    fetcher: (async (input: RequestInfo | URL) => {
      if (String(input).includes('turnstile')) { siteverify.calls++; return Response.json({ success: siteverify.success }); }
      throw new Error(`unexpected fetch ${String(input)}`);
    }) as typeof fetch,
  };
  env.COLLECTOR = fakeCollector(env, rt);
  return {
    env, db: db.raw, clock, rt, siteverify,
    call: (method, path, body, headers = {}) => handle(new Request(`http://api.test${path}`, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { Origin: ORIGIN, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    }), env, rt),
    addPoint: p => db.raw.prepare('INSERT INTO telemetry(at,valid_until,rpm_milli,installation_id,height) VALUES(?,?,?,?,?)')
      .run(p.at, p.validUntil ?? p.at + 120000, p.rpmMilli ?? null, p.installationId ?? 'inst-1', p.height ?? '100'),
  };
}
