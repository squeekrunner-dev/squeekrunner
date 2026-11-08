import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ContractFactory, JsonRpcProvider, Wallet, getAddress, ZeroAddress } from 'ethers';

export function deploymentConfig(env) {
  if (!env.SEPOLIA_RPC_URL || !env.DEPLOYER_PRIVATE_KEY) throw new Error('Set SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY locally; no deployment attempted');
  let url;
  try { url = new URL(env.SEPOLIA_RPC_URL); } catch { throw new Error('Invalid SEPOLIA_RPC_URL'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('SEPOLIA_RPC_URL must use HTTP(S)');
  if (!/^0x[\da-f]{64}$/i.test(env.DEPLOYER_PRIVATE_KEY)) throw new Error('Invalid DEPLOYER_PRIVATE_KEY format');
  try { new Wallet(env.DEPLOYER_PRIVATE_KEY); } catch { throw new Error('Invalid DEPLOYER_PRIVATE_KEY scalar'); }
  let owner;
  try { owner = getAddress(env.NFT_OWNER); } catch { throw new Error('Set NFT_OWNER to the intended owner address'); }
  if (owner === ZeroAddress) throw new Error('NFT_OWNER cannot be zero');
  const baseURI = env.NFT_BASE_URI?.trim() ?? '';
  if (baseURI && !baseURI.endsWith('/')) throw new Error('NFT_BASE_URI must be empty or end with /');
  return { rpc: url.href, key: env.DEPLOYER_PRIVATE_KEY, owner,
    name: env.NFT_NAME?.trim() || 'SqueekRunner Hamsters', symbol: env.NFT_SYMBOL?.trim() || 'SQRH', baseURI };
}

export async function requireSepolia(provider) {
  const network = await provider.getNetwork();
  if (network.chainId !== 11155111n) throw new Error('Refusing deployment: RPC chain ID is not Sepolia (11155111)');
}

export async function main() {
  const config = deploymentConfig(process.env);
  let artifact;
  try { artifact = JSON.parse(await readFile(new URL('../artifacts/src/SqueekRunnerHamsters.sol/SqueekRunnerHamsters.json', import.meta.url), 'utf8')); }
  catch { throw new Error('Compile first with npm run compile'); }
  if (artifact.contractName !== 'SqueekRunnerHamsters' || !artifact.bytecode?.startsWith('0x')) throw new Error('Invalid contract artifact');
  const provider = new JsonRpcProvider(config.rpc);
  try {
    await requireSepolia(provider);
    const signer = new Wallet(config.key, provider);
    console.log(`Sepolia deployment; signer ${signer.address}; initial owner ${config.owner}`);
    const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signer)
      .deploy(config.name, config.symbol, config.owner, config.baseURI);
    // Print the hash before waiting: the owner can inspect a submitted tx if the RPC disconnects.
    console.log(`Deployment transaction: ${contract.deploymentTransaction().hash}`);
    await contract.waitForDeployment();
    console.log(JSON.stringify({ chainId: 11155111, address: await contract.getAddress(), owner: config.owner,
      name: config.name, symbol: config.symbol, baseURI: config.baseURI, phase: 'Closed' }, null, 2));
  } finally { provider.destroy(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // Provider errors may contain secret RPC URL credentials: never dump the raw error.
  main().catch(() => {
    console.error('Deployment not completed. Check local env, compiled artifact, Sepolia chain ID and gas balance. If a transaction hash was printed, inspect it before retrying. Secrets and raw RPC errors are intentionally omitted.');
    process.exitCode = 1;
  });
}
