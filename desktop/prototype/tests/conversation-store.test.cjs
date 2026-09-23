const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {ConversationStore}=require('../conversation-store.cjs');
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'travel-chat-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));return {root,store:new ConversationStore(root),target:{root:'/sample/project',slug:'coast'}};}
test('persists conversation, preferences and thread across instances, isolated by root and trip',async t=>{
 const {root,store,target}=await fixture(t);
 await store.update(target,s=>{s.draft='明天慢一點';s.model='model';s.messages.push({role:'user',text:'第一個想法'});s.thread={id:'thread',accountKey:'account',lastTurnId:'turn'};s.run={id:'request',status:'pending'};});
 const state=await new ConversationStore(root).read(target);assert.equal(state.draft,'明天慢一點');assert.equal(state.messages[0].text,'第一個想法');assert.equal(state.run.status,'pending');assert.equal(state.thread.id,'thread');
 assert.equal((await store.read({...target,slug:'mountain'})).messages.length,0);
 assert.equal((await store.read({...target,root:'/another/project'})).messages.length,0);
});
test('persists stop intent and confirmation but rejects malformed stop flags',async t=>{
 const {root,store,target}=await fixture(t);
 await store.update(target,s=>{s.run={id:'request',status:'stopped',stopRequested:true,stopConfirmed:true};});
 assert.deepEqual((await new ConversationStore(root).read(target)).run,{id:'request',status:'stopped',stopRequested:true,stopConfirmed:true});
 await assert.rejects(store.update(target,s=>{s.run.stopConfirmed='yes';}),{code:'CONVERSATION_STORE_INVALID'});
});
test('serialized mutations preserve simultaneous draft and reply writes',async t=>{
 const {store,target}=await fixture(t);
 await Promise.all([store.update(target,s=>{s.draft='draft';}),store.update(target,s=>{s.messages.push({role:'assistant',text:'reply'});})]);
 const state=await store.read(target);assert.equal(state.draft,'draft');assert.equal(state.messages.length,1);
});
test('corrupt, symlinked and oversized state fails closed without overwriting',async t=>{
 const {root,store,target}=await fixture(t);await store.update(target,s=>{s.draft='saved';});
 const dir=path.join(root,'conversations');const file=path.join(dir,(await fs.readdir(dir))[0]);
 await fs.writeFile(file,'broken');await assert.rejects(store.read(target));await assert.rejects(store.update(target,s=>{s.draft='replacement';}));assert.equal(await fs.readFile(file,'utf8'),'broken');
 await fs.unlink(file);const outside=path.join(root,'outside');await fs.writeFile(outside,'private');await fs.symlink(outside,file);await assert.rejects(store.read(target));await assert.rejects(store.update(target,s=>{}));assert.equal(await fs.readFile(outside,'utf8'),'private');
});
test('refuses linked parent and invalid/oversized records',async t=>{
 const {root,store,target}=await fixture(t);await assert.rejects(store.update(target,s=>{s.draft='x'.repeat(2001);}));
 await fs.mkdir(path.join(root,'other'));await fs.symlink(path.join(root,'other'),path.join(root,'conversations'));
 await assert.rejects(store.update(target,s=>{s.draft='secret';}));
});
