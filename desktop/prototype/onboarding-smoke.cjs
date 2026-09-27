// 首次引導從頭走到尾：先接 AI（Claude 登入失敗要馬上說明，改用 Codex 成功）；接著 GitHub 授權（卡住時可問 AI）、Git 安裝、專案建立、第一次備份；
// Cloudflare 跳過；最後帶著描述進入新增旅程。
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{app}=require('electron');
if(!process.env.TRAVEL_PLANNER_TEST_ROOT)throw Error('Run onboarding smoke through the native smoke runner');
const root=require('node:fs').realpathSync(process.env.TRAVEL_PLANNER_TEST_ROOT);process.env.TRAVEL_PLANNER_STATE_DIR=path.join(root,'app');
const {createWindow,shutdown}=require('./main.cjs'),{createProjectStore}=require('./project-store.cjs');let win,status=0;app.on('window-all-closed',()=>{});
const js=async s=>{try{return await win.webContents.executeJavaScript(s);}catch(e){throw Error(s+' :: '+e.message);}};
async function until(s,tries=400){for(let i=0;i<tries;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,50));}throw Error('Onboarding condition: '+s);}
const click=label=>js(`(()=>{const b=[...document.querySelectorAll('#onboarding button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(label)}));if(!b||b.disabled)return false;b.click();return true;})()`);
async function press(label){await until(`[...document.querySelectorAll('#onboarding button')].some(b=>b.textContent.trim().startsWith(${JSON.stringify(label)})&&!b.disabled)`);assert.equal(await click(label),true,label);}
async function shot(name){await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const dir=path.resolve(__dirname,'../../.local/desktop-onboarding');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,name),(await win.webContents.capturePage()).toPNG());}

const auth={github:false,cloudflare:false},calls=[],helpInputs=[];let emitAuth=()=>{},gitReady=false,projectRoot=null;
// Claude 模擬「瀏覽器登入沒完成」：先等待，再變成 login-failed；Codex 登入成功。
const LOGIN_FAILED_TEXT='Claude Code 登入程序未完成，帳號尚未儲存到 App；請重試或按重新確認。';
function account(id){const a=new EventEmitter();a.account={provider:id,state:'needs-login'};a.connect=async()=>a.account;a.refresh=a.connect;a.stop=async()=>{};a.models=async()=>a.account.state==='connected'?[{id:'m-'+id,name:'預設',isDefault:true,effort:id==='codex'?['medium']:[]}]:[];
  a.login=async()=>{calls.push('login:'+id);a.account={...a.account,state:'waiting-login'};setTimeout(()=>{a.account=id==='claude'?{...a.account,state:'login-failed',message:LOGIN_FAILED_TEXT}:{...a.account,state:'connected',label:id+'@example.invalid'};a.emit('changed',a.account);},200);return {account:a.account};};
  a.cancelLogin=async()=>{calls.push('cancel:'+id);a.account={...a.account,state:'needs-login',message:null};return a.account;};return a;}
// 問 AI：記下送出的內容，確認只有步驟與畫面提示，沒有一次性代碼。
const editor=id=>({active:null,stop:async()=>({requested:false}),generate:async input=>{helpInputs.push({id,...input});if(input.text==='slow')await new Promise(r=>setTimeout(r,500));return {setupHelp:true,answer:'先按「重新連接」，再到瀏覽器輸入畫面上的代碼。'};}});

app.whenReady().then(async()=>{
  const state=path.join(root,'state'),parent=path.join(root,'Documents','Travel Planner');
  const options={stateDirectory:state,defaultProjectParentDirectory:parent,codexAccount:account('codex'),makeEditor:()=>editor('codex'),
    makeProvider:id=>({account:account(id),editor:editor(id),capabilities:{switchAccount:false}}),
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
  await press('開始準備');await until('onboarding.state().view==="ai"');
  // 1 AI 助手排第一：還沒接好時沒有「問 AI」，付費方案要先講清楚
  assert.equal(await js('document.getElementById("onboarding").textContent.includes("卡住了？問 AI 助手")'),false);
  assert.ok(await js('document.getElementById("onboarding").textContent.includes("需要付費方案")'));await shot('1-ai.png');
  // AI 還沒接好時，問 AI 直接說明要先登入，不會送出任何東西
  const early=await js('travelDesktop.feature("setup-help",{text:"hi"})');assert.equal(early.ok,false);assert.equal(early.code,'LOGIN_REQUIRED');assert.match(early.message,/先回到「AI 助手」/);assert.equal(helpInputs.length,0);
  // 1a Claude 登入失敗：不用等 15 分鐘，幾秒內就出現原因與重試
  await press('安裝並登入');await until('onboarding.state().ai.stuck===true',200);
  assert.ok(calls.includes('install:plan-claude')&&calls.includes('login:claude'));
  assert.ok(await js(`document.getElementById("onboarding").textContent.includes(${JSON.stringify(LOGIN_FAILED_TEXT)})`));
  assert.ok(await js('document.getElementById("onboarding").textContent.includes("AI 助手還沒連接好")'));await shot('1a-ai-stuck.png');
  // 1b 按「重新連接」：等待登入時兩個選項都鎖住，不會丟下還沒完成的登入
  await press('重新連接');await until('onboarding.state().ai.waiting===true',100);
  assert.equal(await js('[...document.querySelectorAll("#onboarding .ob-choice button")].every(b=>b.disabled)'),true);
  await until('onboarding.state().ai.stuck===true',200);
  // 1c 重新連接會先取消舊的登入再重來
  assert.ok(calls.indexOf('cancel:claude')>=0&&calls.lastIndexOf('login:claude')>calls.indexOf('cancel:claude'));
  // 1d 改選 Codex：登入成功後自動前往 GitHub
  await press('用 ChatGPT 登入');await until('onboarding.state().view==="github"',300);assert.ok(calls.includes('login:codex'));
  // 2 GitHub：顯示一次性代碼；AI 已接好，所以畫面有「問 AI」
  await press('在瀏覽器連接 GitHub');await until('document.querySelector("#onboarding .ob-code strong")?.textContent==="ABCD-1234"');await shot('2-github-code.png');
  await press('卡住了？問 AI 助手');await until('Boolean(document.getElementById("ob-help-input"))');
  await js('(()=>{const t=document.getElementById("ob-help-input");t.value="瀏覽器沒有出現輸入代碼的地方";t.dispatchEvent(new Event("input"));})()');
  await press('送出');await until('document.querySelectorAll("#onboarding .ob-help-assistant").length===1');
  assert.equal(helpInputs[0].mode,'setup-help');assert.equal(helpInputs[0].id,'codex');assert.equal(helpInputs[0].text,'瀏覽器沒有出現輸入代碼的地方');
  assert.equal(helpInputs[0].setupContext.step,'github');assert.deepEqual(helpInputs[0].setupContext.done,['ai']);
  assert.equal(JSON.stringify(helpInputs).includes('ABCD-1234'),false,'一次性代碼不能送給 AI');await shot('2a-github-help.png');
  // 同時問兩個問題：第二個說明正在忙，不會插隊
  helpInputs.length=0;const busyPair=await js('Promise.all([travelDesktop.feature("setup-help",{text:"slow"}),travelDesktop.feature("setup-help",{text:"second"})])');
  assert.equal(busyPair[0].ok,true);assert.equal(busyPair[1].code,'AI_BUSY');assert.equal(helpInputs.length,1);helpInputs.length=0;
  // 2b 授權失敗時，卡住卡片上可以直接問 AI
  emitAuth({provider:'github',state:'failed'});await until('document.getElementById("onboarding").textContent.includes("GitHub 授權還沒完成")');
  await press('問 AI 怎麼辦');await until('document.querySelectorAll("#onboarding .ob-help-assistant").length===2');
  assert.equal(helpInputs[0].setupContext.problem,'授權還沒完成');assert.equal(helpInputs[0].history.length,2);
  // 2c 先按「稍後再設定」離開：設定頁出現「完成剩下的設定」，按下去回到還沒完成的 GitHub
  await press('稍後再設定');await until('document.getElementById("onboarding").hidden');
  await js('openSettings("projects")');await until('!document.getElementById("onboarding-resume").hidden');
  assert.equal(await js('document.getElementById("onboarding-resume").textContent.trim()'),'完成剩下的設定');
  await js('document.getElementById("onboarding-resume").click()');await until('!document.getElementById("onboarding").hidden && onboarding.state().view==="github" && document.getElementById("settings").hidden');
  await press('重新連接');await until('document.querySelector("#onboarding .ob-code strong")?.textContent==="ABCD-1234"');
  auth.github=true;emitAuth({provider:'github',state:'connected'});await until('onboarding.state().view==="git"');
  // 3 Git：叫出 Apple 視窗，偵測到安裝完成才繼續
  await press('安裝 Git');await until(`document.getElementById("onboarding").textContent.includes(${JSON.stringify(process.platform==='darwin'?'等待 Apple 的安裝完成':'正在安裝 Git for Windows')})`);// 畫面先切到等待狀態才呼叫安裝：等呼叫真的發生再檢查，慢機器上才不會搶先。
  for(let i=0;i<100&&!calls.includes('install:plan-git');i++)await new Promise(r=>setTimeout(r,50));assert.ok(calls.includes('install:plan-git'));
  gitReady=true;await until('onboarding.state().view==="project"',300);
  // 4 私人專案：預設名稱與位置，建立後自動第一次備份
  await until('document.getElementById("ob-project-name")?.value==="travel-planner-trips"');await shot('4-project.png');
  // 「我已經有專案了」留在引導裡：直接選資料夾或從 GitHub 下載，不露出一般畫面或設定頁
  await press('我已經有旅程資料夾了');await until('onboarding.state().view==="existing" && !document.getElementById("onboarding").hidden && document.getElementById("settings").hidden');
  assert.ok(await js('[...document.querySelectorAll("#onboarding button")].some(b=>b.textContent.startsWith("選擇資料夾")) && Boolean(document.getElementById("ob-existing-repo"))'));await shot('4b-existing.png');
  await press('← 改成建立新的旅程資料夾');await until('onboarding.state().view==="project"');
  await press('建立並完成第一次備份');await until('onboarding.state().view==="cloudflare"',300);
  assert.deepEqual(calls.filter(c=>/^(prepare|backup)/.test(c)),['prepare:travel-planner-trips','backup-prepare:project','backup-confirm:backup-token']);
  assert.equal(await js('project?.root'),projectRoot);
  // 5 Cloudflare：可以跳過
  await press('先跳過');await until('onboarding.state().view==="ready"');await shot('6-ready.png');
  // 6 開始規劃：帶著描述打開新增旅程
  await js('document.getElementById("ob-first-request").value="十月去東北泡溫泉"');await press('開始規劃');
  await until('document.getElementById("onboarding").hidden && document.getElementById("new-dialog").open');
  assert.equal(await js('document.getElementById("new-notes").value'),'十月去東北泡溫泉');
  assert.equal(await js('document.body.dataset.onboarding'),undefined);
  const saved=(await createProjectStore(state).read()).state.onboarding;assert.deepEqual(saved,{completed:true,cloudflareSkipped:true});
  // 7 全部做完：設定頁不再出現「完成剩下的設定」（按了只會看到重複的最後一頁）
  await js('document.getElementById("new-dialog").close()');await js('openSettings("projects")');
  await new Promise(r=>setTimeout(r,300));await until('document.getElementById("onboarding-resume").hidden');
}).catch(async e=>{status=1;console.error(e);if(win&&!win.isDestroyed())console.error(await js('JSON.stringify({state:window.onboarding?.state?.(),text:document.getElementById("onboarding")?.innerText?.slice(0,600)})').catch(()=>''));}).finally(async()=>{await shutdown().catch(()=>{});app.exit(status);});
