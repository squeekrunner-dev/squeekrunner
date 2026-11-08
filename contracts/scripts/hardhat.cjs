const { resolve } = require('node:path');
const { mkdirSync, writeFileSync } = require('node:fs');

// Hardhat 2 reads its vars/consent before loading project config. Keep that state
// inside this package, rather than requiring writes to a user's profile directory.
// These process-local cache settings do not change the parent shell or OS settings.
const localState = resolve(__dirname, '../.hardhat-local');
if (process.platform === 'win32') {
  process.env.APPDATA = resolve(localState, 'config');
  process.env.LOCALAPPDATA = resolve(localState, 'data');
} else {
  process.env.XDG_CONFIG_HOME = resolve(localState, 'config');
  process.env.XDG_DATA_HOME = resolve(localState, 'data');
  process.env.XDG_CACHE_HOME = resolve(localState, 'cache');
}
const configPath = require('env-paths')('hardhat').config;
mkdirSync(configPath, { recursive: true });
writeFileSync(resolve(configPath, 'telemetry-consent.json'), JSON.stringify({ consent: false }));
process.env.HARDHAT_DISABLE_TELEMETRY_PROMPT = 'true';
require('hardhat/internal/cli/cli');
