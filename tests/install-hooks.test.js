const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { gitSandbox } = require('./helpers/git-sandbox.js');
const installerPath = path.join(__dirname, '../scripts/install-hooks.js');
const installer = fs.existsSync(installerPath) ? require(installerPath) : {};

function install(root, extra = {}) {
  assert.equal(typeof installer.installHooks, 'function', '缺少可測的 prepare installer');
  const logs = [];
  const result = installer.installHooks({ root, log: (s) => logs.push(s),
    run: (cmd, args, options) => spawnSync(cmd, args, { ...options, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }), ...extra });
  return { result, logs };
}

test('prepare 指向 installer，hook 是可執行的薄入口', () => {
  const root = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assert.equal(pkg.scripts.prepare, 'node scripts/install-hooks.js');
  const p = path.join(root, '.githooks/pre-push');
  assert.ok(fs.existsSync(p), '缺 hook');
  if (process.platform !== 'win32') assert.ok(fs.statSync(p).mode & 0o111, 'hook 必須可執行');
  assert.ok(fs.readFileSync(p, 'utf8').split('\n').length < 20, '判斷邏輯不應藏在 shell');
});

test('Git 工具環境找不到 node 時，shell 入口拒絕且給人可讀的下一步', { skip: process.platform === 'win32' }, () => {
  const hook = path.join(__dirname, '../.githooks/pre-push');
  const r = spawnSync(hook, ['origin', 'https://github.com/person/repo'], { env: { PATH: '' }, encoding: 'utf8', input: '' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /目前只有本機備份，尚未異地備份/);
  assert.match(r.stderr, /找不到 Node/);
  assert.match(r.stderr, /下一步/);
});

test('新 repo 設定 repo-local .githooks，重跑維持原設定', (t) => {
  const r = gitSandbox(t);
  assert.equal(install(r.dir).result, 'installed');
  assert.equal(r.git('config', '--local', '--get', 'core.hooksPath'), '.githooks');
  assert.equal(install(r.dir).result, 'already-installed');
});

for (const value of ['.husky', '/custom/hooks', '', ' .githooks', '.githooks ']) {
  test(`已有其他 hooksPath 不覆蓋並要求人處理：${value || '(empty)'}`, (t) => {
    const r = gitSandbox(t);
    r.git('config', 'core.hooksPath', value);
    const { result, logs } = install(r.dir);
    assert.equal(result, 'conflict');
    const actual = spawnSync('git', ['config', '--get', 'core.hooksPath'], {
      cwd: r.dir, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    });
    assert.equal(actual.stdout.replace(/\r?\n$/, ''), value, '不能 trim 掉另一個真實路徑的空白');
    assert.match(logs.join('\n'), /未.*覆蓋|不.*覆蓋/);
    assert.match(logs.join('\n'), /請.*處理|請.*整合/);
    assert.match(logs.join('\n'), /未.*安裝|未.*生效/);
  });
}

test('非 git repo 靜默跳過，不讓 npm install 失敗', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-no-git-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { result, logs } = install(dir);
  assert.equal(result, 'skipped');
  assert.deepEqual(logs, []);
});

test('專案在別的 repo 子目錄時，不修改外層 Git 設定', (t) => {
  const r = gitSandbox(t), nested = path.join(r.dir, 'nested');
  fs.mkdirSync(nested);
  const { result, logs } = install(nested);
  assert.equal(result, 'failed');
  assert.match(logs.join('\n'), /根目錄/);
  assert.equal(spawnSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: r.dir }).status, 1);
});

test('Git root 輸出無法判讀，不安裝到猜測的 repo', () => {
  let calls = 0;
  const { result, logs } = install(process.cwd(), { run: () => { calls += 1; return { status: 0, stdout: '' }; } });
  assert.equal(result, 'failed');
  assert.equal(calls, 1, '無有效 Git root 就不能繼續讀寫 config');
  assert.match(logs.join('\n'), /未.*安裝|未.*生效/);
});

test('git 不存在時靜默跳過', () => {
  const { result, logs } = install('/unused', { run: () => ({ status: null, error: { code: 'ENOENT' } }) });
  assert.equal(result, 'skipped');
  assert.deepEqual(logs, []);
});

test('其他 scope 的 hooksPath 同樣不能被 local 設定蓋過', () => {
  const calls = [];
  const { result, logs } = install('/repo', { run: (cmd, args) => {
    calls.push(args);
    if (args[0] === 'rev-parse') return { status: 0, stdout: '/repo\n' };
    if (args.includes('--get')) return { status: 0, stdout: '/global/hooks\n' };
    throw new Error('不准寫 config');
  } });
  assert.equal(result, 'conflict');
  assert.match(logs.join('\n'), /請/);
  assert.ok(calls.every((args) => !args.includes('--local')));
});

test('config 寫入失敗明說 hook 未生效，但 installer 不拋錯', () => {
  const { result, logs } = install('/repo', { run: (cmd, args) => {
    if (args[0] === 'rev-parse') return { status: 0, stdout: '/repo\n' };
    if (args.includes('--get')) return { status: 1, stdout: '' };
    return { status: 128, stderr: 'permission denied' };
  } });
  assert.equal(result, 'failed');
  assert.match(logs.join('\n'), /未.*安裝|未.*生效/);
  assert.match(logs.join('\n'), /請/);
});
