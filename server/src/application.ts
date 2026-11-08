import { getAddress, isAddress } from 'viem';
import { CONFIG } from '../../src/config';
import { applicationsOpen, digest, fail, fields, hmacHex, randomToken, requiredCoins, textField, threshold, turnstile, type Env, type Runtime } from './security';

/**
 * Whitelist applications (not a raffle): a qualifying run, a Sepolia address, an X account and a public post
 * carrying the run's application code. The team reviews every application by hand.
 */
interface RunRow { id: string; eligible: number; token_expires: number; score: number; coins: number }
export type XStatus = 'verified' | 'unchecked';
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const POST_URL = /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,20})\/?(?:\?[^#\s]*)?$/;

/** Deterministic per run, so a reload shows the same code; unguessable without the server key. */
export async function applicationCode(env: Env, runId: string): Promise<string> {
  const hex = await hmacHex(env.IP_HASH_SALT, `application-code:${runId}`);
  let bits = BigInt(`0x${hex.slice(0, 16)}`), out = '';
  for (let i = 0; i < 8; i++) { out = CROCKFORD[Number(bits & 31n)] + out; bits >>= 5n; }
  return `SQR-${out.slice(0, 4)}-${out.slice(4)}`;
}

async function qualifyingRun(env: Env, runToken: unknown, now: number): Promise<RunRow> {
  const token = textField(runToken, 64);
  if (!/^[0-9a-f]{64}$/.test(token)) fail(400, 'run_token', 'Invalid run token');
  const run = await env.DB.prepare('SELECT id,eligible,token_expires,score,coins FROM runs WHERE token_hash=?').bind(await digest(token)).first<RunRow>();
  const minimum = threshold(env);
  if (!run || !run.eligible || minimum === null || run.score < minimum || run.coins < requiredCoins(env, CONFIG.coins.count) || run.token_expires <= now) {
    fail(403, 'run_token', 'This run does not qualify, or its 24-hour application window has passed');
  }
  return run!;
}

/** Step 1: the code to put in the X post. Requires the qualifying run's token. */
export async function codeFor(body: Record<string, unknown>, env: Env, rt: Runtime) {
  fields(body, ['runToken']);
  const now = rt.now();
  if (!applicationsOpen(env, now)) fail(403, 'closed', 'Whitelist applications are not open');
  const run = await qualifyingRun(env, body.runToken, now);
  const existing = await env.DB.prepare('SELECT code,status FROM applications WHERE run_id=?').bind(run.id).first<{ code: string; status: string }>();
  return { code: await applicationCode(env, run.id), score: run.score, coins: run.coins, applied: !!existing, status: existing?.status ?? null };
}

export function parsePostUrl(url: string): { handle: string; id: string } | null {
  const m = POST_URL.exec(url.trim());
  return m ? { handle: m[1], id: m[2] } : null;
}

/**
 * Free X oEmbed: proves the post is public, gives its real author and its text.
 * 'missing' = X says the post does not exist or is not public; 'unavailable' = X could not be asked.
 */
export async function checkPost(rt: Runtime, handle: string, id: string, code: string):
    Promise<{ result: 'ok' | 'wrong_author' | 'no_code' | 'missing' | 'unavailable'; detail: string }> {
  const target = `https://twitter.com/${handle}/status/${id}`;
  let reply: Response;
  try {
    reply = await rt.fetcher(`https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=${encodeURIComponent(target)}`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000),
    });
  } catch { return { result: 'unavailable', detail: 'oEmbed request failed' }; }
  if (reply.status === 404 || reply.status === 403) return { result: 'missing', detail: `oEmbed ${reply.status}` };
  if (!reply.ok) return { result: 'unavailable', detail: `oEmbed ${reply.status}` };
  let data: { author_url?: unknown; html?: unknown };
  try { data = await reply.json(); } catch { return { result: 'unavailable', detail: 'oEmbed returned invalid JSON' }; }
  if (typeof data.author_url !== 'string' || typeof data.html !== 'string') return { result: 'unavailable', detail: 'oEmbed response without author/html' };
  const author = data.author_url.replace(/\/+$/, '').split('/').pop() ?? '';
  if (author.toLowerCase() !== handle.toLowerCase()) return { result: 'wrong_author', detail: `post author @${author}` };
  if (!data.html.toUpperCase().includes(code)) return { result: 'no_code', detail: 'post text has no application code' };
  return { result: 'ok', detail: 'oEmbed: author and code match' };
}

/** Step 2: submit the application. One address, one X account, one post and one run = one application. */
export async function apply(body: Record<string, unknown>, env: Env, hash: string, rt: Runtime) {
  fields(body, ['runToken', 'address', 'xHandle', 'postUrl', 'turnstileToken']);
  const now = rt.now();
  if (!applicationsOpen(env, now)) fail(403, 'closed', 'Whitelist applications are not open');
  const run = await qualifyingRun(env, body.runToken, now);
  const rawAddress = textField(body.address, 64).trim();
  if (!isAddress(rawAddress) || /^0x0{40}$/i.test(rawAddress)) fail(400, 'address', 'Enter a valid Ethereum address (0x + 40 hex characters). Check the letters if you pasted a checksummed address.');
  const address = getAddress(rawAddress).toLowerCase();
  const xHandle = textField(body.xHandle, 32).trim().replace(/^@/, '');
  if (!HANDLE.test(xHandle)) fail(400, 'x_handle', 'Enter your X username (letters, digits and _ only, up to 15)');
  const post = parsePostUrl(textField(body.postUrl, 300));
  if (!post) fail(400, 'post_url', 'Paste the link to your post, like https://x.com/yourname/status/123…');
  if (post!.handle.toLowerCase() !== xHandle.toLowerCase()) fail(400, 'post_url', 'The post link must be from the X account you entered');
  const handle = xHandle.toLowerCase();
  const taken = await env.DB.prepare(`SELECT
      (SELECT 1 FROM applications WHERE run_id=?) AS run, (SELECT 1 FROM applications WHERE address=?) AS address,
      (SELECT 1 FROM applications WHERE x_handle=?) AS handle, (SELECT 1 FROM applications WHERE post_id=?) AS post`)
    .bind(run.id, address, handle, post!.id).first<{ run: number | null; address: number | null; handle: number | null; post: number | null }>();
  if (taken?.run) fail(409, 'duplicate_run', 'This run has already been used for an application');
  if (taken?.address) fail(409, 'duplicate_address', 'This address has already applied');
  if (taken?.handle) fail(409, 'duplicate_x', 'This X account has already applied');
  if (taken?.post) fail(409, 'duplicate_post', 'This post has already been used');
  await turnstile(body.turnstileToken, 'application', env, rt);
  const code = await applicationCode(env, run.id);
  const check = await checkPost(rt, handle, post!.id, code);
  if (check.result === 'wrong_author') fail(422, 'x_author', 'That post was published by a different X account');
  if (check.result === 'no_code') fail(422, 'x_code', `Your post must contain your application code ${code}`);
  if (check.result === 'missing') fail(422, 'x_missing', 'X cannot find that post. Make sure it is public and the link is right');
  // X could not be asked: the application is accepted and flagged; the team checks the post by hand.
  const xStatus: XStatus = check.result === 'ok' ? 'verified' : 'unchecked';
  const id = randomToken().slice(0, 32);
  try {
    await env.DB.prepare(`INSERT INTO applications(id,code,run_id,address,x_handle,post_url,post_id,x_status,x_detail,created_at,ip_hash)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id, code, run.id, address, handle, `https://x.com/${handle}/status/${post!.id}`, post!.id,
      xStatus, check.detail, now, hash).run();
  } catch { fail(409, 'duplicate', 'This run, address, X account or post has already been used'); }
  return { code, status: 'pending' as const, xStatus, address, xHandle: handle };
}

/** Public lookup by application code (the code is already public in the post). */
export async function statusOf(code: string | null, env: Env) {
  if (!code || !/^SQR-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(code)) fail(400, 'code', 'Invalid application code');
  const row = await env.DB.prepare('SELECT code,status,x_status AS xStatus,created_at AS createdAt FROM applications WHERE code=?').bind(code).first();
  if (!row) fail(404, 'not_found', 'No application with this code');
  return row;
}
