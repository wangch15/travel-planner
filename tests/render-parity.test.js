const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { renderContext, legacySlice } = require('./helpers/render-ctx.js');
const { makeTrip, detail } = require('./fixtures/make-trip.js');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 拆檔前後要餵一樣的資料。dining 打開，好讓 mealsHTML 也被比對到。
// legacy 的 overviewHTML 寫死 DAYS[0]／DAYS[3]／DAYS[4] 與三筆 STAYS，
// 所以 parity 的樣本必須有 5 天 3 宿，否則舊程式會取到 undefined 而爆掉。
function fixture() {
  const t = makeTrip();
  t.config.sections.dining = true;
  t.config.sections.mapLists = true;
  const colors = ['#C2683A', '#4F7A4A', '#3E6B8A', '#8A5A9B', '#A8823C'];
  while (t.DAYS.length < 5) {
    const id = t.DAYS.length + 1;
    t.DAYS.push({ ...JSON.parse(JSON.stringify(t.DAYS[1])), id, color: colors[id - 1], date: `10/1${id}（—）`, title: `第 ${id} 天` });
  }
  t.STAYS = [
    { place: 'stayA', day: 1, range: 'r1', nights: 2, meals: '不含餐', check: '15:00 入住', role: '基地一' },
    { place: 'stayA', day: 3, range: 'r2', nights: 1, meals: '含早餐', check: '15:00 入住', role: '基地二' },
    { place: 'stayA', day: 4, range: 'r3', nights: 1, meals: '含早餐', check: '16:00 入住', role: '基地三' },
  ];
  t.DINING = {
    checked: '2026/09/18',
    places: { cafeA: { name: '咖啡店', local: 'Cafe A', lat: 38.3, lng: 140.6, gq: '咖啡店', cat: 'food', approximate: true } },
    venues: { cafeA: { menu: '咖啡與三明治', booking: '不用訂位', budget: [800, 1500] } },
    days: { 1: [{ slot: '午餐', time: '12:00', plan: '在咖啡店吃', fallback: '便利商店', places: ['cafeA'] }], 2: [] },
  };
  t.PLACES.cafeA = { ...t.DINING.places.cafeA };
  t.DETAILS.cafeA = detail({ dining: true });
  t.DAYS.forEach((d) => { d.meals = t.DINING.days[d.id] || []; });
  t.MAP_LISTS = {};
  t.DAYS.forEach((d) => {
    t.MAP_LISTS[d.id] = { name: `D${d.id}`, url: `https://maps.example.com/${d.id}`,
      placeKeys: [...new Set([...d.stops.map((x) => x.place), ...d.meals.flatMap((m) => m.places || [])])] };
    d.mapList = t.MAP_LISTS[d.id];
  });
  return t;
}

test('拆檔後的 render.js 與原 template 產出完全一致', () => {
  const legacy = read('src/legacy-template.html');
  const legacySrc = [
    legacySlice(legacy, 'const $ = (s, r)', '/* ── 投影 ── */').replace(/^const \$ = .*\n/, ''),
    legacySlice(legacy, 'function legHTML(', '/* ── 詳細燈箱 ── */'),
    legacySlice(legacy, 'const md = (t)', 'function openDetail('),
  ].join('\n');
  const modern = [read('src/util.js'), read('src/render.js')];

  const a = renderContext(fixture(), [legacySrc]);
  const b = renderContext(fixture(), modern);

  for (const day of fixture().DAYS) {
    assert.equal(b.dayHTML(day), a.dayHTML(day), `Day ${day.id} 的 HTML 不一致`);
  }
  assert.equal(b.legHTML({ mode: 'drive', dist: '20 公里', drive: '30 分', buffer: '45 分', road: '國道' }, 'hubA', 'stayA'),
    a.legHTML({ mode: 'drive', dist: '20 公里', drive: '30 分', buffer: '45 分', road: '國道' }, 'hubA', 'stayA'),
    'leg 的 HTML 不一致');
  assert.equal(b.overviewHTML(), a.overviewHTML(), '總覽 HTML 不一致');
});
