# SqueekRunner — Whitelist Raffle Operational Runbook

This runbook guides the project owner step-by-step through running the SqueekRunner Hamsters whitelist raffle and executing the provably fair draw on Ethereum Sepolia.

---

## Architecture & Responsibilities

- **Collection:** 1,000 NFTs on Sepolia (`contracts/src/SqueekRunnerHamsters.sol`).
- **Allocation:**
  - 700 Allowlist spots (70%): Player Raffle from verified game runs.
  - 200 Allowlist spots (20%): Community challenges and Twitter giveaways.
  - 100 Reserve spots (10%): Team and project treasury (`ownerMint`).
- **Contract Boundary:** The contract strictly enforces **900 allowlist / 100 reserve**.
- **Provable Fairness:** Uses an unmined future Ethereum Sepolia block hash as the random seed for a deterministic Fisher-Yates draw across all verified entry tickets.

---

## Phase 1: Gathering Gameplay Statistics

Before opening whitelist entries, the server collects telemetry and unverified gameplay statistics to understand score distributions across different wheel speeds (0 RPM to ~98.3 RPM).

### Checklist Before Phase 1:
- [ ] Cloudflare Worker is deployed on Workers Paid with `ENTRIES_OPEN=false` and `THRESHOLD=""`.
- [ ] Durable Object `TelemetryCollector` is actively recording Squeekchain RPM and blocks.
- [ ] Site frontend is live on Cloudflare Pages connected to the Worker (`VITE_API_BASE`).

### Procedure:
1. Allow community members to play ranked runs freely for several hours or days.
2. Query the public statistics endpoint:
   ```bash
   curl https://<WORKER_URL>/v1/stats
   ```
3. Inspect the returned JSON payload:
   - `totalRuns`: total number of verified simulation runs completed.
   - `percentiles`: score distribution (`p50`, `p75`, `p90`, `p95`, `p99`).
   - `histogram`: distribution of scores across buckets.

---

## Phase 2: Calibrating the Qualification Threshold

Select a score threshold `<THRESHOLD>` that represents genuine player skill without being impossibly punitive.

### Selection Guideline:
- Aim for approximately the **75th to 85th percentile** (`p75`–`p85`) of authentic human runs.
- The score should require surviving at least 1–2 minutes of running, dodging crates, and catching golden nuts.
- Record the chosen integer value: `THRESHOLD = <VALUE>` (e.g. `1200`).

---

## Phase 3: Opening Raffle Entries

Enable whitelist registration on the server so players beating the threshold can submit an EIP-4361 (SIWE) message.

### Checklist Before Phase 3:
- [ ] Chosen `<THRESHOLD>` is decided and verified.
- [ ] Set `ENTRY_DEADLINE` (e.g. 72 hours from announcement, ISO-8601 UTC).
- [ ] Set `SNAPSHOT_AT` (same timestamp as deadline).
- [ ] Turnstile widget keys are verified and working.

### Procedure:
1. In `server/wrangler.toml` (or via Cloudflare Dashboard Environment Variables), configure:
   ```toml
   [vars]
   THRESHOLD = "<THRESHOLD>"
   ENTRIES_OPEN = "true"
   ENTRY_DEADLINE = "2026-11-12T18:00:00Z"
   SNAPSHOT_AT = "2026-11-12T18:00:00Z"
   ```
2. Redeploy the Worker:
   ```bash
   cd server
   npx wrangler deploy
   ```
3. Verify public status:
   ```bash
   curl https://<WORKER_URL>/v1/raffle/status
   ```
   Confirm `entriesOpen: true` and `threshold: <THRESHOLD>`.
4. Announce entry opening on X/Twitter using the templates in `docs/launch/x-threads.md`.

---

## Phase 4: Monitoring Entry Submissions

During the active entry window:
1. Periodically check entry numbers and server health:
   ```bash
   curl https://<WORKER_URL>/v1/raffle/status
   ```
2. Check Cloudflare Dashboard for rate-limiting blocks or Turnstile anomalies.
3. Address community questions using `docs/launch/faq-short.md`.

---

## Phase 5: Closing Entries & Exporting Data

When `ENTRY_DEADLINE` passes, the server automatically rejects new entries (`POST /v1/entry`).

### Checklist Before Phase 5:
- [ ] Deadline timestamp has arrived.
- [ ] `curl https://<WORKER_URL>/v1/raffle/status` reports entries closed.

### Procedure:
1. Export all qualified raffle entries using the secure admin token:
   ```bash
   curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
     "https://<WORKER_URL>/v1/admin/export?format=csv" \
     -o allowlist-raffle-raw.csv
   ```
2. Validate the export file:
   - Format must be `address,allowance`.
   - Each raffle ticket has allowance `1`.
   - Ensure all addresses are valid 0x-prefixed 40-character hex strings.
3. Calculate the SHA-256 hash of `allowlist-raffle-raw.csv`:
   ```bash
   # Linux / macOS:
   shasum -a 256 allowlist-raffle-raw.csv
   # Windows PowerShell:
   Get-FileHash -Algorithm SHA256 allowlist-raffle-raw.csv
   ```
   Save this hash as `<SNAPSHOT_HASH>`.

---

## Phase 6: Designating the Future Target Block & Publishing Snapshot

To achieve cryptographic provable fairness, designate an Ethereum Sepolia block height that has **not yet been mined**.

### Procedure:
1. Check current Sepolia block height on a block explorer (e.g. Etherscan Sepolia).
2. Choose a target block number `<TARGET_BLOCK>` approximately **150 to 300 blocks into the future** (about 30 to 60 minutes later at ~12s per block).
3. Create the commitment (in `contracts/`):
   ```bash
   npm run raffle -- commit allowlist-raffle-raw.csv <TARGET_BLOCK> raffle-commit.json
   ```
   `raffle-commit.json` contains the entry count, the entries' Merkle root (`<SNAPSHOT_HASH>`), the target block and the algorithm.
4. Commit `allowlist-raffle-raw.csv` and `raffle-commit.json` to the public repository, then publish an announcement post immediately on X/Twitter (using the template in `docs/launch/x-threads.md`):
   - Include `<SNAPSHOT_HASH>` (the `entriesRoot` from `raffle-commit.json`).
   - Include designated target Sepolia block number: `#<TARGET_BLOCK>`.
   - Link the public `allowlist-raffle-raw.csv` and `raffle-commit.json` files.

Nobody (including the team) can predict the block hash of an unmined block.

---

## Phase 7: Executing the Provably Fair Draw

Once Sepolia block `#<TARGET_BLOCK>` is confirmed:

### Checklist Before Phase 7:
- [ ] Sepolia block `#<TARGET_BLOCK>` is mined and confirmed with >10 block confirmations.
- [ ] Retrieve the exact block hash from a verified Sepolia RPC or explorer (e.g. `0x3a1b...`).

### Procedure:
1. Execute the deterministic raffle selection script (in `contracts/`). Pass the block hash from an explorer, or `rpc` with `SEPOLIA_RPC_URL` in `contracts/.env` (the script then refuses a block that is not finalized yet):
   ```bash
   npm run raffle -- draw allowlist-raffle-raw.csv raffle-commit.json <SEPOLIA_BLOCK_HASH|rpc> raffle-result.json
   ```
   This writes `raffle-result.json` and `raffle-result.winners.csv`. Publish both, together with the block hash.
2. The script runs an unbiased partial Fisher-Yates shuffle seeded with `keccak256(blockHash, entriesRoot, counter)` and selects 700 winning addresses. Anyone can check it:
   ```bash
   npm run raffle -- verify allowlist-raffle-raw.csv raffle-commit.json <SEPOLIA_BLOCK_HASH> raffle-result.json
   ```
3. If total qualified entries are ≤ 700, all qualified entrants win automatically.
4. Prepare the 200 community winners list (`community-winners.csv`).
5. Merge the 700 raffle winners and 200 community winners into `allowlist-final.csv`:
   - Combine addresses and resolve any duplicates by setting allowance = 1 (or desired sum ≤ 900).
   - Ensure the total sum of allowances in `allowlist-final.csv` is strictly ≤ 900.

---

## Phase 8: Building the Merkle Tree

Compile the final Merkle tree and claim proofs according to `contracts/README.md`.

### Procedure:
1. In the `contracts/` directory:
   ```bash
   cd contracts
   npm run merkle -- ../allowlist-final.csv generated/allowlist-final.json
   ```
2. The script validates:
   - No duplicates, valid addresses, allowance sum ≤ 900.
   - Generates `root` (bytes32) and individual inclusion proofs for every address.
3. Note the generated `<MERKLE_ROOT>` (e.g. `0x9f8c...`).

---

## Phase 9: Contract Deployment & Setup

Execute on-chain transactions on Ethereum Sepolia.

### Checklist Before Phase 9:
- [ ] Owner wallet has Sepolia testnet ETH for gas.
- [ ] `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY` are configured in `contracts/.env`.
- [ ] If deploying a new contract: verify `NFT_OWNER` address.

### Procedure:
1. If the contract is not yet deployed on Sepolia, deploy it:
   ```bash
   cd contracts
   npm run deploy:sepolia
   ```
   Save the printed contract address: `<CONTRACT_ADDRESS>`.
2. As the contract owner, call `setMerkleRoot(bytes32)`:
   - Parameter: `<MERKLE_ROOT>`.
   - This registers the winners on-chain.
3. As the contract owner, call `setPhase(uint8)`:
   - Parameter: `1` (Phase `Allowlist`).
   - Minting is now officially open for allowlisted winners!
4. (Optional) Distribute team and treasury reserve:
   - Call `ownerMint(address to, uint256 qty)` (up to 100 NFTs in total).

---

## Phase 10: Winner Announcement & Free Mint Portal

1. Publish the final announcement on X/Twitter using the template in `docs/launch/x-threads.md`.
2. Host `allowlist-final.json` on the site or IPFS so users can look up their Merkle proof when calling `claim(allowance, qty, proof)` via MetaMask / web3 portal.
3. Winners call:
   ```solidity
   squeekRunnerHamsters.claim(allowance, 1, proof);
   ```
   (Zero payment, testnet gas only).

---

## Phase 11: Mint Close & Metadata Freeze

When the minting period ends:
1. Call `setPhase(0)` (Phase `Closed`).
2. Verify token images and JSONs on IPFS.
3. Call `setBaseURI("ipfs://<METADATA_CID>/")`.
4. (Optional, irreversible) Call `freezeMetadata()` to permanently lock collection metadata.
