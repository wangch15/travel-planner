// 真實 Git/CLI 測試只在 OS 暫存目錄操作，不碰工作目錄的 trips/ 或 remotes。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('../../scripts/lib/paths.js');

function gitSandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-git-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  function git(...args) {
    const r = spawnSync('git', args, { cwd: dir, env, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  }
  function write(file, text = 'synthetic fixture\n') {
    const p = path.join(dir, file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  function commit(message) {
    git('add', '-A');
    git('commit', '-qm', message);
  }
  function cli(script, ...args) {
    return spawnSync(process.execPath, [path.join(dir, 'scripts', script), ...args], {
      cwd: dir, env, encoding: 'utf8',
    });
  }
  fs.cpSync(path.join(ROOT, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  git('init', '-q', '--initial-branch=main');
  git('config', 'user.name', 'Synthetic Test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  write('src/engine.js', 'baseline\n');
  commit('baseline');
  git('branch', 'base');
  return { dir, git, write, commit, cli };
}

module.exports = { gitSandbox };
