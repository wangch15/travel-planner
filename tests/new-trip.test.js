const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { newTrip, parseArgs, CARRIED } = require('../scripts/new-trip.js');
const { ROOT } = require('../scripts/lib/paths.js');

const SLUG = '_newtest';
const FROM = '_newtestfrom';
const cleanup = () => [SLUG, FROM].forEach((s) =>
  fs.rmSync(path.join(ROOT, 'trips', s), { recursive: true, force: true }));
test.afterEach(cleanup);

const readConfig = (slug) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'trips', slug, 'trip.config.json'), 'utf8'));
const writeConfig = (slug, cfg) =>
  fs.writeFileSync(path.join(ROOT, 'trips', slug, 'trip.config.json'), `${JSON.stringify(cfg, null, 2)}\n`);

test('建立骨架並帶入 slug', () => {
  const { dir } = newTrip(SLUG);
  for (const f of ['trip.config.json', 'data.js', 'details.js', 'dining.js', 'map-lists.js', 'photos.json', 'theme.css', 'extra.js', 'docs/status.md']) {
    assert.ok(fs.existsSync(path.join(dir, f)), `缺 ${f}`);
  }
  const cfg = readConfig(SLUG);
  assert.equal(cfg.schemaVersion, 1);
  assert.equal(cfg.deploy.name, SLUG);
});

test('已存在時拒絕覆蓋', () => {
  newTrip(SLUG);
  assert.throws(() => newTrip(SLUG), /已經存在/);
});

test('--from 沿用偏好欄位與 theme.css', () => {
  newTrip(FROM);
  const src = readConfig(FROM);
  src.currency = 'NT$';
  src.party = 5;
  src.transport = ['transit'];
  src.sections.dining = false;
  src.theme.accent = '#123456';
  src.region.country = 'TW';
  writeConfig(FROM, src);
  fs.writeFileSync(path.join(ROOT, 'trips', FROM, 'theme.css'), '/* 自訂配色 */\n');

  const { carried, themeCss } = newTrip(SLUG, { from: FROM });
  const cfg = readConfig(SLUG);

  assert.equal(cfg.currency, 'NT$');
  assert.equal(cfg.party, 5);
  assert.deepEqual(cfg.transport, ['transit']);
  assert.equal(cfg.sections.dining, false);
  assert.equal(cfg.theme.accent, '#123456');
  assert.equal(cfg.region.country, 'TW');
  assert.equal(themeCss, true);
  assert.ok(fs.readFileSync(path.join(ROOT, 'trips', SLUG, 'theme.css'), 'utf8').includes('自訂配色'));
  for (const k of CARRIED) assert.ok(carried.includes(k), `沒有回報沿用了 ${k}`);
});

test('--from 不沿用每趟都不同的欄位', () => {
  newTrip(FROM);
  const src = readConfig(FROM);
  src.title = '第一趟';
  src.heading = '舊標題';
  src.dates = { start: '2027-01-01', end: '2027-01-05' };
  src.region.bbox = [120, 21, 122, 25];
  writeConfig(FROM, src);

  newTrip(SLUG, { from: FROM });
  const cfg = readConfig(SLUG);

  assert.notEqual(cfg.title, '第一趟');
  assert.notEqual(cfg.heading, '舊標題');
  assert.equal(cfg.dates.start, '');
  assert.deepEqual(cfg.region.bbox, [0, 0, 0, 0]);
  // deploy.name 沿用的話兩趟會互相覆蓋線上網站
  assert.equal(cfg.deploy.name, SLUG);
});

test('--from 指向不存在或自己時給得出訊息', () => {
  assert.throws(() => newTrip(SLUG, { from: '沒這個行程' }), /找不到/);
  assert.throws(() => newTrip(SLUG, { from: SLUG }), /不能指向自己/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'trips', SLUG)), '失敗時不該留下半個資料夾');
});

test('參數解析：--from 吃掉的值不會被當成 slug', () => {
  assert.deepEqual(parseArgs(['my-trip']), { slug: 'my-trip', from: null, sawFrom: false });
  assert.deepEqual(parseArgs(['my-trip', '--from', 'old']), { slug: 'my-trip', from: 'old', sawFrom: true });
  assert.deepEqual(parseArgs(['--from', 'old', 'my-trip']), { slug: 'my-trip', from: 'old', sawFrom: true });
  assert.deepEqual(parseArgs(['my-trip', '--from=old']), { slug: 'my-trip', from: 'old', sawFrom: true });
  assert.deepEqual(parseArgs(['--from']), { slug: null, from: null, sawFrom: true });
});
