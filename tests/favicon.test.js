const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const brand = file => fs.readFileSync(path.join(root, 'desktop/prototype/assets/brand', file));

test('the trip site favicon is the Travel Planner mark, inlined so every publish path carries it', () => {
  // App 發布只送固定幾個檔案，所以圖示內嵌在模板裡；這裡確認它跟品牌圖示一字不差、沒有過期。
  const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
  const links = [...html.matchAll(/<link rel="(icon|apple-touch-icon)"[^>]*href="data:([^;]+);base64,([^"]+)"[^>]*>/g)]
    .map(([tag, rel, type, data]) => ({ rel, type, media: /media="([^"]+)"/.exec(tag)?.[1] || null, bytes: Buffer.from(data, 'base64') }));
  const find = (type, media) => links.find(l => l.type === type && l.media === media);
  assert.deepEqual(find('image/svg+xml', '(prefers-color-scheme: light)').bytes, brand('favicon-light.svg'));
  assert.deepEqual(find('image/svg+xml', '(prefers-color-scheme: dark)').bytes, brand('favicon-dark.svg'));
  assert.deepEqual(find('image/png', null).bytes, brand('light/icon-32.png'));
  assert.deepEqual(links.find(l => l.rel === 'apple-touch-icon').bytes, brand('light/icon-180.png'));
});
