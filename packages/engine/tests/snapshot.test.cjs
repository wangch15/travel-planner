const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { readTripSnapshot } = require('../snapshot.cjs');
const example = path.resolve(__dirname, '../../../trips/_example');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trip-snapshot-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, 'sample-trip');
  await fs.cp(example, dir, { recursive: true });
  return { dir, root };
}
async function hashes(dir, prefix = '') {
  const out = {};
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = prefix + e.name;
    if (e.isDirectory()) Object.assign(out, await hashes(path.join(dir, e.name), rel + '/'));
    else out[rel] = createHash('sha256').update(await fs.readFile(path.join(dir, e.name))).digest('hex');
  }
  return out;
}

test('example snapshot matches trusted CLI data and preserves original files byte for byte', async (t) => {
  const { dir } = await fixture(t);
  const before = await hashes(dir);
  const result = await readTripSnapshot(dir, { slug: '_example' });
  const { loadTrip } = require('../../../scripts/lib/load-trip.js');
  assert.deepEqual(result.trip, loadTrip('_example'));
  assert.equal(result.photos.yamadera[0].src, 'img/yamadera-1.jpg');
  assert.equal(result.photoFiles[0].source.startsWith('photos/'), true);
  assert.equal(result.photoFiles.every((p) => !path.isAbsolute(p.source) && p.sha256.length === 64), true);
  assert.equal(result.digest.length, 64);
  assert.equal((await readTripSnapshot(dir, { slug: '_example' })).digest, result.digest);
  assert.deepEqual(await hashes(dir), before);
  await fs.appendFile(path.join(dir, 'theme.css'), '\n/* changed */');
  assert.notEqual((await readTripSnapshot(dir)).digest, result.digest);
});

test('private docs are never opened and missing photo files are skipped', async (t) => {
  const { dir, root } = await fixture(t);
  await fs.rm(path.join(dir, 'docs'), { recursive: true });
  await fs.symlink(root, path.join(dir, 'docs'));
  await fs.rm(path.join(dir, 'photos/yamadera-1.jpg'));
  const snapshot = await readTripSnapshot(dir);
  assert.equal(snapshot.photos.yamadera, undefined);
  assert.equal(snapshot.trip.slug, 'sample-trip');
});

test('malicious imported JavaScript cannot create a file', async (t) => {
  const { dir, root } = await fixture(t);
  const marker = path.join(root, 'marker');
  await fs.writeFile(path.join(dir, 'extra.js'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'secret'); module.exports = {};`);
  await assert.rejects(readTripSnapshot(dir), { code: 'INCOMPATIBLE_DATA' });
  await assert.rejects(fs.stat(marker), { code: 'ENOENT' });
});

test('malformed schema errors reveal neither private data nor paths', async (t) => {
  const { dir } = await fixture(t);
  await fs.writeFile(path.join(dir, 'trip.config.json'), '{"title":"PRIVATE-MARKER"}');
  await assert.rejects(readTripSnapshot(dir), (e) => e.code === 'INVALID_TRIP' && !e.message.includes('PRIVATE-MARKER') && !e.message.includes(dir));
});

for (const kind of ['symlink', 'hardlink', 'photo-directory']) test('rejects ' + kind, async (t) => {
  const { dir, root } = await fixture(t);
  if (kind === 'photo-directory') {
    await fs.rename(path.join(dir, 'photos'), path.join(root, 'elsewhere'));
    await fs.symlink(path.join(root, 'elsewhere'), path.join(dir, 'photos'));
  } else {
    await fs.rename(path.join(dir, 'data.js'), path.join(root, 'outside.js'));
    await fs[kind === 'symlink' ? 'symlink' : 'link'](path.join(root, 'outside.js'), path.join(dir, 'data.js'));
  }
  await assert.rejects(readTripSnapshot(dir), { code: 'UNSAFE_PATH' });
});

test('rejects escaping photo keys and unsafe slug', async (t) => {
  const { dir } = await fixture(t);
  await assert.rejects(readTripSnapshot(dir, { slug: '../private' }), { code: 'UNSAFE_PATH' });
  await fs.writeFile(path.join(dir, 'photos.json'), '{"../private":[]}');
  await assert.rejects(readTripSnapshot(dir), { code: 'UNSAFE_PATH' });
});

test('rejects oversized text before parsing', async (t) => {
  const { dir } = await fixture(t);
  await fs.writeFile(path.join(dir, 'theme.css'), ' '.repeat(4 * 1024 * 1024 + 1));
  await assert.rejects(readTripSnapshot(dir), { code: 'INPUT_LIMIT' });
});

test('photo bytes and fingerprints describe the same immutable read', async (t) => {
  const { dir } = await fixture(t);
  const snapshot = await readTripSnapshot(dir, { includePhotoBytes: true });
  for (const photo of snapshot.photoFiles) {
    assert.ok(Buffer.isBuffer(photo.bytes));
    assert.equal(photo.bytes.length, photo.size);
    assert.equal(createHash('sha256').update(photo.bytes).digest('hex'), photo.sha256);
    assert.deepEqual(photo.bytes, await fs.readFile(path.join(dir, photo.source)));
  }
  const original = snapshot.photoFiles[0].bytes;
  await fs.writeFile(path.join(dir, snapshot.photoFiles[0].source), Buffer.from('changed image'));
  assert.notDeepEqual(original, await fs.readFile(path.join(dir, snapshot.photoFiles[0].source)));
  assert.notEqual((await readTripSnapshot(dir)).digest, snapshot.digest);
});

for (const kind of ['symlink', 'hardlink']) test('rejects actual photo ' + kind, async (t) => {
  const { dir, root } = await fixture(t);
  const photo = path.join(dir, 'photos/yamadera-1.jpg');
  const target = path.join(root, 'outside.jpg');
  await fs.rename(photo, target);
  await fs[kind === 'symlink' ? 'symlink' : 'link'](target, photo);
  await assert.rejects(readTripSnapshot(dir), { code: 'UNSAFE_PATH' });
});

test('rejects a selected folder that is a symbolic link', async (t) => {
  const { dir, root } = await fixture(t);
  const link = path.join(root, 'linked-trip');
  await fs.symlink(dir, link);
  await assert.rejects(readTripSnapshot(link), { code: 'UNSAFE_PATH' });
});

test('rejects prototype keys in JSON without mutating Object.prototype', async (t) => {
  const { dir } = await fixture(t);
  await fs.writeFile(path.join(dir, 'photos.json'), '{"__proto__":{"polluted":true}}');
  await assert.rejects(readTripSnapshot(dir), { code: 'INCOMPATIBLE_DATA' });
  assert.equal({}.polluted, undefined);
});

test('rejects executable photo links even when the image is absent', async (t) => {
  const { dir } = await fixture(t);
  await fs.writeFile(path.join(dir, 'photos.json'), '{"yamadera":[{"page":"javascript:alert(1)"}]}');
  await assert.rejects(readTripSnapshot(dir), { code: 'UNSAFE_PATH' });
});

test('rejects total text and individual image limits', async (t) => {
  const { dir } = await fixture(t);
  const photo = await fs.open(path.join(dir, 'photos/yamadera-1.jpg'), 'r+');
  await photo.truncate(16 * 1024 * 1024 + 1);
  await photo.close();
  await assert.rejects(readTripSnapshot(dir), { code: 'INPUT_LIMIT' });
  await fs.rm(path.join(dir, 'photos/yamadera-1.jpg'));
  for (const file of ['data.js', 'details.js', 'dining.js', 'map-lists.js']) {
    const original = await fs.readFile(path.join(dir, file), 'utf8');
    await fs.writeFile(path.join(dir, file), original + ' '.repeat(4 * 1024 * 1024 - Buffer.byteLength(original)));
  }
  await assert.rejects(readTripSnapshot(dir), { code: 'INPUT_LIMIT' });
});

for (const timing of ['after-realpath', 'after-open', 'after-read']) test('rejects photo parent replacement ' + timing + ' without returning outside bytes', async (t) => {
  const { dir, root } = await fixture(t);
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'photos.json'), 'utf8'));
  await fs.writeFile(path.join(dir, 'photos.json'), JSON.stringify({ yamadera: manifest.yamadera }));
  const photos = path.join(dir, 'photos');
  const outside = path.join(root, 'outside');
  await fs.cp(photos, outside, { recursive: true });
  await fs.writeFile(path.join(outside, 'yamadera-1.jpg'), 'OUTSIDE_BYTES');
  let replaced = false;
  const replace = async () => {
    if (replaced) return;
    replaced = true;
    await fs.rename(photos, path.join(root, 'original-photos'));
    await fs.symlink(outside, photos);
  };
  const realpath = fs.realpath;
  const open = fs.open;
  if (timing === 'after-realpath') t.mock.method(fs, 'realpath', async (filename, ...args) => {
    const result = await realpath(filename, ...args);
    if (filename === photos) await replace();
    return result;
  });
  else t.mock.method(fs, 'open', async (filename, ...args) => {
    const handle = await open(filename, ...args);
    if (filename === path.join(photos, 'yamadera-1.jpg')) {
      if (timing === 'after-open') await replace();
      else {
        const read = handle.read.bind(handle);
        handle.read = async (...readArgs) => { const result = await read(...readArgs); await replace(); return result; };
      }
    }
    return handle;
  });
  await assert.rejects(readTripSnapshot(dir, { includePhotoBytes: true }), { code: 'SOURCE_CHANGED' });
  assert.equal(replaced, true);
});

test('version context excludes editable days but includes other source data, theme and photos',async t=>{
 const {dir}=await fixture(t);const baseline=await readTripSnapshot(dir);
 const {parseLiteralModule}=require('../literal-data.cjs');const {replaceDay}=require('../day-edit.cjs');
 const day=parseLiteralModule(baseline.dataSource).DAYS[0];
 await fs.writeFile(path.join(dir,'data.js'),replaceDay(baseline.dataSource,day.id,{...day,title:'Changed title'}).source);
 const edited=await readTripSnapshot(dir);assert.equal(edited.contextDigest,baseline.contextDigest);assert.notEqual(edited.digest,baseline.digest);
 await fs.appendFile(path.join(dir,'theme.css'),'\n/* context changed */');const themed=await readTripSnapshot(dir);assert.notEqual(themed.contextDigest,baseline.contextDigest);
 const photo=themed.photoFiles[0];await fs.appendFile(path.join(dir,photo.source),Buffer.from([0]));assert.notEqual((await readTripSnapshot(dir)).contextDigest,themed.contextDigest);
});
