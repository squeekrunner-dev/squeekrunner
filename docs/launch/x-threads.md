# SqueekRunner — Social Media & X (Twitter) Threads Kit

This document provides ready-to-use publication drafts for the project owner. All posts are drafted in a friendly, transparent tone without hype, price speculation, or financial promises. SqueekRunner is an experimental game on Ethereum Sepolia testnet.

This is an application process with manual team review, not a raffle.

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

#### Post 5/6 (241 chars)
We are also introducing SqueekRunner Hamsters: 1,000 generative vector NFTs on Sepolia testnet.

100% free mint. Zero gas to apply.

Score 100k+ with 10/10 coins in ranked mode to apply for manual review (not a raffle):
<SITE_URL>/whitelist/

#### Post 6/6 (248 chars)
Transparency note: SqueekRunner is an independent community project built for the Squeekchain Genesis Code Lane.

Not an official Squeekchain core product. Today: free testnet collectibles.

Jump onto the track and tell us your high score!
<SITE_URL>

---

### Variant B: Technical Architecture & Manual Review Focus

#### Post 1/6 (249 chars)
Can live IoT telemetry power a deterministic arcade game?

We built SqueekRunner: an open-source browser runner paced by Squeekchain's physical hamster wheel, featuring chunked map delivery and manual whitelist review.

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

#### Post 4/6 (240 chars)
Gasless application (no wallet connect):

After a qualified run (100k+ points & 10/10 coins), paste your Sepolia address manually and link an X verification post.

No wallet connection, no cryptographic signatures, and zero gas spent.

#### Post 5/6 (249 chars)
Manual team review (not a raffle):

The team manually reviews applications against published criteria (run proof, active X post, on-chain address history).

No random draw: honest protection against bot farms. Approved wallets get a free mint.

#### Post 6/6 (248 chars)
Read the full code and contracts:

Our smart contract, replay verifier, and whitepaper are all open-source.

SqueekRunner is an independent community project for Squeekchain Genesis. Free testnet experiment only.

Whitepaper:
<SITE_URL>/whitepaper/

---

### Variant C: Community, Art & Free Testnet Mint Focus

#### Post 1/6 (266 chars)
Calling all runners: 1,000 SqueekRunner Hamsters are coming to Ethereum Sepolia testnet!

A free, community-first generative NFT collection celebrating the fastest runners on the wheel.

No paid mints. Zero gas to enter. Planned roadmap ahead.
<SITE_URL>/whitelist/

#### Post 2/6 (272 chars)
How to get on the allowlist:

1. Play SqueekRunner ranked mode (<SITE_URL>/play/)
2. Score 100,000+ points & catch 10/10 coins in first 10,000 m
3. Paste your Sepolia address (no wallet connection) & post on X
4. Team reviews applications manually (not a raffle)

#### Post 3/6 (265 chars)
The Art: 1,000 unique vector SVGs.

• 990 algorithmic combinations across 8 distinct layers (fur, headwear, eyes, expressions, auras, held items)
• 10 handcrafted 1/1 legendaries commemorating milestone token IDs

Pure vector art rendered cleanly at any resolution.

#### Post 4/6 (275 chars)
Honest token allocation:

Total supply: strictly 1,000 NFTs on Sepolia testnet.
• 700 NFTs (70%): Game Whitelist (applications with manual review)
• 200 NFTs (20%): Community & X challenges
• 100 NFTs (10%): Team and project treasury

No public sale. Testnet gas only.

#### Post 5/6 (254 chars)
Transparent manual review (not a raffle):

Applications are vetted by human review against published rules: verified 100k+ run with 10/10 coins, real X account, and on-chain history.

Obvious bot farms are rejected; team decision is final.

#### Post 6/6 (226 chars)
SqueekRunner is an independent community build for Squeekchain Genesis Code Lane.

Not an official Squeekchain core team project. Free testnet collectibles today; roadmap planned.

Start practicing your jumps today:
<SITE_URL>

---

## 2. Whitelist Launch Thread

#### Post 1/5 (254 chars)
The SqueekRunner Whitelist Application portal is officially LIVE!

1,000 SqueekRunner Hamsters on Sepolia testnet. Free mint.

Score 100,000+ points and catch 10/10 coins to apply (manual review, not a raffle).

Apply here:
<SITE_URL>/whitelist/

#### Post 2/5 (249 chars)
Step-by-step application guide:

1. Open <SITE_URL>/play/ (ranked mode)
2. Score 100,000+ pts & collect 10/10 coins
3. Click Apply within 24 hours
4. Paste your Sepolia address (no wallet connect!)
5. Post on X with your code & link your tweet

#### Post 3/5 (266 chars)
How we keep it fair:

• Map delivered in chunks (no offline solver)
• Server-side 60 Hz physics replay check
• Real-time timing check & Turnstile
• Input rhythm analysis & IP clusters
• Manual review of on-chain wallet history

Not a raffle: bots get pruned!

#### Post 4/5 (264 chars)
Application Timeline:

• Applications open: NOW
• Submission window: 24h after qualifying run
• Application deadline: <DEADLINE>
• Review period: ongoing
• Approved allowlist published: <MINT_DATE>

Check requirements on the portal:
<SITE_URL>/whitelist/

#### Post 5/5 (237 chars)
Reminder: SqueekRunner Hamsters is an experimental testnet collection on Sepolia.

No payments are needed to apply or mint. Planned coin & roadmap ahead. We are an independent community build.

Good luck on the track, runners!
<SITE_URL>

---

## 3. Qualification Threshold Announcement Post (Template)

#### Post (246 chars)
QUALIFYING CRITERIA ANNOUNCED!

To apply for the SqueekRunner Hamsters whitelist (not a raffle), runners must achieve:

🎯 100,000+ POINTS
🪙 10 / 10 COINS (in first 10,000 m)

In a server-verified ranked run.

Run to qualify:
<SITE_URL>/whitelist/

---

## 4. Application Deadline Post (Template)

#### Post (269 chars)
WHITELIST APPLICATIONS CLOSED!

Submissions are now closed. The team is completing manual review of all applications against published criteria.

📦 Total submissions: <SUBMISSION_COUNT>

Approved addresses will be compiled into the Merkle tree shortly! (not a raffle)

---

## 5. Approved Allowlist Results Post (Template)

#### Post (276 chars)
APPROVED ALLOWLIST IS LIVE!

Manual review of all whitelist applications is complete (this was an application with manual review, not a raffle)!

🌳 Merkle Root: <MERKLE_ROOT>

Check if your address was approved:
<CLAIM_URL>

Free minting is now open on Sepolia testnet! 🐹🎉
