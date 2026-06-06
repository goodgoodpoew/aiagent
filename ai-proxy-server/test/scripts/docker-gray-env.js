const { spawnSync } = require('child_process');

const COMPOSE_FILE = 'docker-compose.gray.yml';

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: options.inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
  });
}

function dockerInfoAvailable() {
  return run('docker', ['info']).status === 0;
}

function composeCommand() {
  const dockerCompose = run('docker', ['compose', 'version']);
  if (dockerCompose.status === 0) {
    return { command: 'docker', prefix: ['compose'] };
  }
  return { command: 'docker-compose', prefix: [] };
}

function runCompose(args) {
  if (!dockerInfoAvailable()) {
    console.error('Docker 不可用，无法启动灰度 PostgreSQL / Redis。');
    process.exit(1);
  }

  const { command, prefix } = composeCommand();
  const result = run(command, [...prefix, '-f', COMPOSE_FILE, ...args], { inherit: true });
  process.exit(result.status ?? 1);
}

const action = process.argv[2];

if (action === 'up') {
  runCompose(['up', '-d']);
}

if (action === 'down') {
  runCompose(['down', '--remove-orphans']);
}

console.error('用法: node test/scripts/docker-gray-env.js <up|down>');
process.exit(1);
