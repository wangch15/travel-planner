// 本機部署連續性紀錄；不是 Cloudflare 的所有權憑證或遠端原子鎖。
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('./paths.js');

const STATE_DIR = path.join(ROOT, '.local', 'deployments');
const ID = /^[a-f0-9]{32}$/i;
const VERSION = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const NOT_LOGGED_IN = /not authenticated|not logged in|"loggedIn"\s*:\s*false/i;
const AUTH_FAILURE = /\b(?:401|403)\b|\[code:\s*(?:10000|9109|9106)\]|authentication|permission|unauthorized|forbidden/i;
const NETWORK_FAILURE = /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|network|timed? ?out/i;
const clean = (s) => String(s || '').replace(/\x1b\[[0-9;]*m/g, '');
const output = (r) => clean(`${r.stdout || ''}\n${r.stderr || ''}`);

// 非互動，stdin 關閉。只執行已安裝的版本，不讓 npx 臨時下載不同版本。
function runWrangler(args, { cwd = ROOT, env = {} } = {}) {
  let bin;
  try {
    bin = path.join(path.dirname(require.resolve('wrangler/package.json')), 'bin', 'wrangler.js');
  } catch {
    throw new Error('找不到專案的 wrangler，請先完成 npm install。');
  }
  return spawnSync(process.execPath, [bin, ...args], {
    cwd, env: { ...process.env, ...env, CI: 'true', NO_COLOR: '1', FORCE_COLOR: '0', WRANGLER_SEND_METRICS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024,
  });
}

function validUrl(value, name, target) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.pathname !== '/' || u.search || u.hash) return false;
    const labels = u.hostname.split('.');
    const workersDev = labels.length === 4 && labels[0] === name && labels[2] === 'workers' && labels[3] === 'dev';
    if (target === 'workers') return workersDev;
    // Cloudflare 已把 Pages 併進 Workers：wrangler pages deploy 現在回的是
    // <name>.<帳號>.workers.dev。舊的 pages.dev 形式仍要接受（既有專案還在用）。
    return workersDev || u.hostname === `${name}.pages.dev` ||
      (u.hostname.endsWith(`.${name}.pages.dev`) && labels.length === 4);
  } catch { return false; }
}

function statePath(slug, stateDir) {
  if (!/^_?[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('部署紀錄的 slug 不合法。');
  return path.join(stateDir, `${slug}.json`);
}

function readState(file) {
  let data;
  try { data = fs.readFileSync(file, 'utf8'); }
  catch (e) {
    if (e.code === 'ENOENT') return null;
    throw new Error('無法讀取本機部署紀錄，停止部署；請檢查檔案權限。');
  }
  try {
    const s = JSON.parse(data);
    const adoptedWithoutUrl = s && s.target === 'workers' && s.url === null &&
      typeof s.adoption?.deploymentId === 'string' && s.adoption.deploymentId.length > 0 &&
      typeof s.adoption.createdOn === 'string' && Number.isFinite(Date.parse(s.adoption.createdOn));
    if (s.schemaVersion !== 1 || typeof s.slug !== 'string' || !NAME.test(s.name) || !ID.test(s.accountId) ||
      !['workers', 'pages'].includes(s.target) || (!adoptedWithoutUrl && !validUrl(s.url, s.name, s.target)) ||
      (s.target === 'workers' && !VERSION.test(s.versionId))) throw new Error('invalid');
    return s;
  } catch {
    throw new Error('本機部署紀錄格式損壞，停止部署；不要刪掉紀錄或手填網址來繞過檢查。');
  }
}

function failure(r, phase) {
  const text = output(r);
  if (NOT_LOGGED_IN.test(text)) {
    return new Error(`${phase}失敗：尚未登入 Cloudflare，請先完成登入授權。`);
  }
  if (AUTH_FAILURE.test(text)) {
    return new Error(`${phase}失敗：Cloudflare 登入失效或權限不足，停止；請確認帳號與 Workers 權限。`);
  }
  if (r.error || NETWORK_FAILURE.test(text)) {
    return new Error(`${phase}失敗：網路、程序啟動或逾時問題，停止；恢復連線後重新查核。`);
  }
  if (phase === '部署') return new Error(`部署失敗（退出碼 ${r.status ?? '未知'}）；遠端可能已部分更新，請查核後再決定，不直接重試，成功紀錄未更新。`);
  return new Error(`${phase}失敗（退出碼 ${r.status ?? '未知'}），不能判定目標不存在；停止，請檢查 wrangler 的錯誤。`);
}

function accountInfo(r, env) {
  if (r.status !== 0 || r.error) throw failure(r, '帳號查核');
  let info;
  try { info = JSON.parse(clean(r.stdout)); }
  catch { throw new Error('whoami 回應格式無法辨識，停止；需要支援 --json 的 wrangler。'); }
  if (!info || typeof info !== 'object') throw new Error('whoami 回應格式不合法，停止部署。');
  if (info.loggedIn !== true) throw new Error('尚未登入 Cloudflare，停止部署。');
  if (!Array.isArray(info.accounts) || !info.accounts.length || info.accounts.some((a) => !a || !ID.test(a.id))) {
    throw new Error('無法確認 Cloudflare 帳號或帳號權限，停止部署。');
  }
  const requested = env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID;
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CF_ACCOUNT_ID && env.CLOUDFLARE_ACCOUNT_ID !== env.CF_ACCOUNT_ID) {
    throw new Error('Cloudflare 帳號設定不符，停止；兩個帳號環境變數互相矛盾。');
  }
  if (requested) {
    if (!info.accounts.some((a) => a.id === requested)) throw new Error('指定帳號不在登入帳號權限內，停止部署。');
    return info.accounts.find((a) => a.id === requested);
  }
  if (info.accounts.length !== 1) throw new Error('有多個帳號，請明確指定 CLOUDFLARE_ACCOUNT_ID 後重新查核；不能猜帳號。');
  return info.accounts[0];
}

// null 僅代表精確的 Worker-not-found；空部署列表不是不存在。
function readWorkerDeployment(r, account, name) {
  if (r.status !== 0 || r.error) {
    // 只有本次 deployments API 的精確 Worker-not-found 錯誤才表示可新建。
    const text = output(r);
    const endpoint = `/accounts/${account}/workers/scripts/${name}/deployments`;
    const codes = [...text.matchAll(/\[code:\s*(\d+)\]/g)].map((m) => m[1]);
    if (!r.error && r.status === 1 && !NOT_LOGGED_IN.test(text) && !AUTH_FAILURE.test(text) && !NETWORK_FAILURE.test(text) &&
      text.includes(`(${endpoint})`) && codes.length === 1 && codes[0] === '10007') return null;
    throw failure(r, '遠端查核');
  }
  let list;
  try { list = JSON.parse(clean(r.stdout)); }
  catch { throw new Error('遠端部署列表格式無法辨識，停止部署。'); }
  if (!Array.isArray(list) || list.some((d) => !d || !Number.isFinite(Date.parse(d.created_on)) || !Array.isArray(d.versions) ||
    d.versions.some((v) => !v || !VERSION.test(v.version_id) || typeof v.percentage !== 'number'))) {
    throw new Error('遠端部署列表格式不合法，停止部署。');
  }
  const latest = [...list].sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
  if (latest && list.filter((d) => Date.parse(d.created_on) === Date.parse(latest.created_on)).length !== 1) {
    throw new Error('遠端部署時間相同，無法確認唯一的最新版本，停止部署。');
  }
  if (!latest) throw new Error('Worker 已存在但沒有可確認的最新部署版本，停止。');
  return latest;
}

function inspectWorker(name, configFile, { runWrangler: run = runWrangler, env = process.env } = {}) {
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error('Worker 名稱不合法。');
  const account = accountInfo(run(['whoami', '--json', '--config', configFile], { env }), env);
  const result = run(['deployments', 'list', '--name', name, '--json', '--config', configFile], {
    env: { ...env, CLOUDFLARE_ACCOUNT_ID: account.id, CF_ACCOUNT_ID: account.id },
  });
  return { accountId: account.id, accountName: account.name, latest: readWorkerDeployment(result, account.id, name) };
}

function checkWorker(r, account, name, state, matches) {
  const latest = readWorkerDeployment(r, account, name);
  if (latest === null) return;
  if (!matches || latest.versions.length !== 1 || latest.versions[0].version_id !== state.versionId || latest.versions[0].percentage !== 100) {
    throw new Error(`Worker「${name}」已存在，但不是本趟本機紀錄的上次部署版本。停止以免覆蓋別的網站；請核對帳號與名稱，沒有紀錄時不可自動認領。`);
  }
}

function successState(text, identity) {
  const urls = [...new Set((clean(text).match(/https:\/\/[^\s<>"'`]+/g) || [])
    .filter((u) => validUrl(u, identity.name, identity.target)))];
  const versions = [...new Set([...clean(text).matchAll(/Current Version ID:\s*([a-f0-9-]+)/gi)].map((m) => m[1]))];
  if (urls.length !== 1 || (identity.target === 'workers' && (versions.length !== 1 || !VERSION.test(versions[0])))) {
    throw new Error('已部署成功，但無法辨識唯一的真實網址或版本，紀錄未完成；不要盲目重試部署。');
  }
  return { schemaVersion: 1, ...identity, url: urls[0], ...(identity.target === 'workers' ? { versionId: versions[0] } : {}) };
}

function deployBuiltTrip({ slug, config, outDir }, {
  runWrangler: run = runWrangler, stateDir = STATE_DIR, env = process.env, log = console.log,
} = {}) {
  const name = config.deploy.name, target = config.deploy.target || 'workers';
  if (!NAME.test(name) || !['workers', 'pages'].includes(target)) throw new Error('部署目標不合法。');
  const file = statePath(slug, stateDir);
  const previous = readState(file);
  const configFile = path.join(outDir, 'wrangler.json');
  const account = accountInfo(run(['whoami', '--json', '--config', configFile], { env }), env).id;
  const settings = { env: { ...env, CLOUDFLARE_ACCOUNT_ID: account, CF_ACCOUNT_ID: account } };
  const identity = { slug, target, name, accountId: account };
  const matches = previous && Object.entries(identity).every(([k, v]) => previous[k] === v);
  if (target === 'workers') {
    checkWorker(run(['deployments', 'list', '--name', name, '--json', '--config', configFile], settings), account, name, previous, matches);
  } else {
    log('Pages：本次只保存成功網址，不提供 Worker 的遠端防撞保護。');
  }
  log(`即將部署：${slug}${config.title ? `（${config.title}）` : ''}；帳號 ${account}；${target} ${name}`);
  log(matches && previous.url ? `上次成功部署網址：${previous.url}（本機紀錄；不是即時網址查詢）` : '尚未取得本目標的真實網址；首次成功部署後才可記錄，不以佔位符猜測。');
  // wrangler pages deploy 會在 cwd 產生 wrangler.jsonc（assets.directory: "src"）。
  // 留在 repo 根目錄的話，下一次部署就會改去發佈 src/——未編譯的模板——而且
  // 回報成功。改以產出目錄為 cwd：那裡整個 gitignore，產生的設定無害。
  const args = target === 'pages'
    ? ['pages', 'deploy', 'site', '--project-name', name]
    : ['deploy', '--config', configFile];
  const result = run(args, target === 'pages' ? { ...settings, cwd: outDir } : settings);
  if (result.status !== 0 || result.error) throw failure(result, '部署');
  const state = successState(output(result), identity);
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch {
    throw new Error(`已部署成功（${state.url}），但本機紀錄寫入失敗；請修復檔案權限，不要盲目重試部署。`);
  } finally {
    try { fs.rmSync(temporary, { force: true }); } catch { /* 清理失敗不能掩蓋「已部署但未記錄」。 */ }
  }
  log(`部署成功：${state.url}`);
  return state;
}

module.exports = { deployBuiltTrip, runWrangler, inspectWorker, STATE_DIR, statePath, readState };
