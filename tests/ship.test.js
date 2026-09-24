const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { gitSandbox } = require('./helpers/git-sandbox.js');

const modulePath = path.join(__dirname, '../scripts/lib/deployment-state.js');
// RED 階段模組尚不存在；先以明確的 API 斷言失敗，不載入舊 ship 而誤跑遠端部署。
const deployment = fs.existsSync(modulePath) ? require(modulePath) : {};
const ACCOUNT = 'a'.repeat(32), OTHER_ACCOUNT = 'b'.repeat(32);
const V1 = '11111111-1111-1111-1111-111111111111';
const V2 = '22222222-2222-2222-2222-222222222222';
const URL = 'https://trip-a.synthetic.workers.dev';
const ok = (stdout) => ({ status: 0, stdout, stderr: '' });
const who = (accounts = [{ id: ACCOUNT, name: 'Synthetic' }]) => ok(JSON.stringify({
  loggedIn: true, email: 'private@example.invalid', authType: 'OAuth Token', accounts,
}));
const history = (version = V1) => ok(JSON.stringify([{
  id: 'deployment-1', created_on: '2026-09-21T00:00:00.000Z', author_email: 'private@example.invalid',
  versions: [{ version_id: version, percentage: 100 }],
}]));
const absent = { status: 1, stdout: '', stderr: `A request to the Cloudflare API (/accounts/${ACCOUNT}/workers/scripts/trip-a/deployments) failed.\nNo such script [code: 10007]` };
const success = ok(`Uploaded trip-a (1 sec)\nDeployed trip-a triggers (1 sec)\n  ${URL}\nCurrent Version ID: ${V2}\n`);
const saved = { schemaVersion: 1, slug: 'trip-a', target: 'workers', name: 'trip-a', accountId: ACCOUNT, url: URL, versionId: V1 };

function harness(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-ship-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stateDir = path.join(root, '.local/deployments');
  const stateFile = path.join(stateDir, 'trip-a.json');
  if (options.state !== undefined) {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(stateFile, typeof options.state === 'string' ? options.state : JSON.stringify(options.state));
  }
  const calls = [], logs = [];
  const runWrangler = (args, settings) => {
    calls.push({ args, settings });
    if (args[0] === 'whoami') return options.who || who();
    if (args[0] === 'deployments') return options.probe || absent;
    if (args[0] === 'deploy' || args[0] === 'pages') return options.result || success;
    throw new Error(`Unexpected Wrangler call ${args.join(' ')}`);
  };
  const config = { title: 'Synthetic', deploy: { name: 'trip-a', target: options.target || 'workers' } };
  const run = () => {
    assert.equal(typeof deployment.deployBuiltTrip, 'function', '缺少可注入 wrangler 的部署入口');
    return deployment.deployBuiltTrip({ slug: 'trip-a', config, outDir: path.join(root, 'dist/trip-a') }, {
      runWrangler, stateDir, env: options.env || {}, log: (s) => logs.push(s),
    });
  };
  return { root, stateDir, stateFile, calls, logs, config, run };
}
function noDeploy(h, pattern) {
  assert.throws(h.run, pattern);
  assert.ok(h.calls.every(({ args }) => ['whoami', 'deployments'].includes(args[0])), '失敗前只允許唯讀呼叫');
}

test('新 Worker：先查身分與遠端，成功後只記真網址與必要身分', (t) => {
  const h = harness(t);
  const result = h.run();
  assert.equal(result.url, URL);
  assert.deepEqual(h.calls.map((c) => c.args[0]), ['whoami', 'deployments', 'deploy']);
  assert.ok(h.calls[0].args.includes('--json'));
  assert.deepEqual(h.calls[1].args.slice(0, 5), ['deployments', 'list', '--name', 'trip-a', '--json']);
  for (const c of h.calls.slice(1)) assert.equal(c.settings.env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT);
  assert.ok(h.logs.some((s) => /首次.*未知|尚未取得/.test(s)));
  assert.ok(!h.logs.join('\n').includes('<你的帳號>'));
  const state = JSON.parse(fs.readFileSync(h.stateFile, 'utf8'));
  assert.deepEqual(state, { ...saved, versionId: V2 });
  assert.ok(!fs.readFileSync(h.stateFile, 'utf8').includes('private@example.invalid'));
});

test('認領紀錄可暫無網址，但正常防撞比對不能被豁免', (t) => {
  const state = { ...saved, url: null, adoption: { deploymentId: 'deployment-1', createdOn: '2026-09-21T00:00:00.000Z' } };
  const h = harness(t, { state, probe: history() });
  h.run();
  assert.ok(h.logs.some((s) => /尚未取得/.test(s)));
  assert.ok(!h.logs.join('\n').includes('網址：null'));
  assert.deepEqual(JSON.parse(fs.readFileSync(h.stateFile)), { ...saved, versionId: V2 });
  noDeploy(harness(t, { state, probe: history(V2) }), /版本|存在/);
});

test('普通或不完整認領紀錄仍不允許空網址', (t) => {
  for (const state of [{ ...saved, url: null }, { ...saved, url: null, adoption: {} }, { ...saved, url: null, adoption: { deploymentId: 'x', createdOn: 'invalid' } }]) {
    noDeploy(harness(t, { state, probe: history() }), /紀錄/);
  }
});

test('同一趟同帳號同 Worker 上次版本才可更新，部署前顯示上次真網址', (t) => {
  const h = harness(t, { state: saved, probe: history() });
  h.run();
  assert.ok(h.logs.some((s) => s.includes(URL) && /上次/.test(s)));
  assert.equal(JSON.parse(fs.readFileSync(h.stateFile)).versionId, V2);
});

for (const [name, options] of [
  ['跨 repo 沒有紀錄', {}],
  ['另一趟的紀錄', { state: { ...saved, slug: 'trip-b' } }],
  ['另一個帳號', { state: { ...saved, accountId: OTHER_ACCOUNT } }],
  ['另一個 Worker 名稱', { state: { ...saved, name: 'trip-b', url: 'https://trip-b.synthetic.workers.dev' } }],
  ['Pages 的紀錄', { state: { ...saved, target: 'pages', url: 'https://trip-a.pages.dev', versionId: undefined } }],
  ['遠端已被別人更新', { state: { ...saved, versionId: V2 } }],
]) {
  test(`已存在 Worker：${name}必須擋，不提供 force 認領`, (t) => {
    noDeploy(harness(t, { probe: history(), ...options }), /存在|紀錄|版本|身分/);
  });
}

for (const [name, probe, pattern] of [
  ['無網路', { status: 1, stdout: '', stderr: 'fetch failed ECONNRESET' }, /網路/],
  ['無權限', { status: 1, stdout: '', stderr: 'Authentication error [code: 10000]' }, /權限|登入/],
  ['泛稱 404', { status: 1, stdout: '', stderr: '404 not found' }, /查核.*失敗|無法查核/],
  ['別個 API 的 10007', { ...absent, stderr: 'No such object [code: 10007]' }, /查核.*失敗|無法查核/],
  ['中斷或逾時', { status: null, stdout: '', stderr: '', error: { code: 'ETIMEDOUT' } }, /逾時|查核.*失敗/],
]) {
  test(`遠端查核${name}不能當成 Worker 不存在`, (t) => {
    noDeploy(harness(t, { probe }), pattern);
  });
}

test('同份輸出即使含 10007，另有權限或網路錯誤時仍停止', (t) => {
  for (const suffix of ['\n403 Forbidden', '\nfetch failed ECONNRESET', '\nNot logged in']) {
    noDeploy(harness(t, { probe: { ...absent, stderr: absent.stderr + suffix } }), /權限|網路|登入/);
  }
});

test('部署部分失敗也不能說目標不存在或建議直接重試', (t) => {
  const h = harness(t, { result: { status: 1, stdout: 'Uploaded worker', stderr: 'trigger setup failed' } });
  assert.throws(h.run, /部署失敗.*遠端.*可能.*更新/);
  assert.ok(!fs.existsSync(h.stateFile));
});

test('紀錄寫入與清理都失敗，不能掩蓋遠端已部署的訊息', (t) => {
  const h = harness(t);
  fs.mkdirSync(h.stateDir, { recursive: true });
  assert.throws(() => deployment.deployBuiltTrip({ slug: 'trip-a', config: h.config, outDir: path.join(h.root, 'dist') }, {
    stateDir: h.stateDir, env: {}, log: () => {}, runWrangler: (args) => {
      if (args[0] === 'whoami') return who();
      if (args[0] === 'deployments') return absent;
      fs.rmSync(h.stateDir, { recursive: true });
      fs.writeFileSync(h.stateDir, 'not a directory');
      return success;
    },
  }), /已部署成功.*紀錄寫入失敗/);
});

test('沒登入時 whoami 失敗就停，不呼叫部署', (t) => {
  const h = harness(t, { who: { status: 1, stdout: '{"loggedIn":false}', stderr: '' } });
  noDeploy(h, /登入/);
  assert.equal(h.calls.length, 1);
});

test('whoami 假成功 loggedIn:false 或格式壞掉也停止', (t) => {
  for (const response of [ok('{"loggedIn":false}'), ok('not json'), who([])]) {
    noDeploy(harness(t, { who: response }), /登入|帳號|格式/);
  }
});

test('whoami 的 null 或損壞帳號列有明確格式錯誤，不丟 TypeError', (t) => {
  for (const response of [ok('null'), who([null]), who([{ name: 'missing id' }])]) {
    noDeploy(harness(t, { who: response }), /格式|帳號/);
  }
});

test('最新部署時間相同但版本不同時不能任選一筆放行', (t) => {
  const a = JSON.parse(history().stdout)[0];
  const b = { ...a, id: 'deployment-2', versions: [{ version_id: V2, percentage: 100 }] };
  noDeploy(harness(t, { state: saved, probe: ok(JSON.stringify([a, b])) }), /版本|無法確認/);
});

test('遠端版本列損壞時有明確錯誤並停止', (t) => {
  const latest = JSON.parse(history().stdout)[0];
  latest.versions = [null];
  noDeploy(harness(t, { state: saved, probe: ok(JSON.stringify([latest])) }), /格式|版本/);
});

test('多帳號必須明確指定，不能猜一個或讓 wrangler 問 stdin', (t) => {
  const accounts = [{ id: ACCOUNT, name: 'A' }, { id: OTHER_ACCOUNT, name: 'B' }];
  noDeploy(harness(t, { who: who(accounts) }), /多個帳號|指定.*帳號/);
  const h = harness(t, { who: who(accounts), env: { CLOUDFLARE_ACCOUNT_ID: ACCOUNT } });
  h.run();
  assert.equal(h.calls[2].settings.env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT);
  noDeploy(harness(t, { who: who(), env: { CLOUDFLARE_ACCOUNT_ID: OTHER_ACCOUNT } }), /帳號.*權限|帳號.*不符/);
});

test('遠端空列表或壞格式不是不存在；沒有已知最新版本就停止', (t) => {
  for (const probe of [ok('[]'), ok('{}'), ok('not json'), ok('[{"versions":[]}]')]) {
    noDeploy(harness(t, { probe, state: saved }), /存在|格式|版本/);
  }
});

test('只能比對最新部署，不能因舊歷史包含上次版本就放行', (t) => {
  const old = JSON.parse(history().stdout)[0];
  const newer = { ...old, id: 'deployment-2', created_on: '2026-09-22T00:00:00.000Z', versions: [{ version_id: V2, percentage: 100 }] };
  for (const list of [[old, newer], [newer, old]]) {
    noDeploy(harness(t, { state: saved, probe: ok(JSON.stringify(list)) }), /版本|存在/);
  }
});

test('流量分到別的版本時，不當成上次單一靜態網站部署', (t) => {
  const latest = JSON.parse(history().stdout)[0];
  latest.versions = [{ version_id: V1, percentage: 50 }, { version_id: V2, percentage: 50 }];
  noDeploy(harness(t, { state: saved, probe: ok(JSON.stringify([latest])) }), /版本|存在/);
});

test('本機紀錄損壞時 fail closed，不把它當不存在', (t) => {
  for (const state of ['{broken', {}, { ...saved, url: 'https://evil.invalid/' }]) {
    noDeploy(harness(t, { state }), /紀錄/);
  }
});

test('部署失敗不建立或覆蓋成功紀錄', (t) => {
  const failure = { status: 1, stdout: URL, stderr: 'deployment error' };
  const first = harness(t, { result: failure });
  assert.throws(first.run, /部署失敗/);
  assert.ok(!fs.existsSync(first.stateFile));
  const repeat = harness(t, { result: failure, state: saved, probe: history() });
  assert.throws(repeat.run, /部署失敗/);
  assert.deepEqual(JSON.parse(fs.readFileSync(repeat.stateFile)), saved);
});

test('部署成功但沒有可驗證的 URL 或版本，不編網址也不聲稱未部署', (t) => {
  for (const stdout of [
    'Uploaded only',
    `https://wrong.synthetic.workers.dev\nCurrent Version ID: ${V2}`,
    `https://trip-a.synthetic.workers.dev.evil.invalid\nCurrent Version ID: ${V2}`,
    `https://trip-a.synthetic.workers.dev\nCurrent Version ID: unknown`,
    `https://trip-a.synthetic.workers.dev\nhttps://trip-a.other.workers.dev\nCurrent Version ID: ${V2}`,
  ]) {
    const h = harness(t, { result: ok(stdout) });
    assert.throws(h.run, /已部署.*紀錄/);
    assert.ok(!fs.existsSync(h.stateFile));
  }
});

test('ANSI 與 CRLF、stderr 的網址可解析；快取不能混入 wrangler 原始輸出', (t) => {
  const h = harness(t, { result: { status: 0, stdout: `Current Version ID: ${V2}\r\n`, stderr: `\u001b[32m  ${URL}\u001b[0m\r\n` } });
  h.run();
  assert.equal(JSON.parse(fs.readFileSync(h.stateFile)).url, URL);
});

test('不同帳號的新 Worker 不印舊帳號網址，成功後更新本機綁定', (t) => {
  const h = harness(t, { state: { ...saved, accountId: OTHER_ACCOUNT } });
  h.run();
  assert.ok(h.logs[0].includes('尚未取得') || h.logs.some((s) => /尚未取得/.test(s)));
  assert.equal(JSON.parse(fs.readFileSync(h.stateFile)).accountId, ACCOUNT);
});

test('Pages 只記實際輸出網址，不套用 Worker deployments list 或宣稱 Worker 防撞', (t) => {
  const url = 'https://build123.trip-a.pages.dev';
  const h = harness(t, { target: 'pages', result: ok(`Deployment complete! Take a peek over at ${url}`) });
  h.run();
  assert.deepEqual(h.calls.map((c) => c.args[0]), ['whoami', 'pages']);
  assert.equal(JSON.parse(fs.readFileSync(h.stateFile)).url, url);
  assert.ok(h.logs.some((s) => /Pages.*不.*防撞/.test(s)));
});

test('成功部署後寫入紀錄失敗，仍明說遠端已部署，不留下半份紀錄', (t) => {
  const h = harness(t);
  fs.mkdirSync(h.stateDir, { recursive: true });
  // 模擬另一個程序在部署期間建立了同名目錄，rename 必須失敗。
  const run = deployment.deployBuiltTrip;
  assert.equal(typeof run, 'function');
  assert.throws(() => run({ slug: 'trip-a', config: h.config, outDir: path.join(h.root, 'dist') }, {
    stateDir: h.stateDir, env: {}, log: () => {}, runWrangler: (args) => {
      if (args[0] === 'whoami') return who();
      if (args[0] === 'deployments') return absent;
      fs.mkdirSync(h.stateFile);
      return success;
    },
  }), /已部署成功.*紀錄寫入失敗/);
  assert.deepEqual(fs.readdirSync(h.stateDir), ['trip-a.json']);
});

test('ship CLI 接上保護：可匯入、使用 runner 替身、拒絕時非零退出', (t) => {
  const repo = gitSandbox(t);
  const root = path.join(__dirname, '..');
  for (const dir of ['src', 'public', 'trips/_example', 'packages/engine']) {
    fs.cpSync(path.join(root, dir), path.join(repo.dir, dir), { recursive: true });
  }
  const source = fs.readFileSync(path.join(repo.dir, 'scripts/ship.js'), 'utf8');
  assert.match(source, /require\.main === module/, 'ship 必須可安全匯入，不能載入就部署');
  const { main } = require(path.join(repo.dir, 'scripts/ship.js'));
  const logs = [], calls = [];
  const status = main(['_example'], {
    env: {}, stateDir: path.join(repo.dir, '.local/deployments'), log: (s) => logs.push(s),
    error: (s) => logs.push(s), runWrangler: (args) => { calls.push(args); return who(); },
  });
  assert.equal(status, 1, 'deployments 回傳非列表必須拒絕');
  assert.deepEqual(calls.map((args) => args[0]), ['whoami', 'deployments']);
  assert.ok(logs.some((s) => /格式|存在/.test(s)));
});

test('正式 runner 使用本機 binary、關閉 stdin 與 telemetry，可由測試完全替換程序', (t) => {
  const repo = gitSandbox(t);
  repo.write('node_modules/wrangler/package.json', JSON.stringify({ name: 'wrangler', version: '4.135.0' }));
  // 只提供空 binary 路徑；若替身失效，也沒有可執行的真實 wrangler。
  const script = `
    const cp = require('node:child_process');
    cp.spawnSync = (command, args, options) => ({
      status: 0, stdout: JSON.stringify({ command, args, stdio: options.stdio,
        ci: options.env.CI, metrics: options.env.WRANGLER_SEND_METRICS,
        account: options.env.CLOUDFLARE_ACCOUNT_ID }), stderr: ''
    });
    const { runWrangler } = require('./scripts/lib/deployment-state.js');
    const r = runWrangler(['whoami', '--json'], { env: { CLOUDFLARE_ACCOUNT_ID: '${ACCOUNT}' } });
    process.stdout.write(r.stdout);
  `;
  const result = JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: repo.dir, encoding: 'utf8' }));
  assert.equal(result.command, process.execPath);
  assert.ok(result.args[0].endsWith('/node_modules/wrangler/bin/wrangler.js'));
  assert.deepEqual(result.args.slice(1), ['whoami', '--json']);
  assert.deepEqual(result.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(result.ci, 'true');
  assert.equal(result.metrics, 'false');
  assert.equal(result.account, ACCOUNT);
});

test('wrangler 固定在已核對 JSON 格式的 4.135.0', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json')));
  assert.equal(pkg.devDependencies.wrangler, '4.135.0');
});

test('部署紀錄目錄必須 gitignore，其他引擎檔不能被一起忽略', (t) => {
  const h = harness(t);
  fs.copyFileSync(path.join(__dirname, '../.gitignore'), path.join(h.root, '.gitignore'));
  execFileSync('git', ['init', '-q'], { cwd: h.root });
  const ignored = execFileSync('git', ['check-ignore', '--stdin'], {
    cwd: h.root, input: '.local/deployments/trip-a.json\nscripts/ship.js\n', encoding: 'utf8',
  });
  assert.equal(ignored.trim(), '.local/deployments/trip-a.json');
});

test('Pages：wrangler 現在回 workers.dev 網址，要認得、要記得下來', (t) => {
  // Cloudflare 已把 Pages 併進 Workers。實測 wrangler pages deploy 回的是
  // <name>.<帳號>.workers.dev，不是 <name>.pages.dev。原本只驗 pages.dev，
  // 導致每次 Pages 部署都停在「無法辨識唯一的真實網址」，紀錄永遠寫不進去。
  const url = 'https://trip-a.synthetic.workers.dev';
  const h = harness(t, { target: 'pages', result: ok(`Deployed trip-a triggers (1 sec)\n  ${url}\n`) });
  h.run();
  assert.equal(JSON.parse(fs.readFileSync(h.stateFile)).url, url);
});

test('Pages：部署要在產出目錄裡執行，不能讓 repo 根目錄的 wrangler 設定劫持內容', (t) => {
  // wrangler pages deploy 會在 cwd 產生 wrangler.jsonc（assets.directory: "src"）。
  // 那個檔案一存在，之後每次部署都改去發佈 src/——未編譯的模板——而且回報成功。
  const h = harness(t, { target: 'pages' });
  h.run();
  const call = h.calls.find((c) => c.args[0] === 'pages');
  assert.ok(call, '應該呼叫 pages deploy');
  assert.equal(call.settings.cwd, path.join(h.root, 'dist/trip-a'),
    'pages deploy 必須以產出目錄為 cwd，否則會讀到 repo 根目錄的 wrangler 設定');
  assert.ok(!call.args.some((a) => String(a).includes(h.root) && String(a).includes('dist')),
    '以 outDir 為 cwd 時應該用相對路徑，不要再帶絕對路徑');
});

test('新帳號還沒有 workers.dev 網址名稱：明確說明下一步，不寫部署紀錄', (t) => {
  const h = harness(t, { result: { status: 1, stdout: '', stderr: '✘ [ERROR] You need to register a workers.dev subdomain before publishing to workers.dev' } });
  assert.throws(() => h.run(), (error) => error.code === 'WORKERS_SUBDOMAIN_REQUIRED' && error.notDeployed === true && /Workers 和 Pages/.test(error.message) && /沒有上線/.test(error.message));
  assert.equal(fs.existsSync(h.stateFile), false);
});
