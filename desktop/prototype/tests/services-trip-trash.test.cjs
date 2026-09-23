const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { TripTrashService } = require('../services/trip-trash.cjs');
const exec = promisify(execFile);
async function fixture(t, options = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'trip-trash-'))); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await exec('git', ['init', root]); await fs.writeFile(path.join(root, '.gitignore'), '.local/\n');
  const trip = path.join(root, 'trips/sample'); await fs.mkdir(path.join(trip, 'docs'), { recursive: true }); await fs.mkdir(path.join(trip, 'photos'));
  await fs.writeFile(path.join(trip, 'trip.config.json'), JSON.stringify({ title: 'Private planning draft' }));
  await fs.writeFile(path.join(trip, 'data.js'), 'invalid-but-readable data');
  await fs.writeFile(path.join(trip, 'docs/private.md'), 'Private booking notes');
  await fs.writeFile(path.join(trip, 'photos/sample.jpg'), Buffer.from([1,2,3]));
  const state = { private: true, checks: 0 };
  const service = new TripTrashService({ checkPrivate: async () => { state.checks++; return state.private; }, ...options });
  return { root, trip, target: { root, slug: 'sample' }, state, service };
}
test('prepare is read-only; confirmed trash and restore preserve all files including invalid planning data', async t => {
  const f = await fixture(t), prepared = await f.service.prepare(f.target);
  assert.equal(prepared.title, 'Private planning draft'); assert.equal(prepared.fileCount, 4); assert.match(prepared.warning, /Git 歷史/);
  await assert.rejects(fs.stat(path.join(f.root, '.local')), { code: 'ENOENT' });
  const removed = await f.service.confirm(prepared.token); assert.equal(removed.trashed, true); assert.equal(removed.receiptRecorded, true);
  await assert.rejects(fs.stat(f.trip), { code: 'ENOENT' });
  assert.equal((await f.service.list({ root: f.root })).length, 1);
  const restored = await f.service.restore(prepared.token); assert.equal(restored.restored, true); assert.equal(restored.receiptRecorded, true);
  assert.equal(await fs.readFile(path.join(f.trip, 'docs/private.md'), 'utf8'), 'Private booking notes');
  assert.deepEqual(await fs.readFile(path.join(f.trip, 'photos/sample.jpg')), Buffer.from([1,2,3]));
  assert.equal(await fs.readFile(path.join(f.trip, 'data.js'), 'utf8'), 'invalid-but-readable data');
  assert.deepEqual(await f.service.list({ root: f.root }), []); assert.ok(f.state.checks >= 4);
  await assert.rejects(f.service.confirm(prepared.token), { code: 'STALE_CONFIRMATION' });
});
test('restarts recover durable moving/restoring receipts after a process interruption', async t => {
  const f = await fixture(t, { afterMove: async () => { throw Error('simulated interruption'); } });
  const p = await f.service.prepare(f.target), trashed = await f.service.confirm(p.token); assert.equal(trashed.receiptRecorded, false);
  const restarted = new TripTrashService({ checkPrivate: async () => true, afterMove: async () => { throw Error('simulated restore interruption'); } });
  const entries = await restarted.list({ root: f.root }); assert.equal(entries[0].id, p.id);
  const result = await restarted.restore({ root: f.root, id: p.id }); assert.equal(result.restored, true); assert.equal(result.receiptRecorded, false);
  const again = new TripTrashService({ checkPrivate: async () => true }); assert.deepEqual(await again.list({ root: f.root }), []);
  assert.equal(await fs.readFile(path.join(f.trip, 'docs/private.md'), 'utf8'), 'Private booking notes');
});
test('changes after preparation and fresh privacy failure stop deletion', async t => {
  const f = await fixture(t); let p = await f.service.prepare(f.target);
  await fs.appendFile(path.join(f.trip, 'docs/private.md'), ' changed');
  await assert.rejects(f.service.confirm(p.token), { code: 'TRIP_CHANGED' });
  p = await f.service.prepare(f.target); f.state.private = false;
  await assert.rejects(f.service.confirm(p.token), { code: 'PRIVATE_REPO_REQUIRED' });
  assert.ok((await fs.stat(f.trip)).isDirectory());
});
test('restore never replaces a recreated destination, including a last-moment directory', async t => {
  const f = await fixture(t); const p = await f.service.prepare(f.target); await f.service.confirm(p.token);
  await fs.mkdir(f.trip); await fs.writeFile(path.join(f.trip, 'untouched.txt'), 'new trip');
  await assert.rejects(f.service.restore(p.id), { code: 'RESTORE_DESTINATION_EXISTS' });
  assert.equal(await fs.readFile(path.join(f.trip, 'untouched.txt'), 'utf8'), 'new trip');
  await fs.rm(f.trip, { recursive: true });
  const raced = new TripTrashService({ checkPrivate: async () => true, beforeMove: async kind => { if (kind === 'restore') await fs.mkdir(f.trip); } });
  await assert.rejects(raced.restore({ root: f.root, id: p.id }), { code: 'RESTORE_DESTINATION_EXISTS' });
  assert.equal((await raced.list({ root: f.root })).length, 1);
});
test('requires ignored trash storage and rejects source/storage/receipt links', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.root, '.gitignore'), '');
  await assert.rejects(f.service.prepare(f.target), { code: 'TRASH_NOT_IGNORED' });
  await fs.writeFile(path.join(f.root, '.gitignore'), '.local/\n');
  await fs.symlink('private.md', path.join(f.trip, 'docs/link.md'));
  await assert.rejects(f.service.prepare(f.target), { code: 'UNSAFE_TRASH_PATH' }); await fs.unlink(path.join(f.trip, 'docs/link.md'));
  let p = await f.service.prepare(f.target); const outside = path.join(f.root, 'outside'); await fs.mkdir(outside); await fs.symlink(outside, path.join(f.root, '.local'));
  await assert.rejects(f.service.confirm(p.token), { code: 'UNSAFE_TRASH_PATH' }); await fs.unlink(path.join(f.root, '.local'));
  p = await f.service.prepare(f.target); await f.service.confirm(p.token);
  const receipt = path.join(f.root, '.local/desktop-trash', p.id, 'receipt.json'); await fs.unlink(receipt); await fs.symlink(path.join(f.root, '.gitignore'), receipt);
  await assert.rejects(f.service.list({ root: f.root }), { code: 'TRASH_RECORD_INVALID' });
});
test('pre-move change is detected and its interrupted receipt never pretends the trip was deleted', async t => {
  const f = await fixture(t, { beforeMove: async (kind) => { if (kind === 'trash') await fs.appendFile(path.join(f.trip, 'data.js'), ' changed'); } });
  const p = await f.service.prepare(f.target); await assert.rejects(f.service.confirm(p.token), { code: 'TRIP_CHANGED' });
  assert.deepEqual(await f.service.list({ root: f.root }), []); assert.ok((await fs.stat(f.trip)).isDirectory());
});

test('existing mixed-case underscore slugs can be removed and restored', async t=>{const f=await fixture(t);const slug='Trip_2026';await fs.rename(f.trip,path.join(f.root,'trips',slug));const p=await f.service.prepare({root:f.root,slug});await f.service.confirm(p.token);await f.service.restore(p.token);assert.equal(await fs.readFile(path.join(f.root,'trips',slug,'docs/private.md'),'utf8'),'Private booking notes');});
