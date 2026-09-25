// 首次引導從頭走到尾：假的 GitHub 授權、Git 安裝、專案建立、第一次備份、AI 登入；Cloudflare 跳過；最後帶著描述進入新增旅程。
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{app}=require('electron');
if(!process.env.TRAVEL_PLANNER_TEST_ROOT)throw Error('Run onboarding smoke through the native smoke runner');
const root=require('node:fs').realpathSync(process.env.TRAVEL_PLANNER_TEST_ROOT);process.env.TRAVEL_PLANNER_STATE_DIR=path.join(root,'app');
const {createWindow,shutdown}=require('./main.cjs'),{createProjectStore}=require('./project-store.cjs');let win,status=0;app.on('window-all-closed',()=>{});
const js=async s=>{try{return await win.webContents.executeJavaScript(s);}catch(e){throw Error(s+' :: '+e.message);}};
async function until(s,tries=400){for(let i=0;i<tries;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,50));}throw Error('Onboarding condition: '+s);}
const click=label=>js(`(()=>{const b=[...document.querySelectorAll('#onboarding button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(label)}));if(!b||b.disabled)return false;b.click();return true;})()`);
async function press(label){await until(`[...document.querySelectorAll('#onboarding button')].some(b=>b.textContent.trim().startsWith(${JSON.stringify(label)})&&!b.disabled)`);assert.equal(await click(label),true,label);}
async function shot(name){await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const dir=path.resolve(__dirname,'../../.local/desktop-onboarding');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,name),(await win.webContents.capturePage()).toPNG());}

const auth={github:false,cloudflare:false},calls=[];let emitAuth=()=>{},gitReady=false,projectRoot=null;
function account(id){const a=new EventEmitter();a.account={provider:id,state:'needs-login'};a.connect=async()=>a.account;a.refresh=a.connect;a.stop=async()=>{};a.models=async()=>a.account.state==='connected'?[{id:'m-'+id,name:'預設',isDefault:true,effort:id==='codex'?['medium']:[]}]:[];a.login=async()=>{calls.push('login:'+id);setTimeout(()=>{a.account={...a.account,state:'connected',label:id+'@example.invalid'};a.emit('changed',a.account);},200);return {account:a.account};};a.cancelLogin=async()=>a.account;return a;}

app.whenReady().then(async()=>{
  const state=path.join(root,'state'),parent=path.join(root,'Documents','Travel Planner');
  const options={stateDirectory:state,defaultProjectParentDirectory:parent,codexAccount:account('codex'),
    makeProvider:id=>({account:account(id),editor:{active:null,stop:async()=>{}},capabilities:{switchAccount:false}}),
    makeAuth:opts=>{emitAuth=opts.onProgress;return {status:async p=>({provider:p,connected:auth[p]}),start:async p=>{calls.push('auth:'+p);setTimeout(()=>emitAuth({provider:p,state:'waiting-browser',deviceCode:p==='github'?'ABCD-1234':null,deviceUrl:'https://github.com/login/device'}),100);return {started:true,provider:p,state:'waiting-browser'};},cancel:async p=>({provider:p}),close:async()=>{}};},
    makeToolSupport:()=>({applyEnvironment:async()=>process.env,resolveCommand:async()=>null,
      inspect:async()=>({tools:[{id:'gh',status:'ready'},{id:'git',status:gitReady?'ready':'missing'},{id:'codex',status:'ready'},{id:'claude',status:'missing'},{id:'wrangler',status:'ready'}]}),
      prepare:async id=>({token:'plan-'+id,tool:id,method:id==='git'?'system-dialog':'managed'}),
      install:async token=>{calls.push('install:'+token);return token==='plan-git'?{state:'dialog-opened',installed:false}:{state:'installed',installed:true};}}),
    makeProjectSetup:()=>({
      suggestCreate:async({parentDirectory})=>({name:'travel-planner-trips',owner:'sample',parentDirectory,destination:path.join(parentDirectory,'travel-planner-trips')}),
      prepareCreate:async({name,parentDirectory})=>{calls.push('prepare:'+name);return {token:'create-token',repo:'sample/'+name,owner:'sample',visibility:'PRIVATE',destination:path.join(parentDirectory,name)};},
      confirmCreate:async token=>{assert.equal(token,'create-token');projectRoot=path.join(parent,'travel-planner-trips');await fs.mkdir(path.join(projectRoot,'scripts'),{recursive:true});await fs.writeFile(path.join(projectRoot,'package.json'),'{"name":"travel-planner","version":"1.1.2"}');for(const f of ['build.js','check.js'])await fs.writeFile(path.join(projectRoot,'scripts',f),'throw Error("not executed");');await fs.cp(path.resolve(__dirname,'../../trips/_example'),path.join(projectRoot,'trips/_example'),{recursive:true});return {ready:true,created:true,root:projectRoot,repo:'sample/travel-planner-trips',backupReady:true};},
      close:async()=>{}}),
    makeBackup:()=>({prepare:async t=>{calls.push('backup-prepare:'+(t.slug===null?'project':t.slug));return {token:'backup-token',files:[],unpublishedCommits:1,firstPush:true};},confirm:async token=>{calls.push('backup-confirm:'+token);return {backedUp:true,committed:false,message:'私人備份已完成，遠端版本已核對。'};},localStatus:async()=>({pendingFiles:0,unpushedCommits:0,neverBackedUp:false})}),
  };
  win=await createWindow(options);win.webContents.setBackgroundThrottling(false);
  // 一開始就不露出一般畫面：還在判斷時是 pending，決定後是 on（引導）
  assert.ok(['pending','on'].includes(await js('document.body.dataset.onboarding')));

  // 0 歡迎：全新的電腦從頭開始
  await until('window.onboarding?.state().facts && !window.onboarding.state().hidden && window.onboarding.state().view==="welcome"');
  assert.equal(await js('getComputedStyle(document.getElementById("workbench")).visibility'),'hidden');await shot('0-welcome.png');
  await press('開始準備');await until('onboarding.state().view==="github"');
  // 1 GitHub：顯示一次性代碼，授權後自動前往下一步
  await press('在瀏覽器連接 GitHub');await until('document.querySelector("#onboarding .ob-code strong")?.textContent==="ABCD-1234"');await shot('1-github-code.png');
  auth.github=true;emitAuth({provider:'github',state:'connected'});await until('onboarding.state().view==="git"');
  // 2 Git：叫出 Apple 視窗，偵測到安裝完成才繼續
  await press('安裝 Git');await until(`document.getElementById("onboarding").textContent.includes(${JSON.stringify(process.platform==='darwin'?'等待 Apple 的安裝完成':'正在安裝 Git for Windows')})`);assert.ok(calls.includes('install:plan-git'));
  gitReady=true;await until('onboarding.state().view==="project"',300);
  // 3 私人專案：預設名稱與位置，建立後自動第一次備份
  await until('document.getElementById("ob-project-name")?.value==="travel-planner-trips"');await shot('3-project.png');
  // 「我已經有專案了」留在引導裡：直接選資料夾或從 GitHub 下載，不露出一般畫面或設定頁
  await press('我已經有旅程資料夾了');await until('onboarding.state().view==="existing" && !document.getElementById("onboarding").hidden && document.getElementById("settings").hidden');
  assert.ok(await js('[...document.querySelectorAll("#onboarding button")].some(b=>b.textContent.startsWith("選擇資料夾")) && Boolean(document.getElementById("ob-existing-repo"))'));await shot('3b-existing.png');
  await press('← 改成建立新的旅程資料夾');await until('onboarding.state().view==="project"');
  await press('建立並完成第一次備份');await until('onboarding.state().view==="ai"',300);
  assert.deepEqual(calls.filter(c=>/^(prepare|backup)/.test(c)),['prepare:travel-planner-trips','backup-prepare:project','backup-confirm:backup-token']);
  assert.equal(await js('project?.root'),projectRoot);
  // 4 AI：Codex 已安裝，登入後自動繼續並設為預設
  await press('用 ChatGPT 登入');await until('onboarding.state().view==="cloudflare"',300);assert.ok(calls.includes('login:codex'));
  // 5 Cloudflare：可以跳過
  await press('先跳過');await until('onboarding.state().view==="ready"');await shot('6-ready.png');
  // 6 開始規劃：帶著描述打開新增旅程
  await js('document.getElementById("ob-first-request").value="十月去東北泡溫泉"');await press('開始規劃');
  await until('document.getElementById("onboarding").hidden && document.getElementById("new-dialog").open');
  assert.equal(await js('document.getElementById("new-notes").value'),'十月去東北泡溫泉');
  assert.equal(await js('document.body.dataset.onboarding'),undefined);
  const saved=(await createProjectStore(state).read()).state.onboarding;assert.deepEqual(saved,{completed:true,cloudflareSkipped:true});
}).catch(async e=>{status=1;console.error(e);if(win&&!win.isDestroyed())console.error(await js('JSON.stringify({state:window.onboarding?.state?.(),text:document.getElementById("onboarding")?.innerText?.slice(0,600)})').catch(()=>''));}).finally(async()=>{await shutdown().catch(()=>{});app.exit(status);});
