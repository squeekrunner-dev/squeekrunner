# SqueekRunner

A free, client-only endless runner paced by Squeekchain's real hamster wheel.
Double jump over crates, travel farther, and catch golden nuts dropped by new
**confirmed Squeek blocks**. No wallet, backend, API key, or external art required.

## Play

The site has three static pages: `/` is the landing page with live wheel telemetry,
`/play/` is the game, and `/whitepaper/` is SqueekRunner's own whitepaper (in English).
The landing loads no Phaser bundle; the whitepaper is readable without JavaScript.

- **Space / Up arrow / click / tap:** start, then jump. Press again in the air for a double jump.
- **P / Escape:** pause or resume. Hiding the tab pauses the run; tap or press Space to resume.
- **After a collision:** Space / Up / one tap restarts immediately.
- **Golden nut:** +150 points and a one-hit shield for 12 seconds.
- Score is distance (10 points per metre) plus collected bonuses. Metres here are
  **game-world distance**, not the hamster's measured real-world distance.
- Landscape is recommended on phones; the 960 × 540 canvas scales to fit the viewport.

## Run locally

Use Node **22.12+ in the 22.x line, 24.x, or 26+** (tested with 24.11.1).

```sh
npm ci
npm run dev          # http://127.0.0.1:5173/
npm run typecheck
npm test             # Vitest; deterministic tests, no live HTTP dependency
npm run build        # strict typecheck + production output in dist/
npm run preview
```

Open **http://127.0.0.1:5173/play/** to play with live data.
For a simulated demonstration, open **http://127.0.0.1:5173/play/?demo=1**.
The large **DEMO** badge stays visible. Simulated RPM cycles from 0 to 98.316 and
blocks increment every 16 seconds. No Squeekchain request is made in demo mode.
Remove the query parameter to return to live data. Demo and live records are separate.

Vite 8 and Vitest 5 use the existing TypeScript/Phaser stack. Native `.mjs` config
loading, preserved package paths and Vitest's thread pool avoid subprocess pipe
and Windows network-drive probes in restricted desktop environments. No custom
compiler, patched dependency, global installation, or additional direct dependency
is required. The server binds only to 127.0.0.1. Production is static output.

## Wheel data and gameplay

| HUD mode | Meaning | Game behaviour |
|---|---|---|
| **LIVE** (green) | Fresh, healthy telemetry with RPM > 0 | Wheel RPM smoothly accelerates the world |
| **WHEEL IDLE** (blue) | Fresh, healthy telemetry with RPM 0 | Normal baseline running speed |
| **NO DATA** (coral) | Stale/missing/faulted/unavailable/invalid data, HTTP failure or expired read | Speed smoothly returns to baseline; still playable |

These labels describe telemetry and the wheel; they do **not** claim the hamster is asleep.
The instantaneous numeric RPM is shown separately from the smoothed world multiplier.

`GET https://api.squeekchain.com/v1/status` uses no query parameters and
`credentials: "omit"`. Reads are scheduled 1.5 seconds after the previous read,
never overlapped. Requests timeout after 8 seconds. Errors use exponential backoff
(up to 60 seconds); a longer `Retry-After` is honored, including after tab visibility
changes. Polling pauses while the document is hidden. A successful HTTP read expires
after 12 seconds, and device timestamps/freshness are checked independently.
Stopping the source cancels both polling and request deadlines. Destroying the game
removes its page lifecycle listeners; restoring a cached page resumes an existing game.
Scene subscriptions and input/visibility handlers are disposed on either shutdown or
direct destruction, without retaining cleanup callbacks across run restarts.

The parser validates the fields the game consumes and rejects invalid schema versions,
missing fields, unknown enums, bad timestamps, negative/fractional milli-RPM and invalid
uint64 heights. Additive, unrelated fields are tolerated. RPM = `measurement.rpmMilli / 1000`.

### Speed and difficulty

All balance values live in [`src/config.ts`](src/config.ts):

- Baseline speed rises from 290 to 400 px/s over 1,800 game metres.
- RPM multiplier is linear: **1× at 0 RPM → 2.7× at 98.316 RPM**, clamped above that.
- Target world speed = baseline(distance) × RPM multiplier. Fixed-step smoothing approximates
  a 1.4-second time constant; changing telemetry cannot abruptly change the world's speed.
- Obstacles start after 2.4 seconds, with intervals decreasing from 1.9 to 1.15 seconds
  over 1,400 metres, plus 0–0.5 seconds of variation. Time-based spacing preserves reaction
  time as speed rises. Crates are 30–56 px wide and 38–68 px high.
- Double jump: gravity 1,800 px/s², initial jump −630 px/s, air jump −550 px/s,
  120 ms input buffer and 90 ms coyote time.

### Deterministic simulation and replays

Gameplay runs at **60 ticks/second**, with integer milli-pixel positions/velocities and
Mulberry32 randomness from a uint32 seed. Phaser draws the latest state and supplies effects;
it no longer runs Arcade gameplay physics. Inputs take effect on the next simulation tick,
so timing is quantized to 16.67 ms. Obstacle gaps round up to ticks; smoothing uses the fixed
coefficient `11834 / 1000000`. Balance and original texture hitboxes are preserved.
Pausing freezes simulation time. Frame stalls above 50 ms discard excess wall time; runs
finish on collision or at a 30-minute simulation limit. This may affect comparisons to old
local scores, which remain stored as before.

Each finished run is retained in `GameContext.lastReplay`. Open `/play/?debug=1` and press
**D on the Game Over screen** to download its compact JSON (`?demo=1&debug=1` also records,
but demo replays are ineligible for verification). Seeds currently come from
`crypto.getRandomValues`; a future session service can inject `GameContext.seedProvider`.
No replay is uploaded anywhere.

```sh
npm run verify-replay -- src/sim/test-data/minute-run.json
```

The CLI prints `{score,distance,endTick,ok,reason}` and exits nonzero on rejection. Its small
Node loader uses the existing TypeScript dependency to execute exactly the same source as
the game; no generated simulation copy is maintained. Server consumers can import
`verifyReplay` from `src/sim/replay.ts` directly. See [the replay contract](src/sim/README.md)
for field limits, tick ordering, versioning, arithmetic, and T008 integration requirements.
Four golden fixtures pin final state hashes; the 61.3-second example is **1,539 bytes** as
compact JSON. Size depends on input and telemetry changes, not rendered frames.

Verification proves consistency with the supplied streams, **not their authenticity**.
T008 must bind the seed to a server session and independently establish RPM, confirmed-block
events and chain resets. Client-supplied telemetry, nuts or a `live` label are not trusted
eligibility evidence. This remains a client-only game with local records.

### Confirmed blocks and records

Only increases of **`builder.anchor.blockHeight`** produce a golden nut and the
`Squeek block #N!` notice. The first valid height establishes a baseline without a
bonus. A jump of many blocks produces **one** bonus; an installation change or height
regression resets the baseline. Heights are `bigint`, never floating point.
Resets also remove an uncollected nut from the previous chain/baseline.
`builder.projected.blockHeight` is only a visibly **provisional** HUD hint.
In NO DATA mode, a retained confirmed height is labeled as last known; provisional
hints are hidden. A missing height is explicitly labeled as awaiting confirmation.
Confirmed settlement is batched and can be quiet for long periods; demo makes the
mechanic easy to demonstrate. At most one uncollected block nut is present at a time.
Menu, pause and game-over periods don't accumulate rewards for the next run.
The first response after resuming a pause establishes a baseline without a bonus;
expired cached data cannot seed a new run. Collected points/shields are not rolled back.

Best scores persist in localStorage, globally and per `(installationId, starting block)`.
If the start height is unknown, the first confirmed height seen during play is pinned.
If none arrives, the score is global only. Later block changes don't reassign the run.
The latest 100 block records are retained. Storage reads, parsing and writes are guarded;
if storage is blocked or full, in-memory records still work. This is a local, editable
scoreboard, **not** an authenticated online or onchain leaderboard.

## Code map

- `src/chain/`: typed source interface, live polling, demo generator, parser, freshness
  mapping, BigInt block detector; none imports Phaser.
- `index.html`, `src/site/`: landing, shared responsive light/dark styles, and a small
  live widget reusing LiveSource. A separate UI timer updates NO DATA on failures/expiry;
  both polling and that timer pause when hidden and are restored after page-cache return.
- `play/index.html`: existing game entry via `src/main.ts`, with a link back to the site.
- `whitepaper/index.html`: static game whitepaper, anchor navigation, inline SVG data
  flow, and balance table verified against CONFIG by a unit test.
- `public/site/favicon.svg`: original site mark, separate from game asset paths.
- `src/logic/`: speed/spacing and resilient records, independent of Phaser.
- `src/sim/`: pure fixed-step physics, seeded spawns, collision/bonus rules, replay validation
  and verification, plus golden fixtures; no browser or Phaser dependency.
- `src/game/`: Boot → Run → GameOver, frame accumulator, input recording, art, effects and HUD.
- `src/game/textures.ts`: all texture keys and generated Graphics textures. Replace the
  generation in Boot with assets under the same keys to swap the artwork.
- `src/chain/test-data/status-recorded.json`: public HTTP response captured on
  2026-11-07 at 21:33 UTC, with URL/time/status/CORS metadata; unrelated API fields omitted.
  Its test uses the capture time so it never becomes flaky as the fixture ages.

Unit tests cover malformed/stale/faulted/missing data, baseline/+1/+N/regression/installation
resets, heights beyond safe integers, provisional-only changes, speed/clamping/smoothing,
record persistence and storage failures, polling/backoff/Retry-After/visibility/timeout,
source restarts, cancelled responses, subscription disposal, page-cache lifecycle,
and the simulated source. They also parse the independently captured real API response.

## Scope and references

The MVP uses generated 2D art, Canvas rendering and no audio. There is no paid reward,
token claim, wallet connection, server, online leaderboard or transaction submission.
A golden nut is a game bonus, **not SQK**. Live telemetry can be unavailable; the game
continues at baseline. Public reads do not guarantee continuous device updates or
instant settlement. The observed 98.316 RPM peak is a balance calibration, not a
claim about the animal's physical maximum.

- [Official API contract](https://docs.squeekchain.com/developers/api/)
- [Current Sepolia deployment](https://docs.squeekchain.com/assets/deployments/sepolia.json)
- [Official whitepaper](https://docs.squeekchain.com/whitepaper/)

Validated against installation `sepolia-core-sepolia-20261103`, Sepolia chain ID 11155111,
Core `0xFD6C166D4B8E2962E65746a13e5a0797CD4dE0c4`. Installation changes are re-baselined.

## Static hosting and Genesis ownership

`npm run build` emits `dist/index.html`, `dist/play/index.html` and
`dist/whitepaper/index.html`. Deploy the entire `dist/` directory together. Vite uses
three HTML inputs and `base: './'`; assets and navigation are relative, so mounting at
`/squeekrunner/` also works. The host must serve directory index files and redirect
directory URLs without a trailing slash (e.g. `/play` → `/play/`). No SPA fallback is
required. Local production check: `npm run preview` (default port 4173).

With preview running, `node scripts/check-site.mjs` checks the three pages, their links,
anchors and assets, both at the root and under `/nested/squeekrunner/`. It also checks
text contrast in both palettes. Add `--live` to execute the production landing bundle
against the real API with a minimal Node DOM port and verify its rendered values and
CORS response header. This optional live check requires network access and is **not**
a browser/CORS-enforcement or visual layout test; `npm test` remains fully offline.

The site follows the system light/dark preference, includes keyboard focus and skip
links, and respects reduced motion. It uses local SVG art and system fonts; no CDN,
analytics or tracker is loaded. Open Graph titles/descriptions/types are included;
canonical/og:url and a social preview image can be finalized once the public origin
is assigned. No production domain or repository URL is invented.

Genesis Direct verification is **pending**, not claimed as complete. The verified
project instructions require the issued DNS record on the chosen domain, the issued
page tag on the live site, and the issued repository line in the public GitHub README.
The landing head contains the exact placeholder:

```html
<!-- GENESIS-OWNERSHIP-TAG: insert issued tag -->
```

<!-- GENESIS-OWNERSHIP-README: insert issued repository line -->

Replace that README comment with the issued repository line when available. Add the
issued DNS record through the domain owner, publish the page tag, and then use Verify.
Keep the DNS record: Genesis checks it again. Until the repository URL is known, site
GitHub links intentionally lead to `#github`, a visible explanation of the placeholder.
