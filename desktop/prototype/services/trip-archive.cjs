// 旅程的兩段式移除：先封存到 trips/_archived/<slug>/（跟著私人備份，換電腦也在、可還原），
// 封存後才能永久刪除。底線開頭的資料夾引擎與 App 都不當成旅程，所以封存的旅程會從清單消失。
// 只搬移或刪除專案裡這一個資料夾，不跟隨符號連結、不碰其他路徑；備份由呼叫端接著做。
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const ARCHIVE = '_archived';
const fail = (code, message = code) => Object.assign(new Error(message), { code });

async function lstatOrNull(file) { try { return await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
// 一般資料夾、不是符號連結，而且真實路徑就在預期的位置（避免被導到專案外）。
async function realDirectory(dir) {
  const stat = await lstatOrNull(dir);
  if (!stat) return null;
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(dir) !== dir) throw fail('UNSAFE_TRIP_PATH', '這趟旅程的資料夾位置不正常（可能是捷徑或連結），App 不會移動或刪除它。');
  return stat;
}
async function summarize(dir) {
  let files = 0, bytes = 0;
  const walk = async current => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw fail('UNSAFE_TRIP_PATH', '這趟旅程的資料夾裡有捷徑或連結，App 不會移動或刪除它。');
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) { files++; bytes += (await fs.lstat(file)).size; }
    }
  };
  await walk(dir);
  return { files, bytes };
}
async function readTitle(dir, slug) {
  try { const config = JSON.parse(await fs.readFile(path.join(dir, 'trip.config.json'), 'utf8')); return { title: typeof config.title === 'string' && config.title.trim() ? config.title.trim() : slug, dates: config.dates || null, siteName: config.deploy?.name || null }; }
  catch { return { title: slug, dates: null, siteName: null }; }
}

class TripArchiveService {
  constructor() { this.pending = new Map(); }
  async places(root, slug) {
    if (typeof root !== 'string' || !path.isAbsolute(root)) throw fail('INVALID_TARGET');
    if (!SLUG.test(slug || '')) throw fail('INVALID_TRIP');
    const canonical = await fs.realpath(root);
    const trips = path.join(canonical, 'trips');
    if (!await realDirectory(trips)) throw fail('INVALID_TARGET');
    const archive = path.join(trips, ARCHIVE);
    if (await lstatOrNull(archive)) await realDirectory(archive);
    return { root: canonical, trips, archive, active: path.join(trips, slug), archived: path.join(archive, slug) };
  }
  async list(root) {
    const canonical = await fs.realpath(root), archive = path.join(canonical, 'trips', ARCHIVE);
    if (!await lstatOrNull(archive)) return [];
    await realDirectory(archive);
    const items = [];
    for (const entry of await fs.readdir(archive, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !SLUG.test(entry.name)) continue;
      items.push({ slug: entry.name, ...await readTitle(path.join(archive, entry.name), entry.name) });
    }
    return items.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));
  }
  async archive(root, slug) {
    const p = await this.places(root, slug);
    if (!await realDirectory(p.active)) throw fail('TRIP_NOT_FOUND', '找不到這趟旅程。');
    if (await lstatOrNull(p.archived)) throw fail('ARCHIVE_EXISTS', '封存區已經有一趟同名的旅程，請先處理那一趟（還原或永久刪除）再封存。');
    await summarize(p.active);
    try { await fs.mkdir(p.archive); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    await realDirectory(p.archive);
    await fs.rename(p.active, p.archived);
    return { root: p.root, slug };
  }
  async restore(root, slug) {
    const p = await this.places(root, slug);
    if (!await realDirectory(p.archived)) throw fail('TRIP_NOT_FOUND', '封存區找不到這趟旅程。');
    if (await lstatOrNull(p.active)) throw fail('TRIP_EXISTS', '旅程清單裡已經有一趟同名的旅程，無法還原。');
    await fs.rename(p.archived, p.active);
    return { root: p.root, slug };
  }
  // 永久刪除分兩步：先列出內容並給一次性代號；確認時要帶回代號與完整的旅程名稱。
  async preparePurge(root, slug) {
    const p = await this.places(root, slug);
    if (!await realDirectory(p.archived)) throw fail('TRIP_NOT_FOUND', '只有已封存的旅程可以永久刪除；請先封存這趟旅程。');
    const summary = await summarize(p.archived), info = await readTitle(p.archived, slug);
    const token = randomUUID(); this.pending.clear();
    this.pending.set(token, { root: p.root, slug, title: info.title, summary, expires: Date.now() + 10 * 60 * 1000 });
    return { token, slug, ...info, ...summary };
  }
  async confirmPurge(token, typedTitle) {
    const pending = this.pending.get(token); this.pending.delete(token);
    if (!pending || Date.now() > pending.expires) throw fail('STALE_CONFIRMATION', '確認已過期，請重新開始。');
    if (typeof typedTitle !== 'string' || typedTitle.trim() !== pending.title) throw fail('PURGE_NAME_MISMATCH', '輸入的旅程名稱不相符，沒有刪除任何東西。');
    const p = await this.places(pending.root, pending.slug);
    if (!await realDirectory(p.archived)) throw fail('TRIP_NOT_FOUND', '封存區找不到這趟旅程，沒有刪除任何東西。');
    const now = await summarize(p.archived);
    if (now.files !== pending.summary.files || now.bytes !== pending.summary.bytes) throw fail('CONTENT_CHANGED', '這趟旅程在確認後有變動，沒有刪除任何東西；請重新確認。');
    await fs.rm(p.archived, { recursive: true });
    return { root: p.root, slug: pending.slug, title: pending.title };
  }
}
module.exports = { TripArchiveService, ARCHIVE };
