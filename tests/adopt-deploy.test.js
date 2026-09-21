const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gitSandbox } = require('./helpers/git-sandbox.js');
const { deployBuiltTrip } = require('../scripts/lib/deployment-state.js');
const modulePath = path.join(__dirname, '../scripts/lib/adopt-deployment.js');
const adoption = fs.existsSync(modulePath) ? require(modulePath) : {};
const A = 'a'.repeat(32), B = 'b'.repeat(32);
const V1 = '11111111-1111-1111-1111-111111111111', V2 = '22222222-2222-2222-2222-222222222222';
const ok = (data) => ({ status: 0, stdout: JSON.stringify(data), stderr: '' });
const identity = { slug: 'trip-a', target: 'workers', name: 'trip-a', accountId: A };
const saved = { schemaVersion: 1, ...identity, versionId: V1, url: 'https://trip-a.synthetic.workers.dev' };
const latest = { id: 'deployment-1', created_on: '2026-09-21T00:00:00.000Z', versions: [{ version_id: V1, percentage: 100 }] };

function harness(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-adopt-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stateDir = path.join(root, '.local/deployments');
  const record = path.join(stateDir, 'trip-a.json');
  const pending = path.join(stateDir, 'pending/trip-a.json');
  const h = {
    root, stateDir, record, pending, calls: [], logs: [], env: {}, config: { deploy: { name: 'trip-a', target: 'workers' } },
    who: ok({ loggedIn: true, email: 'do-not-store@example.invalid', accounts: [{ id: A, name: 'Synthetic account' }] }),
    list: ok([latest]),
  };
  h.runner = (args, options) => {
    h.calls.push({ args, options });
    assert.ok(['whoami', 'deployments'].includes(args[0]), '認領過程只能唯讀，不准 deploy/delete/login');
    const file = args[args.indexOf('--config') + 1];
    assert.equal(JSON.parse(fs.readFileSync(file)).name, h.config.deploy.name, '查核使用隔離的最小 config');
    if (args[0] === 'whoami') return h.who;
    assert.equal(options.env.CLOUDFLARE_ACCOUNT_ID, JSON.parse(h.who.stdout).accounts[0].id);
    return h.list;
  };
  h.run = (confirm) => {
    assert.equal(typeof adoption.adoptDeployment, 'function', '缺少兩段式認領入口');
    return adoption.adoptDeployment({ slug: 'trip-a', config: h.config }, {
      stateDir, env: h.env, runWrangler: h.runner, log: (s) => h.logs.push(s), confirm,
    });
  };
  h.writeRecord = (value) => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(record, typeof value === 'string' ? value : JSON.stringify(value));
  };
  return h;
}

test('inspect 只列事實與提問，不建立正式紀錄或猜網址', (t) => {
  const h = harness(t);
  const r = h.run();
  assert.match(r.receipt, /^[a-f0-9]{64}$/);
  assert.equal(r.status, 'awaiting-confirmation');
  assert.ok(!fs.existsSync(h.record));
  assert.ok(fs.existsSync(h.pending));
  const text = h.logs.join('\n');
  for (const fact of [A, 'Synthetic account', 'trip-a', latest.created_on, V1]) assert.ok(text.includes(fact));
  assert.match(text, /網址.*未知/);
  assert.match(text, /這是你這趟行程的網站嗎.*deploy\.name/);
  assert.ok(!text.includes('<你的帳號>'));
  assert.ok(!text.includes('do-not-store@example.invalid'));
  assert.deepEqual(h.calls.map((c) => c.args[0]), ['whoami', 'deployments']);
  assert.ok(!fs.readFileSync(h.pending, 'utf8').includes('do-not-store@example.invalid'));
});

test('confirm 必須重查，事實相符才寫 url=null，然後回到正常 ship', (t) => {
  const h = harness(t);
  const r = h.run();
  h.calls.length = 0;
  const accepted = h.run(r.receipt);
  assert.equal(accepted.status, 'adopted');
  assert.deepEqual(h.calls.map((c) => c.args[0]), ['whoami', 'deployments']);
  assert.ok(!fs.existsSync(h.pending));
  const record = JSON.parse(fs.readFileSync(h.record));
  assert.deepEqual(record, { ...saved, url: null, adoption: { deploymentId: latest.id, createdOn: latest.created_on } });
  const shipCalls = [], logs = [];
  const result = deployBuiltTrip({ slug: 'trip-a', config: h.config, outDir: path.join(h.root, 'dist') }, {
    stateDir: h.stateDir, env: {}, log: (s) => logs.push(s), runWrangler: (args) => {
      shipCalls.push(args[0]);
      if (args[0] === 'whoami') return h.who;
      if (args[0] === 'deployments') return h.list;
      return { status: 0, stdout: `https://trip-a.synthetic.workers.dev\nCurrent Version ID: ${V2}`, stderr: '' };
    },
  });
  assert.deepEqual(shipCalls, ['whoami', 'deployments', 'deploy']);
  assert.ok(logs.some((s) => /尚未取得/.test(s)));
  assert.ok(!logs.some((s) => /網址：null/.test(s)));
  assert.equal(result.url, saved.url);
  assert.equal(result.versionId, V2);
  assert.ok(!('adoption' in JSON.parse(fs.readFileSync(h.record))), '成功後就是正常部署紀錄，不留豁免');
});

for (const state of [saved, '{broken', {}, { ...saved, url: null }]) {
  test(`既有／損壞紀錄不能被認領覆蓋：${typeof state === 'string' ? 'broken' : JSON.stringify(state)}`, (t) => {
    const h = harness(t);
    h.writeRecord(state);
    const before = fs.readFileSync(h.record, 'utf8');
    assert.throws(() => h.run(), /已.*紀錄|紀錄.*損壞/);
    assert.equal(fs.readFileSync(h.record, 'utf8'), before);
    assert.equal(h.calls.length, 0);
  });
}

test('無 pending、錯查核編號與重用編號都不能寫正式紀錄', (t) => {
  const h = harness(t);
  assert.throws(() => h.run('f'.repeat(64)), /查核|收據/);
  const first = h.run();
  assert.throws(() => h.run('f'.repeat(64)), /查核|收據/);
  assert.ok(!fs.existsSync(h.record));
  const second = h.run();
  assert.notEqual(first.receipt, second.receipt);
  assert.throws(() => h.run(first.receipt), /查核|收據/);
  h.run(second.receipt);
  assert.throws(() => h.run(second.receipt), /已.*紀錄/);
});

for (const [name, change] of [
  ['版本', (h) => { h.list = ok([{ ...latest, versions: [{ version_id: V2, percentage: 100 }] }]); }],
  ['部署 ID（版本不變）', (h) => { h.list = ok([{ ...latest, id: 'deployment-2' }]); }],
  ['部署時間', (h) => { h.list = ok([{ ...latest, created_on: '2026-09-22T00:00:00.000Z' }]); }],
  ['帳號 ID', (h) => { h.who = ok({ loggedIn: true, accounts: [{ id: B, name: 'Synthetic account' }] }); }],
  ['帳號名稱', (h) => { h.who = ok({ loggedIn: true, accounts: [{ id: A, name: 'Renamed account' }] }); }],
  ['Worker 名稱', (h) => { h.config.deploy.name = 'trip-b'; }],
]) {
  test(`人確認前${name}變動就失效，不能沿用舊同意`, (t) => {
    const h = harness(t), r = h.run();
    change(h);
    assert.throws(() => h.run(r.receipt), /變更|已變|重新查核/);
    assert.ok(!fs.existsSync(h.record));
    assert.ok(!fs.existsSync(h.pending), '變動後舊收據必須失效');
  });
}

test('收據不能跨 slug；損壞 pending 不能被 confirm 接受', (t) => {
  const h = harness(t), r = h.run();
  const p = JSON.parse(fs.readFileSync(h.pending));
  p.facts.slug = 'trip-b';
  fs.writeFileSync(h.pending, JSON.stringify(p));
  assert.throws(() => h.run(r.receipt), /變更|已變|查核|收據/);
  assert.ok(!fs.existsSync(h.record));
  fs.writeFileSync(h.pending, '{broken');
  assert.throws(() => h.run(r.receipt), /查核|收據/);
});

for (const [name, response] of [
  ['不存在', { status: 1, stdout: '', stderr: `A request to the Cloudflare API (/accounts/${A}/workers/scripts/trip-a/deployments) failed.\nNo such script [code: 10007]` }],
  ['斷網', { status: 1, stdout: '', stderr: 'fetch failed' }],
  ['權限不足', { status: 1, stdout: '', stderr: '403 Forbidden' }],
  ['未知錯誤', { status: 1, stdout: '', stderr: 'unknown' }],
  ['空列表', ok([])],
  ['壞格式', ok({})],
  ['缺部署 ID', ok([{ ...latest, id: undefined }])],
  ['非字串部署時間', ok([{ ...latest, created_on: 2020 }])],
  ['混合版本', ok([{ ...latest, versions: [{ version_id: V1, percentage: 50 }, { version_id: V2, percentage: 50 }] }])],
]) {
  test(`查核${name}停止，inspect 與 confirm 都不寫正式紀錄`, (t) => {
    const h = harness(t);
    const r = h.run();
    h.list = response;
    assert.throws(() => h.run(r.receipt));
    assert.ok(!fs.existsSync(h.record));
    assert.throws(() => h.run());
    assert.ok(!fs.existsSync(h.record));
  });
}

test('未登入、帳號名稱缺漏與 Pages 不會產生認領紀錄', (t) => {
  const h = harness(t);
  h.who = ok({ loggedIn: false });
  assert.throws(() => h.run(), /登入/);
  h.who = ok({ loggedIn: true, accounts: [{ id: A }] });
  assert.throws(() => h.run(), /帳號.*名稱/);
  h.config.deploy.target = 'pages';
  assert.throws(() => h.run(), /Workers/);
  assert.ok(!fs.existsSync(h.record));
});

test('confirm 遠端查核期間產生正式紀錄時不得覆蓋', (t) => {
  const h = harness(t), r = h.run();
  const previousRunner = h.runner;
  h.runner = (args, options) => {
    const result = previousRunner(args, options);
    if (args[0] === 'deployments') h.writeRecord(saved);
    return result;
  };
  assert.throws(() => h.run(r.receipt), /已.*紀錄/);
  assert.deepEqual(JSON.parse(fs.readFileSync(h.record)), saved);
});

test('Worker 名稱不是明確合法字串時，在任何外部呼叫前拒絕', (t) => {
  for (const name of [undefined, null, 123, '', '../escape']) {
    const h = harness(t);
    h.config.deploy.name = name;
    assert.throws(() => h.run(), /名稱不合法/);
    assert.equal(h.calls.length, 0);
  }
});

test('缺 deploy 設定時給目標錯誤，不因 TypeError 失敗或呼叫遠端', (t) => {
  for (const value of [undefined, null]) {
    const h = harness(t);
    h.config.deploy = value;
    assert.throws(() => h.run(), /Worker 名稱不合法/);
    assert.equal(h.calls.length, 0);
  }
});

test('正式紀錄以原子且排他的方式發布，最後一刻撞到既有檔也不覆蓋', (t) => {
  const h = harness(t), r = h.run();
  const link = fs.linkSync;
  try {
    fs.linkSync = (from, to) => {
      h.writeRecord(saved); // ensureUnrecorded 之後、發布之前的競態。
      return link(from, to);
    };
    assert.throws(() => h.run(r.receipt), /已.*紀錄/);
  } finally { fs.linkSync = link; }
  assert.deepEqual(JSON.parse(fs.readFileSync(h.record)), saved);
  assert.ok(!fs.readdirSync(h.stateDir).some((s) => s.endsWith('.tmp')));
});

test('npm 暴露獨立 adopt-deploy 指令，不是 ship 旗標', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json')));
  assert.equal(pkg.scripts['adopt-deploy'], 'node scripts/adopt-deploy.js');
});

test('CLI 嚴格要求 slug／查核編號，只查核不 build 或部署', (t) => {
  const repo = gitSandbox(t);
  repo.write('trips/synthetic/trip.config.json', JSON.stringify({ deploy: { name: 'trip-a', target: 'workers' } }));
  const script = path.join(repo.dir, 'scripts/adopt-deploy.js');
  assert.ok(fs.existsSync(script), '缺少獨立 adopt-deploy CLI');
  const { main } = require(script);
  const calls = [], logs = [];
  const options = { stateDir: path.join(repo.dir, '.local/deployments'), env: {}, log: (s) => logs.push(s), error: (s) => logs.push(s), runWrangler: (args) => {
    calls.push(args[0]);
    return args[0] === 'whoami' ? ok({ loggedIn: true, accounts: [{ id: A, name: 'Synthetic' }] }) : ok([latest]);
  } };
  for (const args of [[], ['--force'], ['synthetic', '--confirm'], ['synthetic', '--confirm', 'yes'], ['synthetic', '--force'], ['synthetic', 'extra']]) {
    assert.equal(main(args, options), 1);
  }
  assert.equal(calls.length, 0);
  assert.equal(main(['synthetic'], options), 0);
  assert.deepEqual(calls, ['whoami', 'deployments']);
  assert.ok(!fs.existsSync(path.join(repo.dir, 'dist')));
  assert.ok(!fs.existsSync(path.join(options.stateDir, 'synthetic.json')));
  const receipt = JSON.parse(fs.readFileSync(path.join(options.stateDir, 'pending/synthetic.json'))).receipt;
  assert.equal(main(['synthetic', '--confirm', receipt], options), 0);
  assert.equal(main(['synthetic', '--confirm', receipt], options), 1);
});
