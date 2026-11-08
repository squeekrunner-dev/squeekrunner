# SqueekRunner API (Cloudflare Worker + D1)

The whitelist application server (not a raffle: the team reviews every application by hand).
It never trusts the browser for anything that changes a score:

- **Server telemetry.** A Durable Object (`TelemetryCollector`) reads `https://api.squeekchain.com/v1/status`
  about every 10 seconds and stores RPM, confirmed block height and installation in D1 (48 h retention).
  A cron trigger (`* * * * *`) only wakes the collector if its alarm was lost.
- **Same timeline for both sides.** In ranked mode the game reads RPM and blocks from `GET /v1/telemetry`
  (published with a 5 s broadcast delay), so the browser and the verifier see identical inputs.
- **Map in chunks.** The map (obstacles and coins) restarts its random streams every 300 ticks (5 s) from a
  chunk seed = SHA-256 of a private per-session secret and the chunk index. `POST /v1/map` releases each seed
  3 s before its chunk starts, so a run cannot be precomputed offline from the session seed (sim `squeek-3`).
- **Real time.** `POST /v1/run` re-simulates the replay with the server timeline and the server map seeds
  (client RPM/nut fields are ignored), requires the client score to match, rejects runs submitted faster than
  their real duration or more than 15 s late, and stores input-rhythm signals for the review panel.
- **Qualifying rule.** `THRESHOLD` points AND all 10 coins (`REQUIRED_COINS` overrides the coin count).
- **Applications.** `POST /v1/application` takes the qualifying run token, a pasted address (EIP-55 checked, no
  wallet connection), an X username and the link to a public post with the run's application code. The post is
  checked through X's free oEmbed endpoint (author and code). If oEmbed is unavailable the application is
  accepted and flagged `unchecked`; a missing post, another author or a missing code are rejected.
  One run, address, X account and post = one application.
- **Review panel** (`/admin/` on the site, `/v1/admin/*` here, `Authorization: Bearer <ADMIN_TOKEN>`): run signals,
  network clusters (salted IP hashes), address history via Alchemy (mainnet + Sepolia, $SQK balance) and Squeekchain
  activity via its public API; approve/reject; CSV export for `contracts/scripts/build-merkle.mjs`.
- Cloudflare Turnstile on session and application, per-IP rate limits in D1, strict CORS, body limits,
  IPs stored only as salted HMAC hashes.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/telemetry?since=` | Server wheel timeline (points, `completeThrough`, `serverNow`) |
| POST | `/v1/session` | `{turnstileToken}` → `{sessionId, seed, startedAt, expiresAt, simVersion, timeline, map}` |
| POST | `/v1/map` | `{sessionId, from}` → `{chunks: [{index, seed}], nextAt, serverNow}` (released chunks only) |
| POST | `/v1/run` | `{sessionId, replay}` → `{score, distance, endTick, coins, eligible, runToken, runId}` |
| GET | `/v1/stats` | Verified runs, score percentiles, histogram, coins collected |
| GET | `/v1/whitelist/status` | `{threshold, requiredCoins, applicationsOpen, applications, approved, deadline}` |
| POST | `/v1/application/code` | `{runToken}` → `{code, score, coins, applied, status}` (code `SQR-XXXX-XXXX`, stable per run) |
| POST | `/v1/application` | `{runToken, address, xHandle, postUrl, turnstileToken}` → `{code, status, xStatus, address, xHandle}` |
| GET | `/v1/application?code=` | Public status of one application |
| GET | `/v1/admin/applications?status=` | Review list with signals (admin) |
| POST | `/v1/admin/applications/:id/review` | `{status: pending/approved/rejected, note}` (admin) |
| POST | `/v1/admin/applications/:id/chain` | Refresh Alchemy + Squeekchain signals (admin) |
| POST | `/v1/admin/applications/:id/xcheck` | Re-run the X oEmbed check (admin) |
| GET | `/v1/admin/export[?format=csv]` | Approved addresses as `address,allowance` for build-merkle (admin) |

## Configuration

`wrangler.toml` `[vars]` (public): `THRESHOLD` (empty = stats only, applications closed), `APPLICATIONS_OPEN`,
`APPLICATION_DEADLINE` (ISO date, optional), `SITE_URL` (Turnstile hostname), `ALLOWED_ORIGINS` (comma-separated),
`REQUIRED_COINS` (optional).
Secrets (never in git): `TURNSTILE_SECRET`, `ADMIN_TOKEN` (≥ 32 chars), `IP_HASH_SALT` (≥ 32 chars; also keys the
application codes), `ALCHEMY_KEY` (optional; without it the panel shows only Squeekchain signals).
Game build variables: `VITE_API_BASE` (Worker URL) and `VITE_TURNSTILE_SITEKEY`. Without `VITE_API_BASE`
the game stays a pure client and runs never qualify.

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
# in the repo root, with SITE_URL/ALLOWED_ORIGINS in .dev.vars pointing at this origin:
VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_SITEKEY=1x00000000000000000000AA npm run dev -- --port 5182
```

`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA` are Cloudflare's public always-pass test keys;
the Worker refuses them unless `ENVIRONMENT=development`.

Checks: `npm run typecheck`, `npm test` (API tests on an in-memory SQLite D1 facade with fake Turnstile, X oEmbed, Alchemy and Squeekchain), `npm run bench`.

## Deployment (owner steps)

Everything below needs the owner's Cloudflare account; nothing here is done automatically.

1. Cloudflare account → subscribe to **Workers Paid** ($5/month).
2. On this computer: `! npx wrangler login` (from `server/`).
3. `npx wrangler d1 create squeekrunner` → put the printed `database_id` into `wrangler.toml`.
4. `npx wrangler d1 migrations apply DB --remote`.
5. Turnstile → *Add widget* for the site's domain (mode: Managed). Keep the **site key** (public) and **secret key**.
6. Secrets: `npx wrangler secret put TURNSTILE_SECRET`, `… ADMIN_TOKEN`, `… IP_HASH_SALT` (random, 32+ chars each), `… ALCHEMY_KEY`.
7. Edit `[vars]`: `SITE_URL` = `https://<host>`, `ALLOWED_ORIGINS` = `https://<host>`. Keep `APPLICATIONS_OPEN=false` until launch.
8. `npx wrangler deploy` → note the Worker URL (or attach a route such as `api.<host>`).
9. Site (Cloudflare Pages): build the repo root with `VITE_API_BASE=<worker URL>` and
   `VITE_TURNSTILE_SITEKEY=<site key>`, publish `dist/`, attach the custom domain.
10. To open applications: set `APPLICATIONS_OPEN=true` (and optionally `APPLICATION_DEADLINE`), redeploy. Review in `/admin/`,
    export approved addresses, build the Merkle root, `setMerkleRoot` (contract owner).

## Remaining risks (honest)

- A bot that plays in real time and reads the screen can still play well; chunked maps only stop offline precomputation.
  Real-time play, Turnstile, one application per address/X account/post, input-rhythm and network signals and,
  above all, manual review make farming costly. The team rejects obvious farms.
- X oEmbed is a free endpoint, not an official verification API; when it fails, applications are flagged for a manual check.
- Ranked runs cannot be paused: they follow server time.

## Production (squeekrunner.app)

- API Worker `squeekrunner-api` on `https://api.squeekrunner.app` (D1 `squeekrunner`, EEUR). Secrets are set; local copies of
  generated values live outside the repository (owner's machine only).
- Site Worker `squeekrunner-site` (static assets) on `https://squeekrunner.app` and `www`. Redeploy:
  ```sh
  VITE_API_BASE=https://api.squeekrunner.app VITE_TURNSTILE_SITEKEY=0x4AAAAAAF4fgEsOIrundoTt npm run build
  printf '*.map\n' > dist/.assetsignore
  npx --prefix server wrangler deploy -c deploy/site/wrangler.jsonc
  ```
  (The Turnstile site key is public.) Applications stay closed (`APPLICATIONS_OPEN=false`) until the owner decides.
