const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {execFileSync}=require('node:child_process');
const {prepareNodeShim,script}=require('../services/node-shim.cjs');

test('node shim runs the App runtime as Node for the backup hook',{skip:process.platform==='win32'},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'node-shim-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const dir=await prepareNodeShim(root,process.execPath);
  const out=execFileSync('sh',['-c','command -v node && node -e "console.log(process.env.ELECTRON_RUN_AS_NODE)"'],{env:{PATH:dir+':/usr/bin:/bin'},encoding:'utf8'}).trim().split('\n');
  assert.equal(out[0],path.join(dir,'node'));assert.equal(out[1],'1');
  // 每次重寫，舊內容不會留下
  fs.writeFileSync(path.join(dir,'node'),'#!/bin/sh\necho tampered\n');await prepareNodeShim(root,process.execPath);
  assert.doesNotMatch(fs.readFileSync(path.join(dir,'node'),'utf8'),/tampered/);
});

test('node shim refuses paths that could break out of the quoted command',()=>{
  assert.throws(()=>script('/Applications/x"; rm -rf ~; "'),{code:'UNSAFE_NODE_SHIM'});
  assert.throws(()=>script('/tmp/$(id)'),{code:'UNSAFE_NODE_SHIM'});
  assert.match(script('/Applications/Travel Planner.app/Contents/MacOS/Electron'),/exec "\/Applications\/Travel Planner\.app/);
});
