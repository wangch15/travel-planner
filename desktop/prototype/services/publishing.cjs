const { wranglerArgs } = require('./wrangler-launch.cjs');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { sanitizeAccounts } = require('./auth-tools.cjs');
const { buildPreview } = require('../preview.cjs');
const { publicationOutput } = require('../publication-output.cjs');
const { inspectWorker, deployBuiltTrip, readState } = require('../../../scripts/lib/deployment-state.js');
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (code, message) => Object.assign(new Error(message || code), { code });
const NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// Execute the installed, trusted Wrangler asynchronously so Electron's main loop stays responsive.
async function runWrangler(args, { cwd, env = {} } = {}) {
  let binary;
  // 啟動器只接受 wrangler-dist/cli.js（登入與工具檢查也用這個）；bin/wrangler.js 會被拒絕，發布就在查帳號前失敗。
  try { binary = path.join(path.dirname(require.resolve('wrangler/package.json')), 'wrangler-dist', 'cli.js'); require('node:fs').accessSync(binary); }
  catch { throw fail('WRANGLER_REQUIRED', '找不到 App 內建的發布工具，App 可能安裝不完整。請重新下載並安裝 Travel Planner。'); }
  const inherited = Object.fromEntries(Object.entries({ ...process.env, ...env }).filter(([key]) => !/^(NODE_OPTIONS|NODE_PATH|LD_|DYLD_)/.test(key)));
  return new Promise(resolve => {
    const child = execFile(process.execPath, wranglerArgs(binary, args), { cwd, env: { ...inherited, ELECTRON_RUN_AS_NODE: '1', CI: 'true', NO_COLOR: '1', FORCE_COLOR: '0', WRANGLER_SEND_METRICS: 'false' },
      encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => resolve({
      status: error ? (typeof error.code === 'number' ? error.code : null) : 0, stdout, stderr, ...(error && typeof error.code !== 'number' ? { error } : {}),
    }));
    child.stdin?.end();
  });
}
class Request extends Error { constructor(args, options) { super('async-wrangler-request'); this.args = args; this.options = options; } }
// Reuse the CLI's safety parser and collision rules. Replay completed read results; each
// missing subprocess is awaited once. deployBuiltTrip writes a receipt only on its final pass.
async function driveLegacy(operation, execute) {
  const responses = [];
  for (;;) {
    let cursor = 0;
    try {
      return operation((args, options) => {
        const previous = responses[cursor++];
        if (!previous) throw new Request(args, options);
        if (JSON.stringify(args) !== previous.args) throw fail('TARGET_CHANGED');
        return previous.result;
      });
    } catch (request) {
      if (!(request instanceof Request)) throw request;
      if (responses.length >= 4) throw fail('UNEXPECTED_DEPLOYMENT_FLOW');
      responses.push({ args: JSON.stringify(request.args), result: await execute(request.args, request.options) });
    }
  }
}

function ownedDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.realpathSync(directory) !== directory || !fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) throw fail('UNSAFE_PATH');
}
function receiptAt(directory, slug) {
  ownedDirectory(directory);
  const file = path.join(directory, `${slug}.json`);
  try { const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 65536) throw fail('UNSAFE_PATH'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { file, state: readState(file) };
}
function remoteIdentity(info) { return JSON.stringify({ accountId: info.accountId, latest: info.latest }); }
class PublishingService {
  constructor(stateDirectory, { loadPreview = buildPreview, runWrangler: executeWrangler = runWrangler, env = process.env } = {}) {
    this.directory = path.resolve(stateDirectory, 'publishing'); this.loadPreview = loadPreview; this.run = executeWrangler; this.env = { ...env }; this.selectedAccount = null;
    this.pending = new Map(); this.busy = false;
  }
  effectiveEnv() { return this.selectedAccount ? { ...this.env, CLOUDFLARE_ACCOUNT_ID: this.selectedAccount, CF_ACCOUNT_ID: this.selectedAccount } : this.env; }
  setAccount(id) {
    if (this.busy) throw fail('PUBLISH_BUSY');
    if (id !== null && (typeof id !== 'string' || !/^[a-f0-9]{32}$/i.test(id))) throw fail('INVALID_ACCOUNT');
    this.selectedAccount = id; this.pending.clear();
    return { selectedAccountId: id };
  }
  async accounts() {
    ownedDirectory(this.directory);
    const temporary = fs.mkdtempSync(path.join(this.directory, '.accounts-'));
    try {
      const configFile = path.join(temporary, 'wrangler.json');
      fs.writeFileSync(configFile, JSON.stringify({ name: 'travel-planner-account-check', compatibility_date: '2026-09-22' }), { flag: 'wx', mode: 0o600 });
      const result = await this.run(['whoami', '--json', '--config', configFile], { cwd: temporary, env: this.effectiveEnv() });
      if (result.status !== 0 || result.error) throw fail('CLOUDFLARE_LOGIN_REQUIRED', '請先在官方頁面完成 Cloudflare 登入。');
      let info; try { info = JSON.parse(result.stdout); } catch { throw fail('INVALID_ACCOUNT_RESPONSE'); }
      const accounts = sanitizeAccounts(info);
      if (info.loggedIn !== true) throw fail('CLOUDFLARE_LOGIN_REQUIRED');
      return { connected: true, accounts, selectedAccountId: this.selectedAccount || this.env.CLOUDFLARE_ACCOUNT_ID || this.env.CF_ACCOUNT_ID || null };
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  }
  // 不連網的網站狀態：App 自己的發布紀錄優先，沒有的話看專案裡 CLI 留下的紀錄（.local/deployments）。
  async status({ root, slug }) {
    if (!path.isAbsolute(root) || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) throw fail('INVALID_TARGET');
    const canonicalRoot = await fsp.realpath(root);
    const read = async (file, source) => { try { const stat = await fsp.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) return null; const state = JSON.parse(await fsp.readFile(file, 'utf8')); return typeof state?.url === 'string' && /^https:\/\//.test(state.url) ? { url: state.url, publishedAt: stat.mtime.toISOString(), source } : null; } catch { return null; } };
    return await read(path.join(this.directory, hash(canonicalRoot), `${slug}.json`), 'app') || await read(path.join(canonicalRoot, '.local', 'deployments', `${slug}.json`), 'cli') || { url: null, publishedAt: null, source: null };
  }
  async target({ root, slug }) {
    if (!path.isAbsolute(root) || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) throw fail('INVALID_TARGET');
    const canonicalRoot = await fsp.realpath(root);
    const artifact = await this.loadPreview(canonicalRoot, slug);
    const config = artifact.snapshot.trip.config;
    if ((config.deploy?.target || 'workers') !== 'workers') throw fail('WORKERS_ONLY', '桌面版目前只發布 Workers；Pages 請先完成遷移。');
    if (!NAME.test(config.deploy?.name || '')) throw fail('INVALID_TARGET', '請先設定有效的 Worker 網站名稱。');
    return { root: canonicalRoot, slug, artifact, name: config.deploy.name, title: config.title,
      output: publicationOutput(artifact), stateDir: path.join(this.directory, hash(canonicalRoot)) };
  }
  materialize(target) {
    ownedDirectory(this.directory);
    const temporary = fs.mkdtempSync(path.join(this.directory, '.publish-'));
    try {
      const site = path.join(temporary, 'site'); fs.mkdirSync(site, { mode: 0o700 });
      for (const [name, bytes] of target.output.files) {
        const file = path.join(site, name);
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
      }
      const configFile = path.join(temporary, 'wrangler.json');
      fs.writeFileSync(configFile, JSON.stringify({ name: target.name, compatibility_date: new Date().toISOString().slice(0, 10), assets: { directory: './site' } }), { flag: 'wx', mode: 0o600 });
      return { temporary, configFile };
    } catch (error) { fs.rmSync(temporary, { recursive: true, force: true }); throw error; }
  }
  inspect(target, configFile) { return driveLegacy(run => inspectWorker(target.name, configFile, { runWrangler: run, env: this.effectiveEnv() }), this.run); }
  requireMatchingReceipt(target, remote) {
    const { state } = receiptAt(target.stateDir, target.slug);
    if (remote.latest !== null && (!state || state.target !== 'workers' || state.slug !== target.slug || state.name !== target.name
      || state.accountId !== remote.accountId || remote.latest.versions.length !== 1 || remote.latest.versions[0].percentage !== 100
      || remote.latest.versions[0].version_id !== state.versionId)) {
      throw fail('ADOPTION_REQUIRED', '網站名稱已存在，且不是 App 上次發布的版本。請先核對並明確接管，或使用其他名稱。');
    }
    return state;
  }
  async prepare(input) {
    if (this.busy) throw fail('PUBLISH_BUSY');
    const target = await this.target(input);
    if (!input.previewSeen || input.previewDigest !== target.artifact.digest || input.previewOutputDigest !== target.output.digest) throw fail('PREVIEW_REQUIRED', '請先在 App 看過目前完整版本的預覽，再準備發布。');
    const output = this.materialize(target);
    try {
      const remote = await this.inspect(target, output.configFile), previous = this.requireMatchingReceipt(target, remote);
      const token = randomUUID(); this.pending.clear();
      this.pending.set(token, { kind: 'publish', root: target.root, slug: target.slug, name: target.name, digest: target.artifact.digest, outputDigest: target.output.digest,
        remote: remoteIdentity(remote), receipt: JSON.stringify(previous), expires: Date.now() + 10 * 60 * 1000 });
      return { token, name: target.name, title: target.title, accountId: remote.accountId, accountName: remote.accountName,
        sourceDigest: target.artifact.digest, outputDigest: target.output.digest, firstPublish: remote.latest === null, previousUrl: previous?.url || null,
        warning: '發布後任何取得網址的人都能開啟；不被搜尋引擎收錄並不等於密碼保護。' };
    } finally { fs.rmSync(output.temporary, { recursive: true, force: true }); }
  }
  async confirm(token, { previewSeen, previewDigest, previewOutputDigest } = {}) {
    if (this.busy) throw fail('PUBLISH_BUSY');
    const pending = this.pending.get(token); this.pending.delete(token);
    if (!pending || pending.kind !== 'publish' || Date.now() > pending.expires) throw fail('STALE_CONFIRMATION');
    if (!previewSeen || previewDigest !== pending.digest || previewOutputDigest !== pending.outputDigest) throw fail('PREVIEW_REQUIRED');
    this.busy = true; let output, attempted = false;
    try {
      const target = await this.target(pending);
      if (target.artifact.digest !== pending.digest || target.output.digest !== pending.outputDigest || target.name !== pending.name) throw fail('CONTENT_CHANGED', '資料或頁面產物已變更，請重新預覽及確認發布。');
      output = this.materialize(target);
      const remote = await this.inspect(target, output.configFile);
      const previous = this.requireMatchingReceipt(target, remote);
      if (remoteIdentity(remote) !== pending.remote || JSON.stringify(previous) !== pending.receipt) throw fail('REMOTE_CHANGED', '帳號或網站版本已改變，請重新核對發布目標。');
      // deployBuiltTrip rechecks account and remote immediately before its one deployment attempt.
      const runPinned = async (args, options) => {
        if (args[0] === 'deploy') attempted = true;
        const result = await this.run(args, options);
        if (args[0] === 'deployments') {
          if (remote.latest === null && result.status === 0) throw fail('REMOTE_CHANGED');
          if (remote.latest !== null) {
            if (result.status !== 0) throw fail('REMOTE_CHANGED');
            const latest = JSON.parse(result.stdout).sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
            if (JSON.stringify(latest) !== JSON.stringify(remote.latest)) throw fail('REMOTE_CHANGED');
          }
        }
        if (args[0] === 'whoami' && result.status === 0) {
          const info = JSON.parse(result.stdout);
          if (!info.accounts?.some(account => account.id === remote.accountId)) throw fail('ACCOUNT_CHANGED');
        }
        return result;
      };
      const state = await driveLegacy(run => deployBuiltTrip({ slug: target.slug, config: { title: target.title, deploy: { name: target.name, target: 'workers' } }, outDir: output.temporary },
        { stateDir: target.stateDir, runWrangler: run, env: { ...this.env, CLOUDFLARE_ACCOUNT_ID: remote.accountId, CF_ACCOUNT_ID: remote.accountId }, log: () => {} }), runPinned);
      return { published: true, backedUp: false, url: state.url, versionId: state.versionId, message: '網站已發布；這不代表私人專案已完成備份。' };
    } catch (error) {
      return { published: false, outcome: attempted && !error.notDeployed ? 'unknown' : 'not-started', code: error.code || 'PUBLISH_FAILED', message: error.code ? error.message : '發布或結果核對未完成。遠端可能已更新；請先核對 Cloudflare 狀態，不要直接重試。' };
    } finally { if (output) fs.rmSync(output.temporary, { recursive: true, force: true }); this.busy = false; }
  }
  async prepareAdoption(input) {
    if (this.busy) throw fail('PUBLISH_BUSY');
    const target = await this.target(input), output = this.materialize(target);
    try {
      const remote = await this.inspect(target, output.configFile);
      if (!remote.latest || typeof remote.latest.id !== 'string' || !remote.latest.id || remote.latest.versions.length !== 1 || remote.latest.versions[0].percentage !== 100) throw fail('ADOPTION_UNAVAILABLE', '需要唯一且完整啟用的遠端版本，才能接管此網站。');
      const token = randomUUID(); this.pending.clear();
      this.pending.set(token, { kind: 'adopt', root: target.root, slug: target.slug, name: target.name, remote: remoteIdentity(remote), expires: Date.now() + 10 * 60 * 1000 });
      return { token, name: target.name, accountId: remote.accountId, accountName: remote.accountName, versionId: remote.latest.versions[0].version_id,
        warning: '確認此網站確實屬於這趟旅程後才接管；之後的發布會更新這個網站。接管本身不會發布。' };
    } finally { fs.rmSync(output.temporary, { recursive: true, force: true }); }
  }
  async confirmAdoption(token) {
    if (this.busy) throw fail('PUBLISH_BUSY');
    const pending = this.pending.get(token); this.pending.delete(token);
    if (!pending || pending.kind !== 'adopt' || Date.now() > pending.expires) throw fail('STALE_CONFIRMATION');
    this.busy = true; let output;
    try {
      const target = await this.target(pending); output = this.materialize(target);
      const remote = await this.inspect(target, output.configFile);
      if (target.name !== pending.name || remoteIdentity(remote) !== pending.remote) throw fail('REMOTE_CHANGED');
      const { file } = receiptAt(target.stateDir, target.slug);
      const state = { schemaVersion: 1, slug: target.slug, target: 'workers', name: target.name, accountId: remote.accountId, url: null,
        versionId: remote.latest.versions[0].version_id, adoption: { deploymentId: remote.latest.id, createdOn: remote.latest.created_on } };
      const temporary = file + '.' + randomUUID() + '.tmp';
      try { fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, file); }
      finally { fs.rmSync(temporary, { force: true }); }
      return { adopted: true, published: false, message: '已接管網站紀錄。請重新預覽並準備發布。' };
    } finally { if (output) fs.rmSync(output.temporary, { recursive: true, force: true }); this.busy = false; }
  }
  // ---- 下架（刪除 Worker）----
  // 只讀旅程設定裡的 Worker 名稱（封存的旅程也可以），不建置網站。Cloudflare 上的網站必須就是 App（或終端機）
  // 上次發布的那一個——帳號與線上版本都要相符——才可能刪到自己的網站。兩段式：先核對給代號，確認時全部重查一次。
  async unshipTarget({ root, slug, archived = false }) {
    if (!path.isAbsolute(root) || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) throw fail('INVALID_TARGET');
    const canonicalRoot = await fsp.realpath(root);
    const dir = path.join(canonicalRoot, 'trips', ...(archived ? ['_archived'] : []), slug);
    let config; try { config = JSON.parse(await fsp.readFile(path.join(dir, 'trip.config.json'), 'utf8')); } catch { throw fail('INVALID_TARGET', '讀不到這趟旅程的設定，無法確認網站名稱。'); }
    if ((config.deploy?.target || 'workers') !== 'workers') throw fail('WORKERS_ONLY', '桌面版目前只能下架 Workers 網站。');
    if (!NAME.test(config.deploy?.name || '')) throw fail('NOT_PUBLISHED', '這趟旅程沒有設定網站名稱，看起來還沒發布過。');
    return { root: canonicalRoot, slug, archived, name: config.deploy.name, title: config.title || slug, stateDir: path.join(this.directory, hash(canonicalRoot)) };
  }
  workerConfig(name) {
    ownedDirectory(this.directory);
    const temporary = fs.mkdtempSync(path.join(this.directory, '.unship-'));
    const configFile = path.join(temporary, 'wrangler.json');
    fs.writeFileSync(configFile, JSON.stringify({ name, compatibility_date: new Date().toISOString().slice(0, 10) }), { flag: 'wx', mode: 0o600 });
    return { temporary, configFile };
  }
  // App 的發布紀錄優先；沒有的話用終端機留在專案裡的紀錄（.local/deployments）。
  unshipRecord(target) {
    const app = receiptAt(target.stateDir, target.slug);
    if (app.state) return { ...app, source: 'app' };
    const file = path.join(target.root, '.local', 'deployments', `${target.slug}.json`);
    let state = null; try { const stat = fs.lstatSync(file); if (stat.isFile() && !stat.isSymbolicLink() && stat.size <= 65536) state = readState(file); } catch {}
    return { file, state, source: 'cli' };
  }
  matchesRecord(target, remote, state) {
    const versions = remote.latest?.versions || [];
    return Boolean(state && state.name === target.name && state.accountId === remote.accountId && versions.length === 1 && versions[0].percentage === 100 && versions[0].version_id === state.versionId);
  }
  async prepareUnship(input) {
    if (this.busy) throw fail('PUBLISH_BUSY');
    const target = await this.unshipTarget(input), output = this.workerConfig(target.name);
    try {
      const remote = await this.inspect(target, output.configFile);
      if (!remote.latest) throw fail('NOT_PUBLISHED', `Cloudflare 上沒有「${target.name}」這個網站，不需要下架。`);
      const record = this.unshipRecord(target);
      if (!this.matchesRecord(target, remote, record.state)) throw fail('UNSHIP_ADOPTION_REQUIRED', 'App 沒有這個網站的發布紀錄，或線上版本不是上次發布的那一個。為了避免刪到別人的網站，請先確認這是你之前發布的網站（發布燈箱或「公開網站」的進階），再下架。');
      const token = randomUUID(); this.pending.clear();
      this.pending.set(token, { kind: 'unship', root: target.root, slug: target.slug, archived: target.archived, name: target.name, remote: remoteIdentity(remote), expires: Date.now() + 10 * 60 * 1000 });
      return { token, name: target.name, title: target.title, url: record.state.url || null, accountId: remote.accountId, accountName: remote.accountName,
        warning: '下架後這個網址會立刻失效，已經傳出去的連結都打不開。行程資料不會被刪；之後想再上線，重新發布就可以。' };
    } finally { fs.rmSync(output.temporary, { recursive: true, force: true }); }
  }
  async confirmUnship(token) {
    if (this.busy) throw fail('PUBLISH_BUSY');
    const pending = this.pending.get(token); this.pending.delete(token);
    if (!pending || pending.kind !== 'unship' || Date.now() > pending.expires) throw fail('STALE_CONFIRMATION', '確認已過期，請重新開始。');
    this.busy = true; let output;
    try {
      const target = await this.unshipTarget(pending); output = this.workerConfig(target.name);
      const remote = await this.inspect(target, output.configFile);
      const record = this.unshipRecord(target);
      if (target.name !== pending.name || remoteIdentity(remote) !== pending.remote || !this.matchesRecord(target, remote, record.state)) throw fail('REMOTE_CHANGED', '網站或帳號在確認後有變動，沒有下架；請重新核對。');
      const result = await this.run(['delete', target.name, '--config', output.configFile], { cwd: output.temporary, env: { ...this.env, CLOUDFLARE_ACCOUNT_ID: remote.accountId, CF_ACCOUNT_ID: remote.accountId } });
      // 不相信 wrangler 的退出碼：刪完一定再查一次遠端，還在就照實說。
      let after;
      try { after = await this.inspect(target, output.configFile); }
      catch (error) { throw fail('UNSHIP_UNKNOWN', `刪除已送出，但無法確認結果（${error.message}）。請到 Cloudflare 的 Workers & Pages 核對，不要直接重試。`); }
      if (after.latest) throw fail('UNSHIP_NOT_CONFIRMED', `Cloudflare 上的網站「${target.name}」還在，沒有下架成功（退出碼 ${result.status ?? '未知'}）。可能有其他網站依賴它；請到 Cloudflare 的 Workers & Pages 確認後再處理。`);
      fs.rmSync(record.file, { force: true });
      if (record.source === 'app') { const cli = path.join(target.root, '.local', 'deployments', `${target.slug}.json`); try { if (readState(cli)?.name === target.name) fs.rmSync(cli, { force: true }); } catch {} }
      const url = record.state.url || null;
      return { unshipped: true, name: target.name, url, message: `網站已下架：${url || target.name} 已停止服務。行程資料沒有變動。` };
    } finally { if (output) fs.rmSync(output.temporary, { recursive: true, force: true }); this.busy = false; }
  }
}
module.exports = { PublishingService, runWrangler };
