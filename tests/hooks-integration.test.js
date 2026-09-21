// 真實 Git/npm lifecycle；SSH 與 gh 是本機替身，絕不連 GitHub。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..');
const quote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;

test('clone → npm install → .githooks 生效；PUBLIC 的真正 push 被擋且 refs 不變', { timeout: 60000 }, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-hook-e2e-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const seed = path.join(root, 'seed'), bare = path.join(root, 'remote.git'), clone = path.join(root, 'clone');
  const bin = path.join(root, 'bin'), fixture = path.join(root, 'visibility.json'), trace = path.join(root, 'gh-calls.jsonl');
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0', GIT_SSH_VARIANT: 'simple', PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  fs.mkdirSync(seed); fs.mkdirSync(bin);
  function write(p, text) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
  function command(cmd, args, cwd = root) {
    return spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: 30000 });
  }
  function success(cmd, args, cwd = root) {
    const r = command(cmd, args, cwd);
    assert.equal(r.status, 0, `${cmd} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
    return r.stdout.trim();
  }
  // 最小、無 npm dependencies 的 fixture；使用產品真正的 hook/installer/module 與 prepare 定義。
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json')));
  assert.equal(pkg.scripts.prepare, 'node scripts/install-hooks.js');
  write(path.join(seed, 'package.json'), JSON.stringify({ name: 'hook-integration-fixture', version: '1.0.0', private: true,
    scripts: { prepare: pkg.scripts.prepare } }));
  for (const file of ['.githooks/pre-push', 'scripts/pre-push.js', 'scripts/lib/pre-push.js', 'scripts/install-hooks.js']) {
    const destination = path.join(seed, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), destination);
  }
  fs.chmodSync(path.join(seed, '.githooks/pre-push'), 0o755);
  write(path.join(seed, 'README.md'), 'seed\n');
  success('git', ['init', '-q', '--initial-branch=main'], seed);
  success('git', ['config', 'user.name', 'Synthetic Test'], seed);
  success('git', ['config', 'user.email', 'test@example.invalid'], seed);
  success('git', ['add', '.'], seed);
  success('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'seed'], seed);
  success('git', ['clone', '--bare', seed, bare]);
  success('git', ['clone', bare, clone]);
  assert.equal(command('git', ['config', '--get', 'core.hooksPath'], clone).status, 1, 'clone 不會複製 seed 的 Git 設定');
  success('npm', ['install', '--offline', '--no-audit', '--no-fund', '--ignore-scripts=false'], clone);
  assert.equal(success('git', ['config', '--get', 'core.hooksPath'], clone), '.githooks');

  // 即使 fetch URL 是本機，push URL 仍以 Git argv 的 GitHub URL 查核。
  success('git', ['remote', 'set-url', '--push', 'origin', 'git@github.com:synthetic-owner/public-trip.git'], clone);
  const ssh = path.join(root, 'ssh-stub.js');
  write(ssh, `
    const { spawnSync } = require('node:child_process');
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== 'git@github.com' || args[1] !== "git-receive-pack 'synthetic-owner/public-trip.git'") {
      console.error('unexpected SSH arguments; refusing any transport'); process.exit(98);
    }
    const r = spawnSync('git', ['receive-pack', ${JSON.stringify(bare)}], { stdio: 'inherit' });
    process.exit(r.status ?? 99);
  `);
  env.GIT_SSH_COMMAND = `${quote(process.execPath)} ${quote(ssh)}`;
  write(path.join(bin, 'gh'), `#!/usr/bin/env node
    const fs = require('node:fs');
    fs.appendFileSync(${JSON.stringify(trace)}, JSON.stringify(process.argv.slice(2)) + '\\n');
    process.stdout.write(fs.readFileSync(${JSON.stringify(fixture)}, 'utf8'));
  `);
  fs.chmodSync(path.join(bin, 'gh'), 0o755);
  success('git', ['config', 'user.name', 'Synthetic Test'], clone);
  success('git', ['config', 'user.email', 'test@example.invalid'], clone);
  write(path.join(clone, 'README.md'), 'README-only update\n');
  success('git', ['add', 'README.md'], clone);
  success('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'README only'], clone);
  const before = success('git', ['rev-parse', 'refs/heads/main'], bare);

  write(fixture, '{"visibility":"PUBLIC"}');
  const blocked = command('git', ['push', 'origin', 'HEAD:refs/heads/main'], clone);
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /目前只有本機備份，尚未異地備份/);
  assert.match(blocked.stderr, /PUBLIC/);
  assert.equal(success('git', ['rev-parse', 'refs/heads/main'], bare), before);

  // 正向對照：同一條本機 transport 在 PRIVATE 時確實可推，證明不是網路失敗造成假綠。
  write(fixture, '{"visibility":"PRIVATE"}');
  success('git', ['push', 'origin', 'HEAD:refs/heads/main'], clone);
  assert.equal(success('git', ['rev-parse', 'refs/heads/main'], bare), success('git', ['rev-parse', 'HEAD'], clone));

  // 刪除 refs 全零一樣必須查；使用非預設分支避免 receive.denyDeleteCurrent 誤擋測試。
  success('git', ['branch', 'old', 'HEAD'], bare);
  write(fixture, '{"visibility":"PUBLIC"}');
  const deletion = command('git', ['push', 'origin', ':refs/heads/old'], clone);
  assert.notEqual(deletion.status, 0);
  assert.match(deletion.stderr, /PUBLIC/);
  assert.equal(success('git', ['rev-parse', 'refs/heads/old'], bare), success('git', ['rev-parse', 'HEAD'], clone));
  const calls = fs.readFileSync(trace, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(calls.length, 3, '每次都查，不快取、不因刪除或 README-only 略過');
  for (const args of calls) assert.deepEqual(args, ['repo', 'view', 'synthetic-owner/public-trip', '--json', 'visibility']);
});
