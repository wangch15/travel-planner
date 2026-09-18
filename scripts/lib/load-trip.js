// 讀 trips/<slug>/ 的 config 與資料檔，合併接線後驗證。
const fs = require('node:fs');
const path = require('node:path');
const { tripDir } = require('./paths.js');
const { validate } = require('./schema.js');

const readJSON = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);
// 測試會重複寫入同一路徑，require 快取必須清掉才會拿到新內容。
const readJS = (p, fallback) => { if (!fs.existsSync(p)) return fallback; delete require.cache[require.resolve(p)]; return require(p); };

function loadTrip(slug, opts = {}) {
  const dir = tripDir(slug);
  if (!fs.existsSync(dir)) throw new Error(`找不到行程資料夾：trips/${slug}`);
  const config = readJSON(path.join(dir, 'trip.config.json'), null);
  if (!config) throw new Error(`trips/${slug}/trip.config.json 不存在`);

  const data = readJS(path.join(dir, 'data.js'), {});
  const DINING = readJS(path.join(dir, 'dining.js'), { checked: '', places: {}, venues: {}, days: {} });
  const MAP_LISTS = readJS(path.join(dir, 'map-lists.js'), {});
  const trip = {
    slug, config,
    PLACES: { ...data.PLACES },
    DAYS: (data.DAYS || []).map((d) => ({ ...d })),
    OVERVIEW_ROUTE: data.OVERVIEW_ROUTE || [],
    ADDONS: data.ADDONS || [],
    CHECKLIST: [...(data.CHECKLIST || [])],
    STAYS: data.STAYS || [],
    OVERVIEW: data.OVERVIEW || {},
    DETAILS: readJS(path.join(dir, 'details.js'), {}),
    DINING, MAP_LISTS,
    PHOTOS: readJSON(path.join(dir, 'photos.json'), {}),
    basemap: readJSON(path.join(dir, 'basemap.json'), null),
  };

  // 餐飲地點併入 PLACES：座標是街區概略位置，導航以店名與地址為準。
  Object.entries(DINING.places || {}).forEach(([key, p]) => { trip.PLACES[key] = { approximate: true, ...p }; });
  trip.DAYS.forEach((d) => {
    d.meals = (DINING.days || {})[d.id] || [];
    d.mapList = MAP_LISTS[d.id] || null;
  });
  trip.CHECKLIST.push(...(DINING.checklist || []));

  if (opts.validate !== false) {
    const errs = validate(trip);
    if (errs.length) throw new Error(`資料檢查失敗（${errs.length} 個問題）：\n  - ${errs.join('\n  - ')}`);
  }
  return trip;
}

module.exports = { loadTrip };
