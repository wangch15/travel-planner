const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyPaths, renderVerdict } = require('../scripts/contrib-check.js');
const { gitSandbox } = require('./helpers/git-sandbox.js');

test('行程資料與私人筆記絕對不能進 PR', () => {
  const r = classifyPaths([
    'src/app.js',
    'trips/iceland-2027/data.js',
    'trips/iceland-2027/docs/plan.md',
    'trips/_profile.md',
  ]);
  assert.deepEqual(r.blocked.sort(), [
    'trips/_profile.md',
    'trips/iceland-2027/data.js',
    'trips/iceland-2027/docs/plan.md',
  ]);
  assert.deepEqual(r.engine, ['src/app.js']);
});

test('trips/_example 是引擎的一部分，可以改', () => {
  const r = classifyPaths(['trips/_example/data.js']);
  assert.deepEqual(r.blocked, [], '_example 是模板附的範例，不是任何人的行程');
  assert.deepEqual(r.engine, ['trips/_example/data.js']);
});

test('產物與快取不該出現在 PR 裡', () => {
  const r = classifyPaths(['dist/x/site/index.html', 'trips/a/.cache/y.json']);
  assert.equal(r.blocked.length, 2);
});

test('乾淨的引擎改動放行', () => {
  const out = renderVerdict(classifyPaths(['src/app.js', 'tests/render.test.js']));
  assert.match(out, /可以開 PR|通過/);
  assert.ok(!/✗|不能/.test(out), `不該報錯：\n${out}`);
});

test('夾帶行程資料時要擋下來，並說明為什麼', () => {
  const out = renderVerdict(classifyPaths(['src/app.js', 'trips/iceland-2027/data.js']));
  assert.match(out, /trips\/iceland-2027\/data\.js/, '要指名是哪個檔案');
  assert.match(out, /公開/, '要說明 fork 是公開的');
  assert.ok(!/可以開 PR/.test(out), '有夾帶就不該說可以開');
});

test('完全沒有引擎改動時提醒這不該是 PR', () => {
  const out = renderVerdict(classifyPaths([]));
  assert.match(out, /沒有|issue/, '沒東西可提就該去開 issue');
});

function blocked(repo, file) {
  const r = repo.cli('contrib-check.js', 'base');
  assert.ok(r.stdout.includes(file), `必須指出歷史中的禁止路徑：${file}\n${r.stdout}${r.stderr}`);
  assert.equal(r.status, 1, `禁止公開時必須非零退出，不能讓 && push 繼續：\n${r.stdout}${r.stderr}`);
}

test('CLI：私人檔案仍在分支時以非零退出', (t) => {
  const r = gitSandbox(t);
  r.write('trips/private/docs/brief.md');
  r.commit('private path');
  blocked(r, 'trips/private/docs/brief.md');
});

test('CLI：新增後刪除的私人檔案仍會公開，必須擋歷史', (t) => {
  const r = gitSandbox(t);
  r.write('trips/private/docs/brief.md');
  r.commit('private path');
  r.git('rm', 'trips/private/docs/brief.md');
  r.write('src/engine.js', 'engine fix\n');
  r.commit('remove private file');
  assert.equal(r.git('diff', '--name-only', 'base...HEAD'), 'src/engine.js');
  blocked(r, 'trips/private/docs/brief.md');
});

test('CLI：私人檔案改名搬到引擎後仍擋原路徑', (t) => {
  const r = gitSandbox(t);
  r.write('trips/private/docs/brief.md');
  r.commit('private path');
  r.git('mv', 'trips/private/docs/brief.md', 'src/moved.md');
  r.commit('move into engine');
  blocked(r, 'trips/private/docs/brief.md');
});

test('CLI：引擎檔搬入私人路徑再搬回，零最終差異仍擋', (t) => {
  const r = gitSandbox(t);
  r.write('trips/private/docs/placeholder.md');
  r.git('mv', 'src/engine.js', 'trips/private/docs/engine.js');
  r.commit('move into private path');
  r.git('mv', 'trips/private/docs/engine.js', 'src/engine.js');
  r.git('rm', 'trips/private/docs/placeholder.md');
  r.commit('move back');
  assert.equal(r.git('diff', '--name-only', 'base...HEAD'), '');
  blocked(r, 'trips/private/docs/engine.js');
});

test('CLI：必須遍歷合併進來的側支歷史，不只 first-parent', (t) => {
  const r = gitSandbox(t);
  r.git('checkout', '-qb', 'side');
  r.write('trips/private/docs/brief.md');
  r.commit('private side history');
  r.git('rm', 'trips/private/docs/brief.md');
  r.write('src/side.js');
  r.commit('remove private file on side');
  r.git('checkout', 'main');
  r.write('src/main.js');
  r.commit('main change');
  r.git('merge', '--no-ff', '-m', 'merge side', 'side');
  assert.ok(!r.git('diff', '--name-only', 'base...HEAD').includes('trips/'));
  blocked(r, 'trips/private/docs/brief.md');
});

test('CLI：只在 merge commit 新增又刪除的私人檔案也要擋', (t) => {
  const r = gitSandbox(t);
  r.git('checkout', '-qb', 'side');
  r.write('src/side.js');
  r.commit('side');
  r.git('checkout', 'main');
  r.write('src/main.js');
  r.commit('main');
  r.git('merge', '--no-ff', '--no-commit', 'side');
  r.write('trips/private/docs/merge-only.md');
  r.commit('merge with private file');
  // 比較基準前進到含此私人檔案的 merge，再刪除；新增 commit 的刪除路徑仍要檢查。
  r.git('branch', '-f', 'base', 'HEAD');
  r.git('rm', 'trips/private/docs/merge-only.md');
  r.commit('delete private file');
  blocked(r, 'trips/private/docs/merge-only.md');
});

test('CLI：merge 新增的私人檔案在後續 merge 移除仍要檢查 merge diff', (t) => {
  const r = gitSandbox(t);
  r.git('checkout', '-qb', 'side');
  r.write('src/side.js');
  r.commit('side');
  r.git('checkout', 'main');
  r.write('src/main.js');
  r.commit('main');
  r.git('merge', '--no-ff', '--no-commit', 'side');
  r.write('trips/private/docs/merge-only.md');
  r.commit('first merge with private file');
  r.git('checkout', 'side');
  r.write('src/side2.js');
  r.commit('second side');
  r.git('checkout', 'main');
  r.git('merge', '--no-ff', '--no-commit', 'side');
  r.git('rm', 'trips/private/docs/merge-only.md');
  r.commit('second merge without private file');
  blocked(r, 'trips/private/docs/merge-only.md');
});

test('CLI：含空白與非 ASCII 的私人路徑不能因 git 路徑轉義漏檢', (t) => {
  const r = gitSandbox(t);
  const file = 'trips/private/docs/私人 筆記.md';
  r.write(file);
  r.commit('unicode private path');
  blocked(r, file);
});

test('CLI：兩點範圍排除 base 已有但 HEAD 未合併的提交', (t) => {
  const r = gitSandbox(t);
  r.git('checkout', 'base');
  r.write('trips/upstream-only/docs/brief.md');
  r.commit('base-only history');
  r.git('checkout', 'main');
  r.write('src/engine.js', 'engine fix\n');
  r.commit('local engine fix');
  const result = r.cli('contrib-check.js', 'base');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(!result.stdout.includes('trips/upstream-only'));
});

test('CLI：乾淨引擎與 _example 新增歷史可通過', (t) => {
  const r = gitSandbox(t);
  r.write('src/engine.js', 'engine fix\n');
  r.write('trips/_example/data.js', '// synthetic example\n');
  r.commit('clean fix');
  const result = r.cli('contrib-check.js', 'base');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /通過/);
});

test('CLI：無法解析比較基準時 fail closed', (t) => {
  const r = gitSandbox(t);
  const result = r.cli('contrib-check.js', 'no-such-base');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /比不出|基準/);
});
