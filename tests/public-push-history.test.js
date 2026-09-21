const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { gitSandbox } = require('./helpers/git-sandbox.js');
const { checkPush } = require('../scripts/lib/pre-push.js');
const Z = '0'.repeat(40);
const oid = (r, ref = 'HEAD') => r.git('rev-parse', ref);
const line = (local, remote, ref = 'refs/heads/topic') => `${ref} ${local} ${ref} ${remote}\n`;
const deletion = (remote) => `(delete) ${Z} refs/heads/old ${remote}\n`;

function check(r, updates, visibility = 'PUBLIC', fn = checkPush, name = 'arbitrary', url = 'https://github.com/person/any-repo-name.git') {
  const calls = [];
  const result = fn({ remoteName: name, remoteUrl: url, updates, root: r.dir }, {
    run: (cmd, args) => {
      assert.equal(cmd, 'gh');
      calls.push(args);
      return { status: 0, stdout: JSON.stringify({ visibility }), stderr: '' };
    },
  });
  assert.equal(calls.length, 1, '無論 ref 內容都先查目的地');
  return result;
}
function denied(r, updates, file, commits, fn) {
  const result = check(r, updates, 'PUBLIC', fn);
  assert.equal(result.allowed, false, '含私人歷史不可公開');
  assert.ok(result.message.includes(file), `要指名路徑：${result.message}`);
  assert.ok(commits.some((id) => result.message.includes(id)), `要指出範圍中的 commit：${result.message}`);
  assert.match(result.message, /目前只有本機備份，尚未異地備份/);
  assert.match(result.message, /已經公開|已公開/);
  return result;
}
function engine(r) { r.write('src/engine.js', 'engine change\n'); r.commit('engine change'); return oid(r); }
function upstream(r, ref = 'base') { r.git('update-ref', 'refs/remotes/upstream/main', oid(r, ref)); }

// 可供 mutation test 使用同一組真正的行為斷言，不以字串存在當成實作正確。
function dirtyContract(r, fn = checkPush) {
  const base = oid(r, 'base');
  r.write('trips/private/docs/brief.md'); r.commit('private');
  const privateCommit = oid(r);
  r.git('rm', 'trips/private/docs/brief.md'); r.commit('remove');
  denied(r, line(oid(r), base), 'trips/private/docs/brief.md', [privateCommit, oid(r)], fn);
}
function unknownRangeContract(r, fn = checkPush) {
  const tip = engine(r);
  const result = check(r, line(tip, Z), 'PUBLIC', fn);
  assert.equal(result.allowed, false, '沒有可信 base 必須拒絕');
  assert.match(result.message, /範圍|基準|歷史/);
}

test('乾淨引擎分支可推任意命名的公開 repo，不是 contrib 名稱白名單', (t) => {
  const r = gitSandbox(t), base = oid(r, 'base'), tip = engine(r);
  for (const [name, url] of [['origin', 'https://github.com/person/ordinary.git'], ['contrib', 'git@github.com:person/unrelated-name.git']]) {
    assert.equal(check(r, line(tip, base), 'PUBLIC', checkPush, name, url).allowed, true);
  }
});

test('新增又刪掉私人檔案仍拒絕並標路徑、commit', (t) => dirtyContract(gitSandbox(t)));

test('私人檔改名搬進引擎，不能只看最終 diff', (t) => {
  const r = gitSandbox(t), base = oid(r);
  r.write('trips/private/docs/brief.md'); r.commit('private'); const first = oid(r);
  r.git('mv', 'trips/private/docs/brief.md', 'src/moved.md'); r.commit('move');
  denied(r, line(oid(r), base), 'trips/private/docs/brief.md', [first, oid(r)]);
});

for (const file of ['trips/_profile.md', 'dist/site/index.html', '.cache/private.json', 'tools/.cache/private.json']) {
  test(`公開禁止路徑與 contrib-check 共用：${file}`, (t) => {
    const r = gitSandbox(t), base = oid(r);
    r.write(file); r.commit('private path');
    denied(r, line(oid(r), base), file, [oid(r)]);
  });
}

test('_example 是引擎，公開歷史可以包含它', (t) => {
  const r = gitSandbox(t), base = oid(r);
  r.write('trips/_example/data.js', '// synthetic example'); r.commit('example');
  assert.equal(check(r, line(oid(r), base)).allowed, true);
});

test('同樣私人歷史推到 PRIVATE 放行，不要求 base 或解析完整歷史', (t) => {
  const r = gitSandbox(t);
  r.write('trips/private/docs/brief.md'); r.commit('private');
  assert.equal(check(r, line(oid(r), Z), 'PRIVATE').allowed, true);
  assert.equal(check(r, 'unparseable refs', 'PRIVATE').allowed, true);
});

test('新分支有乾淨 upstream/main 基準時可判斷', (t) => {
  const r = gitSandbox(t); upstream(r);
  const clean = engine(r);
  assert.equal(check(r, line(clean, Z)).allowed, true);
  r.write('trips/private/docs/brief.md'); r.commit('private');
  denied(r, line(oid(r), Z), 'trips/private/docs/brief.md', [oid(r)]);
});

test('新分支無 upstream，但同次 stdin 有目的地既有 ref 可作基準', (t) => {
  const r = gitSandbox(t), base = oid(r), tip = engine(r);
  assert.equal(check(r, line(tip, Z) + deletion(base)).allowed, true);
});

test('新分支沒有可信 base 時拒絕，不猜 origin/main', (t) => {
  const r = gitSandbox(t);
  r.git('update-ref', 'refs/remotes/origin/main', oid(r));
  unknownRangeContract(r);
});

test('假的 upstream/main 含私人歷史，不能拿來把私人 commit 排除出範圍', (t) => {
  const r = gitSandbox(t);
  r.write('trips/private/docs/brief.md'); r.commit('private'); const bad = oid(r);
  upstream(r, 'HEAD'); engine(r);
  denied(r, line(oid(r), Z), 'trips/private/docs/brief.md', [bad]);
});

test('不乾淨的基準不在 local 祖先時，拒絕訊息也要說明是基準檢查', (t) => {
  const r = gitSandbox(t);
  r.git('checkout', '-qb', 'bad-base');
  r.write('trips/private/docs/brief.md'); r.commit('private base'); const bad = oid(r);
  upstream(r, 'HEAD'); r.git('checkout', 'main'); const clean = engine(r);
  assert.ok(!r.git('rev-list', clean).split('\n').includes(bad));
  const result = check(r, line(clean, Z));
  assert.equal(result.allowed, false);
  assert.match(result.message, /基準/);
  assert.ok(result.message.includes(bad));
});

test('一次推兩個 ref，第二個含私人歷史，整個拒絕', (t) => {
  const r = gitSandbox(t), base = oid(r), clean = engine(r);
  r.git('checkout', '-qb', 'dirty', 'base');
  r.write('trips/private/docs/brief.md'); r.commit('private'); const dirty = oid(r);
  denied(r, line(clean, base, 'refs/heads/clean') + line(dirty, base, 'refs/heads/dirty'), 'trips/private/docs/brief.md', [dirty]);
});

test('掃 stdin local SHA，不是工作目錄 HEAD', (t) => {
  const r = gitSandbox(t), base = oid(r), clean = engine(r);
  r.write('trips/private/docs/brief.md'); r.commit('private'); const dirty = oid(r);
  assert.equal(check(r, line(clean, base)).allowed, true, 'HEAD 雖有私人檔，推的是另一個乾淨 ref');
  r.git('checkout', '--detach', clean);
  denied(r, line(dirty, base), 'trips/private/docs/brief.md', [dirty]);
});

test('合併側支新增後刪除的私人歷史照樣拒絕', (t) => {
  const r = gitSandbox(t), base = oid(r); engine(r);
  r.git('checkout', '-qb', 'side', 'base');
  r.write('trips/private/docs/brief.md'); r.commit('private'); const bad = oid(r);
  r.git('rm', 'trips/private/docs/brief.md'); r.write('src/side.js'); r.commit('remove'); const removed = oid(r);
  r.git('checkout', 'main'); r.git('merge', '--no-ff', '-m', 'merge', 'side');
  denied(r, line(oid(r), base), 'trips/private/docs/brief.md', [bad, removed, oid(r)]);
});

test('force push 的 remote 不是 local 祖先也依兩點範圍掃描', (t) => {
  const r = gitSandbox(t), old = engine(r);
  r.git('checkout', '-qb', 'rewritten', 'base');
  r.write('trips/private/docs/brief.md'); r.commit('new private');
  denied(r, line(oid(r), old), 'trips/private/docs/brief.md', [oid(r)]);
});

test('刪除分支沒有新增歷史，但依然查可見度；INTERNAL/未知不可刪', (t) => {
  const r = gitSandbox(t), refs = deletion('f'.repeat(40));
  assert.equal(check(r, refs, 'PUBLIC').allowed, true);
  assert.equal(check(r, refs, 'PRIVATE').allowed, true);
  assert.equal(check(r, refs, 'INTERNAL').allowed, false);
  assert.equal(check(r, refs, 'UNKNOWN').allowed, false);
});

for (const [label, refs] of [
  ['缺 local object', line('f'.repeat(40), Z)],
  ['缺 remote object', line('a'.repeat(40), 'f'.repeat(40))],
  ['空 refs', ''], ['壞格式', 'refs/heads/main not-a-sha'],
]) {
  test(`PUBLIC 算不出範圍拒絕：${label}`, (t) => {
    const r = gitSandbox(t); upstream(r);
    const result = check(r, refs);
    assert.equal(result.allowed, false);
    assert.match(result.message, /範圍|歷史|基準/);
  });
}

test('本機有 local tip 但缺 remote SHA 時，不偷偷改用 upstream 範圍', (t) => {
  const r = gitSandbox(t); upstream(r);
  assert.equal(check(r, line(engine(r), 'f'.repeat(40))).allowed, false);
});

test('shallow 不能把截斷歷史當乾淨；PRIVATE 仍放行', (t) => {
  const r = gitSandbox(t), base = oid(r); upstream(r); const tip = engine(r);
  r.write('.git/shallow', `${base}\n`);
  const result = check(r, line(tip, base));
  assert.equal(result.allowed, false);
  assert.match(result.message, /範圍|歷史|shallow/);
  assert.equal(check(r, line(tip, base), 'PRIVATE').allowed, true);
});

test('tag 必須能解析到 commit；指向 blob 的 tag 不能冒充乾淨歷史', (t) => {
  const r = gitSandbox(t), base = oid(r), tip = engine(r); upstream(r);
  r.git('tag', '-a', 'v-clean', '-m', 'clean', tip);
  assert.equal(check(r, line(oid(r, 'v-clean'), Z, 'refs/tags/v-clean')).allowed, true);
  const blob = oid(r, 'HEAD:src/engine.js');
  assert.equal(check(r, line(blob, base, 'refs/tags/blob')).allowed, false);
});

test('Git showSignature 設定不能把簽章說明混進路徑而漏掉私人檔案', (t) => {
  const r = gitSandbox(t), base = oid(r);
  r.write('trips/private/docs/brief.md'); r.commit('private signed fixture');
  const raw = r.git('cat-file', 'commit', 'HEAD');
  const signed = raw.replace('\n\n', '\ngpgsig -----BEGIN PGP SIGNATURE-----\n fake\n -----END PGP SIGNATURE-----\n\n') + '\n';
  const id = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], { cwd: r.dir, encoding: 'utf8', input: signed }).trim();
  r.git('update-ref', 'refs/heads/main', id);
  r.write('fake-gpg', '#!/bin/sh\nprintf "gpg: synthetic signature diagnostic\\n" >&2\nexit 1\n');
  fs.chmodSync(path.join(r.dir, 'fake-gpg'), 0o755);
  r.git('config', 'gpg.program', path.join(r.dir, 'fake-gpg'));
  r.git('config', 'log.showSignature', 'true');
  denied(r, line(id, base), 'trips/private/docs/brief.md', [id]);
});

test('Git notes 與顏色設定也不能改變路徑判斷', (t) => {
  const r = gitSandbox(t), base = oid(r);
  r.write('trips/private/docs/brief.md'); r.commit('private fixture'); const tip = oid(r);
  r.git('notes', 'add', '-m', 'synthetic note', tip);
  r.git('config', 'log.showNotes', 'true');
  r.git('config', 'color.ui', 'always');
  denied(r, line(tip, base), 'trips/private/docs/brief.md', [tip]);
});

test('特殊字元路徑以 NUL 掃描、literal pathspec 找 commit，不因 glob 或換行漏報', (t) => {
  const r = gitSandbox(t), base = oid(r);
  const file = 'trips/private/docs/secret[1]\n*.md';
  r.write(file); r.commit('special filename');
  denied(r, line(oid(r), base), file, [oid(r)]);
});

test('contrib-check 與 hook 使用同一份分類函式及政策，不維護兩份路徑規則', (t) => {
  const r = gitSandbox(t), base = oid(r), tip = engine(r);
  const cli = require(path.join(r.dir, 'scripts/contrib-check.js'));
  const shared = require(path.join(r.dir, 'scripts/lib/contribution-history.js'));
  const hook = require(path.join(r.dir, 'scripts/lib/pre-push.js')).checkPush;
  assert.equal(cli.classifyPaths, shared.classifyPaths);
  assert.equal(cli.BLOCKED, shared.BLOCKED);
  shared.BLOCKED.push({ re: /^src\/engine\.js$/, why: 'synthetic shared policy probe' });
  assert.deepEqual(cli.classifyPaths(['src/engine.js']).blocked, ['src/engine.js']);
  denied(r, line(tip, base), 'src/engine.js', [tip], hook);
});

test('實際程式變異：範圍失敗改放行與移除 PUBLIC 掃描，行為契約都會失敗', (t) => {
  for (const kind of ['range-fail-open', 'no-scan']) {
    const r = gitSandbox(t);
    const module = path.join(r.dir, 'scripts/lib/pre-push.js');
    const source = fs.readFileSync(module, 'utf8');
    assert.ok(source.includes('inspectPublicPush(updates, { root })'), '必須接上共用的推送歷史檢查');
    const start = source.indexOf("if (visibility === 'PUBLIC')");
    const end = source.indexOf("if (visibility !== 'PRIVATE')", start);
    const block = source.slice(start, end);
    const mutant = kind === 'no-scan'
      ? source.replace('inspectPublicPush(updates, { root })', '({ violations: [] })')
      : source.slice(0, start) + block.replace(/catch \{[\s\S]*?\n    \}/, 'catch { return { allowed: true, repo };\n    }') + source.slice(end);
    assert.notEqual(mutant, source, '變異必須真的改到程式');
    fs.writeFileSync(module, mutant);
    const changed = require(module).checkPush; // 先成功載入，排除 syntax error 導致假綠。
    assert.throws(() => (kind === 'no-scan' ? dirtyContract(r, changed) : unknownRangeContract(r, changed)), assert.AssertionError);
  }
});
