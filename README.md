# SqueekRunner

A free, client-only endless runner paced by Squeekchain's real hamster wheel.
Double jump over crates, travel farther, and catch golden nuts dropped by new
**confirmed Squeek blocks**. No wallet, backend, API key, or external art required.

## Play

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
npm install
npm run dev          # http://127.0.0.1:5173/
npm run typecheck
npm test             # Vitest; deterministic tests, no live HTTP dependency
npm run build        # strict typecheck + production output in dist/
npm run preview
```

For a simulated demonstration, open **http://127.0.0.1:5173/?demo=1**.
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
- Target world speed = baseline(distance) × RPM multiplier. Exponential smoothing has a
  1.4-second time constant; changing telemetry cannot abruptly change the world's speed.
- Obstacles start after 2.4 seconds, with intervals decreasing from 1.9 to 1.15 seconds
  over 1,400 metres, plus 0–0.5 seconds of variation. Time-based spacing preserves reaction
  time as speed rises. Crates are 30–56 px wide and 38–68 px high.
- Double jump: gravity 1,800 px/s², initial jump −630 px/s, air jump −550 px/s,
  120 ms input buffer and 90 ms coyote time.

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
- `src/logic/`: speed/spacing and resilient records, independent of Phaser.
- `src/game/`: Boot → Run → GameOver, input, collisions, collectibles and HUD.
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
