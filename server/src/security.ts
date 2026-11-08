export interface Env {
  DB: D1Database; COLLECTOR: DurableObjectNamespace;
  ENVIRONMENT: string; THRESHOLD: string; APPLICATIONS_OPEN: string;
  /** Public site origin, e.g. https://squeekrunner.app (Turnstile hostname). */
  SITE_URL: string; ALLOWED_ORIGINS: string;
  TURNSTILE_SECRET: string; ADMIN_TOKEN: string; IP_HASH_SALT: string;
  /** Optional ISO date after which applications close. */
  APPLICATION_DEADLINE?: string;
  /** Optional override of the coins required to qualify (default: every coin, CONFIG.coins.count). */
  REQUIRED_COINS?: string;
  /** Alchemy API key for address-history signals in the review panel (secret, optional). */
  ALCHEMY_KEY?: string;
}
export interface Runtime { now: () => number; fetcher: typeof fetch }
export const runtime: Runtime = { now: () => Date.now(), fetcher: (...args) => fetch(...args) };
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly extra: Record<string, unknown> = {}) { super(message); }
}
export function fail(status: number, code: string, message: string): never { throw new ApiError(status, code, message); }
export function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function digest(text: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function ipHash(request: Request, env: Env): Promise<string> {
  if (!env.IP_HASH_SALT || env.IP_HASH_SALT.length < 32) fail(503, 'configuration', 'Service unavailable');
  const ip = request.headers.get('CF-Connecting-IP') ?? (env.ENVIRONMENT === 'development' ? 'local-development' : '');
  if (!ip) fail(403, 'network', 'Request must use the public service');
  return hmacHex(env.IP_HASH_SALT, ip);
}
export async function rateLimit(env: Env, hash: string, scope: string, max: number, now: number, window = 60000): Promise<void> {
  const bucket = Math.floor(now / window);
  const row = await env.DB.prepare(`INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`)
    .bind(`${scope}:${hash}:${bucket}`, (bucket + 1) * window, max).first();
  if (!row) fail(429, 'rate_limit', 'Too many requests. Try again later.');
}
export function threshold(env: Env): number | null {
  if (!env.THRESHOLD?.trim()) return null;
  if (!/^\d+$/.test(env.THRESHOLD) || !Number.isSafeInteger(Number(env.THRESHOLD))) fail(503, 'configuration', 'Service unavailable');
  return Number(env.THRESHOLD);
}
export function requiredCoins(env: Env, all: number): number {
  if (!env.REQUIRED_COINS?.trim()) return all;
  if (!/^\d+$/.test(env.REQUIRED_COINS) || Number(env.REQUIRED_COINS) > all) fail(503, 'configuration', 'Service unavailable');
  return Number(env.REQUIRED_COINS);
}
export function applicationsOpen(env: Env, now: number): boolean {
  const deadline = env.APPLICATION_DEADLINE ? Date.parse(env.APPLICATION_DEADLINE) : Infinity;
  return env.APPLICATIONS_OPEN === 'true' && threshold(env) !== null && !Number.isNaN(deadline) && now < deadline;
}
/** Constant-time comparison of two strings through their digests. */
export async function sameSecret(a: string, b: string): Promise<boolean> {
  const x = await digest(a), y = await digest(b);
  let difference = 0; for (let i = 0; i < x.length; i++) difference |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return difference === 0;
}
export async function hmacHex(key: string, text: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function readJSON(request: Request, max: number): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) fail(415, 'content_type', 'JSON required');
  if (Number(request.headers.get('Content-Length')) > max) fail(413, 'body_limit', 'Request is too large');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'json', 'JSON object required');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); fail(413, 'body_limit', 'Request is too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)); }
  catch { fail(400, 'json', 'Invalid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'json', 'JSON object required');
  return value as Record<string, unknown>;
}
export function fields(body: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(body).length !== keys.length || keys.some(k => !Object.hasOwn(body, k))) fail(400, 'fields', 'Invalid request fields');
}
export function textField(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) fail(400, 'field', 'Invalid text field');
  return value as string;
}
export async function turnstile(token: unknown, action: string, env: Env, rt: Runtime): Promise<void> {
  const response = textField(token, 2048);
  if (!env.TURNSTILE_SECRET || (env.ENVIRONMENT !== 'development' && /^[123]x0+AA$/.test(env.TURNSTILE_SECRET))) fail(503, 'configuration', 'Service unavailable');
  let data: { success?: boolean; hostname?: string; action?: string };
  try {
    const reply = await rt.fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response }), signal: AbortSignal.timeout(8000),
    });
    if (!reply.ok) throw new Error('siteverify');
    data = await reply.json();
  } catch { fail(503, 'turnstile_unavailable', 'Challenge verification unavailable'); }
  const development = env.ENVIRONMENT === 'development' && env.TURNSTILE_SECRET === '1x0000000000000000000000000000000AA';
  const hostname = new URL(env.SITE_URL).hostname;
  if (!data!.success || (!development && (data!.hostname !== hostname || data!.action !== action))) fail(403, 'turnstile', 'Challenge failed or expired');
}
