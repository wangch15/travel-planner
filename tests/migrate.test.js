const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { migrate } = require('../scripts/migrate/0-to-1.js');

function copyFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-migrate-'));
  fs.cpSync(path.join(__dirname, 'fixtures', 'legacy-trip'), dir, { recursive: true });
  return dir;
}

test('jp 改名為 local', () => {
  const dir = copyFixture();
  migrate(dir);
  const data = require(path.join(dir, 'data.js'));
  assert.ok(Object.values(data.PLACES).every((p) => !('jp' in p)));
  assert.ok(Object.values(data.PLACES).some((p) => p.local));
});

test('leg 補上 mode 並改名欄位', () => {
  const dir = copyFixture();
  migrate(dir);
  const data = require(path.join(dir, 'data.js'));
  const leg = data.DAYS.flatMap((d) => d.stops).find((s) => s.leg).leg;
  assert.equal(leg.mode, 'drive');
  assert.ok(leg.time && leg.via);
  assert.ok(!('drive' in leg) && !('road' in leg));
});

test('含「步行」字樣的舊 leg 被判為 walk', () => {
  const dir = copyFixture();
  migrate(dir);
  const data = require(path.join(dir, 'data.js'));
  assert.ok(data.DAYS.flatMap((d) => d.stops).some((s) => s.leg && s.leg.mode === 'walk'));
});

test('STAYS 補上 day', () => {
  const dir = copyFixture();
  migrate(dir);
  const data = require(path.join(dir, 'data.js'));
  assert.ok(data.STAYS.every((s) => typeof s.day === 'number'));
});

test('schemaVersion 升為 1', () => {
  const dir = copyFixture();
  migrate(dir);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'trip.config.json'), 'utf8')).schemaVersion, 1);
});

test('回傳的變更說明涵蓋每一項改動', () => {
  const dir = copyFixture();
  const notes = migrate(dir);
  assert.ok(notes.some((n) => n.includes('local')));
  assert.ok(notes.some((n) => n.includes('mode')));
});
