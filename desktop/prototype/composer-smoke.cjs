// 對話輸入區：選單在視窗失焦／回焦時不被重建（原生選單才不會閃爍）；送出時附件移進訊息；AI 建議自動切換範圍、按 Tab 帶入建議文字。
const {app}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
if(!process.env.TRAVEL_PLANNER_TEST_ROOT)throw Error('Run composer smoke through the native smoke runner');
const root=require('node:fs').realpathSync(process.env.TRAVEL_PLANNER_TEST_ROOT);
const {createWindow,shutdown}=require('./main.cjs'),{createProjectStore}=require('./project-store.cjs'),{parseLiteralModule}=require('@travel-planner/engine'),{ProposalStore}=require('./proposals.cjs');
app.on('window-all-closed',()=>{});let win,status=0;const calls=[];
const js=s=>win.webContents.executeJavaScript(s);
async function until(s,tries=200){for(let i=0;i<tries;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,50));}throw Error('Composer condition: '+s);}
app.whenReady().then(async()=>{
  const project=path.join(root,'project'),state=path.join(root,'state');
  await fs.mkdir(path.join(project,'scripts'),{recursive:true});
  await fs.writeFile(path.join(project,'package.json'),JSON.stringify({name:'sample-project',version:'1.1.0'}));
  for(const f of ['build.js','check.js'])await fs.writeFile(path.join(project,'scripts',f),'throw Error("not executed")');
  await fs.cp(path.resolve(__dirname,'../../trips/_example'),path.join(project,'trips/sample'),{recursive:true});
  // 真的 git repo：「尚未備份」與「全部不要」都靠它。
  const {execFileSync}=require('node:child_process');const git=(...a)=>execFileSync('git',['-c','user.name=T','-c','user.email=t@example.invalid','-c','init.defaultBranch=main',...a],{cwd:project,stdio:'ignore'});
  git('init','-q');git('add','.');git('commit','-qm','base');
  const store=createProjectStore(state);await store.connect({id:'composer-project',root:project});await store.select('composer-project','sample');
  const account=new EventEmitter();account.account={state:'connected',label:'測試帳號',version:'0.155.1'};
  account.connect=async()=>account.account;account.refresh=account.connect;account.stop=async()=>{};account.models=async()=>[{id:'fake-model',name:'Fake model',isDefault:true},{id:'other-model',name:'Other model'}];
  win=await createWindow({stateDirectory:state,codexAccount:account,makeProposals:d=>new ProposalStore(d,{checkPrivate:async()=>{}}),fetchReference:async url=>({url,text:'This is a verified example source for the trip and more.',checkedAt:new Date().toISOString()}),
    makeProvider:id=>{const a=new EventEmitter();a.account={state:'needs-login',provider:id};a.connect=async()=>a.account;a.refresh=a.connect;a.models=async()=>[];a.stop=async()=>{};return {account:a,editor:{active:null,stop:async()=>{}}};},
    makeEditor:()=>({active:null,stop:async()=>({requested:true}),generate:async({model,dayId,mode,text,snapshot,attachments})=>{calls.push({dayId,mode,attachments:(attachments||[]).length});const base={model,threadId:'t',turnId:'u'+calls.length};
      if(mode==='research')return {...base,summary:'查核完成',research:true,sources:[{url:'https://example.invalid/official',title:'官方網站',evidence:'This is a verified example source for the trip'}],unresolved:['停車場是否需要預約'],feasibility:'路線順序可行',privateNotes:''};
      // 自動判斷：使用者說「請套用修改」就同一輪直接出修改；AI 判斷調換順序影響車程，回報 needsResearch。
      if(text.includes('請套用修改')){const day=parseLiteralModule(snapshot.dataSource).DAYS[0];return {...base,summary:'已把第 1 天的順序對調。',needsResearch:true,replacementDays:[{...day,stops:[...day.stops].reverse()}]};}
      return {...base,summary:'整體建議',discussion:true,suggestion:{reply:'請套用修改'}};}})});
  await until('document.documentElement.dataset.ready==="true" && document.getElementById("chat-model").options.length===2 && !document.getElementById("edit-day").disabled');
  // 記錄兩個選單的子節點變動
  await js(`window.__mut={};for(const id of ['chat-model','edit-day','chat-provider','chat-effort']){window.__mut[id]=0;new MutationObserver(l=>window.__mut[id]+=l.length).observe(document.getElementById(id),{childList:true,subtree:true,attributes:true});}`);
  for(let i=0;i<3;i++){await js(`window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'))`);await new Promise(r=>setTimeout(r,700));}
  await js(`document.getElementById('chat-model').value='other-model';document.getElementById('chat-model').dispatchEvent(new Event('change'))`);await new Promise(r=>setTimeout(r,700));
  const mut=await js('JSON.stringify(window.__mut)');console.log('mutations',mut);
  assert.deepEqual(JSON.parse(mut),{'chat-model':0,'edit-day':0,'chat-provider':0,'chat-effort':0},'選單在失焦／回焦時被改動');
  // 貼上一張截圖 → 輸入框出現附件；送出後附件移到訊息泡泡，輸入框清空。
  await js(`(()=>{const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([png],'image.png',{type:'image/png'}));document.getElementById('message').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));})()`);
  await until('document.querySelectorAll("#composer-attachments .composer-attachment").length===1');
  // 滑鼠停在附件的 × 上：連拍畫面，內容要穩定（不閃爍）。
  const box=JSON.parse(await js('JSON.stringify(document.querySelector("#composer-attachments button").getBoundingClientRect())'));
  const x=Math.round(box.x+box.width/2),y=Math.round(box.y+box.height/2);win.webContents.sendInputEvent({type:'mouseMove',x,y});
  await new Promise(r=>setTimeout(r,400));const rect={x:Math.max(0,x-60),y:Math.max(0,y-30),width:120,height:60};const frames=new Set();
  for(let i=0;i<12;i++){frames.add((await win.webContents.capturePage(rect)).toPNG().toString('base64'));await new Promise(r=>setTimeout(r,120));}
  console.log('hover frames',frames.size);assert.equal(frames.size,1,'滑過附件的 × 時畫面有變動');
  win.webContents.sendInputEvent({type:'mouseMove',x:5,y:5});
  await js(`document.getElementById('message').value='這張截圖的行程可以參考嗎';document.getElementById('message').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  await until('document.querySelector(".message.user .message-attachment img") && document.getElementById("composer-attachments").hidden && document.getElementById("messages").textContent.includes("整體建議") && !document.getElementById("message").disabled');
  assert.equal(calls[0].dayId,null);assert.equal(calls[0].attachments,1,"附件要送給 AI");
  // AI 給下一句建議：範圍維持自動判斷，提示文字按 Tab 帶入。
  assert.equal(await js('document.getElementById("edit-day").value'),'');
  assert.match(await js('document.getElementById("message").placeholder'),/請套用修改.*Tab/);
  await js(`document.getElementById('message').focus();document.getElementById('message').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}))`);
  assert.equal(await js('document.getElementById("message").value'),'請套用修改');
  assert.doesNotMatch(await js('document.getElementById("message").placeholder'),/Tab/);
  // 說「請套用修改」：同一輪直接改好並保存到本機，不用切換範圍、不用再確認。
  const before=await fs.readFile(path.join(project,'trips/sample/data.js'),'utf8');
  await js(`document.getElementById('message').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  await until('document.querySelector(".message.assistant .applied-actions") && !document.getElementById("message").disabled');
  assert.equal(calls.at(-1).dayId,null);assert.equal(await js('Boolean(pendingProposal)'),false);assert.equal(await js('document.getElementById("proposal-review").hidden'),true);
  assert.notEqual(await fs.readFile(path.join(project,'trips/sample/data.js'),'utf8'),before,'檔案要直接改好');
  // AI 判斷需要查核：不擋保存，只在回覆下方提供「開始查核」。
  assert.match(await js('document.querySelector(".message.assistant:last-child").textContent'),/開始查核/);
  assert.equal(await js('Boolean(document.querySelector(".message.assistant:last-child .applied-actions [data-action=backup]"))'),true,'改好的訊息下方要能直接備份');
  // 查看修改對照：列出改了哪裡。
  await js('[...document.querySelectorAll(".applied-actions button")].find(b=>b.textContent==="查看修改對照").click()');
  await until('document.getElementById("changes-dialog").open && document.getElementById("change-list").textContent.includes("第 1 天")');
  assert.equal(await js('document.querySelector("#changes-dialog .review-tools").hidden'),true);
  await js('document.getElementById("changes-dialog").close()');
  // 回到修改前：檔案回到原本內容，並記成新的一版。
  await js('[...document.querySelectorAll(".applied-actions button")].find(b=>b.textContent.startsWith("回到修改前")).click()');
  // 回到修改前要重建預覽並記一版，CI 的機器比較慢：多給一點時間。
  await until('document.getElementById("messages").textContent.includes("已回到 V") && !document.getElementById("message").disabled',400);
  assert.equal(await fs.readFile(path.join(project,'trips/sample/data.js'),'utf8'),before,'回到修改前要還原檔案');
  // 再改一次，然後在「備份與發布」按「全部不要」：列出清單、再確認，檔案回到上次備份。
  await until('realPreview?.status==="ready" && !aiBusy && !document.getElementById("send-message").disabled',300);
  await js(`document.getElementById('message').value='請套用修改';document.getElementById('message').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  await until('document.querySelectorAll(".applied-actions").length>=3 && !document.getElementById("message").disabled');
  assert.notEqual(await fs.readFile(path.join(project,'trips/sample/data.js'),'utf8'),before);
  await js("openSettings('backup')");
  await until('!document.getElementById("backup-discard").hidden',300);
  await js('document.getElementById("backup-discard").click()');
  await until('document.getElementById("sync-dialog").open && document.querySelector("#sync-dialog [data-flow-action=confirm]") && document.getElementById("sync-dialog-body").textContent.includes("trips/sample/data.js")');
  await js('document.querySelector("#sync-dialog [data-flow-action=confirm]").click()');
  await until('document.getElementById("sync-dialog-body").textContent.includes("已回到上次備份")');
  await js('document.querySelector("#sync-dialog [data-flow-action=done]").click()');
  await until('!document.getElementById("sync-dialog").open && document.getElementById("backup-result").textContent.includes("已回到上次備份")');
  assert.equal(await fs.readFile(path.join(project,'trips/sample/data.js'),'utf8'),before,'全部不要要回到上次備份');
  await js('closeSettings()');
  // 附件留在參考資料，重新開啟對話也看得到那則訊息附了什麼。
  const saved=JSON.stringify(await js('selected.trip.conversation.filter(m=>m.role==="user").map(m=>m.attachments)'));assert.match(saved,/"kind":"image"/);
}).catch(async e=>{status=1;console.error(e);if(win&&!win.isDestroyed())console.error(await js('JSON.stringify({note:document.getElementById("notification")?.textContent,last:[...document.querySelectorAll(".message")].slice(-2).map(m=>m.textContent.slice(0,200)),pending:Boolean(pendingProposal)})').catch(()=>''));if(win&&!win.isDestroyed())console.error(JSON.stringify(await js('pendingProposal&&travelDesktop.applyProposal({projectId:pendingProposal.projectId,slug:pendingProposal.slug,proposalId:pendingProposal.id})').catch(e=>e.message)));}).finally(async()=>{await shutdown().catch(()=>{});app.exit(status);});
