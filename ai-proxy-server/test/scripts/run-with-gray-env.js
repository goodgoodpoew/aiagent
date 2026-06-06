const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const candidates = [
  path.resolve(process.cwd(), '.env.gray'),
  path.resolve(process.cwd(), 'test/env/.env.gray'),
  path.resolve(process.cwd(), 'test/env/.env.gray.example'),
];

for (const envPath of candidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
    break;
  }
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('用法: node test/scripts/run-with-gray-env.js <command> [...args]');
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
