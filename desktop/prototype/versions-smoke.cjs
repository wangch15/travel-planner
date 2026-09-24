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
async function until(source){for(let i=0;i<300;i++){if(await js(source))return;await new Promise(r=>setTimeout(r,30));}throw Error('Version workflow timeout: '+source);}
async function capture(name){await fs.mkdir(path.resolve(__dirname,'../../.local/desktop-prototype'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../.local/desktop-prototype',name),(await win.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{
 timer=setTimeout(()=>app.exit(1),60000);root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'travel-versions-')));
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
 async function send(dayId){await js(`document.getElementById('edit-day').value=${JSON.stringify(String(dayId))};document.getElementById('edit-day').dispatchEvent(new Event('change'));document.getElementById('message').value='提出這次修改';document.getElementById('chat-form').requestSubmit()`);await until('pendingProposal && !aiBusy');}
 async function save(){if(await js('document.getElementById("changes-dialog").open'))await js('document.getElementById("done-changes").click()');await until('!document.getElementById("save-proposal").disabled');await js('document.getElementById("save-proposal").click()');await until('!pendingProposal && realPreview?.status === "ready" && !aiBusy');}
 async function restore(id){await js('document.getElementById("versions-open").click()');await until('document.querySelectorAll("#history-list .history-row").length > 0');await js(`document.querySelector('[data-version-id="${id}"]').click()`);await until('pendingProposal?.kind === "restore" && !aiBusy');}
 await launch();await js('setTheme("light")');assert.equal((await history.read(target)).revisions.length,1);assert.equal(await fs.readFile(source,'utf8'),original);
 await send(originalData.DAYS[0].id);assert.equal(pendingCount(await history.read(target)),1);assert.equal((await history.read(target)).revisions.length,1);
 const firstProposalID=await js('pendingProposal.id');await js('document.getElementById("review-changes").click()');await capture('versions-diff-light.png');
 await js(`document.querySelector('[data-change-key="${originalData.DAYS[0].id}:lead"]').click()`);await until('pendingProposal.selectedKeys.length === 1 && !aiBusy');assert.notEqual(await js('pendingProposal.id'),firstProposalID);
 await js('document.getElementById("done-changes").click()');
 const closed=new Promise(r=>win.once('closed',r));win.close();await closed;await launch();
 assert.equal(await js('pendingProposal.selectedKeys.length'),1);assert.notEqual(await js('pendingProposal.id'),firstProposalID);assert.equal(await fs.readFile(source,'utf8'),original);
 await save();let records=(await history.read(target)).revisions;assert.equal(records.length,2);assert.equal(parseLiteralModule(records[1].source).DAYS[0].title,'新版標題');assert.equal(parseLiteralModule(records[1].source).DAYS[0].lead,originalData.DAYS[0].lead);
 await send(originalData.DAYS[1].id);await save();records=(await history.read(target)).revisions;assert.equal(records.length,3);const version3=records[2];
 await js('setTheme("dark")');await restore(records[0].id);await capture('versions-restore-dark.png');
 await js(`document.querySelector('[data-change-key="${originalData.DAYS[1].id}:lead"]').click()`);await until('pendingProposal.selectedKeys.length === 1 && !aiBusy');await save();
 let current=parseLiteralModule(await fs.readFile(source,'utf8'));assert.equal(current.DAYS[0].title,originalData.DAYS[0].title);assert.equal(current.DAYS[1].lead,'保留最新的第二天說明');
 await restore(records[0].id);await save();assert.equal(await fs.readFile(source,'utf8'),original);
 await restore(version3.id);await save();assert.equal(await fs.readFile(source,'utf8'),version3.source);
 records=(await history.read(target)).revisions;assert.equal(records.length,6);assert.deepEqual(records.map(r=>r.kind),['initial','save','save','restore','restore','restore']);
 await js('document.getElementById("versions-open").click()');await until('document.querySelectorAll("#history-list .history-row").length === 6');await capture('versions-history-dark.png');await js('document.getElementById("close-history").click()');
 // 發布入口只帶到設定的「公開網站」分頁，不直接發布。
 await until('!document.getElementById("publish-open").hidden && !document.getElementById("publish-open").disabled');await capture('versions-header-publish.png');await js('document.getElementById("publish-open").click()');await until('!document.getElementById("settings").hidden && !document.getElementById("setting-publish").hidden && document.getElementById("setting-backup").hidden');assert.equal(await js('document.getElementById("publish-confirm").hidden'),true);await js('closeSettings()');await until('document.getElementById("settings").hidden && !document.getElementById("publish-open").hidden');
 // Delayed discard owns the operation lock until disk and UI agree.
 await restore(records[0].id);await js('document.getElementById("done-changes").click()');
 const proposalID=await js('pendingProposal.id');holdDiscard=true;const started=new Promise(resolve=>{discardStarted=resolve;});
 await js('document.getElementById("discard-proposal").click()');await started;
 assert.equal(await js('document.getElementById("review-changes").disabled && document.getElementById("save-proposal").disabled'),true);
 for(const call of [
   `window.travelDesktop.selectProposalChanges({...conversationTarget(),proposalId:${JSON.stringify(proposalID)},selectedKeys:[]})`,
   `window.travelDesktop.applyProposal({...conversationTarget(),proposalId:${JSON.stringify(proposalID)}})`,
   `window.travelDesktop.restoreVersion({...conversationTarget(),versionId:${JSON.stringify(records[0].id)}})`
 ])assert.equal((await js(call)).code,'AI_BUSY');
 holdDiscard=false;releaseDiscard();await until('!pendingProposal && !aiBusy && realPreview?.status === "ready"');
 assert.equal((await history.read(target)).draft,null);assert.equal(await fs.readFile(source,'utf8'),version3.source);
 // Context changes cannot be hidden by a historical arrangement restore.
 await fs.appendFile(path.join(project,'trips/sample/theme.css'),'\n/* changed outside the app */\n');
 const refused=await js(`window.travelDesktop.restoreVersion({...conversationTarget(),versionId:${JSON.stringify(records[0].id)}})`);assert.equal(refused.code,'VERSION_CONTEXT_CHANGED');assert.equal(await fs.readFile(source,'utf8'),version3.source);
 console.log(JSON.stringify({passed:true,initialVersion:true,selectiveAcceptance:true,pendingRestoredAfterRestart:true,multiDayPartialRollback:true,wholeRollbackExactBytes:true,redoHistoricalContent:true,versionsPreserved:true,contextConflictRefused:true,discardOverlapRejected:true,fakeDataOnly:true}));
}).catch(e=>{console.error(e);exitStatus=1;}).finally(async()=>{clearTimeout(timer);if(win&&!win.isDestroyed())win.destroy();await shutdown();if(root)await fs.rm(root,{recursive:true,force:true});app.exit(exitStatus);});
function pendingCount(state){return state.draft?1:0;}
