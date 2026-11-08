import { verifyMessage, isAddress } from 'viem';
import { CONFIG } from '../../src/config';
import { parseSiweMessage } from 'viem/siwe';
import { digest, entriesOpen, requiredCoins, fail, fields, textField, threshold, turnstile, type Env, type Runtime } from './security';

export const SIWE_STATEMENT = 'Enter the SqueekRunner whitelist raffle. No transaction or fee.';
interface NonceRow { nonce: string; created_at: number; expires_at: number; ip_hash: string }
interface RunRow { id: string; eligible: number; token_expires: number; score: number }

export async function enter(body: Record<string, unknown>, env: Env, hash: string, rt: Runtime): Promise<{ address: string; entered: true }> {
  fields(body, ['runToken', 'siweMessage', 'signature', 'turnstileToken']);
  if (!entriesOpen(env, rt.now())) fail(403, 'entries_closed', 'Raffle entries are closed');
  const token = textField(body.runToken, 64), message = textField(body.siweMessage, 4096), signature = textField(body.signature, 132);
  if (!/^[0-9a-f]{64}$/.test(token) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) fail(400, 'credentials', 'Invalid credentials');
  const tokenHash = await digest(token);
  const run = await env.DB.prepare('SELECT id,eligible,token_expires,score FROM runs WHERE token_hash=?').bind(tokenHash).first<RunRow>();
  if (!run || !run.eligible || run.score < threshold(env)! || run.token_expires <= rt.now()) fail(403, 'run_token', 'Run token is invalid, expired or ineligible');
  let parsed: ReturnType<typeof parseSiweMessage>;
  try { parsed = parseSiweMessage(message); } catch { fail(400, 'siwe', 'Invalid sign-in message'); }
  const p = parsed!;
  if (!p.nonce || !/^[a-f0-9]{64}$/.test(p.nonce)) fail(403, 'siwe_nonce', 'Invalid nonce');
  const nonce = await env.DB.prepare('SELECT * FROM nonces WHERE nonce=?').bind(p.nonce).first<NonceRow>();
  const now = rt.now();
  if (!nonce || nonce.ip_hash !== hash || nonce.expires_at <= now) fail(403, 'siwe_nonce', 'Nonce expired or not found');
  if (!p.address || !isAddress(p.address) || /^0x0{40}$/i.test(p.address) || p.version !== '1' || p.chainId !== 11155111 ||
      p.domain !== env.SIWE_DOMAIN || p.uri !== env.SIWE_URI || p.statement !== SIWE_STATEMENT ||
      p.resources?.length !== 1 || p.resources[0] !== `urn:squeekrunner:run:${run.id}` ||
      !p.issuedAt || !p.expirationTime || !Number.isFinite(p.issuedAt.getTime()) || !Number.isFinite(p.expirationTime.getTime()) ||
      p.issuedAt.getTime() < nonce.created_at - 5000 || p.issuedAt.getTime() > now + 5000 ||
      p.expirationTime.getTime() <= now || p.expirationTime.getTime() > nonce.expires_at ||
      p.expirationTime.getTime() <= p.issuedAt.getTime() || (p.notBefore && p.notBefore.getTime() > now)) {
    fail(403, 'siwe_fields', 'Sign-in message does not match this raffle challenge');
  }
  let valid = false;
  try { valid = await verifyMessage({ address: p.address!, message, signature: signature as `0x${string}` }); } catch { /* reject */ }
  if (!valid) fail(403, 'signature', 'Invalid wallet signature');
  await turnstile(body.turnstileToken, 'entry', env, rt);
  const address = p.address!.toLowerCase();
  // One atomic statement plus UNIQUE(address/run_id/nonce) closes concurrent consumption races.
  try {
    const row = await env.DB.prepare(`INSERT INTO entries(address,run_id,nonce,created_at)
      SELECT ?,r.id,n.nonce,? FROM runs r JOIN nonces n ON n.nonce=?
      WHERE r.token_hash=? AND r.eligible=1 AND r.score>=? AND r.coins>=? AND r.token_expires>? AND n.expires_at>? AND n.ip_hash=?
      RETURNING address`).bind(address, rt.now(), p.nonce, tokenHash, threshold(env), requiredCoins(env, CONFIG.coins.count), rt.now(), rt.now(), hash).first();
    if (!row) fail(409, 'consumed', 'Challenge or run token is no longer available');
  } catch { fail(409, 'duplicate_entry', 'Wallet, nonce or run token already used, or challenge expired'); }
  return { address, entered: true };
}
