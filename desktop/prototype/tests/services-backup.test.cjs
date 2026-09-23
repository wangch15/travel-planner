const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { BackupService, TRUSTED_FILES } = require('../services/backup.cjs');
const exec = promisify(execFile), trusted = path.resolve(__dirname, '../../..');
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tp-backup-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = args => exec('git', ['-C', root, ...args], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
  await git(['init', '-b', 'main']);
  await git(['config', 'user.name', 'Test']); await git(['config', 'user.email', 'test@example.invalid']);
  await git(['config', 'core.hooksPath', '.githooks']);
  await git(['remote', 'add', 'origin', 'https://github.com/sample/private-trip.git']);
  for (const relative of TRUSTED_FILES) { await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true }); await fs.copyFile(path.join(trusted, relative), path.join(root, relative)); }
  await fs.chmod(path.join(root, '.githooks/pre-push'), 0o755);
  await fs.mkdir(path.join(root, 'trips/sample/docs'), { recursive: true });
  await fs.writeFile(path.join(root, 'trips/sample/data.js'), 'const DAYS = [];\n');
  await fs.writeFile(path.join(root, 'trips/sample/docs/status.md'), 'Private notes\n');
  await fs.writeFile(path.join(root, 'README.md'), 'engine\n');
  await git(['add', '.']); await git(['commit', '-m', 'Initial']);
  const initial = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  const state = { remote: initial, private: true, failPush: false, calls: [] };
  const run = async (bin, args, options) => {
    state.calls.push({ bin, args });
    if (state.beforeRun) await state.beforeRun(bin, args);
    if (bin === 'gh') return { stdout: JSON.stringify({ visibility: state.private ? 'PRIVATE' : 'PUBLIC' }) };
    if (args.includes('ls-remote')) return { stdout: state.remote ? `${state.remote}\trefs/heads/main\n` : '' };
    if (args.includes('push')) { if (state.failPush) throw Error('offline'); state.remote = (await git(['rev-parse', 'HEAD'])).stdout.trim(); return { stdout: '' }; }
    return exec(bin, args, { ...options, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
  };
  return { root, git, state, service: new BackupService({ run }) };
}
test('reviews exact trip files, commits only them, verifies fresh PRIVATE and remote head', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, 'trips/sample/data.js'), 'const DAYS = [1];\n');
  await fs.writeFile(path.join(f.root, 'README.md'), 'unrelated edit\n');
  const prepared = await f.service.prepare({ root: f.root, slug: 'sample' });
  assert.deepEqual(prepared.files.map(file => file.path), ['trips/sample/data.js']);
  const result = await f.service.confirm(prepared.token);
  assert.equal(result.backedUp, true); assert.equal(result.committed, true);
  assert.match((await f.git(['status', '--porcelain'])).stdout, /README.md/);
  assert.equal(f.state.remote, result.head);
  assert.ok(f.state.calls.filter(c => c.bin === 'gh').length >= 3);
  const push = f.state.calls.find(c => c.args.includes('push'));
  assert.deepEqual(push.args.slice(-3), ['push', 'origin', 'HEAD:refs/heads/main']);
  await assert.rejects(() => f.service.confirm(prepared.token), { code: 'STALE_CONFIRMATION' });
});
test('changed bytes invalidate confirmation without staging or pushing', async t => {
  const f = await fixture(t); const file = path.join(f.root, 'trips/sample/data.js');
  await fs.writeFile(file, 'one\n'); const p = await f.service.prepare({ root: f.root, slug: 'sample' });
  await fs.writeFile(file, 'two\n'); const r = await f.service.confirm(p.token);
  assert.equal(r.code, 'CONTENT_CHANGED'); assert.equal(r.backedUp, false);
  assert.equal(f.state.calls.some(c => c.args.includes('push')), false);
  assert.equal((await f.git(['diff', '--cached', '--name-only'])).stdout, '');
});
test('existing staged files, filters, changed hooks, and symlink files are refused', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, 'README.md'), 'staged'); await f.git(['add', 'README.md']);
  await assert.rejects(() => f.service.prepare({ root: f.root, slug: 'sample' }), { code: 'STAGED_CHANGES' });
  await f.git(['reset', 'HEAD', '--', 'README.md']);
  await f.git(['config', 'filter.custom.clean', 'evil']);
  await assert.rejects(() => f.service.prepare({ root: f.root, slug: 'sample' }), { code: 'UNSAFE_GIT_CONFIG' });
  await f.git(['config', '--unset', 'filter.custom.clean']);
  const hook = path.join(f.root, '.githooks/pre-push'); await fs.appendFile(hook, '\necho modified\n');
  await assert.rejects(() => f.service.prepare({ root: f.root, slug: 'sample' }), { code: 'UNTRUSTED_HOOK' });
  await fs.copyFile(path.join(trusted, '.githooks/pre-push'), hook);
  await fs.symlink(path.join(f.root, 'README.md'), path.join(f.root, 'trips/sample/link'));
  await assert.rejects(() => f.service.prepare({ root: f.root, slug: 'sample' }), { code: 'UNSAFE_PATH' });
});
test('visibility is checked again at confirmation; failures preserve local work and never push', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.root, 'trips/sample/data.js'), 'new\n');
  const p = await f.service.prepare({ root: f.root, slug: 'sample' }); f.state.private = false;
  const r = await f.service.confirm(p.token); assert.equal(r.code, 'PRIVATE_REPO_REQUIRED'); assert.equal(r.backedUp, false);
  assert.equal(f.state.calls.some(c => c.args.includes('push')), false);
});
test('push failure preserves the local commit and does not retry', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.root, 'trips/sample/data.js'), 'new\n');
  const p = await f.service.prepare({ root: f.root, slug: 'sample' }); f.state.failPush = true;
  const r = await f.service.confirm(p.token); assert.equal(r.committed, true); assert.equal(r.backedUp, false);
  assert.equal(f.state.calls.filter(c => c.args.includes('push')).length, 1);
  assert.equal((await f.git(['rev-parse', 'HEAD'])).stdout.trim(), r.head);
});

test('a fresh final PRIVATE check can block push after local commit without losing it', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.root, 'trips/sample/data.js'), 'new\n');
  const p = await f.service.prepare({ root: f.root, slug: 'sample' });
  let checks = 0;
  f.state.beforeRun = async bin => { if (bin === 'gh' && ++checks === 2) f.state.private = false; };
  const result = await f.service.confirm(p.token);
  assert.equal(result.committed, true); assert.equal(result.backedUp, false);
  assert.equal(f.state.calls.some(c => c.args.includes('push')), false);
});
test('new private notes and deletions are reviewed while unrelated unpublished history is disclosed', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.root, 'README.md'), 'engine update\n');
  await f.git(['add', 'README.md']); await f.git(['commit', '-m', 'Unpublished engine update']);
  await fs.unlink(path.join(f.root, 'trips/sample/data.js'));
  await fs.writeFile(path.join(f.root, 'trips/sample/docs/private.md'), 'Private booking note\n');
  const p = await f.service.prepare({ root: f.root, slug: 'sample' });
  assert.equal(p.unpublishedCommits, 1); assert.deepEqual(p.unrelatedCommittedFiles, ['README.md']);
  assert.deepEqual(p.files.map(f => [f.path, f.status]), [['trips/sample/data.js', 'deleted'], ['trips/sample/docs/private.md', 'present']]);
  assert.equal((await f.service.confirm(p.token)).backedUp, true);
});
test('URL scoped credential commands cannot execute from an imported repository', async t => {
  const f = await fixture(t); await f.git(['config', 'credential.https://github.com.helper', '!touch /tmp/not-allowed']);
  await assert.rejects(() => f.service.prepare({ root: f.root, slug: 'sample' }), { code: 'UNSAFE_GIT_CONFIG' });
  assert.equal(f.state.calls.some(c => c.bin === 'gh'), false);
});
