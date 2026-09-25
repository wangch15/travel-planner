// 聊天出錯後不鎖死：確定結束的失敗給「重送這則」「帶回輸入框」，重送不蓋掉輸入框裡的草稿；
// 預覽面板關著也會在背景驗證，送出不必先打開預覽，但也不能因此被記成「看過預覽」；
// 輸入框 ↑／↓ 翻送出過的訊息，未送出的草稿翻回底要還原。
const {app}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
if(!process.env.TRAVEL_PLANNER_TEST_ROOT)throw Error('Run chat recovery smoke through the native smoke runner');
const root=require('node:fs').realpathSync(process.env.TRAVEL_PLANNER_TEST_ROOT);
const {createWindow,shutdown}=require('./main.cjs'),{createProjectStore}=require('./project-store.cjs'),{ProposalStore}=require('./proposals.cjs');
app.on('window-all-closed',()=>{});let win,status=0;const calls=[];let failNext=null;
const js=async s=>{try{return await win.webContents.executeJavaScript(s);}catch(e){throw Error(s.slice(0,160)+' :: '+e.message);}};
async function until(s,tries=200){for(let i=0;i<tries;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,50));}throw Error('Recovery condition: '+s);}
const key=(k,extra='')=>js(`document.getElementById('message').dispatchEvent(new KeyboardEvent('keydown',{key:'${k}',bubbles:true,cancelable:true${extra}}))`);
const composer=()=>js('document.getElementById("message").value');
app.whenReady().then(async()=>{
  const project=path.join(root,'project'),state=path.join(root,'state');
  await fs.mkdir(path.join(project,'scripts'),{recursive:true});
  await fs.writeFile(path.join(project,'package.json'),JSON.stringify({name:'sample-project',version:'1.1.0'}));
  for(const f of ['build.js','check.js'])await fs.writeFile(path.join(project,'scripts',f),'throw Error("not executed")');
  await fs.cp(path.resolve(__dirname,'../../trips/_example'),path.join(project,'trips/sample'),{recursive:true});
  const store=createProjectStore(state);await store.connect({id:'recovery-project',root:project});await store.select('recovery-project','sample');
  const account=new EventEmitter();account.account={state:'connected',label:'測試帳號',version:'0.155.1'};
  account.connect=async()=>account.account;account.refresh=account.connect;account.stop=async()=>{};account.models=async()=>[{id:'fake-model',name:'Fake model',isDefault:true}];
  win=await createWindow({stateDirectory:state,codexAccount:account,makeProposals:d=>new ProposalStore(d,{checkPrivate:async()=>{}}),
    makeProvider:id=>{const a=new EventEmitter();a.account={state:'needs-login',provider:id};a.connect=async()=>a.account;a.refresh=a.connect;a.models=async()=>[];a.stop=async()=>{};return {account:a,editor:{active:null,stop:async()=>{}}};},
    makeEditor:()=>({active:null,stop:async()=>({requested:true}),generate:async({model,text})=>{calls.push(text);
      if(failNext){const error=failNext;failNext=null;throw error;}
      return {model,threadId:'t',turnId:'u'+calls.length,summary:'收到：'+text,discussion:true};}})});
  // 預覽面板關著：背景驗證完成後就能送出，iframe 卻不能載入（載入就算「看過預覽」）。
  // 啟動時 App 會自動打開上次的旅程與預覽；等啟動完成再關面板，並重新做一次背景驗證，慢機器上才不會被啟動流程蓋回去。
  await until('document.documentElement.dataset.ready==="true"');
  await js('setPreview(false);document.getElementById("preview").removeAttribute("src");realPreview=null;renderPreview()');
  await until('realPreview?.status==="ready" && !document.getElementById("edit-day").disabled');
  assert.equal(await js('document.getElementById("preview-panel").hidden'),true);
  assert.equal(await js('document.getElementById("send-message").disabled'),false,'預覽面板關著也要能送出');
  assert.equal(await js('document.getElementById("preview").getAttribute("src")'),null,'面板關著不能載入預覽，否則會被記成看過');

  // 第一則：AI 很久沒進度而停止（確定結束）→ 不鎖送出，出現重送卡片。
  failNext=Object.assign(Error('AI_TIMEOUT'),{code:'AI_TIMEOUT',settled:true});
  await js(`document.getElementById('message').value='第一天想晚點出發';`);await key('Enter');
  await until('!document.getElementById("job-card").hidden && document.getElementById("job-card").textContent.includes("這輪沒有完成") && !aiBusy');
  assert.match(await js('document.getElementById("messages").textContent'),/很久沒有新的進度/);
  assert.equal(await js('selected.trip.needsRestart'),false,'確定結束的失敗不能要求重新開始');
  assert.equal(await js('document.getElementById("send-message").disabled'),false,'失敗後仍要能送出');

  // 輸入框有別的草稿時按「重送這則」：送原訊息，草稿留著。
  await js(`document.getElementById('message').value='順便問停車';document.getElementById('message').dispatchEvent(new Event('input'))`);
  await js('[...document.querySelectorAll("#job-card button")].find(b=>b.textContent==="重送這則").click()');
  await until('document.getElementById("messages").textContent.includes("收到：第一天想晚點出發") && !aiBusy');
  assert.deepEqual(calls,['第一天想晚點出發','第一天想晚點出發']);
  assert.equal(await composer(),'順便問停車','重送不能蓋掉輸入框裡的草稿');
  assert.equal(await js('document.getElementById("job-card").hidden'),true);

  // 再失敗一次，改用「帶回輸入框」：接在草稿後面，不取代。
  failNext=Object.assign(Error('AI_SERVICE_BUSY'),{code:'AI_SERVICE_BUSY',settled:true});
  await js(`document.getElementById('message').value='第二天午餐換一家';`);await key('Enter');
  await until('document.getElementById("job-card").textContent.includes("這輪沒有完成") && !aiBusy');
  await js(`document.getElementById('message').value='草稿A';document.getElementById('message').dispatchEvent(new Event('input'))`);
  await js('[...document.querySelectorAll("#job-card button")].find(b=>b.textContent==="帶回輸入框").click()');
  assert.equal(await composer(),'草稿A\n\n第二天午餐換一家');

  // ↑／↓：從未送出的草稿開始往上翻，翻回底還原草稿。
  await js(`{const m=document.getElementById('message');m.value='還沒送出';m.setSelectionRange(0,0);m.dispatchEvent(new Event('input'))}`);
  await key('ArrowUp');assert.equal(await composer(),'第二天午餐換一家');
  await key('ArrowUp');assert.equal(await composer(),'第一天想晚點出發','連續送出同一句只算一筆');
  await key('ArrowUp');assert.equal(await composer(),'第一天想晚點出發','翻到最舊就停住');
  await key('ArrowDown');assert.equal(await composer(),'第二天午餐換一家');
  await key('ArrowDown');assert.equal(await composer(),'還沒送出','翻回底要還原未送出的草稿');
  // 多行文字：游標不在第一行時 ↑ 是在文字裡移動，不翻歷史。
  await js(`{const m=document.getElementById('message');m.value='第一行\\n第二行';m.setSelectionRange(6,6)}`);
  await key('ArrowUp');assert.equal(await composer(),'第一行\n第二行');
  // 輸入法組字中不翻。
  await js(`{const m=document.getElementById('message');m.value='';m.setSelectionRange(0,0)}`);
  await key('ArrowUp',',isComposing:true');assert.equal(await composer(),'');
  console.log(JSON.stringify({passed:true,settledFailureNotLocked:true,resendKeepsDraft:true,recallAppends:true,historyRestoresDraft:true,previewGateKept:true}));
}).catch(async e=>{console.error(e);status=1;}).finally(async()=>{win?.destroy();try{await shutdown();}catch(error){console.error(error);status=1;}app.exit(status);});
