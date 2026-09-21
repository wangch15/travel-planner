const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { allSlugs, describe: describeTrip, render } = require('../scripts/list-trips.js');
const { newTrip } = require('../scripts/new-trip.js');
const { ROOT } = require('../scripts/lib/paths.js');

const SLUG = '_listtest';
test.afterEach(() => fs.rmSync(path.join(ROOT, 'trips', SLUG), { recursive: true, force: true }));

test('內建行程預設不列，--all 才列', () => {
  assert.ok(!allSlugs(false).includes('_example'), '預設不該列出 _example');
  assert.ok(allSlugs(true).includes('_example'), '--all 要列出 _example');
});

test('讀得出標題、日期與部署網址', () => {
  const r = describeTrip('_example');
  assert.equal(r.slug, '_example');
  assert.ok(r.title, '缺標題');
  assert.match(r.dates, /2026-\d\d-\d\d → 2026-\d\d-\d\d/);
  assert.match(r.deploy, /\.workers\.dev$/);
  assert.equal(r.ok, true, `_example 應該通過驗證，實際：${r.problem}`);
});

test('資料不完整的行程標成未通過，並指向 check', () => {
  newTrip(SLUG);
  const r = describeTrip(SLUG);
  assert.equal(r.ok, false);
  assert.ok(r.problem.includes(`npm run check -- ${SLUG}`), `問題訊息要指向 check：${r.problem}`);
  assert.ok(!r.problem.endsWith('：'), '不該留著截斷後的冒號');
});

test('讀不到 config 時不會整個掛掉', () => {
  const r = describeTrip('這個行程不存在');
  assert.equal(r.ok, false);
  assert.ok(r.problem.includes('trip.config.json'));
});

test('能不能省略 slug 是看自己的行程數，不是看列了幾行', () => {
  const row = describeTrip('_example');
  // 只有內建範例：resolveSlug 認不得它，所以一定要指定
  assert.match(render([row], []), /一定要指定 slug/);
  assert.match(render([row], ['kyoto-2027']), /可以省略 slug/);
  const many = render([row], ['kyoto-2027', 'osaka-2028']);
  assert.match(many, /有 2 趟行程/);
  assert.match(many, /npm run check -- kyoto-2027/);
});

test('沒有任何行程時給出下一步', () => {
  assert.match(render([], []), /npm run new/);
});
