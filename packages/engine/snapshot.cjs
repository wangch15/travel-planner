const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { TextDecoder } = require('node:util');
const { parseLiteralModule, copyLiteral, dataError, MAX_TEXT_BYTES } = require('./literal-data.cjs');
const { validate } = require('./schema.cjs');

const MAX_TOTAL_TEXT = 16 * 1024 * 1024;
const MAX_PHOTO = 16 * 1024 * 1024;
const MAX_TOTAL_PHOTOS = 128 * 1024 * 1024;
const SAFE_NAME = /^[a-zA-Z0-9_-]{1,100}$/;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const unchanged = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;

// Fixed allowlist, bounded reads and no project code execution. This is not an OS
// sandbox: callers run it in a resource-limited worker and retain snapshot bytes.
async function readTripSnapshot(tripDirectory, { slug, includePhotoBytes = false } = {}) {
  try {
    if (typeof tripDirectory !== 'string' || !tripDirectory || tripDirectory.includes('\0')) throw dataError('UNSAFE_PATH');
    const dir = path.resolve(tripDirectory);
    slug ??= path.basename(dir);
    if (typeof slug !== 'string' || !SAFE_NAME.test(slug)) throw dataError('UNSAFE_PATH');
    const root = await fs.lstat(dir);
    if (!root.isDirectory() || root.isSymbolicLink()) throw dataError('UNSAFE_PATH');
    const canonical = await fs.realpath(dir);
    const directories = new Map([[dir, { stat: root, canonical }]]);
    const digest = createHash('sha256');
    const contextDigest = createHash('sha256');
    function record(relative, value) { digest.update(value); if(relative !== 'data.js')contextDigest.update(value); }
    digest.update(JSON.stringify({ slug }));
    let textBytes = 0;
    let photoBytes = 0;

    // Anchor every directory between the selected root and allowlisted files.
    // Checking again after realpath also catches a replacement during that call.
    async function parentsUnchanged() {
      for (const [directory, anchor] of directories) {
        try {
          const before = await fs.lstat(directory);
          const resolved = await fs.realpath(directory);
          const after = await fs.lstat(directory);
          if (!before.isDirectory() || before.isSymbolicLink() || !after.isDirectory() || after.isSymbolicLink()
            || !unchanged(anchor.stat, before) || !unchanged(anchor.stat, after) || resolved !== anchor.canonical) throw dataError('SOURCE_CHANGED');
        } catch { throw dataError('SOURCE_CHANGED'); }
      }
    }

    async function readFile(relative, { photo = false, required = false } = {}) {
      await parentsUnchanged();
      const filename = path.join(dir, relative);
      if (photo && !directories.has(path.join(dir, 'photos'))) {
        const photoDirectory = path.join(dir, 'photos');
        let parent;
        try { parent = await fs.lstat(photoDirectory); }
        catch (e) { if (e.code === 'ENOENT') { record(relative,JSON.stringify([relative, null])); return null; } throw e; }
        if (!parent.isDirectory() || parent.isSymbolicLink() || await fs.realpath(photoDirectory) !== path.join(canonical, 'photos')) throw dataError('UNSAFE_PATH');
        directories.set(photoDirectory, { stat: parent, canonical: path.join(canonical, 'photos') });
        await parentsUnchanged();
      }
      let before;
      try { before = await fs.lstat(filename); }
      catch (e) {
        if (e.code === 'ENOENT' && !required) { record(relative,JSON.stringify([relative, null])); return null; }
        throw e;
      }
      if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw dataError('UNSAFE_PATH');
      const limit = photo ? MAX_PHOTO : MAX_TEXT_BYTES;
      if (before.size > limit) throw dataError('INPUT_LIMIT');
      if (photo) { photoBytes += before.size; if (photoBytes > MAX_TOTAL_PHOTOS) throw dataError('INPUT_LIMIT'); }
      else { textBytes += before.size; if (textBytes > MAX_TOTAL_TEXT) throw dataError('INPUT_LIMIT'); }
      const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let bytes;
      try {
        const opened = await handle.stat();
        if (!opened.isFile() || opened.nlink !== 1 || !unchanged(before, opened)) throw dataError('SOURCE_CHANGED');
        await parentsUnchanged();
        bytes = Buffer.alloc(before.size);
        let offset = 0;
        while (offset < bytes.length) {
          const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
          if (!bytesRead) throw dataError('SOURCE_CHANGED');
          offset += bytesRead;
        }
        if (!unchanged(before, await handle.stat())) throw dataError('SOURCE_CHANGED');
        await parentsUnchanged();
      } finally { await handle.close(); }
      const after = await fs.lstat(filename);
      if (after.nlink !== 1 || after.isSymbolicLink() || !unchanged(before, after)) throw dataError('SOURCE_CHANGED');
      await parentsUnchanged();
      record(relative,JSON.stringify([relative, bytes.length, hash(bytes)]));
      return bytes;
    }

    async function text(relative, required = false) {
      const bytes = await readFile(relative, { required });
      if (bytes === null) return null;
      try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw dataError(); }
    }
    async function json(relative, fallback, required = false) {
      const source = await text(relative, required);
      if (source === null) return fallback;
      try { return copyLiteral(JSON.parse(source)); }
      catch (e) { if (e.code) throw e; throw dataError(); }
    }
    async function js(relative, fallback) {
      const source = await text(relative);
      return source === null ? fallback : parseLiteralModule(source);
    }

    const config = await json('trip.config.json', null, true);
    const dataSource = await text('data.js');
    const data = dataSource === null ? {} : parseLiteralModule(dataSource);
    const {DAYS:_days,...nonDayData}=data;
    contextDigest.update(JSON.stringify(nonDayData));
    const DETAILS = await js('details.js', {});
    const DINING = await js('dining.js', { checked: '', places: {}, venues: {}, days: {} });
    const MAP_LISTS = await js('map-lists.js', {});
    const PHOTOS = await json('photos.json', {});
    const basemap = await json('basemap.json', null);
    const theme = (await text('theme.css')) || '';
    const extra = await js('extra.js', { sections: [] });
    if (![config, data, DETAILS, DINING, MAP_LISTS, PHOTOS, extra].every(isObject)) throw dataError('INVALID_TRIP');
    if (!Array.isArray(extra.sections || [])) throw dataError('INVALID_TRIP');

    const photos = {};
    const photoFiles = [];
    for (const [key, list] of Object.entries(PHOTOS)) {
      if (!SAFE_NAME.test(key)) throw dataError('UNSAFE_PATH');
      if (!Array.isArray(list)) throw dataError('INVALID_TRIP');
      const kept = [];
      for (const [i, ph] of list.entries()) {
        if (!isObject(ph)) throw dataError('INVALID_TRIP');
        for (const link of [ph.url, ph.page]) {
          if (link == null) continue;
          try { const url = new URL(link); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error(); }
          catch { throw dataError('UNSAFE_PATH'); }
        }
        const file = `${key}-${i + 1}.jpg`;
        const bytes = await readFile('photos/' + file, { photo: true });
        if (bytes === null) continue;
        kept.push({ src: 'img/' + file, credit: ph.url ? ph.credit : `${ph.artist || '—'}・${ph.license}`, page: ph.page || null, commons: !ph.url });
        photoFiles.push({ source: 'photos/' + file, target: 'img/' + file, size: bytes.length, sha256: hash(bytes), ...(includePhotoBytes ? { bytes } : {}) });
      }
      if (kept.length) photos[key] = kept;
    }
    let trip;
    try {
      trip = {
        slug, config, PLACES: { ...data.PLACES }, DAYS: (data.DAYS || []).map((d) => ({ ...d })),
        OVERVIEW_ROUTE: data.OVERVIEW_ROUTE || [], ADDONS: data.ADDONS || [], CHECKLIST: [...(data.CHECKLIST || [])],
        STAYS: data.STAYS || [], OVERVIEW: data.OVERVIEW || {}, DETAILS, DINING, MAP_LISTS, PHOTOS, basemap,
      };
      for (const [key, place] of Object.entries(DINING.places || {})) trip.PLACES[key] = { approximate: true, ...place };
      for (const day of trip.DAYS) { day.meals = (DINING.days || {})[day.id] || []; day.mapList = MAP_LISTS[day.id] || null; }
      trip.CHECKLIST.push(...(DINING.checklist || []));
      if (validate(trip).length) throw dataError('INVALID_TRIP');
    } catch { throw dataError('INVALID_TRIP'); }
    await parentsUnchanged();
    return { trip, theme, extra, photos, photoFiles, dataSource, contextDigest:contextDigest.digest('hex'), digest: digest.digest('hex') };
  } catch (e) {
    if (['INCOMPATIBLE_DATA', 'INPUT_LIMIT', 'UNSAFE_PATH', 'INVALID_TRIP', 'READ_FAILED', 'SOURCE_CHANGED'].includes(e.code)) throw e;
    if (e.code === 'ELOOP') throw dataError('UNSAFE_PATH');
    throw dataError('READ_FAILED');
  }
}

module.exports = { readTripSnapshot };
