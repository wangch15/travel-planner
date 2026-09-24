const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePath = path.join(__dirname, '../scripts/lib/pre-push.js');
const guard = fs.existsSync(modulePath) ? require(modulePath) : {};
const warning = '目前只有本機備份，尚未異地備份';
const zero = '0'.repeat(40), oid = 'a'.repeat(40);
const update = `refs/heads/main ${oid} refs/heads/main ${zero}\n`;
const deletion = `(delete) ${zero} refs/heads/old ${oid}\n`;
const result = (visibility) => ({ status: 0, stdout: JSON.stringify({ visibility }), stderr: '' });

function harness(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'trips/_example'), { recursive: true });
  const h = { root, calls: [], response: result('PRIVATE') };
  h.run = ({ remoteUrl = 'git@github.com:person/private-trip.git', remoteName = 'origin', updates = update } = {}) => {
    assert.equal(typeof guard.checkPush, 'function', '缺少可測的 push 目的地 guard');
    return guard.checkPush({ remoteUrl, remoteName, updates, root }, {
      run: (command, args, options) => { h.calls.push({ command, args, options }); return h.response; },
    });
  };
  return h;
}
function refused(r, why) {
  assert.equal(r.allowed, false);
  assert.ok(r.message.includes(warning));
  assert.match(r.message, why);
  assert.match(r.message, /請|先|下一步/);
}

test('模板目的地且只有 _example 放行，不需查公開模板的可见度', (t) => {
  const h = harness(t);
  for (const remoteUrl of ['https://github.com/wangch15/travel-planner.git', 'git@github.com:wangch15/travel-planner.git', 'ssh://git@github.com:22/Wangch15/Travel-Planner.git']) {
    assert.equal(h.run({ remoteUrl }).allowed, true);
  }
  assert.equal(h.calls.length, 0);
});

test('模板目的地有真實行程，即使 remote 不叫 upstream 也拒絕', (t) => {
  const h = harness(t);
  fs.mkdirSync(path.join(h.root, 'trips/my-trip'));
  refused(h.run({ remoteName: 'anything', remoteUrl: 'https://github.com/wangch15/travel-planner' }), /模板|行程/);
  assert.equal(h.calls.length, 0);
});

test('模板目的地的非底線 symlink 目錄也不能漏掉', { skip: process.platform === 'win32' }, (t) => {
  const h = harness(t);
  fs.symlinkSync('_example', path.join(h.root, 'trips/linked-trip'));
  refused(h.run({ remoteUrl: 'git@github.com:wangch15/travel-planner.git' }), /模板|行程/);
});

test('模板目的地的封存旅程與跨行程偏好檔也不能漏掉（底線開頭不等於模板內容）', (t) => {
  // App 把旅程封存到 trips/_archived/；以前只擋非底線開頭的資料夾，封存旅程與 _profile.md 會被推上公開模板。
  for (const make of [root => fs.mkdirSync(path.join(root, 'trips/_archived/old-trip'), { recursive: true }), root => fs.writeFileSync(path.join(root, 'trips/_profile.md'), '飲食限制')]) {
    const h = harness(t); make(h.root);
    refused(h.run({ remoteUrl: 'git@github.com:wangch15/travel-planner.git' }), /模板|行程/);
  }
  const h = harness(t); fs.writeFileSync(path.join(h.root, 'trips/.DS_Store'), '');
  assert.equal(h.run({ remoteUrl: 'git@github.com:wangch15/travel-planner.git' }).allowed, true, '系統產生的隱藏檔不算行程');
});

test('私有目的地放行，gh 明確查 argv URL 的 repo 而不是 remote 設定', (t) => {
  const h = harness(t);
  assert.equal(h.run({ remoteName: 'upstream', remoteUrl: 'https://github.com/person/actual-push.git' }).allowed, true);
  assert.equal(h.calls.length, 1);
  const c = h.calls[0];
  assert.equal(c.command, 'gh', '不允許先呼叫 git remote 重新猜目的地');
  assert.deepEqual(c.args, ['repo', 'view', 'person/actual-push', '--json', 'visibility']);
  assert.equal(c.options.timeout, 10000);
  assert.equal(c.options.env.GH_HOST, 'github.com', '不能被全域 GH_HOST 改查到別的站');
  assert.equal(c.options.env.GH_PROMPT_DISABLED, '1');
  assert.equal(c.options.stdio[0], 'ignore');
});

for (const visibility of ['INTERNAL', 'private', null, 'UNKNOWN']) {
  test(`不是精確 PRIVATE 就拒絕：${visibility}`, (t) => {
    const h = harness(t); h.response = result(visibility);
    refused(h.run(), /私有|PRIVATE|PUBLIC|判讀/);
  });
}

for (const [name, response, message] of [
  ['未登入', { status: 1, stdout: '', stderr: 'gh auth login required' }, /登入|授權/],
  ['gh 不存在', { status: null, stdout: '', stderr: '', error: { code: 'ENOENT' } }, /安裝.*gh|GitHub CLI/],
  ['查不到', { status: 1, stdout: '', stderr: 'not found' }, /查核|權限/],
  ['無法判讀', { status: 0, stdout: 'not-json', stderr: '' }, /判讀|格式/],
  ['空物件', { status: 0, stdout: '{}', stderr: '' }, /判讀|私有/],
  ['null', { status: 0, stdout: 'null', stderr: '' }, /判讀|格式/],
  ['逾時', { status: null, stdout: '{"visibility":"PRIVATE"}', stderr: '', error: { code: 'ETIMEDOUT' } }, /逾時/],
  ['有 PRIVATE 但退出失敗', { status: 1, stdout: '{"visibility":"PRIVATE"}', stderr: 'error' }, /查核/],
]) {
  test(`gh ${name} fail closed`, (t) => { const h = harness(t); h.response = response; refused(h.run(), message); });
}

test('PUBLIC 無法確定範圍時仍拒絕，並警告舊資料已公開', (t) => {
  const h = harness(t); h.response = result('PUBLIC');
  const r = h.run();
  refused(r, /範圍|歷史/);
  assert.match(r.message, /已經公開|已公開/);
});

test('分支刪除、空 refs、新分支與多 refs 都每次查，不能因資料範圍省略', (t) => {
  const h = harness(t); h.response = result('PUBLIC');
  for (const updates of [deletion, '', update, update + deletion]) {
    const r = h.run({ updates });
    if (updates === deletion) assert.equal(r.allowed, true, '刪除無新增歷史，但仍需目的地查核');
    else refused(r, /PUBLIC/); // 這個 fixture 沒有可供查核的 Git 歷史。
  }
  assert.equal(h.calls.length, 4);
});

test('上次 PRIVATE 不能快取；之後僅改 README 的 push 也偵測 PUBLIC', (t) => {
  const h = harness(t);
  assert.equal(h.run().allowed, true);
  h.response = result('PUBLIC');
  refused(h.run({ updates: update }), /PUBLIC/);
  assert.equal(h.calls.length, 2);
});

for (const remoteUrl of [
  '/tmp/local.git', 'https://github.com.evil.invalid/person/repo',
  'https://github.com/person/repo?token=SECRET', 'https://person:SECRET@github.com/person/repo',
  'ssh://git@untrusted.invalid/person/repo', 'git@alias:person/repo',
  'https://github.com/person/../wangch15/travel-planner', 'https://github.com/person/%72epo',
  'https://github.com/person/repo.git\n', 'git@github.com:wangch15/travel-planner.git\n',
  '', undefined,
]) {
  test(`無法明確解析 GitHub URL 就拒絕，不回退 origin：${String(remoteUrl).replace(/SECRET/g, '<redacted>')}`, (t) => {
    const h = harness(t);
    assert.equal(typeof guard.checkPush, 'function');
    const r = guard.checkPush({ remoteUrl, remoteName: 'origin', updates: update, root: h.root }, {
      run: () => { throw new Error('不能對未知目的地猜 repo'); },
    });
    refused(r, /目的地|網址/);
    assert.ok(!r.message.includes('SECRET'), '錯誤訊息不回顯 URL 中可能的憑證');
  });
}

test('模板 trips 無法讀取時拒絕，不把讀取失敗當成沒有行程', (t) => {
  const h = harness(t);
  fs.rmSync(path.join(h.root, 'trips'), { recursive: true });
  fs.writeFileSync(path.join(h.root, 'trips'), 'not a directory');
  refused(h.run({ remoteUrl: 'git@github.com:wangch15/travel-planner.git' }), /讀取|檢查/);
});
