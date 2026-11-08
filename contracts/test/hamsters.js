const { expect } = require('chai');
const { ethers } = require('hardhat');
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');

describe('SqueekRunnerHamsters', function () {
  let owner, alice, bob, outsider, nft, factory, tree;
  beforeEach(async function () {
    [owner, alice, bob, outsider] = await ethers.getSigners();
    factory = await ethers.getContractFactory('SqueekRunnerHamsters');
    nft = await factory.deploy('SqueekRunner Hamsters', 'SQRH', owner.address, 'ipfs://initial/');
    await nft.waitForDeployment();
    tree = StandardMerkleTree.of([[alice.address, '5'], [bob.address, '3']], ['address', 'uint256']);
  });
  const proof = (t, account) => {
    const [index] = [...t.entries()].find(([, [address]]) => address.toLowerCase() === account.toLowerCase());
    return t.getProof(index);
  };
  async function open(t = tree) { await nft.setMerkleRoot(t.root); await nft.setPhase(1); }

  it('deploys constructor parameters, closed phase and fixed independent budgets', async function () {
    expect(await nft.name()).to.equal('SqueekRunner Hamsters');
    expect(await nft.symbol()).to.equal('SQRH');
    expect(await nft.owner()).to.equal(owner.address);
    expect(await nft.MAX_SUPPLY()).to.equal(1000);
    expect(await nft.RESERVE()).to.equal(100);
    expect(await nft.ALLOWLIST_SUPPLY()).to.equal(900);
    expect(await nft.phase()).to.equal(0);
    expect(await nft.merkleRoot()).to.equal(ethers.ZeroHash);
    expect(await nft.totalSupply()).to.equal(0);
    expect(await nft.supportsInterface('0x80ac58cd')).to.equal(true);
    expect(await nft.supportsInterface('0x5b5e139f')).to.equal(true);
    expect(await nft.supportsInterface('0x2a55205a')).to.equal(false); // No royalties.
  });

  it('accepts configurable name/symbol and rejects a zero initial owner', async function () {
    const other = await factory.deploy('Other Hamsters', 'OH', alice.address, '');
    expect(await other.name()).to.equal('Other Hamsters');
    expect(await other.symbol()).to.equal('OH');
    expect(await other.owner()).to.equal(alice.address);
    await expect(factory.deploy('X', 'X', ethers.ZeroAddress, '')).to.be.revertedWithCustomError(nft, 'OwnableInvalidOwner');
  });

  it('claims with a StandardMerkleTree double-hashed proof and emits sequential ids', async function () {
    await open();
    await expect(nft.connect(alice).claim(5, 2, proof(tree, alice.address)))
      .to.emit(nft, 'Claimed').withArgs(alice.address, 2, 1);
    expect(await nft.ownerOf(1)).to.equal(alice.address);
    expect(await nft.ownerOf(2)).to.equal(alice.address);
    expect(await nft.claimed(alice.address)).to.equal(2);
    expect(await nft.allowlistMinted()).to.equal(2);
    expect(await nft.reserveMinted()).to.equal(0);
    expect(await nft.totalSupply()).to.equal(2);
  });

  it('rejects an invalid proof, another account, a wrong allowance and a single-hash leaf', async function () {
    await open();
    await expect(nft.connect(alice).claim(5, 1, [ethers.ZeroHash])).to.be.revertedWithCustomError(nft, 'InvalidProof');
    await expect(nft.connect(outsider).claim(5, 1, proof(tree, alice.address))).to.be.revertedWithCustomError(nft, 'InvalidProof');
    await expect(nft.connect(alice).claim(6, 1, proof(tree, alice.address))).to.be.revertedWithCustomError(nft, 'InvalidProof');
    await nft.setMerkleRoot(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [alice.address, 5])));
    await expect(nft.connect(alice).claim(5, 1, [])).to.be.revertedWithCustomError(nft, 'InvalidProof');
  });

  it('allows partial claims up to the cumulative allowance, then rejects repeats', async function () {
    await open();
    const p = proof(tree, alice.address);
    await expect(nft.connect(alice).claim(5, 6, p)).to.be.revertedWithCustomError(nft, 'AllowanceExceeded');
    await nft.connect(alice).claim(5, 2, p);
    await expect(nft.connect(alice).claim(5, 4, p)).to.be.revertedWithCustomError(nft, 'AllowanceExceeded');
    await nft.connect(alice).claim(5, 3, p);
    await expect(nft.connect(alice).claim(5, 1, p)).to.be.revertedWithCustomError(nft, 'AllowanceExceeded');
    expect(await nft.claimed(alice.address)).to.equal(5);
    expect(await nft.totalSupply()).to.equal(5);
  });

  it('rejects zero quantities and oversized uint256 quantities without arithmetic panics', async function () {
    await open();
    await expect(nft.connect(alice).claim(5, 0, proof(tree, alice.address))).to.be.revertedWithCustomError(nft, 'InvalidQuantity');
    await expect(nft.connect(alice).claim(5, ethers.MaxUint256, proof(tree, alice.address))).to.be.revertedWithCustomError(nft, 'AllowanceExceeded');
    await expect(nft.ownerMint(alice.address, 0)).to.be.revertedWithCustomError(nft, 'InvalidQuantity');
    await expect(nft.ownerMint(alice.address, ethers.MaxUint256)).to.be.revertedWithCustomError(nft, 'ReserveSupplyExceeded');
  });

  it('requires a root before opening, rejects zero roots, and enforces Closed after reopening', async function () {
    await expect(nft.setPhase(1)).to.be.revertedWithCustomError(nft, 'InvalidMerkleRoot');
    await expect(nft.setMerkleRoot(ethers.ZeroHash)).to.be.revertedWithCustomError(nft, 'InvalidMerkleRoot');
    await expect(nft.connect(alice).claim(5, 1, proof(tree, alice.address))).to.be.revertedWithCustomError(nft, 'MintClosed');
    await open();
    await expect(nft.setPhase(0)).to.emit(nft, 'PhaseUpdated').withArgs(1, 0);
    await expect(nft.connect(alice).claim(5, 1, proof(tree, alice.address))).to.be.revertedWithCustomError(nft, 'MintClosed');
    await expect(nft.setPhase(1)).to.emit(nft, 'PhaseUpdated').withArgs(0, 1);
    await nft.connect(alice).claim(5, 1, proof(tree, alice.address));
    await expect(nft.setPhase(2)).to.be.reverted;
  });

  it('mints at most 100 reserve tokens, including while Closed', async function () {
    await expect(nft.ownerMint(owner.address, 60)).to.emit(nft, 'ReserveMinted').withArgs(owner.address, 60, 1);
    await nft.ownerMint(bob.address, 40);
    expect(await nft.reserveMinted()).to.equal(100);
    expect(await nft.totalSupply()).to.equal(100);
    expect(await nft.ownerOf(100)).to.equal(bob.address);
    await expect(nft.ownerMint(alice.address, 1)).to.be.revertedWithCustomError(nft, 'ReserveSupplyExceeded');
    expect(await nft.claimed(bob.address)).to.equal(0);
  });

  for (const reserveFirst of [true, false]) {
    it(`caps the combined paths at exactly 1000 (${reserveFirst ? 'reserve' : 'allowlist'} first)`, async function () {
      // Deliberately excessive owner-supplied root: contract caps remain authoritative.
      const large = StandardMerkleTree.of([[alice.address, '1000']], ['address', 'uint256']);
      await open(large);
      if (reserveFirst) await nft.ownerMint(bob.address, 100);
      for (let i = 0; i < 9; i++) await nft.connect(alice).claim(1000, 100, []);
      expect(await nft.allowlistMinted()).to.equal(900);
      await expect(nft.connect(alice).claim(1000, 1, [])).to.be.revertedWithCustomError(nft, 'AllowlistSupplyExceeded');
      if (!reserveFirst) await nft.ownerMint(bob.address, 100);
      expect(await nft.totalSupply()).to.equal(1000);
      expect(await nft.balanceOf(alice.address)).to.equal(900);
      expect(await nft.balanceOf(bob.address)).to.equal(100);
      expect(await nft.ownerOf(1000)).not.to.equal(ethers.ZeroAddress);
      await expect(nft.ownerOf(1001)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
      await expect(nft.ownerMint(bob.address, 1)).to.be.revertedWithCustomError(nft, 'ReserveSupplyExceeded');
    });
  }

  it('updates roots with old/new events and preserves lifetime claims across root replacement', async function () {
    await expect(nft.setMerkleRoot(tree.root)).to.emit(nft, 'MerkleRootUpdated').withArgs(ethers.ZeroHash, tree.root);
    await nft.setPhase(1); await nft.connect(alice).claim(5, 5, proof(tree, alice.address));
    const next = StandardMerkleTree.of([[alice.address, '7'], [outsider.address, '1']], ['address', 'uint256']);
    await expect(nft.setMerkleRoot(next.root)).to.emit(nft, 'MerkleRootUpdated').withArgs(tree.root, next.root);
    await expect(nft.connect(bob).claim(3, 1, proof(tree, bob.address))).to.be.revertedWithCustomError(nft, 'InvalidProof');
    await expect(nft.connect(alice).claim(7, 3, proof(next, alice.address))).to.be.revertedWithCustomError(nft, 'AllowanceExceeded');
    await nft.connect(alice).claim(7, 2, proof(next, alice.address));
    const lower = StandardMerkleTree.of([[alice.address, '1']], ['address', 'uint256']);
    await nft.setMerkleRoot(lower.root);
    await expect(nft.connect(alice).claim(1, 1, [])).to.be.revertedWithCustomError(nft, 'AllowanceExceeded');
    await nft.setMerkleRoot(next.root);
    await expect(nft.connect(alice).claim(7, 1, proof(next, alice.address))).to.be.revertedWithCustomError(nft, 'AllowanceExceeded');
    expect(await nft.claimed(alice.address)).to.equal(7);
  });

  it('does not restore claim rights after transferring minted tokens away', async function () {
    await open(); await nft.connect(alice).claim(5, 5, proof(tree, alice.address));
    await nft.connect(alice).transferFrom(alice.address, bob.address, 1);
    expect(await nft.ownerOf(1)).to.equal(bob.address);
    await expect(nft.connect(alice).claim(5, 1, proof(tree, alice.address))).to.be.revertedWithCustomError(nft, 'AllowanceExceeded');
  });

  it('rejects ETH in claim, ownerMint and direct transfers without changing accounting', async function () {
    await open();
    await expect(nft.connect(alice).claim(5, 1, proof(tree, alice.address), { value: 1 })).to.be.reverted;
    await expect(nft.ownerMint(alice.address, 1, { value: 1 })).to.be.reverted;
    await expect(owner.sendTransaction({ to: await nft.getAddress(), value: 1 })).to.be.reverted;
    expect(await nft.totalSupply()).to.equal(0);
    expect(await nft.claimed(alice.address)).to.equal(0);
    expect(await ethers.provider.getBalance(await nft.getAddress())).to.equal(0);
  });

  it('returns baseURI + decimal id + .json, updates all tokens and freezes irreversibly', async function () {
    await expect(nft.tokenURI(0)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
    await nft.ownerMint(alice.address, 2);
    expect(await nft.tokenURI(1)).to.equal('ipfs://initial/1.json');
    await expect(nft.setBaseURI('ipfs://final/')).to.emit(nft, 'BaseURIUpdated').withArgs('ipfs://initial/', 'ipfs://final/');
    expect(await nft.tokenURI(2)).to.equal('ipfs://final/2.json');
    await expect(nft.freezeMetadata()).to.emit(nft, 'MetadataFrozen').withArgs('ipfs://final/');
    expect(await nft.metadataFrozen()).to.equal(true);
    await expect(nft.setBaseURI('ipfs://changed/')).to.be.revertedWithCustomError(nft, 'MetadataIsFrozen');
    await expect(nft.freezeMetadata()).to.be.revertedWithCustomError(nft, 'MetadataIsFrozen');
    await nft.ownerMint(alice.address, 1);
    expect(await nft.tokenURI(3)).to.equal('ipfs://final/3.json');
  });

  it('permits an unset reveal URI but prevents freezing an empty base', async function () {
    nft = await factory.deploy('X', 'X', owner.address, '');
    await nft.ownerMint(alice.address, 1);
    expect(await nft.tokenURI(1)).to.equal('');
    await expect(nft.freezeMetadata()).to.be.revertedWithCustomError(nft, 'EmptyBaseURI');
    await expect(nft.setBaseURI('')).to.be.revertedWithCustomError(nft, 'EmptyBaseURI');
    await nft.setBaseURI('ipfs://ready/'); await nft.freezeMetadata();
  });

  it('restricts every administrative method to the owner', async function () {
    for (const call of [() => nft.connect(alice).ownerMint(alice.address, 1),
      () => nft.connect(alice).setMerkleRoot(tree.root), () => nft.connect(alice).setPhase(0),
      () => nft.connect(alice).setBaseURI('ipfs://other/'), () => nft.connect(alice).freezeMetadata(),
      () => nft.connect(alice).transferOwnership(bob.address), () => nft.connect(alice).renounceOwnership()]) {
      await expect(call()).to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount').withArgs(alice.address);
    }
  });

  it('requires pending owner acceptance and revokes the old owner afterward', async function () {
    await expect(nft.transferOwnership(alice.address)).to.emit(nft, 'OwnershipTransferStarted').withArgs(owner.address, alice.address);
    expect(await nft.owner()).to.equal(owner.address);
    expect(await nft.pendingOwner()).to.equal(alice.address);
    await expect(nft.connect(alice).ownerMint(alice.address, 1)).to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount');
    await expect(nft.connect(bob).acceptOwnership()).to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount');
    await expect(nft.connect(alice).acceptOwnership()).to.emit(nft, 'OwnershipTransferred').withArgs(owner.address, alice.address);
    expect(await nft.pendingOwner()).to.equal(ethers.ZeroAddress);
    await expect(nft.ownerMint(owner.address, 1)).to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount');
    await nft.connect(alice).ownerMint(alice.address, 1);
  });

  it('rolls back reserve accounting for a zero recipient and for a rejecting receiver', async function () {
    await expect(nft.ownerMint(ethers.ZeroAddress, 1)).to.be.revertedWithCustomError(nft, 'ERC721InvalidReceiver');
    const receiver = await (await ethers.getContractFactory('ReceiverHarness')).deploy(await nft.getAddress());
    await receiver.configure(3, 0, []);
    await expect(nft.ownerMint(await receiver.getAddress(), 2)).to.be.revertedWith('Receiver refuses token');
    expect(await nft.totalSupply()).to.equal(0); expect(await nft.reserveMinted()).to.equal(0);
    await nft.ownerMint(bob.address, 1); expect(await nft.ownerOf(1)).to.equal(bob.address);
  });

  it('rolls back allowance and supply when a non-ERC721Receiver tries to claim', async function () {
    const receiver = await (await ethers.getContractFactory('NonReceiver')).deploy();
    const t = StandardMerkleTree.of([[await receiver.getAddress(), '1']], ['address', 'uint256']);
    await open(t);
    await expect(receiver.mintClaim(await nft.getAddress(), 1, [])).to.be.revertedWithCustomError(nft, 'ERC721InvalidReceiver');
    expect(await nft.claimed(await receiver.getAddress())).to.equal(0);
    expect(await nft.totalSupply()).to.equal(0); expect(await nft.allowlistMinted()).to.equal(0);
  });

  it('blocks receiver reentrancy into claim and reserves the full outer batch before callbacks', async function () {
    const receiver = await (await ethers.getContractFactory('ReceiverHarness')).deploy(await nft.getAddress());
    await open(StandardMerkleTree.of([[await receiver.getAddress(), '3']], ['address', 'uint256']));
    await receiver.configure(1, 3, []); await receiver.mintClaim(2);
    expect(await receiver.attempted()).to.equal(true);
    expect(await receiver.reentrySucceeded()).to.equal(false);
    expect(await receiver.blockedSelector()).to.equal(ethers.id('ReentrancyGuardReentrantCall()').slice(0, 10));
    expect(await receiver.supplyDuringCallback()).to.equal(2);
    expect(await nft.claimed(await receiver.getAddress())).to.equal(2);
    expect(await nft.totalSupply()).to.equal(2);
  });

  it('blocks owner-receiver reentrancy into ownerMint as well', async function () {
    const receiver = await (await ethers.getContractFactory('ReceiverHarness')).deploy(await nft.getAddress());
    await nft.transferOwnership(await receiver.getAddress()); await receiver.acceptOwnership();
    await receiver.configure(2, 0, []); await receiver.mintReserve(2);
    expect(await receiver.reentrySucceeded()).to.equal(false);
    expect(await receiver.blockedSelector()).to.equal(ethers.id('ReentrancyGuardReentrantCall()').slice(0, 10));
    expect(await nft.reserveMinted()).to.equal(2); expect(await nft.totalSupply()).to.equal(2);
  });
});
