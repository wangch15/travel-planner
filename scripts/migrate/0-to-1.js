// schemaVersion 0 → 1。就地改寫資料檔，回傳變更說明陣列。
// 舊檔會先備份成 <name>.bak；改寫用 JSON.stringify，原本的註解會消失。
const fs = require('node:fs');
const path = require('node:path');

const CONFIG_DEFAULTS = {
  lang: 'zh-Hant', transport: ['drive'], party: 2, currency: '¥',
  sections: { overview: true, dining: true, mapLists: false, checklist: true },
  theme: { accent: '#B0552D', favicon: '🗺' },
  basemap: { dem: 'auto', detail: 'normal', contourLevels: null },
};

const load = (p) => { delete require.cache[require.resolve(p)]; return require(p); };
const writeModule = (p, value) => {
  fs.copyFileSync(p, p + '.bak');
  fs.writeFileSync(p, `module.exports = ${JSON.stringify(value, null, 2)};\n`);
};

// 舊 leg：{ dist, drive, buffer, road, url }；步行只能從文字判斷
function migrateLeg(leg, notes) {
  const walking = /步行/.test(String(leg.dist) + String(leg.drive));
  const next = { mode: walking ? 'walk' : 'drive' };
  if (leg.dist) next.dist = leg.dist;
  next.time = leg.drive || leg.time || '';
  if (leg.buffer) next.buffer = leg.buffer;
  if (leg.road || leg.via) next.via = leg.road || leg.via;
  if (leg.fare) next.fare = leg.fare;
  if (leg.url) next.url = leg.url;
  notes.add('leg 補上 mode，並把 drive → time、road → via');
  return next;
}

function migratePlaces(PLACES, notes) {
  Object.values(PLACES).forEach((p) => {
    if (!('jp' in p)) return;
    p.local = p.jp;
    delete p.jp;
    notes.add('地點的 jp 改名為 local');
  });
}

// 舊 STAYS 沒有 day：用 range 開頭的日期比對 DAYS[].date 前五字
function migrateStays(STAYS, DAYS, notes) {
  (STAYS || []).forEach((s, i) => {
    if (typeof s.day === 'number') return;
    const head = String(s.range || '').trim().slice(0, 5);
    const hit = DAYS.find((d) => String(d.date).slice(0, 5) === head);
    s.day = hit ? hit.id : i + 1;
    notes.add(hit ? 'STAYS 依 range 的日期補上 day'
      : 'STAYS 的 day 配不到日期，暫用順序編號——請人工確認每個住宿的入住日');
  });
}

function migrateData(dir, notes) {
  const p = path.join(dir, 'data.js');
  const data = load(p);
  migratePlaces(data.PLACES, notes);
  data.DAYS.forEach((d) => {
    d.stops.forEach((s) => { if (s.leg) s.leg = migrateLeg(s.leg, notes); });
    // 舊檔在尾端把 dining 的 meals 掛到 day；接線改由 load-trip 負責
    if ('meals' in d) { delete d.meals; notes.add('拆掉 data.js 尾端的接線（meals 改由 load-trip 掛接）'); }
    if ('mapList' in d) delete d.mapList;
  });
  migrateStays(data.STAYS, data.DAYS, notes);

  // 餐飲地點也是接線的產物，留給 load-trip 併入
  const dining = fs.existsSync(path.join(dir, 'dining.js')) ? load(path.join(dir, 'dining.js')) : { places: {}, checklist: [] };
  Object.keys(dining.places || {}).forEach((k) => {
    if (data.PLACES[k]) { delete data.PLACES[k]; notes.add('餐飲地點從 PLACES 移除（改由 load-trip 併入）'); }
  });
  (dining.checklist || []).forEach((c) => {
    const i = (data.CHECKLIST || []).indexOf(c);
    if (i >= 0) { data.CHECKLIST.splice(i, 1); notes.add('餐飲待辦從 CHECKLIST 移除（改由 load-trip 併入）'); }
  });

  if (!data.OVERVIEW) {
    data.OVERVIEW = { checked: '', foot: [] };
    notes.add('建立空的 OVERVIEW：把原本寫死在 template 的總覽文字與頁尾段落搬進來');
  }
  writeModule(p, {
    PLACES: data.PLACES, DAYS: data.DAYS, OVERVIEW_ROUTE: data.OVERVIEW_ROUTE || [],
    ADDONS: data.ADDONS || [], CHECKLIST: data.CHECKLIST || [], STAYS: data.STAYS || [], OVERVIEW: data.OVERVIEW,
  });
}

function migrateDining(dir, notes) {
  const p = path.join(dir, 'dining.js');
  if (!fs.existsSync(p)) return;
  const dining = load(p);
  migratePlaces(dining.places || {}, notes);
  writeModule(p, dining);
}

function migrateDetails(dir, notes) {
  const p = path.join(dir, 'details.js');
  if (!fs.existsSync(p)) return;
  const details = load(p);
  Object.entries(details).forEach(([k, d]) => {
    if ((d.info || []).some((row) => /停車/.test(row[0]))) {
      notes.add(`${k} 的「停車」資訊仍留在 details.info：要不要轉成 PLACES.${k}.parking 需要人工判斷`);
    }
  });
  writeModule(p, details);
}

function migrateConfig(dir, notes) {
  const p = path.join(dir, 'trip.config.json');
  const cfg = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
  const next = { schemaVersion: 1, ...CONFIG_DEFAULTS, ...cfg, schemaVersion_: undefined };
  delete next.schemaVersion_;
  next.schemaVersion = 1;
  if (!next.dates) next.dates = { start: '', end: '' };
  if (!next.region) { next.region = { country: '', bbox: [0, 0, 0, 0] }; notes.add('trip.config 補上空的 region.bbox：填好才能跑 basemap 與座標驗證'); }
  if (!next.deploy) { next.deploy = { name: path.basename(dir), target: 'workers' }; notes.add('trip.config 補上 deploy 預設值'); }
  fs.writeFileSync(p, JSON.stringify(next, null, 2) + '\n');
  notes.add('trip.config.json 的 schemaVersion 升為 1');
}

function migrate(dir) {
  const notes = new Set();
  migrateData(dir, notes);
  migrateDining(dir, notes);
  migrateDetails(dir, notes);
  migrateConfig(dir, notes);
  notes.add('原檔已備份成 <檔名>.bak；改寫過程會丟掉註解，來源說明請自行搬回');
  return [...notes];
}

module.exports = { migrate };
