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
// 上一版引擎裡、由模板發布過的保護程式也算可信：它們只在「推到公開模板」時比較寬鬆，推到自己的私人 repo 行為一樣。
// 引擎改了保護程式之後，還沒「更新專案」的人仍能備份；再舊的版本照舊要求更新專案。
const PREVIOUS_TRUSTED = Object.freeze({
  'scripts/lib/pre-push.js': new Set(['d2bd506b68d622a3794e65357ac02b84fc413532cdc8cc00e21257861f64b7da']), // 引擎 1.1.4
});
const trustedFile = (relative, bytes, current) => sameTrusted(bytes, current)
  || Boolean(PREVIOUS_TRUSTED[relative]?.has(createHash('sha256').update(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1').digest('hex')));
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
        throw fail('UNSAFE_GIT_CONFIG', `這個專案的 Git 設定裡有會執行其他程式的項目（${key}），為了安全 App 這次沒有備份。這通常是其他工具加進去的，請把這個畫面給幫你設定電腦的人看。`);
      }
    }
    if (values.get('core.hookspath') !== '.githooks') throw fail('TRUSTED_HOOK_REQUIRED', '需要安裝並核對專案的私人備份 pre-push 保護。');
    if (values.get('core.worktree') && path.resolve(root, values.get('core.worktree')) !== root) throw fail('UNSAFE_GIT_CONFIG');
    // Git for Windows prints forward slashes even when realpath uses native separators.
    // Keep the canonical root check above; normalize only Git's path representation.
    if (path.resolve((await this.git(root, ['rev-parse', '--show-toplevel'])).trim()) !== root) throw fail('UNSAFE_PATH');
    const hookStat = await fs.lstat(path.join(root, '.githooks/pre-push'));
    if (process.platform !== 'win32' && !(hookStat.mode & 0o111)) throw fail('TRUSTED_HOOK_REQUIRED', '專案的備份保護程式沒有執行權限，App 無法啟用，這次沒有備份。請把這個畫面給幫你設定電腦的人看。');
    const entries = await fs.readdir(path.join(root, '.githooks'));
    for (const entry of entries) {
      if (entry.endsWith('.sample')) continue;
      if (entry !== 'pre-push') throw fail('UNTRUSTED_HOOK', '專案的 .githooks 裡有 App 不認得的程式（除了備份保護以外的 Git hook），App 不會執行它，這次沒有備份。');
    }
    for (const relative of TRUSTED_FILES) {
      if (!trustedFile(relative, await regularBytes(path.join(root, relative), 1024 * 1024), await regularBytes(path.join(this.trustedRoot, relative), 1024 * 1024))) throw fail('UNTRUSTED_HOOK', '專案裡的備份保護程式和 App 內建的版本不同。請先到「設定 → 我的旅程資料」按「更新專案」，完成後再備份。');
    }
    // A package type override would change how the trusted hook imports are executed.
    for (const folder of ['', 'scripts', 'scripts/lib']) {
      try { const data = JSON.parse(await regularBytes(path.join(root, folder, 'package.json'), 1024 * 1024)); if (data.type && data.type !== 'commonjs') throw fail('UNSAFE_GIT_CONFIG'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REBASE_HEAD']) {
      const file = (await this.git(root, ['rev-parse', '--git-path', marker])).trim();
      try { await fs.lstat(path.resolve(root, file)); throw fail('GIT_OPERATION_ACTIVE', '這個專案有一個還沒完成的 Git 合併（通常是其他工具留下的）。App 不會替你決定怎麼處理，這次沒有備份。請把這個畫面給幫你設定電腦的人看。'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return hash(config);
  }
  // 取消暫存：把其他工具 git add 過的改動放回一般修改，檔案內容不變（等同 git reset，不動工作檔）。
  async unstage(root) { await this.git(root, ['reset', '-q']); }
  async destination(root) {
    const urls = (await this.git(root, ['remote', 'get-url', '--push', '--all', 'origin'])).trim().split(/\r?\n/);
    const repo = urls.length === 1 && destinationRepo(urls[0]);
    const branch = (await this.git(root, ['branch', '--show-current'])).trim();
    if (!repo || repo.toLowerCase() === 'wangch15/travel-planner' || !branch || /[\s:~^?*\[\\]/.test(branch) || branch.startsWith('-')) throw fail('PRIVATE_REPO_REQUIRED', '這個專案的 GitHub 備份位置不明確（沒有設定、設了不只一個，或指向公開模板），App 不會猜要推到哪裡，這次沒有備份。請把這個畫面給幫你設定電腦的人看。');
    const response = await this.run('gh', ['repo', 'view', repo, '--json', 'visibility'], { cwd: root });
    if (response?.status && response.status !== 0) throw fail('PRIVATE_REPO_REQUIRED', '無法向 GitHub 確認這個專案是私人的（可能是網路不通，或 GitHub 還沒連接），這次沒有備份。確認連線後再試。');
    let visibility = null; try { visibility = JSON.parse(response.stdout).visibility; } catch {}
    if (visibility !== 'PRIVATE') throw fail('PRIVATE_REPO_REQUIRED', '備份位置不是「私人」的 GitHub 專案。為了保護訂房等私人資料，App 不會推送。請到 GitHub 網站把這個專案設成 Private 後再備份。');
    return { url: urls[0], repo, branch };
  }
  async inspect(target) {
    const { root, slug } = target, scope = target.scope === 'archive' ? 'archive' : 'trip';
    // slug 為 null：整個專案層級的備份，只推送既有提交（例如剛建立、還沒有旅程的專案，或引擎更新的合併）。
    // slug 為 '*'：所有旅程一起備份（trips/ 底下，不含模板附的 _example）。
    if (slug !== null && slug !== '*' && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) throw fail('INVALID_TARGET');
    const configDigest = await this.audit(root), destination = await this.destination(root);
    let authorReady = false;
    try { authorReady = Boolean((await this.git(root, ['config', 'user.name'])).trim() && (await this.git(root, ['config', 'user.email'])).trim()); } catch {}
    if (!authorReady) throw fail('GIT_IDENTITY_REQUIRED', '還沒設定備份署名（每次備份會記下的名字與郵件）。');
    const head = (await this.git(root, ['rev-parse', 'HEAD'])).trim();
    const staged = await this.git(root, ['diff', '--no-ext-diff', '--no-textconv', '--cached', '--name-only', '-z']);
    if (staged) throw fail('STAGED_CHANGES', '專案裡有被其他工具「暫存」、準備提交的改動。按「取消暫存」會讓它們回到一般的修改（檔案內容不變），App 再一起列出來讓你核對。');
    // scope 'archive'：封存、還原或永久刪除一趟旅程時，旅程原位置與 trips/_archived/ 的同名資料夾一起備份。
    const prefixes = slug === null ? [] : slug === '*' ? ['trips/'] : scope === 'archive' ? [`trips/${slug}/`, `trips/_archived/${slug}/`] : [`trips/${slug}/`];
    const inScope = name => prefixes.some(prefix => name.startsWith(prefix));
    const own = name => slug !== '*' || !name.startsWith('trips/_example/');
    const names = prefixes.length ? (await this.git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...prefixes])).split('\0').filter(Boolean).filter(own) : [];
    const files = []; let total = 0;
    for (const name of [...new Set(names)].sort()) {
      if (!inScope(name) || name.split('/').some(p => p === '..') || /[\x00-\x1f\x7f]/.test(name)) throw fail('UNSAFE_PATH');
      let bytes;
      try { bytes = await regularBytes(path.join(root, name)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      total += bytes?.length || 0;
      if (total > 256 * 1024 * 1024 || files.length >= 5000) throw fail('BACKUP_TOO_LARGE');
      files.push({ path: name, status: bytes ? 'present' : 'deleted', bytes: bytes?.length || 0, digest: bytes ? hash(bytes) : null });
    }
    const changedNames = new Set(prefixes.length ? (await this.git(root, ['diff', '--no-ext-diff', '--no-textconv', '--name-only', '--no-renames', '-z', 'HEAD', '--', ...prefixes])).split('\0').filter(Boolean).filter(own) : []);
    if (prefixes.length) for (const name of (await this.git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...prefixes])).split('\0').filter(Boolean).filter(own)) changedNames.add(name);
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
    return { ...destination, root, slug, scope, head, remoteHead, configDigest, files: changed, allFilesDigest: hash(JSON.stringify(files)), unpublishedCommits,
      unrelatedCommittedFiles: unpublishedFiles.filter(name => !inScope(name)), firstPush: !remoteHead,
      warnings: unpublishedCommits ? ['推送會包含目前分支尚未備份的既有提交，請一併核對。'] : [] };
  }
  // 不連網的備份狀態：這趟旅程有沒有尚未提交的改動、目前分支有沒有尚未推送的提交。
  async localStatus(root, slug) {
    if (slug !== null && slug !== '*' && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) throw fail('INVALID_TARGET');
    const pendingFiles = slug ? (await this.git(root, ['status', '--porcelain', '-z', '--untracked-files=all', '--', slug === '*' ? 'trips/' : `trips/${slug}/`])).split('\0').filter(Boolean).filter(row => slug !== '*' || !row.slice(3).startsWith('trips/_example/')).length : 0;
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
    return { token, ...snapshot, dayChanges: await this.dayChanges(target.root, target.slug) };
  }
  // 跟上次備份（HEAD）相比，這趟行程每天改了什麼；讀不到或格式不支援時回傳 null，只顯示檔案清單。
  async dayChanges(root, slug) {
    if (!slug || slug === '*' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) return null;
    try {
      const file = `trips/${slug}/data.js`;
      const before = await this.git(root, ['show', `HEAD:${file}`]);
      const after = (await regularBytes(path.join(root, file))).toString('utf8');
      return before === after ? [] : require('../proposal-diff.cjs').changesBetween(before, after);
    } catch { return null; }
  }
  // 「全部不要」：把這趟旅程的資料夾回到上次備份（HEAD）。先列出清單與代碼，確認後才動檔案。
  async discardInspect(root, slug) {
    if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug || '')) throw fail('INVALID_TARGET');
    const prefix = `trips/${slug}/`;
    const safe = name => name.startsWith(prefix) && !name.split('/').some(p => p === '..') && !/[\x00-\x1f\x7f]/.test(name);
    const restore = (await this.git(root, ['diff', '--no-ext-diff', '--no-textconv', '--name-only', '--no-renames', '-z', 'HEAD', '--', prefix])).split('\0').filter(Boolean).sort();
    const remove = (await this.git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', prefix])).split('\0').filter(Boolean).sort();
    if (![...restore, ...remove].every(safe)) throw fail('UNSAFE_PATH');
    const digests = {};
    for (const name of [...restore, ...remove]) { try { digests[name] = hash(await regularBytes(path.join(root, name))); } catch (error) { if (error.code !== 'ENOENT') throw error; digests[name] = null; } }
    return { root, slug, head: (await this.git(root, ['rev-parse', 'HEAD'])).trim(), restore, remove, digests };
  }
  async discardPrepare({ root, slug }) {
    if (this.busy) throw fail('BACKUP_BUSY');
    const snapshot = await this.discardInspect(root, slug), token = randomUUID();
    this.pending.clear(); this.pending.set(token, { discard: snapshot, expires: Date.now() + 10 * 60 * 1000 });
    return { token, restore: snapshot.restore, remove: snapshot.remove, dayChanges: await this.dayChanges(root, slug) };
  }
  async discardConfirm(token) {
    if (this.busy) throw fail('BACKUP_BUSY');
    const pending = this.pending.get(token); this.pending.delete(token);
    if (!pending?.discard || Date.now() > pending.expires) throw fail('STALE_CONFIRMATION');
    this.busy = true;
    try {
      const { root, slug } = pending.discard, current = await this.discardInspect(root, slug);
      if (JSON.stringify(current) !== JSON.stringify(pending.discard)) throw fail('CONTENT_CHANGED', '檔案在確認前又有變動，請重新查看。');
      if (current.restore.length) await this.git(root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...current.restore]);
      for (const name of current.remove) await fs.rm(path.join(root, name), { force: true });
      return { discarded: true, restored: current.restore.length, removed: current.remove.length };
    } finally { this.busy = false; }
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
        await this.git(current.root, ['commit', '-m', current.slug === '*' ? 'Save all trips from Travel Planner' : current.scope === 'archive' ? `Archive or remove trip ${current.slug} from Travel Planner` : `Save trip ${current.slug} from Travel Planner`]);
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
module.exports = { BackupService, defaultRun, regularBytes, TRUSTED_FILES, sameTrusted, trustedFile, trustedFilter };
