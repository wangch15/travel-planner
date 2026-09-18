// 行程資料的驗證規則。回傳錯誤字串陣列，空陣列代表通過。
const SCHEMA_VERSION = 1;
const KINDS = new Set(['main', 'suggest', 'optional', 'stay', 'transit', 'alt']);
const MODES = new Set(['drive', 'transit', 'walk', 'taxi', 'ferry']);
const CATS = new Set(['hub', 'stay', 'sight', 'food', 'shop']);

function checkPlaces(trip, fail) {
  const [lngMin, latMin, lngMax, latMax] = trip.config.region.bbox;
  Object.entries(trip.PLACES).forEach(([key, p]) => {
    if (!p.name) fail(`PLACES.${key} 缺 name`);
    if (!CATS.has(p.cat)) fail(`PLACES.${key} cat 不合法：${p.cat}`);
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') fail(`PLACES.${key} 座標不是數字`);
    else if (p.lat < latMin || p.lat > latMax || p.lng < lngMin || p.lng > lngMax) {
      fail(`PLACES.${key} 座標超出 region.bbox：${p.lat},${p.lng}`);
    }
    if (!p.gq && !p.gurl) fail(`PLACES.${key} 缺 gq 或 gurl`);
    if (p.parking && (typeof p.parking.lat !== 'number' || typeof p.parking.lng !== 'number')) {
      fail(`PLACES.${key} 的 parking 缺座標`);
    }
    if (p.cat !== 'hub' && !trip.DETAILS[key]) fail(`${key} 缺 detail`);
  });
}

function checkLeg(day, s, j, fail) {
  if (!MODES.has(s.leg.mode)) fail(`Day ${day.id} stop ${j} leg.mode 不合法：${s.leg.mode}`);
  if (!s.leg.time) fail(`Day ${day.id} stop ${j} leg 缺 time`);
  if (s.leg.mode === 'transit' && !s.leg.via) fail(`Day ${day.id} stop ${j} 大眾運輸的 leg 缺 via（路線名）`);
  if (s.leg.mode === 'drive' && !s.leg.dist) fail(`Day ${day.id} stop ${j} 自駕的 leg 缺 dist`);
}

function checkMeals(trip, d, fail) {
  if (!Array.isArray(d.meals) || !d.meals.length) {
    fail(`Day ${d.id} 缺餐食規劃（sections.dining 已開啟）`);
    return;
  }
  d.meals.forEach((m, j) => {
    if (!m.slot || !m.time || !m.plan || !m.fallback) fail(`Day ${d.id} meal ${j} 缺 slot/time/plan/fallback`);
    [...(m.places || []), ...(m.backupPlaces || [])].forEach((k) => {
      if (!trip.PLACES[k] || !trip.DETAILS[k]) fail(`Day ${d.id} meal ${j} 地點或詳細說明不存在：${k}`);
    });
  });
}

function checkDays(trip, fail) {
  const { DAYS, PLACES, DETAILS, config } = trip;
  if (!DAYS.length) fail('DAYS 為空');
  DAYS.forEach((d, i) => {
    if (d.id !== i + 1) fail(`DAYS[${i}].id 應為 ${i + 1}，實際 ${d.id}`);
    if (!/^#[0-9A-Fa-f]{6}$/.test(d.color || '')) fail(`Day ${d.id} color 不是 hex`);
    if (!d.date || !d.title || !d.theme) fail(`Day ${d.id} 缺 date/title/theme`);
    if (!Array.isArray(d.stops) || d.stops.length < 2) fail(`Day ${d.id} 停留點不足 2 個`);
    (d.stops || []).forEach((s, j) => {
      if (!PLACES[s.place]) fail(`Day ${d.id} stop ${j} 引用未知地點 ${s.place}`);
      if (!KINDS.has(s.kind)) fail(`Day ${d.id} stop ${j} kind 不合法：${s.kind}`);
      if (!s.time) fail(`Day ${d.id} stop ${j} 缺 time`);
      if (s.leg) checkLeg(d, s, j, fail);
    });
    (d.alts || []).forEach((a, j) => {
      [...(a.place ? [a.place] : []), ...(a.places || [])].forEach((k) => {
        if (!PLACES[k]) fail(`Day ${d.id} alt ${j} 引用未知地點 ${k}`);
        else if (!DETAILS[k]) fail(`Day ${d.id} alt ${j} 的 ${k} 沒有詳細說明`);
      });
    });
    if (config.sections.dining) checkMeals(trip, d, fail);
  });
}

function checkRefsAndLists(trip, fail) {
  const { PLACES, DETAILS, STAYS, ADDONS, OVERVIEW_ROUTE, DAYS } = trip;
  (OVERVIEW_ROUTE || []).forEach((k) => { if (!PLACES[k]) fail(`OVERVIEW_ROUTE 未知地點 ${k}`); });
  (ADDONS || []).forEach((a, i) => {
    if (!PLACES[a.place]) fail(`ADDONS[${i}] 未知地點 ${a.place}`);
    if (!a.day || !a.why || !a.cost) fail(`ADDONS[${i}] 缺 day/why/cost`);
  });
  (STAYS || []).forEach((s, i) => {
    if (!PLACES[s.place]) fail(`STAYS[${i}] 未知地點 ${s.place}`);
    if (!DAYS.some((d) => d.id === s.day)) fail(`STAYS[${i}] 的 day 指向不存在的天：${s.day}`);
    if (typeof s.nights !== 'number' || s.nights < 1) fail(`STAYS[${i}] nights 不合法`);
  });
  Object.entries(DETAILS).forEach(([k, d]) => {
    if (!PLACES[k]) fail(`DETAILS.${k} 引用未知地點`);
    if (!d.summary || d.summary.length < 40) fail(`DETAILS.${k} summary 太短`);
    if (!Array.isArray(d.highlights) || d.highlights.length < 2) fail(`DETAILS.${k} highlights 不足 2 點`);
    if (!d.stay) fail(`DETAILS.${k} 缺 stay`);
    if (!Array.isArray(d.refs) || !d.refs.length) fail(`DETAILS.${k} 缺 refs`);
    (d.refs || []).forEach((r) => { if (!/^https?:\/\//.test(r.u || '')) fail(`DETAILS.${k} ref 網址不合法：${r.u}`); });
    (d.info || []).forEach((row) => { if (!Array.isArray(row) || row.length !== 2) fail(`DETAILS.${k} info 每列需為 [標籤, 內容]`); });
  });
}

function checkMapLists(trip, fail) {
  trip.DAYS.forEach((d) => {
    const list = trip.MAP_LISTS[d.id];
    if (!list) { fail(`Day ${d.id} 缺 Google Maps 清單`); return; }
    const need = new Set([
      ...d.stops.map((s) => s.place),
      ...(d.meals || []).flatMap((m) => [...(m.places || []), ...(m.backupPlaces || [])]),
      ...(d.alts || []).flatMap((a) => [...(a.place ? [a.place] : []), ...(a.places || [])]),
    ]);
    [...need].forEach((k) => {
      if (!list.placeKeys.includes(k)) fail(`Day ${d.id} 的清單少了 ${k}：先更新實際 Maps 清單再改 map-lists.js`);
    });
  });
}

function checkPhotosAndBasemap(trip, fail) {
  Object.entries(trip.PHOTOS || {}).forEach(([k, list]) => {
    if (!trip.PLACES[k]) fail(`PHOTOS.${k} 引用未知地點`);
    list.forEach((ph, i) => {
      if (ph.url) { if (!ph.credit) fail(`PHOTOS.${k}[${i}] 直接網址缺 credit`); return; }
      if (!ph.license || !/CC|Public domain/i.test(ph.license)) fail(`PHOTOS.${k}[${i}] 授權不明：${ph.license}`);
      if (!ph.page) fail(`PHOTOS.${k}[${i}] 缺來源頁面連結`);
    });
  });
  if (!trip.basemap) return;
  const b = trip.basemap.meta && trip.basemap.meta.bbox;
  if (!b) fail('basemap.json 缺 meta.bbox：重跑 npm run basemap');
  else if (b.join(',') !== trip.config.region.bbox.join(',')) {
    fail(`basemap 的 bbox 與 trip.config 不符：${b.join(',')} vs ${trip.config.region.bbox.join(',')}；重跑 npm run basemap`);
  }
}

function validate(trip) {
  const errs = [];
  const fail = (m) => errs.push(m);
  if (trip.config.schemaVersion !== SCHEMA_VERSION) {
    fail(`trip.config.schemaVersion 是 ${trip.config.schemaVersion}，引擎需要 ${SCHEMA_VERSION}：跑 npm run migrate -- ${trip.slug}`);
  }
  checkPlaces(trip, fail);
  checkDays(trip, fail);
  checkRefsAndLists(trip, fail);
  if (trip.config.sections.mapLists) checkMapLists(trip, fail);
  checkPhotosAndBasemap(trip, fail);
  if (trip.config.sections.checklist && !(trip.CHECKLIST || []).length) fail('CHECKLIST 為空');
  return errs;
}

module.exports = { SCHEMA_VERSION, validate, KINDS, MODES, CATS };
