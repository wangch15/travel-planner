const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { loadTrip } = require('../scripts/lib/load-trip.js');

test('_example 通過驗證', () => {
  const t = loadTrip('_example');
  assert.ok(t.DAYS.length >= 3);
});

test('_example 示範三種交通方式與停車欄位', () => {
  const t = loadTrip('_example');
  const modes = new Set(t.DAYS.flatMap((d) => d.stops.filter((s) => s.leg).map((s) => s.leg.mode)));
  assert.ok(modes.has('drive') && modes.has('transit') && modes.has('walk'));
  assert.ok(Object.values(t.PLACES).some((p) => p.parking));
});

test('_example 不含個人或訂位資訊', () => {
  const dir = path.join(ROOT, 'trips/_example');
  const text = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile())
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  assert.ok(!/\d{2,4}-\d{3,4}-\d{4}/.test(text), '不該出現電話號碼');
  for (const word of ['確認碼', '訂單', '密碼', '護照', '身分證']) {
    assert.ok(!text.includes(word), `不該出現：${word}`);
  }
});
