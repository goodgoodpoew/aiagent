const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const COMPOSE_FILE = 'docker-compose.test.yml';
const DOCKER_DESKTOP_SOCK = path.join(
  process.env.HOME ?? '',
  '.docker/run/docker.sock',
);
const DOCKER_DESKTOP_APP = '/Applications/Docker.app';
const MAX_WAIT_SECONDS = 90;

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: options.inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
    env: process.env,
  });
}

function dockerInfoAvailable() {
  const result = run('docker', ['info'], { inherit: false });
  return result.status === 0;
}

function socketExists() {
  try {
    return fs.existsSync(DOCKER_DESKTOP_SOCK);
  } catch {
    return false;
  }
}

function getDockerContext() {
  const result = run('docker', ['context', 'show'], { inherit: false });
  return result.status === 0 ? result.stdout.trim() : '<unknown>';
}

function tryStartDockerDesktop() {
  if (process.platform !== 'darwin') {
    return false;
  }
  if (!fs.existsSync(DOCKER_DESKTOP_APP)) {
    return false;
  }

  console.log('检测到 Docker 未运行，正在尝试启动 Docker Desktop...');
  const openResult = run('open', ['-a', DOCKER_DESKTOP_APP], { inherit: false });
  return openResult.status === 0;
}

function waitForDocker() {
  for (let second = 1; second <= MAX_WAIT_SECONDS; second += 1) {
    if (dockerInfoAvailable()) {
      return true;
    }

    if (second === 1 || second % 10 === 0) {
      process.stdout.write(`等待 Docker 就绪... ${second}/${MAX_WAIT_SECONDS}s\r`);
    }
    run('sleep', ['1'], { inherit: false });
  }

  process.stdout.write('\n');
  return false;
}

function printDockerHelp(action) {
  console.error('\n无法连接 Docker，测试环境容器未能启动。');
  console.error('\n常见原因：');
  console.error('  1. Docker Desktop 未启动（最常见）');
  console.error('  2. Docker Desktop 正在首次初始化，需手动完成许可/登录');
  console.error('  3. Docker CLI 上下文与当前引擎不一致');
  console.error('\n请先手动启动 Docker Desktop，待菜单栏鲸鱼图标稳定后再执行：');
  console.error(`  pnpm test:env:${action}`);
  console.error('\n诊断信息：');
  console.error(`  - docker context: ${getDockerContext()}`);
  console.error(`  - socket 路径: ${DOCKER_DESKTOP_SOCK}`);
  console.error(`  - socket 存在: ${socketExists() ? '是' : '否'}`);
}

function ensureDockerReady() {
  if (dockerInfoAvailable()) {
    return true;
  }

  const attemptedStart = tryStartDockerDesktop();
  if (!attemptedStart) {
    return false;
  }

  return waitForDocker();
}

function main() {
  const action = process.argv[2];
  if (!['up', 'down'].includes(action)) {
    console.error('用法: node test/scripts/docker-test-env.js <up|down>');
    process.exit(1);
  }

  if (!ensureDockerReady()) {
    printDockerHelp(action);
    process.exit(1);
  }

  const composeArgs =
    action === 'up'
      ? ['compose', '-f', COMPOSE_FILE, 'up', '-d']
      : ['compose', '-f', COMPOSE_FILE, 'down', '-v'];

  const result = run('docker', composeArgs, { inherit: true });
  process.exit(result.status ?? 1);
}

main();
