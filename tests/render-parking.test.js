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

test('沒有 parking 的地點不渲染停車區塊', () => {
  const trip = makeTrip();
  assert.equal(ctxFor(trip).stopParkingHTML(trip.PLACES.hubA), '');
  assert.ok(!ctxFor(trip).dayHTML(trip.DAYS[0]).includes('stop-parking'));
});

test('停車提醒掛在該停留點裡面，不是頁尾', () => {
  const trip = withParking();
  const html = ctxFor(trip).dayHTML(trip.DAYS[1]);   // Day 2 停 stayA 與 sightA
  assert.ok(html.includes('stop-parking'), '要有停車區塊');
  // 必須在 <ol class="stops"> 之內，且在該點的 li 裡
  const stopsStart = html.indexOf('class="stops"');
  const stopsEnd = html.indexOf('</ol>', stopsStart);
  const parkingAt = html.indexOf('stop-parking');
  assert.ok(parkingAt > stopsStart && parkingAt < stopsEnd, '停車區塊必須落在停留點列表之內');
  assert.ok(!html.includes('day-parking'), '不該再有頁尾的每日彙整');
});

test('每個有 parking 的停留點各自帶一個區塊', () => {
  const trip = withParking();
  const html = ctxFor(trip).dayHTML(trip.DAYS[1]);
  assert.equal(html.split('stop-parking').length - 1, 2, 'Day 2 兩個點都有停車，就該有兩個區塊');
  assert.ok(html.includes('住宿停車場') && html.includes('景點停車場'));
});

test('只顯示該點自己的停車場，不會混到別的點', () => {
  const trip = withParking();
  const only = ctxFor(trip).stopParkingHTML(trip.PLACES.sightA);
  assert.ok(only.includes('景點停車場'));
  assert.ok(!only.includes('住宿停車場'));
});

test('帶出費用、注意事項與指向停車場座標的導航連結', () => {
  const trip = withParking();
  const html = ctxFor(trip).stopParkingHTML(trip.PLACES.sightA);
  assert.ok(html.includes('一日 ¥300'), '要有費用');
  assert.ok(html.includes('旺季會滿'), '要有注意事項');
  assert.ok(html.includes('38.220000,140.520000'), '導航要指向停車場座標，不是景點座標');
  assert.ok(html.includes('google.com/maps'));
});

test('parking 只有座標時退回通用標題，不會顯示 undefined', () => {
  const trip = makeTrip();
  trip.PLACES.sightA.parking = { lat: 38.22, lng: 140.52 };
  const html = ctxFor(trip).stopParkingHTML(trip.PLACES.sightA);
  assert.ok(!/undefined/.test(html), html);
  assert.ok(html.includes('38.220000,140.520000'));
});

test('同一天重複造訪同一個地點，停車提醒只出現一次', () => {
  const trip = withParking();
  // Day 2 的 sightA 再排一次（午餐後回到同一個點）
  trip.DAYS[1].stops.push({ time: '15:00', place: 'sightA', kind: 'main', label: '再回來走走' });
  const html = ctxFor(trip).dayHTML(trip.DAYS[1]);
  assert.equal(html.split('景點停車場').length - 1, 1, '車只停一次，提醒就該只出現一次');
  assert.equal(html.split('住宿停車場').length - 1, 1);
});

test('不同天各自顯示，不會被前一天吃掉', () => {
  const trip = withParking();
  const ctx = ctxFor(trip);
  assert.ok(ctx.dayHTML(trip.DAYS[0]).includes('住宿停車場'), 'Day 1 停 stayA');
  assert.ok(ctx.dayHTML(trip.DAYS[1]).includes('住宿停車場'), 'Day 2 也停 stayA，要各自顯示');
});
