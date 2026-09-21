const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { allSlugs, describe: describeTrip, render, isTemplateOrigin, lastTouched } = require('../scripts/list-trips.js');
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
  assert.match(render([], [], false), /npm run new/);
});

test('在自己的 repo 裡沒有行程：叫他開一趟，順便指出附了範例', () => {
  const out = render([], [], false);
  assert.match(out, /npm run new -- <slug>/);
  assert.match(out, /_example/, '要讓人知道模板附了範例可以先看');
});

test('在模板 repo 裡沒有行程：不能叫人 npm run new', () => {
  const out = render([], [], true);
  // 模板 repo 裡不放真實行程——無條件叫人開一趟正好違反那條硬規則
  assert.ok(!/^\s*先跑 npm run new/m.test(out), `不該無條件叫人開行程：\n${out}`);
  assert.match(out, /repo-ownership/, '要指向那條規則');
  assert.match(out, /維護引擎|模板作者/, '要涵蓋「在維護引擎」這種正常情況');
  assert.match(out, /私有/, '要涵蓋「還沒開自己的私有 repo」這種走錯路的情況');
});

test('認得出 origin 是不是模板', () => {
  assert.equal(isTemplateOrigin('https://github.com/wangch15/travel-planner.git'), true);
  assert.equal(isTemplateOrigin('git@github.com:wangch15/travel-planner.git'), true);
  assert.equal(isTemplateOrigin('https://github.com/wangch15/travel-planner'), true);
  assert.equal(isTemplateOrigin('https://github.com/someone/travel-planner.git'), false);
  assert.equal(isTemplateOrigin('https://github.com/wangch15/travel-planner-2.git'), false);
  assert.equal(isTemplateOrigin(null), false, '沒有 git／沒有 origin 時不要誤判成模板');
  assert.equal(isTemplateOrigin(''), false);
});

test('列出最後更新時間，讓「我上次在弄的那個」有答案', () => {
  const fake = () => '2026-09-21T14:30:00+08:00\n';
  assert.equal(lastTouched('_example', fake), '2026-09-21');
  assert.equal(lastTouched('_example', () => { throw new Error('not a git repo'); }), null,
    '不是 git repo 時要回 null，不是爆掉');
  assert.equal(lastTouched('_example', () => '\n'), null, '沒有 commit 碰過就沒有時間');
});

test('有多趟時要叫 agent 問，不是叫它自己挑', () => {
  const row = describeTrip('_example');
  const out = render([row], ['iceland-2027', 'osaka-2028', 'jeju-2029'], false);
  assert.match(out, /有 3 趟行程/);
  assert.ok(/問他|不要猜|不要自己/.test(out), `要明講不能猜：\n${out}`);
  assert.match(out, /上線/, '要講明猜錯的代價');
});

test('最後更新有值就要印出來', () => {
  const out = render([{ slug: 'a', title: 'A', ok: true, updated: '2026-09-20' },
    { slug: 'b', title: 'B', ok: true, updated: '2026-09-21' }], ['a', 'b'], false);
  assert.match(out, /2026-09-20/);
  assert.match(out, /2026-09-21/);
});
