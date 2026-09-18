const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { resolveSlug, tripDir, distDir, ROOT } = require('../scripts/lib/paths.js');

test('明確指定 slug 時直接採用', () => {
  assert.equal(resolveSlug(['_example']), '_example');
});

test('忽略 -- 開頭的旗標', () => {
  assert.equal(resolveSlug(['--force', '_example']), '_example');
});

test('沒給 slug 時，唯一的非底線行程會被自動選中', (t) => {
  t.mock.method(fs, 'readdirSync', () => [
    { name: '_example', isDirectory: () => true },
    { name: 'sendai-2026', isDirectory: () => true },
  ]);
  assert.equal(resolveSlug([]), 'sendai-2026');
});

test('沒給 slug 且有多個行程時報錯並列出可選項', (t) => {
  t.mock.method(fs, 'readdirSync', () => [
    { name: 'a-trip', isDirectory: () => true },
    { name: 'b-trip', isDirectory: () => true },
  ]);
  assert.throws(() => resolveSlug([]), /a-trip.*b-trip/s);
});

test('路徑落在專案內', () => {
  assert.equal(tripDir('x'), path.join(ROOT, 'trips', 'x'));
  assert.equal(distDir('x'), path.join(ROOT, 'dist', 'x'));
});
