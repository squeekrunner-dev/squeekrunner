# Simulation and replay contract: squeek-1

`core.ts` and `replay.ts` are pure TypeScript/ECMAScript modules. Their only external
dependency is `../config.ts`. They require no Phaser, browser, clocks, timers, network,
Node builtins or ambient randomness. A Worker can bundle them without the game.

## Arithmetic and rules

- 60 Hz matches Arcade's previous nominal rate and limits input latency to one 16.67 ms
  tick while keeping server verification inexpensive. Rendering does not advance rules.
- Positions, vertical velocity, world speed and travel use integer milli-pixels
  (`UNIT=1000`); velocities are per second. Each tick truncates velocity/60 to displacement.
  Gravity adds 30,000 units/s per tick. Gravity is applied before vertical movement.
- The speed ramp and multiplier are quantized before smoothing. The EMA uses literal
  `11834/1000000`, the rounded fixed-step approximation for CONFIG's 1.4 s time constant.
  Signed divisions use `Math.trunc` explicitly; score uses `Math.floor`. No transcendental
  math is evaluated by the simulation. Display distance is `travel/(1000*24)`; score is
  computed from integer travel directly, never from rounded display metres.
- Mulberry32 wraps a uint32 state, including seed zero. Each obstacle consumes four draws
  in order: type, width, height, gap variation (integer milliseconds, inclusive 0..500).
  Gaps round upward to ticks. Visual particles never consume this PRNG.
- Integer intermediates stay below 2^53: the largest ramp product is below 5e12,
  multiplier/EMA products below 2e12, and nut-circle squared distances below 2e12.
  Travel is bounded by 30 minutes at at most 1080 px/s. `imul`/bitwise operations are
  intentional uint32 PRNG/hash arithmetic; ordinary physics does not use int32 wrapping.
- Player sprite is 64x56, hitbox 42x44 at (13,12). Obstacle sprite is 56x68, hitbox 48x64
  at (4,4), scaled with its random display dimensions. Nut circle radius 16 at (2,3) on
  a 36x38 sprite. AABB obstacle tests and squared-distance circle tests ignore artwork
  rotation. Hitboxes use axis-aligned coordinates, rounded down to milli-pixels.
- Jump buffer and coyote eligibility compare tick age * 1000 to configured milliseconds
  * 60. Their effective last eligible ages are 7 ticks (116.67 ms) and 5 ticks (83.33 ms).
  A third input may fire on landing if still buffered. Ground restores both jumps.
- Tick order: apply RPM/reset/spawn input; speed and travel; queued jump; gravity and
  landing/buffer; seeded obstacle spawn and scrolling; obstacle collisions; nut pickup;
  score; increment tick; termination. Obstacles precede nuts, matching the previous
  collider/overlap order. A shield lasts 720 ticks, consumed by one hit; each deflection
  renews the 33-tick impact grace window. Protection is active strictly before its end tick.
- First obstacle arrives after 144 ticks. At most one uncollected nut exists: a new spawn
  replaces it, a chain reset clears it. Collected points and shields survive chain resets.
- End on collision or tick 108000 (30 simulation minutes). The ending tick contributes
  travel/score. Subsequent steps are inert. No wall clock or pause duration is recorded.

The integrator, rounding, collision ordering and seeded distribution are intentionally
fixed. Compared with the old frame-dependent scene, exact jump/contact/spawn times can
differ by a tick and sub-pixel rounding accumulates. High-refresh rendering shows the latest
60 Hz state without interpolation. Existing art, animation, sounds and pooled particles
remain in the rendering layer. Cross-engine golden runs still need real browser/Worker
execution; tests here run in Node/V8 and do not claim Safari/Firefox execution.

## ReplayV1

```ts
{
  v: 1,
  simVersion: 'squeek-1',
  seed: number,                  // uint32; zero is valid
  tickHz: 60,
  inputs: number[],              // jump ticks; several presses between ticks coalesce
  telemetry: { tick: number, rpmMilli: number | null }[],
  nuts: number[],                // confirmed-block nut spawn ticks
  nutResets?: number[],          // installation/height reset: clear old uncollected nut
  endTick: number,               // number of completed ticks, including the ending tick
  clientScore: number,           // untrusted; compared to recomputed integer score
  mode: 'live' | 'demo'
}
```

Tick zero is the first step. Events apply **before** that tick's movement. All streams
are strictly increasing, unique within each stream, and have `0 <= tick < endTick`.
Telemetry starts at tick zero, records only value changes, and holds its last sample.
`null` explicitly means NO DATA, giving the same speed target as RPM zero while preserving
the distinction in the log. Milli-RPM is an integer in [0,1000000]; the adapter caps larger
readings at this bound (both saturate world speed). There are no implicit current-time reads.

`nutResets` is the only optional V1 extension. It is required when a chain reset happens:
omitting it would allow the renderer and verifier to disagree about a remaining nut.
On a shared tick, reset precedes spawn. A reset after a pending spawn clears that pending
spawn; a later spawn in the same tick survives. No chain identifiers or BigInts enter sim.
Other extra fields are rejected, including at telemetry-sample level.

`endTick` must be 1..108000. Each stream has at most `endTick` entries; JSON ingress/CLI
has an 8 MiB byte limit. Sparse arrays, unsafe integers, fractional ticks/RPM, malformed
JSON, wrong version/tick rate, missing/unknown fields, duplicate/out-of-order events and
demo mode are rejected. `simulateReplay` is a low-level **trusted-input** helper;
use `validateReplay` / `parseReplayJSON` and `verifyReplay` at untrusted boundaries.

`verifyReplay(unknown)` returns `{score,distance,endTick,ok,reason}`. An accepted replay
must end naturally at precisely its declared tick and match its recomputed score.
Invalid shape returns zeros with a reason. Valid shape but wrong score/end returns the
actual computed result. Validation and verification do not authenticate stream provenance.
The 8-digit `stateHash` in golden fixtures is FNV-1a over canonical state insertion order,
for regression detection only; it is not a cryptographic digest or a security credential.

## Client and T008 boundary

`RunDriver` accumulates frame time, caps one frame at 50 ms and records each applied tick
once. Pause clears the fractional accumulator/pending jump, advances no simulation time,
and preserves queued chain resets. Each new scene gets a new driver and recorder.
In ranked mode (T008) the server issues the uint32 seed through `POST /v1/session` for
the run, obtained when the player presses Start (`src/net/ranked.ts`). Offline runs
use `crypto.getRandomValues`. Finished replays live in `context.lastReplay`.

Server integration must:

1. Issue, persist and bind a seed/version to an authenticated, expiring, one-use session.
2. Enforce HTTP byte/array/tick/rate limits **before** parsing/executing an untrusted body.
   Benchmark the 108000-tick worst case against the chosen Worker CPU budget.
3. Establish authoritative RPM and confirmed block/reset events independently; do not
   trust `mode`, telemetry, nuts, resets, clientScore, or a client-provided state hash.
4. Specify how server wall-time samples align with gameplay ticks, pauses and dropped
   frame time. V1 deliberately does not attest pause durations; tick alignment needs a
   server policy/session protocol. Run consistency alone cannot prevent bots or replay theft.
5. Pin this sim version and its balance configuration when verifying old sessions. A
   physics/config/PRNG/order change needs a new simVersion and retained old verifier or
   explicit expiry of old sessions. Do not silently regenerate golden expectations.

CLI: `npm run verify-replay -- src/sim/test-data/minute-run.json`. It shares the exact TS
implementation via the existing TypeScript dependency and exits 0 only for accepted live
replays. Golden fixture expected scores/ticks/hashes are in `test-data/expected.json`.

## squeek-5 (2026-11-09): unstoppable

- `unstoppable` turns on when the tick's RPM input is >= `CONFIG.unstoppable.onRpmMilli` (80000) and
  off below `offRpmMilli` (78000); null/no data counts as 0. Evaluated right after the RPM input, before speed.
- While unstoppable an overlapping obstacle is removed with event `smash`; the shield is not spent and the
  run continues. Coins and nuts are unchanged (a missed coin still disqualifies).
- Golden replays below 80 RPM keep identical scores and end ticks; only the state hash changed (new field).
