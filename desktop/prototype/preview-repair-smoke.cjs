// 預覽建不起來時不能只卡住：說出是哪個檔案、哪幾處沒過檢查；上次備份能用就給「回到上次備份」（先列清單再確認），
// 「複製給幫忙的人」只複製不含行程內容的摘要；資料格式太舊時改給「更新旅程資料夾」。
const {app,clipboard}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
if(!process.env.TRAVEL_PLANNER_TEST_ROOT)throw Error('Run preview repair smoke through the native smoke runner');
const root=require('node:fs').realpathSync(process.env.TRAVEL_PLANNER_TEST_ROOT);
const {createWindow,shutdown}=require('./main.cjs'),{createProjectStore}=require('./project-store.cjs'),{ProposalStore}=require('./proposals.cjs');
app.on('window-all-closed',()=>{});let win,status=0;
const js=async s=>{try{return await win.webContents.executeJavaScript(s);}catch(e){throw Error(s.slice(0,160)+' :: '+e.message);}};
async function until(s,tries=400){for(let i=0;i<tries;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,50));}throw Error('Preview repair condition: '+s);}
const repairButtons=()=>js('[...document.querySelectorAll("#preview-repair-actions [data-repair]")].map(b=>b.dataset.repair)');
app.whenReady().then(async()=>{
  const project=path.join(root,'project'),state=path.join(root,'state'),data=path.join(project,'trips/sample/data.js'),config=path.join(project,'trips/sample/trip.config.json');
  await fs.mkdir(path.join(project,'scripts'),{recursive:true});
  await fs.writeFile(path.join(project,'package.json'),JSON.stringify({name:'sample-project',version:'1.1.0'}));
  for(const f of ['build.js','check.js'])await fs.writeFile(path.join(project,'scripts',f),'throw Error("not executed")');
  await fs.cp(path.resolve(__dirname,'../../trips/_example'),path.join(project,'trips/sample'),{recursive:true});
  const {execFileSync}=require('node:child_process');const git=(...a)=>execFileSync('git',['-c','user.name=T','-c','user.email=t@example.invalid','-c','init.defaultBranch=main',...a],{cwd:project,stdio:'ignore'});
  git('init','-q');git('add','.');git('commit','-qm','base');
  // 備份之後資料被改壞（例如在別的編輯器改）：第 1 天的顏色不是色碼。
  const good=await fs.readFile(data,'utf8');
  await fs.writeFile(data,good.replace(/color: '#[0-9A-Fa-f]{6}'/,"color: 'secret-color'"));
  const store=createProjectStore(state);await store.connect({id:'repair-project',root:project});await store.select('repair-project','sample');
  const account=new EventEmitter();account.account={state:'connected',label:'測試帳號',version:'0.155.1'};
  account.connect=async()=>account.account;account.refresh=account.connect;account.stop=async()=>{};account.models=async()=>[{id:'fake-model',name:'Fake model',isDefault:true}];
  win=await createWindow({stateDirectory:state,codexAccount:account,makeProposals:d=>new ProposalStore(d,{checkPrivate:async()=>{}}),
    makeProvider:id=>{const a=new EventEmitter();a.account={state:'needs-login',provider:id};a.connect=async()=>a.account;a.refresh=a.connect;a.models=async()=>[];a.stop=async()=>{};return {account:a,editor:{active:null,stop:async()=>{}}};},
    makeEditor:()=>({active:null,stop:async()=>({requested:true}),generate:async({model})=>({model,threadId:'t',turnId:'u',summary:'收到',discussion:true})})});
  await js('setPreview(true)');

  // 1. 說清楚哪裡壞了，逐項問題收在「看詳細問題」；上次備份能用，所以第一顆是「回到上次備份」。
  await until('realPreview?.status==="error" && !document.getElementById("preview-repair").hidden');
  assert.match(await js('document.getElementById("preview-note").textContent'),/1 個地方沒通過檢查，所以還不能顯示預覽：每日行程與地點（data\.js）1 處/);
  assert.equal(await js('document.getElementById("preview-empty-title").textContent'),'預覽還不能顯示');
  assert.match(await js('document.getElementById("preview-problem-list").textContent'),/color 不是 hex/);
  assert.match(await js('document.getElementById("preview-backup-note").textContent'),/上次備份.*可以正常顯示/);
  assert.deepEqual(await repairButtons(),['last-backup','copy-report']);
  assert.equal(await js('document.querySelector("#preview-repair-actions button").classList.contains("primary")'),true);
  assert.equal(await js('document.getElementById("retry-preview").hidden'),false);
  assert.match(await js('document.getElementById("composer-note").textContent'),/打開右側預覽/);
  assert.equal(await js('document.getElementById("send-message").disabled'),true,'資料壞掉時 AI 讀不到行程，仍不能送出');

  // 2. 複製給幫忙的人：有版本與錯誤代碼，不含行程內容、旅程代號或電腦上的位置。
  await clipboard.writeText('');
  await js('document.querySelector("#preview-repair-actions [data-repair=copy-report]").click()');
  for(let i=0;i<100&&!(await clipboard.readText());i++)await new Promise(r=>setTimeout(r,50));
  const report=await clipboard.readText();
  assert.match(report,/INVALID_TRIP/);assert.match(report,/data\.js.*1 處/);
  for(const secret of ['secret-color','sample',project,root])assert.equal(report.includes(secret),false,'摘要不能含 '+secret);

  // 3. 回到上次備份：先列出會改哪些檔案，確認後才動；預覽恢復、可以送出。
  await js('document.querySelector("#preview-repair-actions [data-repair=last-backup]").click()');
  await until('document.getElementById("sync-dialog").open && document.querySelector("#sync-dialog [data-flow-action=confirm]") && document.getElementById("sync-dialog-body").textContent.includes("trips/sample/data.js")');
  assert.notEqual(await fs.readFile(data,'utf8'),good,'確認前不能改檔案');
  await js('document.querySelector("#sync-dialog [data-flow-action=confirm]").click()');
  await until('document.getElementById("sync-dialog-body").textContent.includes("已回到上次備份")');
  await js('document.querySelector("#sync-dialog [data-flow-action=done]").click()');
  assert.equal(await fs.readFile(data,'utf8'),good);
  await until('realPreview?.status==="ready" && document.getElementById("preview-repair").hidden && !document.getElementById("send-message").disabled',400);

  // 4. 壞掉的版本已經備份上去：回到上次備份也沒用，不給那顆按鈕，並說明原因。
  await fs.writeFile(data,good.replace(/color: '#[0-9A-Fa-f]{6}'/,"color: 'secret-color'"));git('commit','-qam','broken backup');
  await fs.writeFile(data,good.replace(/color: '#[0-9A-Fa-f]{6}'/,"color: 'other-color'"));
  await js('document.getElementById("retry-preview").click()');
  await until('realPreview?.status==="error" && !document.getElementById("preview-repair").hidden');
  assert.deepEqual(await repairButtons(),['copy-report']);
  assert.match(await js('document.getElementById("preview-backup-note").textContent'),/上次備份的版本也有問題/);

  // 5. 資料格式比 App 舊：第一步是更新旅程資料夾，不提議回到備份。
  await fs.writeFile(data,good);
  const cfg=JSON.parse(await fs.readFile(config,'utf8'));await fs.writeFile(config,JSON.stringify({...cfg,schemaVersion:0}));
  await js('document.getElementById("retry-preview").click()');
  await until('realPreview?.status==="error" && realPreview.diagnosis?.reason==="outdated"');
  assert.deepEqual(await repairButtons(),['project-update','copy-report']);
  assert.match(await js('document.getElementById("preview-note").textContent'),/更新旅程資料夾/);
  console.log(JSON.stringify({passed:true,explainsWhere:true,copiesDeidentified:true,lastBackupRestores:true,brokenBackupNotOffered:true,outdatedOffersUpdate:true}));
}).catch(async e=>{console.error(e);status=1;if(win&&!win.isDestroyed())console.error(await js('JSON.stringify({preview:realPreview&&{status:realPreview.status,message:realPreview.message,diagnosis:realPreview.diagnosis},note:document.getElementById("notification")?.textContent})').catch(()=>''));}).finally(async()=>{win?.destroy();try{await shutdown();}catch(error){console.error(error);status=1;}app.exit(status);});
