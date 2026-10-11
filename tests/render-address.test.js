const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { renderContext } = require('./helpers/render-ctx.js');
const { makeTrip } = require('./fixtures/make-trip.js');
const { validate } = require('../packages/engine/schema.cjs');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ctxFor = (trip) => renderContext(trip, [read('src/util.js'), read('src/render.js')]);
const ADDR = '山形県山形市三日町2丁目2-55';

const guideTrip = (item) => {
  const trip = makeTrip();
  trip.STAY_GUIDES = [{
    id: 'g', stay: 'stayA', days: [1],
    lists: [{ id: 'shopping', kind: 'shopping', items: [{ id: 'a', name: '超市', ...item }] }],
  }];
  return trip;
};

test('地點有 addr 時，停留點顯示日文地址與複製按鈕', () => {
  const trip = makeTrip();
  trip.PLACES.sightA.addr = ADDR;
  const html = ctxFor(trip).dayHTML(trip.DAYS[1]);
  assert.ok(html.includes('class="addr"'));
  assert.ok(html.includes('lang="ja"'));
  assert.ok(html.includes(ADDR));
  assert.ok(html.includes('data-copy="' + ADDR + '"'), '複製按鈕帶完整地址');
});

test('地點沒有 addr 時不輸出地址區塊', () => {
  const trip = makeTrip();
  const html = ctxFor(trip).dayHTML(trip.DAYS[1]);
  assert.ok(!html.includes('class="addr"'));
  assert.ok(!html.includes('data-copy'));
});

test('燈箱詳細說明也顯示地址與複製按鈕', () => {
  const trip = makeTrip();
  trip.PLACES.sightA.addr = ADDR;
  const html = ctxFor(trip).detailBodyHTML('sightA');
  assert.ok(html.includes('data-copy="' + ADDR + '"'));
});

test('住宿指南項目用自己的 addr；沒有時沿用 place 的 addr', () => {
  const own = ctxFor(guideTrip({ addr: '山形市松見町21-10' })).guideBodyHTML('g');
  assert.ok(own.includes('data-copy="山形市松見町21-10"'));
  const trip = guideTrip({ place: 'sightA' });
  trip.PLACES.sightA.addr = ADDR;
  assert.ok(ctxFor(trip).guideBodyHTML('g').includes('data-copy="' + ADDR + '"'));
});

test('地址會跳脫，不能夾帶 HTML 或跳出屬性', () => {
  const trip = makeTrip();
  trip.PLACES.sightA.addr = '市"><b>x</b>';
  const html = ctxFor(trip).dayHTML(trip.DAYS[1]);
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(html.includes('data-copy="市&quot;&gt;&lt;b&gt;x&lt;/b&gt;"'));
});

test('schema：addr 必須是一行、非空、不過長的字串', () => {
  for (const bad of ['', '   ', 42, '第一行\n第二行', 'あ'.repeat(121)]) {
    const trip = makeTrip();
    trip.PLACES.sightA.addr = bad;
    assert.ok(validate(trip).some((e) => e.includes('PLACES.sightA addr')), `應拒絕 ${JSON.stringify(bad)}`);
  }
  const ok = makeTrip();
  ok.PLACES.sightA.addr = ADDR;
  assert.deepEqual(validate(ok).filter((e) => e.includes('addr')), []);
});

test('schema：住宿指南項目可以有 addr，格式錯誤會被擋', () => {
  assert.deepEqual(validate(guideTrip({ addr: ADDR })).filter((e) => e.includes('addr')), []);
  assert.ok(validate(guideTrip({ addr: 'a\nb' })).some((e) => e.includes('addr')));
});
