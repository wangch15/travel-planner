const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {createHash}=require('node:crypto');
const {PublishingService}=require('../services/publishing.cjs');
test('site status prefers the App record and falls back to the CLI record',async t=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'publish-status-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const root=fs.realpathSync(fs.mkdirSync(path.join(base,'project'),{recursive:true})||path.join(base,'project')),state=path.join(base,'state');
  const service=new PublishingService(state);
  assert.deepEqual(await service.status({root,slug:'trip'}),{url:null,publishedAt:null,source:null});
  fs.mkdirSync(path.join(root,'.local/deployments'),{recursive:true});fs.writeFileSync(path.join(root,'.local/deployments/trip.json'),JSON.stringify({url:'https://trip.example.workers.dev'}));
  assert.equal((await service.status({root,slug:'trip'})).source,'cli');
  const appDir=path.join(state,'publishing',createHash('sha256').update(root).digest('hex'));fs.mkdirSync(appDir,{recursive:true});fs.writeFileSync(path.join(appDir,'trip.json'),JSON.stringify({url:'https://trip.app.workers.dev'}));
  const s=await service.status({root,slug:'trip'});assert.equal(s.source,'app');assert.equal(s.url,'https://trip.app.workers.dev');assert.match(s.publishedAt,/^\d{4}-/);
  await assert.rejects(service.status({root,slug:'../x'}),{code:'INVALID_TARGET'});
});
