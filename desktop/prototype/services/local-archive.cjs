const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parse } = require('acorn');
const { createHash, randomUUID } = require('node:crypto');
const { readTripSnapshot } = require('../../../packages/engine/snapshot.cjs');
const { parseLiteralModule } = require('../../../packages/engine/literal-data.cjs');
const { verifyPrivateProject } = require('../proposals.cjs');
const MAX_FILE = 16 * 1024 * 1024, MAX_TOTAL = 160 * 1024 * 1024, MAX_COUNT = 5000;
const MAX_ARCHIVE = Math.ceil(MAX_TOTAL * 4 / 3) + 5 * 1024 * 1024;
const ROOT_FILES = new Set(['trip.config.json', 'data.js', 'details.js', 'dining.js', 'map-lists.js', 'photos.json', 'basemap.json', 'theme.css', 'extra.js']);
const DOC_EXTENSIONS = new Set(['.md', '.txt', '.json', '.csv', '.pdf', '.png', '.jpg', '.jpeg', '.webp']);
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const fail = (code, message = code) => Object.assign(new Error(message), { code });
const sha = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const unchanged = (a, b) => same(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
function allowed(relative) {
  if (typeof relative !== 'string' || relative.length > 500 || relative.includes('\\')) return false;
  const parts = relative.split('/');
  if (parts.some(p => !p || p.startsWith('.') || p.length > 200 || /[\x00-\x1f\x7f<>:"|?*]/.test(p) || /[.\s]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) return false;
  if (parts.length === 1) return ROOT_FILES.has(relative);
  if (parts[0] === 'photos') return parts.length === 2 && /^[a-zA-Z0-9_-]{1,100}-\d+\.jpg$/.test(parts[1]);
  return parts[0] === 'docs' && DOC_EXTENSIONS.has(path.posix.extname(relative).toLowerCase());
}
async function anchor(directory) {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail('UNSAFE_ARCHIVE_PATH');
  const canonical = await fs.realpath(directory);
  if (!same(stat, await fs.lstat(directory))) throw fail('SOURCE_CHANGED');
  return { directory, canonical, stat };
}
async function verify(anchors) {
  for (const a of anchors) {
    const current = await fs.lstat(a.directory);
    if (!current.isDirectory() || current.isSymbolicLink() || !same(current, a.stat) || await fs.realpath(a.directory) !== a.canonical) throw fail('SOURCE_CHANGED');
  }
}
async function readFile(file, max = MAX_FILE) {
  const before = await fs.lstat(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > max) throw fail('UNSAFE_ARCHIVE_FILE', '備份檔案包含連結、非一般檔案或超過大小上限。');
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat(); if (!unchanged(before, opened)) throw fail('SOURCE_CHANGED');
    const buffer = Buffer.alloc(before.size + 1); let length = 0;
    while (length < buffer.length) { const result = await handle.read(buffer, length, buffer.length - length, length); if (!result.bytesRead) break; length += result.bytesRead; }
    const bytes = buffer.subarray(0, length), after = await handle.stat();
    if (!unchanged(opened, after) || bytes.length !== before.size || after.nlink !== 1) throw fail('SOURCE_CHANGED');
    return bytes;
  } finally { await handle.close(); }
}
async function collect(directory) {
  const files = []; const names = new Set(); const anchors = []; let total = 0, visited = 0;
  async function walk(current, relative = '') {
    const a = await anchor(current); anchors.push(a);
    for (const name of (await fs.readdir(current)).sort()) {
      if (++visited > MAX_COUNT + 1000) throw fail('ARCHIVE_TOO_LARGE');
      if (name.startsWith('.')) continue;
      const key = relative ? relative + '/' + name : name;
      if (!relative && !ROOT_FILES.has(name) && !['docs', 'photos'].includes(name)) continue;
      const file = path.join(current, name), stat = await fs.lstat(file);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1))) throw fail('UNSAFE_ARCHIVE_FILE');
      if (stat.isDirectory()) {
        if (key === 'docs' || key === 'photos' || key.startsWith('docs/')) {
          if (!allowed(key + '/placeholder.txt') && key !== 'photos') throw fail('UNSAFE_ARCHIVE_PATH');
          await walk(file, key);
        } else throw fail('UNSAFE_ARCHIVE_PATH');
      } else {
        if (!allowed(key)) throw fail('UNSUPPORTED_ARCHIVE_FILE', '旅程內含未支援的備份檔案類型，請先整理後再匯出。');
        const folded = key.normalize('NFC').toLowerCase(); if (names.has(folded)) throw fail('DUPLICATE_ARCHIVE_PATH'); names.add(folded);
        const bytes = await readFile(file); total += bytes.length;
        if (total > MAX_TOTAL || files.length >= MAX_COUNT) throw fail('ARCHIVE_TOO_LARGE');
        files.push({ path: key, bytes });
      }
    }
    await verify([a]);
  }
  await walk(directory); await verify(anchors);
  return { files: files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0), total, anchors };
}
function manifestDigest(files) { return sha(JSON.stringify(files.map(file => [file.path, file.bytes.length, sha(file.bytes)]))); }
async function writeTree(directory, files) {
  for (const file of files) {
    if (!allowed(file.path)) throw fail('UNSAFE_ARCHIVE_PATH');
    const target = path.join(directory, file.path); await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.writeFile(target, file.bytes, { flag: 'wx', mode: 0o600 });
  }
}
function jsonFile(files, name) {
  const file = files.find(item => item.path === name); if (!file) throw fail('INVALID_ARCHIVE', `缺少 ${name}。`);
  try { const value = JSON.parse(file.bytes.toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value; }
  catch { throw fail('INVALID_ARCHIVE'); }
}
function planningValidation(files) {
  const config = jsonFile(files, 'trip.config.json'), draft = jsonFile(files, 'docs/planning-draft.json');
  if (config.schemaVersion !== 1 || draft.version !== 1 || draft.status !== 'planning' || !Number.isSafeInteger(draft.revision) || draft.revision < 1
    || typeof draft.title !== 'string' || !draft.title.trim() || draft.title.length > 160 || typeof draft.notes !== 'string' || draft.notes.length > 16000) throw fail('INVALID_PLANNING_ARCHIVE');
  for (const file of files.filter(item => ROOT_FILES.has(item.path) && item.path.endsWith('.js'))) {
    const source = file.bytes.toString('utf8');
    if (parse(source, { ecmaVersion: 2022 }).body.length) parseLiteralModule(source);
  }
  const source = files.find(item => item.path === 'data.js'); if (!source) throw fail('INVALID_PLANNING_ARCHIVE');
  const data = parseLiteralModule(source.bytes.toString('utf8'));
  if (!Array.isArray(data.DAYS) || data.DAYS.length || !data.PLACES || Object.keys(data.PLACES).length) throw fail('INVALID_PLANNING_ARCHIVE', '規劃草稿尚不能包含未通過驗證的正式行程資料。');
  return draft;
}
async function validateFiles(directory, files, { allowPlanning, expectedKind } = {}) {
  const config = jsonFile(files, 'trip.config.json');
  const draftFile = files.find(file => file.path === 'docs/planning-draft.json');
  const isPlanning = draftFile && jsonFile(files, 'docs/planning-draft.json').status === 'planning';
  if (isPlanning) {
    if (!allowPlanning) throw fail('PLANNING_CONFIRMATION_REQUIRED', '這是尚未完成的規劃草稿；請明確選擇包含規劃草稿的備份模式。');
    const draft = planningValidation(files);
    if (expectedKind && expectedKind !== 'planning') throw fail('ARCHIVE_KIND_MISMATCH');
    return { kind: 'planning', title: draft.title };
  }
  if (expectedKind && expectedKind !== 'ready') throw fail('ARCHIVE_KIND_MISMATCH');
  await readTripSnapshot(directory, { slug: 'archive-validation' });
  return { kind: 'ready', title: config.title };
}
class LocalArchiveService {
  constructor({ checkPrivate = verifyPrivateProject } = {}) { this.checkPrivate = checkPrivate; this.queue = Promise.resolve(); }
  run(fn) { const result = this.queue.then(fn); this.queue = result.catch(() => {}); return result; }
  exportTrip({ root, slug }, destination, { allowPlanning = false } = {}) { return this.run(async () => {
    if (!path.isAbsolute(root) || !SLUG.test(slug) || !path.isAbsolute(destination) || !destination.toLowerCase().endsWith('.json')) throw fail('INVALID_ARCHIVE_TARGET');
    const roots = [await anchor(root), await anchor(path.join(root, 'trips')), await anchor(path.join(root, 'trips', slug))];
    const destParent = await anchor(path.dirname(destination)); destination = path.join(destParent.canonical, path.basename(destination));
    if (destination.startsWith(roots[1].canonical + path.sep)) throw fail('ARCHIVE_INSIDE_TRIP', '請把備份存到旅程資料夾以外，避免覆蓋原始資料。');
    let previous = null; try { previous = await fs.lstat(destination); if (!previous.isFile() || previous.isSymbolicLink() || previous.nlink !== 1) throw fail('UNSAFE_ARCHIVE_FILE'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const collected = await collect(roots[2].directory), digest = manifestDigest(collected.files);
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-archive-')); await fs.chmod(scratch, 0o700);
    let temporary, temporaryStat;
    try {
      await writeTree(scratch, collected.files); const info = await validateFiles(scratch, collected.files, { allowPlanning });
      await verify([...roots, ...collected.anchors, destParent]);
      if (manifestDigest((await collect(roots[2].directory)).files) !== digest) throw fail('SOURCE_CHANGED');
      const archive = { format: 'travel-planner-trip', version: 1, sourceSlug: slug, title: info.title, kind: info.kind, createdAt: new Date().toISOString(), digest,
        files: collected.files.map(file => ({ path: file.path, size: file.bytes.length, sha256: sha(file.bytes), data: file.bytes.toString('base64') })) };
      const bytes = Buffer.from(JSON.stringify(archive)); if (bytes.length > MAX_ARCHIVE) throw fail('ARCHIVE_TOO_LARGE');
      temporary = path.join(destParent.canonical, '.travel-archive-' + randomUUID() + '.tmp');
      const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); temporaryStat = await handle.stat(); } finally { await handle.close(); }
      await verify([destParent]);
      try { const current = await fs.lstat(destination); if (!previous || !unchanged(previous, current)) throw fail('DESTINATION_CHANGED'); } catch (error) { if (error.code !== 'ENOENT' || previous) throw error; }
      const currentTemp = await fs.lstat(temporary);
      if (!currentTemp.isFile() || currentTemp.isSymbolicLink() || currentTemp.nlink !== 1 || !unchanged(temporaryStat, currentTemp)) throw fail('DESTINATION_CHANGED');
      await fs.rename(temporary, destination); temporary = null;
      return { fileName: path.basename(destination), count: collected.files.length, bytes: collected.total, digest, kind: info.kind, includesPrivateNotes: collected.files.some(file => file.path.startsWith('docs/')) };
    } finally { if (temporary) { try { await verify([destParent]); await fs.unlink(temporary); } catch {} } await fs.rm(scratch, { recursive: true, force: true }); }
  }); }
  importTrip(root, archiveFile, { title, allowPlanning = false } = {}) { return this.run(async () => {
    if (!path.isAbsolute(root) || !path.isAbsolute(archiveFile) || (title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 160 || title.includes('\0')))) throw fail('INVALID_ARCHIVE_TARGET');
    const parent = await anchor(root); if ((await this.checkPrivate(parent.canonical)) === false) throw fail('PRIVATE_PROJECT_REQUIRED');
    const trips = await anchor(path.join(root, 'trips')); const archiveParent = await anchor(path.dirname(archiveFile));
    const raw = await readFile(archiveFile, MAX_ARCHIVE); await verify([archiveParent]);
    let archive; try { archive = JSON.parse(raw.toString('utf8')); } catch { throw fail('INVALID_ARCHIVE'); }
    if (!archive || archive.format !== 'travel-planner-trip' || archive.version !== 1 || !['planning', 'ready'].includes(archive.kind) || !Array.isArray(archive.files) || !archive.files.length || archive.files.length > MAX_COUNT || !/^[a-f0-9]{64}$/.test(archive.digest)) throw fail('INVALID_ARCHIVE');
    const files = [], names = new Set(); let total = 0;
    for (const entry of archive.files) {
      if (!entry || !allowed(entry.path) || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > MAX_FILE || !/^[a-f0-9]{64}$/.test(entry.sha256)
        || typeof entry.data !== 'string' || entry.data.length !== 4 * Math.ceil(entry.size / 3) || /[^A-Za-z0-9+/=]/.test(entry.data)) throw fail('INVALID_ARCHIVE');
      const key = entry.path.normalize('NFC').toLowerCase(); if (names.has(key)) throw fail('DUPLICATE_ARCHIVE_PATH'); names.add(key);
      total += entry.size; if (total > MAX_TOTAL) throw fail('ARCHIVE_TOO_LARGE');
      const bytes = Buffer.from(entry.data, 'base64'); if (bytes.length !== entry.size || sha(bytes) !== entry.sha256 || bytes.toString('base64') !== entry.data) throw fail('ARCHIVE_CHECKSUM_MISMATCH');
      files.push({ path: entry.path, bytes });
    }
    files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (manifestDigest(files) !== archive.digest) throw fail('ARCHIVE_CHECKSUM_MISMATCH');
    const config = jsonFile(files, 'trip.config.json'), newTitle = title?.trim() || String(config.title || '').trim();
    if (!newTitle || newTitle.length > 160) throw fail('INVALID_ARCHIVE');
    const stem = newTitle.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,40) || 'trip';
    const slug = stem + '-copy-' + randomUUID().slice(0, 8), destination = path.join(trips.canonical, slug);
    // Stage outside trips: temporary and recovery directories must never appear as journeys.
    const stage = await fs.mkdtemp(path.join(parent.canonical, '.travel-import-')); const staged = await anchor(stage);
    let published = false;
    try {
      await writeTree(stage, files);
      const info = await validateFiles(stage, files, { allowPlanning, expectedKind: archive.kind });
      config.title = newTitle; if (title !== undefined) config.heading = newTitle;
      config.deploy = { name: slug, target: 'workers' };
      await fs.writeFile(path.join(stage, 'trip.config.json'), JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
      const draftFile = files.find(file => file.path === 'docs/planning-draft.json');
      if (draftFile) {
        const previous = jsonFile(files, 'docs/planning-draft.json');
        const draft = { version: 1, title: newTitle, destination: previous.destination || '', startDate: previous.startDate || '', endDate: previous.endDate || '',
          notes: previous.notes || '', party: previous.party ?? null, transport: previous.transport || [], status: info.kind === 'planning' ? 'planning' : 'ready',
          revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), importedWithoutApprovals: true };
        await fs.writeFile(path.join(stage, 'docs/planning-draft.json'), JSON.stringify(draft, null, 2) + '\n', { mode: 0o600 });
      }
      await fs.mkdir(path.join(stage, 'docs'), { recursive: true, mode: 0o700 });
      const status = path.join(stage, 'docs/status.md');
      await fs.appendFile(status, '\n\n## 本機備份匯入 ' + new Date().toISOString() + '\n\n- 目前階段：已匯入為獨立的新旅程；原有筆記是歷史資料。\n- 等待確認：重新核對草案、來源及預覽；沒有沿用舊的同意或發布紀錄。\n- 阻礙：新複本尚未異地備份或發布。\n- 下一步：確認內容後，再決定備份與發布。\n', { mode: 0o600 });
      if (info.kind === 'ready') await readTripSnapshot(stage, { slug });
      await collect(stage); // Recheck limits after title/status metadata additions.
      await verify([parent, trips, staged]);
      if ((await this.checkPrivate(parent.canonical)) === false) throw fail('PRIVATE_PROJECT_REQUIRED');
      await verify([parent, trips, staged]);
      try { await fs.lstat(destination); throw fail('TRIP_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await fs.rename(stage, destination); published = true;
      return { root: parent.canonical, slug, title: newTitle, planning: info.kind === 'planning', originalUnchanged: true };
    } finally { if (!published) { try { await verify([parent, staged]); await fs.rm(stage, { recursive: true }); } catch {} } }
  }); }
}
module.exports = { LocalArchiveService, MAX_FILE, MAX_TOTAL, allowed };
