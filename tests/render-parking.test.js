const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { renderContext } = require('./helpers/render-ctx.js');
const { makeTrip } = require('./fixtures/make-trip.js');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ctxFor = (trip) => renderContext(trip, [read('src/util.js'), read('src/render.js')]);

const withParking = () => {
  const trip = makeTrip();
  trip.PLACES.stayA.parking = { name: '住宿停車場', lat: 38.21, lng: 140.51, fee: '一晚 ¥500' };
  trip.PLACES.sightA.parking = { name: '景點停車場', lat: 38.22, lng: 140.52, fee: '一日 ¥300', note: '旺季會滿' };
  return trip;
};

test('沒有任何 parking 時不渲染彙整區塊', () => {
  const trip = makeTrip();
  assert.equal(ctxFor(trip).dayParkingHTML(trip.DAYS[0]), '');
  assert.ok(!ctxFor(trip).dayHTML(trip.DAYS[0]).includes('day-parking'));
});

test('只列出「當天」有 parking 的停留點', () => {
  const trip = withParking();
  const ctx = ctxFor(trip);
  const d1 = ctx.dayParkingHTML(trip.DAYS[0]);
  assert.ok(d1.includes('住宿停車場'));
  assert.ok(!d1.includes('景點停車場'), '不該列到別天的停車場');
  const d2 = ctx.dayParkingHTML(trip.DAYS[1]);
  assert.ok(d2.includes('住宿停車場') && d2.includes('景點停車場'));
});

test('彙整表帶出費用、注意事項與導航連結', () => {
  const trip = withParking();
  const html = ctxFor(trip).dayParkingHTML(trip.DAYS[1]);
  assert.ok(html.includes('一日 ¥300'), '要有費用');
  assert.ok(html.includes('旺季會滿'), '要有注意事項');
  assert.ok(html.includes('38.220000,140.520000'), '導航連結要指向停車場座標，不是景點座標');
  assert.ok(html.includes('google.com/maps'), '要有 Google Maps 連結');
});

test('同一個地點在一天內出現兩次只列一次', () => {
  const trip = withParking();
  trip.DAYS[1].stops.push({ time: '18:00', place: 'stayA', kind: 'stay', label: '回住宿' });
  const html = ctxFor(trip).dayParkingHTML(trip.DAYS[1]);
  assert.equal(html.split('住宿停車場').length - 1, 1, '重複的停留點不該列兩次');
});

test('dayHTML 會把彙整接在停留點列表之後', () => {
  const trip = withParking();
  const html = ctxFor(trip).dayHTML(trip.DAYS[1]);
  assert.ok(html.includes('day-parking'));
  assert.ok(html.indexOf('day-parking') > html.indexOf('class="stops"'));
});

test('parking 只有座標、沒有名稱時用地點名稱代替', () => {
  const trip = makeTrip();
  trip.PLACES.sightA.parking = { lat: 38.22, lng: 140.52 };
  const html = ctxFor(trip).dayParkingHTML(trip.DAYS[1]);
  assert.ok(html.includes(trip.PLACES.sightA.name), '沒有停車場名稱時要顯示地點名稱');
});
