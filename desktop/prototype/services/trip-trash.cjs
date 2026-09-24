const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { verifyPrivateProject } = require('../proposals.cjs');
const exec = promisify(execFile);
const SLUG = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/;
const ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const fail = (code, message = code) => Object.assign(new Error(message), { code });
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const identity = stat => ({ dev: stat.dev, ino: stat.ino });
async function exists(file) { try { return await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function anchor(directory) {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail('UNSAFE_TRASH_PATH');
  const canonical = await fs.realpath(directory);
  if (!same(stat, await fs.lstat(directory))) throw fail('TRIP_CHANGED');
  return { directory, canonical, stat };
}
async function verify(anchors) {
  for (const a of anchors) {
    const stat = await fs.lstat(a.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !same(stat, a.stat) || await fs.realpath(a.directory) !== a.canonical) throw fail('TRIP_CHANGED');
  }
}
async function defaultIgnored(root, relative) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  try { await exec('git', ['--no-pager', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', root, 'check-ignore', '--quiet', '--no-index', '--', relative], { env, timeout: 5000, maxBuffer: 4096 }); return true; }
  catch { return false; }
}
async function syncDirectory(directory) {
  let handle;
  try { handle = await fs.open(directory, 'r'); await handle.sync(); }
  catch (error) { if (process.platform !== 'win32' || !['EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP'].includes(error.code)) throw error; }
  finally { await handle?.close(); }
}
async function readReceipt(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 65536) throw fail('TRASH_RECORD_INVALID');
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat(); if (!same(opened, stat) || opened.size !== stat.size) throw fail('TRASH_RECORD_INVALID');
    const bytes = Buffer.alloc(stat.size + 1); const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat(); if (bytesRead !== stat.size || after.mtimeMs !== stat.mtimeMs || after.size !== stat.size || after.nlink !== 1) throw fail('TRASH_RECORD_INVALID');
    const r = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
    if (r.version !== 1 || !ID.test(r.id) || !SLUG.test(r.slug) || typeof r.root !== 'string' || !path.isAbsolute(r.root)
      || typeof r.title !== 'string' || r.title.length > 300 || !['moving', 'trashed', 'restoring', 'restored', 'aborted'].includes(r.state)
      || !/^[a-f0-9]{64}$/.test(r.fingerprint) || !Number.isSafeInteger(r.fileCount) || r.fileCount < 0 || !Number.isSafeInteger(r.bytes) || r.bytes < 0
      || !Number.isFinite(r.tripIdentity?.dev) || !Number.isFinite(r.tripIdentity?.ino) || !Number.isFinite(Date.parse(r.createdAt))) throw fail('TRASH_RECORD_INVALID');
    return r;
  } catch (error) { if (error.code === 'TRASH_RECORD_INVALID') throw error; throw fail('TRASH_RECORD_INVALID'); }
  finally { await handle.close(); }
}
async function scan(directory) {
  const anchors = [], records = [], files = []; let bytes = 0, visited = 0;
  async function walk(dir, relative = '', depth = 0) {
    if (depth > 32) throw fail('TRASH_SCAN_LIMIT');
    const a = await anchor(dir); anchors.push(a);
    records.push([relative, 'directory', a.stat.dev, a.stat.ino, a.stat.mode, a.stat.mtimeMs]);
    for (const name of (await fs.readdir(dir)).sort()) {
      if (++visited > 20000 || /[\x00-\x1f\x7f]/.test(name)) throw fail('TRASH_SCAN_LIMIT');
      const file = path.join(dir, name), key = relative ? relative + '/' + name : name, stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) throw fail('UNSAFE_TRASH_PATH', '行程含符號連結，請先核對，App 不會移動未知連結。');
      if (stat.isDirectory()) await walk(file, key, depth + 1);
      else {
        if (!stat.isFile() || stat.nlink !== 1) throw fail('UNSAFE_TRASH_PATH');
        bytes += stat.size; if (!Number.isSafeInteger(bytes) || bytes > 8 * 1024 * 1024 * 1024) throw fail('TRASH_SCAN_LIMIT');
        records.push([key, 'file', stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs]);
        files.push({ path: key, bytes: stat.size });
      }
    }
    await verify([a]);
  }
  await walk(directory); await verify(anchors);
  let title = path.basename(directory);
  try {
    const file = path.join(directory, 'trip.config.json'), before = await fs.lstat(file);
    if (before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && before.size <= 1024 * 1024) {
      const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      try { const current = await handle.stat(); if (same(current, before) && current.size === before.size) { const data = Buffer.alloc(before.size + 1); const { bytesRead } = await handle.read(data, 0, data.length, 0); if (bytesRead === before.size) { const config = JSON.parse(data.subarray(0, bytesRead).toString('utf8')); if (typeof config.title === 'string' && config.title.trim()) title = config.title.trim().slice(0, 300); } } }
      finally { await handle.close(); }
    }
  } catch { /* Invalid config must not prevent local deletion of readable data. */ }
  await verify(anchors);
  return { title, files, fileCount: files.length, bytes, fingerprint: hash(JSON.stringify(records)), tripIdentity: identity(anchors[0].stat), anchors };
}
class TripTrashService {
  constructor({ checkPrivate = verifyPrivateProject, checkIgnored = defaultIgnored, beforeMove = async () => {}, afterMove = async () => {} } = {}) {
    this.checkPrivate = checkPrivate; this.checkIgnored = checkIgnored; this.beforeMove = beforeMove; this.afterMove = afterMove;
    this.pending = new Map(); this.targets = new Map(); this.queue = Promise.resolve();
  }
  remember(id, root) { if (!this.targets.has(id) && this.targets.size >= 5000) this.targets.delete(this.targets.keys().next().value); this.targets.set(id, root); }
  run(fn) { const p = this.queue.then(fn); this.queue = p.catch(() => {}); return p; }
  async roots(root, { create = false, privateCheck = false } = {}) {
    if (typeof root !== 'string' || !path.isAbsolute(root)) throw fail('UNSAFE_TRASH_PATH');
    const project = await anchor(root); root = project.canonical;
    if (privateCheck && await this.checkPrivate(root) === false) throw fail('PRIVATE_REPO_REQUIRED');
    const trips = await anchor(path.join(root, 'trips'));
    for (const directory of [path.join(root, '.local'), path.join(root, '.local/desktop-trash')]) { if (await exists(directory)) await anchor(directory); }
    if (!await this.checkIgnored(root, '.local/')) throw fail('TRASH_NOT_IGNORED', '這個專案的設定比較舊，App 無法確定回收區不會被一起備份上去，所以旅程先不移除。請先到「設定 → 專案管理」按「更新專案」，完成後再試。');
    const anchors = [project, trips];
    for (const directory of [path.join(root, '.local'), path.join(root, '.local/desktop-trash')]) {
      if (create) { try { await fs.mkdir(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; } }
      anchors.push(await anchor(directory)); await verify(anchors);
    }
    return { root, anchors, trips: trips.canonical, trash: anchors.at(-1).canonical };
  }
  async write(record, folder, roots) {
    await verify([...roots.anchors, folder]);
    const file = path.join(folder.canonical, 'receipt.json');
    const existing = await exists(file); if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) throw fail('TRASH_RECORD_INVALID');
    const temporary = path.join(folder.canonical, '.receipt-' + randomUUID() + '.tmp'); let owned;
    try {
      const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await handle.writeFile(JSON.stringify(record, null, 2) + '\n'); await handle.sync(); owned = await handle.stat(); } finally { await handle.close(); }
      await verify([...roots.anchors, folder]); const now = await fs.lstat(temporary);
      if (!now.isFile() || now.isSymbolicLink() || now.nlink !== 1 || !same(now, owned)) throw fail('TRASH_RECORD_INVALID');
      await fs.rename(temporary, file); await syncDirectory(folder.canonical);
    } finally { if (owned) { try { await verify([...roots.anchors, folder]); const now = await fs.lstat(temporary); if (now.isFile() && !now.isSymbolicLink() && same(now, owned)) await fs.unlink(temporary); } catch {} } }
  }
  prepare({ root, slug }) { return this.run(async () => {
    if (!SLUG.test(slug)) throw fail('INVALID_TRIP');
    const project = await anchor(root), trips = await anchor(path.join(project.canonical, 'trips')); root = project.canonical;
    if (await this.checkPrivate(root) === false) throw fail('PRIVATE_REPO_REQUIRED');
    if (!await this.checkIgnored(root, '.local/')) throw fail('TRASH_NOT_IGNORED');
    const source = path.join(trips.canonical, slug), snapshot = await scan(source); await verify([project, trips]);
    const id = randomUUID(); this.pending.clear(); this.pending.set(id, { root, slug, snapshot, anchors: [project, trips], expires: Date.now() + 10 * 60 * 1000 });
    return { token: id, id, title: snapshot.title, slug, fileCount: snapshot.fileCount, bytes: snapshot.bytes, files: snapshot.files,
      warning: '會把這趟旅程連同私人筆記與照片移至本機回收區。可還原；Git 歷史、遠端備份與已發布網站不會刪除。' };
  }); }
  confirm(token) { return this.run(async () => {
    const pending = this.pending.get(token); this.pending.delete(token);
    if (!pending || Date.now() > pending.expires) throw fail('STALE_CONFIRMATION');
    await verify(pending.anchors);
    const roots = await this.roots(pending.root, { create: true, privateCheck: true }), source = path.join(roots.trips, pending.slug);
    if ((await fs.readdir(roots.trash)).length >= 5000) throw fail('TRASH_LIMIT');
    const current = await scan(source); if (current.fingerprint !== pending.snapshot.fingerprint) throw fail('TRIP_CHANGED', '行程檔案已改變，請重新核對刪除清單。');
    const directory = path.join(roots.trash, token); await fs.mkdir(directory, { mode: 0o700 }); const folder = await anchor(directory);
    let moved = false;
    const record = { version: 1, id: token, root: roots.root, slug: pending.slug, title: pending.snapshot.title, createdAt: new Date().toISOString(), state: 'moving',
      fingerprint: current.fingerprint, tripIdentity: current.tripIdentity, fileCount: current.fileCount, bytes: current.bytes };
    await this.write(record, folder, roots);
    try {
      await this.beforeMove('trash', record); await verify([...roots.anchors, folder, ...current.anchors]);
      if ((await scan(source)).fingerprint !== record.fingerprint) throw fail('TRIP_CHANGED');
      await fs.rename(source, path.join(directory, 'trip')); moved = true; this.remember(token, roots.root);
      const movedStat = await fs.lstat(path.join(directory, 'trip')); if (!same(movedStat, record.tripIdentity)) throw fail('TRIP_CHANGED');
      await syncDirectory(roots.trips); await syncDirectory(directory); await this.afterMove('trash', record);
      record.state = 'trashed'; await this.write(record, folder, roots);
      return { trashed: true, id: token, root: roots.root, slug: record.slug, title: record.title, receiptRecorded: true };
    } catch (error) {
      if (moved) return { trashed: true, id: token, root: roots.root, slug: record.slug, title: record.title, receiptRecorded: false, message: '已移至本機回收區；完成紀錄待重新核對，請從回收區查看。' };
      throw error;
    }
  }); }
  async reconcile(roots, id) {
    if (!ID.test(id)) throw fail('INVALID_TRASH_ID');
    const folder = await anchor(path.join(roots.trash, id)), record = await readReceipt(path.join(folder.canonical, 'receipt.json'));
    if (record.id !== id || record.root !== roots.root) throw fail('TRASH_RECORD_INVALID');
    const source = await exists(path.join(roots.trips, record.slug)), destination = await exists(path.join(folder.canonical, 'trip'));
    const original = source?.isDirectory() && !source.isSymbolicLink() && same(source, record.tripIdentity);
    const trashed = destination?.isDirectory() && !destination.isSymbolicLink() && same(destination, record.tripIdentity);
    let state = record.state;
    if (state === 'moving') { if (trashed) state = 'trashed'; else if (original && !destination) state = 'aborted'; else throw fail('TRASH_RECOVERY_REQUIRED'); }
    if (state === 'restoring') { if (original && !destination) state = 'restored'; else if (trashed) state = 'trashed'; else throw fail('TRASH_RECOVERY_REQUIRED'); }
    if (state === 'trashed' && !trashed) throw fail('TRASH_RECOVERY_REQUIRED');
    if (state !== record.state) { record.state = state; await this.write(record, folder, roots); }
    await verify([...roots.anchors, folder]); return { record, folder };
  }
  list({ root }) { return this.run(async () => {
    let roots; try { roots = await this.roots(root, { privateCheck: true }); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const names = await fs.readdir(roots.trash); if (names.length > 5000) throw fail('TRASH_LIMIT'); const items = [];
    for (const id of names.filter(name => ID.test(name))) {
      const { record } = await this.reconcile(roots, id);
      if (record.state === 'trashed') { this.remember(id, roots.root); items.push({ id, slug: record.slug, title: record.title, createdAt: record.createdAt, fileCount: record.fileCount, bytes: record.bytes }); }
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }); }
  restore(input) { return this.run(async () => {
    const id = typeof input === 'string' ? input : input?.id, root = typeof input === 'string' ? this.targets.get(input) : input?.root;
    if (!ID.test(id) || !root) throw fail('INVALID_TRASH_ID');
    const roots = await this.roots(root, { privateCheck: true }), { record, folder } = await this.reconcile(roots, id);
    if (record.state !== 'trashed') throw fail('TRIP_NOT_TRASHED');
    const destination = path.join(roots.trips, record.slug), source = path.join(folder.canonical, 'trip');
    if (await exists(destination)) throw fail('RESTORE_DESTINATION_EXISTS', '原旅程名稱已被使用，已停止還原；不會覆蓋現有行程。');
    const snapshot = await scan(source); if (snapshot.fingerprint !== record.fingerprint) throw fail('TRASH_CONTENT_CHANGED', '回收區內容有變動，請先核對，未自動還原。');
    record.state = 'restoring'; await this.write(record, folder, roots); let moved = false;
    try {
      await this.beforeMove('restore', record); await verify([...roots.anchors, folder, ...snapshot.anchors]);
      if (await exists(destination)) throw fail('RESTORE_DESTINATION_EXISTS');
      if ((await scan(source)).fingerprint !== record.fingerprint) throw fail('TRASH_CONTENT_CHANGED');
      await fs.rename(source, destination); moved = true;
      if (!same(await fs.lstat(destination), record.tripIdentity)) throw fail('TRIP_CHANGED');
      await syncDirectory(roots.trips); await syncDirectory(folder.canonical); await this.afterMove('restore', record);
      record.state = 'restored'; record.restoredAt = new Date().toISOString(); await this.write(record, folder, roots);
      return { restored: true, id, root: roots.root, slug: record.slug, title: record.title, receiptRecorded: true };
    } catch (error) {
      if (moved) return { restored: true, id, root: roots.root, slug: record.slug, title: record.title, receiptRecorded: false, message: '旅程已還原；完成紀錄待重新核對。' };
      throw error;
    }
  }); }
}
module.exports = { TripTrashService };
