# SqueekRunner Hamsters — Collection Contract

An isolated ERC-721 project for **Sepolia (chain ID 11155111)**. Collection: maximum
**1000 NFTs**, free mint, only network gas is paid. This is an application process with manual review, not a raffle:
game score validation, SIWE, backend, or minting from the game UI do not exist in the contract: it
accepts the final allowlist prepared according to decision D-0001.

The contract is not deployed to any public network. The deployment script is run only by the owner.

## Installation and verification

Node 22.13+ in the 22 line or Node 24; tested with 24.11.1. All commands run from `contracts/`:

```sh
npm ci
npm run compile
npm test
```

This folder has its own package.json, package-lock.json, and node_modules. Installing
contracts is not needed for the game and does not change root dependencies. Contract tests
are named `test/*.js` so that root Vitest does not pick them up as `*.test.*`.

Uses Hardhat 2 + ethers permitted by the brief: Hardhat 2.29.1, ethers 6.17.0,
OpenZeppelin Contracts 5.6.1, StandardMerkleTree 1.0.8, solc-js **0.8.28**.
Solidity pragma `^0.8.24`; compilation is pinned to 0.8.28, optimizer 200 runs,
EVM target Cancun. The configuration replaces standard compiler downloading with
local `solc/soljson.js` from npm and compiles in the current process: no separate
Solidity binary is downloaded, Foundry and global installs are not needed.

In a restricted Windows environment, npm dependency scripts use inherited stdio
via local `.npmrc`. Optional native compilation of `keccak` may print
`spawn EPERM`; the package allows a JS fallback, so success is determined by the exit
code of npm ci and tests, not by the absence of this diagnostic. Tests have been verified
with this fallback. Hardhat's native local EVM is shipped as an npm dependency.

`scripts/hardhat.cjs` stores Hardhat internal data in an ignored
`.hardhat-local/` directory and disables its telemetry. Directory settings change only
within this Node process; user profile and parent shell remain unchanged.
Proxies and RPCs are not needed for tests: Hardhat uses a local network with chain ID 31337.

## Contract and parameters

File: `src/SqueekRunnerHamsters.sol`. Constructor:

```solidity
constructor(string name_, string symbol_, address initialOwner, string initialBaseURI)
```

Working name/symbol: `SqueekRunner Hamsters` / `SQRH`. Initial owner is specified
explicitly; this can be an EOA or a compatible multisig. Zero address is rejected.
Initial phase is `Closed`, Merkle root is unset, and zero tokens are minted.
IDs are sequential from **1 to 1000**. Burning and modifying limits are not supported.

| Parameter / counter | Value or meaning |
| --- | --- |
| MAX_SUPPLY | 1000, immutable constant |
| RESERVE | 100, immutable constant |
| ALLOWLIST_SUPPLY | 900 = MAX_SUPPLY − RESERVE |
| totalSupply | Total number of minted NFTs, no burn exists |
| allowlistMinted | Minted via claim all-time, maximum 900 |
| reserveMinted | Minted via ownerMint all-time, maximum 100 |
| claimed(address) | Total claims by address all-time, not its current balance |

The distribution of **700 game whitelist (applications) / 200 Twitter / 100 team and treasury** is a project rule.
The contract strictly partitions **900 allowlist / 100 reserve**. It does not determine
whether an address came from application review or Twitter: this is verified by the organizer
when preparing the list. Unused reserve does not roll over into allowlist, and vice versa.
A single address can receive reserve and have a separate allowlist allowance.

### Allowlist and phases

```solidity
setMerkleRoot(bytes32 newRoot)               // onlyOwner, nonzero root
setPhase(Phase newPhase)                    // onlyOwner: 0 Closed, 1 Allowlist
claim(uint256 allowance, uint256 qty, bytes32[] proof)
ownerMint(address to, uint256 qty)          // onlyOwner, in any phase
```

Opening Allowlist is possible only after setting a root. The owner can close
and reopen minting. Zero qty is rejected. Claim mints only to `msg.sender`:
someone else's proof cannot be used to receive NFTs to your own address.

The tree leaf strictly matches OpenZeppelin StandardMerkleTree:

```solidity
keccak256(bytes.concat(keccak256(abi.encode(account, allowance))))
```

ABI types are `address,uint256`, double-hashed leaves, pairs sorted by
standard library. This is not `abi.encodePacked`, not a single hash,
and not a personal wallet signature. Proof is public; authorization is provided by the root
and binding the leaf to `msg.sender`.

**Allowance is an address's cumulative claim right over the lifetime of the contract.** The root can change,
but `claimed` is never reset. If an address had allowance 1 and already received 1 NFT,
a new leaf with allowance 2 permits **1** more, not 2. If the new allowance is below
what was already used, new claims are rejected. Transferring NFTs to another owner
does not restore claim rights.

Root changes immediately, including during an open phase; old proofs stop working.
Changes are published via the `MerkleRootUpdated(previousRoot,newRoot)` event.
To minimize interference with pending transactions, the owner can close the phase,
publish the new list/root/proofs, and reopen the phase. This is an operational recommendation,
not an additional contract constraint.

## Building Merkle root and proofs

Input is a UTF-8 CSV with header `address,allowance` or a JSON array of objects:

```json
[
  { "address": "0x0000000000000000000000000000000000000001", "allowance": 2 },
  { "address": "0x0000000000000000000000000000000000000002", "allowance": 1 }
]
```

These addresses are **educational examples, not the winners list**. Do not publish their root
for the live collection. Examples of both formats are located in `examples/`.

```sh
npm run merkle -- examples/allowlist.csv generated/example-v1.json
# Equivalent JSON input:
npm run merkle -- examples/allowlist.json generated/example-json-v1.json
```

The script validates addresses/checksums, rejects zero address and duplicates (including
case variations), permits integer allowances 1–900, at most 900 addresses, and total
allowance sum ≤900. JSON accepts numbers or decimal strings; CSV accepts plain or
quoted address/allowance without additional columns. It is not a universal CSV parser:
address and number fields do not contain commas or line breaks. Addresses are normalized
and sorted, so reordering lines does not change the result.

Output contains `root`, `totalAllowance`, `leafEncoding`, `entries` with address,
allowance, and proof for each address, as well as `tree` — a dump for
`StandardMerkleTree.load`. There are no private keys in this file. An existing
output file is not overwritten: use a new version name. The `generated` directory
is ignored by git; the owner publishes approved data and proofs separately.

When receiving two sequential lists, prepare a **cumulative combined application and Twitter list**,
accounting for address intersections. The script does not automatically sum duplicates:
the organizer must explicitly assign the total allowance. It does not read on-chain
claimed amounts or verify old root history. Removing previously minted addresses from a
new list does not release global capacity: otherwise, even a new list with sum ≤900 might
promise more than the remaining mint capacity. The contract will still never mint more than
900 allowlist NFTs. Verify 700/200 budgets separately before publication.

Example of calling an already deployed contract via ethers (ABI from artifact):

```js
const entry = proofs.entries.find(x => x.address.toLowerCase() === signer.address.toLowerCase());
await (await collection.connect(signer).claim(entry.allowance, 1, entry.proof)).wait();
```

No `value` parameter is passed. Allowance is taken from the published leaf; qty is the
desired portion of the remainder. For large allowances, send smaller batches
(e.g. 20–50 NFTs) after estimating gas: safeMint invokes the receiver for each token,
so a large batch might exceed the block gas limit.

## Metadata and ownership

`tokenURI(id)` returns `baseURI + decimal(id) + ".json"`. For example,
`ipfs://CID/` → `ipfs://CID/1.json`. The contract does not automatically add a slash.
For nonexistent IDs, it reverts with standard ERC721NonexistentToken. If base
URI is empty at deployment, existing tokens temporarily return an empty string.

- `setBaseURI(string)` — owner only; new value must be nonempty.
- `freezeMetadata()` — owner only, irreversibly prevents baseURI changes; empty
  URI cannot be frozen. Repeated freeze is rejected.
- Freezing applies to the **URI string**, not to HTTP server content. For
  immutable content, content-addressed metadata and proper pinning are required.
- Prior to freeze, the owner can change metadata for the entire collection. This is a scaffold
  for future changes; a dynamic metadata generator is not part of this task.
- `transferOwnership(newOwner)` designates pendingOwner; only pendingOwner can call
  `acceptOwnership()`. The previous owner retains rights until acceptance, then loses them.
- Inherited `renounceOwnership()` irreversibly relinquishes control. Do not call it
  before completing minting/metadata configuration: it can permanently leave mint closed
  or forfeit unused reserve. It is not part of the standard runbook.

Events: standard Transfer/Approval/Ownership*, as well as MerkleRootUpdated,
PhaseUpdated, Claimed, ReserveMinted, BaseURIUpdated, and MetadataFrozen.
Business rule violations revert with custom errors (MintClosed, InvalidQuantity,
InvalidProof, AllowanceExceeded, AllowlistSupplyExceeded, ReserveSupplyExceeded,
MaxSupplyExceeded, InvalidMerkleRoot, MetadataIsFrozen, EmptyBaseURI) or OpenZeppelin errors.

## Security and design choices

Both mint paths use **ReentrancyGuard + checks/effects/interactions**:
all limits and counters, including the full ID range, are reserved before the first
`_safeMint`. Upon ERC721Receiver failure, the entire batch and accounting revert.
`_safeMint` is chosen over `_mint` to avoid trapping NFTs in contracts that
cannot receive them. Tests cover malicious reentrancy into claim and
ownerMint, receiver failure, and missing ERC721Receiver interface.

Claim and ownerMint are not payable. receive/fallback/withdraw do not exist. Direct ETH
transfers revert; ETH forcibly sent via EVM mechanisms cannot be recovered through this
contract. No royalties: ERC-2981 is not implemented, the contract does not set a
recipient/rate or collect fees. This is a minimal free collection; the contract does not
control third-party marketplace fee policies.

No proxies, upgrades, oracle calls, randomness, on-chain lottery, or game score
verification exist. The administrator is trusted: they can replace the root, close
minting, direct the reserve, and change URI before freeze. Committing a root does not prove
the fairness of external review. Tests do not replace an independent Solidity audit.

Hardhat 2 was chosen for a reproducible in-process solc-js workflow in this environment and
permitted by the brief, but the branch is approaching EOL. `npm audit` reports vulnerabilities
in transitive tooling (including old Hardhat HTTP/archive dependencies and uuid in Merkle tools);
automated non-breaking audit fix did not resolve them. They do not enter Solidity bytecode or
the core game. Do not expose this toolchain as a public service or process untrusted
archives/tests with it. Update and re-verify the toolchain before operating outside a
local Sepolia process. The exact audit snapshot is documented in report T009.

## Deployment: owner action only

1. Verify final commit, review the contract, run `npm ci`,
   `npm run compile`, `npm test`. Save compiler/settings version and build-info.
2. Prepare Sepolia RPC, a wallet with testnet ETH for gas, and initial owner
   address NFT_OWNER. Ensure this address is controllable and can execute
   owner calls; for multisig, verify Sepolia support.
3. Copy `.env.example` to `.env` locally (PowerShell:
   `Copy-Item .env.example .env`) and fill it in an editor. Do not pass the key in
   command arguments, do not commit .env, and do not send it to chat.

| Env | Purpose |
| --- | --- |
| SEPOLIA_RPC_URL | Required HTTP(S) RPC; not logged |
| DEPLOYER_PRIVATE_KEY | Required 0x-prefixed private key; not logged |
| NFT_OWNER | Required explicit nonzero initialOwner |
| NFT_NAME / NFT_SYMBOL | Optional; defaults SqueekRunner Hamsters / SQRH |
| NFT_BASE_URI | Optional; empty or prefix with trailing `/` |

4. **The owner**, after these checks, runs:

```sh
npm run deploy:sepolia
```

This command actually sends a deployment transaction. It reads .env via
Node; parent process environment takes precedence. The script has no fallback RPC,
key, or default owner. Before signing, it verifies `eth_chainId = 11155111`; mainnet
and local chains are rejected. Only the SqueekRunnerHamsters artifact is used;
test ReceiverHarness/NonReceiver are never deployed by this script.
The project does not configure a remote Hardhat network, so `npm test` and compile
cannot send Sepolia transactions on their own.

After broadcast, tx hash is printed; after confirmation, the contract address and
public parameters are printed. Save them. On error after tx hash output, check
status in an explorer before retrying the command to avoid deploying duplicates.
Raw RPC errors are intentionally not printed: they might contain an API token from the URL.

5. Verify receipt and on-chain owner/name/symbol/phase/supply. Verify source
   code in Sepolia explorer with the same compiler 0.8.28, optimizer 200, and Cancun;
   verification service and its API key are not added to the package.
6. Prepare and verify the real combined 700+200 list, generate a
   new version of root/proofs. Owner calls setMerkleRoot, publishes list/proofs,
   then calls setPhase(1). The contract is always Closed after deployment.
7. Owner distributes reserve via ownerMint, at most 100 in total. After finalizing
   content, set final URI and freezeMetadata if desired.
   Closing mint is setPhase(0). Transferring administration is two-step Ownable2Step.

There is no public deployment address in this repository: no such transaction
was sent by the T009 author.

## Primary sources

- [OpenZeppelin ERC-721](https://docs.openzeppelin.com/contracts/5.x/api/token/erc721)
- [OpenZeppelin Ownable2Step](https://docs.openzeppelin.com/contracts/5.x/api/access)
- [StandardMerkleTree and double-hashed leaves](https://github.com/OpenZeppelin/merkle-tree)
- [Hardhat: local Solidity compiler](https://v2.hardhat.org/hardhat-runner/docs/other-guides/using-custom-solc)

## Allowlist preparation from approved applications

The 700 game whitelist spots are vetted manually by the team (this is an application with manual review, not a raffle), then exported and combined into the final Merkle tree:

1. **Export approved applications:** The team exports the reviewed and approved applications from the admin panel:
   `approved.csv` (`address,allowance`, with allowance = 1 for each approved address, up to 700).
2. **Combine lists:** Merge `approved.csv` with the Twitter/X community winners list (`twitter.csv`, up to 200 rows) into `allowlist.csv`:
   - Combine addresses and resolve any intersections by setting total allowance = 1 (or desired sum ≤ 900).
   - Ensure the total sum of allowances in `allowlist.csv` is strictly ≤ 900.
3. **Generate Merkle tree:** In the `contracts/` directory:
   ```sh
   npm run merkle -- allowlist.csv allowlist.json
   ```
   This generates `allowlist.json` containing the Merkle root (`bytes32`) and individual inclusion proofs for every address.
4. **Update on-chain root and open phase:**
   - Contract owner calls `setMerkleRoot(root)`.
   - Contract owner calls `setPhase(1)` to enable the `Allowlist` minting phase.
