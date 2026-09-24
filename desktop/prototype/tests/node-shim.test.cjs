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

test('trusted backup files match regardless of CRLF checkout, but not other edits',()=>{
  const {sameTrusted}=require('../services/backup.cjs');
  assert.equal(sameTrusted(Buffer.from('a\r\nb\r\n'),Buffer.from('a\nb\n')),true);
  assert.equal(sameTrusted(Buffer.from('a\nb\n'),Buffer.from('a\nc\n')),false);
});

test('wrangler runs correctly under the App runtime (Electron as Node) through the launcher',{skip:!process.versions.electron&&!require('node:fs').existsSync(require('node:path').resolve(__dirname,'../../../node_modules/electron/dist'))},()=>{
  const {execFileSync}=require('node:child_process');const path=require('node:path');const {wranglerArgs,defaultCli}=require('../services/wrangler-launch.cjs');
  const electron=require('electron');// 在 Node 下 require('electron') 回傳執行檔路徑
  const out=execFileSync(electron,wranglerArgs(defaultCli(),['--version']),{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',NO_COLOR:'1'},encoding:'utf8'});
  assert.match(out,/\d+\.\d+\.\d+/);
  // 過去的錯誤：wrangler 把腳本路徑當成參數，whoami 會回報 Unknown arguments
  const help=execFileSync(electron,wranglerArgs(defaultCli(),['whoami','--help']),{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',NO_COLOR:'1'},encoding:'utf8'});
  assert.doesNotMatch(help,/Unknown arguments/);assert.match(help,/whoami/);
});
