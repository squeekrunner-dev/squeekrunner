# SqueekRunner — Squeekchain Genesis · Code Lane Submission

## Project Overview

- **Project Name:** SqueekRunner
- **Category:** Games & Game Mods on Live Squeekchain Rounds
- **Target Network:** Ethereum Sepolia Testnet (Chain ID `11155111`)
- **Live Application URL:** `<SITE_URL>` (Game: `<SITE_URL>/play/`, Whitepaper: `<SITE_URL>/whitepaper/`, Whitelist: `<SITE_URL>/whitelist/`)
- **Public GitHub Repository:** `<GITHUB_URL>`
- **Genesis Direct Ownership Status:** Ready for verification (details below)

---

## Elevator Pitch

SqueekRunner is an arcade endless runner where gameplay speed is directly driven by Squeekchain's physical hamster wheel, while newly confirmed Sepolia blocks drop golden nuts and protective shields. Built with deterministic 60-tick physics, a zero-gas Sign-In with Ethereum (EIP-4361) whitelist engine, and an on-chain 1,000-piece SVG NFT collection with a provably fair Merkle raffle.

---

## What is SqueekRunner?

SqueekRunner turns live physical proof-of-work telemetry into an engaging browser-based skill game. Players control an energetic running hamster jumping over crates, catching golden nuts, and chasing high scores.

The game is built with TypeScript, Phaser 3, and Canvas rendering. It requires no wallet, registration, browser extension, or paid tokens to play: anyone can open `<SITE_URL>/play/` on desktop or mobile and run immediately.

---

## How SqueekRunner Truly Uses Squeekchain

SqueekRunner is deeply tied to Squeekchain telemetry across three distinct layers:

### 1. Live Wheel RPM Modulates World Speed
SqueekRunner streams live telemetry from `https://api.squeekchain.com/v1/status`:
- **Speed curve:** Baseline speed rises with distance (290 to 400 px/s over 1,800 game metres). The live wheel RPM applies a linear multiplier: **1.0× at 0 RPM up to 2.7× at 98.316 RPM** (calibrated historically observed peak).
- **Smooth transitions:** Fixed-step exponential smoothing (1.4-second time constant) ensures that telemetry changes gradually accelerate or decelerate the game world rather than jarring the player.
- **Fail-safe playability:** If the hamster is resting (`WHEEL IDLE`, 0 RPM) or the network telemetry is interrupted (`NO DATA`), the world smoothly glides back to balanced baseline speed. The game never breaks or halts.

### 2. Confirmed On-Chain Blocks Drop Golden Nuts
- SqueekRunner tracks confirmed block height increments (`builder.anchor.blockHeight`).
- When Squeekchain anchors a new block to Sepolia, a **Golden Nut** spawns on the runner's track.
- Collecting a golden nut awards **+150 bonus points** and equips a **12-second one-hit shield**, allowing the player to absorb a collision that would otherwise end the run.

### 3. Server-Side Telemetry Timeline for Replay Verification
- To protect competitive gameplay and raffle qualification, SqueekRunner includes a Cloudflare Worker server backed by a D1 SQLite database and a Durable Object (`TelemetryCollector`).
- The Durable Object polls the Squeekchain status API every ~10 seconds and logs a continuous, verified timeline of RPM and block heights.
- Ranked mode broadcasts this timeline to clients with a 5-second buffer. Client replays are re-simulated tick-by-tick against the server's own recorded telemetry, ignoring client-reported scores or wheel claims.

---

## Why SqueekRunner is NOT a Read-Only Dashboard or Thin Wrapper

Genesis Code Lane strictly rejects read-only dashboards, link-hubs, and thin API wrappers. SqueekRunner is the opposite:

1. **Active Gameplay, Not Passive Viewing:** Data is not merely displayed on a chart; it changes physics, timing, and collision hazards in real time.
2. **Deterministic Physics Simulation:** Runs advance at 60 fixed ticks per second using integer milli-pixel coordinates and seeded Mulberry32 pseudo-randomness. Raw inputs (jump ticks) are captured in compact JSON (<1.6 KB per minute).
3. **Server-Side Replay Execution:** The server imports and executes the exact same deterministic simulation engine (`src/sim/replay.ts`) to verify scores. Fake client claims are rejected.
4. **Zero-Gas EIP-4361 (SIWE) Whitelist Portal:** Players who surpass the qualification threshold connect a Sepolia wallet and sign an off-chain EIP-4361 message. Nonces, domains, chains, and run tokens are verified server-side with zero transaction fees for players.
5. **On-Chain Smart Contract & Merkle Tree:** An ERC-721 contract (`SqueekRunnerHamsters.sol`) deployed on Sepolia partitions 900 allowlist spots and 100 reserve spots, using OpenZeppelin StandardMerkleTree for trustless claims.
6. **1,000 Generative SVG Collection:** Complete art pipeline producing 1,000 unique vector NFTs (990 algorithmic combinations across 8 layers + 10 handcrafted 1/1 legendaries) ready for IPFS metadata hosting.

---

## Current Status: What is Already Working

SqueekRunner is fully implemented and tested across all components:

- **Game Client:** Production build ready (`dist/play/`). Touch and keyboard controls, pause/resume, audio, HUD, and demo mode (`/play/?demo=1`).
- **Unit Test Suite:** 18 test files with 131 tests covering physics, speed formulas, block detection, telemetry lifecycle, and replay validation — 100% passing offline.
- **Documentation:** Full game whitepaper at `/whitepaper/` with mathematical formulas and balance tables; whitelist portal at `/whitelist/`.
- **Raffle Server:** Cloudflare Worker with D1 migrations, telemetry collector Durable Object, SIWE verification via `viem`, and Turnstile integration (`server/`).
- **Smart Contract:** Hardhat 2 + Solc 0.8.28 test suite verifying reentrancy protection, double-hashed Merkle proofs, and phase transitions (`contracts/`).
- **Art Generator:** Node.js generative script creating 1,000 valid SVG files and metadata JSONs (`art/collection/`).

---

## Direct Ownership Verification Details

SqueekRunner uses the **Genesis Direct Verification** pathway. The required hooks are pre-configured in the codebase:

1. **HTML Page Tag Placeholder:**
   The `<head>` section of `index.html` contains the dedicated tag marker:
   ```html
   <!-- GENESIS-OWNERSHIP-TAG: insert issued tag -->
   ```
   *Action upon receiving issued tag:* The owner will replace this comment with the issued `<meta>` or `<script>` tag and redeploy the static site.

2. **Repository README Placeholder:**
   The project `README.md` contains the dedicated repository marker:
   ```markdown
   <!-- GENESIS-OWNERSHIP-README: insert issued repository line -->
   ```
   *Action upon receiving issued string:* The owner will paste the exact challenge string into `README.md` and commit to the public GitHub repository.

3. **Domain DNS Challenge:**
   The owner will add the issued DNS TXT record to the domain's DNS management console (e.g. Cloudflare DNS) and maintain it for daily re-verification.

---

## Transparency & Disclaimer

- **Third-Party Project:** SqueekRunner is an independent community project developed for the Squeekchain Genesis Code Lane. It is not an official product of Squeekchain, nor is it created, operated, or endorsed by the Squeekchain core team.
- **Zero Financial Promises:** SqueekRunner and SqueekRunner Hamsters are free educational experiments deployed on Ethereum Sepolia testnet. Tokens and NFTs hold zero monetary value, offer no financial returns, and require no payments.
