# SqueekRunner — Whitelist Application & Review Operational Runbook

This runbook guides the project team step-by-step through operating the SqueekRunner Hamsters whitelist application review process and updating the Merkle allowlist on Ethereum Sepolia.

This is an application process with manual team review, not a raffle.

---

## Architecture & Responsibilities

- **Collection:** 1,000 NFTs on Sepolia (`contracts/src/SqueekRunnerHamsters.sol`).
- **Allocation:**
  - 700 Allowlist spots (70%): Player Whitelist Applications from server-verified game runs.
  - 200 Allowlist spots (20%): Community challenges and Twitter/X giveaways.
  - 100 Reserve spots (10%): Team and project treasury (`ownerMint`).
- **Contract Boundary:** The contract strictly enforces **900 allowlist / 100 reserve**.
- **Review Authority:** The team reviews applications against published criteria to prevent bot and Sybil farms.

---

## Phase 1: Pre-Launch Readiness

Before opening applications, ensure telemetry, dynamic map chunk streaming, and ranked replay verification are operational:

### Checklist Before Phase 1:
- [ ] Cloudflare Worker deployed with `APPLICATIONS_OPEN=false`.
- [ ] Durable Object `TelemetryCollector` actively recording Squeekchain RPM and blocks.
- [ ] Game client delivers chunked map segments progressively in ranked mode.
- [ ] Qualification rules active: score ≥ 100,000 AND 10/10 coins in the first 10,000 m.
- [ ] Frontend live on Cloudflare Pages connected to the Worker (`VITE_API_BASE`).

---

## Phase 2: Opening Whitelist Applications

Enable application submissions so runners completing a qualified run can submit their Sepolia address and X post.

### Checklist Before Phase 2:
- [ ] Set `APPLICATIONS_OPEN=true` in Worker environment variables.
- [ ] Set `APPLICATION_DEADLINE` (ISO-8601 UTC timestamp).
- [ ] Verify Turnstile keys and X oEmbed lookup worker.

### Procedure:
1. In `server/wrangler.toml` (or via Cloudflare Dashboard Environment Variables), configure:
   ```toml
   [vars]
   APPLICATIONS_OPEN = "true"
   APPLICATION_DEADLINE = "2026-11-15T18:00:00Z"
   ```
2. Redeploy the Worker:
   ```bash
   cd server
   npx wrangler deploy
   ```
3. Verify public status:
   ```bash
   curl https://<WORKER_URL>/v1/whitelist/status
   ```
   Confirm `applicationsOpen: true`.
4. Announce that applications are open on X using the templates in `docs/launch/x-threads.md`.

---

## Phase 3: Application Review in Admin Panel

As runners submit applications, the team reviews them in the admin dashboard.

### Review Signals in Admin Panel:
1. **Gameplay & Replay Integrity:**
   - Server-verified score ≥ 100,000.
   - All 10 / 10 coins collected (within the first 10,000 m).
   - Replay physics re-simulated cleanly at 60 Hz integer physics.
   - Run duration matches real-world elapsed time (no speedhacks).
   - Input rhythm: human-like jump intervals, variance in press durations (not rigid robotic tick scripts).
   - Number of attempts and session history.
2. **X Account Verification:**
   - oEmbed status: post exists, belongs to the stated handle, contains the unique application code and score.
   - Account age and organic activity (not an empty burner created yesterday).
3. **On-Chain Address History:**
   - Ethereum Mainnet and Sepolia activity history (not a blank wallet generated just for the drop).
   - Bonus signal: Squeekchain ecosystem activity (Squeeks, $SQK balance).
4. **Network & Cluster Analysis:**
   - IP hash cluster detection (multiple applications sharing identical IP salt hashes or proxy subnets).
   - Disqualify obvious bot clusters and automated farm rings.

### Published Review Criteria (strictly applied):
- Qualified: server-verified run of 100,000+ points with all 10 coins.
- A real, active X account that published the application post.
- The Sepolia address has on-chain history (not a fresh empty wallet).
- Plus: activity on Squeekchain (Squeeks, $SQK).
- Obvious farms are rejected (clusters of addresses, accounts or networks; scripted input).
- The team's decision is final.

### Review Action:
- Mark each application as **Approved** or **Rejected** in the admin dashboard.

---

## Phase 4: Closing Applications & Exporting Approved List

When `APPLICATION_DEADLINE` passes, the server rejects new application submissions.

### Procedure:
1. Export approved player applications using the secure admin token:
   ```bash
   curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
     "https://<WORKER_URL>/v1/admin/export?format=csv&status=approved" \
     -o approved-players.csv
   ```
2. Validate the export file:
   - Format must be `address,allowance`.
   - Each approved address has allowance `1`.
   - Total approved player count must be strictly ≤ 700.
   - Ensure all addresses are valid 0x-prefixed 40-character hex strings.

---

## Phase 5: Merging Lists & Compiling Merkle Tree

Combine approved players and Twitter/community winners into the final allowlist.

### Procedure:
1. Prepare the 200 community winners list (`twitter-winners.csv`).
2. Merge `approved-players.csv` (≤ 700) and `twitter-winners.csv` (≤ 200) into `allowlist.csv`:
   - Deduplicate overlapping addresses, setting total allowance = 1 (or desired sum ≤ 900).
   - Verify that the total sum of allowances in `allowlist.csv` is strictly ≤ 900.
3. In the `contracts/` directory, generate the Merkle tree and proofs:
   ```bash
   cd contracts
   npm run merkle -- ../allowlist.csv generated/allowlist.json
   ```
4. Record the printed Merkle root hash: `<MERKLE_ROOT>`.

---

## Phase 6: Contract Deployment & Opening Mint

Execute on-chain transactions on Ethereum Sepolia.

### Procedure:
1. If the contract is not yet deployed, deploy it:
   ```bash
   cd contracts
   npm run deploy:sepolia
   ```
2. As the contract owner, register the Merkle root:
   - Call `setMerkleRoot(<MERKLE_ROOT>)`.
3. As the contract owner, enable allowlist minting:
   - Call `setPhase(1)` (Phase `Allowlist`).
4. (Optional) Distribute team and treasury reserve:
   - Call `ownerMint(address to, uint256 qty)` (up to 100 NFTs).
5. Approved applicants can now claim their free mint on Sepolia testnet!

---

## Phase 7: Mint Close & Metadata Freeze

When the minting period concludes:
1. Call `setPhase(0)` (Phase `Closed`).
2. Verify token artwork and JSON metadata on IPFS.
3. Call `setBaseURI("ipfs://<METADATA_CID>/")`.
4. (Optional, irreversible) Call `freezeMetadata()` to permanently lock collection metadata.
