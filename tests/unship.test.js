const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePath = path.join(__dirname, '../scripts/lib/unship.js');
const mod = fs.existsSync(modulePath) ? require(modulePath) : {};
const ACCOUNT = 'a'.repeat(32);
const V1 = '11111111-1111-1111-1111-111111111111';
const URL = 'https://trip-a.synthetic.workers.dev';
const ok = (stdout) => ({ status: 0, stdout, stderr: '' });
const who = ok(JSON.stringify({ loggedIn: true, accounts: [{ id: ACCOUNT, name: 'Synthetic' }] }));
const present = ok(JSON.stringify([{
  id: 'deployment-1', created_on: '2026-09-21T00:00:00.000Z',
  versions: [{ version_id: V1, percentage: 100 }],
}]));
const absent = { status: 1, stdout: '', stderr: `A request to the Cloudflare API (/accounts/${ACCOUNT}/workers/scripts/trip-a/deployments) failed.\nNo such script [code: 10007]` };
const saved = { schemaVersion: 1, slug: 'trip-a', target: 'workers', name: 'trip-a', accountId: ACCOUNT, url: URL, versionId: V1 };

function harness(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-unship-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stateDir = path.join(root, '.local/deployments');
  const stateFile = path.join(stateDir, 'trip-a.json');
  if (options.state !== undefined) {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(options.state));
  }
  // 行程資料：unship 絕對不能碰它
  const trip = path.join(root, 'trips/trip-a');
  fs.mkdirSync(path.join(trip, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(trip, 'data.js'), 'const DAYS=[];');
  fs.writeFileSync(path.join(trip, 'docs/status.md'), '# trip-a 進度\n\n- shipped：已部署\n');
  const calls = [], logs = [];
  let deleted = false;
  const runWrangler = (args) => {
    calls.push(args);
    if (args[0] === 'whoami') return options.who || who;
    if (args[0] === 'deployments') {
      if (options.probe) return options.probe;
      return deleted ? absent : present;
    }
    if (args[0] === 'delete') { if (!options.deleteFails) deleted = true; return options.deleteResult || ok('Deleted trip-a'); }
    throw new Error(`Unexpected wrangler call ${args.join(' ')}`);
  };
  const config = { title: 'Synthetic', deploy: { name: 'trip-a', target: options.target || 'workers' } };
  const run = (confirm) => {
    assert.equal(typeof mod.unshipTrip, 'function', '缺少可注入 wrangler 的下線入口');
    return mod.unshipTrip({ slug: 'trip-a', config }, {
      runWrangler, stateDir, root, confirm, log: (s) => logs.push(s),
    });
  };
  return { root, stateDir, stateFile, trip, calls, logs, run };
}

test('第一段唯讀：印出會停止服務的網址與不會被刪的東西，發查核編號', (t) => {
  const h = harness(t, { state: saved });
  const r = h.run(undefined);
  assert.equal(r.status, 'awaiting-confirmation');
  assert.match(r.receipt, /^[a-f0-9]{64}$/);
  assert.ok(h.calls.every((a) => ['whoami', 'deployments'].includes(a[0])), '第一段只能唯讀');
  const out = h.logs.join('\n');
  assert.ok(out.includes(URL), '要印出即將停止服務的網址');
  assert.ok(/trips\//.test(out), '要說明行程資料不會被刪');
  assert.ok(/不會|保留|留著/.test(out), '要明講哪些東西保留');
  assert.ok(/查核編號不代表人已同意/.test(out), '要講明編號不是同意證明');
});

test('沒有本機紀錄就拒絕——不能刪到別人的 Worker', (t) => {
  const h = harness(t);
  assert.throws(() => h.run(undefined), /紀錄|adopt/);
  assert.ok(!h.calls.some((a) => a[0] === 'delete'), '不可呼叫 delete');
});

test('遠端版本與紀錄不符就拒絕', (t) => {
  const h = harness(t, { state: { ...saved, versionId: '99999999-9999-9999-9999-999999999999' } });
  assert.throws(() => h.run(undefined), /不符|不是/);
  assert.ok(!h.calls.some((a) => a[0] === 'delete'));
});

test('錯誤或過期的查核編號不能刪', (t) => {
  const h = harness(t, { state: saved });
  h.run(undefined);
  assert.throws(() => h.run('0'.repeat(64)), /收據|編號/);
  assert.ok(!h.calls.some((a) => a[0] === 'delete'));
});

test('確認後刪除，並且刪完要再查一次確認真的不見了', (t) => {
  const h = harness(t, { state: saved });
  const first = h.run(undefined);
  const r = h.run(first.receipt);
  assert.equal(r.status, 'unshipped');
  const kinds = h.calls.map((a) => a[0]);
  assert.ok(kinds.includes('delete'), '要呼叫 delete');
  // delete 之後還要有一次 deployments 查核——不能只相信 wrangler 的退出碼
  assert.ok(kinds.lastIndexOf('deployments') > kinds.indexOf('delete'),
    '刪完必須再查一次遠端，確認 Worker 真的不存在');
  assert.equal(fs.existsSync(h.stateFile), false, '本機部署紀錄要清掉，之後 ship 視為首次部署');
});

test('wrangler 說刪了但遠端還在 → 誠實回報，不謊報下線', (t) => {
  const h = harness(t, { state: saved, deleteFails: true });
  const first = h.run(undefined);
  assert.throws(() => h.run(first.receipt), /仍然存在|沒有刪|dashboard|手動/);
  assert.equal(fs.existsSync(h.stateFile), true, '沒有真的下線就不該清掉紀錄');
});

test('絕對不碰 trips/ 底下的東西', (t) => {
  const h = harness(t, { state: saved });
  const before = fs.readdirSync(h.trip).sort();
  const first = h.run(undefined);
  h.run(first.receipt);
  assert.deepEqual(fs.readdirSync(h.trip).sort(), before, '行程資料夾的檔案不可增減');
  assert.equal(fs.readFileSync(path.join(h.trip, 'data.js'), 'utf8'), 'const DAYS=[];');
});

test('成功下線後更新 status.md 的 shipped 欄位', (t) => {
  const h = harness(t, { state: saved });
  const first = h.run(undefined);
  h.run(first.receipt);
  const status = fs.readFileSync(path.join(h.trip, 'docs/status.md'), 'utf8');
  assert.ok(/已下線|下線/.test(status), `status.md 的 shipped 要反映已下線：\n${status}`);
});

test('不支援 Pages', (t) => {
  const h = harness(t, { state: { ...saved, target: 'pages' }, target: 'pages' });
  assert.throws(() => h.run(undefined), /Pages/);
});
