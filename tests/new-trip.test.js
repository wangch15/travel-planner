const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { newTrip } = require('../scripts/new-trip.js');
const { ROOT } = require('../scripts/lib/paths.js');

const SLUG = '_newtest';
test.afterEach(() => fs.rmSync(path.join(ROOT, 'trips', SLUG), { recursive: true, force: true }));

test('建立骨架並帶入 slug', () => {
  const dir = newTrip(SLUG);
  for (const f of ['trip.config.json', 'data.js', 'details.js', 'dining.js', 'map-lists.js', 'photos.json', 'theme.css', 'extra.js', 'docs/status.md']) {
    assert.ok(fs.existsSync(path.join(dir, f)), `缺 ${f}`);
  }
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'trip.config.json'), 'utf8'));
  assert.equal(cfg.schemaVersion, 1);
  assert.equal(cfg.deploy.name, SLUG);
});

test('已存在時拒絕覆蓋', () => {
  newTrip(SLUG);
  assert.throws(() => newTrip(SLUG), /已經存在/);
});
