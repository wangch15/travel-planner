const fs = require('node:fs/promises');
const path = require('node:path');
const { constants } = require('node:fs');
const { createHash, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { destinationRepo } = require('../../../scripts/lib/pre-push.js');
const execute = promisify(execFile);
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (code, message) => Object.assign(new Error(message || code), { code });
const TRUSTED_FILES = ['.githooks/pre-push', 'scripts/pre-push.js', 'scripts/lib/pre-push.js', 'scripts/lib/push-history.js', 'scripts/lib/contribution-history.js'];
// Git for Windows 預設 autocrlf，檢出的檔案可能是 CRLF；比對可信版本時忽略換行差異。
const sameTrusted = (a, b) => a.toString('latin1').replace(/\r\n/g, '\n') === b.toString('latin1').replace(/\r\n/g, '\n');
// Git LFS 官方安裝會在全域設定寫入這幾個 filter；只放行這些標準值，其他 filter 仍視為會執行未知程式。
const LFS_FILTERS = Object.freeze({ 'filter.lfs.clean': ['git-lfs clean -- %f'], 'filter.lfs.smudge': ['git-lfs smudge -- %f', 'git-lfs smudge --skip -- %f'], 'filter.lfs.process': ['git-lfs filter-process', 'git-lfs filter-process --skip'], 'filter.lfs.required': ['true'] });
const trustedFilter = (key, value) => Object.hasOwn(LFS_FILTERS, key) && LFS_FILTERS[key].includes(String(value).trim());
const safeEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(GIT_|NODE_OPTIONS$|NODE_PATH$|LD_|DYLD_)/.test(key)));
async function defaultRun(bin, args, { pathPrefix, ...options } = {}) {
  // pathPrefix：只給 App 自己發起的推送用，讓備份 hook 找得到 App 內建的 node。
  const base = safeEnv(), pathKey = Object.keys(base).find(key => key.toUpperCase() === 'PATH') || 'PATH';
  if (pathPrefix) base[pathKey] = pathPrefix + path.delimiter + (base[pathKey] || '');
  return execute(bin, args, { ...options, env: { ...base, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1' }, timeout: 120000, maxBuffer: options.maxBuffer || 8 * 1024 * 1024 });
}
async function regularBytes(file, maximum = 32 * 1024 * 1024) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > maximum || await fs.realpath(file) !== file) throw fail('UNSAFE_PATH', '檔案連結或大小不符合安全備份條件。');
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const current = await handle.stat();
    if (current.dev !== stat.dev || current.ino !== stat.ino || current.size > maximum) throw fail('CONTENT_CHANGED');
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (after.mtimeMs !== current.mtimeMs || after.size !== bytes.length) throw fail('CONTENT_CHANGED');
    return bytes;
  } finally { await handle.close(); }
}
class BackupService {
  constructor({ run = defaultRun, trustedRoot = path.resolve(__dirname, '../../..'), hookPath = null } = {}) {
    this.run = run; this.trustedRoot = trustedRoot; this.hookPath = hookPath; this.pending = new Map(); this.busy = false;
  }
  async git(root, args, options = {}) {
    const result = await this.run('git', ['--no-replace-objects', '--no-pager', '--no-optional-locks', '-C', root, ...args], { cwd: root, ...options });
    if (result?.status && result.status !== 0) throw fail('GIT_FAILED');
    return String(result.stdout || '');
  }
  async audit(root) {
    if (!path.isAbsolute(root) || await fs.realpath(root) !== root) throw fail('UNSAFE_PATH');
    // Config listing does not invoke filters, credential helpers, or hooks.
    const dotGit = await fs.lstat(path.join(root, '.git'));
    if (dotGit.isSymbolicLink() || (!dotGit.isDirectory() && !dotGit.isFile())) throw fail('UNSAFE_PATH');
    const config = await this.git(root, ['config', '--null', '--list']);
    const values = new Map();
    for (const entry of config.split('\0').filter(Boolean)) {
      const at = entry.indexOf('\n'), key = entry.slice(0, at).toLowerCase(), value = entry.slice(at + 1);
      values.set(key, value);
      if (!trustedFilter(key, value) && /^(filter\.|gpg\.|diff\..*\.(command|textconv)$|url\..*\.(insteadof|pushinsteadof)$|remote\..*\.(receivepack|uploadpack|vcs|proxy)$)/.test(key)
        || ['core.fsmonitor', 'core.sshcommand', 'core.gitproxy', 'core.askpass', 'diff.external', 'core.alternateRefsCommand'.toLowerCase()].includes(key)
        || (['commit.gpgsign', 'push.gpgsign'].includes(key) && !['false', 'no', '0'].includes(value))
        || (/^credential(?:\..+)?\.helper$/.test(key) && !/^(|osxkeychain|manager|manager-core|wincred|cache(?: --timeout=\d+)?|!gh auth git-credential|!\/(?:opt\/homebrew|usr\/local)\/bin\/gh auth git-credential)$/.test(value))) {
        throw fail('UNSAFE_GIT_CONFIG', '專案含會執行外部程式的 Git 設定，請先由可信的工具核對。');
      }
    }
    if (values.get('core.hookspath') !== '.githooks') throw fail('TRUSTED_HOOK_REQUIRED', '需要安裝並核對專案的私人備份 pre-push 保護。');
    if (values.get('core.worktree') && path.resolve(root, values.get('core.worktree')) !== root) throw fail('UNSAFE_GIT_CONFIG');
    // Git for Windows prints forward slashes even when realpath uses native separators.
    // Keep the canonical root check above; normalize only Git's path representation.
    if (path.resolve((await this.git(root, ['rev-parse', '--show-toplevel'])).trim()) !== root) throw fail('UNSAFE_PATH');
    const hookStat = await fs.lstat(path.join(root, '.githooks/pre-push'));
    if (process.platform !== 'win32' && !(hookStat.mode & 0o111)) throw fail('TRUSTED_HOOK_REQUIRED', '備份保護 hook 未啟用，請先修復安裝。');
    const entries = await fs.readdir(path.join(root, '.githooks'));
    for (const entry of entries) {
      if (entry.endsWith('.sample')) continue;
      if (entry !== 'pre-push') throw fail('UNTRUSTED_HOOK', '自訂 Git hook 需要先核對，App 不會執行未知程式。');
    }
    for (const relative of TRUSTED_FILES) {
      if (!sameTrusted(await regularBytes(path.join(root, relative), 1024 * 1024), await regularBytes(path.join(this.trustedRoot, relative), 1024 * 1024))) throw fail('UNTRUSTED_HOOK', '備份保護程式與 App 的可信版本不同，請先更新核對。');
    }
    // A package type override would change how the trusted hook imports are executed.
    for (const folder of ['', 'scripts', 'scripts/lib']) {
      try { const data = JSON.parse(await regularBytes(path.join(root, folder, 'package.json'), 1024 * 1024)); if (data.type && data.type !== 'commonjs') throw fail('UNSAFE_GIT_CONFIG'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REBASE_HEAD']) {
      const file = (await this.git(root, ['rev-parse', '--git-path', marker])).trim();
      try { await fs.lstat(path.resolve(root, file)); throw fail('GIT_OPERATION_ACTIVE', '請先完成目前的 Git 合併或重排操作。'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return hash(config);
  }
  async destination(root) {
    const urls = (await this.git(root, ['remote', 'get-url', '--push', '--all', 'origin'])).trim().split(/\r?\n/);
    const repo = urls.length === 1 && destinationRepo(urls[0]);
    const branch = (await this.git(root, ['branch', '--show-current'])).trim();
    if (!repo || repo.toLowerCase() === 'wangch15/travel-planner' || !branch || /[\s:~^?*\[\\]/.test(branch) || branch.startsWith('-')) throw fail('PRIVATE_REPO_REQUIRED', '無法確認唯一的私人備份目的地與分支。');
    const response = await this.run('gh', ['repo', 'view', repo, '--json', 'visibility'], { cwd: root });
    if (response?.status && response.status !== 0 || JSON.parse(response.stdout).visibility !== 'PRIVATE') throw fail('PRIVATE_REPO_REQUIRED', '備份目的地必須能確認為 PRIVATE。');
    return { url: urls[0], repo, branch };
  }
  async inspect(target) {
    const { root, slug } = target;
    // slug 為 null：整個專案層級的備份，只推送既有提交（例如剛建立、還沒有旅程的專案，或引擎更新的合併）。
    if (slug !== null && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) throw fail('INVALID_TARGET');
    const configDigest = await this.audit(root), destination = await this.destination(root);
    let authorReady = false;
    try { authorReady = Boolean((await this.git(root, ['config', 'user.name'])).trim() && (await this.git(root, ['config', 'user.email'])).trim()); } catch {}
    if (!authorReady) throw fail('GIT_IDENTITY_REQUIRED', '尚未設定 Git 提交作者；請先設定姓名與郵件，再重新準備備份。');
    const head = (await this.git(root, ['rev-parse', 'HEAD'])).trim();
    const staged = await this.git(root, ['diff', '--no-ext-diff', '--no-textconv', '--cached', '--name-only', '-z']);
    if (staged) throw fail('STAGED_CHANGES', '已有暫存中的改動；請先完成或取消原本的提交，再使用 App 備份。');
    const prefix = slug === null ? null : `trips/${slug}/`;
    const names = prefix ? (await this.git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', prefix])).split('\0').filter(Boolean) : [];
    const files = []; let total = 0;
    for (const name of [...new Set(names)].sort()) {
      if (!name.startsWith(prefix) || name.split('/').some(p => p === '..') || /[\x00-\x1f\x7f]/.test(name)) throw fail('UNSAFE_PATH');
      let bytes;
      try { bytes = await regularBytes(path.join(root, name)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      total += bytes?.length || 0;
      if (total > 256 * 1024 * 1024 || files.length >= 5000) throw fail('BACKUP_TOO_LARGE');
      files.push({ path: name, status: bytes ? 'present' : 'deleted', bytes: bytes?.length || 0, digest: bytes ? hash(bytes) : null });
    }
    const changedNames = new Set(prefix ? (await this.git(root, ['diff', '--no-ext-diff', '--no-textconv', '--name-only', '--no-renames', '-z', 'HEAD', '--', prefix])).split('\0').filter(Boolean) : []);
    if (prefix) for (const name of (await this.git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', prefix])).split('\0').filter(Boolean)) changedNames.add(name);
    const changed = files.filter(file => changedNames.has(file.path));
    const remote = (await this.git(root, ['ls-remote', destination.url, `refs/heads/${destination.branch}`])).trim();
    const remoteHead = remote ? remote.split(/\s+/)[0] : null;
    let unpublishedCommits = 0, unpublishedFiles = [];
    if (remoteHead !== head) {
      if (remoteHead) {
        await this.git(root, ['merge-base', '--is-ancestor', remoteHead, head]);
        unpublishedCommits = Number((await this.git(root, ['rev-list', '--count', `${remoteHead}..${head}`])).trim());
        unpublishedFiles = (await this.git(root, ['diff', '--no-ext-diff', '--no-textconv', '--name-only', '-z', remoteHead, head])).split('\0').filter(Boolean);
      } else {
        unpublishedCommits = Number((await this.git(root, ['rev-list', '--count', head])).trim());
        unpublishedFiles = (await this.git(root, ['ls-tree', '-r', '--name-only', '-z', head])).split('\0').filter(Boolean);
      }
    }
    return { ...destination, root, slug, head, remoteHead, configDigest, files: changed, allFilesDigest: hash(JSON.stringify(files)), unpublishedCommits,
      unrelatedCommittedFiles: unpublishedFiles.filter(name => !prefix || !name.startsWith(prefix)), firstPush: !remoteHead,
      warnings: unpublishedCommits ? ['推送會包含目前分支尚未備份的既有提交，請一併核對。'] : [] };
  }
  // 不連網的備份狀態：這趟旅程有沒有尚未提交的改動、目前分支有沒有尚未推送的提交。
  async localStatus(root, slug) {
    if (slug !== null && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) throw fail('INVALID_TARGET');
    const pendingFiles = slug ? (await this.git(root, ['status', '--porcelain', '-z', '--untracked-files=all', '--', `trips/${slug}/`])).split('\0').filter(Boolean).length : 0;
    const branch = (await this.git(root, ['branch', '--show-current'])).trim();
    if (!branch) return { pendingFiles, unpushedCommits: null, neverBackedUp: false };
    // 還沒有 origin 追蹤分支＝從未推送；預設 runner 在 git 非零退出時會丟錯，所以一併當成沒有。
    let tracking = null;
    try { tracking = await this.run('git', ['--no-pager', '-C', root, 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`], { cwd: root }); } catch {}
    if (!tracking || tracking.status && tracking.status !== 0 || !String(tracking.stdout || '').trim()) return { pendingFiles, unpushedCommits: null, neverBackedUp: true };
    const unpushedCommits = Number((await this.git(root, ['rev-list', '--count', `refs/remotes/origin/${branch}..HEAD`])).trim()) || 0;
    return { pendingFiles, unpushedCommits, neverBackedUp: false };
  }
  async prepare(target) {
    if (this.busy) throw fail('BACKUP_BUSY');
    const snapshot = await this.inspect(target), token = randomUUID();
    this.pending.clear(); this.pending.set(token, { snapshot, expires: Date.now() + 10 * 60 * 1000 });
    return { token, ...snapshot };
  }
  async confirm(token) {
    if (this.busy) throw fail('BACKUP_BUSY');
    const pending = this.pending.get(token); this.pending.delete(token);
    if (!pending || Date.now() > pending.expires) throw fail('STALE_CONFIRMATION');
    this.busy = true; let committed = false, head = pending.snapshot.head;
    try {
      const current = await this.inspect(pending.snapshot);
      if (JSON.stringify(current) !== JSON.stringify(pending.snapshot)) throw fail('CONTENT_CHANGED', '內容或備份目的地已改變，請重新查看備份清單。');
      if (current.files.length) {
        await this.git(current.root, ['add', '--', ...current.files.map(file => file.path)]);
        const stagedNames = (await this.git(current.root, ['diff', '--no-ext-diff', '--no-textconv', '--cached', '--name-only', '--no-renames', '-z'])).split('\0').filter(Boolean).sort();
        if (JSON.stringify(stagedNames) !== JSON.stringify(current.files.map(file => file.path).sort())) throw fail('CONTENT_CHANGED');
        // Compare exact bytes of staged blobs with the reviewed worktree snapshot.
        for (const file of current.files) {
          if (file.status === 'deleted') continue;
          const blob = await this.run('git', ['--no-replace-objects', '-C', current.root, 'show', `:${file.path}`], { cwd: current.root, encoding: 'buffer', maxBuffer: 40 * 1024 * 1024 });
          if (hash(Buffer.isBuffer(blob.stdout) ? blob.stdout : Buffer.from(blob.stdout)) !== file.digest) throw fail('STAGED_CONTENT_CHANGED', 'Git 暫存內容與確認過的檔案不同，已停止。');
        }
        await this.audit(current.root);
        if ((await this.git(current.root, ['rev-parse', 'HEAD'])).trim() !== head) throw fail('CONTENT_CHANGED');
        await this.git(current.root, ['commit', '-m', `Save trip ${current.slug} from Travel Planner`]);
        committed = true; head = (await this.git(current.root, ['rev-parse', 'HEAD'])).trim();
      }
      await this.audit(current.root);
      const destination = await this.destination(current.root);
      if (JSON.stringify(destination) !== JSON.stringify({ url: current.url, repo: current.repo, branch: current.branch })) throw fail('DESTINATION_CHANGED');
      // Re-read the push URL and branch immediately after the fresh private visibility check.
      if ((await this.git(current.root, ['remote', 'get-url', '--push', '--all', 'origin'])).trim() !== current.url
        || (await this.git(current.root, ['branch', '--show-current'])).trim() !== current.branch
        || (await this.git(current.root, ['rev-parse', 'HEAD'])).trim() !== head) throw fail('DESTINATION_CHANGED');
      await this.git(current.root, ['push', 'origin', `HEAD:refs/heads/${current.branch}`], this.hookPath ? { pathPrefix: this.hookPath } : {});
      const remote = (await this.git(current.root, ['ls-remote', current.url, `refs/heads/${current.branch}`])).trim().split(/\s+/)[0];
      if (remote !== head) throw fail('REMOTE_NOT_VERIFIED');
      return { committed, backedUp: true, head, message: '私人備份已完成，遠端版本已核對。' };
    } catch (error) {
      return { committed, backedUp: false, head, code: error.code || 'BACKUP_FAILED', message: committed ? '已保存本機提交，尚未確認異地備份；請重新查核後再嘗試。' : (error.message && error.code ? error.message : '備份未完成；工作檔保留，請先確認 GitHub 登入與網路。') };
    } finally { this.busy = false; }
  }
}
module.exports = { BackupService, defaultRun, regularBytes, TRUSTED_FILES, sameTrusted, trustedFilter };
