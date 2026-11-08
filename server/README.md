# SqueekRunner API (Cloudflare Worker + D1)

The whitelist raffle server. It never trusts the browser for anything that changes a score:

- **Server telemetry.** A Durable Object (`TelemetryCollector`) reads `https://api.squeekchain.com/v1/status`
  about every 10 seconds and stores RPM, confirmed block height and installation in D1 (48 h retention).
  A cron trigger (`* * * * *`) only wakes the collector if its alarm was lost.
- **Same timeline for both sides.** In ranked mode the game reads RPM and blocks from `GET /v1/telemetry`
  (published with a 5 s broadcast delay), so the browser and the verifier see identical inputs.
- **Server seed, real time.** `POST /v1/session` issues a one-time session with a server seed.
  `POST /v1/run` re-simulates the replay with the server timeline (client RPM/nut fields are ignored),
  requires the client score to match, and rejects runs submitted faster than their real duration
  or more than 15 s late.
- **One wallet, one ticket.** `POST /v1/entry` checks a Sign-In with Ethereum (EIP-4361) message
  (domain, URI, chain 11155111, statement, one-time nonce, expiry, run resource), verifies the signature
  with viem, and stores one entry per address and per run.
- Cloudflare Turnstile on session and entry, per-IP rate limits in D1, strict CORS, body limits,
  IPs stored only as salted HMAC hashes.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/telemetry?since=` | Server wheel timeline (points, `completeThrough`, `serverNow`) |
| POST | `/v1/session` | `{turnstileToken}` → `{sessionId, seed, startedAt, expiresAt, simVersion, timeline}` |
| POST | `/v1/run` | `{sessionId, replay}` → `{score, distance, endTick, eligible, runToken, runId}` |
| GET | `/v1/nonce` | SIWE challenge fields (nonce, issuedAt, expirationTime, domain, uri, chainId, statement) |
| POST | `/v1/entry` | `{runToken, siweMessage, signature, turnstileToken}` → `{address, entered}` |
| GET | `/v1/stats` | Verified runs, score percentiles p50…p99, histogram — used to pick the threshold |
| GET | `/v1/raffle/status` | `{threshold, entriesOpen, entriesCount, snapshotAt, deadline}` |
| GET | `/v1/admin/export[?format=csv]` | `Authorization: Bearer <ADMIN_TOKEN>`; `address,allowance` list for `contracts/scripts/build-merkle.mjs` |

## Configuration

`wrangler.toml` `[vars]` (public): `THRESHOLD` (empty = stats only, entries closed), `ENTRIES_OPEN`,
`SIWE_DOMAIN`, `SIWE_URI`, `ALLOWED_ORIGINS` (comma-separated), `ENTRY_DEADLINE`, `SNAPSHOT_AT` (ISO dates).
Secrets (never in git): `TURNSTILE_SECRET`, `ADMIN_TOKEN` (≥ 32 chars), `IP_HASH_SALT` (≥ 32 chars).
Game build variables: `VITE_API_BASE` (Worker URL) and `VITE_TURNSTILE_SITEKEY`. Without `VITE_API_BASE`
the game stays a pure client and runs are not raffle-eligible.

CPU: verifying the longest possible run (30 min, 108,000 ticks) takes about 30 ms in Node
(`npm run bench`). The Workers Free plan allows 10 ms per request, so the **Workers Paid** plan is required;
`[limits] cpu_ms = 1000` leaves a wide margin.

## Local development

```sh
cd server
npm install
cp .dev.vars.example .dev.vars        # fill IP_HASH_SALT and ADMIN_TOKEN with random 32+ chars
npx wrangler d1 migrations apply DB --local
npx wrangler dev --local --port 8787 --test-scheduled
curl http://127.0.0.1:8787/__scheduled   # wake the collector once
# in the repo root, with ALLOWED_ORIGINS/SIWE_* in .dev.vars pointing at this origin:
VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_SITEKEY=1x00000000000000000000AA npm run dev -- --port 5182
```

`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA` are Cloudflare's public always-pass test keys;
the Worker refuses them unless `ENVIRONMENT=development`.

Checks: `npm run typecheck`, `npm test` (16 API tests on an in-memory SQLite D1 facade), `npm run bench`.

## Deployment (owner steps)

Everything below needs the owner's Cloudflare account; nothing here is done automatically.

1. Cloudflare account → subscribe to **Workers Paid** ($5/month).
2. On this computer: `! npx wrangler login` (from `server/`).
3. `npx wrangler d1 create squeekrunner` → put the printed `database_id` into `wrangler.toml`.
4. `npx wrangler d1 migrations apply DB --remote`.
5. Turnstile → *Add widget* for the site's domain (mode: Managed). Keep the **site key** (public) and **secret key**.
6. Secrets: `npx wrangler secret put TURNSTILE_SECRET`, `… ADMIN_TOKEN`, `… IP_HASH_SALT` (random, 32+ chars each).
7. Edit `[vars]`: `SIWE_DOMAIN` = site host (e.g. `squeekrunner.xyz`), `SIWE_URI` = `https://<host>/whitelist/`,
   `ALLOWED_ORIGINS` = `https://<host>`. Keep `THRESHOLD` empty and `ENTRIES_OPEN=false` while collecting stats.
8. `npx wrangler deploy` → note the Worker URL (or attach a route such as `api.<host>`).
9. Site (Cloudflare Pages): build the repo root with `VITE_API_BASE=<worker URL>` and
   `VITE_TURNSTILE_SITEKEY=<site key>`, publish `dist/`, attach the custom domain.
10. After choosing the threshold from `/v1/stats`: set `THRESHOLD`, `ENTRY_DEADLINE`, `SNAPSHOT_AT`,
    `ENTRIES_OPEN=true`, redeploy. Export entries with the admin token for the raffle.

## Remaining risks (honest)

- The seed must be known to the browser to render obstacles, so a bot can compute ideal inputs offline.
  Real-time play, Turnstile, a wallet signature, one entry per wallet and rate limits make farming costly,
  not impossible. Organizers may exclude obvious farms.
- A player whose IP changes between nonce and entry must request a new nonce (nonces are bound to the IP hash).
- Ranked runs cannot be paused: they follow server time.
