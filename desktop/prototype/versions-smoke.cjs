// Native workflow uses a temporary sample project and a fake account/model only.
const {app}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {parseLiteralModule}=require('@travel-planner/engine');
const {createWindow,shutdown}=require('./main.cjs');
const {createProjectStore}=require('./project-store.cjs');
const {ProposalStore}=require('./proposals.cjs');
const {VersionStore}=require('./version-store.cjs');
app.on('window-all-closed',()=>{});let win,root,timer,exitStatus=0;
const js=source=>win.webContents.executeJavaScript(source);
async function until(source){for(let i=0;i<1500;i++){if(await js(source))return;await new Promise(r=>setTimeout(r,30));}throw Error('Version workflow timeout: '+source);}
async function capture(name){await fs.mkdir(path.resolve(__dirname,'../../.local/desktop-prototype'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../.local/desktop-prototype',name),(await win.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{
 timer=setTimeout(()=>app.exit(1),170000);root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'travel-versions-')));
 const project=path.join(root,'project'),state=path.join(root,'state');await fs.mkdir(path.join(project,'scripts'),{recursive:true});
 await fs.writeFile(path.join(project,'package.json'),'{}');for(const name of ['build.js','check.js'])await fs.writeFile(path.join(project,'scripts',name),'throw Error("untrusted")');
 await fs.cp(path.resolve(__dirname,'../../trips/_example'),path.join(project,'trips/sample'),{recursive:true});const source=path.join(project,'trips/sample/data.js'),original=await fs.readFile(source,'utf8'),originalData=parseLiteralModule(original);
 const target={root:project,slug:'sample',projectId:'version-project'},workspace=createProjectStore(state),history=new VersionStore(state);
 await workspace.connect({id:target.projectId,root:project});await workspace.select(target.projectId,target.slug);
 const account=new EventEmitter();account.account={state:'connected',label:'範例帳號',version:'0.155.1'};account.connect=async()=>account.account;account.stop=async()=>{};account.models=async()=>[{id:'fake',name:'測試模型',isDefault:true}];let turns=0,holdDiscard=false,releaseDiscard,discardStarted;
 const options={makeVersions:dir=>{const store=new VersionStore(dir),save=store.saveDraft.bind(store);store.saveDraft=async(target,draft)=>{if(holdDiscard&&draft===null){discardStarted();await new Promise(resolve=>{releaseDiscard=resolve;});}return save(target,draft);};return store;},stateDirectory:state,codexAccount:account,makeProposals:dir=>new ProposalStore(dir,{checkPrivate:async()=>{}}),makeEditor:()=>({active:null,stop:async()=>({}),generate:async({snapshot,dayId,onThread})=>{
   turns++;await onThread('fake-thread');const day=parseLiteralModule(snapshot.dataSource).DAYS.find(d=>d.id===dayId);
   return {summary:'修改標題與說明，請挑選要保存的部分。',replacementDay:turns===1?{...day,title:'新版標題',lead:'這段說明先不採用'}:{...day,lead:'保留最新的第二天說明'},threadId:'fake-thread',turnId:'turn-'+turns,model:'fake'};
 }})};
 async function launch(){win=await createWindow(options);win.webContents.setBackgroundThrottling(false);await until('realPreview?.status === "ready"');await js('codexAction("connectCodex")');await until('document.getElementById("chat-model").options.length > 0');}
 // 新流程：AI 改完直接保存成新的一版；「回到某一版」也直接套用並記成新的一版。
 async function send(dayId){const n=await js('document.querySelectorAll(".applied-actions").length');await js(`document.getElementById('edit-day').value=${JSON.stringify(String(dayId))};document.getElementById('edit-day').dispatchEvent(new Event('change'));document.getElementById('message').value='提出這次修改';document.getElementById('chat-form').requestSubmit()`);await until(`document.querySelectorAll(".applied-actions").length>${n} && !aiBusy && !pendingProposal && realPreview?.status==="ready"`);}
 async function restore(id){const n=await js('document.querySelectorAll(".applied-actions").length');await js('document.getElementById("versions-open").click()');await until('document.querySelectorAll("#history-list .history-row").length > 0 && !aiBusy');await js(`document.querySelector('[data-version-id="${id}"]').click()`);await until(`document.querySelectorAll(".applied-actions").length>${n} && !aiBusy && !pendingProposal && realPreview?.status==="ready"`);}
 await launch();await js('setTheme("light")');assert.equal((await history.read(target)).revisions.length,1);assert.equal(await fs.readFile(source,'utf8'),original);
 await send(originalData.DAYS[0].id);assert.equal(pendingCount(await history.read(target)),0);let records=(await history.read(target)).revisions;assert.equal(records.length,2);
 assert.equal(parseLiteralModule(await fs.readFile(source,'utf8')).DAYS[0].title,'新版標題');assert.equal(parseLiteralModule(records[1].source).DAYS[0].title,'新版標題');
 // 查看修改對照：列出這一版相對前一版改了什麼。
 await js('document.querySelector(".applied-actions button").click()');await until('document.getElementById("changes-dialog").open && document.querySelectorAll("#change-list .change-item").length===2');await capture('versions-diff-light.png');await js('document.getElementById("done-changes").click()');
 // 重開 App 後，訊息下方的操作還在。
 const closed=new Promise(r=>win.once('closed',r));win.close();await closed;await launch();
 await until('document.querySelectorAll(".applied-actions button").length===2');
 await send(originalData.DAYS[1].id);records=(await history.read(target)).revisions;assert.equal(records.length,3);const version3=records[2];
 await js('setTheme("dark")');await restore(records[0].id);await capture('versions-restore-dark.png');assert.equal(await fs.readFile(source,'utf8'),original);
 await restore(version3.id);assert.equal(await fs.readFile(source,'utf8'),version3.source);
 // 「回到修改前」按鈕：回到上一版。
 await js('[...document.querySelectorAll(".applied-actions button")].at(-1).click()');await until('!aiBusy && document.querySelectorAll(".applied-actions").length===5 && realPreview?.status==="ready"');assert.equal(await fs.readFile(source,'utf8'),original);
 records=(await history.read(target)).revisions;assert.equal(records.length,6);assert.deepEqual(records.map(r=>r.kind),['initial','save','save','restore','restore','restore']);
 await js('document.getElementById("versions-open").click()');await until('document.querySelectorAll("#history-list .history-row").length === 6');await capture('versions-history-dark.png');await js('document.getElementById("close-history").click()');
 // 發布入口在聊天畫面直接開發布燈箱（不跳到設定頁），燈箱裡要按確認才發布。
 await until('!document.getElementById("publish-open").hidden && !document.getElementById("publish-open").disabled');await capture('versions-header-publish.png');await js('document.getElementById("publish-open").click()');await until('document.getElementById("sync-dialog").open && document.getElementById("sync-dialog-title").textContent==="發布網站" && document.getElementById("settings").hidden');await until('document.querySelector("#sync-dialog [data-flow-action=cancel]") && !document.querySelector("#sync-dialog .flow-pending")');assert.equal(await js('document.querySelector("#sync-dialog [data-flow-action=confirm]")?.disabled??true'),true,'不勾選提醒不能發布');await capture('versions-publish-dialog.png');await js('document.querySelector("#sync-dialog [data-flow-action=cancel]").click()');await until('!document.getElementById("sync-dialog").open && !document.getElementById("publish-open").hidden');
 // Context changes cannot be hidden by a historical arrangement restore.
 await fs.appendFile(path.join(project,'trips/sample/theme.css'),'\n/* changed outside the app */\n');
 const refused=await js(`window.travelDesktop.restoreVersion({...conversationTarget(),versionId:${JSON.stringify(records[0].id)}})`);assert.equal(refused.code,'VERSION_CONTEXT_CHANGED');assert.equal(await fs.readFile(source,'utf8'),original);
 console.log(JSON.stringify({passed:true,initialVersion:true,appliedDirectly:true,changesViewable:true,actionsSurviveRestart:true,wholeRollbackExactBytes:true,redoHistoricalContent:true,undoButton:true,versionsPreserved:true,contextConflictRefused:true,fakeDataOnly:true}));
}).catch(async e=>{console.error(e);exitStatus=1;if(win&&!win.isDestroyed())console.error(await js('JSON.stringify({note:document.getElementById("notification").textContent,rows:[...document.querySelectorAll("#history-list button")].map(b=>[b.dataset.versionId,b.disabled]),msg:document.getElementById("history-message").textContent,open:document.getElementById("history-dialog").open,last:[...document.querySelectorAll(".message")].slice(-2).map(m=>m.textContent.slice(0,120))})').catch(()=>''));}).finally(async()=>{clearTimeout(timer);if(win&&!win.isDestroyed())win.destroy();await shutdown();if(root)await fs.rm(root,{recursive:true,force:true});app.exit(exitStatus);});
function pendingCount(state){return state.draft?1:0;}
