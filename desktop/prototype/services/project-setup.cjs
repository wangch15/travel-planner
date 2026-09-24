const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash, randomUUID } = require('node:crypto');
const { TRUSTED_FILES, regularBytes, sameTrusted } = require('./backup.cjs');
const { destinationRepo } = require('../../../scripts/lib/pre-push.js');
const exec = promisify(execFile);
const TEMPLATE = 'wangch15/travel-planner';
const MAX_FILE = 16 * 1024 * 1024, MAX_TOTAL = 160 * 1024 * 1024;
const fail = (code, message = code) => Object.assign(new Error(message), { code });
const cleanEnv = () => ({ ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(GIT_|NODE_OPTIONS$|NODE_PATH$|LD_|DYLD_)/.test(key))), GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' });
const runGitDefault = (args, options = {}) => exec('git', ['--no-replace-objects', '--no-pager', '--no-optional-locks', ...args], { ...options, env: cleanEnv(), timeout: 120000, maxBuffer: options.maxBuffer || 8 * 1024 * 1024 });
const ghDefault = (args, options = {}) => exec(process.platform === 'win32' ? 'gh.exe' : 'gh', args, { ...options, env: cleanEnv(), timeout: 30000, maxBuffer: 65536 });
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
function repository(value) {
  if (typeof value !== 'string') throw fail('INVALID_REPOSITORY');
  const input = value.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]{1,100}$/.test(input)) throw fail('INVALID_REPOSITORY');
  const [owner, name] = input.split('/');
  if (!safePart(name) || name.startsWith('-')) throw fail('INVALID_REPOSITORY');
  return { repo: `${owner}/${name}`, name, url: `https://github.com/${owner}/${name}.git` };
}
function safePart(name) { return name && name !== '.' && name !== '..' && name.length <= 200 && !/[\x00-\x1f\x7f\\<>:"|?*]/.test(name) && !/[.\s]$/.test(name) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name); }
function safePath(name) { return typeof name === 'string' && name.length <= 500 && name.split('/').every(part => safePart(part) && part.toLowerCase() !== '.git' && !/^git~[0-9]+$/i.test(part) && !/[\u200c-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(part)); }
async function anchor(directory) {
  const stat = await fs.lstat(directory); if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail('UNSAFE_PROJECT_PATH');
  const canonical = await fs.realpath(directory); if (!same(stat, await fs.lstat(directory))) throw fail('PROJECT_CHANGED');
  return { directory, canonical, stat };
}
async function verify(a) { const now = await fs.lstat(a.directory); if (!now.isDirectory() || now.isSymbolicLink() || !same(now, a.stat) || await fs.realpath(a.directory) !== a.canonical) throw fail('PROJECT_CHANGED'); }
async function noRepositoryParent(directory) {
  for (let current = directory;; current = path.dirname(current)) {
    try { await fs.lstat(path.join(current, '.git')); throw fail('NESTED_PROJECT', '請選擇 Git 專案以外的資料夾，避免把私人專案放進另一個專案。'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await fs.stat(path.join(current, 'HEAD')); const objects = await fs.stat(path.join(current, 'objects')); if (objects.isDirectory()) throw fail('NESTED_PROJECT'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (path.dirname(current) === current) break;
  }
}
function checkResult(result) { if (!result || result.error || result.status !== undefined && result.status !== 0) throw fail('PROJECT_COMMAND_FAILED'); return result.stdout; }
class ProjectSetupService {
  constructor({ runGit = runGitDefault, gh = ghDefault, trustedRoot = path.resolve(__dirname, '../../..') } = {}) { this.runGit = runGit; this.gh = gh; this.trustedRoot = trustedRoot; this.pending = new Map(); this.busy = false; }
  async git(args, options) { return checkResult(await this.runGit(args, options)); }
  async github(args, cwd) { return String(checkResult(await this.gh(args, { cwd })) || ''); }
  async audit(cwd) {
    const raw = String(await this.git(['config', '--null', '--list'], { cwd }) || '');
    for (const row of raw.split('\0').filter(Boolean)) {
      const index = row.indexOf('\n'), key = row.slice(0, index).toLowerCase(), value = row.slice(index + 1);
      if (/^(includeif\.|filter\.|gpg\.|diff\..*\.(command|textconv)$|url\..*\.(insteadof|pushinsteadof)$|remote\..*\.(receivepack|uploadpack|vcs|proxy)$)/.test(key)
        || ['core.fsmonitor', 'core.sshcommand', 'core.gitproxy', 'core.askpass', 'diff.external', 'core.alternaterefscommand', 'core.hookspath', 'core.worktree', 'init.templatedir'].includes(key)
        || key === 'core.bare' && !['false', 'no', '0'].includes(value)
        || /^credential(?:\..+)?\.helper$/.test(key) && !/^(|osxkeychain|manager|manager-core|wincred|cache(?: --timeout=\d+)?|!gh auth git-credential|!\/(?:opt\/homebrew|usr\/local)\/bin\/gh auth git-credential)$/.test(value)) throw fail('UNSAFE_GIT_CONFIG', 'Git 設定含未知外部指令，請先核對後再下載。');
    }
  }
  async privateRepo(repo, cwd) {
    let info; try { info = JSON.parse(await this.github(['repo', 'view', repo, '--json', 'nameWithOwner,visibility'], cwd)); } catch { throw fail('PRIVATE_REPO_REQUIRED', '請先連接 GitHub，並確認你能存取這個私人專案。'); }
    if (info.visibility !== 'PRIVATE' || typeof info.nameWithOwner !== 'string' || info.nameWithOwner.toLowerCase() !== repo.toLowerCase()) throw fail('PRIVATE_REPO_REQUIRED', '此專案必須是可確認的 PRIVATE GitHub repository。');
    return info;
  }
  async parent(parentDirectory, name) {
    if (typeof parentDirectory !== 'string' || !path.isAbsolute(parentDirectory)) throw fail('UNSAFE_PROJECT_PATH');
    const parent = await anchor(parentDirectory); await noRepositoryParent(parent.canonical); await this.audit(parent.canonical);
    const destination = path.join(parent.canonical, name);
    try { await fs.lstat(destination); throw fail('DESTINATION_EXISTS', '這個資料夾已存在，請選擇其他位置；App 不會覆蓋。'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return { parent, destination };
  }
  keep(kind, data) { const token = randomUUID(); this.pending.clear(); this.pending.set(token, { kind, ...data, expires: Date.now() + 10 * 60 * 1000 }); return token; }
  async prepareClone({ repo, parentDirectory }) {
    if (this.busy) throw fail('PROJECT_SETUP_BUSY');
    const identity = repository(repo), location = await this.parent(parentDirectory, identity.name);
    await this.privateRepo(identity.repo, location.parent.canonical);
    const token = this.keep('clone', { ...identity, ...location });
    return { token, repo: identity.repo, visibility: 'PRIVATE', destination: location.destination };
  }
  async authenticatedAuthor(cwd) {
    let info; try { info = JSON.parse(await this.github(['api', 'user', '--jq', '{login: .login, id: .id}'], cwd)); } catch { throw fail('GITHUB_LOGIN_REQUIRED'); }
    if (!info || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(info.login) || !Number.isSafeInteger(info.id) || info.id < 1) throw fail('GITHUB_LOGIN_REQUIRED');
    return { owner: info.login, accountId: info.id, author: { name: info.login, email: `${info.id}+${info.login}@users.noreply.github.com` } };
  }
  async identityReady(root) {
    try { return Boolean(String(await this.git(['config', 'user.name'], { cwd: root })).trim() && String(await this.git(['config', 'user.email'], { cwd: root })).trim()); }
    catch { return false; }
  }
  async identityTarget(root) {
    if (typeof root !== 'string' || !path.isAbsolute(root)) throw fail('UNSAFE_PROJECT_PATH');
    const owned = await anchor(root), dotGit = await fs.lstat(path.join(owned.canonical, '.git'));
    if (dotGit.isSymbolicLink() || (!dotGit.isFile() && !dotGit.isDirectory())) throw fail('UNSAFE_PROJECT_PATH');
    // Git for Windows prints forward slashes even when realpath uses native separators.
    if (path.resolve(String(await this.git(['rev-parse', '--show-toplevel'], { cwd: owned.canonical })).trim()) !== owned.canonical) throw fail('UNSAFE_PROJECT_PATH');
    const common = String(await this.git(['rev-parse', '--git-common-dir'], { cwd: owned.canonical })).trim();
    const metadata = await anchor(path.resolve(owned.canonical, common)), configFile = path.join(metadata.canonical, 'config');
    const configDigest = createHash('sha256').update(await regularBytes(configFile, 256 * 1024)).digest('hex');
    const urls = String(await this.git(['remote', 'get-url', '--push', '--all', 'origin'], { cwd: owned.canonical })).trim().split(/\r?\n/);
    const repo = urls.length === 1 && destinationRepo(urls[0]);
    if (!repo || repo.toLowerCase() === TEMPLATE.toLowerCase()) throw fail('PRIVATE_REPO_REQUIRED');
    await this.privateRepo(repo, owned.canonical); await verify(owned); await verify(metadata);
    return { root: owned.canonical, owned, metadata, configFile, configDigest, repo, origin: urls[0] };
  }
  async prepareIdentity(root) {
    if (this.busy) throw fail('PROJECT_SETUP_BUSY');
    const target = await this.identityTarget(root), account = await this.authenticatedAuthor(target.root);
    const token = this.keep('identity', { ...target, ...account });
    return { token, root: target.root, repo: target.repo, author: account.author, warning: '確認後只會設定這份專案的 Git 提交作者，使用目前 GitHub 帳號的 noreply 郵件；不更動全域設定、不提交或推送資料。' };
  }
  async confirmIdentity(token) {
    const pending = this.take(token, 'identity');
    try {
      await verify(pending.owned); await verify(pending.metadata);
      const current = await this.identityTarget(pending.root);
      if (current.origin !== pending.origin || current.repo !== pending.repo || current.metadata.canonical !== pending.metadata.canonical || current.configDigest !== pending.configDigest) throw fail('PROJECT_CHANGED');
      const account = await this.authenticatedAuthor(pending.root);
      if (account.owner !== pending.owner || account.accountId !== pending.accountId) throw fail('ACCOUNT_CHANGED');
      await verify(pending.owned); await verify(pending.metadata);
      if (createHash('sha256').update(await regularBytes(pending.configFile, 256 * 1024)).digest('hex') !== pending.configDigest) throw fail('PROJECT_CHANGED');
      await this.git(['config', '--local', 'user.name', pending.author.name], { cwd: pending.root });
      await regularBytes(pending.configFile, 256 * 1024); await verify(pending.metadata);
      await this.git(['config', '--local', 'user.email', pending.author.email], { cwd: pending.root });
      const name = String(await this.git(['config', 'user.name'], { cwd: pending.root })).trim(), email = String(await this.git(['config', 'user.email'], { cwd: pending.root })).trim();
      if (name !== pending.author.name || email !== pending.author.email) throw fail('IDENTITY_NOT_EFFECTIVE');
      return { ready: true, identityReady: true, root: pending.root, repo: pending.repo, message: '本機提交作者已設定；沒有提交或推送資料，現在可以重新準備私人備份。' };
    } catch (error) { return { ready: false, identityReady: false, root: pending.root, repo: pending.repo, code: error.code || 'IDENTITY_SETUP_FAILED', message: '本機提交作者尚未確認設定完成。全域 Git 設定未更動；請重新核對專案與 GitHub 帳號後再試。' }; }
    finally { this.busy = false; }
  }
  async prepareCreate({ name, parentDirectory }) {
    if (this.busy) throw fail('PROJECT_SETUP_BUSY');
    if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(name) || !safePart(name)) throw fail('INVALID_REPOSITORY');
    const location = await this.parent(parentDirectory, name), account = await this.authenticatedAuthor(location.parent.canonical);
    const identity = repository(`${account.owner}/${name}`), token = this.keep('create', { ...identity, ...location, ...account });
    return { token, repo: identity.repo, owner: account.owner, author: account.author, visibility: 'PRIVATE', destination: location.destination, templateSource: TEMPLATE, warning: '確認後會建立 GitHub 私人專案，並僅為這份新複本設定你的 GitHub 名稱與 noreply 郵件作為提交作者；不變更全域 Git 設定，也不自動推送。' };
  }
  take(token, kind) {
    if (this.busy) throw fail('PROJECT_SETUP_BUSY');
    const value = this.pending.get(token); this.pending.delete(token);
    if (!value || value.kind !== kind || Date.now() > value.expires) throw fail('STALE_CONFIRMATION');
    this.busy = true; return value;
  }
  async materialize(pending, sourceURL) {
    await verify(pending.parent); await noRepositoryParent(pending.parent.canonical); await this.audit(pending.parent.canonical);
    // mkdir is exclusive. Git receives an empty directory that this operation owns.
    await fs.mkdir(pending.destination, { mode: 0o700 }); const owned = await anchor(pending.destination);
    await this.git(['clone', '--no-checkout', '--no-recurse-submodules', '--filter=blob:none', '--', sourceURL, pending.destination], { cwd: pending.parent.canonical });
    await verify(pending.parent); await verify(owned); await this.audit(pending.destination);
    const gitDir = await anchor(path.join(pending.destination, '.git'));
    const tree = String(await this.git(['ls-tree', '-r', '-l', '-z', 'HEAD'], { cwd: pending.destination }) || '');
    const entries = [], folded = new Set(); let total = 0;
    for (const row of tree.split('\0').filter(Boolean)) {
      const match = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64}) +([0-9]+)\t(.+)$/s.exec(row);
      if (!match || !safePath(match[4])) throw fail('UNSAFE_PROJECT_TREE', '專案含符號連結、子模組或不安全路徑，已停止下載展開。');
      const size = Number(match[3]), key = match[4].normalize('NFC').toLowerCase();
      if (folded.has(key)) throw fail('UNSAFE_PROJECT_TREE'); folded.add(key);
      if (!Number.isSafeInteger(size) || size > MAX_FILE || (total += size) > MAX_TOTAL || entries.length >= 10000) throw fail('PROJECT_TOO_LARGE');
      if (sourceURL === `https://github.com/${TEMPLATE}.git` && match[4].startsWith('trips/') && !match[4].startsWith('trips/_example/')) throw fail('INVALID_TEMPLATE');
      entries.push({ mode: match[1], oid: match[2], size, name: match[4] });
    }
    if (!entries.length) throw fail('EMPTY_PROJECT', '私人專案目前沒有提交；請使用建立私人專案流程取得模板。');
    for (const entry of entries) {
      await verify(owned); await verify(gitDir);
      const output = await this.git(['cat-file', 'blob', entry.oid], { cwd: pending.destination, encoding: 'buffer', maxBuffer: MAX_FILE + 1024 });
      const bytes = Buffer.isBuffer(output) ? output : Buffer.from(output || '');
      const actual = createHash(entry.oid.length === 40 ? 'sha1' : 'sha256').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (bytes.length !== entry.size || actual !== entry.oid) throw fail('PROJECT_BLOB_CHANGED');
      const file = path.join(pending.destination, entry.name); await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      if (await fs.realpath(path.dirname(file)) !== path.dirname(file)) throw fail('UNSAFE_PROJECT_PATH');
      await fs.writeFile(file, bytes, { flag: 'wx', mode: entry.mode === '100755' ? 0o700 : 0o600 });
    }
    await this.git(['read-tree', 'HEAD'], { cwd: pending.destination }); await verify(owned); await verify(gitDir); return owned;
  }
  async installTrustedHooks(root) {
    try {
      for (const directory of ['.githooks', '.git/hooks']) {
        for (const name of await fs.readdir(path.join(root, directory))) if (!name.endsWith('.sample') && !(directory === '.githooks' && name === 'pre-push')) return false;
      }
      for (const relative of TRUSTED_FILES) {
        const file = path.join(root, relative), stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1024 * 1024 || await fs.realpath(file) !== file) return false;
        if (!sameTrusted(await fs.readFile(file), await fs.readFile(path.join(this.trustedRoot, relative)))) return false;
      }
      for (const folder of ['', 'scripts', 'scripts/lib']) {
        try { const data = JSON.parse(await fs.readFile(path.join(root, folder, 'package.json'), 'utf8')); if (data.type && data.type !== 'commonjs') return false; }
        catch (error) { if (error.code !== 'ENOENT') return false; }
      }
      const hook = await fs.stat(path.join(root, '.githooks/pre-push')); if (process.platform !== 'win32' && !(hook.mode & 0o111)) return false;
      await this.git(['config', '--local', 'core.hooksPath', '.githooks'], { cwd: root }); return true;
    } catch { return false; }
  }
  async confirmClone(token) {
    const pending = this.take(token, 'clone'); let localCreated = false;
    try {
      await verify(pending.parent); await this.privateRepo(pending.repo, pending.parent.canonical);
      try { await fs.lstat(pending.destination); throw fail('DESTINATION_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      localCreated = true; await this.materialize(pending, pending.url);
      await this.privateRepo(pending.repo, pending.destination);
      const backupReady = await this.installTrustedHooks(pending.destination), identityReady = await this.identityReady(pending.destination);
      return { ready: true, root: pending.destination, repo: pending.repo, backupReady, identityReady, warning: !backupReady ? '專案可讀取；備份保護程式尚未通過核對，GitHub 備份暫時停用。' : !identityReady ? '專案已下載；尚未設定 Git 提交作者，第一次備份前請設定姓名與郵件。原有 Git 設定未被更動。' : null };
    } catch (error) { return { ready: false, ...(localCreated ? { root: pending.destination } : {}), repo: pending.repo, code: error.code || 'PROJECT_DOWNLOAD_FAILED', message: '下載未完成；已產生的本機資料保留，沒有覆蓋既有資料夾，也沒有推送。請核對位置、權限與網路。' }; }
    finally { this.busy = false; }
  }
  async confirmCreate(token) {
    const pending = this.take(token, 'create'); let created = false, localCreated = false, createAttempted = false;
    try {
      await verify(pending.parent); await noRepositoryParent(pending.parent.canonical); await this.audit(pending.parent.canonical);
      try { await fs.lstat(pending.destination); throw fail('DESTINATION_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const account = await this.authenticatedAuthor(pending.parent.canonical); if (account.owner !== pending.owner || account.accountId !== pending.accountId) throw fail('ACCOUNT_CHANGED');
      createAttempted = true; await this.github(['repo', 'create', pending.repo, '--private', '--description', 'Private Travel Planner journeys'], pending.parent.canonical); created = true;
      await this.privateRepo(pending.repo, pending.parent.canonical);
      localCreated = true; const owned = await this.materialize(pending, `https://github.com/${TEMPLATE}.git`);
      await this.git(['remote', 'rename', 'origin', 'upstream'], { cwd: pending.destination });
      await this.git(['remote', 'add', 'origin', pending.url], { cwd: pending.destination });
      // main 原本追蹤公開模板；改成追蹤自己的私人專案，外部 Git 工具按 Push 才不會推錯地方。
      const branch = String(await this.git(['branch', '--show-current'], { cwd: pending.destination })).trim();
      if (branch) { await this.git(['config', '--local', `branch.${branch}.remote`, 'origin'], { cwd: pending.destination }); await this.git(['config', '--local', `branch.${branch}.merge`, `refs/heads/${branch}`], { cwd: pending.destination }); }
      await this.privateRepo(pending.repo, pending.destination); await verify(owned);
      const origins = String(await this.git(['remote', 'get-url', '--push', '--all', 'origin'], { cwd: pending.destination })).trim(); if (origins !== pending.url) throw fail('DESTINATION_CHANGED');
      await this.git(['config', '--local', 'user.name', pending.author.name], { cwd: pending.destination });
      await this.git(['config', '--local', 'user.email', pending.author.email], { cwd: pending.destination });
      const backupReady = await this.installTrustedHooks(pending.destination);
      return { ready: true, created: true, identityReady: true, root: pending.destination, repo: pending.repo, backupReady, backedUp: false,
        warning: backupReady ? '私人專案與本機複本已建立；尚未推送，請在備份區確認第一次備份。' : '私人專案已建立；備份保護未通過核對，尚未推送。' };
    } catch (error) { return { ready: false, created, creationOutcome: created ? 'created' : createAttempted ? 'unknown' : 'not-started', ...(localCreated ? { root: pending.destination } : {}), repo: pending.repo, code: error.code || 'PROJECT_CREATE_FAILED', message: created ? 'GitHub 私人專案已建立，但本機設定未完成；遠端與本機資料均保留，請核對後再處理，不要重複建立。' : createAttempted ? 'GitHub 建立結果尚未確認，遠端可能已存在；請先核對，不要直接重試建立。' : '建立尚未開始；請先確認 GitHub 帳號、專案名稱與目前遠端狀態，再決定下一步。' }; }
    finally { this.busy = false; }
  }
}
module.exports = { ProjectSetupService, repository, safePath };
