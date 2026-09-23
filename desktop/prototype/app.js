/* Workbench prototype: real projects are read-only; demo conversations stay in memory. */
const $ = id => document.getElementById(id);
let project = null;
let selected = null;
const demos = [];
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const narrowWindow = window.matchMedia('(max-width: 700px)');
document.body.dataset.platform = window.travelDesktop?.platform || 'browser';
const paneWidths = { sidebar:240, preview:360 };
const ui = { sidebar: !narrowWindow.matches, preview: false, theme: 'system', setting: 'projects', syncTab:'backup' };
let toastTimer;
let settingsReturnFocus;
const settingsScroll = {};
let previewFrame;
let realPreview = null;
let previewRequest = 0;
let selectionReady = Promise.resolve();
let accountState = { state:window.travelDesktop?'checking':'disconnected' };
let activeProvider='codex';
let accountRequest=0;
const tripExpanded=new Map();
let aiBusy = false;
let savingProposal = false;
let pendingProposal = null;
let proposalBusy=false;
let modelRequest = 0;
let draftTimer;
let preferenceWrite = Promise.resolve(true);
let conversationLoading = false;
let conversationError = false;
let tripGroupOpen = true;
try { const stored = localStorage.getItem('travel-planner.theme'); if (['system', 'light', 'dark'].includes(stored)) ui.theme = stored; } catch { /* Preference storage is optional. */ }
const issues = {
  'workspace-busy': '請先停止目前的 AI 工作，再切換專案。',
  'workspace-pending-proposal': '請先確認或放棄目前的提案，再切換專案。',
  'schema-unsupported': '資料格式版本尚未支援，需要另行確認相容性。',
  'title-invalid': '旅程名稱缺漏或格式不符。', 'dates-invalid': '日期缺漏或格式不符。',
  'deployment-invalid': '部署設定缺漏或格式不符。', 'data-files-missing': '部分行程資料檔尚未齊全。',
  'config-invalid': '設定檔不是可讀取的 JSON 物件。', 'config-unreadable': '設定檔缺漏或無法讀取。',
  'file-too-large': '設定檔超過目前可檢查的大小。', 'linked-path': '這個路徑包含連結，原型不會跟隨讀取。',
};
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function notify(message) {
  clearTimeout(toastTimer);
  $('notification').textContent = message;
  $('notification').hidden = !message;
  if (message) toastTimer = setTimeout(() => { $('notification').hidden = true; }, 6500);
}
function currentTheme() { return ui.theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : ui.theme; }
function renderTheme() {
  const mode = currentTheme();
  document.documentElement.dataset.theme = mode;
  const logo = `assets/brand/travel-planner-mark-on-${mode}-v2.svg`;
  document.querySelectorAll('[data-logo]').forEach(image => { image.src = logo; });
  $('favicon').href = `assets/brand/favicon-${mode}.svg`;
  $('touch-icon').href = `assets/brand/${mode}/icon-180.png`;
  $('web-manifest').href = `manifest-${mode}.webmanifest`;
  $('theme-color').content = mode === 'dark' ? '#191919' : '#ffffff';
  document.querySelector(`input[name="theme"][value="${ui.theme}"]`).checked = true;
  renderPreview();
}
async function setTheme(mode) {
  if (!['system', 'light', 'dark'].includes(mode)) return;
  ui.theme = mode;
  try { localStorage.setItem('travel-planner.theme', mode); } catch { /* Preference storage is optional. */ }
  renderTheme();
  if (window.travelDesktop?.setTheme) {
    try { await window.travelDesktop.setTheme(mode); renderTheme(); }
    catch { notify('介面主題已切換，系統視窗主題未能同步。'); }
  }
}
systemTheme.addEventListener('change', renderTheme);
document.querySelectorAll('input[name="theme"]').forEach(input => input.addEventListener('change', () => setTheme(input.value)));
function setSidebar(open) {
  ui.sidebar = open;
  $('workbench').dataset.sidebar = open ? 'open' : 'closed';
  $('sidebar-content').hidden = !open;
  $('sidebar-rail').hidden = open;
  $('sidebar-resizer').hidden = !open;
  $('sidebar-scrim').hidden = true;
  layoutPanels();
  $('sidebar-toggle').setAttribute('aria-expanded', String(open));
  const label = open ? '收合旅程列表' : '展開旅程列表';
  $('sidebar-toggle').setAttribute('aria-label', label); $('sidebar-toggle').title = label;
}
function setPreview(open) {
  ui.preview = open;
  $('workbench').dataset.preview = open ? 'open' : 'closed';
  $('preview-panel').hidden = !open;
  $('preview-toggle').setAttribute('aria-expanded', String(open));
  const label = open ? '關閉預覽' : '開啟預覽';
  $('preview-toggle').setAttribute('aria-label', label); $('preview-toggle').title = label;
  layoutPanels();
  if (open) renderPreview();
}
// Reserve the center explicitly: hidden siblings must never change its grid placement.
function layoutPanels() {
  const total = $('workbench').clientWidth || innerWidth;
  const chatMin = Math.min(320, Math.max(0, total - 52));
  const previewMin = ui.preview ? Math.min(260, Math.max(0, total - chatMin - 52)) : 0;
  const sidebarMax = Math.max(52, Math.min(420, total - chatMin - previewMin));
  const sidebar = ui.sidebar ? Math.min(paneWidths.sidebar, sidebarMax) : 52;
  const previewMax = Math.max(0, total - chatMin - sidebar);
  const preview = ui.preview ? Math.min(Math.max(previewMin, paneWidths.preview), previewMax) : 0;
  $('workbench').style.setProperty('--sidebar-width', `${sidebar}px`);
  $('workbench').style.setProperty('--preview-width', `${preview}px`);
  for (const [name, value, min, max] of [['sidebar',sidebar,Math.min(180,sidebarMax),sidebarMax],['preview',preview,previewMin,previewMax]]) {
    const handle = $(`${name}-resizer`);
    handle.setAttribute('aria-valuemin', Math.round(min));
    handle.setAttribute('aria-valuemax', Math.round(max));
    handle.setAttribute('aria-valuenow', Math.round(value));
  }
}
function resizePane(name, value) {
  const handle = $(`${name}-resizer`);
  paneWidths[name] = Math.min(Number(handle.getAttribute('aria-valuemax')), Math.max(Number(handle.getAttribute('aria-valuemin')), value));
  layoutPanels();
}
for (const name of ['sidebar', 'preview']) {
  const handle = $(`${name}-resizer`);
  let drag = null;
  handle.onpointerdown = event => {
    if (event.button !== 0) return;
    drag = {x:event.clientX, width:Number(handle.getAttribute('aria-valuenow'))};
    handle.setPointerCapture(event.pointerId); document.body.classList.add('resizing'); event.preventDefault();
  };
  handle.onpointermove = event => {
    if (drag) resizePane(name, drag.width + (event.clientX-drag.x) * (name === 'sidebar' ? 1 : -1));
  };
  const finish = () => { drag=null; document.body.classList.remove('resizing'); };
  handle.onpointerup = finish; handle.onpointercancel = finish; handle.onlostpointercapture = finish;
  handle.ondblclick = () => resizePane(name, name === 'sidebar' ? 240 : 360);
  handle.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const value = event.key === 'Home' ? Number(handle.getAttribute('aria-valuemin')) : event.key === 'End' ? Number(handle.getAttribute('aria-valuemax')) : Number(handle.getAttribute('aria-valuenow')) + (event.key === 'ArrowRight' ? 20 : -20) * (name === 'sidebar' ? 1 : -1);
    resizePane(name, value);
  };
}
window.addEventListener('resize', layoutPanels);
$('sidebar-toggle').onclick = () => setSidebar(!ui.sidebar);
$('sidebar-scrim').onclick = () => { setSidebar(false); $('sidebar-toggle').focus(); };
narrowWindow.addEventListener('change', () => setSidebar(ui.sidebar));
$('preview-toggle').onclick = () => setPreview(!ui.preview);
$('preview-close').onclick = () => { setPreview(false); $('preview-toggle').focus(); };
function openSettings(section = ui.setting) {
  if (!$('settings').hidden) { settingTab(section); return; }
  settingsReturnFocus = document.activeElement;
  $('workbench').hidden = true;
  $('settings').hidden = false;
  $('preview-toggle').hidden = true;
  $('versions-open').hidden=true;
  document.querySelector('.chat-heading').hidden=true;
  $('settings-heading').hidden=false;closeActionMenu(false);
  settingTab(section,false);
  $('back-to-trip').focus();
}
function settingTab(section, rememberPosition=true) {
  if(['backup','publish'].includes(section)){ui.syncTab=section;section='sync';}
  const content=document.querySelector('.settings-content');
  if(rememberPosition)settingsScroll[ui.setting]=content.scrollTop;
  ui.setting = section;
  for (const name of ['projects','appearance','ai','about','sync','tools']) $(`setting-${name}`).hidden = section !== name;
  document.querySelectorAll('[data-setting]').forEach(button => {
    if (button.dataset.setting === section) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  renderProject();
  content.scrollTop=settingsScroll[section]||0;
  $('setting-backup').hidden=ui.syncTab!=='backup';$('setting-publish').hidden=ui.syncTab!=='publish';
  document.querySelectorAll('[data-sync-tab]').forEach(b=>{const current=b.dataset.syncTab===ui.syncTab;b.setAttribute('aria-selected',String(current));b.tabIndex=current?0:-1;});
  window.onFeatureSetting?.(section==='sync'?ui.syncTab:section);
}
function closeSettings() {
  settingsScroll[ui.setting]=document.querySelector('.settings-content').scrollTop;
  document.querySelector('.chat-heading').hidden=false;
  $('settings-heading').hidden=true;
  $('settings').hidden = true;
  $('workbench').hidden = false;
  $('preview-toggle').hidden = false;
  layoutPanels();updateComposer();
  if (settingsReturnFocus?.isConnected && settingsReturnFocus.offsetParent !== null) settingsReturnFocus.focus();
  else $('sidebar-toggle').focus();
}
$('open-settings').onclick = () => openSettings();
$('welcome-connect').onclick = () => openSettings('projects');
$('back-to-trip').onclick = closeSettings;
document.querySelectorAll('[data-setting]').forEach(button => { button.onclick = () => settingTab(button.dataset.setting); });
function dateLabel(trip) { return trip.dates ? `${trip.dates.start} — ${trip.dates.end || '回程未定'}` : '日期未定'; }
function facts(target, rows) {
  target.replaceChildren();
  for (const [label, value] of rows) target.append(el('dt', label), el('dd', value));
}
function tripKey(trip,demo=false){return demo?'demo:'+trip.id:(project?.projectId||'')+':'+trip.slug;}
function icon(name){const node=document.createElementNS('http://www.w3.org/2000/svg','svg');node.classList.add('icon');node.setAttribute('aria-hidden','true');const use=document.createElementNS(node.namespaceURI,'use');use.setAttribute('href','#i-'+name);node.append(use);return node;}
function moreButton(label,items){const b=el('button',undefined,'icon-button row-more');b.type='button';b.setAttribute('aria-label',label);b.title=label;b.setAttribute('aria-haspopup','menu');b.append(icon('more'));b.onclick=e=>{e.stopPropagation();openActionMenu(b,items());};return b;}
function tripMenu(trip,demo){const blocked=aiBusy||Boolean(pendingProposal)||Boolean(window.hasMaterialization?.());return [
  {label:'開啟旅程',icon:'folder',disabled:blocked,action:()=>selectTrip(trip,demo)},
  ...(!demo?[{label:'新增對話',icon:'plus',disabled:blocked,action:()=>window.newTripConversation?.(trip)}]:[]),
  {separator:true},{label:demo?'刪除示範旅程':'移除旅程…',icon:'trash',danger:true,disabled:blocked,action:()=>window.requestTripRemoval?.(trip,demo)}];}
function navigation() {
  const query=$('trip-search').value.trim().toLocaleLowerCase();
  const conversationPanel=$('conversation-sidebar');conversationPanel.remove();
  $('trip-group-toggle').hidden=true;$('trips').hidden=false;
  $('trips').replaceChildren();$('demo-trips').replaceChildren();$('demo-heading').hidden=true;
  const rows=[...(project?.trips||[]).map(trip=>({trip,demo:false})),...demos.map(trip=>({trip,demo:true}))];let found=0;
  for(const {trip,demo} of rows){
    if(query&&!`${trip.title} ${dateLabel(trip)}`.toLocaleLowerCase().includes(query))continue;found++;
    const key=tripKey(trip,demo),expanded=tripExpanded.get(key)??selected?.trip===trip;
    const group=el('section',undefined,'journey-group');group.dataset.trip=demo?trip.id:trip.slug;
    const row=el('div',undefined,'journey-row'),toggle=el('button',undefined,'icon-button journey-toggle');toggle.append(icon('chevron'));toggle.setAttribute('aria-label',(expanded?'收合':'展開')+trip.title);toggle.setAttribute('aria-expanded',String(expanded));toggle.onclick=()=>{tripExpanded.set(key,!expanded);navigation();};
    const main=el('button',undefined,'trip-button');main.title=trip.title;main.append(icon('folder'),el('span',trip.title,'trip-name'));if(demo)main.append(el('small','示範','demo-tag'));if(selected?.trip===trip)main.setAttribute('aria-current','page');main.onclick=()=>{tripExpanded.set(key,true);selectTrip(trip,demo);};
    const more=moreButton(trip.title+'的更多操作',()=>tripMenu(trip,demo));row.append(toggle,main);if(!demo){const add=el('button',undefined,'icon-button row-more');add.append(icon('plus'));add.setAttribute('aria-label','在'+trip.title+'新增對話');add.title='新增對話';add.onclick=()=>window.newTripConversation?.(trip);row.append(add);}row.append(more);row.oncontextmenu=e=>openActionMenu(more,tripMenu(trip,demo),e);group.append(row);
    const children=el('div',undefined,'journey-conversations');children.hidden=!expanded;group.append(children);
    if(selected?.trip===trip&&!demo){children.append(conversationPanel);conversationPanel.hidden=false;}
    else if(expanded&&demo){const b=el('button','示範對話','conversation-button');b.prepend(icon('chat'));b.onclick=()=>selectTrip(trip,true);children.append(b);}
    else if(expanded)window.populateTripConversations?.(trip,children);
    $('trips').append(group);
  }
  if(!conversationPanel.isConnected){conversationPanel.hidden=true;$('conversation-storage').append(conversationPanel);}
  $('empty-trips').hidden=rows.length>0;$('search-empty').hidden=!query||found>0;
  window.renderSidebarConversations?.();
}
$('trip-search').oninput=navigation;
$('trip-group-toggle').onclick=()=>{};
$('rail-search').onclick=()=>{setSidebar(true);$('trip-search').focus();};
$('rail-new').onclick=()=>newTripModal();
$('rail-settings').onclick=()=>openSettings();
$('sidebar-ai').onclick=()=>openSettings('ai');
if(window.travelDesktop?.platform !== 'darwin')$('search-shortcut').textContent='Ctrl K';
for(const id of ['open-settings','rail-settings'])$(id).title=window.travelDesktop?.platform==='darwin'?'設定（⌘ ,）':'設定（Ctrl ,）';
document.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]') || event.isComposing)return;
  if((event.metaKey||event.ctrlKey)&&event.key===','){event.preventDefault();openSettings();return;}
  if(event.key==='Escape'&&!$('settings').hidden){event.preventDefault();closeSettings();return;}
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&!$('new-dialog').open){
    event.preventDefault();if(!$('settings').hidden)closeSettings();setSidebar(true);$('trip-search').focus();
  }
});

const settingsOpenTrips=new Set();
function renderProject() {
  $('project-empty').hidden=Boolean(project);$('project-summary').hidden=!project;
  $('sync-trip-name').textContent=selected&&!selected.demo?selected.trip.title:'請先在工作台選擇旅程';
  if(!project)return;
  $('summary-title').textContent=project.projectName;$('summary-path').textContent=project.root;$('settings-trip-count').textContent=project.trips.length+' 趟';
  facts($('summary-facts'),[['專案版本',project.engineVersion||'未知'],['私人備份','備份前會重新核對帳號與專案私有狀態']]);
  $('summary-message').textContent='連接時只讀取基本資訊；完整資料會在開啟旅程預覽時驗證。';$('summary-trips').replaceChildren();
  for(const trip of project.trips){const key=project.projectId+':'+trip.slug,row=el('details',undefined,'project-trip trip-row');row.open=settingsOpenTrips.has(key);row.ontoggle=()=>{if(row.open)settingsOpenTrips.add(key);else settingsOpenTrips.delete(key);};
    const heading=el('summary'),copy=el('span',undefined,'trip-setting-label');copy.append(el('strong',trip.title),el('small',dateLabel(trip)));heading.append(icon('folder'),copy,icon('chevron'));row.append(heading);
    const body=el('div',undefined,'trip-setting-body'),list=el('dl',undefined,'facts');facts(list,[['資料格式',trip.schemaVersion===null?'待確認':String(trip.schemaVersion)],['網站設定',trip.deployment?`${trip.deployment.target==='pages'?'Pages':'Workers'} · ${trip.deployment.name}`:'尚未設定'],['本機發布紀錄',({present:'已有紀錄；發布前會核對遠端歸屬',missing:'尚無紀錄',unknown:'需要重新核對'})[trip.localDeploymentRecord]||'待確認']]);body.append(list);
    if(trip.issues.length)body.append(el('p',trip.issues.map(code=>issues[code]||'設定需要確認。').join(' '),'note'));
    const actions=el('div',undefined,'settings-actions'),open=el('button','開啟旅程');open.onclick=()=>{selectTrip(trip);closeSettings();};actions.append(open);body.append(actions);row.append(body);$('summary-trips').append(row);
  }
  if(!project.trips.length)$('summary-trips').append(el('p','還沒有旅程，可從工作台新增。','note'));
}
function addMessage(message) {
  const item = el('div', undefined, `message ${message.role}`);
  item.setAttribute('aria-label', message.role === 'user' ? '你的訊息' : '助手回覆');
  const content=el('div',undefined,'message-content');if(message.role==='assistant'&&window.renderMarkdown)window.renderMarkdown(content,message.text);else content.textContent=message.text;
  item.append(content);
  if(message.generation){const g=message.generation;item.title=`回覆設定：${g.provider} · ${g.model||'服務預設模型'} · ${g.effort||(g.resolvedEffort?'預設思考強度（'+g.resolvedEffort+'）':'預設思考強度')}`;item.dataset.provider=g.provider;item.dataset.model=g.model;item.dataset.effort=g.effort;}
  $('messages').append(item);
  return item;
}
function markAIProgress(item){item.id='ai-progress';item.prepend(el('div','處理中…','message-meta'));return item;}
function conversationTarget(trip=selected?.trip) { return {projectId:project?.projectId,slug:trip?.slug}; }
function applyConversation(state, trip) {
  if(state.provider&&state.provider!==activeProvider){activeProvider=state.provider;restoreAIConnection();}
  trip.conversationId=state.conversationId;trip.featureState=state;
  trip.conversation=state.messages;trip.draft=state.draft;trip.savedModel=state.model;trip.dayId=state.dayId;trip.effort=state.effort??'';
  trip.needsRestart=state.needsRestart;trip.stopped=state.stopped;trip.proposalLost=state.proposalLost;
  if (selected?.trip !== trip) return;
  $('message').value=trip.draft;
  $('edit-day').value=state.dayId===null?'':String(state.dayId);
  selectSavedModel(state.model);
  window.renderFeatureState?.(state);
  $('messages').replaceChildren();
  addMessage({role:'assistant',text:`已連接「${trip.title}」。對話與草稿保存在這台電腦。每次送出會重新讀取行程；AI 提案仍需你確認才保存。`});
  for(const message of state.messages)addMessage(message);
  if(!state.needsRestart&&state.proposalLost)addMessage({role:'assistant',text:'上次有待確認提案，正在核對目前資料並恢復候選預覽。原行程沒有自動保存。'});
  $('chat-scroll').scrollTop=$('chat-scroll').scrollHeight;
  updateComposer();
}
function queuePreferences() {
  clearTimeout(draftTimer);
  if (!selected || selected.demo || conversationLoading || conversationError || !window.travelDesktop?.saveConversationPreferences) return preferenceWrite;
  const trip=selected.trip;
  const input={...conversationTarget(trip),conversationId:trip.conversationId,draft:trip.draft||'',model:trip.savedModel||'',effort:trip.effort||'',dayId:trip.dayId??null};
  preferenceWrite=preferenceWrite.catch(()=>false).then(async()=>{
    try { const result=await window.travelDesktop.saveConversationPreferences(input);if(!result.ok){if(result.code==='STALE_CONVERSATION')return true;throw Error(result.message);}return true; }
    catch { notify('對話草稿尚未保存，請檢查本機儲存空間後重試。');return false; }
  });return preferenceWrite;
}
async function flushConversationDraft() { clearTimeout(draftTimer);return queuePreferences(); }
async function selectTrip(trip, demo = false) {
  if (aiBusy || pendingProposal || window.hasMaterialization?.()) { notify('請先停止工作，或確認／放棄目前的提案，再切換旅程。'); return; }
  if(selected && !selected.demo && !await flushConversationDraft())return;
  if(aiBusy||pendingProposal||window.hasMaterialization?.())return;
  selected = { trip, demo };window.onFeatureTrip?.();
  conversationError=false;conversationLoading=!demo && Boolean(window.travelDesktop?.readConversation);
  previewRequest += 1;
  realPreview = null;
  if (!demo && window.travelDesktop?.selectTrip && project) {
    const projectId = project.projectId;
    selectionReady = preferenceWrite.then(()=>window.travelDesktop.selectTrip({ projectId, slug: trip.slug })).then(async()=>{
      const result=await window.travelDesktop.readConversation({projectId,slug:trip.slug});
      if(selected?.trip!==trip || selected.demo)return;
      conversationLoading=false;
      if(!result.ok){conversationError=true;notify(result.message);updateComposer();return;}
      applyConversation(result.conversation,trip);
      if(accountState.state==='disconnected')restoreAIConnection();
    });
    selectionReady.catch(() => {if(selected?.trip===trip){conversationLoading=false;conversationError=true;updateComposer();notify('無法恢復這趟旅程的對話，請重新連接專案。');}});
  }
  notify('');
  $('welcome').hidden = true;
  $('messages').hidden = false;
  $('trip-title').textContent = trip.title;
  $('trip-status').textContent = `${dateLabel(trip)} · ${demo ? '示範模式' : '既有旅程'}`;
  $('message').disabled = !demo; $('send-message').disabled = !demo;
  $('message').placeholder = demo ? '說說你想怎麼調整這趟旅程…' : '既有旅程的 AI 修改功能尚未接上';
  $('message').value = trip.draft || '';
  $('composer-model').textContent = demo ? '模擬助手' : '尚未連接 AI';
  $('composer-note').textContent = demo ? '固定模擬回覆，不送出至 AI · Enter 傳送，Shift+Enter 換行' : '目前可查看基本資訊；不會改動你的原始行程。';
  $('messages').replaceChildren();
  if (demo) for (const message of trip.messages) addMessage(message);
  else {
    const item = addMessage({ role: 'assistant', text: `已連接「${trip.title}」。\n\n目前可以辨識旅程的基本設定與部署紀錄。開啟右側預覽後，會先驗證完整資料，再產生本機行程預覽。連接 AI 後，可以討論或提出跨日修改；原始檔只會在你確認保存後更新。` });
    const actions = el('div', undefined, 'message-actions');
    const details = el('button', '查看專案資訊'); details.onclick = () => openSettings('projects');
    const demoButton = el('button', '試用示範對話'); demoButton.id = 'try-workflow'; demoButton.onclick = openDemo;
    actions.append(details, demoButton); item.append(actions);
    for (const message of trip.conversation || []) addMessage(message);
  }
  navigation(); renderProject(); renderPreview();
  $('chat-scroll').scrollTop = $('chat-scroll').scrollHeight;
  updateComposer();
}
function newDemo(title = '海邊的三天兩夜', options = {}) {
  const trip = { id:options.id||crypto.randomUUID(), title, destination: options.destination || '', dates: options.start ? { start: options.start, end: options.end || null } : null,
    revision: 1, draft: '', day: options.destination ? `抵達${options.destination}後，先保留一段自由活動的時間。\n\n這是用來體驗操作的示範安排。` : '上午抵達海邊小鎮，午後沿著步道散步，傍晚回到住宿休息。',
    messages: [] };
  if (options.notes) trip.messages.push({ role: 'user', text: options.notes });
  trip.messages.push({ role: 'assistant', text: `一起整理「${title}」吧。\n\n${options.notes ? '已把你的初步想法留在對話裡。' : '你可以先說說想調整的安排。'}目前是示範模式，傳送後會把你的文字加入第一天，並同步到右側預覽。` });
  demos.push(trip);if(options.select!==false){selectTrip(trip, true);setPreview(true);}else navigation();
  return trip;
}
function seedDemo(){try{if(localStorage.getItem('travel-planner.demo-removed')==='true')return;}catch{}if(!demos.some(t=>t.id==='welcome-demo'))newDemo('海邊的三天兩夜',{id:'welcome-demo',select:false});}
function openDemo() { if (aiBusy || pendingProposal || window.hasMaterialization?.()) { notify('請先處理目前的修改提案。'); return; } if (demos.length) { selectTrip(demos[0], true); setPreview(true); } else newDemo(); }
$('open-demo').onclick = openDemo;
$('welcome-demo').onclick = openDemo;
function escapeHTML(value) { return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function renderPreview() {
  cancelAnimationFrame(previewFrame);
  const demo = Boolean(selected?.demo);
  if(realPreview?.planning){$('preview').hidden=true;$('preview-empty').hidden=false;$('revision').textContent='規劃草案';$('preview-note').textContent='這趟旅程已保存為草案。先與 AI 確認逐日安排，再查核來源並建立正式預覽。';$('retry-preview').hidden=true;$('preview-browser').disabled=true;document.querySelector('.preview-footer').hidden=true;updateComposer();return;}
  $('preview-browser').disabled = demo || realPreview?.status !== 'ready' || !window.travelDesktop?.openPreviewInBrowser;
  $('preview-browser').title = demo ? '示範旅程僅提供 App 內預覽' : '在瀏覽器開啟預覽';
  $('preview').hidden = !demo;
  $('preview-empty').hidden = demo;
  document.querySelector('.preview-footer').hidden = !demo;
  if (!demo) {
    document.querySelector('.preview-footer').hidden = true;
    if (realPreview?.status === 'ready') {
      $('preview').hidden = false; $('preview-empty').hidden = true;
      $('revision').textContent = `${realPreview.summary.days} 天 · ${realPreview.summary.photos} 張照片`;
      $('preview').removeAttribute('srcdoc');
      $('preview').setAttribute('sandbox', 'allow-scripts');
      if ($('preview').getAttribute('src') !== realPreview.url) $('preview').src = realPreview.url;
      document.querySelector('.preview-footer').textContent = '本機行程預覽 · 原專案未修改';
      document.querySelector('.preview-footer').hidden = false;
      updateComposer();
      return;
    }
    $('revision').textContent = realPreview?.status === 'loading' ? '正在驗證並建立預覽…' : selected ? '既有旅程 · 唯讀預覽' : '尚未選擇旅程';
    $('preview-note').textContent = realPreview?.status === 'error' ? `無法產生預覽：${realPreview.message}` : selected ? '預覽會讀取行程資料並驗證，不執行專案內的程式，也不修改原始檔案。' : '選擇一趟旅程後，就能查看完整安排。';
    $('retry-preview').hidden = realPreview?.status !== 'error';
    $('preview').removeAttribute('src'); $('preview').removeAttribute('srcdoc');
    if (selected && ui.preview && !realPreview) loadRealPreview();
    return;
  }
  $('retry-preview').hidden = true;
  $('preview').removeAttribute('src');
  $('preview').setAttribute('sandbox', '');
  document.querySelector('.preview-footer').textContent = '示範預覽 · 尚未使用旅程引擎建置';
  const trip = selected.trip;
  const dark = currentTheme() === 'dark';
  $('revision').textContent = `第 ${trip.revision} 版 · 示範`;
  if (!ui.preview) return;
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>:root{color-scheme:${dark ? 'dark' : 'light'}}body{margin:0;padding:28px 24px;font:14px/1.9 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${dark ? '#e5e5e5' : '#252525'};background:${dark ? '#202020' : '#fff'}}small{color:${dark ? '#aaa' : '#686868'};font-size:11px}h1{font-size:23px;line-height:1.5;font-weight:550;overflow-wrap:anywhere;margin:24px 0}h2{font-size:12px;border-top:1px solid ${dark ? '#444' : '#ddd'};padding-top:22px}p{white-space:pre-wrap;overflow-wrap:anywhere}footer{margin-top:34px;color:${dark ? '#aaa' : '#686868'};font-size:11px}</style></head><body><small>Travel Planner · 行程手帳</small><h1>${escapeHTML(trip.title)}</h1><h2>DAY 01</h2><p>${escapeHTML(trip.day)}</p><footer>示範內容 · 第 ${trip.revision} 版</footer></body></html>`;
  // Coalesce changes and wait until the preview panel has a layout before loading.
  previewFrame = requestAnimationFrame(() => { $('preview').srcdoc = html; });
}
async function loadRealPreview() {
  if (!selected || selected.demo || !project || !window.travelDesktop?.buildPreview) return;
  const target = { projectId: project.projectId, slug: selected.trip.slug };
  const request = ++previewRequest;
  realPreview = { status: 'loading' }; renderPreview();
  try {
    await selectionReady;
    if (request !== previewRequest) return;
    const result = await window.travelDesktop.buildPreview(target);
    if (request !== previewRequest || target.projectId !== project?.projectId || target.slug !== selected?.trip.slug || selected?.demo) return;
    if(result.ok&&result.proposal?.changed){pendingProposal={...result.proposal,...target,previewLoaded:false};renderProposal();}
    if(result.warning)notify(result.warning);
    realPreview = result.ok ? { ...result, status: 'ready' } : { status: 'error', message: result.message || '請重新選擇旅程後再試一次。' };
  } catch { if (request === previewRequest) realPreview = { status: 'error', message: '預覽程序未能完成，請重試。' }; }
  if (request === previewRequest) { renderPreview(); updateComposer(); }
}
$('preview-browser').onclick = async () => {
  try { const result=await window.travelDesktop.openPreviewInBrowser(realPreview?.url); if (!result.ok) notify(result.message); }
  catch { notify('無法開啟瀏覽器預覽，請重試。'); }
};
$('retry-preview').onclick = () => { realPreview = null; loadRealPreview(); };
$('choose-project').onclick = async () => {
  if(aiBusy||pendingProposal){notify('請先完成目前工作或處理提案。');return;}
  if(window.hasMaterialization?.()){notify('請先保存或放棄正式行程候選。');return;}
  if (!window.travelDesktop) { notify('瀏覽器版可試用示範流程；請在桌面 App 中選取本機專案。'); return; }
  aiBusy=true;proposalBusy=true;updateComposer();
  if(!await flushConversationDraft()){aiBusy=false;proposalBusy=false;updateComposer();return;}
  const button = $('choose-project'); button.disabled = true; button.textContent = '正在檢查…';
  try {
    const result = await window.travelDesktop.chooseProject();
    if (result.canceled) { notify('已取消選取，目前的專案與旅程保留。'); return; }
    if (!result.ok) { notify(result.code === 'not-project' ? '沒有辨識到 travel-planner 專案，請選擇包含 trips 與 scripts 的專案根資料夾。' : issues[result.code] || '無法讀取這個資料夾，請確認位置與讀取權限後重試。'); return; }
    project = result;
    if (selected && !selected.demo) {
      selected = null; $('welcome').hidden = false; $('messages').hidden = true; $('messages').replaceChildren();
      $('trip-title').textContent = '選擇一趟旅程'; $('trip-status').textContent = '已切換專案';
      $('message').disabled = true; $('send-message').disabled = true; $('message').value = ''; renderPreview();
    }
    navigation(); renderProject(); notify('已完成唯讀檢查，原始專案沒有被修改。');
  } catch { notify('檢查未完成，請重新選擇資料夾。'); }
  finally { aiBusy=false;proposalBusy=false;updateComposer();button.disabled = false; button.textContent = '選擇本機資料夾'; }
};
function newTripModal() { if (aiBusy || pendingProposal || window.hasMaterialization?.()) { notify('請先處理目前的修改提案。'); return; } $('new-form').reset();$('new-kind').value=project&&window.travelDesktop?'real':'demo'; $('new-error').hidden = true; $('new-dialog').showModal(); $('new-title').focus(); }
$('new-demo').onclick = newTripModal;
$('welcome-new').onclick = newTripModal;
$('cancel-new').onclick = () => $('new-dialog').close();
$('cancel-new-x').onclick = () => $('new-dialog').close();
$('new-form').onsubmit = async event => {
  event.preventDefault();
  const title = $('new-title').value.trim();
  const start = $('new-start').value; const end = $('new-end').value;
  if (!title) { $('new-error').textContent = '請輸入旅程名稱。'; $('new-error').hidden = false; $('new-title').focus(); return; }
  if ((end && !start) || (start && end && end < start)) { $('new-error').textContent = '請先填出發日期，回程日期需在出發當天或之後。'; $('new-error').hidden = false; $('new-end').focus(); return; }
  if($('new-kind').value==='real'){await window.createRealTripFromForm?.({title,destination:$('new-destination').value.trim(),startDate:start,endDate:end,notes:$('new-notes').value.trim()});return;}
  newDemo(title, { destination: $('new-destination').value.trim(), start, end, notes: $('new-notes').value.trim() });
  $('new-dialog').close(); $('message').focus();
  if (narrowWindow.matches) setSidebar(false);
};
function appendRealMessage(trip, message) {
  trip.conversation ||= []; trip.conversation.push(message);
  if (selected?.trip === trip) { addMessage(message); $('chat-scroll').scrollTop = $('chat-scroll').scrollHeight; }
}
function updateComposer() {
  $('conversation-header').hidden=!selected;
  $('conversation-title').textContent=selected?.demo?'示範對話':selected?.trip.featureState?.conversationTitle||'旅程討論';
  $('conversation-title').title=$('conversation-title').textContent;
  $('chat-more').hidden=!selected||selected.demo;
  $('chat-more').disabled=conversationLoading;
  const demo = Boolean(selected?.demo);
  const real = Boolean(selected && !demo);
  const ready = real && ['ready','planning'].includes(realPreview?.status) && !conversationLoading && !conversationError;
  $('versions-open').hidden=!real || Boolean(realPreview?.planning) || !$('settings').hidden;
  $('versions-open').disabled=!ready||aiBusy;
  $('versions-open').textContent=realPreview?.version?`V${realPreview.version.number} · 版本紀錄`:'版本紀錄';
  $('ai-day-controls').hidden = !real;
  $('connect-from-chat').hidden = accountState.state === 'connected';
  const options = realPreview?.summary?.dayOptions || [];
  if (real) {
    const previous = $('edit-day').value;
    $('edit-day').replaceChildren();
    const all = el('option', '不指定 · 整體討論'); all.value=''; $('edit-day').append(all);
    if(!realPreview?.planning){const whole=el('option','整趟行程 · 提出跨日修改');whole.value='-1';$('edit-day').append(whole);}
    for (const day of options) { const option = el('option', `第 ${day.id} 天 · ${day.title}`); option.value=String(day.id); $('edit-day').append(option); }
    if(previous==='-1')$('edit-day').value='-1';
    else if (options.some(day => String(day.id) === previous)) $('edit-day').value=previous;
    else if(selected?.trip.dayId===-1&&!realPreview?.planning)$('edit-day').value='-1';
    else if(options.some(day=>day.id===selected?.trip.dayId)) $('edit-day').value=String(selected.trip.dayId);
    $('edit-day').disabled = !ready || aiBusy || Boolean(pendingProposal);
  }
  const hasModels = [...$('chat-model').options].some(o=>!o.disabled);
  const modelReady=hasModels&&Boolean($('chat-model').selectedOptions[0])&&!$('chat-model').selectedOptions[0].disabled;
  $('chat-model').hidden = !real || accountState.state !== 'connected' || !$('chat-model').options.length;
  const providerLocked=Boolean(selected&&!selected.demo&&selected.trip.featureState?.started);
  $('chat-provider').hidden=!real||providerLocked;
  $('chat-provider-locked').hidden=!real||!providerLocked;
  $('chat-provider-locked').textContent=({codex:'Codex',claude:'Claude Code',gemini:'Gemini'})[activeProvider]||activeProvider;
  window.refreshProviderOptions?.();
  $('chat-provider').disabled=providerLocked||aiBusy||Boolean(pendingProposal)||Boolean(window.hasMaterialization?.());
  $('chat-provider').title=providerLocked?'此對話的 AI 服務已固定；可從右上方選單使用其他 AI 開新對話':'選擇這段新對話的 AI 服務';
  $('chat-model').disabled = aiBusy || Boolean(pendingProposal);
  $('codex-model').disabled = aiBusy || Boolean(pendingProposal);
  $('composer-model').hidden = !$('chat-model').hidden;
  $('restart-conversation').hidden=!real;
  $('restart-conversation').disabled=aiBusy || Boolean(pendingProposal) || !ready;
  window.updateFeatureControls?.({real,ready,busy:aiBusy,pending:pendingProposal,planning:Boolean(realPreview?.planning)});
  const canSend = demo || (ready && accountState.state === 'connected' && modelReady && !selected.trip.needsRestart);
  $('message').disabled = !selected || conversationLoading || conversationError || aiBusy || Boolean(pendingProposal) || Boolean(window.hasMaterialization?.());
  $('send-message').disabled = !canSend || aiBusy || Boolean(pendingProposal) || Boolean(window.hasMaterialization?.());
  $('send-message').hidden = aiBusy; $('stop-generation').hidden = !aiBusy || savingProposal || proposalBusy;
  $('choose-project').disabled = aiBusy || Boolean(pendingProposal);
  $('codex-switch').disabled = aiBusy || Boolean(pendingProposal) || accountState.state === 'switching';
  $('codex-switch-help').hidden = accountState.state !== 'connected' || (!aiBusy && !pendingProposal);
  if (real) {
    $('composer-model').textContent = accountState.state === 'connected' ? hasModels ? ({codex:'Codex',claude:'Claude Code',gemini:'Gemini'})[activeProvider] : '正在取得模型…' : '尚未連接 AI';
    $('message').placeholder = !ready ? '先開啟右側預覽，驗證這趟行程' : accountState.state !== 'connected' ? '連接 AI 帳號後，就能提出修改' : $('edit-day').value === '' ? '例如：希望整趟行程更輕鬆，可以怎麼調整？' : '例如：把這一天的標題改成「悠閒出發」';
    $('composer-note').textContent = conversationError ? '對話紀錄無法讀寫，暫停送出以免遺失。' : conversationLoading ? '正在恢復對話…' : selected.trip.needsRestart ? (selected.trip.featureState?.stopRequested?'可以先編輯草稿。停止狀態尚未確認，請先確認停止狀態。':selected.trip.featureState?.legacyStopped?'可以先編輯草稿。上次工作狀態尚未確認，請先確認上次狀態。':'可以先編輯草稿。上次回覆尚未確認，請先找回上次回覆或重新開始（保留紀錄）。') : selected.trip.stopped ? '上一輪已停止，可以在原對話繼續討論。' : !modelReady&&accountState.state==='connected'?'這段對話的模型目前不可用，請選擇其他模型。' : pendingProposal ? '請先確認或放棄提案，再進行下一次修改。' : $('edit-day').value === '' ? '沿用本旅程對話，提供最新整趟安排；這輪只討論，不會直接修改行程。' : '本輪提供這一天與相關地點，沿用本旅程對話；提案經你確認才保存。';
  }
}
function renderProposal() {
  $('proposal-review').hidden=!pendingProposal;
  if(!pendingProposal){if($('changes-dialog').open)$('changes-dialog').close();updateComposer();return;}
  $('proposal-heading').textContent=pendingProposal.kind==='restore'?'版本回復提案 · 尚未保存':'修改提案 · 尚未保存';
  $('proposal-changes').textContent=`已選 ${pendingProposal.selectedKeys?.length||0}／${pendingProposal.changes?.length||0} 項修改`;
  $('proposal-note').textContent=pendingProposal.requiresResearch?'包含停留或交通變動，需要先查核才能保存；可取消這些項目，先保留文字修改。':pendingProposal.previewLoaded?'請檢查候選預覽，確認後建立新的本機版本。':'請先查看右側候選預覽，再確認保存。';
  $('save-proposal').disabled=!pendingProposal.previewLoaded||pendingProposal.requiresResearch||aiBusy||!pendingProposal.selectedKeys?.length;
  $('discard-proposal').disabled=aiBusy;$('review-changes').disabled=aiBusy;
  if($('changes-dialog').open)renderChanges();
  updateComposer();
}
function stageProposal(proposal){
  pendingProposal={...proposal,...conversationTarget(),previewLoaded:false};
  realPreview={...realPreview,url:proposal.previewUrl};setPreview(true);renderPreview();renderProposal();
}
function renderChanges(){
  $('change-list').replaceChildren();
  $('selected-changes-count').textContent=`已選 ${pendingProposal.selectedKeys.length} 項`;
  for(const change of pendingProposal.changes){
    const section=el('section',undefined,'change-item');const label=el('label',undefined,'change-label');
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=pendingProposal.selectedKeys.includes(change.key);checkbox.disabled=aiBusy;checkbox.dataset.changeKey=change.key;
    checkbox.onchange=()=>{const keys=new Set(pendingProposal.selectedKeys);if(checkbox.checked)keys.add(change.key);else keys.delete(change.key);changeSelection([...keys],change.key);};
    label.append(checkbox,el('span',change.label));section.append(label);
    const pair=el('div',undefined,'change-pair');
    for(const [name,text] of [['目前內容',change.before],['修改後',change.after]]){const column=el('div');column.append(el('h3',name),el('p',text));pair.append(column);}
    section.append(pair);$('change-list').append(section);
  }
  $('select-all-changes').disabled=aiBusy;$('select-no-changes').disabled=aiBusy;
}
async function changeSelection(keys,focusKey){
  if(aiBusy||!pendingProposal)return;
  aiBusy=true;proposalBusy=true;renderProposal();
  try{
    const result=await window.travelDesktop.selectProposalChanges({...conversationTarget(),proposalId:pendingProposal.id,selectedKeys:keys});
    if(result.ok)stageProposal(result.proposal);else notify(result.message);
  }catch{notify('選取未能保存，請重試。');}
  finally{aiBusy=false;proposalBusy=false;renderProposal();if(focusKey)[...$('change-list').querySelectorAll('input')].find(n=>n.dataset.changeKey===focusKey)?.focus();}
}
$('review-changes').onclick=()=>{renderChanges();$('changes-dialog').showModal();};
for(const id of ['close-changes','done-changes'])$(id).onclick=()=>$('changes-dialog').close();
$('select-all-changes').onclick=()=>changeSelection(pendingProposal.changes.map(c=>c.key));
$('select-no-changes').onclick=()=>changeSelection([]);
$('close-history').onclick=()=>$('history-dialog').close();
$('versions-open').onclick=async()=>{
  if(!selected||selected.demo||aiBusy)return;
  aiBusy=true;proposalBusy=true;updateComposer();
  $('history-list').replaceChildren();$('history-message').textContent='正在核對目前版本…';$('history-message').hidden=false;$('history-dialog').showModal();
  try{
    const result=await window.travelDesktop.listVersions(conversationTarget());
    if(!result.ok){$('history-message').textContent=result.message;return;}
    $('history-message').hidden=true;
    for(const revision of result.revisions){
      const row=el('div',undefined,'history-row'),copy=el('div');copy.append(el('h3',`V${revision.number}${revision.current?' · 目前版本':''}`),el('p',revision.label),el('small',new Date(revision.createdAt).toLocaleString('zh-TW')));
      const button=el('button','選擇要回復的內容');button.disabled=revision.current||!revision.compatible||Boolean(pendingProposal);button.dataset.versionId=revision.id;
      if(!revision.compatible)copy.append(el('p','其他資料已改動，目前無法直接套用。','history-warning'));
      button.onclick=()=>restoreVersion(revision.id);row.append(copy,button);$('history-list').append(row);
    }
    if(pendingProposal){$('history-message').hidden=false;$('history-message').textContent='請先保存或放棄目前提案，再選擇歷史版本。';}
  }catch{$('history-message').textContent='版本紀錄未能載入，請重試。';}
  finally{aiBusy=false;proposalBusy=false;updateComposer();}
};
async function restoreVersion(versionId){
  if(aiBusy||pendingProposal)return;
  aiBusy=true;proposalBusy=true;updateComposer();
  if(!await flushConversationDraft()){aiBusy=false;proposalBusy=false;updateComposer();return;}
  $('history-dialog').close();
  try{const result=await window.travelDesktop.restoreVersion({...conversationTarget(),versionId});if(!result.ok)notify(result.message);else if(result.proposal.changed){stageProposal(result.proposal);renderChanges();$('changes-dialog').showModal();}else notify(result.proposal.summary);}
  catch{notify('回復提案未能建立，原行程沒有被改動。');}
  finally{aiBusy=false;proposalBusy=false;renderProposal();}
}
$('preview').addEventListener('load', async () => {
  if (!pendingProposal || !window.travelDesktop?.proposalStatus) return;
  const status = await window.travelDesktop.proposalStatus();
  if (pendingProposal?.id === status.id && status.seen) { pendingProposal.previewLoaded=true; renderProposal(); }
});
$('edit-day').onchange = () => {if(selected&&!selected.demo)selected.trip.dayId=$('edit-day').value===''?null:Number($('edit-day').value);queuePreferences();updateComposer();};
$('chat-model').onchange=()=>{$('codex-model').value=$('chat-model').value;if(selected&&!selected.demo)selected.trip.savedModel=$('chat-model').value;window.refreshEffort?.();queuePreferences();updateComposer();};
$('codex-model').onchange=()=>{$('chat-model').value=$('codex-model').value;if(selected&&!selected.demo)selected.trip.savedModel=$('codex-model').value;window.refreshEffort?.();queuePreferences();updateComposer();};
$('restart-conversation').onclick=async()=>{
  if(aiBusy||!selected||selected.demo)return;const trip=selected.trip;aiBusy=true;proposalBusy=true;updateComposer();
  try{if(!await flushConversationDraft())return;const result=await window.travelDesktop.restartConversation(conversationTarget(trip));if(result.ok)applyConversation(result.conversation,trip);else notify(result.message);}
  finally{aiBusy=false;proposalBusy=false;updateComposer();}
};
$('connect-from-chat').onclick = () => openSettings('ai');
$('chat-form').onsubmit = async event => {
  event.preventDefault(); if (!selected || aiBusy || pendingProposal) return;
  const message = $('message').value.trim(); if (!message) return;
  const trip = selected.trip;
  if (selected.demo) {
    trip.messages.push({ role:'user',text:message }); trip.day=`第一天，保留彈性安排。\n\n你的調整：${message}`; trip.revision++;
    trip.messages.push({ role:'assistant',text:`已把你的想法加入第一天。\n\n右側預覽已更新為第 ${trip.revision} 版。這次是示範修改，沒有呼叫 AI 或寫入原專案。` });
    trip.draft=''; selectTrip(trip,true); $('message').focus(); return;
  }
  if (accountState.state !== 'connected' || !['ready','planning'].includes(realPreview?.status)) { notify('請先驗證行程並連接 AI。'); return; }
  if(conversationLoading||conversationError||trip.needsRestart)return;
  aiBusy=true;updateComposer();
  if(!await flushConversationDraft()){aiBusy=false;updateComposer();return;}
  const target={projectId:project.projectId,slug:trip.slug,dayId:$('edit-day').value === '' ? null : Number($('edit-day').value),text:message,model:$('chat-model').value||undefined,effort:$('chat-effort').value||undefined,attachmentIds:window.selectedReferenceIds?.()||[]};
  appendRealMessage(trip,{role:'user',text:message}); $('message').value=''; trip.draft=''; aiBusy=true; updateComposer();
  const progress = addMessage({role:'assistant',text:target.dayId === null ? '正在整理整體行程建議…' : '正在準備這次修改…'}); markAIProgress(progress);
  try {
    const result=await window.travelDesktop.generateProposal(target); progress.remove();
    if(result.conversation)applyConversation(result.conversation,trip);
    window.acceptFeatureResult?.(result);
    if(!result.ok&&!result.accepted){trip.draft=message;$('message').value=message;}
    if (!result.ok && !result.conversation) appendRealMessage(trip,{role:'assistant',text:result.message});
    if(result.ok) {
      if(!result.conversation)appendRealMessage(trip,{role:'assistant',text:result.proposal.summary});
      if (result.proposal.changed) {
        stageProposal(result.proposal);
      }
    }
  } catch { progress.remove(); appendRealMessage(trip,{role:'assistant',text:'這次回覆未能確認，沒有自動重送，也沒有保存原行程。'}); }
  finally { aiBusy=false; renderProposal(); updateComposer(); }
};
$('stop-generation').onclick = async () => { $('stop-generation').disabled=true; try { const result=await window.travelDesktop.stopGeneration();if(!result.ok)notify(result.message||'停止狀態尚未確認，請稍後再試。'); } catch { notify('停止狀態尚未確認，請稍後再試。'); } finally { $('stop-generation').disabled=false; } };
$('discard-proposal').onclick=async()=>{
  if(aiBusy||!pendingProposal)return;
  aiBusy=true;proposalBusy=true;renderProposal();
  try{
    const result=await window.travelDesktop.discardProposal();
    if(!result.ok){notify(result.message);return;}
    pendingProposal=null;realPreview=null;
    const saved=await window.travelDesktop.readConversation(conversationTarget());if(saved.ok)applyConversation(saved.conversation,selected.trip);
    renderPreview();
  }catch{notify('放棄提案的結果未能確認，請重新載入核對。');}
  finally{aiBusy=false;proposalBusy=false;renderProposal();}
};
$('save-proposal').onclick = async () => {
  if (!pendingProposal || aiBusy) return;
  aiBusy=true; savingProposal=true; renderProposal();
  try {
    const result=await window.travelDesktop.applyProposal({projectId:pendingProposal.projectId,slug:pendingProposal.slug,proposalId:pendingProposal.id});
    if (!result.ok) notify(result.message);
    else {
      appendRealMessage(selected.trip,{role:'assistant',text:`已保存到原專案的本機檔案，並保留修改前的還原副本。尚未異地備份，也沒有部署。${result.statusUpdated ? '' : '\n進度紀錄未能同步更新，請稍後核對。'}`});
      if(result.versionRecorded===false)notify('內容已保存，但版本紀錄尚待核對；請重新載入後確認，避免重複保存。');
      if(result.version)appendRealMessage(selected.trip,{role:'assistant',text:`已建立本機日程版本 V${result.version.number}。可從上方版本紀錄查看或回復。`});
      if(result.conversationWarning)notify('行程已保存，但對話紀錄未能更新，請保留此畫面。');
      pendingProposal=null; realPreview=null; renderPreview();
    }
  } catch { notify('保存結果未能確認，請重新開啟行程核對，避免重複操作。'); }
  finally { aiBusy=false; savingProposal=false; renderProposal(); updateComposer(); }
};
$('message').oninput = () => { if(selected){selected.trip.draft=$('message').value;clearTimeout(draftTimer);draftTimer=setTimeout(queuePreferences,350);} };
window.addEventListener('blur',()=>queuePreferences());
$('message').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); $('chat-form').requestSubmit(); } };
async function initializeWorkspace() {
  if (window.travelDesktop?.readWorkspace) {
    try {
      const saved = await window.travelDesktop.readWorkspace();
      if (['system', 'light', 'dark'].includes(saved.theme)) ui.theme = saved.theme;
      project = saved.project;
      if(!saved.demoHidden)seedDemo();
      navigation(); renderProject();
      const trip = project?.trips.find(item => item.slug === saved.selectedSlug);
      if (trip) { selectTrip(trip); setPreview(true); }
      if (saved.warning) notify(saved.warning === 'project-recovery-required' ? '上次的資料保存需要重新核對。可先到設定連接 GitHub，再重新選取原專案；原檔保留。' : saved.warning === 'project-unavailable' ? '上次的專案目前無法讀取，請到設定重新選擇資料夾。' : '連接紀錄無法讀取，原紀錄已保留，請讓 coding agent 協助處理。');
    } catch { notify('無法恢復上次的專案連接，請到設定重新選擇。'); }
  }
  renderTheme();
  document.documentElement.dataset.ready = 'true';
}
if(!window.travelDesktop)seedDemo();setSidebar(ui.sidebar); setPreview(ui.preview); navigation(); renderProject();
initializeWorkspace();
if(window.travelDesktop){window.travelDesktop.feature('provider-status').then(result=>{if(result.ok&&result.provider)activeProvider=result.provider;}).catch(()=>{}).finally(restoreAIConnection);}

function renderCodexAccount(account) {
  if(account.provider&&account.provider!==activeProvider){activeProvider=account.provider;accountRequest++;}accountState = account;window.onFeatureAccount?.(account);
  const providerName=({codex:'Codex',claude:'Claude Code',gemini:'Gemini'})[activeProvider];$('provider-heading').textContent=providerName;$('chat-provider').value=activeProvider;window.refreshProviderOptions?.();$('codex-connect').textContent='檢查 '+providerName;$('codex-login').textContent=activeProvider==='codex'?'連接 ChatGPT':'登入 '+providerName;
  document.querySelector('.prototype-label').textContent = account.state === 'checking'?'正在核對已保存的登入…':account.state === 'connected' ? '提案經確認後才保存' : '可在設定連接 AI 助手';
  const labels = { checking:'正在恢復連線', unavailable:'尚未安裝', error:'連線待確認', disconnected:'尚未連接', 'needs-login':'需要登入', connected:'已連接', 'waiting-login':'等待授權', 'login-failed':'登入未完成', switching:'正在更換帳號', 'switch-failed':'需要重新確認' };
  $('codex-badge').textContent = account.cachedAuth?'登入已保存':labels[account.state] || '需要確認';
  $('sidebar-account-status').textContent = account.state==='connected' ? providerName+(account.cachedAuth?' · 登入已保存':' · 已連接') : labels[account.state] || '需要確認';
  $('codex-status').textContent = account.state === 'checking'?'正在核對這台電腦已保存的登入，無需重新授權。':account.state === 'connected' ? `已連接 ${account.label || providerName+' 帳號'}${account.plan ? ` · ${account.plan}` : ''}` : account.state === 'waiting-login' ? '請在開啟的官方頁面完成登入，完成後會自動更新。' : account.state === 'needs-login' ? `${providerName} ${account.version} 已就緒，請完成官方登入。` : '尚未完成帳號連接，可從更多選單重新核對。';
  $('codex-login').hidden = !['needs-login', 'login-failed'].includes(account.state);
  $('codex-cancel').hidden = account.state !== 'waiting-login';
  $('codex-refresh').hidden = !['waiting-login', 'connected', 'login-failed', 'switch-failed'].includes(account.state);
  $('codex-switch').hidden = account.state !== 'connected'||account.capabilities?.switchAccount===false;
  $('codex-copy-link').hidden = activeProvider!=='codex'||account.state !== 'waiting-login';
  $('codex-login-help').hidden = activeProvider!=='codex'||account.state !== 'waiting-login';
  $('provider-capabilities').textContent=activeProvider==='codex'?'支援文字、圖片與原生對話續接。':(activeProvider==='claude'?'支援 Claude Pro／Max。':'Google 登入存於 App；送出時由官方工具核對。')+'目前支援文字、公開網址與來源研究；圖片與思考強度請使用 Codex。';
  if (account.state !== 'connected') { modelRequest++; $('codex-model').replaceChildren(); $('chat-model').replaceChildren(); $('codex-model-row').hidden=true; }
  updateComposer();
  if (account.state === 'connected') loadModels();
}
async function restoreAIConnection(){
  const request=++accountRequest,provider=activeProvider;renderCodexAccount({state:'checking'});
  try{const result=await window.travelDesktop.connectCodex();if(request!==accountRequest||provider!==activeProvider)return;if(result.ok)renderCodexAccount(result.account);else{renderCodexAccount({state:result.code==='CLI_MISSING'?'unavailable':'error'});$('codex-message').textContent=result.message;$('codex-message').hidden=false;}}
  catch{if(request!==accountRequest||provider!==activeProvider)return;renderCodexAccount({state:'error'});$('codex-message').textContent='無法核對登入，請稍後重試；已保存的登入資料仍保留。';$('codex-message').hidden=false;}
}
async function codexAction(method) {
  if (!window.travelDesktop?.[method]) { notify('請在桌面 App 中連接 Codex。'); return; }
  const request=++accountRequest,provider=activeProvider;
  const buttons = [...document.querySelectorAll('.account-actions button')]; buttons.forEach(button => { button.disabled = true; });
  $('codex-message').hidden = true;
  try {
    const result = await window.travelDesktop[method]();
    if(request!==accountRequest||provider!==activeProvider)return;
    if (result.ok) renderCodexAccount(result.account);
    else { $('codex-message').textContent = result.message; $('codex-message').hidden = false; }
  } catch { if(request!==accountRequest||provider!==activeProvider)return;$('codex-message').textContent = '連接程序未完成，請重試。'; $('codex-message').hidden = false; }
  finally { buttons.forEach(button => { button.disabled = false; }); updateComposer(); }
}
$('codex-connect').onclick = () => codexAction('connectCodex');
$('codex-login').onclick = () => codexAction('loginCodex');
$('codex-cancel').onclick = () => codexAction('cancelCodexLogin');
$('codex-refresh').onclick = () => codexAction('refreshCodex');
$('codex-switch').onclick = () => codexAction('switchCodexAccount');
$('codex-copy-link').onclick = async () => { const result=await window.travelDesktop.copyCodexLoginLink(); notify(result.ok ? '登入連結已複製，可以貼到無痕視窗重新選擇帳號。' : result.message); };
window.travelDesktop?.onCodexAccountChanged?.(renderCodexAccount);

function selectSavedModel(modelId){
  const source=$('codex-model');source.querySelectorAll('[data-unavailable]').forEach(o=>o.remove());
  if(modelId&&![...source.options].some(o=>o.value===modelId)){const option=el('option','暫時不可用：'+modelId);option.value=modelId;option.disabled=true;option.dataset.unavailable='true';source.append(option);}
  source.value=modelId||[...source.options].find(o=>o.dataset.default==='true')?.value||[...source.options].find(o=>!o.disabled)?.value||'';
  $('chat-model').replaceChildren(...[...source.options].map(o=>o.cloneNode(true)));$('chat-model').value=source.value;
}
async function loadModels() {
  if (!window.travelDesktop?.codexModels) return;
  const request=++modelRequest;
  try {
    const result=await window.travelDesktop.codexModels();
    if (!result.ok || request !== modelRequest || accountState.state !== 'connected') return;
    const previous=selected?.trip.savedModel || '';  $('codex-model').replaceChildren();
    for (const model of result.models) { const option=el('option',model.name);option.value=model.id;option.dataset.default=String(Boolean(model.isDefault));$('codex-model').append(option); }
    selectSavedModel(previous);
    window.setFeatureModels?.(result.models);
    $('codex-model-row').hidden = !result.models.length;
    updateComposer();
  } catch { if (request === modelRequest) $('codex-model-row').hidden=true; }
}
window.travelDesktop?.onAIProgress?.(event => {
  if (project?.projectId !== event.projectId || selected?.trip.slug !== event.slug) return;
  const node=document.querySelector('#ai-progress .message-content'); if(node&&event.message)node.textContent=event.message;
});

window.travelDesktop?.onClosing?.(()=>{clearTimeout(toastTimer);$('notification').textContent='正在完成目前作業與保存草稿，完成後自動關閉。';$('notification').hidden=false;});

$('settings-search').oninput=()=>{const q=$('settings-search').value.trim().toLocaleLowerCase();document.querySelectorAll('[data-setting]').forEach(b=>{const page=$('setting-'+b.dataset.setting);b.hidden=Boolean(q&&!page.textContent.toLocaleLowerCase().includes(q)&&!b.textContent.toLocaleLowerCase().includes(q));});};
$('settings-search').onkeydown=e=>{if(e.key==='Enter'){document.querySelector('[data-setting]:not([hidden])')?.click();}if(e.key==='Escape'&&$('settings-search').value){e.stopPropagation();$('settings-search').value='';$('settings-search').dispatchEvent(new Event('input'));}};
