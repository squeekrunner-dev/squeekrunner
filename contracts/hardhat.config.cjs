require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, TASK_COMPILE_SOLIDITY_RUN_SOLCJS } = require('hardhat/builtin-tasks/task-names');
const solc = require('solc');

// Only the npm-pinned JS compiler: no binaries.soliditylang.org downloads.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }) => {
  if (solcVersion !== '0.8.28' || !solc.version().startsWith('0.8.28+')) throw new Error('Unexpected local solc version');
  return { compilerPath: require.resolve('solc/soljson.js'), isSolcJs: true, version: solcVersion, longVersion: solc.version() };
});
// Compile in-process: subprocess pipes are unavailable in the project sandbox.
subtask(TASK_COMPILE_SOLIDITY_RUN_SOLCJS).setAction(async ({ input }) => JSON.parse(solc.compile(JSON.stringify(input))));

module.exports = {
  solidity: { version: '0.8.28', settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' } },
  paths: { sources: './src', tests: './test', cache: './cache', artifacts: './artifacts' },
  networks: { hardhat: { chainId: 31337, hardfork: 'cancun' } },
  mocha: { timeout: 60000 },
};
