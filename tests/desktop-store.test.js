const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createProjectStore } = require('../desktop/prototype/project-store.cjs');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-store-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, file: path.join(directory, 'workspace.json'), store: createProjectStore(directory) };
}
test('workspace connection and selected trip survive a fresh store instance', async t => {
  const { directory, store } = await fixture(t);
  assert.equal((await store.read()).state.project, null);
  await store.connect({ id: 'project-one', root: path.resolve(directory, 'sample-project') });
  await store.select('project-one', 'sample-trip');
  await store.setTheme('dark');
  const restored = await createProjectStore(directory).read();
  assert.equal(restored.state.project.selectedSlug, 'sample-trip');
  assert.equal(restored.state.theme, 'dark');
  assert.deepEqual(Object.keys(restored.state).sort(), ['project', 'schemaVersion', 'theme']);
});
test('stale project selection is rejected and concurrent preference updates preserve project data', async t => {
  const { store, directory } = await fixture(t);
  await store.connect({ id: 'current', root: directory });
  await assert.rejects(store.select('stale', 'sample'), /stale-project/);
  await Promise.all([store.select('current', 'sample-trip'), store.setTheme('light')]);
  const { state } = await store.read();
  assert.equal(state.project.selectedSlug, 'sample-trip');
  assert.equal(state.theme, 'light');
});
test('corrupt or linked storage is not silently overwritten', async t => {
  const { file, store, directory } = await fixture(t);
  await fs.writeFile(file, '{broken');
  assert.equal((await store.read()).ok, false);
  await assert.rejects(store.setTheme('dark'), /store-invalid/);
  assert.equal(await fs.readFile(file, 'utf8'), '{broken');
  await fs.unlink(file);
  const source = path.join(directory, 'source.json');
  await fs.writeFile(source, '{}');
  await fs.link(source, file);
  assert.equal((await store.read()).ok, false);
  await assert.rejects(store.connect({ id: 'new', root: directory }), /store-invalid/);
});
test('only known settings can be written and paths cannot be relative', async t => {
  const { store } = await fixture(t);
  await assert.rejects(store.setTheme('anything'), /invalid-theme/);
  await assert.rejects(store.connect({ id: 'p', root: '../secret' }), /invalid-project/);
  await assert.rejects(store.select('p', '../other'), /invalid-slug/);
});

test('a redirected store directory is rejected by reads and writes', async t => {
  const f = await fixture(t);
  const elsewhere = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-elsewhere-'));
  t.after(() => fs.rm(elsewhere, { recursive: true, force: true }));
  const moved = f.directory + '.moved';
  t.after(() => fs.rm(moved, { recursive: true, force: true }));
  await f.store.read();
  await fs.rename(f.directory, moved); await fs.symlink(elsewhere, f.directory);
  assert.equal((await f.store.read()).ok, false);
  await assert.rejects(f.store.setTheme('dark'), /store-invalid/);
  assert.deepEqual(await fs.readdir(elsewhere), []);
});

for (const timing of ['after-inspection', 'before-open', 'after-open', 'after-write', 'before-rename', 'after-rename']) {
  test(`a store directory swapped ${timing} cannot redirect a successful save`, async t => {
    const f = await fixture(t);
    const elsewhere = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-elsewhere-'));
    t.after(() => fs.rm(elsewhere, { recursive: true, force: true }));
    const moved = f.directory + '.moved';
    t.after(() => fs.rm(moved, { recursive: true, force: true }));
    let swapped = false;
    const swap = async () => { swapped = true; await fs.rename(f.directory, moved); await fs.symlink(elsewhere, f.directory); };
    const lstat = fs.lstat; const open = fs.open; const rename = fs.rename;
    if (timing === 'after-inspection') {
      t.mock.method(fs, 'lstat', async (...args) => {
        const result = await lstat(...args);
        if (args[0] === f.directory && !swapped) await swap();
        return result;
      });
    } else if (timing.endsWith('rename')) {
      t.mock.method(fs, 'rename', async (...args) => {
        const isTemp = path.basename(String(args[0])).startsWith('.workspace-');
        if (isTemp && timing === 'before-rename' && !swapped) await swap();
        const result = await rename(...args);
        if (isTemp && timing === 'after-rename' && !swapped) await swap();
        return result;
      });
    } else {
      t.mock.method(fs, 'open', async (...args) => {
        const isTemp = path.basename(String(args[0])).startsWith('.workspace-');
        if (isTemp && timing === 'before-open' && !swapped) await swap();
        const handle = await open(...args);
        if (isTemp && timing === 'after-open' && !swapped) await swap();
        if (isTemp && timing === 'after-write') {
          const writeFile = handle.writeFile.bind(handle);
          handle.writeFile = async (...values) => { await writeFile(...values); if (!swapped) await swap(); };
        }
        return handle;
      });
    }
    await assert.rejects(f.store.setTheme('dark'), /store-invalid/);
    assert.equal(swapped, true);
    assert.deepEqual(await fs.readdir(elsewhere), []);
  });
}
