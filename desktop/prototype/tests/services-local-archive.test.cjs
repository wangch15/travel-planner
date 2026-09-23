const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { LocalArchiveService, MAX_FILE, allowed } = require('../services/local-archive.cjs');
const { NewTripService } = require('../services/new-trip.cjs');
const { readTripSnapshot } = require('../../../packages/engine/snapshot.cjs');
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'local-archive-'))); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'trips/sample'); await fs.mkdir(path.dirname(source));
  await fs.cp(path.resolve(__dirname, '../../../trips/_example'), source, { recursive: true });
  await fs.mkdir(path.join(source, 'docs'), { recursive: true });
  await fs.writeFile(path.join(source, 'docs/private.md'), 'Private note retained in local backup.');
  await fs.writeFile(path.join(source, 'photos.json'), '{}\n');
  await fs.rm(path.join(source, 'photos'), { recursive: true, force: true });
  await fs.mkdir(path.join(source, 'photos')); await fs.writeFile(path.join(source, 'photos/sample-1.jpg'), Buffer.from([255,216,255,217]));
  await fs.mkdir(path.join(source, '.cache')); await fs.writeFile(path.join(source, '.cache/secret'), 'excluded');
  await fs.writeFile(path.join(root, 'unrelated-secret'), 'outside trip');
  const state = { private: true, checks: 0 };
  const service = new LocalArchiveService({ checkPrivate: async () => { state.checks++; return state.private; } });
  return { root, source, service, state, file: path.join(root, 'sample.travel-planner.json'), target: { root, slug: 'sample' } };
}
test('roundtrips validated trip, photos and private docs to new slug without modifying original', async t => {
  const f = await fixture(t), before = await fs.readFile(path.join(f.source, 'data.js'));
  const exported = await f.service.exportTrip(f.target, f.file);
  assert.equal(exported.kind, 'ready'); assert.equal(exported.includesPrivateNotes, true);
  assert.equal(f.state.checks, 0, 'offline local export does not require a network private check');
  const archive = JSON.parse(await fs.readFile(f.file, 'utf8'));
  assert.ok(archive.files.some(item => item.path === 'docs/private.md'));
  assert.ok(archive.files.some(item => item.path === 'photos/sample-1.jpg'));
  assert.equal(archive.files.some(item => item.path.includes('.cache') || item.path.includes('unrelated-secret')), false);
  const imported = await f.service.importTrip(f.root, f.file, { title: 'Restored holiday' });
  assert.notEqual(imported.slug, 'sample'); assert.equal(imported.planning, false); assert.equal(f.state.checks, 2);
  const dir = path.join(f.root, 'trips', imported.slug), config = JSON.parse(await fs.readFile(path.join(dir, 'trip.config.json')));
  assert.equal(config.deploy.name, imported.slug); assert.equal(config.title, 'Restored holiday');
  assert.equal(await fs.readFile(path.join(dir, 'docs/private.md'), 'utf8'), 'Private note retained in local backup.');
  assert.match(await fs.readFile(path.join(dir, 'docs/status.md'), 'utf8'), /沒有沿用舊的同意/);
  assert.deepEqual(await fs.readFile(path.join(f.source, 'data.js')), before);
  await readTripSnapshot(dir, { slug: imported.slug });
  assert.equal((await fs.readdir(path.join(f.root, 'trips'))).length, 2);
});
test('rejects tampered payloads, traversal, duplicate paths, oversized declarations and public import', async t => {
  const f = await fixture(t); await f.service.exportTrip(f.target, f.file);
  const original = JSON.parse(await fs.readFile(f.file, 'utf8'));
  for (const mutate of [
    a => { a.files[0].data = Buffer.from('changed').toString('base64'); },
    a => { a.files[0].path = '../outside.md'; },
    a => { a.files.push(a.files[0]); },
    a => { a.files[0].size = MAX_FILE + 1; },
  ]) {
    const value = structuredClone(original); mutate(value); await fs.writeFile(f.file, JSON.stringify(value));
    await assert.rejects(f.service.importTrip(f.root, f.file));
    assert.deepEqual(await fs.readdir(path.join(f.root, 'trips')), ['sample']);
  }
  await fs.writeFile(f.file, JSON.stringify(original)); f.state.private = false;
  await assert.rejects(f.service.importTrip(f.root, f.file), { code: 'PRIVATE_PROJECT_REQUIRED' });
});
test('requires explicit planning mode and resets imported approval metadata', async t => {
  const f = await fixture(t), draft = await new NewTripService({ checkPrivate: async () => true }).create(f.root, { title: 'Planning holiday' });
  const target = { root: f.root, slug: draft.slug }, file = path.join(f.root, 'planning.travel-planner.json');
  await assert.rejects(f.service.exportTrip(target, file), { code: 'PLANNING_CONFIRMATION_REQUIRED' });
  assert.equal((await f.service.exportTrip(target, file, { allowPlanning: true })).kind, 'planning');
  await assert.rejects(f.service.importTrip(f.root, file), { code: 'PLANNING_CONFIRMATION_REQUIRED' });
  const result = await f.service.importTrip(f.root, file, { allowPlanning: true }); assert.equal(result.planning, true);
  const planning = JSON.parse(await fs.readFile(path.join(f.root, 'trips', result.slug, 'docs/planning-draft.json')));
  assert.equal(planning.importedWithoutApprovals, true); assert.equal(planning.revision, 1); assert.equal(planning.status, 'planning');
});
test('rejects file links, hidden traversal, and export inside the original trip', async t => {
  const f = await fixture(t);
  await assert.rejects(f.service.exportTrip(f.target, path.join(f.source, 'trip.config.json')), { code: 'ARCHIVE_INSIDE_TRIP' });
  await fs.symlink(path.join(f.root, 'unrelated-secret'), path.join(f.source, 'docs/linked.txt'));
  await assert.rejects(f.service.exportTrip(f.target, f.file), { code: 'UNSAFE_ARCHIVE_FILE' });
  await fs.unlink(path.join(f.source, 'docs/linked.txt'));
  await fs.link(path.join(f.source, 'docs/private.md'), path.join(f.source, 'docs/hardlinked.md'));
  await assert.rejects(f.service.exportTrip(f.target, f.file), { code: 'UNSAFE_ARCHIVE_FILE' });
  for (const name of ['docs/.git/config', 'docs/../secret.md', '/etc/passwd', 'docs/x:stream.txt', 'docs/CON.txt', 'docs/file.js', 'photos/../data.js']) assert.equal(allowed(name), false, name);
});
test('schema failure cannot be downgraded to planning merely by opting in', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.source, 'data.js'), 'process.exit(1);');
  await assert.rejects(f.service.exportTrip(f.target, f.file, { allowPlanning: true }));
  await assert.rejects(fs.stat(f.file), { code: 'ENOENT' });
});

test('per-file limits and destination/archive symlinks fail closed', async t => {
  const f = await fixture(t), oversized = path.join(f.source, 'docs/oversized.txt');
  const handle = await fs.open(oversized, 'w'); await handle.truncate(MAX_FILE + 1); await handle.close();
  await assert.rejects(f.service.exportTrip(f.target, f.file), { code: 'UNSAFE_ARCHIVE_FILE' });
  await fs.unlink(oversized);
  const victim = path.join(f.root, 'victim.json'); await fs.writeFile(victim, 'unchanged'); await fs.symlink(victim, f.file);
  await assert.rejects(f.service.exportTrip(f.target, f.file), { code: 'UNSAFE_ARCHIVE_FILE' });
  await assert.rejects(f.service.importTrip(f.root, f.file), { code: 'UNSAFE_ARCHIVE_FILE' });
  assert.equal(await fs.readFile(victim, 'utf8'), 'unchanged');
});
