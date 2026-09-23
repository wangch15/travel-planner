const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const sync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PublishingService } = require('../services/publishing.cjs');
const account = 'a'.repeat(32), version = '11111111-1111-1111-1111-111111111111';
const remote = () => ({ id: 'deployment-one', created_on: '2026-09-22T00:00:00.000Z', versions: [{ version_id: version, percentage: 100 }] });
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tp-publish-'))); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const state = { digest: 'digest-one', latest: null, account, calls: [], failDeploy: false, uploaded: null };
  const loadPreview = async () => ({ digest: state.digest, snapshot: { trip: { config: { title: 'Sample', deploy: { target: 'workers', name: 'sample-trip' } } }, photos: { sample: [{ src: 'img/sample-1.jpg' }] } },
    read: name => name === '/index.html' ? { body: '<html>immutable preview</html>', type: 'text/html; charset=utf-8' } : name === '/img/sample-1.jpg' ? { body: Buffer.from([1,2,3]), type: 'image/jpeg' } : null });
  const runWrangler = (args, options) => {
    state.calls.push(args);
    if (args[0] === 'whoami') return { status: 0, stdout: JSON.stringify({ loggedIn: true, accounts: state.accounts || [{ id: state.account, name: 'Sample account' }] }) };
    if (args[0] === 'deployments') return state.latest ? { status: 0, stdout: JSON.stringify([state.latest]) } : { status: 1, stderr: `(/accounts/${options.env.CLOUDFLARE_ACCOUNT_ID || state.account}/workers/scripts/sample-trip/deployments) [code: 10007]` };
    if (args[0] === 'deploy') {
      const out = path.dirname(args[args.indexOf('--config') + 1]);
      state.uploaded = sync.readdirSync(path.join(out, 'site')).sort();
      const config = JSON.parse(sync.readFileSync(path.join(out, 'wrangler.json'), 'utf8'));
      assert.deepEqual(config.assets, { directory: './site' }); assert.equal(config.main, undefined);
      assert.equal(sync.readFileSync(path.join(out, 'site/index.html'), 'utf8'), '<html>immutable preview</html>');
      if (state.failDeploy) return { status: 1, stderr: 'network timed out' };
      state.latest = remote(); return { status: 0, stdout: `https://sample-trip.test.workers.dev\nCurrent Version ID: ${version}\n` };
    }
    throw Error('unexpected command');
  };
  const service = new PublishingService(root, { loadPreview, runWrangler: async (...args) => runWrangler(...args), env: {} });
  return { root, state, service, input: { root, slug: 'sample', previewSeen: true, previewDigest: state.digest } };
}
test('publishes only immutable application output after preview and double remote checks', async t => {
  const f = await fixture(t), p = await f.service.prepare(f.input);
  assert.equal(p.firstPublish, true); assert.match(p.warning, /密碼保護/);
  assert.equal(f.state.calls.some(args => args[0] === 'deploy'), false);
  const result = await f.service.confirm(p.token, f.input);
  assert.equal(result.published, true); assert.equal(result.backedUp, false);
  assert.equal(result.url, 'https://sample-trip.test.workers.dev');
  assert.deepEqual(f.state.uploaded, ['_headers', 'img', 'index.html', 'robots.txt']);
  assert.ok(f.state.calls.filter(args => args[0] === 'whoami').length >= 3);
  await assert.rejects(() => f.service.confirm(p.token, f.input), { code: 'STALE_CONFIRMATION' });
  const next = await f.service.prepare(f.input); assert.equal(next.previousUrl, result.url);
});
test('preview, source, and account changes invalidate publication', async t => {
  const f = await fixture(t);
  await assert.rejects(() => f.service.prepare({ ...f.input, previewSeen: false }), { code: 'PREVIEW_REQUIRED' });
  let p = await f.service.prepare(f.input); f.state.digest = 'changed';
  let r = await f.service.confirm(p.token, f.input); assert.equal(r.code, 'CONTENT_CHANGED');
  f.state.digest = f.input.previewDigest; p = await f.service.prepare(f.input); f.state.account = 'b'.repeat(32);
  r = await f.service.confirm(p.token, f.input); assert.equal(r.code, 'REMOTE_CHANGED');
  assert.equal(f.state.calls.some(args => args[0] === 'deploy'), false);
});
test('existing Worker requires explicit adoption; adoption itself never deploys', async t => {
  const f = await fixture(t); f.state.latest = remote();
  await assert.rejects(() => f.service.prepare(f.input), { code: 'ADOPTION_REQUIRED' });
  const adoption = await f.service.prepareAdoption(f.input);
  assert.equal(adoption.versionId, version);
  assert.equal((await f.service.confirmAdoption(adoption.token)).adopted, true);
  assert.equal(f.state.calls.some(args => args[0] === 'deploy'), false);
  const prepared = await f.service.prepare(f.input); assert.equal(prepared.firstPublish, false);
  assert.equal((await f.service.confirm(prepared.token, f.input)).published, true);
});
test('adoption refuses remote changes and publication failure does not claim success or retry', async t => {
  const f = await fixture(t); f.state.latest = remote();
  const a = await f.service.prepareAdoption(f.input); f.state.latest = { ...remote(), id: 'other-deployment' };
  await assert.rejects(() => f.service.confirmAdoption(a.token), { code: 'REMOTE_CHANGED' });
  f.state.latest = null; const p = await f.service.prepare(f.input); f.state.failDeploy = true;
  const result = await f.service.confirm(p.token, f.input); assert.equal(result.published, false);
  assert.equal(f.state.calls.filter(args => args[0] === 'deploy').length, 1);
  assert.match(result.message, /不要直接重試/);
});
test('symlink receipt directories are rejected before publication', async t => {
  const f = await fixture(t);
  const { createHash } = require('node:crypto'); const key = createHash('sha256').update(f.root).digest('hex');
  await fs.mkdir(path.join(f.root, 'publishing'), { recursive: true });
  await fs.symlink(f.root, path.join(f.root, 'publishing', key));
  await assert.rejects(() => f.service.prepare(f.input), { code: 'UNSAFE_PATH' });
  assert.equal(f.state.calls.some(args => args[0] === 'deploy'), false);
});

test('multiple Cloudflare accounts require selection and changing it invalidates confirmation', async t => {
  const f = await fixture(t), other = 'b'.repeat(32);
  f.state.accounts = [{ id: account, name: 'First' }, { id: other, name: 'Second', token: 'PRIVATE_TOKEN' }];
  const result = await f.service.accounts(); assert.equal(result.accounts.length, 2); assert.equal(result.selectedAccountId, null);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_TOKEN/);
  await assert.rejects(f.service.prepare(f.input), /多個帳號/);
  assert.deepEqual(f.service.setAccount(account), { selectedAccountId: account });
  const first = await f.service.prepare(f.input); assert.equal(first.accountId, account);
  f.service.setAccount(other);
  await assert.rejects(f.service.confirm(first.token, f.input), { code: 'STALE_CONFIRMATION' });
  const next = await f.service.prepare(f.input); assert.equal(next.accountId, other);
  f.state.accounts = [{ id: account, name: 'First' }];
  const failed = await f.service.confirm(next.token, f.input); assert.equal(failed.published, false);
  assert.equal(f.state.calls.some(args => args[0] === 'deploy'), false);
  assert.throws(() => f.service.setAccount('../account'), { code: 'INVALID_ACCOUNT' });
});
