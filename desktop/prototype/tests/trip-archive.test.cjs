const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { TripArchiveService } = require('../services/trip-archive.cjs');

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'trip-archive-'))); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const trip = path.join(root, 'trips/test-trip');
  await fs.mkdir(path.join(trip, 'docs'), { recursive: true });
  await fs.writeFile(path.join(trip, 'trip.config.json'), JSON.stringify({ title: '測試旅程', deploy: { name: 'test-site' } }));
  await fs.writeFile(path.join(trip, 'docs/private.md'), 'notes');
  return { root, trip, service: new TripArchiveService() };
}

test('archiving moves the trip under trips/_archived and restoring moves it back unchanged', async t => {
  const f = await fixture(t);
  await f.service.archive(f.root, 'test-trip');
  await assert.rejects(fs.lstat(f.trip), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(f.root, 'trips/_archived/test-trip/docs/private.md'), 'utf8'), 'notes');
  assert.deepEqual((await f.service.list(f.root)).map(item => [item.slug, item.title, item.siteName]), [['test-trip', '測試旅程', 'test-site']]);
  await f.service.restore(f.root, 'test-trip');
  assert.equal(await fs.readFile(path.join(f.trip, 'docs/private.md'), 'utf8'), 'notes');
  assert.deepEqual(await f.service.list(f.root), []);
});

test('permanent delete only works on archived trips and needs the exact trip name', async t => {
  const f = await fixture(t);
  await assert.rejects(f.service.preparePurge(f.root, 'test-trip'), { code: 'TRIP_NOT_FOUND' });
  await f.service.archive(f.root, 'test-trip');
  const plan = await f.service.preparePurge(f.root, 'test-trip');
  assert.equal(plan.files, 2);
  await assert.rejects(f.service.confirmPurge(plan.token, '測試'), { code: 'PURGE_NAME_MISMATCH' });
  assert.ok(await fs.lstat(path.join(f.root, 'trips/_archived/test-trip')), '名稱不符不能刪');
  const again = await f.service.preparePurge(f.root, 'test-trip');
  await f.service.confirmPurge(again.token, '測試旅程');
  await assert.rejects(fs.lstat(path.join(f.root, 'trips/_archived/test-trip')), { code: 'ENOENT' });
});

test('content changed after the purge review cancels the delete', async t => {
  const f = await fixture(t);
  await f.service.archive(f.root, 'test-trip');
  const plan = await f.service.preparePurge(f.root, 'test-trip');
  await fs.writeFile(path.join(f.root, 'trips/_archived/test-trip/new.txt'), 'x');
  await assert.rejects(f.service.confirmPurge(plan.token, '測試旅程'), { code: 'CONTENT_CHANGED' });
  assert.ok(await fs.lstat(path.join(f.root, 'trips/_archived/test-trip/new.txt')));
});

test('links inside or instead of a trip folder are never followed', async t => {
  const f = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-')); t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.symlink(outside, path.join(f.trip, 'link'));
  await assert.rejects(f.service.archive(f.root, 'test-trip'), { code: 'UNSAFE_TRIP_PATH' });
  await fs.symlink(outside, path.join(f.root, 'trips/other'));
  await assert.rejects(f.service.archive(f.root, 'other'), { code: 'UNSAFE_TRIP_PATH' });
});
