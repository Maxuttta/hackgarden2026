const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { parseEnv } = require('node:util');
const { isIPv4 } = require('node:net');

const root = path.resolve(__dirname, '..');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command} failed (exit ${result.status}).`);
}

async function deploy(host) {
  if (!isIPv4(host)) throw Error('Usage: node scripts/deploy-server.cjs SERVER_IPV4');
  const config = parseEnv(await fs.readFile(path.join(root, 'server/.env'), 'utf8'));
  const token = config.TELEGRAM_BOT_TOKEN;
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token || '')) throw Error('No valid Telegram token in server/.env.');

  const statePath = path.resolve(root, 'server', config.DATA_DIR || 'data', 'store.json');
  const lock = await fs.readFile(path.join(path.dirname(statePath), 'server.lock'), 'utf8')
    .catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (lock !== undefined) {
    const pid = Number(lock);
    if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('Cannot identify the local server process. Check server.lock.');
    try {
      process.kill(pid, 0);
      throw Error('Stop the local Cyber Garden server before transferring the Telegram bot.');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'cybergarden-deploy-'));
  const stage = path.join(temp, 'stage');
  const bundle = path.join(temp, 'cybergarden.tar.gz');
  const remote = `/root/cybergarden-${randomBytes(12).toString('hex')}.tar.gz`;
  const target = `root@${host}`;
  try {
    const entries = [
      'server/index.cjs', 'server/http.cjs', 'server/pdf.cjs', 'server/service.cjs',
      'server/store.cjs', 'server/telegram.cjs', 'server/workspace.cjs', 'server/public',
      'server/package.json', 'server/package-lock.json', 'assets/fonts',
      'garden/workflow.cjs', 'garden/scanners.cjs', 'garden/custom.cjs', 'garden/services.cjs',
      'garden/source-tokens.cjs', 'garden/gradle-analysis.cjs', 'garden/secret-analysis.cjs', 'garden/spring-analysis.cjs',
      'garden/kotlin-flow.cjs',
      'garden/workflow-templates.js', 'garden/block-presets.js',
      'garden/catalog.cjs', 'garden/maven-advisories.json',
      'garden/github.cjs', 'garden/model.cjs', 'mobile/android/app/src/main/assets',
      'mobile/output/CyberGarden-debug.apk'
    ];
    for (const entry of entries) {
      const destination = path.join(stage, entry);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.cp(path.join(root, entry), destination, { recursive: true });
    }
    const installScript = await fs.readFile(path.join(__dirname, 'install-server.sh'), 'utf8');
    await fs.writeFile(path.join(stage, 'install-server.sh'), installScript.replace(/\r\n/g, '\n'));
    const state = await fs.readFile(statePath, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (state !== undefined) {
      const parsed = JSON.parse(state);
      if (parsed.version !== 1) throw Error('Unsupported report database version.');
      await fs.writeFile(path.join(stage, 'store.json'), state, { mode: 0o600 });
    }
    const settings = {
      TELEGRAM_BOT_TOKEN: token,
      SESSION_HOURS: config.SESSION_HOURS || '168',
      SCHEDULE_TIMEZONE: config.SCHEDULE_TIMEZONE || 'Europe/Moscow'
    };
    for (const value of Object.values(settings)) {
      if (!/^[A-Za-z0-9_+:/.-]+$/.test(value)) throw Error('Unsupported character in server configuration.');
    }
    await fs.writeFile(path.join(stage, 'service.env'), Object.entries(settings).map(([key, value]) => `${key}=${value}\n`).join(''), { mode: 0o600 });
    run('tar', ['-czf', bundle, '-C', stage, '.']);
    const sshOptions = ['-o', 'ConnectTimeout=10'];
    run('scp', [...sshOptions, bundle, `${target}:${remote}`]);
    run('ssh', [...sshOptions, target, `set -eu; umask 077; stage=\$(mktemp -d); trap 'rm -rf -- "\$stage"; rm -f -- "${remote}"' EXIT; tar --no-same-owner --no-same-permissions -xzf "${remote}" -C "\$stage"; bash "\$stage/install-server.sh" "\$stage"`]);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

deploy(process.argv[2]).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
