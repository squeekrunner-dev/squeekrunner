# SqueekRunner — Social Media & X (Twitter) Threads Kit

This document provides ready-to-use publication drafts for the project owner. All posts are drafted in a friendly, transparent tone without hype, price speculation, or investment promises. SqueekRunner is an experimental game on Ethereum Sepolia testnet.

Every post is strictly under the 280-character limit (exact character counts are specified in parentheses).

---

## 1. Announcement Threads (3 Variants)

### Variant A: Gameplay & Real Hamster Wheel Focus

#### Post 1/6 (264 chars)
Meet SqueekRunner: an endless runner where your speed is driven by a real hamster running in a real wheel on @Squeekchain.

Double jump over crates, catch lucky golden nuts, and test your reflexes.

Free to play in your browser (no wallet needed):
<SITE_URL>/play/

#### Post 2/6 (277 chars)
How does the wheel shape your run?

SqueekRunner streams live telemetry from the WHEELY9000 sensor:
• 0 RPM = baseline running speed
• Peak RPM (~98.3 RPM) = up to 2.7x speed boost

When the hamster sprints, the world accelerates. When it rests, the speed smoothly glides back.

#### Post 3/6 (241 chars)
Notice a golden nut drop on the track?

Whenever Squeekchain confirms a new block on Ethereum Sepolia testnet, a golden nut spawns!

Catching it awards +150 bonus points and equips a 12-second one-hit shield to survive an obstacle collision.

#### Post 4/6 (257 chars)
Under the hood, SqueekRunner runs a deterministic 60 tick/s physics engine with integer arithmetic and Mulberry32 seeds.

Every jump, obstacle gap, and score is mathematically reproducible.

Dive into our game architecture whitepaper:
<SITE_URL>/whitepaper/

#### Post 5/6 (253 chars)
We are also introducing SqueekRunner Hamsters: 1,000 generative vector NFTs on Sepolia testnet.

100% free mint. Zero gas to enter.

Beat the qualifying score, sign an off-chain message for free, and enter the provably fair raffle:
<SITE_URL>/whitelist/

#### Post 6/6 (251 chars)
Transparency note: SqueekRunner is an independent community project built for the Squeekchain Genesis Code Lane.

Not an official Squeekchain core product. Testnet only, zero monetary value.

Jump onto the track and tell us your high score!
<SITE_URL>

---

### Variant B: Technical Architecture & Provable Fairness Focus

#### Post 1/6 (246 chars)
Can live IoT telemetry power a deterministic arcade game?

We built SqueekRunner: an open-source browser runner paced by Squeekchain's physical hamster wheel, featuring server-verified replays and a zero-gas raffle.

Try it live:
<SITE_URL>/play/

#### Post 2/6 (272 chars)
Telemetry architecture:

A Cloudflare Worker with a Durable Object polls Squeekchain's status API every ~10s and logs an immutable timeline of RPM and block heights to D1 SQLite.

Both the game client and server verifier share the same 5-second delayed broadcast timeline.

#### Post 3/6 (268 chars)
Deterministic 60-tick physics:

Movement runs at 60 fixed ticks/s with integer milli-pixel coordinates and Mulberry32 PRNG.

Raw player inputs (jump ticks) serialize to a compact JSON replay (<1.6 KB/min). The server re-simulates the run step-by-step to verify scores.

#### Post 4/6 (269 chars)
Zero-gas whitelist entry:

Players who beat the qualifying score sign an EIP-4361 (Sign-In with Ethereum) message with their Sepolia wallet.

Nonce, domain, chain ID (11155111), and run duration are verified server-side with viem and Turnstile anti-bot. Zero gas spent.

#### Post 5/6 (257 chars)
Provably fair on-chain raffle:

After entries close, we snapshot addresses into an OpenZeppelin StandardMerkleTree and designate a future Sepolia block number.

The future block hash seeds a public Fisher-Yates shuffle selecting 700 winners for a free mint.

#### Post 6/6 (248 chars)
Read the full code and contracts:

Our smart contract, replay verifier, and whitepaper are all open-source.

SqueekRunner is an independent community project for Squeekchain Genesis. Free testnet experiment only.

Whitepaper:
<SITE_URL>/whitepaper/

---

### Variant C: Community, Art & Free Testnet Mint Focus

#### Post 1/6 (262 chars)
Calling all runners: 1,000 SqueekRunner Hamsters are coming to Ethereum Sepolia testnet!

A free, community-first generative NFT collection celebrating the fastest runners on the wheel.

No paid mints. No token purchases. Zero gas to enter.
<SITE_URL>/whitelist/

#### Post 2/6 (263 chars)
How to get on the allowlist:

1. Play SqueekRunner in your browser (<SITE_URL>/play/)
2. Dodge crates and catch golden nuts from confirmed blocks
3. Beat the announced qualifying score threshold
4. Connect your Sepolia wallet and sign for free to enter the raffle

#### Post 3/6 (265 chars)
The Art: 1,000 unique vector SVGs.

• 990 algorithmic combinations across 8 distinct layers (fur, headwear, eyes, expressions, auras, held items)
• 10 handcrafted 1/1 legendaries commemorating milestone token IDs

Pure vector art rendered cleanly at any resolution.

#### Post 4/6 (257 chars)
Honest token allocation:

Total supply: strictly 1,000 NFTs on Sepolia testnet.
• 700 NFTs (70%): Player Raffle (verified game runners)
• 200 NFTs (20%): Community & X challenges
• 100 NFTs (10%): Team and project treasury

No public sale. Testnet gas only.

#### Post 5/6 (248 chars)
Provably fair and transparent:

Winners are chosen using an unmined future Sepolia block hash and an open-source verification script.

Anyone can run the script and independently verify the exact winning addresses against our published Merkle root.

#### Post 6/6 (236 chars)
SqueekRunner is an independent community build for Squeekchain Genesis Code Lane.

Not an official Squeekchain core team project. Built for fun and experimentation with zero monetary value.

Start practicing your jumps today:
<SITE_URL>

---

## 2. Raffle Launch Thread

#### Post 1/5 (239 chars)
The SqueekRunner Whitelist Raffle portal is officially LIVE!

1,000 SqueekRunner Hamsters on Sepolia testnet. Free mint.

Qualify by mastering the wheel, beating the score threshold, and signing for free.

Enter here:
<SITE_URL>/whitelist/

#### Post 2/5 (255 chars)
Step-by-step entry guide:

1. Open <SITE_URL>/play/ (ranked mode)
2. Dodge crates and catch golden nuts
3. Reach or beat the qualifying score: <THRESHOLD> pts
4. Submit replay & connect your Sepolia wallet
5. Sign a free off-chain SIWE message (zero gas!)

#### Post 3/5 (257 chars)
How we keep it fair:

• Server-side replay simulation (re-runs physics step-by-step)
• Real-time timing check (no instant bot uploads)
• Cloudflare Turnstile anti-bot challenge
• Strictly 1 ticket per wallet address

Only authentic human runs earn a ticket!

#### Post 4/5 (231 chars)
Raffle Timeline:

• Entries open: NOW
• Snapshot deadline: <DEADLINE>
• Target Sepolia block announced: <TARGET_BLOCK_DATE>
• Winners announced & claim open: <MINT_DATE>

Check live entry counts on the portal:
<SITE_URL>/whitelist/

#### Post 5/5 (253 chars)
Reminder: SqueekRunner Hamsters is an experimental testnet collection with zero monetary value.

No payments or tokens are ever accepted. We are an independent community project built for Squeekchain Genesis.

Good luck on the track, runners!
<SITE_URL>

---

## 3. Threshold Announcement Post (Template)

#### Post (268 chars)
QUALIFYING THRESHOLD ANNOUNCED!

After analyzing gameplay telemetry across all wheel speeds, the SqueekRunner raffle threshold is set to:

🎯 <THRESHOLD> POINTS

Any ranked run meeting or beating this score earns a raffle ticket!

Run to qualify:
<SITE_URL>/whitelist/

---

## 4. Target Block & Merkle Root Post (Template)

#### Post (267 chars)
RAFFLE SNAPSHOT FROZEN!

Entries are now closed. Here are the cryptographic draw parameters:

📦 Snapshot SHA-256: <SNAPSHOT_HASH>
🌳 Merkle Root: <MERKLE_ROOT>
🎲 Target Sepolia Block: #<TARGET_BLOCK>

Once block #<TARGET_BLOCK> is mined, its hash picks 700 winners!

---

## 5. Raffle Results Post (Template)

#### Post (254 chars)
THE WINNERS ARE DRAWN!

Sepolia block #<TARGET_BLOCK> has been mined, and the provably fair raffle script has selected 700 winners!

Check if your address won and verify the open-source draw:
<CLAIM_URL>

Free minting is now open on Sepolia testnet! 🐹🎉
