const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {claimProject,releaseProject}=require('../services/project-lock.cjs');
const project=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'project-lock-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};

test('warns only when another live App with different data has the project open',async t=>{
  const root=project(t);
  assert.equal(await claimProject(root,{pid:100,dataDir:'/a/dev',kind:'dev',isAlive:()=>true}),null);
  const warning=await claimProject(root,{pid:200,dataDir:'/a/installed',kind:'installed',isAlive:()=>true});
  assert.match(warning,/開發版/);
  // 對方已經關掉就不提醒
  assert.equal(await claimProject(root,{pid:300,dataDir:'/a/dev',kind:'dev',isAlive:()=>false}),null);
});

test('release removes only our own marker',async t=>{
  const root=project(t);
  await claimProject(root,{pid:100,dataDir:'/a',kind:'dev',isAlive:()=>false});
  await releaseProject(root,{pid:999});assert.ok(fs.existsSync(path.join(root,'.local/desktop-open.json')));
  await releaseProject(root,{pid:100});assert.equal(fs.existsSync(path.join(root,'.local/desktop-open.json')),false);
});
