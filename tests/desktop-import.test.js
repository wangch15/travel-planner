const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { inspectProject } = require('../desktop/spikes/inspect-project.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-import-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  async function write(name, value) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), typeof value === 'string' ? value : JSON.stringify(value));
  }
  await write('package.json', { name: 'travel-planner', version: '1.1.0', scripts: { prepare: 'never run me' } });
  await write('scripts/build.js', 'throw Error("Never execute project scripts");');
  await write('scripts/check.js', 'throw Error("Never execute project scripts");');
  await fs.mkdir(path.join(root, 'trips'));
  async function trip(slug, config = {}) {
    await write(`trips/${slug}/trip.config.json`, {
      schemaVersion: 1, title: `行程 ${slug}`,
      dates: { start: '2027-05-01', end: '2027-05-03' },
      deploy: { target: 'workers', name: `sample-${slug}` }, ...config,
    });
    for (const name of ['data.js', 'details.js', 'dining.js', 'map-lists.js']) {
      await write(`trips/${slug}/${name}`, 'throw Error("Do not load trip JavaScript");');
    }
    await write(`trips/${slug}/photos.json`, {});
  }
  return { root, write, trip };
}

test('inspects existing trips without executing code, reading private notes, or changing files', async t => {
  const f = await fixture(t);
  await f.trip('alpha');
  await f.trip('beta', { deploy: { target: 'pages', name: 'legacy-example' } });
  await f.trip('_example');
  await f.write('trips/alpha/docs/status.md', 'PRIVATE_SENTINEL not an approval');
  await f.write('trips/_profile.md', 'PRIVATE_SENTINEL');
  await f.write('.local/deployments/alpha.json', 'PRIVATE_SENTINEL local evidence only');
  await f.write('.git/config', 'PRIVATE_SENTINEL credentials and hooks');
  const before = await snapshot(f.root);
  const result = await inspectProject(f.root);
  assert.equal(result.ok, true);
  assert.equal(result.readOnly, true);
  assert.equal(result.engineVersion, '1.1.0');
  assert.equal(result.ownership, 'unverified');
  assert.equal(result.contentValidation, 'not-run');
  assert.deepEqual(result.trips.map(trip => trip.slug), ['alpha', 'beta']);
  assert.equal(result.trips[0].localDeploymentRecord, 'present');
  assert.equal(result.trips[1].deployment.target, 'pages');
  assert.equal(result.trips[1].localDeploymentRecord, 'missing');
  assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
  assert.deepEqual(await snapshot(f.root), before);
});

test('keeps broken and future-schema trips visible alongside usable metadata', async t => {
  const f = await fixture(t);
  await f.trip('good');
  await f.trip('future', { schemaVersion: 900 });
  await f.write('trips/broken/trip.config.json', '{PRIVATE_SENTINEL');
  const result = await inspectProject(f.root);
  assert.equal(result.ok, true);
  assert.equal(result.trips.length, 3);
  assert.equal(result.trips.find(x => x.slug === 'good').metadataStatus, 'readable');
  assert.ok(result.trips.find(x => x.slug === 'future').issues.includes('schema-unsupported'));
  assert.ok(result.trips.find(x => x.slug === 'broken').issues.includes('config-invalid'));
  assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
});

test('validates metadata types and required data files without pretending to run check', async t => {
  const f = await fixture(t);
  await f.trip('bad', { title: { secret: 'PRIVATE_SENTINEL' }, dates: { start: '2027-02-30' }, deploy: null });
  await fs.unlink(path.join(f.root, 'trips/bad/data.js'));
  const trip = (await inspectProject(f.root)).trips[0];
  assert.equal(trip.title, 'bad');
  assert.equal(trip.metadataStatus, 'needs-attention');
  assert.ok(trip.issues.includes('title-invalid'));
  assert.ok(trip.issues.includes('dates-invalid'));
  assert.ok(trip.issues.includes('deployment-invalid'));
  assert.ok(trip.issues.includes('data-files-missing'));
  assert.equal(trip.contentValidation, 'not-run');
});

test('rejects non-project, missing directory, and oversized JSON with bounded errors', async t => {
  const f = await fixture(t);
  assert.equal((await inspectProject(path.join(f.root, 'absent'))).ok, false);
  await fs.unlink(path.join(f.root, 'scripts/build.js'));
  assert.equal((await inspectProject(f.root)).code, 'not-project');
  await f.write('scripts/build.js', '');
  await f.trip('huge');
  await f.write('trips/huge/trip.config.json', ' '.repeat(300_000));
  assert.ok((await inspectProject(f.root)).trips[0].issues.includes('file-too-large'));
});

test('does not traverse linked trip folders or linked config files', async t => {
  const f = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.writeFile(path.join(outside, 'trip.config.json'), JSON.stringify({ title: 'PRIVATE_SENTINEL' }));
  await fs.symlink(outside, path.join(f.root, 'trips/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await f.trip('linked-config');
  await fs.unlink(path.join(f.root, 'trips/linked-config/trip.config.json'));
  await fs.link(path.join(outside, 'trip.config.json'), path.join(f.root, 'trips/linked-config/trip.config.json'));
  const result = await inspectProject(f.root);
  assert.ok(result.trips.find(x => x.slug === 'linked').issues.includes('linked-path'));
  assert.ok(result.trips.find(x => x.slug === 'linked-config').issues.includes('linked-path'));
  assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
});

test('rejects linked trips ancestor', async t => {
  const f = await fixture(t);
  await fs.rename(path.join(f.root, 'trips'), path.join(f.root, 'elsewhere'));
  await fs.symlink(path.join(f.root, 'elsewhere'), path.join(f.root, 'trips'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await inspectProject(f.root)).ok, false);
});

test('matches existing deployment defaults and rejects trailing-hyphen names', async t => {
  const f = await fixture(t);
  await f.trip('legacy', { deploy: { name: 'legacy-example' } });
  await f.trip('invalid-name', { deploy: { target: 'workers', name: 'sample-' } });
  const result = await inspectProject(f.root);
  assert.equal(result.trips.find(x => x.slug === 'legacy').deployment?.target, 'workers');
  assert.ok(result.trips.find(x => x.slug === 'invalid-name').issues.includes('deployment-invalid'));
});

async function snapshot(root) {
  const result = {};
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else result[path.relative(root, file)] = (await fs.readFile(file)).toString('base64');
    }
  }
  await visit(root);
  return result;
}
