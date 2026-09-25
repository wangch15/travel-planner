// Complete confirmation/save flow using a fake model and a temporary project only.
const { app } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { parseLiteralModule } = require('@travel-planner/engine');
const { createWindow, shutdown } = require('./main.cjs');
const { createProjectStore } = require('./project-store.cjs');
const { ProposalStore } = require('./proposals.cjs');
app.on('window-all-closed', () => {});
let root, win, timeout;
let exitStatus=0;
async function waitFor(expression) {
  for(let i=0;i<200;i++){if(await win.webContents.executeJavaScript(expression))return;await new Promise(r=>setTimeout(r,50));}
  throw Error('Workflow condition timed out: '+expression);
}
app.whenReady().then(async()=>{
  timeout=setTimeout(()=>app.exit(1),30000);
  root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'travel-workflow-')));
  const project=path.join(root,'project'),state=path.join(root,'state');
  await fs.mkdir(path.join(project,'scripts'),{recursive:true});
  await fs.writeFile(path.join(project,'package.json'),JSON.stringify({name:'sample-project',version:'1.1.0'}));
  for(const name of ['build.js','check.js'])await fs.writeFile(path.join(project,'scripts',name),'throw Error("must not execute imported script")');
  await fs.cp(path.resolve(__dirname,'../../trips/_example'),path.join(project,'trips/sample'),{recursive:true});
  const source=path.join(project,'trips/sample/data.js'); const before=await fs.readFile(source,'utf8');
  const store=createProjectStore(state);await store.connect({id:'workflow-project',root:project});await store.select('workflow-project','sample');
  const opened=[],copied=[],browserURLs=[];let switches=0,fastLogin=false,failDraft=false,failReply=false,cancelNext=false;const generated=[];
  const account=new EventEmitter();account.account={state:'connected',label:'測試帳號',version:'0.155.1'};
  account.connect=async()=>account.account;account.stop=async()=>{};account.models=async()=>[{id:'fake-model',name:'Fake model',isDefault:true},{id:'other-model',name:'Other model'}];
  account.switchAccount=async()=>{switches++;account.account={state:'waiting-login',label:null,version:'0.155.1'};account.emit('changed',account.account);return {account:account.account,authUrl:'https://auth.openai.com/oauth/authorize?state=fake-new-account'};};
  const {ConversationStore}=require('./conversation-store.cjs');
  const backupCalls=[];
  const windowOptions={makeProvider:id=>{const a=new EventEmitter();a.account={state:'needs-login',provider:id};a.connect=async()=>a.account;a.refresh=a.connect;a.models=async()=>[];a.stop=async()=>{};return {account:a,editor:{active:null,stop:async()=>{}}};},makeConversations:directory=>{const store=new ConversationStore(directory);const update=store.update.bind(store);store.update=(target,change)=>update(target,state=>{change(state);if(failDraft || (failReply&&state.run?.status==='complete'))throw Object.assign(Error('disk-failure'),{code:'CONVERSATION_STORE_INVALID'});});return store;},stateDirectory:state,codexAccount:account,openPreviewURL:async url=>{browserURLs.push(url);},openLoginURL:async url=>{opened.push(url);if(fastLogin){account.account={state:'connected',label:'即時登入的測試帳號',version:'0.155.1'};account.emit('changed',account.account);await new Promise(r=>setTimeout(r,100));}},copyLoginURL:url=>copied.push(url),
    makeProposals:directory=>new ProposalStore(directory,{checkPrivate:async()=>{}}),
    makeBackup:()=>({prepare:async target=>{backupCalls.push('prepare:'+target.slug);return {token:'backup-token',repo:'sample/private',branch:'main',files:[{path:'trips/'+target.slug+'/data.js',status:'present'}],unpublishedCommits:0};},confirm:async token=>{backupCalls.push('confirm:'+token);return {backedUp:true,message:'私人備份已完成，遠端版本已核對。'};},localStatus:async()=>({pendingFiles:0,unpushedCommits:0,neverBackedUp:false})}),
    makeEditor:()=>({active:null,stop:async()=>({requested:true}),generate:async({snapshot,dayId,model,onProgress,onThread,thread})=>{
      await onThread(thread?.id || "fake-thread");
      if(cancelNext)throw Object.assign(Error('AI_CANCELED'),{code:'AI_CANCELED'});
      generated.push({dayId,model,threadId:thread?.id||null});
      if(dayId===null)return {summary:"整體建議：每天保留一段自由活動時間。這輪沒有修改行程。",conversationTitle:"整體節奏調整",appAction:"backup",discussion:true,model,threadId:"fake-thread",turnId:"fake-turn-1"};
      onProgress('正在測試提案流程…');
      const day=parseLiteralModule(snapshot.dataSource).DAYS.find(day=>day.id===dayId);
      return {summary:'將這一天的標題改成「悠閒出發」。',replacementDay:{...day,title:'悠閒出發'},model:'fake-model',threadId:'fake-thread',turnId:'fake-turn-2'};
    }}),
  };
  win=await createWindow(windowOptions);
  await waitFor('document.documentElement.dataset.ready === "true"');
  await waitFor('document.getElementById("preview").getAttribute("src")?.startsWith("travel-preview://")');
  await win.webContents.executeJavaScript('document.getElementById("open-settings").click(); document.querySelector("[data-setting=ai]").click(); document.getElementById("codex-connect").click()');
  await waitFor('document.getElementById("codex-badge").textContent === "已連接"');
  await waitFor('!document.getElementById("codex-switch").hidden && !document.getElementById("codex-switch").disabled');
  await win.webContents.executeJavaScript('document.getElementById("codex-switch").click()');
  await waitFor('document.getElementById("codex-badge").textContent === "等待授權" && !document.getElementById("codex-copy-link").disabled');
  assert.equal(switches,1);assert.equal(opened.length,1);
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("codex-model").options.length'),0);
  await win.webContents.executeJavaScript('document.getElementById("codex-copy-link").click()');
  await waitFor('document.getElementById("notification").textContent.includes("已複製")');
  assert.equal(copied[0],opened[0]);
  account.account={state:'connected',label:'新的測試帳號',version:'0.155.1'};account.emit('changed',account.account);
  await waitFor('document.getElementById("codex-status").textContent.includes("新的測試帳號")');
  fastLogin=true;
  await waitFor('!document.getElementById("codex-switch").disabled');
  const fastSwitch=await win.webContents.executeJavaScript('window.travelDesktop.switchCodexAccount()');
  assert.equal(fastSwitch.account.state,'connected');
  await waitFor('document.getElementById("codex-model").options.length === 2');
  await win.webContents.executeJavaScript('document.getElementById("back-to-trip").click()');
  await win.webContents.executeJavaScript('document.getElementById("preview-browser").click()');
  for(let i=0;i<100&&!browserURLs.length;i++)await new Promise(r=>setTimeout(r,20));
  assert.equal(browserURLs.length,1);assert.match(browserURLs[0],/^http:\/\/127\.0\.0\.1:/);
  assert.equal((await fetch(browserURLs[0])).status,200);
  const stale=await win.webContents.executeJavaScript('window.travelDesktop.openPreviewInBrowser("https://example.invalid/")');assert.equal(stale.ok,false);
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("edit-day").value'),'');
  await win.webContents.executeJavaScript('document.getElementById("chat-model").value="other-model";document.getElementById("chat-model").dispatchEvent(new Event("change"));document.getElementById("message").value="希望整趟行程更輕鬆";document.getElementById("chat-form").requestSubmit()');
  await waitFor('document.getElementById("messages").textContent.includes("整體建議") && !document.getElementById("message").disabled');
  // 預設名稱的對話採用 AI 取的名字，標題列與側欄都更新。
  await waitFor('document.getElementById("conversation-title").textContent==="整體節奏調整" && document.getElementById("conversation-list").textContent.includes("整體節奏調整")');
  // AI 提出備份：回覆下方出現卡片，按下開啟備份燈箱，核對後按確認才推送；結果記回卡片。
  await waitFor('document.querySelector(".message.assistant .action-card")?.textContent.includes("備份到你的私人 GitHub")');
  assert.deepEqual(backupCalls,[]);
  await win.webContents.executeJavaScript('[...document.querySelectorAll(".action-card button")].find(b=>b.textContent==="檢查要備份的內容").click()');
  await waitFor('document.getElementById("sync-dialog").open && document.getElementById("sync-dialog-body").textContent.includes("私人 GitHub：sample/private")');
  // 燈箱開著時，卡片的按鈕顯示執行中，不能再按一次。
  assert.equal(await win.webContents.executeJavaScript('document.querySelector(".action-card button[aria-busy=true]")?.disabled'),true);
  assert.deepEqual(backupCalls,['prepare:'+(await win.webContents.executeJavaScript('selected.trip.slug'))]);
  await win.webContents.executeJavaScript('document.querySelector("#sync-dialog [data-flow-action=confirm]").click()');
  await waitFor('document.querySelector("#sync-dialog [data-flow-action=done]")');
  await win.webContents.executeJavaScript('document.querySelector("#sync-dialog [data-flow-action=done]").click()');
  await waitFor('!document.getElementById("sync-dialog").open && document.querySelector(".action-card .action-card-note").textContent.includes("私人備份已完成")');
  assert.equal(backupCalls.at(-1),'confirm:backup-token');
  assert.deepEqual(generated[0],{dayId:null,model:'other-model',threadId:null});
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("codex-model").value'),'other-model');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("proposal-review").hidden'),true);
  assert.equal(await fs.readFile(source,'utf8'),before);
  await win.webContents.executeJavaScript('document.getElementById("edit-day").value="1";document.getElementById("edit-day").dispatchEvent(new Event("change"))');
  await win.webContents.executeJavaScript('document.getElementById("message").value="重開後要繼續的草稿";document.getElementById("message").dispatchEvent(new Event("input"))');
  const closed=new Promise(resolve=>win.once('closed',resolve));win.close();await closed;
  win=await createWindow(windowOptions);
  await waitFor('document.documentElement.dataset.ready === "true" && document.getElementById("message").value === "重開後要繼續的草稿"');
  assert.ok(await win.webContents.executeJavaScript('document.getElementById("messages").textContent.includes("整體建議")'));
  await waitFor('document.getElementById("edit-day").value === "1"');
  await win.webContents.executeJavaScript('document.getElementById("open-settings").click();document.querySelector("[data-setting=ai]").click()');
  await waitFor('document.getElementById("codex-model").value === "other-model"');
  await win.webContents.executeJavaScript('document.getElementById("back-to-trip").click()');

  await waitFor('!document.getElementById("message").disabled');
  await win.webContents.executeJavaScript('document.getElementById("message").value="把標題改成悠閒出發";document.getElementById("chat-form").requestSubmit()');
  // 新流程：AI 改完直接保存到本機，不出提案、不用再確認；訊息下方有修改對照與回到修改前。
  await waitFor('document.querySelector(".message.assistant .applied-actions") && document.getElementById("proposal-review").hidden && !document.getElementById("message").disabled');
  assert.equal(generated[1].threadId,'fake-thread');
  await waitFor('Boolean(document.getElementById("preview").getAttribute("src"))');
  for(let i=0;i<100;i++){const frame=win.webContents.mainFrame.frames.find(frame=>frame.url.startsWith('travel-preview://'));if(frame&&(await frame.executeJavaScript('document.body.textContent').catch(()=>'')).includes('悠閒出發'))break;if(i===99)throw Error('preview did not show the applied change');await new Promise(r=>setTimeout(r,50));}
  assert.equal(parseLiteralModule(await fs.readFile(source,'utf8')).DAYS[0].title,'悠閒出發');
  assert.deepEqual(parseLiteralModule(await fs.readFile(source,'utf8')).DAYS.slice(1),parseLiteralModule(before).DAYS.slice(1));
  assert.equal((await fs.readdir(path.join(state,'backups'))).length,1);
  // An interrupted request is visible after reopening and must never auto-send.
  win.destroy();
  const chats=new ConversationStore(state);
  await chats.update({root:project,slug:'sample'},s=>{s.run={id:'interrupted-request',status:'pending'};s.pendingProposal=true;});
  const requestsBefore=generated.length;
  win=await createWindow(windowOptions);
  await waitFor('document.getElementById("job-card").textContent.includes("上次回覆尚未確認") && !document.getElementById("job-card").hidden');
  assert.equal(generated.length,requestsBefore);
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("message").disabled'),false,'a paused conversation must still allow drafting');
  await win.webContents.executeJavaScript('document.getElementById("message").value="暫停後仍可先寫下想法";document.getElementById("message").dispatchEvent(new Event("input"))');

  assert.equal(await win.webContents.executeJavaScript('document.getElementById("proposal-review").hidden'),true);
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("send-message").disabled'),true);
  await waitFor('!document.getElementById("restart-conversation").disabled');
  await win.webContents.executeJavaScript('document.querySelector("#job-card .job-restart").click()');
  await waitFor('document.getElementById("messages").textContent.includes("已開始新的 AI 對話")');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("message").value'),'暫停後仍可先寫下想法');
  const restarted=await chats.read({root:project,slug:'sample'});assert.equal(restarted.thread,null);assert.equal(restarted.job,null);assert.equal(restarted.handoff,null);assert.equal(restarted.pendingProposal,false);assert.ok(restarted.messages.length>4);
  await win.webContents.executeJavaScript('document.getElementById("open-settings").click();document.querySelector("[data-setting=ai]").click()');
  await waitFor('document.getElementById("codex-model").options.length === 2');
  await win.webContents.executeJavaScript('document.getElementById("back-to-trip").click()');
  await waitFor('!document.getElementById("message").disabled');
  failDraft=true;
  await win.webContents.executeJavaScript('document.getElementById("message").value="不能遺失的草稿";document.getElementById("message").dispatchEvent(new Event("input"));document.getElementById("open-demo").click()');
  await waitFor('document.getElementById("notification").textContent.includes("尚未保存")');
  assert.equal(await win.webContents.executeJavaScript('Boolean(selected.demo)'),false);
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("message").value'),'不能遺失的草稿');
  failDraft=false;
  // Reset the sample title so the next fake response produces a candidate.
  await fs.writeFile(source,before);
  failReply=true;
  await win.webContents.executeJavaScript('document.getElementById("edit-day").value="1";document.getElementById("edit-day").dispatchEvent(new Event("change"));document.getElementById("chat-form").requestSubmit()');
  // 檔案已經改好、只是對話紀錄寫不進去：照實說已保存，並說明怎麼退回。
  await waitFor('document.getElementById("messages").textContent.includes("修改已保存到本機") && document.getElementById("messages").textContent.includes("版本紀錄")');
  const pending=await win.webContents.executeJavaScript('window.travelDesktop.proposalStatus()');assert.equal(pending.id,null);
  assert.equal(parseLiteralModule(await fs.readFile(source,'utf8')).DAYS[0].title,'悠閒出發');
  failReply=false;
  await waitFor('!document.getElementById("restart-conversation").disabled');
  await win.webContents.executeJavaScript('document.getElementById("restart-conversation").click()');
  await waitFor('!selected.trip.needsRestart && !aiBusy');
  cancelNext=true;
  await win.webContents.executeJavaScript('document.getElementById("message").value="停止測試";document.getElementById("chat-form").requestSubmit()');
  await waitFor('selected.trip.needsRestart && !selected.trip.stopped');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("job-card").textContent.includes("已停止這輪")'),false);
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("send-message").disabled'),true);
  const beforeBlocked=generated.length;
  await win.webContents.executeJavaScript('document.getElementById("message").value="下一輪不可默默送出";document.getElementById("chat-form").requestSubmit()');
  assert.equal(generated.length,beforeBlocked);
  console.log(JSON.stringify({passed:true,fakeModel:true,candidateDoesNotAutoSave:true,realPreviewLoaded:true,explicitSave:true,unrelatedDaysPreserved:true,localBackup:true,accountSwitch:true,loginLinkCopy:true,pendingProposalBlocksSwitch:true,fastLoginRace:true,wholeTripDiscussion:true,chatModelSelection:true,browserPreview:true,conversationRestartRestore:true,closeFlushesDraft:true,persistedModelAndScope:true,threadContinues:true,interruptedRunDoesNotRetry:true,draftFailureBlocksNavigation:true,replySaveFailureDiscardsCandidate:true,uncertainCancelDoesNotPretendUserStop:true,pausedDraftEditable:true,restartPreservesDraft:true}));
}).catch(error=>{console.error(error);exitStatus=1;}).finally(async()=>{
  clearTimeout(timeout);if(win&&!win.isDestroyed())win.destroy();await shutdown();
  if(root)await fs.rm(root,{recursive:true,force:true});app.exit(exitStatus);
});
