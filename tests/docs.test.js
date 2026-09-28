const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { MODES, KINDS, CATS } = require('../scripts/lib/schema.js');

const docs = fs.readdirSync(path.join(ROOT, 'docs/schema'))
  .map((f) => fs.readFileSync(path.join(ROOT, 'docs/schema', f), 'utf8')).join('\n');

test('七份 schema 文件都在', () => {
  const files = fs.readdirSync(path.join(ROOT, 'docs/schema')).sort();
  assert.deepEqual(files, ['data.md', 'details.md', 'dining.md', 'map-lists.md', 'photos.md', 'stay-guides.md', 'trip-config.md']);
});

test('住宿指南的每個 kind／來源類型都有被文件提到', () => {
  const { LIST_KINDS, SECTION_KINDS, SOURCE_TYPES, LINK_KINDS } = require('../packages/engine/stay-guides.cjs');
  const doc = fs.readFileSync(path.join(ROOT, 'docs/schema/stay-guides.md'), 'utf8');
  for (const v of [LIST_KINDS, SECTION_KINDS, SOURCE_TYPES, LINK_KINDS].flatMap(Object.keys)) {
    assert.match(doc, new RegExp(`\\b${v}\\b`), `stay-guides.md 沒有說明 ${v}`);
  }
});

test('每個合法的 mode / kind / cat 都有被文件提到', () => {
  for (const v of [...MODES, ...KINDS, ...CATS]) {
    assert.ok(docs.includes(`\`${v}\``), `docs/schema 沒有說明 ${v}`);
  }
});
