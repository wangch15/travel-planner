const {test}=require('node:test'),assert=require('node:assert/strict');const {JobController,nextQuotaCheck}=require('../services/jobs.cjs');
function fixture(){let state={};return {store:{read:async()=>structuredClone(state),update:async(t,fn)=>{const next=structuredClone(state);fn(next);state=next;}},target:{root:'/fake',slug:'trip'}};}
test('quota waiting requires explicit opt-in and same account/source, never percentages alone',async()=>{const f=fixture();let now=1000;const c=new JobController(f.store,{now:()=>now});const j=await c.begin(f.target,{input:{text:'request',mode:'edit-all',dayId:-1},accountKey:'one',baselineDigest:'a'});await c.fail(f.target,j.id,'QUOTA_UNAVAILABLE');now=100000;assert.equal(await c.poll(f.target,{accountKey:'one',baselineDigest:'a',limits:{ordinaryUsageAllowed:true}}),null);await c.wait(f.target,true);now+=2000;assert.equal(await c.poll(f.target,{accountKey:'one',baselineDigest:'a',limits:{ordinaryUsageAllowed:null}}),null);now+=3600000;assert.equal((await c.poll(f.target,{accountKey:'one',baselineDigest:'a',limits:{ordinaryUsageAllowed:true}})).id,j.id);assert.equal((await f.store.read()).job.autoResume,false);});
test('different account and changed source pause rather than send the old request',async()=>{const f=fixture();let now=0;const c=new JobController(f.store,{now:()=>now});const j=await c.begin(f.target,{input:{text:'request',mode:'discussion',dayId:null},accountKey:'one',baselineDigest:'a'});await c.fail(f.target,j.id,'QUOTA_UNAVAILABLE');await c.wait(f.target,true);now=100000;assert.equal(await c.poll(f.target,{accountKey:'two',baselineDigest:'a',limits:{ordinaryUsageAllowed:true}}),null);assert.equal((await f.store.read()).job.reason,'ACCOUNT_CHANGED');});
test('trusted reset uses all exhausted windows and cancellation disables waiting',async()=>{assert.equal(nextQuotaCheck({rateLimits:{primary:{usedPercent:100,resetsAt:100},secondary:{usedPercent:100,resetsAt:200}}},0),201000);const f=fixture(),c=new JobController(f.store);const j=await c.begin(f.target,{input:{text:'x',mode:'discussion',dayId:null},accountKey:'one',baselineDigest:'a'});await c.fail(f.target,j.id,'AI_RESULT_UNKNOWN');await assert.rejects(c.wait(f.target,true),{code:'NO_WAITING_JOB'});await c.pause(f.target);assert.equal((await f.store.read()).job.status,'paused');});
test('opting out after poll reads the job prevents its atomic dispatch claim',async()=>{
 const f=fixture();let now=0;const c=new JobController(f.store,{now:()=>now});const job=await c.begin(f.target,{input:{text:'x',mode:'discussion',dayId:null},accountKey:'one',baselineDigest:'a'});await c.fail(f.target,job.id,'QUOTA_UNAVAILABLE');await c.wait(f.target,true);now=100000;
 const read=f.store.read;let first=true;f.store.read=async(...args)=>{const snapshot=await read(...args);if(first){first=false;await c.pause(f.target);}return snapshot;};
 assert.equal(await c.poll(f.target,{accountKey:'one',baselineDigest:'a',limits:{ordinaryUsageAllowed:true}}),null);assert.equal((await f.store.read()).job.reason,'user-paused');
});
test('late cancellation invalidates a claim and release cannot re-enable it',async()=>{
 const f=fixture();let now=0;const c=new JobController(f.store,{now:()=>now});const job=await c.begin(f.target,{input:{text:'x',mode:'discussion',dayId:null},accountKey:'one',baselineDigest:'a'});await c.fail(f.target,job.id,'QUOTA_UNAVAILABLE');await c.wait(f.target,true);now=100000;
 const claim=await c.poll(f.target,{accountKey:'one',baselineDigest:'a',limits:{ordinaryUsageAllowed:true}});await c.pause(f.target);assert.equal(await c.takeClaim(f.target,job.id,claim.claimId),null);await c.releaseClaim(f.target,job.id,claim.claimId);assert.equal((await f.store.read()).job.autoResume,false);
});
// 確定結束的失敗（例如 Claude 程序已結束、伺服器回報失敗）：記成 failed 並標 settled，App 會給「重送這則」，不走找回／重新開始。
test('a settled failure is recorded as failed, even for codes that are otherwise unknown',async()=>{
 const f=fixture(),c=new JobController(f.store);
 for(const code of ['AI_TIMEOUT','AI_RESULT_UNKNOWN','AI_TURN_FAILED']){
  const job=await c.begin(f.target,{input:{text:'x',mode:'discussion',dayId:null},accountKey:'one',baselineDigest:'a'});
  await c.fail(f.target,job.id,code,null,{settled:true});
  const saved=(await f.store.read()).job;assert.equal(saved.status,'failed',code);assert.equal(saved.settled,true,code);assert.equal(saved.reason,code);
 }
 const unknown=await c.begin(f.target,{input:{text:'x',mode:'discussion',dayId:null},accountKey:'one',baselineDigest:'a'});
 await c.fail(f.target,unknown.id,'AI_RESULT_UNKNOWN');assert.equal((await f.store.read()).job.status,'unknown');assert.equal((await f.store.read()).job.settled,undefined);
 // 使用者停止仍記成暫停，不因為程序已結束就變成失敗。
 const stopped=await c.begin(f.target,{input:{text:'x',mode:'discussion',dayId:null},accountKey:'one',baselineDigest:'a'});
 await c.fail(f.target,stopped.id,'AI_CANCELED',null,{settled:true});assert.equal((await f.store.read()).job.status,'paused');assert.equal((await f.store.read()).job.settled,undefined);
 const quota=await c.begin(f.target,{input:{text:'x',mode:'discussion',dayId:null},accountKey:'one',baselineDigest:'a'});
 await c.fail(f.target,quota.id,'QUOTA_EXHAUSTED',null,{settled:true});assert.equal((await f.store.read()).job.status,'waiting_quota');
});
