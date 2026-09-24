const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {execFileSync}=require('node:child_process');
const {BackupService}=require('../services/backup.cjs');
const git=(cwd,...a)=>execFileSync('git',['-c','user.name=T','-c','user.email=t@example.invalid','-c','init.defaultBranch=main',...a],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();

test('local backup status: never pushed, pending trip files, unpushed commits',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'backup-status-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const remote=path.join(root,'remote.git'),work=path.join(root,'work');git(root,'init','-q','--bare',remote);fs.mkdirSync(work);git(work,'init','-q');
  fs.mkdirSync(path.join(work,'trips/a'),{recursive:true});fs.writeFileSync(path.join(work,'trips/a/data.js'),'1');git(work,'add','-A');git(work,'commit','-qm','one');
  const backup=new BackupService();
  assert.deepEqual(await backup.localStatus(work,'a'),{pendingFiles:0,unpushedCommits:null,neverBackedUp:true});
  git(work,'remote','add','origin',remote);git(work,'push','-q','origin','HEAD:refs/heads/main');
  assert.deepEqual(await backup.localStatus(work,'a'),{pendingFiles:0,unpushedCommits:0,neverBackedUp:false});
  fs.writeFileSync(path.join(work,'trips/a/data.js'),'2');fs.writeFileSync(path.join(work,'trips/a/new.js'),'x');
  assert.equal((await backup.localStatus(work,'a')).pendingFiles,2);
  git(work,'commit','-qam','two');
  assert.equal((await backup.localStatus(work,'a')).unpushedCommits,1);
  await assert.rejects(backup.localStatus(work,'../x'),{code:'INVALID_TARGET'});
});

test('all-trips status counts every trip folder but not the template example',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'backup-all-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  git(root,'init','-q');for(const d of ['trips/a','trips/b','trips/_example'])fs.mkdirSync(path.join(root,d),{recursive:true});
  for(const f of ['trips/a/data.js','trips/b/data.js','trips/_example/data.js'])fs.writeFileSync(path.join(root,f),'1');git(root,'add','-A');git(root,'commit','-qm','one');
  for(const f of ['trips/a/data.js','trips/b/data.js','trips/_example/data.js'])fs.writeFileSync(path.join(root,f),'2');fs.writeFileSync(path.join(root,'trips/_profile.md'),'x');
  const backup=new BackupService();
  assert.equal((await backup.localStatus(root,'*')).pendingFiles,3);
  assert.equal((await backup.localStatus(root,'a')).pendingFiles,1);
});
