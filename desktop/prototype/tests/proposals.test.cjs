const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseLiteralModule } = require('@travel-planner/engine');
const { ProposalStore } = require('../proposals.cjs');
const { buildPreview } = require('../preview.cjs');

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'travel-proposal-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp(path.resolve(__dirname, '../../../trips/_example'), path.join(root, 'trips/sample'), { recursive: true });
  const baseline = await buildPreview(root, 'sample');
  const day = parseLiteralModule(baseline.snapshot.dataSource).DAYS[0];
  const target = { projectId: 'fixture-project', root, slug: 'sample' };
  const store = new ProposalStore(path.join(root, 'app-state'), { checkPrivate: async () => {} });
  return { root, baseline, day, target, store, sourceFile: path.join(root, 'trips/sample/data.js') };
}
test('proposal requires its preview, saves only selected day and keeps a local backup', async t => {
  const f = await fixture(t);
  const proposed = f.store.create(f.target, f.baseline, f.day.id, { summary: '調整標題', replacementDay: { ...f.day, title: '悠閒出發' } });
  await assert.rejects(f.store.apply(proposed.id, f.target), { code: 'PREVIEW_REQUIRED' });
  assert.equal(await fs.readFile(f.sourceFile, 'utf8'), f.baseline.snapshot.dataSource);
  f.store.markViewed('travel-preview://wrong/index.html');
  await assert.rejects(f.store.apply(proposed.id, f.target), { code: 'PREVIEW_REQUIRED' });
  f.store.markViewed(proposed.previewUrl);
  const result = await f.store.apply(proposed.id, f.target);
  assert.equal(result.saved, true); assert.equal(result.backedUp, false);
  const after = parseLiteralModule(await fs.readFile(f.sourceFile, 'utf8'));
  assert.equal(after.DAYS[0].title, '悠閒出發');
  assert.deepEqual(after.DAYS.slice(1), parseLiteralModule(f.baseline.snapshot.dataSource).DAYS.slice(1));
  assert.equal(await fs.readFile(path.join(f.root, 'app-state/backups', `${result.backupId}.js`), 'utf8'), f.baseline.snapshot.dataSource);
  await assert.rejects(f.store.apply(proposed.id, f.target), { code: 'STALE_PROPOSAL' });
});
test('concurrent source changes are preserved and stale proposal cannot overwrite them', async t => {
  const f = await fixture(t);
  const proposed = f.store.create(f.target, f.baseline, f.day.id, { summary: 'title', replacementDay: { ...f.day, title: 'Candidate' } });
  f.store.markViewed(proposed.previewUrl);
  const changed = f.baseline.snapshot.dataSource + '\n// external edit\n';
  await fs.writeFile(f.sourceFile, changed);
  await assert.rejects(f.store.apply(proposed.id, f.target), { code: 'CONTENT_CHANGED' });
  assert.equal(await fs.readFile(f.sourceFile, 'utf8'), changed);
});
test('routing changes stay proposals until source and feasibility research is available', async t => {
  const f = await fixture(t);
  const day = structuredClone(f.day); day.stops[0].time = '12:30';
  const proposed = f.store.create(f.target, f.baseline, day.id, { summary: 'time', replacementDay: day });
  assert.equal(proposed.requiresResearch, true);
  f.store.markViewed(proposed.previewUrl);
  await assert.rejects(f.store.apply(proposed.id, f.target), { code: 'RESEARCH_REQUIRED' });
});
test('private-repo guard and exact target identity remain required after preview', async t => {
  const f = await fixture(t);
  const store = new ProposalStore(path.join(f.root, 'state'), { checkPrivate: async () => { throw Object.assign(Error('private'), {code:'PRIVATE_REPO_REQUIRED'}); } });
  const proposal = store.create(f.target, f.baseline, f.day.id, { summary: 'title', replacementDay: { ...f.day, title: 'Candidate' } });
  store.markViewed(proposal.previewUrl);
  await assert.rejects(store.apply(proposal.id, { ...f.target, projectId:'other' }), { code:'STALE_PROPOSAL' });
  await assert.rejects(store.apply(proposal.id, f.target), { code:'PRIVATE_REPO_REQUIRED' });
  assert.equal(await fs.readFile(f.sourceFile,'utf8'), f.baseline.snapshot.dataSource);
});

function viewedProposal(f) {
  const proposal = f.store.create(f.target, f.baseline, f.day.id, { summary: 'title', replacementDay: { ...f.day, title: 'Candidate' } });
  f.store.markViewed(proposal.previewUrl);
  return proposal;
}

test('status symlink swapped after inspection never appends to an unrelated file', async t => {
  const f = await fixture(t); const proposal = viewedProposal(f);
  const status = path.join(f.root, 'trips/sample/docs/status.md');
  const unrelated = path.join(f.root, 'unrelated.md');
  await fs.writeFile(unrelated, 'Keep this note');
  const lstat = fs.lstat; let swapped = false;
  t.mock.method(fs, 'lstat', async (...args) => {
    const result = await lstat(...args);
    if (args[0] === status && !swapped) {
      swapped = true; await fs.unlink(status); await fs.symlink(unrelated, status);
    }
    return result;
  });
  const result = await f.store.apply(proposal.id, f.target);
  assert.equal(swapped, true);
  assert.equal(await fs.readFile(unrelated, 'utf8'), 'Keep this note');
  assert.equal(result.saved, true); assert.equal(result.statusUpdated, false);
});

for (const replacement of ['regular-file', 'hard-link', 'docs-directory']) {
  test(`status ${replacement} replacement after inspection is rejected`, async t => {
    const f = await fixture(t); const proposal = viewedProposal(f);
    const docs = path.join(f.root, 'trips/sample/docs');
    const status = path.join(docs, 'status.md');
    const outside = path.join(f.root, 'unrelated-docs');
    await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'status.md'), 'Keep this note');
    const lstat = fs.lstat; let swapped = false;
    t.mock.method(fs, 'lstat', async (...args) => {
      const result = await lstat(...args);
      if (args[0] === status && !swapped) {
        swapped = true;
        if (replacement === 'docs-directory') {
          await fs.rename(docs, docs + '.original'); await fs.symlink(outside, docs);
        } else {
          await fs.rename(status, status + '.original');
          if (replacement === 'hard-link') await fs.link(path.join(outside, 'status.md'), status);
          else await fs.writeFile(status, 'Keep this note');
        }
      }
      return result;
    });
    const result = await f.store.apply(proposal.id, f.target);
    assert.equal(swapped, true);
    assert.equal(await fs.readFile(status, 'utf8'), 'Keep this note');
    assert.equal(await fs.readFile(path.join(outside, 'status.md'), 'utf8'), 'Keep this note');
    assert.equal(result.saved, true); assert.equal(result.statusUpdated, false);
  });
}

test('a pre-existing proposal temporary file is never removed on exclusive-open failure', async t => {
  const f = await fixture(t); const proposal = viewedProposal(f);
  const temporary = path.join(path.dirname(f.sourceFile), `.data-${proposal.id}.tmp`);
  await fs.writeFile(temporary, 'Another writer owns this');
  await assert.rejects(f.store.apply(proposal.id, f.target), { code: 'EEXIST' });
  assert.equal(await fs.readFile(temporary, 'utf8'), 'Another writer owns this');
  assert.equal(await fs.readFile(f.sourceFile, 'utf8'), f.baseline.snapshot.dataSource);
});

test('a replaced proposal temporary file is neither promoted nor removed', async t => {
  const f = await fixture(t); const proposal = viewedProposal(f);
  const temporary = path.join(path.dirname(f.sourceFile), `.data-${proposal.id}.tmp`);
  const open = fs.open; let swapped = false;
  t.mock.method(fs, 'open', async (...args) => {
    const handle = await open(...args);
    if (args[0] === temporary) {
      const close = handle.close.bind(handle);
      handle.close = async () => {
        await close(); await fs.rename(temporary, temporary + '.owned');
        await fs.writeFile(temporary, 'Replacement'); swapped = true;
      };
    }
    return handle;
  });
  await assert.rejects(f.store.apply(proposal.id, f.target));
  assert.equal(swapped, true);
  assert.equal(await fs.readFile(temporary, 'utf8'), 'Replacement');
  assert.equal(await fs.readFile(f.sourceFile, 'utf8'), f.baseline.snapshot.dataSource);
});

test('selective acceptance preserves unselected fields and invalidates the old preview receipt',async t=>{
 const f=await fixture(t);const proposed=f.store.create(f.target,f.baseline,f.day.id,{summary:'title and lead',replacementDay:{...f.day,title:'New title',lead:'New lead'}});
 assert.equal(proposed.changes.length,2);f.store.markViewed(proposed.previewUrl);
 const selected=f.store.select(proposed.id,[`${f.day.id}:title`]);assert.notEqual(selected.id,proposed.id);
 await assert.rejects(f.store.apply(selected.id,f.target),{code:'PREVIEW_REQUIRED'});
 f.store.markViewed(selected.previewUrl);await f.store.apply(selected.id,f.target);
 const after=parseLiteralModule(await fs.readFile(f.sourceFile,'utf8')).DAYS[0];assert.equal(after.title,'New title');assert.equal(after.lead,f.day.lead);
});
test('excluding route changes allows validated text-only save; selecting nothing cannot save',async t=>{
 const f=await fixture(t),day=structuredClone(f.day);day.title='New title';day.stops[0].time='12:30';
 const proposed=f.store.create(f.target,f.baseline,day.id,{summary:'mixed',replacementDay:day});assert.equal(proposed.requiresResearch,true);
 const empty=f.store.select(proposed.id,[]);f.store.markViewed(empty.previewUrl);await assert.rejects(f.store.apply(empty.id,f.target),{code:'EMPTY_SELECTION'});
 const text=f.store.select(empty.id,[`${day.id}:title`]);assert.equal(text.requiresResearch,false);f.store.markViewed(text.previewUrl);await f.store.apply(text.id,f.target);
 assert.deepEqual(parseLiteralModule(await fs.readFile(f.sourceFile,'utf8')).DAYS[0].stops,f.day.stops);
});
test('historical full source rollback restores exact bytes after preview without deleting newer content from host history',async t=>{
 const f=await fixture(t);const proposed=viewedProposal(f);await f.store.apply(proposed.id,f.target);
 const changed=await buildPreview(f.root,'sample');
 const rollback=f.store.createSource(f.target,changed,f.baseline.snapshot.dataSource,{kind:'restore',label:'回復 V1'});
 assert.equal(rollback.kind,'restore');assert.equal(rollback.requiresResearch,false);
 await assert.rejects(f.store.apply(rollback.id,f.target),{code:'PREVIEW_REQUIRED'});
 f.store.markViewed(rollback.previewUrl);await f.store.apply(rollback.id,f.target);
 assert.equal(await fs.readFile(f.sourceFile,'utf8'),f.baseline.snapshot.dataSource);
});
test('history write intent failure prevents file write, while receipt failure reports saved separately',async t=>{
 const f=await fixture(t);const p=viewedProposal(f);f.store.beforeWrite=async()=>{throw Error('history disk full');};
 await assert.rejects(f.store.apply(p.id,f.target),/history disk full/);assert.equal(await fs.readFile(f.sourceFile,'utf8'),f.baseline.snapshot.dataSource);
 f.store.beforeWrite=async()=> 'intent';f.store.afterWrite=async()=>{throw Error('receipt disk full');};
 const saved=await f.store.apply(p.id,f.target);assert.equal(saved.saved,true);assert.equal(saved.versionRecorded,false);assert.equal(parseLiteralModule(await fs.readFile(f.sourceFile,'utf8')).DAYS[0].title,'Candidate');
});
