const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ProjectUpdateService, migrateWithAppScripts } = require('../services/project-update.cjs');
const { TRUSTED_FILES } = require('../services/backup.cjs');

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function write(root, files) { for (const [name, text] of Object.entries(files)) { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); } }
const changelog = versions => '# 變更紀錄\n\n' + versions.map(v => `## ${v}（2026-09-24）\n\n- 更新 ${v}\n- 資料需要 migrate：否。\n`).join('\n');
const trusted = tag => Object.fromEntries(TRUSTED_FILES.map(f => [f, `// ${tag} ${f}\n`]));

// 建立「上游模板」與一份照 README 流程取得的私人專案。
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-update-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const upstream = path.join(root, 'upstream'), project = path.join(root, 'project'), app = path.join(root, 'app');
  fs.mkdirSync(upstream);
  git(upstream, 'init', '-q');
  write(upstream, { 'package.json': '{"version":"1.0.0"}\n', 'CHANGELOG.md': changelog(['1.0.0']), 'src/app.js': 'one\n', 'trips/_example/trip.config.json': '{"schemaVersion":1}\n', ...trusted('v1') });
  git(upstream, 'add', '-A'); git(upstream, 'commit', '-qm', 'v1');
  git(root, 'clone', '-q', upstream, project); git(project, 'remote', 'rename', 'origin', 'upstream');
  git(project, 'config', 'user.name', 'Owner'); git(project, 'config', 'user.email', 'owner@example.invalid');
  write(project, { 'trips/my-trip/trip.config.json': '{"schemaVersion":1}\n', 'trips/my-trip/data.js': 'DAYS=[]\n' });
  git(project, 'add', '-A'); git(project, 'commit', '-qm', 'my trip');
  // 模板出新版：1.1.0，保護程式也改了
  write(upstream, { 'package.json': '{"version":"1.1.0"}\n', 'CHANGELOG.md': changelog(['1.1.0', '1.0.0']), 'src/app.js': 'one\ntwo\n', ...trusted('v2') });
  git(upstream, 'commit', '-qam', 'v2');
  const v2 = git(upstream, 'rev-parse', 'HEAD');
  // App 內建的是 v2
  write(app, { 'package.json': '{"version":"1.1.0"}\n', ...trusted('v2') });
  const service = new ProjectUpdateService({ trustedRoot: app, appCommit: v2, engineVersion: '1.1.0', templatePattern: /.*/ });
  return { root, upstream, project, app, v2, service };
}

test('an older project is updated to the App engine without touching the trip', async t => {
  const { project, service, v2 } = fixture(t);
  fs.writeFileSync(path.join(project, 'trips/my-trip/data.js'), 'DAYS=[1]\n'); // 未提交的行程修改可以保留
  const before = await service.status(project);
  assert.equal(before.state, 'update-available'); assert.equal(before.trusted, false);
  const plan = await service.prepare(project);
  assert.equal(plan.fromVersion, '1.0.0'); assert.equal(plan.toVersion, '1.1.0'); assert.equal(plan.alignedWithApp, true);
  assert.deepEqual(plan.highlights.map(h => h.version), ['1.1.0']);
  const result = await service.confirm(plan.token, { migrate: () => { throw Error('no migrate expected'); } });
  assert.equal(result.merged, true); assert.equal(result.status.state, 'current'); assert.equal(result.status.trusted, true);
  assert.equal(git(project, 'merge-base', '--is-ancestor', v2, 'HEAD'), '');
  assert.equal(fs.readFileSync(path.join(project, 'trips/my-trip/data.js'), 'utf8'), 'DAYS=[1]\n');
});

test('the project is aligned to the App commit, not a newer upstream', async t => {
  const { project, upstream, service, v2 } = fixture(t);
  write(upstream, { 'src/app.js': 'one\ntwo\nthree\n', 'package.json': '{"version":"1.2.0"}\n' }); git(upstream, 'commit', '-qam', 'v3');
  const plan = await service.prepare(project);
  assert.equal(plan.toVersion, '1.1.0');
  await service.confirm(plan.token, { migrate: () => ({}) });
  assert.equal(git(project, 'rev-parse', 'HEAD^2'), v2);
});

test('conflicting engine edits are refused before anything changes', async t => {
  const { project, service } = fixture(t);
  write(project, { 'src/app.js': 'mine\n' }); git(project, 'commit', '-qam', 'local engine edit');
  const head = git(project, 'rev-parse', 'HEAD');
  await assert.rejects(service.prepare(project), { code: 'UPDATE_CONFLICTS' });
  assert.equal(git(project, 'rev-parse', 'HEAD'), head);
});

test('uncommitted engine edits block the update; trip edits do not', async t => {
  const { project, service } = fixture(t);
  write(project, { 'src/app.js': 'dirty\n' });
  await assert.rejects(service.prepare(project), { code: 'ENGINE_FILES_CHANGED' });
});

test('an upstream change inside a user trip folder is never merged', async t => {
  const { project, upstream, service } = fixture(t);
  write(upstream, { 'trips/my-trip/extra.txt': 'x\n' }); git(upstream, 'add', '-A'); git(upstream, 'commit', '-qm', 'bad');
  const s = new ProjectUpdateService({ trustedRoot: service.trustedRoot, appCommit: null, engineVersion: '1.1.0', templatePattern: /.*/ });
  await assert.rejects(s.prepare(project), { code: 'UPDATE_TOUCHES_TRIPS' });
});

test('a project newer than the App asks for an App update', async t => {
  const { project, app } = fixture(t);
  const s = new ProjectUpdateService({ trustedRoot: app, engineVersion: '0.9.0', templatePattern: /.*/ });
  await assert.rejects(s.prepare(project), { code: 'APP_UPDATE_REQUIRED' });
});

test('a project without the official upstream is refused', async t => {
  const { project, app } = fixture(t);
  const s = new ProjectUpdateService({ trustedRoot: app, engineVersion: '1.1.0' });
  await assert.rejects(s.prepare(project), { code: 'UPSTREAM_REQUIRED' });
});

test('App migrate scripts upgrade an old trip config', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const scripts = path.join(dir, 'scripts'); fs.mkdirSync(scripts);
  fs.writeFileSync(path.join(scripts, '0-to-1.js'), "const fs=require('fs'),p=require('path');module.exports={migrate(d){fs.writeFileSync(p.join(d,'trip.config.json'),JSON.stringify({schemaVersion:1}));return ['done'];}};");
  const trip = path.join(dir, 'trip'); fs.mkdirSync(trip); fs.writeFileSync(path.join(trip, 'trip.config.json'), '{}');
  assert.deepEqual(migrateWithAppScripts(trip, scripts).steps, [{ step: '0 → 1', notes: ['done'] }]);
});
