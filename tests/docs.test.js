const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { MODES, KINDS, CATS } = require('../scripts/lib/schema.js');

const docs = fs.readdirSync(path.join(ROOT, 'docs/schema'))
  .map((f) => fs.readFileSync(path.join(ROOT, 'docs/schema', f), 'utf8')).join('\n');

test('六份 schema 文件都在', () => {
  const files = fs.readdirSync(path.join(ROOT, 'docs/schema')).sort();
  assert.deepEqual(files, ['data.md', 'details.md', 'dining.md', 'map-lists.md', 'photos.md', 'trip-config.md']);
});

test('每個合法的 mode / kind / cat 都有被文件提到', () => {
  for (const v of [...MODES, ...KINDS, ...CATS]) {
    assert.ok(docs.includes(`\`${v}\``), `docs/schema 沒有說明 ${v}`);
  }
});
