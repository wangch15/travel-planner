const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { loadTrip } = require('../scripts/lib/load-trip.js');
const { makeTrip } = require('./fixtures/make-trip.js');

const SLUG = '_loadtest';
const dir = path.join(ROOT, 'trips', SLUG);

function writeTrip(mutate) {
  const t = makeTrip();
  if (mutate) mutate(t);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'trip.config.json'), JSON.stringify(t.config, null, 2));
  const mod = (name, value) => fs.writeFileSync(path.join(dir, name), `module.exports = ${JSON.stringify(value, null, 2)};\n`);
  mod('data.js', { PLACES: t.PLACES, DAYS: t.DAYS, OVERVIEW_ROUTE: t.OVERVIEW_ROUTE, ADDONS: t.ADDONS, CHECKLIST: t.CHECKLIST, STAYS: t.STAYS, OVERVIEW: t.OVERVIEW });
  mod('details.js', t.DETAILS);
  mod('dining.js', t.DINING);
  mod('map-lists.js', t.MAP_LISTS);
  fs.writeFileSync(path.join(dir, 'photos.json'), JSON.stringify(t.PHOTOS));
  fs.writeFileSync(path.join(dir, 'basemap.json'), JSON.stringify(t.basemap));
}

test.afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test('載入合法行程並回傳合併後的物件', () => {
  writeTrip();
  const t = loadTrip(SLUG);
  assert.equal(t.slug, SLUG);
  assert.equal(t.DAYS.length, 2);
  assert.equal(t.config.title, '測試行程');
});

test('餐飲地點併入 PLACES 並標為概略位置，三餐掛到當天', () => {
  writeTrip((t) => {
    t.DINING.places = { cafeA: { name: '咖啡店', lat: 38.3, lng: 140.6, gq: '咖啡店', cat: 'food' } };
    t.DINING.venues = { cafeA: { menu: '咖啡', booking: '不用訂位' } };
    t.DINING.days = { 1: [{ slot: '午餐', time: '12:00', plan: '喝咖啡', fallback: '便利商店', places: ['cafeA'] }] };
    t.DETAILS.cafeA = t.DETAILS.sightA;
  });
  const t = loadTrip(SLUG);
  assert.equal(t.PLACES.cafeA.approximate, true);
  assert.equal(t.DAYS[0].meals.length, 1);
  assert.equal(t.DAYS[1].meals.length, 0);
});

test('dining.checklist 併入 CHECKLIST', () => {
  writeTrip((t) => { t.DINING.checklist = ['問餐廳能不能訂位']; });
  assert.ok(loadTrip(SLUG).CHECKLIST.includes('問餐廳能不能訂位'));
});

test('驗證失敗時丟出含所有問題的錯誤', () => {
  writeTrip((t) => { t.PLACES.sightA.lat = 0; });
  assert.throws(() => loadTrip(SLUG), /座標超出/);
});

test('validate:false 時略過驗證', () => {
  writeTrip((t) => { t.PLACES.sightA.lat = 0; });
  assert.ok(loadTrip(SLUG, { validate: false }).PLACES.sightA);
});

test('資料夾不存在時給明確訊息', () => {
  assert.throws(() => loadTrip('_nope'), /找不到行程資料夾/);
});

test('兩個行程共用同一個 deploy.name 會被擋下來', () => {
  writeTrip();
  const other = path.join(ROOT, 'trips', '_clashtest');
  try {
    fs.mkdirSync(other, { recursive: true });
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'trip.config.json'), 'utf8'));
    fs.writeFileSync(path.join(other, 'trip.config.json'), JSON.stringify(cfg));
    assert.throws(() => loadTrip(SLUG), /deploy\.name.*重複|重複.*deploy\.name/s);
  } finally {
    fs.rmSync(other, { recursive: true, force: true });
  }
});

test('deploy.name 不同的行程不受影響', () => {
  writeTrip();
  const other = path.join(ROOT, 'trips', '_clashtest');
  try {
    fs.mkdirSync(other, { recursive: true });
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'trip.config.json'), 'utf8'));
    cfg.deploy.name = 'another-trip';
    fs.writeFileSync(path.join(other, 'trip.config.json'), JSON.stringify(cfg));
    assert.ok(loadTrip(SLUG).config.title);
  } finally {
    fs.rmSync(other, { recursive: true, force: true });
  }
});
