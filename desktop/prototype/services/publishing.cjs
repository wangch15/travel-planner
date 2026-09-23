const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { sanitizeAccounts } = require('./auth-tools.cjs');
const { buildPreview } = require('../preview.cjs');
const { inspectWorker, deployBuiltTrip, readState } = require('../../../scripts/lib/deployment-state.js');
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (code, message) => Object.assign(new Error(message || code), { code });
const NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// Execute the installed, trusted Wrangler asynchronously so Electron's main loop stays responsive.
async function runWrangler(args, { cwd, env = {} } = {}) {
  let binary;
  try { binary = path.join(path.dirname(require.resolve('wrangler/package.json')), 'bin', 'wrangler.js'); }
  catch { throw fail('WRANGLER_REQUIRED', '請先完成桌面版工具安裝，找不到可信的 Wrangler。'); }
  const inherited = Object.fromEntries(Object.entries({ ...process.env, ...env }).filter(([key]) => !/^(NODE_OPTIONS|NODE_PATH|LD_|DYLD_)/.test(key)));
  return new Promise(resolve => {
    const child = execFile(process.execPath, [binary, ...args], { cwd, env: { ...inherited, ELECTRON_RUN_AS_NODE: '1', CI: 'true', NO_COLOR: '1', FORCE_COLOR: '0', WRANGLER_SEND_METRICS: 'false' },
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
  async target({ root, slug }) {
    if (!path.isAbsolute(root) || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) throw fail('INVALID_TARGET');
    const canonicalRoot = await fsp.realpath(root);
    const artifact = await this.loadPreview(canonicalRoot, slug);
    const config = artifact.snapshot.trip.config;
    if ((config.deploy?.target || 'workers') !== 'workers') throw fail('WORKERS_ONLY', '桌面版目前只發布 Workers；Pages 請先完成遷移。');
    if (!NAME.test(config.deploy?.name || '')) throw fail('INVALID_TARGET', '請先設定有效的 Worker 網站名稱。');
    return { root: canonicalRoot, slug, artifact, name: config.deploy.name, title: config.title,
      stateDir: path.join(this.directory, hash(canonicalRoot)) };
  }
  materialize(target) {
    ownedDirectory(this.directory);
    const temporary = fs.mkdtempSync(path.join(this.directory, '.publish-'));
    try {
      const site = path.join(temporary, 'site'); fs.mkdirSync(site, { mode: 0o700 });
      const index = target.artifact.read('/index.html');
      if (!index || !index.type.startsWith('text/html')) throw fail('INVALID_PREVIEW');
      fs.writeFileSync(path.join(site, 'index.html'), index.body, { flag: 'wx', mode: 0o600 });
      const copied = new Set(); let total = Buffer.byteLength(index.body);
      for (const photo of Object.values(target.artifact.snapshot.photos || {}).flat()) {
        if (!/^img\/[a-zA-Z0-9_-]+-\d+\.jpg$/.test(photo.src)) throw fail('INVALID_PREVIEW');
        if (copied.has(photo.src)) continue;
        const asset = target.artifact.read('/' + photo.src);
        if (!asset || asset.type !== 'image/jpeg') throw fail('INVALID_PREVIEW');
        total += Buffer.byteLength(asset.body); if (total > 160 * 1024 * 1024) throw fail('PUBLICATION_TOO_LARGE');
        fs.mkdirSync(path.join(site, 'img'), { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(site, photo.src), asset.body, { flag: 'wx', mode: 0o600 }); copied.add(photo.src);
      }
      fs.writeFileSync(path.join(site, 'robots.txt'), 'User-agent: *\nDisallow: /\n', { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(path.join(site, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow, noarchive, noimageindex\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n', { flag: 'wx', mode: 0o600 });
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
    if (!input.previewSeen || input.previewDigest !== target.artifact.digest) throw fail('PREVIEW_REQUIRED', '請先在 App 看過目前完整版本的預覽，再準備發布。');
    const output = this.materialize(target);
    try {
      const remote = await this.inspect(target, output.configFile), previous = this.requireMatchingReceipt(target, remote);
      const token = randomUUID(); this.pending.clear();
      this.pending.set(token, { kind: 'publish', root: target.root, slug: target.slug, name: target.name, digest: target.artifact.digest,
        remote: remoteIdentity(remote), receipt: JSON.stringify(previous), expires: Date.now() + 10 * 60 * 1000 });
      return { token, name: target.name, title: target.title, accountId: remote.accountId, accountName: remote.accountName,
        sourceDigest: target.artifact.digest, firstPublish: remote.latest === null, previousUrl: previous?.url || null,
        warning: '發布後任何取得網址的人都能開啟；不被搜尋引擎收錄並不等於密碼保護。' };
    } finally { fs.rmSync(output.temporary, { recursive: true, force: true }); }
  }
  async confirm(token, { previewSeen, previewDigest } = {}) {
    if (this.busy) throw fail('PUBLISH_BUSY');
    const pending = this.pending.get(token); this.pending.delete(token);
    if (!pending || pending.kind !== 'publish' || Date.now() > pending.expires) throw fail('STALE_CONFIRMATION');
    if (!previewSeen || previewDigest !== pending.digest) throw fail('PREVIEW_REQUIRED');
    this.busy = true; let output, attempted = false;
    try {
      const target = await this.target(pending);
      if (target.artifact.digest !== pending.digest || target.name !== pending.name) throw fail('CONTENT_CHANGED', '資料已變更，請重新預覽及確認發布。');
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
      return { published: false, outcome: attempted ? 'unknown' : 'not-started', code: error.code || 'PUBLISH_FAILED', message: error.code ? error.message : '發布或結果核對未完成。遠端可能已更新；請先核對 Cloudflare 狀態，不要直接重試。' };
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
}
module.exports = { PublishingService, runWrangler };
