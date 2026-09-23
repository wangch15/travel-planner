const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {VersionStore}=require('../version-store.cjs');
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'travel-versions-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));return {root,store:new VersionStore(root),target:{root:'/sample/project',slug:'coast'}};}
const draft={baselineDigest:'baseline',originalSource:'initial',proposedSource:'next',selectedKeys:['1:title'],kind:'save',label:'Adjust title',contextDigest:'context',createdAt:'2026-09-22T00:00:00.000Z'};
test('initial version, save and restore survive restart, retain history and isolate targets',async t=>{
 const {root,store,target}=await fixture(t);assert.deepEqual(await store.read(target),{version:1,revisions:[],draft:null,intent:null});
 const initial=await store.observe(target,{source:'initial',contextDigest:'context'});assert.equal(initial.number,1);assert.equal(initial.kind,'initial');
 assert.equal((await store.observe(target,{source:'initial',contextDigest:'context'})).id,initial.id);
 await store.saveDraft(target,draft);
 const save=await store.prepare(target,{beforeSource:'initial',afterSource:'next',contextDigest:'context',label:'Title',kind:'save'});
 assert.equal((await store.finish(target,save,'next')).number,2);assert.equal((await store.read(target)).draft,null);assert.equal((await store.finish(target,save,'next')).number,2);
 const restore=await store.prepare(target,{beforeSource:'next',afterSource:'initial',contextDigest:'context',label:'Restore V1',kind:'restore'});
 await store.finish(target,restore,'initial');const state=await new VersionStore(root).read(target);assert.deepEqual(state.revisions.map(r=>r.source),['initial','next','initial']);assert.equal(state.revisions[2].kind,'restore');assert.equal(state.intent,null);
 assert.equal((await store.read({...target,slug:'other'})).revisions.length,0);assert.equal((await store.read({...target,root:'/another/project'})).revisions.length,0);
 assert.equal((await fs.stat(store.filename(target))).mode&0o777,0o600);
});
test('draft survives restart without any preview receipt and concurrent writes serialize',async t=>{
 const {root,store,target}=await fixture(t);await Promise.all([store.observe(target,{source:'initial',contextDigest:'context'}),store.saveDraft(target,draft)]);
 assert.deepEqual((await new VersionStore(root).read(target)).draft,draft);
 await assert.rejects(store.saveDraft(target,{...draft,previewViewed:true}),{code:'VERSION_STORE_INVALID'});
 assert.deepEqual((await store.read(target)).draft,draft);await store.saveDraft(target,null);assert.equal((await store.read(target)).draft,null);
});
test('interrupted writes reconcile committed and uncommitted intents, divergent data fails closed',async t=>{
 const {root,store,target}=await fixture(t);await store.observe(target,{source:'initial',contextDigest:'context'});
 await store.prepare(target,{beforeSource:'initial',afterSource:'next',contextDigest:'context',label:'Save',kind:'save'});
 const restarted=new VersionStore(root);await restarted.observe(target,{source:'initial',contextDigest:'context'});assert.equal((await restarted.read(target)).intent,null);
 const id=await restarted.prepare(target,{beforeSource:'initial',afterSource:'next',contextDigest:'context',label:'Save',kind:'save'});
 await assert.rejects(restarted.observe(target,{source:'third',contextDigest:'context'}),{code:'VERSION_RECONCILIATION_REQUIRED'});
 await assert.rejects(restarted.observe(target,{source:'next',contextDigest:'different'}),{code:'VERSION_RECONCILIATION_REQUIRED'});assert.equal((await restarted.read(target)).intent.id,id);
 const recovered=await new VersionStore(root).observe(target,{source:'next',contextDigest:'context'});assert.equal(recovered.id,id);assert.equal(recovered.number,2);
});
test('external edits create a version and stale prepare or wrong finish never overwrite history',async t=>{
 const {store,target}=await fixture(t);await store.observe(target,{source:'initial',contextDigest:'context'});
 const external=await store.observe(target,{source:'external',contextDigest:'context'});assert.equal(external.kind,'external');
 await assert.rejects(store.prepare(target,{beforeSource:'initial',afterSource:'next',contextDigest:'context',label:'Save',kind:'save'}),{code:'VERSION_CONFLICT'});
 const id=await store.prepare(target,{beforeSource:'external',afterSource:'next',contextDigest:'context',label:'Save',kind:'save'});
 await assert.rejects(store.finish(target,id,'wrong'),{code:'VERSION_CONFLICT'});assert.equal((await store.read(target)).revisions.length,2);
});
test('corrupt state and source hash mismatch fail closed preserving bytes',async t=>{
 const {store,target}=await fixture(t);await store.observe(target,{source:'initial',contextDigest:'context'});const file=store.filename(target);
 const state=await store.read(target);state.revisions[0].source='tampered';const bytes=JSON.stringify(state);await fs.writeFile(file,bytes);
 await assert.rejects(store.read(target),{code:'VERSION_STORE_INVALID'});await assert.rejects(store.saveDraft(target,null),{code:'VERSION_STORE_INVALID'});assert.equal(await fs.readFile(file,'utf8'),bytes);
 await fs.writeFile(file,'broken');await assert.rejects(store.read(target),{code:'VERSION_STORE_INVALID'});
});
test('rejects linked files, linked store directory and parent replacement',async t=>{
 const {root,store,target}=await fixture(t);await store.observe(target,{source:'initial',contextDigest:'context'});const file=store.filename(target);const other=path.join(root,'other');await fs.writeFile(other,'private');await fs.unlink(file);await fs.symlink(other,file);
 await assert.rejects(store.saveDraft(target,draft),{code:'VERSION_STORE_INVALID'});assert.equal(await fs.readFile(other,'utf8'),'private');await fs.unlink(file);await fs.link(other,file);await assert.rejects(store.read(target),{code:'VERSION_STORE_INVALID'});await fs.unlink(file);
 const moved=path.join(root,'moved');await fs.rename(path.dirname(file),moved);await fs.symlink(moved,path.dirname(file));await assert.rejects(store.read(target),{code:'VERSION_STORE_INVALID'});
 await fs.unlink(path.dirname(file));await fs.mkdir(path.dirname(file));await assert.rejects(store.saveDraft(target,draft),{code:'VERSION_STORE_INVALID'});
});
test('bounds source and revision count before modifying saved state',async t=>{
 const {store,target}=await fixture(t);await assert.rejects(store.observe(target,{source:'x'.repeat(4*1024*1024+1),contextDigest:'context'}),{code:'VERSION_LIMIT'});
 for(let i=0;i<100;i++)await store.observe(target,{source:String(i),contextDigest:'context'});
 await assert.rejects(store.observe(target,{source:'extra',contextDigest:'context'}),{code:'VERSION_LIMIT'});assert.equal((await store.read(target)).revisions.length,100);
});
test('parent swap during a pending write is rejected before writing into the replacement',async t=>{
 const {root,store,target}=await fixture(t);await store.observe(target,{source:'initial',contextDigest:'context'});const originalOpen=fs.open;const moved=path.join(root,'old-versions');let swapped=false;
 fs.open=async function(file,...args){const handle=await originalOpen.call(this,file,...args);if(typeof file==='string'&&path.basename(file).startsWith('.version-')&&!swapped){swapped=true;await fs.rename(store.directory,moved);await fs.mkdir(store.directory);await fs.writeFile(store.filename(target),'replacement-owned');}return handle;};
 try{await assert.rejects(store.saveDraft(target,draft),{code:'VERSION_STORE_INVALID'});}finally{fs.open=originalOpen;}
 assert.equal(await fs.readFile(store.filename(target),'utf8'),'replacement-owned');const oldState=JSON.parse(await fs.readFile(path.join(moved,path.basename(store.filename(target))),'utf8'));assert.equal(oldState.draft,null);assert.equal(oldState.revisions[0].source,'initial');
});
test('replacement of the containing app directory is rejected even when store has not yet been created',async t=>{
 const {root,target}=await fixture(t);const parent=path.join(root,'app-data');await fs.mkdir(parent);const store=new VersionStore(parent);await store.read(target);await fs.rename(parent,path.join(root,'old-app-data'));await fs.mkdir(parent);
 await assert.rejects(store.saveDraft(target,draft),{code:'VERSION_STORE_INVALID'});assert.deepEqual(await fs.readdir(parent),[]);
});
test('POSIX mutations sync the containing directory and renamed journal before returning', {skip:process.platform==='win32'},async t=>{
 const {store,target}=await fixture(t);const originalOpen=fs.open;const synced=[];
 fs.open=async function(file,...args){const handle=await originalOpen.call(this,file,...args);const originalSync=handle.sync.bind(handle);handle.sync=async()=>{synced.push(file);return originalSync();};return handle;};
 try{await store.observe(target,{source:'initial',contextDigest:'context'});}finally{fs.open=originalOpen;}
 assert.equal(synced[0],store.parent);assert.match(path.basename(synced[1]),/^\.version-.*\.tmp$/);assert.equal(synced[2],store.directory);
});
test('POSIX directory sync failure prevents prepare success and host source mutation', {skip:process.platform==='win32'},async t=>{
 const {store,target}=await fixture(t);await store.observe(target,{source:'initial',contextDigest:'context'});const originalOpen=fs.open;let hostSource='initial';let reachedDirectorySync=false;
 fs.open=async function(file,...args){const handle=await originalOpen.call(this,file,...args);if(file===store.directory){handle.sync=async()=>{reachedDirectorySync=true;throw Object.assign(Error('directory I/O failure'),{code:'EIO'});};}return handle;};
 try{await assert.rejects((async()=>{await store.prepare(target,{beforeSource:hostSource,afterSource:'next',contextDigest:'context',label:'Save',kind:'save'});hostSource='next';})(),{code:'VERSION_STORE_INVALID'});}finally{fs.open=originalOpen;}
 assert.equal(reachedDirectorySync,true);assert.equal(hostSource,'initial');assert.ok((await store.read(target)).intent);
 await store.observe(target,{source:hostSource,contextDigest:'context'});assert.equal((await store.read(target)).intent,null);
});
test('POSIX parent entry sync failure does not report initial version success', {skip:process.platform==='win32'},async t=>{
 const {store,target}=await fixture(t);const originalOpen=fs.open;
 fs.open=async function(file,...args){const handle=await originalOpen.call(this,file,...args);if(file===store.parent)handle.sync=async()=>{throw Object.assign(Error('parent I/O failure'),{code:'EIO'});};return handle;};
 try{await assert.rejects(store.observe(target,{source:'initial',contextDigest:'context'}),{code:'VERSION_STORE_INVALID'});}finally{fs.open=originalOpen;}
 assert.equal((await store.read(target)).revisions.length,0);assert.equal((await store.observe(target,{source:'initial',contextDigest:'context'})).number,1);
});
