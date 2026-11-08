# SqueekRunner — Quick FAQ for Social Media & Community Replies

A collection of 15 concise, factual answers designed for quick copy-pasting when responding to player inquiries on X (Twitter), Discord, and Telegram. All details are strictly aligned with `/whitelist/index.html` and project documentation.

---

### Q1: What is SqueekRunner?
**A:** SqueekRunner is a free browser-based endless runner game where gameplay speed accelerates and decelerates according to the real-time RPM of Squeekchain's physical hamster wheel. You jump over crates, catch lucky golden nuts, and aim for a high score.

### Q2: Do I need a crypto wallet to play?
**A:** No. You can play SqueekRunner completely free in any modern web browser without connecting a wallet, signing up, or installing any extensions. You only connect a wallet if you choose to enter the optional whitelist raffle after beating the qualifying score.

### Q3: Does entering the raffle or minting cost any money?
**A:** Zero. Entering the raffle requires only a free cryptographic message signature with zero gas. If you win a spot in the raffle, minting on the Ethereum Sepolia testnet requires only free testnet ETH obtained from public faucets.

### Q4: Which blockchain network is SqueekRunner on?
**A:** SqueekRunner and the SqueekRunner Hamsters NFT collection operate exclusively on the **Ethereum Sepolia testnet** (Chain ID `11155111`). Everything is for testing and gaming fun; no real money is involved.

### Q5: How does the physical hamster wheel affect gameplay?
**A:** SqueekRunner streams live telemetry from Squeekchain's WHEELY9000 setup. When the real hamster runs, your world accelerates (up to a 2.7× multiplier at ~98.3 RPM). When the hamster rests, the speed smoothly glides back to baseline.

### Q6: What happens if the hamster is asleep or the wheel is idle?
**A:** The game remains 100% playable! When telemetry reports 0 RPM or data is temporarily unavailable, SqueekRunner runs at its balanced baseline speed. You can always start a run and qualify for the raffle at any time.

### Q7: What are golden nuts? Are they crypto tokens?
**A:** No, golden nuts are in-game bonus items, not tokens or SQK. They spawn whenever Squeekchain confirms a new block on Sepolia. Collecting a golden nut grants +150 score points and a 12-second one-hit shield that absorbs a crate collision.

### Q8: What is the SqueekRunner Hamsters NFT collection?
**A:** It is an upcoming collection of 1,000 unique vector SVG NFTs on Ethereum Sepolia testnet. It includes 990 generative character combinations across 8 layers and 10 handcrafted 1/1 legendary editions celebrating milestone runners.

### Q9: How will the 1,000 NFTs be distributed?
**A:** Exactly 1,000 NFTs will ever be minted:
- **700 NFTs (70%):** Player Raffle (awarded to players who beat the score threshold in the game).
- **200 NFTs (20%):** Community & X challenges and giveaways.
- **100 NFTs (10%):** Core team and community treasury reserve.

### Q10: How do I qualify for the whitelist raffle?
**A:** Play in ranked mode on `<SITE_URL>/play/`, beat the announced qualifying score threshold, connect your Sepolia wallet, and sign a free off-chain verification message.

### Q11: Why do I sign an off-chain message instead of a transaction?
**A:** We use EIP-4361 (Sign-In with Ethereum). Signing an off-chain message cryptographically proves you own your wallet address without costing any gas or broadcasting a transaction to the blockchain. It keeps entry instantaneous and 100% free.

### Q12: How can I verify that the raffle draw was fair?
**A:** The raffle is provably fair. Before the draw, we freeze all entries, publish the cryptographic Merkle root, and designate a future Sepolia block number. Once that block is mined, its block hash acts as the random seed to pick winners via an open-source script anyone can run locally.

### Q13: Can bots or multi-accounters farm all the tickets?
**A:** We enforce strictly 1 ticket per wallet address. Furthermore, the server re-simulates the raw physics replay of every run to verify authentic play and checks that the run lasted its real duration, alongside Cloudflare Turnstile anti-bot checks and rate limits. Obvious bot farms will be disqualified.

### Q14: Do SqueekRunner Hamsters NFTs have financial value or yield?
**A:** No. SqueekRunner Hamsters are free testnet collectibles created solely for gaming fun and experimentation. They carry zero cash value, offer no passive yield or investment returns, and are not financial instruments.

### Q15: Is SqueekRunner an official Squeekchain project?
**A:** No. SqueekRunner is an independent community project created by builders participating in the Squeekchain Genesis Code Lane. It is not created, owned, operated, or endorsed by the Squeekchain core team.
