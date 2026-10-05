const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderContext } = require('./helpers/render-ctx.js');
const { makeTrip } = require('./fixtures/make-trip.js');
function render(trip, key = 'sightA') {
  const ctx = renderContext(trip, ['util.js', 'render.js'].map(f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8')));
  const stop = { place: key, time: '10:00', kind: 'main', label: '看看風景' };
  return ctx.stopHTML(stop, 0, [stop]);
}
test('景點首張可用照片提供可開啟詳情的方形預覽', () => {
  const t = makeTrip();
  t.PHOTOS = { sightA: [{}, { src: 'img/sample.jpg', credit: 'Example · CC0' }, { src: 'img/second.jpg' }] };
  const html = render(t);
  assert.match(html, /class="stop-preview"[^>]*data-detail="sightA"/);
  assert.match(html, /src="img\/sample.jpg"[^>]*alt=""[^>]*loading="lazy"/);
  assert.doesNotMatch(html, /second.jpg/);
  assert.match(html, /看看風景/);
});
test('沒有照片或不是景點時保留文字卡片', () => {
  const t = makeTrip(); t.PHOTOS = {};
  assert.doesNotMatch(render(t), /stop-preview/);
  t.PHOTOS.sightA = [{ src: '' }];
  assert.doesNotMatch(render(t), /stop-preview/);
  t.PHOTOS.stayA = [{ src: 'img/stay.jpg' }];
  assert.doesNotMatch(render(t, 'stayA'), /stop-preview/);
});
test('預覽屬性逸出，沒有詳情時不建立無作用按鈕', () => {
  const t = makeTrip();
  t.PLACES.sightA.name = '示例"景點';
  t.PHOTOS = { sightA: [{ src: 'img/a"b.jpg' }] };
  assert.match(render(t), /src="img\/a&quot;b.jpg"/);
  delete t.DETAILS.sightA;
  assert.doesNotMatch(render(t), /stop-preview/);
});
