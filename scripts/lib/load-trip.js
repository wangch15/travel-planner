// 讀 trips/<slug>/ 的 config 與資料檔，合併接線後驗證。
const fs = require('node:fs');
const path = require('node:path');
const { tripDir } = require('./paths.js');
const { validate } = require('./schema.js');

const readJSON = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);
// 測試會重複寫入同一路徑，require 快取必須清掉才會拿到新內容。
const readJS = (p, fallback) => { if (!fs.existsSync(p)) return fallback; delete require.cache[require.resolve(p)]; return require(p); };


// 兩個行程用同一個 deploy.name，第二次 ship 會靜默覆蓋掉第一個行程的線上網站。
// 這種錯只有在「累積多個行程」之後才會踩到，所以每次載入都順手檢查。
function checkDeployNameClash(slug, config) {
  const name = config.deploy && config.deploy.name;
  if (!name) return;
  const root = path.dirname(tripDir(slug));
  if (!fs.existsSync(root)) return;
  const clash = fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== slug)
    .map((e) => {
      const p = path.join(root, e.name, 'trip.config.json');
      if (!fs.existsSync(p)) return null;
      try {
        const c = JSON.parse(fs.readFileSync(p, 'utf8'));
        return c.deploy && c.deploy.name === name ? e.name : null;
      } catch { return null; }
    })
    .filter(Boolean);
  if (clash.length) {
    throw new Error(`deploy.name「${name}」與其他行程重複：${clash.join('、')}\n`
      + '兩個行程共用同一個部署名稱時，後 ship 的會覆蓋掉先 ship 的網站。請改掉其中一個。');
  }
}

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
    checkDeployNameClash(slug, config);
  }
  return trip;
}

module.exports = { loadTrip };
