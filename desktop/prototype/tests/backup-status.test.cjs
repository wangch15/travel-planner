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

test('discard returns only this trip to the last backup, after listing what will change',async t=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'backup-discard-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  git(root,'init','-q');for(const d of ['trips/a','trips/b'])fs.mkdirSync(path.join(root,d),{recursive:true});
  const data=fs.readFileSync(path.join(__dirname,'../../../trips/_example/data.js'),'utf8');
  fs.writeFileSync(path.join(root,'trips/a/data.js'),data);fs.writeFileSync(path.join(root,'trips/b/note.md'),'b');git(root,'add','.');git(root,'commit','-qm','base');
  fs.writeFileSync(path.join(root,'trips/a/data.js'),data.replace(/title:\s*'([^']*)'/,"title:'改過的標題'"));fs.writeFileSync(path.join(root,'trips/a/new.md'),'new');fs.writeFileSync(path.join(root,'trips/b/note.md'),'b changed');
  const service=new BackupService();
  const prep=await service.discardPrepare({root,slug:'a'});
  assert.deepEqual(prep.restore,['trips/a/data.js']);assert.deepEqual(prep.remove,['trips/a/new.md']);assert.ok(prep.dayChanges.some(c=>c.after.includes('改過的標題')));
  // 確認前又改了，就不動檔案
  fs.appendFileSync(path.join(root,'trips/a/new.md'),'!');await assert.rejects(service.discardConfirm(prep.token),{code:'CONTENT_CHANGED'});
  const again=await service.discardPrepare({root,slug:'a'});const result=await service.discardConfirm(again.token);
  assert.deepEqual(result,{discarded:true,restored:1,removed:1});
  assert.equal(fs.readFileSync(path.join(root,'trips/a/data.js'),'utf8'),data);assert.equal(fs.existsSync(path.join(root,'trips/a/new.md')),false);
  assert.equal(fs.readFileSync(path.join(root,'trips/b/note.md'),'utf8'),'b changed','別趟旅程不受影響');
  await assert.rejects(service.discardPrepare({root,slug:'../b'}),{code:'INVALID_TARGET'});
});
