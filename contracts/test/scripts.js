const { expect } = require('chai');
const { ethers } = require('hardhat');
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');
const { mkdir, mkdtemp, writeFile, readFile, unlink, rmdir } = require('node:fs/promises');
const { resolve, join } = require('node:path');

describe('Merkle script / on-chain integration', function () {
  let parseList, buildAllowlist, buildMerkleFile, owner, alice, bob;
  before(async function () {
    ({ parseList, buildAllowlist, buildMerkleFile } = await import('../scripts/build-merkle.mjs'));
    [owner, alice, bob] = await ethers.getSigners();
  });

  it('generates the same deterministic tree from CSV and JSON regardless of row order', function () {
    const csv = `\uFEFFaddress,allowance\r\n"${alice.address}","2"\r\n${bob.address},1\r\n`;
    const json = JSON.stringify([{ address: bob.address.toLowerCase(), allowance: '1' }, { address: alice.address, allowance: 2 }]);
    const a = buildAllowlist(parseList(csv, '.csv'));
    const b = buildAllowlist(parseList(json, '.json'));
    expect(a).to.deep.equal(b);
    expect(a.totalAllowance).to.equal(3);
    const loaded = StandardMerkleTree.load(a.tree);
    expect(loaded.root).to.equal(a.root);
    for (const entry of a.entries) {
      expect(StandardMerkleTree.verify(a.root, a.leafEncoding, [entry.address, entry.allowance], entry.proof)).to.equal(true);
    }
  });

  it('writes root/proofs JSON from files and the generated proof is accepted by the contract', async function () {
    const parent = resolve(__dirname, '../generated');
    await mkdir(parent, { recursive: true });
    const directory = await mkdtemp(join(parent, 'script-test-'));
    const input = join(directory, 'allowlist.csv'); const output = join(directory, 'proofs.json');
    try {
      await writeFile(input, `address,allowance\n${alice.address},3\n${bob.address},1\n`);
      const result = await buildMerkleFile(input, output);
      expect(JSON.parse(await readFile(output, 'utf8'))).to.deep.equal(result);
      const nft = await (await ethers.getContractFactory('SqueekRunnerHamsters')).deploy('Generated tree', 'TREE', owner.address, '');
      await nft.setMerkleRoot(result.root); await nft.setPhase(1);
      const entry = result.entries.find(item => item.address === alice.address);
      await nft.connect(alice).claim(entry.allowance, 2, entry.proof);
      expect(await nft.balanceOf(alice.address)).to.equal(2);
      await nft.connect(alice).claim(entry.allowance, 1, entry.proof);
      await expect(nft.connect(alice).claim(entry.allowance, 1, entry.proof)).to.be.revertedWithCustomError(nft, 'AllowanceExceeded');
      let failure;
      try { await buildMerkleFile(input, output); } catch (error) { failure = error; }
      expect(failure?.code).to.equal('EEXIST');
      expect(JSON.parse(await readFile(output, 'utf8'))).to.deep.equal(result);
    } finally {
      // Only the two files created by this test; no recursive directory deletion.
      await unlink(input).catch(() => {}); await unlink(output).catch(() => {}); await rmdir(directory);
    }
  });

  it('rejects duplicate and zero/broken addresses, including case-insensitive duplicates', function () {
    expect(() => buildAllowlist([{ address: alice.address, allowance: 1 }, { address: alice.address.toLowerCase(), allowance: 2 }])).to.throw('Duplicate address');
    for (const address of [ethers.ZeroAddress, 'not-an-address', undefined]) {
      expect(() => buildAllowlist([{ address, allowance: 1 }])).to.throw();
    }
  });

  it('rejects bad allowances, malformed records and budgets above 900', function () {
    for (const allowance of [0, -1, 1.5, 901, Infinity, Number.MAX_SAFE_INTEGER + 1, '0', '01', '1e2', '1.0', ' 1', '9000', true, null]) {
      expect(() => buildAllowlist([{ address: alice.address, allowance }]), String(allowance)).to.throw();
    }
    for (const records of [[], {}, null, [null], [[alice.address, 1]]]) expect(() => buildAllowlist(records)).to.throw();
    expect(() => buildAllowlist([{ address: alice.address, allowance: 700 }, { address: bob.address, allowance: 201 }])).to.throw('exceeds 900');
    expect(buildAllowlist([{ address: alice.address, allowance: 700 }, { address: bob.address, allowance: 200 }]).totalAllowance).to.equal(900);
  });

  it('accepts a full 900-wallet allocation and rejects a 901st record', function () {
    const records = Array.from({ length: 900 }, (_, index) => ({ address: ethers.getAddress(ethers.toBeHex(index + 1, 20)), allowance: 1 }));
    const result = buildAllowlist(records);
    expect(result.entries).to.have.length(900); expect(result.totalAllowance).to.equal(900);
    expect(() => buildAllowlist([...records, { address: alice.address, allowance: 1 }])).to.throw('1–900');
  });

  it('rejects malformed CSV headers/columns, unsupported formats and broken JSON', function () {
    expect(() => parseList('allowance,address\n1,0x01', '.csv')).to.throw('header');
    expect(() => parseList('address,allowance\na,b,c', '.csv')).to.throw('two fields');
    expect(() => parseList('', '.txt')).to.throw('.json or .csv');
    expect(() => parseList('{bad', '.json')).to.throw();
  });
});

describe('Owner-only deployment script preflight (no public transactions)', function () {
  let deploymentConfig, requireSepolia, env;
  before(async function () {
    ({ deploymentConfig, requireSepolia } = await import('../scripts/deploy.mjs'));
    env = {
      SEPOLIA_RPC_URL: 'https://rpc.invalid',
      // Public deterministic test scalar, not a real deployment secret or funded account.
      DEPLOYER_PRIVATE_KEY: '0x' + '01'.padStart(64, '0'),
      NFT_OWNER: ethers.getAddress(ethers.toBeHex(1, 20)),
    };
  });
  it('requires both env credentials and an explicit nonzero owner', function () {
    expect(() => deploymentConfig({})).to.throw('SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY');
    expect(() => deploymentConfig({ ...env, DEPLOYER_PRIVATE_KEY: '' })).to.throw('SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY');
    expect(() => deploymentConfig({ ...env, NFT_OWNER: '' })).to.throw('NFT_OWNER');
    expect(() => deploymentConfig({ ...env, NFT_OWNER: ethers.ZeroAddress })).to.throw('zero');
  });
  it('validates URL, scalar and metadata prefix without printing secrets', function () {
    for (const rpc of ['broken', 'file:///secret']) expect(() => deploymentConfig({ ...env, SEPOLIA_RPC_URL: rpc })).to.throw('SEPOLIA_RPC_URL');
    for (const key of ['secret', '0x' + '0'.repeat(64), '0x' + 'f'.repeat(64)]) expect(() => deploymentConfig({ ...env, DEPLOYER_PRIVATE_KEY: key })).to.throw('DEPLOYER_PRIVATE_KEY');
    expect(() => deploymentConfig({ ...env, NFT_BASE_URI: 'ipfs://no-slash' })).to.throw('end with /');
    expect(deploymentConfig(env)).to.include({ owner: env.NFT_OWNER, name: 'SqueekRunner Hamsters', symbol: 'SQRH', baseURI: '' });
    expect(deploymentConfig({ ...env, NFT_NAME: 'Custom', NFT_SYMBOL: 'C', NFT_BASE_URI: 'ipfs://folder/' })).to.include({ name: 'Custom', symbol: 'C', baseURI: 'ipfs://folder/' });
  });
  it('rejects mainnet/local chain IDs before signing, accepting only Sepolia', async function () {
    for (const chainId of [1n, 31337n]) {
      let error;
      try { await requireSepolia({ getNetwork: async () => ({ chainId }) }); } catch (caught) { error = caught; }
      expect(error?.message).to.include('not Sepolia');
    }
    await requireSepolia({ getNetwork: async () => ({ chainId: 11155111n }) });
  });
});
