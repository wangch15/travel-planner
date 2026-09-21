const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyPaths, renderVerdict } = require('../scripts/contrib-check.js');

test('行程資料與私人筆記絕對不能進 PR', () => {
  const r = classifyPaths([
    'src/app.js',
    'trips/iceland-2027/data.js',
    'trips/iceland-2027/docs/plan.md',
    'trips/_profile.md',
  ]);
  assert.deepEqual(r.blocked.sort(), [
    'trips/_profile.md',
    'trips/iceland-2027/data.js',
    'trips/iceland-2027/docs/plan.md',
  ]);
  assert.deepEqual(r.engine, ['src/app.js']);
});

test('trips/_example 是引擎的一部分，可以改', () => {
  const r = classifyPaths(['trips/_example/data.js']);
  assert.deepEqual(r.blocked, [], '_example 是模板附的範例，不是任何人的行程');
  assert.deepEqual(r.engine, ['trips/_example/data.js']);
});

test('產物與快取不該出現在 PR 裡', () => {
  const r = classifyPaths(['dist/x/site/index.html', 'trips/a/.cache/y.json']);
  assert.equal(r.blocked.length, 2);
});

test('乾淨的引擎改動放行', () => {
  const out = renderVerdict(classifyPaths(['src/app.js', 'tests/render.test.js']));
  assert.match(out, /可以開 PR|通過/);
  assert.ok(!/✗|不能/.test(out), `不該報錯：\n${out}`);
});

test('夾帶行程資料時要擋下來，並說明為什麼', () => {
  const out = renderVerdict(classifyPaths(['src/app.js', 'trips/iceland-2027/data.js']));
  assert.match(out, /trips\/iceland-2027\/data\.js/, '要指名是哪個檔案');
  assert.match(out, /公開/, '要說明 fork 是公開的');
  assert.ok(!/可以開 PR/.test(out), '有夾帶就不該說可以開');
});

test('完全沒有引擎改動時提醒這不該是 PR', () => {
  const out = renderVerdict(classifyPaths([]));
  assert.match(out, /沒有|issue/, '沒東西可提就該去開 issue');
});
