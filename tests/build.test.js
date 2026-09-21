const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildTrip } = require('../scripts/build.js');
const { loadTrip } = require('../scripts/lib/load-trip.js');
const { ROOT } = require('../scripts/lib/paths.js');

const built = buildTrip('_example');
const read = (p) => fs.readFileSync(path.join(built.outDir, p), 'utf8');

test('產出單一 HTML，佔位符都被取代', () => {
  const html = read('site/index.html');
  for (const ph of ['/*__CONFIG__*/', '/*__BASEMAP__*/', '/*__PHOTOS__*/', '/*__DATA__*/', '/*__TITLE__*/']) {
    assert.ok(!html.includes(ph), `佔位符未取代：${ph}`);
  }
  assert.ok(!html.includes('<script src='), 'JS 必須內嵌');
  assert.ok(!html.includes('<link rel="stylesheet" href="styles.css"'), 'CSS 必須內嵌');
});

test('標題與描述取自 trip.config', () => {
  const html = read('site/index.html');
  const cfg = loadTrip('_example').config;
  assert.ok(html.includes(`<title>${cfg.title}</title>`));
  assert.ok(html.includes(cfg.description));
  assert.ok(html.includes('<html lang="zh-Hant">'));
});

test('靜態檔一起複製到 site/', () => {
  assert.ok(read('site/robots.txt').includes('Disallow: /'));
  assert.ok(read('site/_headers').includes('X-Robots-Tag'));
});

test('wrangler.json 放在 site 外層並指向 ./site', () => {
  const w = JSON.parse(read('wrangler.json'));
  assert.equal(w.name, 'example-trip');
  assert.equal(w.assets.directory, './site');
  assert.match(w.compatibility_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!fs.existsSync(path.join(built.outDir, 'site', 'wrangler.json')), 'wrangler.json 不能被當靜態檔發布');
});

test('trips/<slug>/docs 不進產物', () => {
  const html = read('site/index.html');
  assert.ok(!html.includes('範例行程進度'));
});

test('theme.css 接在引擎 CSS 之後', () => {
  const html = read('site/index.html');
  assert.ok(html.indexOf('覆寫引擎 CSS 變數') > html.indexOf(':root{'));
});

test('trips/_profile.md 不進產物', () => {
  const p = path.join(ROOT, 'trips', '_profile.md');
  const sentinel = '某人不吃牛肉還有花生過敏';
  const existed = fs.existsSync(p);
  const backup = existed ? fs.readFileSync(p, 'utf8') : null;
  fs.writeFileSync(p, `# 旅伴與偏好\n\n## 飲食\n${sentinel}\n`);
  try {
    const { outDir } = buildTrip('_example');
    const html = fs.readFileSync(path.join(outDir, 'site', 'index.html'), 'utf8');
    assert.ok(!html.includes(sentinel), '_profile.md 的內容不該出現在網站裡');
  } finally {
    if (existed) fs.writeFileSync(p, backup); else fs.unlinkSync(p);
  }
});
