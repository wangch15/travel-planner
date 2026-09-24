const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { ProjectSetupService, safePath } = require('../services/project-setup.cjs');
const { TRUSTED_FILES } = require('../services/backup.cjs');
const exec = promisify(execFile), trusted = path.resolve(__dirname, '../../..');
async function fixture(t) {
  const workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'project-setup-'))); t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const source = path.join(workspace, 'template'), parentDirectory = path.join(workspace, 'downloads'); await fs.mkdir(source); await fs.mkdir(parentDirectory);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const git = (args, cwd = source, options = {}) => exec('git', args, { ...options, cwd, env });
  await git(['init', '-b', 'main']); await git(['config', 'user.name', 'Test']); await git(['config', 'user.email', 'test@example.invalid']);
  for (const file of TRUSTED_FILES) { await fs.mkdir(path.dirname(path.join(source, file)), { recursive: true }); await fs.copyFile(path.join(trusted, file), path.join(source, file)); }
  await fs.chmod(path.join(source, '.githooks/pre-push'), 0o755);
  await fs.writeFile(path.join(source, 'README.md'), 'Trusted template history\n');
  await git(['add', '.']); await git(['commit', '-m', 'Initial template']);
  const state = { owner: 'sample', private: true, created: false, calls: [], failClone: false, unsafeConfig: null };
  const runGit = async (args, options) => {
    state.calls.push({ kind: 'git', args: [...args] });
    if (args[0] === 'config' && args.includes('--list') && state.unsafeConfig) return { stdout: state.unsafeConfig };
    if (args[0] === 'clone') {
      if (state.failClone) throw Error('simulated failure');
      const adjusted = [...args]; adjusted[adjusted.length - 2] = source;
      const result = await git(adjusted, options.cwd, options);
      // Preserve the actual network identity without making a network connection.
      await git(['remote', 'set-url', 'origin', args[args.length - 2]], args[args.length - 1]);
      return result;
    }
    return git(args, options.cwd, options);
  };
  const gh = async args => {
    state.calls.push({ kind: 'gh', args: [...args] });
    if (args[0] === 'api') return { stdout: args.at(-1).includes('{') ? JSON.stringify({ login: state.owner, id: 123456 }) : state.owner + '\n' };
    if (args[1] === 'create') { state.created = true; return { stdout: 'created' }; }
    if (args[1] === 'view') return { stdout: JSON.stringify({ visibility: state.private ? 'PRIVATE' : 'PUBLIC', nameWithOwner: args[2] }) };
    throw Error('unexpected gh command');
  };
  return { workspace, source, parentDirectory, state, git, service: new ProjectSetupService({ runGit, gh }) };
}
test('clones existing private repo through verified blobs and installs only exact trusted hooks', async t => {
  const f = await fixture(t); const prepared = await f.service.prepareClone({ repo: 'sample/private-trip', parentDirectory: f.parentDirectory });
  assert.equal(prepared.visibility, 'PRIVATE'); assert.equal(f.state.calls.some(c => c.args[0] === 'clone'), false);
  const result = await f.service.confirmClone(prepared.token); assert.equal(result.ready, true); assert.equal(result.backupReady, true);
  assert.equal(await fs.readFile(path.join(result.root, 'README.md'), 'utf8'), 'Trusted template history\n');
  assert.equal((await f.git(['config', 'core.hooksPath'], result.root)).stdout.trim(), '.githooks');
  assert.equal((await f.git(['diff', '--name-only'], result.root)).stdout, '');
  assert.ok(f.state.calls.some(c => c.args[0] === 'clone' && c.args.includes('--no-checkout')));
  assert.equal(f.state.calls.some(c => ['checkout', 'push'].includes(c.args[0])), false);
  await assert.rejects(f.service.confirmClone(prepared.token), { code: 'STALE_CONFIRMATION' });
});
test('new private repo requires explicit confirmation and preserves template history without initial push', async t => {
  const f = await fixture(t), prepared = await f.service.prepareCreate({ name: 'new-trip', parentDirectory: f.parentDirectory });
  assert.equal(prepared.repo, 'sample/new-trip'); assert.equal(prepared.templateSource, 'wangch15/travel-planner'); assert.deepEqual(prepared.author, { name: 'sample', email: '123456+sample@users.noreply.github.com' }); assert.equal(f.state.created, false);
  const result = await f.service.confirmCreate(prepared.token); assert.equal(result.ready, true); assert.equal(result.created, true); assert.equal(result.backedUp, false);
  assert.equal((await f.git(['remote', 'get-url', 'origin'], result.root)).stdout.trim(), 'https://github.com/sample/new-trip.git');
  assert.equal((await f.git(['remote', 'get-url', 'upstream'], result.root)).stdout.trim(), 'https://github.com/wangch15/travel-planner.git');
  assert.equal((await f.git(['rev-parse', 'HEAD'], result.root)).stdout, (await f.git(['rev-parse', 'HEAD'])).stdout);
  const create = f.state.calls.find(c => c.kind === 'gh' && c.args[1] === 'create'); assert.ok(create.args.includes('--private'));
  assert.equal(f.state.calls.some(c => c.args[0] === 'push'), false);
});
test('private visibility and account identity are rechecked on confirmation', async t => {
  const f = await fixture(t); let p = await f.service.prepareClone({ repo: 'sample/private-trip', parentDirectory: f.parentDirectory });
  f.state.private = false; let result = await f.service.confirmClone(p.token); assert.equal(result.ready, false); assert.equal(result.code, 'PRIVATE_REPO_REQUIRED');
  assert.equal(f.state.calls.some(c => c.args[0] === 'clone'), false);
  f.state.private = true; p = await f.service.prepareCreate({ name: 'new-trip', parentDirectory: f.parentDirectory }); f.state.owner = 'another';
  result = await f.service.confirmCreate(p.token); assert.equal(result.ready, false); assert.equal(result.code, 'ACCOUNT_CHANGED'); assert.equal(f.state.created, false);
});
test('refuses nested project, existing destinations, unsafe global executable config, and path tricks', async t => {
  const f = await fixture(t);
  await assert.rejects(f.service.prepareClone({ repo: 'sample/nested', parentDirectory: f.source }), { code: 'NESTED_PROJECT' });
  await fs.mkdir(path.join(f.parentDirectory, 'existing'));
  await assert.rejects(f.service.prepareClone({ repo: 'sample/existing', parentDirectory: f.parentDirectory }), { code: 'DESTINATION_EXISTS' });
  for (const raw of ['core.fsmonitor\nevil\0', 'init.templatedir\n/untrusted\0', 'core.hookspath\n/untrusted\0']) { f.state.unsafeConfig = raw; await assert.rejects(f.service.prepareClone({ repo: 'sample/private', parentDirectory: f.parentDirectory }), { code: 'UNSAFE_GIT_CONFIG' }); }
  for (const name of ['../x', '.git/config', 'GIT~1/config', 'dir/x:secret', 'dir/CON.txt', '/absolute']) assert.equal(safePath(name), false, name);
});
test('unknown hooks remain inert and prevent backup readiness', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.source, '.githooks/post-checkout'), '#!/bin/sh\ntouch NEVER_EXECUTE\n'); await f.git(['add', '.']); await f.git(['commit', '-m', 'Unknown hook data']);
  const p = await f.service.prepareClone({ repo: 'sample/private-trip', parentDirectory: f.parentDirectory }); const result = await f.service.confirmClone(p.token);
  assert.equal(result.ready, true); assert.equal(result.backupReady, false);
  await assert.rejects(fs.stat(path.join(result.root, 'NEVER_EXECUTE')), { code: 'ENOENT' });
});
test('linked tree is refused; failed new setup preserves its private repo and local directory', async t => {
  const f = await fixture(t); await fs.symlink('README.md', path.join(f.source, 'linked')); await f.git(['add', '.']); await f.git(['commit', '-m', 'Linked data']);
  let p = await f.service.prepareClone({ repo: 'sample/linked', parentDirectory: f.parentDirectory }); let result = await f.service.confirmClone(p.token); assert.equal(result.ready, false); assert.equal(result.code, 'UNSAFE_PROJECT_TREE'); assert.ok((await fs.stat(result.root)).isDirectory());
  f.state.failClone = true; p = await f.service.prepareCreate({ name: 'preserved', parentDirectory: f.parentDirectory }); result = await f.service.confirmCreate(p.token);
  assert.equal(result.ready, false); assert.equal(result.created, true); assert.ok((await fs.stat(result.root)).isDirectory());
});
test('standard gh helper is accepted and attributes stay inert during raw blob materialization', async t => {
  const f = await fixture(t); f.state.unsafeConfig = 'credential.https://github.com.helper\n!/opt/homebrew/bin/gh auth git-credential\0';
  await fs.writeFile(path.join(f.source, '.gitattributes'), '*.txt filter=unknown\n'); await fs.writeFile(path.join(f.source, 'sample.txt'), 'raw\n');
  await f.git(['add', '.']); await f.git(['commit', '-m', 'Attributes without executable filter']);
  const prepared = await f.service.prepareClone({ repo: 'sample/attributes', parentDirectory: f.parentDirectory });
  const result = await f.service.confirmClone(prepared.token); assert.equal(result.ready, true); assert.equal(await fs.readFile(path.join(result.root, 'sample.txt'), 'utf8'), 'raw\n');
});
test('create then new trip supports the first private backup to an empty origin without automatic setup push', async t => {
  const f = await fixture(t), prepared = await f.service.prepareCreate({ name: 'first-backup', parentDirectory: f.parentDirectory });
  const created = await f.service.confirmCreate(prepared.token); assert.equal(created.ready, true);
  assert.equal((await f.git(['config', '--local', 'user.email'], created.root)).stdout.trim(), '123456+sample@users.noreply.github.com');
  const { NewTripService } = require('../services/new-trip.cjs');
  const trip = await new NewTripService({ checkPrivate: async () => true }).create(created.root, { title: 'First holiday' });
  const { BackupService } = require('../services/backup.cjs');
  let remote = null; const pushes = [];
  const backup = new BackupService({ run: async (bin, args, options) => {
    if (bin === 'gh') return { stdout: JSON.stringify({ visibility: 'PRIVATE' }) };
    if (args.includes('ls-remote')) return { stdout: remote ? `${remote}\trefs/heads/main\n` : '' };
    if (args.includes('push')) { pushes.push(args); remote = (await f.git(['rev-parse', 'HEAD'], created.root)).stdout.trim(); return { stdout: '' }; }
    return exec(bin, args, { ...options, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
  } });
  const before = await backup.prepare({ root: created.root, slug: trip.slug });
  assert.equal(before.remoteHead, null); assert.ok(before.unpublishedCommits >= 1);
  assert.ok(before.files.every(file => file.path.startsWith(`trips/${trip.slug}/`)));
  assert.equal(pushes.length, 0);
  const result = await backup.confirm(before.token); assert.equal(result.backedUp, true); assert.equal(result.committed, true); assert.equal(result.head, remote); assert.equal(pushes.length, 1);
});
test('existing clone identity is previewed and set only on explicit confirmation, without commit or push', async t => {
  const f = await fixture(t), clone = await f.service.prepareClone({ repo: 'sample/private-trip', parentDirectory: f.parentDirectory });
  const result = await f.service.confirmClone(clone.token); assert.equal(result.identityReady, false); assert.match(result.warning, /提交作者/);
  const config = path.join(result.root, '.git/config'), before = await fs.readFile(config, 'utf8');
  const prepared = await f.service.prepareIdentity(result.root); assert.deepEqual(prepared.author, { name: 'sample', email: '123456+sample@users.noreply.github.com' });
  assert.equal(await fs.readFile(config, 'utf8'), before);
  const confirmed = await f.service.confirmIdentity(prepared.token); assert.equal(confirmed.identityReady, true);
  assert.equal((await f.git(['config', '--local', 'user.email'], result.root)).stdout.trim(), prepared.author.email);
  assert.equal(f.state.calls.some(c => ['push', 'commit'].includes(c.args[0]) || c.args.includes('--global')), false);
});
test('identity confirmation refuses changed account or changed destination before config mutation', async t => {
  const f = await fixture(t), clone = await f.service.prepareClone({ repo: 'sample/private-trip', parentDirectory: f.parentDirectory });
  const result = await f.service.confirmClone(clone.token), config = path.join(result.root, '.git/config');
  let prepared = await f.service.prepareIdentity(result.root), before = await fs.readFile(config, 'utf8');
  f.state.owner = 'other'; let confirmed = await f.service.confirmIdentity(prepared.token); assert.equal(confirmed.ready, false); assert.equal(confirmed.code, 'ACCOUNT_CHANGED'); assert.equal(await fs.readFile(config, 'utf8'), before);
  f.state.owner = 'sample'; prepared = await f.service.prepareIdentity(result.root); await f.git(['remote', 'set-url', 'origin', 'https://github.com/sample/changed.git'], result.root); before = await fs.readFile(config, 'utf8');
  confirmed = await f.service.confirmIdentity(prepared.token); assert.equal(confirmed.ready, false); assert.equal(confirmed.code, 'PROJECT_CHANGED'); assert.equal(await fs.readFile(config, 'utf8'), before);
});
test('an already connected project gets its trusted backup protection enabled before backing up', async t => {
  // 以前只有下載／建立專案那一刻會裝；之後才連接的專案備份時只看到「請先完成 Git hook 設定」。
  const f = await fixture(t);
  assert.equal(await f.service.enableTrustedHooks(f.source), true);
  assert.equal((await f.git(['config', 'core.hooksPath'])).stdout.trim(), '.githooks');
});
test('a different existing hooksPath is never overwritten', async t => {
  const f = await fixture(t);
  await f.git(['config', '--local', 'core.hooksPath', 'my-hooks']);
  assert.equal(await f.service.enableTrustedHooks(f.source), false);
  assert.equal((await f.git(['config', 'core.hooksPath'])).stdout.trim(), 'my-hooks');
});
