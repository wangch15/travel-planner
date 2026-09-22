const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { renderContext } = require('./helpers/render-ctx.js');
const { makeTrip } = require('./fixtures/make-trip.js');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sources = () => [read('src/util.js'), read('src/render.js')];
const ctxFor = (trip) => renderContext(trip, sources());

test('引擎原始碼不含任何行程專屬字眼', () => {
  const src = ['src/util.js', 'src/render.js', 'src/app.js', 'src/index.html'].map(read).join('\n');
  for (const word of ['仙台', '山形', '鳴子', '松島', '星宇', 'Serena', '国土地理院', 'sentai', '七天', '六個晚上']) {
    assert.ok(!src.includes(word), `引擎不該出現行程專屬字眼：${word}`);
  }
});

test('總覽的天數與住宿晚數由資料決定', () => {
  const trip = makeTrip();
  const html = ctxFor(trip).overviewHTML();
  assert.ok(html.includes('2 天主軸'), '標題要用實際天數');
  assert.ok(html.includes('1 晚'));
  assert.ok(!html.includes('七天'));
});

test('住宿色條取 STAYS.day 對應那天的顏色，不是寫死的索引', () => {
  const trip = makeTrip();
  trip.STAYS[0].day = 2;
  const html = ctxFor(trip).overviewHTML();
  assert.ok(html.includes('--sc:' + trip.DAYS[1].color));
});

test('OVERVIEW 的欄位缺席時該區塊不渲染', () => {
  const trip = makeTrip();
  trip.OVERVIEW = {};
  const html = ctxFor(trip).overviewHTML();
  assert.ok(!html.includes('<div class="foot">'));
  assert.ok(html.includes('class="checks"'), '其他區塊仍要在');
});

test('OVERVIEW.foot 的每一段都會出現在頁尾', () => {
  const trip = makeTrip();
  trip.OVERVIEW.foot = ['第一段說明', '第二段說明'];
  const html = ctxFor(trip).overviewHTML();
  assert.ok(html.includes('第一段說明') && html.includes('第二段說明'));
});

test('sections 關掉的區塊不渲染', () => {
  const trip = makeTrip();
  trip.config.sections.checklist = false;
  assert.ok(!ctxFor(trip).overviewHTML().includes('class="checks"'));
});

test('sections.mapLists 關閉時每日標題不出現清單按鈕', () => {
  const trip = makeTrip();
  const html = ctxFor(trip).dayHTML(trip.DAYS[0]);
  assert.ok(!html.includes('map-list-link'));
});

test('sections.dining 關閉時不渲染三餐區塊與捷徑', () => {
  const trip = makeTrip();
  const html = ctxFor(trip).dayHTML(trip.DAYS[0]);
  assert.ok(!html.includes('class="meals"'));
  assert.ok(!html.includes('meal-jump'));
});

test('money 依 CONFIG.party 與 currency 計算', () => {
  const trip = makeTrip();
  const ctx = ctxFor(trip);
  assert.equal(ctx.money([800, 1500]), '每人約 ¥800–1,500／2 人約 ¥1,600–3,000');
  trip.config.party = 5;
  trip.config.currency = 'NT$';
  assert.equal(ctxFor(trip).money([100, 200]), '每人約 NT$100–200／5 人約 NT$500–1,000');
});

test('leg 依 mode 決定圖示與導航模式，不再靠字串比對', () => {
  const trip = makeTrip();
  const ctx = ctxFor(trip);
  const walk = ctx.legHTML({ mode: 'walk', dist: '850 公尺', time: '12 分' }, 'hubA', 'sightA');
  assert.ok(walk.includes('i-walk') && walk.includes('travelmode=walking'));
  const transit = ctx.legHTML({ mode: 'transit', time: '25 分', via: 'JR 線', fare: '¥420' }, 'hubA', 'sightA');
  assert.ok(transit.includes('JR 線') && transit.includes('¥420'));
  const drive = ctx.legHTML(trip.DAYS[0].stops[1].leg, 'hubA', 'stayA');
  assert.ok(drive.includes('i-car') && drive.includes('20 公里'));
});

test('extra.js 的自訂區塊會被渲染到指定位置', () => {
  const trip = makeTrip();
  trip.EXTRA = { sections: [
    { id: 'packing', title: '打包清單', where: 'overview', html: '<ul><li>雨具</li></ul>' },
    { id: 'parkNote', title: '停車提醒', where: 'day', day: 2, html: '<p>先繳費再上車</p>' },
  ] };
  const ctx = ctxFor(trip);
  assert.ok(ctx.overviewHTML().includes('打包清單'));
  assert.ok(!ctx.dayHTML(trip.DAYS[0]).includes('停車提醒'));
  assert.ok(ctx.dayHTML(trip.DAYS[1]).includes('停車提醒'));
});

test('自煮的食材預算不會重複前綴（money 本身就含「每人約」）', () => {
  const trip = makeTrip();
  trip.config.sections.dining = true;
  trip.DINING = {
    checked: '2026/09/18',
    places: {}, venues: {},
    cooking: { total: [1200, 1800], plan: '自己煮' },
    days: { 1: [{ slot: '晚餐', time: '18:00', plan: '自煮', fallback: '超市熟食', places: [], cooking: true }] },
  };
  trip.DAYS[0].meals = trip.DINING.days[1];
  const html = ctxFor(trip).mealsHTML(trip.DAYS[0]);
  assert.ok(html.includes('自煮食材 每人約 ¥1,200–1,800／2 人約 ¥2,400–3,600'), html.match(/自煮[^<；]*/));
  assert.ok(!/人食材約 每人約/.test(html), '不該出現「N 人食材約 每人約」這種重複前綴');
});

test('地圖清單只有一顆按鈕，沒有多餘的說明文字', () => {
  const trip = makeTrip();
  trip.config.sections.mapLists = true;
  trip.DAYS[0].mapList = { name: 'D1', url: 'https://maps.example.com/1', placeKeys: ['hubA', 'stayA'] };
  const html = ctxFor(trip).dayHTML(trip.DAYS[0]);
  assert.ok(html.includes('map-list-link'), '按鈕要在');
  assert.ok(!html.includes('map-list-note'), '不該再有那段說明');
  assert.ok(!html.includes('個地點，含餐食與備案'), '不該再有地點數與登入提醒');
  assert.ok(html.includes('aria-label="在 Google Maps 開啟 D1 私人清單（新分頁）"'), 'aria-label 已足夠說明用途');
});

test('燈箱：沒照片就整個隱藏圖片區，不佔半個螢幕放一行字', () => {
  // 原本只有餐廳沒照片會隱藏；其他地點沒照片時圖片區仍佔 46dvh，只放
  // 「這個地點沒有可用的免費授權照片」一行字。餐廳那條特例證明作者早就認定
  // 那樣不好，只是沒做全。
  const trip = makeTrip();
  const key = Object.keys(trip.PLACES).find((k) => !(trip.PHOTOS[k] || []).length && !trip.DETAILS[k]?.dining);
  assert.ok(key, 'fixture 要有一個非餐廳、沒照片的地點');
  const ctx = ctxFor(trip);
  assert.equal(typeof ctx.lightboxSliderHTML, 'function', 'render.js 要提供 lightboxSliderHTML');
  const r = ctx.lightboxSliderHTML(key);
  assert.equal(r.hidden, true, '沒照片的地點圖片區要隱藏');
  assert.ok(!/lb-nophoto/.test(r.track), '不再產生那段「沒有可用照片」的佔位');
});

test('燈箱：有照片時照常產生 figure、dots 與前後鍵狀態', () => {
  const trip = makeTrip();
  const key = Object.keys(trip.PLACES)[0];
  trip.PHOTOS[key] = [
    { src: 'img/a-1.jpg', credit: 'Someone・CC BY-SA 4.0', page: 'https://example.invalid/a', commons: true },
    { src: 'img/a-2.jpg', credit: '© 官方網站' },
  ];
  const r = ctxFor(trip).lightboxSliderHTML(key);
  assert.equal(r.hidden, false);
  const n = trip.PHOTOS[key].length;
  assert.equal((r.track.match(/<figure>/g) || []).length, n, 'figure 數量要等於照片數');
  assert.equal((r.dots.match(/<i/g) || []).length, n > 1 ? n : 0, '只有多張才有 dots');
  assert.equal(r.navHidden, n < 2, '只有多張才顯示前後鍵');
});

test('燈箱：餐廳沒照片的既有行為維持隱藏', () => {
  const trip = makeTrip();
  const key = Object.keys(trip.DETAILS).find((k) => trip.DETAILS[k]?.dining && !(trip.PHOTOS[k] || []).length);
  if (!key) return; // fixture 沒有餐廳就略過，主行為由上一個測試蓋住
  assert.equal(ctxFor(trip).lightboxSliderHTML(key).hidden, true);
});
