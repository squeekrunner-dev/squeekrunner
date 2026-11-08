const { expect } = require('chai');
const { Wallet, keccak256, toUtf8Bytes } = require('ethers');

describe('Provably fair raffle script', function () {
  let canonicalEntries, createCommitment, drawWinners, verifyResult, winnersCsv;
  const addresses = n => Array.from({ length: n }, (_, i) => new Wallet(keccak256(toUtf8Bytes(`entry-${i}`))).address);
  const hash = label => keccak256(toUtf8Bytes(label));

  before(async function () {
    ({ canonicalEntries, createCommitment, drawWinners, verifyResult, winnersCsv } = await import('../scripts/raffle.mjs'));
  });

  it('canonicalizes the export: checksum, order-independent, rejects duplicates and allowance != 1', function () {
    const list = addresses(5);
    const a = canonicalEntries(list.map(address => ({ address: address.toLowerCase(), allowance: '1' })));
    const b = canonicalEntries([...list].reverse().map(address => ({ address, allowance: 1 })));
    expect(a).to.deep.equal(b);
    expect(() => canonicalEntries([{ address: list[0] }, { address: list[0].toLowerCase() }])).to.throw('Duplicate');
    expect(() => canonicalEntries([{ address: list[0], allowance: '2' }])).to.throw('allowance 1');
    expect(() => canonicalEntries([])).to.throw('empty');
  });

  it('is deterministic for a block hash and changes with it', function () {
    const entries = canonicalEntries(addresses(1500).map(address => ({ address })));
    const commitment = createCommitment(entries, 9000000);
    const first = drawWinners(entries, commitment, hash('block-a'));
    expect(first.winners).to.have.length(700);
    expect(new Set(first.winners).size).to.equal(700);
    expect(drawWinners(entries, commitment, hash('block-a')).winners).to.deep.equal(first.winners);
    expect(drawWinners(entries, commitment, hash('block-b')).winners).to.not.deep.equal(first.winners);
    expect(verifyResult(entries, commitment, hash('block-a'), first)).to.equal(true);
    const tampered = { ...first, winners: [...first.winners.slice(1), first.winners[0]] };
    expect(verifyResult(entries, commitment, hash('block-a'), tampered)).to.equal(false);
    expect(winnersCsv(first).split('\n')[0]).to.equal('address,allowance');
  });

  it('refuses an entry list that differs from the commitment', function () {
    const entries = canonicalEntries(addresses(20).map(address => ({ address })));
    const commitment = createCommitment(entries, 1);
    const changed = canonicalEntries(addresses(21).map(address => ({ address })));
    expect(() => drawWinners(changed, commitment, hash('x'))).to.throw('does not match');
    expect(() => drawWinners(entries, commitment, '0x1234')).to.throw('Block hash');
  });

  it('everyone wins when there are fewer entries than winners', function () {
    const entries = canonicalEntries(addresses(42).map(address => ({ address })));
    const result = drawWinners(entries, createCommitment(entries, 7), hash('few'));
    expect([...result.winners].sort()).to.deep.equal([...entries].sort());
  });

  it('gives every entry the same chance (statistical sanity check)', function () {
    const entries = canonicalEntries(addresses(6).map(address => ({ address })));
    const commitment = createCommitment(entries, 5, 2);
    const wins = new Map(entries.map(a => [a, 0]));
    const rounds = 3000;
    for (let r = 0; r < rounds; r++) for (const w of drawWinners(entries, commitment, hash(`r${r}`)).winners) wins.set(w, wins.get(w) + 1);
    // Expected 1000 wins each (2 of 6 per round); allow a generous ±10 % band.
    for (const count of wins.values()) expect(count).to.be.within(900, 1100);
  });
});
