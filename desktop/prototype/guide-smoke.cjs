// 住宿指南的一鍵搬移：備案裡有房東長文時出現提議卡 → 按下由 AI 整理 → 結果留成「搬移」提案（不自動保存）
// → 列出不見的連結 → 看過預覽才能保存 → 保存後提議卡消失，指南寫進 data.js。AI 是假的，資料全是合成的。
const {app}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
if(!process.env.TRAVEL_PLANNER_TEST_ROOT)throw Error('Run guide smoke through the native smoke runner');
const root=require('node:fs').realpathSync(process.env.TRAVEL_PLANNER_TEST_ROOT);
const {createWindow,shutdown}=require('./main.cjs'),{createProjectStore}=require('./project-store.cjs'),{parseLiteralModule}=require('@travel-planner/engine'),{ProposalStore}=require('./proposals.cjs');
const {replaceDay}=require('../../packages/engine/day-edit.cjs');
app.on('window-all-closed',()=>{});let win,status=0;const calls=[],submitted=[];
const js=s=>win.webContents.executeJavaScript(s);
async function until(s,tries=300){for(let i=0;i<tries;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,50));}throw Error('Guide condition: '+s);}
const HOST_TEXT='房東說：15:00 後入住，鑰匙在玄關鑰匙盒。停車在建物後方第 2 格，從縣道右轉進小路。附近的範例超市 https://example.invalid/super 走路 5 分鐘，生鮮熟食都有；晚餐可以去範例拉麵 https://example.invalid/ramen ，泡湯推薦範例湯屋，露天風呂很舒服。';
const guide={id:'inn-a-guide',stay:'innA',days:[1,2,3],source:{type:'host',label:'房東提供'},
  sections:[{id:'checkin',kind:'checkin',steps:['15:00 後入住。','鑰匙在玄關鑰匙盒。']},{id:'parking',kind:'parking',steps:['從縣道右轉進小路。','停在建物後方第 2 格。']}],
  lists:[{id:'shopping',kind:'shopping',items:[{id:'super-a',name:'範例超市',tags:['生鮮','熟食'],links:[{kind:'official',label:'官網',url:'https://example.invalid/super'}]}]},
    {id:'dining',kind:'dining',items:[{id:'ramen-a',name:'範例拉麵'}]},{id:'onsen',kind:'onsen',items:[{id:'onsen-a',name:'範例湯屋',tags:['露天']}]}]};
app.whenReady().then(async()=>{
  const project=path.join(root,'project'),state=path.join(root,'state'),data=path.join(project,'trips/sample/data.js');
  await fs.mkdir(path.join(project,'scripts'),{recursive:true});
  await fs.writeFile(path.join(project,'package.json'),JSON.stringify({name:'sample-project',version:'1.2.0'}));
  for(const f of ['build.js','check.js'])await fs.writeFile(path.join(project,'scripts',f),'throw Error("not executed")');
  await fs.cp(path.resolve(__dirname,'../../trips/_example'),path.join(project,'trips/sample'),{recursive:true});
  // 舊資料的樣子：房東資訊整段塞在第一天的備案裡。
  const original=await fs.readFile(data,'utf8');const day1=parseLiteralModule(original).DAYS[0];
  const seeded=replaceDay(original,1,{...day1,alts:[...(day1.alts||[]),{title:'房東資訊',body:HOST_TEXT}]}).source;await fs.writeFile(data,seeded);
  const {execFileSync}=require('node:child_process');const git=(...a)=>execFileSync('git',['-c','user.name=T','-c','user.email=t@example.invalid','-c','init.defaultBranch=main',...a],{cwd:project,stdio:'ignore'});
  git('init','-q');git('add','.');git('commit','-qm','base');
  const store=createProjectStore(state);await store.connect({id:'guide-project',root:project});await store.select('guide-project','sample');
  const account=new EventEmitter();account.account={state:'connected',label:'測試帳號',version:'0.155.1'};
  account.connect=async()=>account.account;account.refresh=account.connect;account.stop=async()=>{};account.models=async()=>[{id:'fake-model',name:'Fake model',isDefault:true}];
  win=await createWindow({stateDirectory:state,codexAccount:account,makeProposals:d=>new ProposalStore(d,{checkPrivate:async()=>{}}),
    makeProvider:id=>{const a=new EventEmitter();a.account={state:'needs-login',provider:id};a.connect=async()=>a.account;a.refresh=a.connect;a.models=async()=>[];a.stop=async()=>{};return {account:a,editor:{active:null,stop:async()=>{}}};},
    makeIssueReporter:()=>{const {IssueReportService}=require('./services/issue-report.cjs');return new IssueReportService({run:async(bin,args)=>{submitted.push(args);return {stdout:'https://github.com/wangch15/travel-planner/issues/77\n'};}});},
    makeEditor:()=>({active:null,stop:async()=>({requested:true}),generate:async({model,dayId,mode,text,snapshot,thread})=>{calls.push({dayId,mode,text,thread});
      // 使用者要回報：AI 回 appAction=report 與內容；故意把行程裡的地名寫進去，App 要去識別化。
      if(text.startsWith('我想回報給 App 開發者'))return {model,threadId:'t',turnId:'r'+calls.length,summary:'我整理好了，可以按下方的按鈕回報。',discussion:true,appAction:'report',capabilityGap:{missing:'希望 AI 能直接修改全程總覽與行前清單。',handoffPrompt:'在範例民宿 A 這趟 10/11 的行程裡發現的；請開放 OVERVIEW／CHECKLIST 的編輯。',kind:'feature'}};
      // 假 AI：照指示把長文拆成指南，並把原本那段備案拿掉；故意漏掉拉麵的網址，App 要提醒。
      // 第一次故意把來源標籤寫太長，App 要自己把問題交回給 AI 修正，不能丟給使用者。
      const day=parseLiteralModule(snapshot.dataSource).DAYS[0];
      const first=calls.length===1,label=first?'房東'.repeat(40):'房東提供';
      return {model,threadId:'t',turnId:'u'+calls.length,summary:first?'整理好了。':'已把房東資訊整理成住宿指南。',replacementDays:[{...day,alts:day.alts.filter(a=>a.title!=='房東資訊')}],stayGuides:[{...guide,source:{type:'host',label}}]};}})});
  await until('document.documentElement.dataset.ready==="true" && !document.getElementById("guide-suggestion").hidden');
  assert.match(await js('document.getElementById("guide-suggestion-text").textContent'),/第 1 天.*「房東資訊」.*住宿指南/);
  const shots=path.resolve(__dirname,'../../.local/desktop-prototype');await fs.mkdir(shots,{recursive:true});
  await new Promise(r=>setTimeout(r,800));
  await fs.writeFile(path.join(shots,'guide-suggestion.png'),(await win.webContents.capturePage()).toPNG());
  await js('document.getElementById("guide-suggestion-run").click()');
  await until('!document.getElementById("proposal-review").hidden && document.getElementById("guide-suggestion").hidden');
  assert.equal(calls.length,2,'第一次沒過資料檢查，App 自動請 AI 修正一次');assert.equal(calls[0].dayId,null);assert.match(calls[0].text,/第 1 天備案「房東資訊」.*保留/);
  assert.match(calls[1].text,/沒有通過 App 的資料檢查[\s\S]*source\.label 超過 60 字/);assert.deepEqual(calls[1].thread,{id:'t',accountKey:calls[1].thread.accountKey,lastTurnId:'u1'},'修正在同一段對話裡進行');
  assert.equal(await js('document.getElementById("messages").textContent.includes("資料檢查")'),false,'使用者不會看到格式錯誤');
  assert.equal(await js('document.getElementById("proposal-heading").textContent'),'搬移到住宿指南 · 尚未保存');
  assert.match(await js('document.getElementById("proposal-note").textContent'),/少了 1 個連結：https:\/\/example\.invalid\/ramen/);
  assert.equal(await fs.readFile(data,'utf8'),seeded,'搬移提案不能自動保存');
  await new Promise(r=>setTimeout(r,800));await fs.writeFile(path.join(shots,'guide-migration-proposal.png'),(await win.webContents.capturePage()).toPNG());
  // 看過候選預覽才能保存；搬移只動備案文字，不需要先查核。
  await until('pendingProposal?.previewLoaded===true && !document.getElementById("save-proposal").disabled');
  assert.equal(await js('document.getElementById("save-proposal").textContent'),'確認保存到你的行程');
  await js('document.getElementById("save-proposal").click()');
  await until('document.getElementById("proposal-review").hidden && document.getElementById("messages").textContent.includes("已保存到這台電腦上的行程檔案")');
  const saved=parseLiteralModule(await fs.readFile(data,'utf8'));
  assert.equal(saved.STAY_GUIDES[0].id,'inn-a-guide');
  assert.equal(saved.DAYS[0].alts.some(a=>a.title==='房東資訊'),false);
  assert.deepEqual(saved.DAYS.map(d=>[d.id,d.date,d.stops]),parseLiteralModule(seeded).DAYS.map(d=>[d.id,d.date,d.stops]),'時間軸與日期不變');
  // 重新載入預覽後，長文已經搬走，提議卡不會再出現。
  await until('realPreview?.status==="ready"');
  assert.equal(await js('document.getElementById("guide-suggestion").hidden'),true);
  // 回報問題或建議：從對話選單帶入開頭，AI 整理後回覆下方出現卡片；視窗裡是去識別化的完整內容，按送出才開 issue。
  await js(`document.getElementById('message').value='我想回報給 App 開發者：總覽不能改';document.getElementById('message').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  await until('[...document.querySelectorAll(".action-card")].some(c=>c.textContent.includes("回報給開發者"))');
  await js('[...document.querySelectorAll(".action-card button")].find(b=>b.textContent==="檢查回報內容").click()');
  await until('document.getElementById("report-dialog").open');
  const preview=await js('document.getElementById("report-preview").textContent');
  assert.match(preview,/^\[功能建議\] 希望 AI 能直接修改全程總覽與行前清單/);
  assert.match(await js('document.getElementById("report-labels").textContent'),/分類：功能建議.*enhancement/);
  assert.equal(preview.includes('範例民宿 A'),false,'地名要去掉');assert.equal(preview.includes('10/11'),false,'日期要去掉');
  assert.equal(submitted.length,0,'打開視窗不會送出');
  await js('document.getElementById("submit-report").click()');
  await until('!document.getElementById("view-report").hidden');
  assert.equal(submitted.length,1);assert.deepEqual(submitted[0].slice(0,3),['issue','create','-R']);assert.equal(submitted[0][3],'wangch15/travel-planner');
  assert.equal(submitted[0].includes('範例民宿 A'),false);assert.deepEqual(submitted[0].slice(-2),['--label','enhancement'],'自動分類成功能建議');
  await js('document.getElementById("report-dialog").close()');
  console.log(JSON.stringify({passed:true,reportFromChat:true,reportDeidentified:true,reportSentOnlyAfterConfirm:true,selfRepairedInvalidAnswer:true,suggestionShown:true,migrationHeldForPreview:true,lostLinkWarned:true,noResearchGateForTextMove:true,savedAfterPreview:true,timelineUnchanged:true,suggestionClearedAfterSave:true}));
}).catch(async e=>{status=1;console.error(e);if(win&&!win.isDestroyed())console.error(await js('JSON.stringify({note:document.getElementById("notification")?.textContent,proposal:document.getElementById("proposal-note")?.textContent,last:[...document.querySelectorAll(".message")].slice(-2).map(m=>m.textContent.slice(0,300))})').catch(()=>''));})
  .finally(async()=>{await shutdown().catch(()=>{});app.exit(status);});
