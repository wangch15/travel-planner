/* Workbench prototype: real projects are read-only; demo conversations stay in memory. */
const $ = id => document.getElementById(id);
let project = null;
let selected = null;
// ↑／↓ 翻這段對話送出過的訊息；還沒送出的草稿翻回底就還原（composer-history.js 先載入）。
const composerNav = composerHistory.createNavigator(() => composerHistory.historyEntries(!selected ? [] : selected.demo ? selected.trip.messages : selected.trip.conversation));
const demos = [];
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const narrowWindow = window.matchMedia('(max-width: 700px)');
document.body.dataset.platform = window.travelDesktop?.platform || 'browser';
const paneWidths = { sidebar:240, preview:360 };
const ui = { sidebar: !narrowWindow.matches, preview: false, theme: 'system', setting: 'projects' };
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
let headerWasHidden = true;
let proposalBusy=false;
let modelRequest = 0;
let draftTimer;
let preferenceWrite = Promise.resolve(true);
let conversationLoading = false;
let conversationError = false;
let tripGroupOpen = true;
try { const stored = localStorage.getItem('travel-planner.theme'); if (['system', 'light', 'dark'].includes(stored)) ui.theme = stored; } catch { /* Preference storage is optional. */ }
const issues = {
  'workspace-busy': '請先停止目前的 AI 工作，再切換旅程資料夾。',
  'workspace-pending-proposal': '請先確認或放棄目前的提案，再切換旅程資料夾。',
  'schema-unsupported': '資料格式和 App 的版本不同；請按上方的「更新旅程資料夾」。',
  'title-invalid': '旅程名稱缺漏或格式不符。', 'dates-invalid': '日期缺漏或格式不符。',
  'deployment-invalid': '部署設定缺漏或格式不符。', 'data-files-missing': '部分行程資料檔尚未齊全。',
  'config-invalid': '設定檔不是可讀取的 JSON 物件。', 'config-unreadable': '設定檔缺漏或無法讀取。',
  'file-too-large': '設定檔超過目前可檢查的大小。', 'linked-path': '這個路徑包含連結，原型不會跟隨讀取。',
};
// 選單內容沒變就不重建：原生選單展開時若被換掉選項，會關掉重畫，看起來一直閃、也選不到。
function syncSelect(select, options, value) {
  const same = select.options.length === options.length && options.every((o, i) => { const c = select.options[i]; return c.value === o.value && c.textContent === o.label && c.disabled === Boolean(o.disabled) && (c.dataset.default || '') === (o.isDefault || '') && (c.dataset.unavailable || '') === (o.unavailable || ''); });
  if (!same) select.replaceChildren(...options.map(o => { const n = el('option', o.label); n.value = o.value; if (o.disabled) n.disabled = true; if (o.isDefault) n.dataset.default = o.isDefault; if (o.unavailable) n.dataset.unavailable = o.unavailable; return n; }));
  if (value !== undefined && select.value !== value) select.value = value;
}
const optionSpec = o => ({ value: o.value, label: o.textContent, disabled: o.disabled, isDefault: o.dataset.default || '', unavailable: o.dataset.unavailable || '' });
function setIfChanged(node, key, value) { if (node[key] !== value) node[key] = value; }
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
  const logo = `assets/brand/travel-planner-mark-on-${mode}-v3.svg`;
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
  // 對話欄至少要放得下輸入列（AI 服務、模型、思考強度、送出）不折行。
  const chatMin = Math.min(420, Math.max(0, total - 52));
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
  $('versions-open').hidden=true;$('publish-open').hidden=true;$('backup-status').hidden=true;
  document.querySelector('.chat-heading').hidden=true;
  $('settings-heading').hidden=false;closeActionMenu(false);
  settingTab(section,false);
  $('back-to-trip').focus();
}
// 舊的分頁名稱仍可用：ai → 帳號連線；backup／publish → 備份與分享（捲到那一塊）。
function settingTab(section, rememberPosition=true) {
  const focusPanel=['backup','publish'].includes(section)?section:null;
  if(focusPanel)section='sync';
  if(section==='ai')section='accounts';
  const content=document.querySelector('.settings-content');
  if(rememberPosition)settingsScroll[ui.setting]=content.scrollTop;
  ui.setting = section;
  for (const name of ['accounts','projects','appearance','sources','about','sync','tools']) $(`setting-${name}`).hidden = section !== name;
  document.querySelectorAll('[data-setting]').forEach(button => {
    if (button.dataset.setting === section) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  renderProject();
  content.scrollTop=settingsScroll[section]||0;
  if(focusPanel==='publish')$('setting-publish').scrollIntoView({block:'start'});
  window.onFeatureSetting?.(section);
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
  ...(!demo?[{label:'發布網站…',icon:'globe',disabled:blocked,action:()=>openPublishFor(trip)}]:[]),
  {separator:true},{label:demo?'刪除示範旅程':'封存旅程…',icon:demo?'trash':'folder',danger:demo,disabled:blocked,action:()=>window.requestTripRemoval?.(trip,demo)}];}
async function openPublishFor(trip){if(selected?.trip!==trip){await selectTrip(trip);if(selected?.trip!==trip)return;}window.openSyncFlow({kind:'publish'});}
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
$('sidebar-ai').onclick=()=>openSettings('accounts');
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
// First-run guidance: what a new user still needs, each with a button to the right place.
function renderSetupChecklist() {
  const list = $('setup-checklist'); if (!list) return;
  const hasProject = Boolean(project && window.travelDesktop), state = accountState?.state, aiReady = state === 'connected';
  // 桌面版改用完整的首次引導（onboarding.js）；這份清單只在瀏覽器預覽模式保留。
  list.hidden = true; list.replaceChildren(); if (window.travelDesktop) return;
  const steps = [
    { done: hasProject, title: '連接或建立你的旅程資料夾', hint: '行程資料會存在你自己的私人 GitHub 備份，換電腦也不會不見。', label: '前往我的旅程資料', go: () => openSettings('projects') },
    { done: aiReady, title: '安裝並連接 AI（Codex 或 Claude）', hint: state === 'unavailable' ? '這台電腦還沒有 AI 工具，App 可以幫你下載安裝。' : '用你的 ChatGPT 或 Claude 帳號登入一次。', label: state === 'unavailable' ? '安裝 AI 工具' : '連接 AI', go: () => { openSettings(state === 'unavailable' ? 'tools' : 'ai'); if (state === 'unavailable') window.openToolSetup?.(activeProvider === 'claude' ? 'claude' : 'codex'); } },
    { optional: true, title: '要分享給同行朋友時，再連接 Cloudflare', hint: '發布網站前才需要，現在可以先跳過。', label: '了解發布', go: () => { openSettings('sync'); settingTab('publish'); } },
  ];
  for (const step of steps) {
    const item = el('li', undefined, step.done ? 'done' : step.optional ? 'optional' : '');
    item.append(el('strong', step.title), el('small', step.done ? '已完成' : step.hint));
    if (!step.done) { const b = el('button', step.label); b.type = 'button'; b.onclick = step.go; item.append(b); }
    list.append(item);
  }
}
function renderProject() {
  renderSetupChecklist();
  $('project-empty').hidden=Boolean(project);$('project-summary').hidden=!project;
  $('acquire-title').textContent=project?'換一個旅程資料夾':'取得旅程資料夾';
  $('sync-trip-name').textContent=selected&&!selected.demo?selected.trip.title:'請先在工作台選擇旅程';
  if(!project)return;
  $('summary-title').textContent=project.projectName;$('summary-path').textContent=project.root;$('settings-trip-count').textContent=project.trips.length+' 趟';
  $('summary-line').textContent=project.trips.length?`${project.trips.length} 趟旅程 · 修改會存在這個資料夾，備份時上傳到你的私人 GitHub`:'資料夾裡還沒有旅程，可以回到旅程列表新增。';
  window.renderProjectUpdate?.();
  facts($('summary-facts'),[['網頁引擎版本',project.engineVersion||'未知'],['私人備份','每次備份前都會重新確認 GitHub 上的備份是私人的']]);
  $('summary-message').textContent='連接時只讀取基本資訊；打開旅程時才會完整檢查行程資料。';$('summary-trips').replaceChildren();
  for(const trip of project.trips){const key=project.projectId+':'+trip.slug,row=el('details',undefined,'project-trip trip-row');row.open=settingsOpenTrips.has(key);row.ontoggle=()=>{if(row.open)settingsOpenTrips.add(key);else settingsOpenTrips.delete(key);};
    const heading=el('summary'),copy=el('span',undefined,'trip-setting-label');copy.append(el('strong',trip.title),el('small',dateLabel(trip)));heading.append(icon('folder'),copy,icon('chevron'));row.append(heading);
    const body=el('div',undefined,'trip-setting-body'),list=el('dl',undefined,'facts');facts(list,[['網站名稱',trip.deployment?trip.deployment.name:'還沒設定'],['發布紀錄',({present:'有，發布前會再確認是你的網站',missing:'還沒發布過',unknown:'需要重新確認'})[trip.localDeploymentRecord]||'待確認'],['資料版本',trip.schemaVersion===null?'待確認':String(trip.schemaVersion)]]);body.append(list);
    if(trip.issues.length)body.append(el('p',trip.issues.map(code=>issues[code]||'設定需要確認。').join(' '),'note'));
    const actions=el('div',undefined,'settings-actions'),open=el('button','開啟旅程');open.onclick=()=>{selectTrip(trip);closeSettings();};actions.append(open);body.append(actions);row.append(body);$('summary-trips').append(row);
  }
  if(!project.trips.length)$('summary-trips').append(el('p','還沒有旅程，可以回到旅程列表新增。','note'));
}
function addMessage(message) {
  const item = el('div', undefined, `message ${message.role}`);
  item.setAttribute('aria-label', message.role === 'user' ? '你的訊息' : '助手回覆');
  if(message.role==='user'&&message.attachments?.length){const list=el('ul',undefined,'message-attachments');for(const a of message.attachments){const chip=el('li',undefined,'message-attachment');const thumb=a.kind==='image'?window.referenceThumbnail?.(a.id):null;if(thumb){const img=el('img');img.src=thumb;img.alt='';chip.append(img);}chip.append(el('span',a.name));chip.title=a.name;list.append(chip);}item.append(list);}
  const content=el('div',undefined,'message-content');if(message.role==='assistant'&&window.renderMarkdown)window.renderMarkdown(content,message.text);else content.textContent=message.text;
  item.append(content);
  // AI 提出的 App 動作（備份、發布…）以確認卡片呈現，由使用者按下才執行。
  // AI 直接套用的修改：可以看改了什麼，也可以回到修改前（那也會存成新的一版，隨時能再回來）。
  if(message.role==='assistant'&&message.applied){const a=message.applied,actions=el('div',undefined,'message-actions applied-actions');
    actions.append(el('span',`已保存到本機${a.number?` · V${a.number}`:''}${a.labels.length?` · ${a.labels.length} 處修改`:''}`,'applied-note'));
    if(a.versionId&&a.previousId){const act=(text,click)=>{const b=el('button',text);b.type='button';b.onclick=click;return b;};actions.append(act('查看修改對照',()=>showAppliedChanges(a)),act(`回到修改前（V${a.previousNumber}）`,()=>restoreVersion(a.previousId)));}
    // 改好的內容只在本機；在這裡就能備份，不用找頁首或設定。
    const backupButton=el('button','備份到 GitHub…');backupButton.type='button';backupButton.dataset.action='backup';backupButton.onclick=()=>window.openSyncFlow?.({kind:'backup',scope:'trip'});actions.append(backupButton);
    item.append(actions);}
  if(message.role==='assistant'&&message.action){const card=window.actionCard?.(message.action);if(card)item.append(card);}
  if(message.generation){const g=message.generation;item.title=`回覆設定：${g.provider} · ${g.model||'服務預設模型'} · ${g.effort||(g.resolvedEffort?'預設思考級別（'+g.resolvedEffort+'）':'預設思考級別')}`;item.dataset.provider=g.provider;item.dataset.model=g.model;item.dataset.effort=g.effort;}
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
  composerNav.reset();
  $('message').value=trip.draft;
  $('edit-day').value=state.dayId===null?'':String(state.dayId);
  selectSavedModel(state.model);
  window.renderFeatureState?.(state);
  $('messages').replaceChildren();
  addMessage({role:'assistant',text:`已打開「${trip.title}」。對話與草稿保存在這台電腦。AI 修改後會直接存到本機、右邊預覽跟著更新；改錯可以一鍵回到修改前。存到本機還不算備份，要按「備份到 GitHub」才會上傳。`});
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
  composerSuggestion='';composerNav.reset();
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
    selectionReady.catch(() => {if(selected?.trip===trip){conversationLoading=false;conversationError=true;updateComposer();notify('無法恢復這趟旅程的對話，請重新連接旅程資料夾。');}});
  }
  notify('');
  $('welcome').hidden = true;
  $('messages').hidden = false;
  $('trip-title').textContent = trip.title;
  $('trip-status').textContent = demo ? `${dateLabel(trip)} · 示範模式` : dateLabel(trip);
  $('message').disabled = !demo; $('send-message').disabled = !demo;
  $('message').placeholder = demo ? '說說你想怎麼調整這趟旅程…' : '正在打開這趟旅程…';
  $('message').value = trip.draft || '';
  $('composer-model').textContent = demo ? '模擬助手' : '尚未連接 AI';
  $('composer-note').textContent = demo ? '示範模式：回覆是事先寫好的，不會連到 AI · Enter 傳送，Shift+Enter 換行' : '正在載入這趟旅程的對話…';
  $('messages').replaceChildren();
  if (demo) for (const message of trip.messages) addMessage(message);
  else {
    addMessage({ role: 'assistant', text: `正在打開「${trip.title}」…` });
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
      // 預覽在背景建好，但面板打開才載入 iframe：載入就算「看過預覽」，發布與保存的人類閘門靠它。
      if (ui.preview && $('preview').getAttribute('src') !== realPreview.url) $('preview').src = realPreview.url;
      document.querySelector('.preview-footer').textContent = '這台電腦上的最新內容 · 尚未上傳或發布';
      document.querySelector('.preview-footer').hidden = false;
      updateComposer();
      return;
    }
    $('revision').textContent = realPreview?.status === 'loading' ? '正在驗證並建立預覽…' : realPreview?.status === 'error' ? '預覽未能建立' : selected ? '正在準備預覽…' : '尚未選擇旅程';
    $('preview-note').textContent = realPreview?.status === 'error' ? `無法產生預覽：${realPreview.message}` : selected ? '正在讀取並檢查行程資料，完成後就會顯示在這裡。' : '選擇一趟旅程後，就能查看完整安排。';
    $('retry-preview').hidden = realPreview?.status !== 'error';
    $('preview').removeAttribute('src'); $('preview').removeAttribute('srcdoc');
    // 不論面板開不開都先在背景驗證；送出訊息要等驗證完成，不能因為面板關著就一直不能送。
    if (selected && !realPreview) loadRealPreview();
    return;
  }
  $('retry-preview').hidden = true;
  $('preview').removeAttribute('src');
  $('preview').setAttribute('sandbox', '');
  document.querySelector('.preview-footer').textContent = '示範內容 · 不是真的行程網頁';
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
  if (!window.travelDesktop) { notify('瀏覽器版可試用示範流程；請在桌面 App 中選擇旅程資料夾。'); return; }
  aiBusy=true;proposalBusy=true;updateComposer();
  if(!await flushConversationDraft()){aiBusy=false;proposalBusy=false;updateComposer();return;}
  const button = $('choose-project'); button.disabled = true; button.textContent = '正在檢查…';
  try {
    const result = await window.travelDesktop.chooseProject();
    if (result.canceled) { notify('已取消選取，目前的旅程資料夾與旅程保留。'); return; }
    if (!result.ok) { notify(result.code === 'not-project' ? '沒有辨識到旅程資料夾，請選擇包含 trips 與 scripts 的那一層資料夾。' : issues[result.code] || '無法讀取這個資料夾，請確認位置與讀取權限後重試。'); return; }
    project = result;
    if (selected && !selected.demo) {
      selected = null; $('welcome').hidden = false; $('messages').hidden = true; $('messages').replaceChildren();
      $('trip-title').textContent = '選擇一趟旅程'; $('trip-status').textContent = '已切換旅程資料夾';
      $('message').disabled = true; $('send-message').disabled = true; $('message').value = ''; renderPreview();
    }
    navigation(); renderProject(); notify('已連接這個旅程資料夾，可以從左側選一趟旅程開始。');
  } catch { notify('檢查未完成，請重新選擇資料夾。'); }
  finally { aiBusy=false;proposalBusy=false;updateComposer();button.disabled = false; button.textContent = '選擇資料夾…'; }
};
function newTripModal() { if (aiBusy || pendingProposal || window.hasMaterialization?.()) { notify('請先處理目前的修改提案。'); return; } $('new-form').reset();$('new-kind').value=project&&window.travelDesktop?'real':'demo';$('new-demo-note').hidden=Boolean(project&&window.travelDesktop)||!window.travelDesktop;$('new-kind').querySelector('option[value=real]').disabled=!(project&&window.travelDesktop); $('new-error').hidden = true; $('new-dialog').showModal(); $('new-title').focus(); }
$('new-demo').onclick = newTripModal;
$('welcome-new').onclick = newTripModal;
$('cancel-new').onclick = () => $('new-dialog').close();
$('new-connect-project').onclick = () => { $('new-dialog').close(); openSettings('projects'); };
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
  // 發布入口只是帶到設定；核對、預覽確認與發布仍在「公開網站」分頁完成。
  $('publish-open').hidden=$('versions-open').hidden;
  $('publish-open').disabled=!ready||aiBusy;
  // 離開設定頁等情況，頁首重新出現時要重新判斷備份狀態，不然有改動也看不到「尚未備份」。
  if($('versions-open').hidden)$('backup-status').hidden=true;else if(headerWasHidden)window.refreshBackupStatus?.();
  headerWasHidden=$('versions-open').hidden;
  $('ai-day-controls').hidden = !real;
  // 引導結束後又缺東西（例如 AI 登入過期）：聊天上方提示，按鈕回到同一個引導，停在要處理的那一步。
  const aiMissing = real && activeProvider !== 'gemini' && ['needs-login','login-failed','unavailable','error','switch-failed'].includes(accountState.state);
  const banner = aiMissing && !setupBannerDismissed;
  $('setup-banner').hidden = !banner;
  if (banner) {
    $('setup-banner-title').textContent = accountState.state === 'unavailable' ? '還差一步：安裝 AI 助手' : accountState.state === 'needs-login' ? '還差一步：連接 AI 助手' : '還差一步：AI 助手的登入需要確認';
    $('setup-banner-text').textContent = 'AI 暫時沒辦法幫你改行程。對話和草稿都還在，可以先打字。';
  }
  $('connect-from-chat').hidden = accountState.state === 'connected' || activeProvider === 'gemini' || banner;
  const options = realPreview?.summary?.dayOptions || [];
  if (real) {
    const previous = $('edit-day').value;
    const specs=[{value:'',label:'自動判斷 · 討論或直接修改'}];
    if(!realPreview?.planning)specs.push({value:'-1',label:'整趟行程 · 提出跨日修改'});
    for (const day of options) specs.push({value:String(day.id),label:`第 ${day.id} 天 · ${day.title}`});
    const has=v=>specs.some(o=>o.value===v);
    // 「不指定」不算已選：還原時以保存的 dayId 為準。
    const target=previous!==''&&has(previous)?previous:selected?.trip.dayId===-1&&has('-1')?'-1':selected?.trip.dayId!=null&&has(String(selected.trip.dayId))?String(selected.trip.dayId):'';
    syncSelect($('edit-day'),specs,target);
    setIfChanged($('edit-day'),'disabled',!ready || aiBusy || Boolean(pendingProposal));
  }
  const hasModels = [...$('chat-model').options].some(o=>!o.disabled);
  const modelReady=hasModels&&Boolean($('chat-model').selectedOptions[0])&&!$('chat-model').selectedOptions[0].disabled;
  setIfChanged($('chat-model'),'hidden',!real || accountState.state !== 'connected' || !$('chat-model').options.length);
  const providerLocked=Boolean(selected&&!selected.demo&&selected.trip.featureState?.started);
  setIfChanged($('chat-provider'),'hidden',!real||providerLocked);
  $('chat-provider-locked').hidden=!real||!providerLocked;
  $('chat-provider-locked').textContent=({codex:'Codex',claude:'Claude Code',gemini:'Gemini（暫停）'})[activeProvider]||activeProvider;
  window.refreshProviderOptions?.();
  $('chat-provider').disabled=providerLocked||aiBusy||Boolean(pendingProposal)||Boolean(window.hasMaterialization?.());
  setIfChanged($('chat-provider'),'title',providerLocked?'此對話的 AI 服務已固定；可從右上方選單使用其他 AI 開新對話':'選擇這段新對話的 AI 服務');
  $('chat-model').disabled = aiBusy || Boolean(pendingProposal);
  $('codex-model').disabled = aiBusy || Boolean(pendingProposal);
  $('composer-model').hidden = !$('chat-model').hidden;
  $('restart-conversation').hidden=!real;
  $('restart-conversation').disabled=aiBusy || Boolean(pendingProposal) || !ready;
  window.updateFeatureControls?.({real,ready,busy:aiBusy,pending:pendingProposal,planning:Boolean(realPreview?.planning)});
  const canSend = demo || (activeProvider !== 'gemini' && ready && accountState.state === 'connected' && modelReady && !selected.trip.needsRestart);
  $('message').disabled = !selected || conversationLoading || conversationError || aiBusy || Boolean(pendingProposal) || Boolean(window.hasMaterialization?.());
  $('send-message').disabled = !canSend || aiBusy || Boolean(pendingProposal) || Boolean(window.hasMaterialization?.());
  $('send-message').hidden = aiBusy; $('stop-generation').hidden = !aiBusy || savingProposal || proposalBusy;
  $('choose-project').disabled = aiBusy || Boolean(pendingProposal);
  $('codex-switch').disabled = aiBusy || Boolean(pendingProposal) || accountState.state === 'switching';
  $('codex-switch-help').hidden = accountState.state !== 'connected' || (!aiBusy && !pendingProposal);
  if (real) {
    $('composer-model').textContent = activeProvider === 'gemini' ? 'Gemini 暫停提供' : accountState.state === 'connected' ? hasModels ? ({codex:'Codex',claude:'Claude Code'})[activeProvider] : '正在取得模型…' : '尚未連接 AI';
    const basePlaceholder = activeProvider === 'gemini' ? 'Gemini 暫停提供，請用其他 AI 開新對話' : !ready ? (realPreview?.status==='error'?'行程資料需要先修正，說明在右側預覽':'正在檢查這趟行程，完成後就能送出…') : accountState.state !== 'connected' ? '連接 AI 帳號後，就能提出修改' : $('edit-day').value === '' ? '例如：希望整趟行程更輕鬆，可以怎麼調整？' : $('edit-day').value === '-1' ? '例如：請套用剛才的建議' : '例如：把這一天的標題改成「悠閒出發」';
    setIfChanged($('message'),'placeholder',composerSuggestion&&ready&&accountState.state==='connected'?composerSuggestion+'　（按 Tab 帶入）':basePlaceholder);
    $('composer-note').textContent = activeProvider === 'gemini' ? '舊 Gemini CLI 連線暫停；歷史紀錄保留。可從對話選單使用 Codex 或 Claude 開新對話。' : conversationError ? '對話紀錄無法讀寫，暫停送出以免遺失。' : conversationLoading ? '正在恢復對話…' : selected.trip.needsRestart ? (selected.trip.featureState?.stopRequested?'可以先編輯草稿。停止狀態尚未確認，請先確認停止狀態。':selected.trip.featureState?.legacyStopped?'可以先編輯草稿。上次工作狀態尚未確認，請先確認上次狀態。':'可以先編輯草稿。上次回覆尚未確認，請先找回上次回覆或重新開始（保留紀錄）。') : !ready&&!realPreview?.planning ? (realPreview?.status==='error'?'行程資料沒有通過檢查，先修正才能請 AI 修改。原因寫在右側預覽，可以打開看。':'正在檢查這趟行程的資料，通常幾秒鐘；完成前先不能送出，可以先打字。') : selected.trip.stopped ? '上一輪已停止，可以在原對話繼續討論。' : !modelReady&&accountState.state==='connected'?'這段對話的模型目前不可用，請選擇其他模型。' : pendingProposal ? '請先確認或放棄提案，再進行下一次修改。' : $('edit-day').value === '' ? 'AI 自己判斷：只是問問就回答；要它修改就直接改好存到本機，右邊預覽馬上更新，改錯可以一鍵回到修改前。' : '只改這一天；改好直接存到本機，可以一鍵回到修改前。';
  }
}
function renderProposal() {
  $('proposal-review').hidden=!pendingProposal;
  if(!pendingProposal){if($('changes-dialog').open)$('changes-dialog').close();updateComposer();return;}
  $('proposal-heading').textContent=pendingProposal.kind==='restore'?'版本回復提案 · 尚未保存':'修改提案 · 尚未保存';
  $('proposal-changes').textContent=`已選 ${pendingProposal.selectedKeys?.length||0}／${pendingProposal.changes?.length||0} 項修改`;
  // 需要查核時，主要按鈕直接開始查核，不讓人對著停用的按鈕不知道下一步。
  const research=pendingProposal.requiresResearch;
  $('proposal-note').textContent=research?'這次改到停留或交通，保存前要先查核來源與可行性。按「先查核，再保存」開始；也可以在「查看修改對照」取消這些項目。':pendingProposal.previewLoaded?'請檢查候選預覽，確認後建立新的本機版本。':'請先查看右側候選預覽，再確認保存。';
  $('save-proposal').textContent=research?'先查核，再保存':'確認保存到你的行程';
  $('save-proposal').disabled=research?aiBusy:!pendingProposal.previewLoaded||aiBusy||!pendingProposal.selectedKeys?.length;
  $('discard-proposal').disabled=aiBusy;$('review-changes').disabled=aiBusy;
  if($('changes-dialog').open)renderChanges();
  updateComposer();
}
function stageProposal(proposal){
  pendingProposal={...proposal,...conversationTarget(),previewLoaded:false};
  realPreview={...realPreview,url:proposal.previewUrl};setPreview(true);renderPreview();renderProposal();
}
async function showAppliedChanges(applied){
  if(!selected||selected.demo)return;
  try{const result=await window.travelDesktop.versionChanges({...conversationTarget(),versionId:applied.versionId});if(!result.ok){notify(result.message);return;}
    $('changes-heading').textContent=`V${result.previousNumber} → V${result.number} 改了什麼`;$('changes-dialog').querySelector('.dialog-description').textContent='這些修改已經保存到本機檔案。不滿意可以直接在聊天裡請 AI 再調整，或按「回到修改前」。';
    $('changes-dialog').querySelector('.review-tools').hidden=true;$('change-list').replaceChildren();
    for(const change of result.changes){const section=el('section',undefined,'change-item');section.append(el('h3',change.label,'change-label'));const pair=el('div',undefined,'change-pair');for(const [name,text] of [['修改前',change.before],['修改後',change.after]]){const column=el('div');column.append(el('h3',name),el('p',text));pair.append(column);}section.append(pair);$('change-list').append(section);}
    if(!result.changes.length)$('change-list').append(el('p','這一版的日程內容和前一版相同。'));
    $('changes-dialog').showModal();
  }catch{notify('修改對照未能載入，請重試。');}
}
function renderChanges(){
  $('changes-heading').textContent='選擇要保留的修改';$('changes-dialog').querySelector('.dialog-description').textContent='取消勾選的部分會保留目前內容。停留安排與備案一起選取，避免拆散相依內容。';$('changes-dialog').querySelector('.review-tools').hidden=false;
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
$('publish-open').onclick=()=>window.openSyncFlow({kind:'publish'});
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
  try{const result=await window.travelDesktop.restoreVersion({...conversationTarget(),versionId});if(!result.ok)notify(result.message);else if(result.proposal.applied){if(result.conversation)applyConversation(result.conversation,selected.trip);realPreview=null;renderPreview();window.refreshBackupStatus?.();}else if(result.proposal.changed){stageProposal(result.proposal);renderChanges();$('changes-dialog').showModal();}else notify(result.proposal.summary);}
  catch{notify('未能回到那個版本，原行程沒有被改動。');}
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
$('connect-from-chat').onclick = () => openSettings('accounts');
var setupBannerDismissed = false;
$('setup-banner-go').onclick = () => { if (window.resumeOnboarding) window.resumeOnboarding(); else openSettings('accounts'); };
$('setup-banner-close').onclick = () => { setupBannerDismissed = true; updateComposer(); };
$('chat-form').onsubmit = async event => {
  event.preventDefault(); if (!selected || aiBusy || pendingProposal) return;
  const message = $('message').value.trim(); if (!message) return;
  const trip = selected.trip;
  composerNav.reset();
  if (selected.demo) {
    trip.messages.push({ role:'user',text:message }); trip.day=`第一天，保留彈性安排。\n\n你的調整：${message}`; trip.revision++;
    trip.messages.push({ role:'assistant',text:`已把你的想法加入第一天。\n\n右側預覽已更新為第 ${trip.revision} 版。這次是示範修改，沒有呼叫 AI，也沒有改你的行程。` });
    trip.draft=''; selectTrip(trip,true); $('message').focus(); return;
  }
  if (accountState.state !== 'connected' || !['ready','planning'].includes(realPreview?.status)) { notify('請先驗證行程並連接 AI。'); return; }
  if(conversationLoading||conversationError||trip.needsRestart)return;
  await sendRealMessage(trip,message,{dayId:$('edit-day').value === '' ? null : Number($('edit-day').value)});
};
// attachments 沒給就取輸入框目前附加的參考資料；重送時帶原訊息的附件，不動輸入框裡的草稿。
async function sendRealMessage(trip,message,{dayId,attachments=null}){
  const fromComposer=attachments===null,keptDraft=fromComposer?'':$('message').value;
  aiBusy=true;updateComposer();
  if(!await flushConversationDraft()){aiBusy=false;updateComposer();return;}
  const target={projectId:project.projectId,slug:trip.slug,dayId,text:message,model:$('chat-model').value||undefined,effort:$('chat-effort').value||undefined,attachmentIds:[]};
  if(fromComposer)attachments=window.takeComposerAttachments?.()||[];target.attachmentIds=attachments.map(a=>a.id);clearSuggestion();
  appendRealMessage(trip,{role:'user',text:message,...(attachments.length?{attachments}:{})}); if(fromComposer){$('message').value=''; trip.draft='';} aiBusy=true; updateComposer();
  const progress = addMessage({role:'assistant',text:target.dayId === null ? '正在整理整體行程建議…' : '正在準備這次修改…'}); markAIProgress(progress);
  try {
    const result=await window.travelDesktop.generateProposal(target); progress.remove();
    if(result.conversation)applyConversation(result.conversation,trip);
    // 送出會把保存的草稿清空；重送時輸入框裡的草稿不是這則訊息，要放回去。
    if(keptDraft&&selected?.trip===trip&&!$('message').value){trip.draft=keptDraft;$('message').value=keptDraft;queuePreferences();}
    window.acceptFeatureResult?.(result);
    if(!result.ok&&!result.accepted&&fromComposer){trip.draft=message;$('message').value=message;window.restoreComposerAttachments?.(attachments);}
    if(!result.ok&&result.applied){realPreview=null;renderPreview();window.refreshBackupStatus?.();}
    if(result.ok&&selected?.trip===trip)applySuggestion(result.suggestion);
    if (!result.ok && !result.conversation) appendRealMessage(trip,{role:'assistant',text:result.message});
    if(result.ok) {
      if(!result.conversation)appendRealMessage(trip,{role:'assistant',text:result.proposal.summary});
      if (result.proposal.changed) {
        stageProposal(result.proposal);
      }
      // 已直接保存：重新載入預覽讓人立刻看到結果，頂部「尚未備份」也跟著更新。
      if (result.proposal.applied) { realPreview=null; renderPreview(); window.refreshBackupStatus?.(); }
    }
  } catch { progress.remove(); appendRealMessage(trip,{role:'assistant',text:'這次回覆未能確認，沒有自動重送，也沒有保存原行程。'}); }
  finally { aiBusy=false; renderProposal(); updateComposer(); }
}
// 這輪確定沒完成（見 features.js 的 renderJob）：重送原訊息，或帶回輸入框修改後再送。
function failedRequestAttachments(trip,text){return [...(trip.conversation||[])].reverse().find(m=>m.role==='user'&&m.text===text)?.attachments||[];}
window.resendFailedRequest=async job=>{
  if(!selected||selected.demo||aiBusy||pendingProposal)return;
  const trip=selected.trip,input=job.input;
  // 查核／建立正式行程由原本的按鈕重跑；按鈕停用時要說原因，不能按了沒反應。
  const rerun={research:['research-trip','現在還不能重新查核：請等右側預覽準備好並確認 AI 已連接。'],materialize:['materialize-plan','現在還不能重新建立正式行程：請先確認逐日草案與查核摘要。']}[input.mode];
  if(rerun){const target=$(rerun[0]);if(target.disabled||target.hidden)notify(rerun[1]);else target.click();return;}
  const blocker=accountState.state!=='connected'?'請先連接 AI，再重送。':!['ready','planning'].includes(realPreview?.status)?'行程還在驗證，等右側預覽準備好再重送。':conversationLoading||conversationError?'對話紀錄還沒準備好，請稍候再試。':trip.needsRestart?'上一輪狀態還沒確認，請先處理上方的卡片。':null;
  if(blocker){notify(blocker);return;}
  await sendRealMessage(trip,input.text,{dayId:input.dayId??null,attachments:failedRequestAttachments(trip,input.text)});
};
window.recallFailedRequest=job=>{
  if(!selected||selected.demo)return;
  const box=$('message'),text=job.input.text,current=box.value;
  // 輸入框已經有別的草稿就接在後面，不蓋掉。
  box.value=current.trim()&&current!==text?current.replace(/\s+$/,'')+'\n\n'+text:text;
  window.restoreComposerAttachments?.(failedRequestAttachments(selected.trip,text));
  box.dispatchEvent(new Event('input'));box.focus();box.setSelectionRange(box.value.length,box.value.length);
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
  if (pendingProposal.requiresResearch) { if($('research-trip').disabled){notify(accountState.state!=='connected'?'請先連接 AI，才能查核。':'目前無法開始查核，請等右側預覽載入完成再試。');return;} $('research-trip').click(); return; }
  aiBusy=true; savingProposal=true; renderProposal();
  try {
    const result=await window.travelDesktop.applyProposal({projectId:pendingProposal.projectId,slug:pendingProposal.slug,proposalId:pendingProposal.id});
    if (!result.ok) notify(result.message);
    else {
      appendRealMessage(selected.trip,{role:'assistant',text:`已保存到這台電腦上的行程檔案，並保留修改前的還原副本。尚未異地備份，也沒有部署。${result.statusUpdated ? '' : '\n進度紀錄未能同步更新，請稍後核對。'}`});
      if(result.versionRecorded===false)notify('內容已保存，但版本紀錄尚待核對；請重新載入後確認，避免重複保存。');
      window.refreshBackupStatus?.();
      if(result.version)appendRealMessage(selected.trip,{role:'assistant',text:`已建立本機日程版本 V${result.version.number}。可從上方版本紀錄查看或回復。`});
      if(result.conversationWarning)notify('行程已保存，但對話紀錄未能更新，請保留此畫面。');
      pendingProposal=null; realPreview=null; renderPreview();
    }
  } catch { notify('保存結果未能確認，請重新開啟行程核對，避免重複操作。'); }
  finally { aiBusy=false; savingProposal=false; renderProposal(); updateComposer(); }
};
$('message').oninput = () => { if(selected){selected.trip.draft=$('message').value;clearTimeout(draftTimer);draftTimer=setTimeout(queuePreferences,350);} };
window.addEventListener('blur',()=>queuePreferences());
// AI 建議的下一句話放在輸入框提示，按 Tab 帶入。
var composerSuggestion='';
function clearSuggestion(){if(!composerSuggestion)return;composerSuggestion='';updateComposer();}
function applySuggestion(suggestion){
  clearSuggestion();if(!suggestion?.reply||!selected||selected.demo||$('message').value)return;
  composerSuggestion=suggestion.reply;updateComposer();
}
$('message').addEventListener('input',()=>{if(composerSuggestion&&$('message').value)clearSuggestion();});
function browseComposerHistory(event){
  const box=$('message'),up=event.key==='ArrowUp';
  if(event.shiftKey||event.altKey||event.metaKey||event.ctrlKey||event.isComposing||event.keyCode===229)return false;
  const edge=up?composerHistory.caretOnFirstLine:composerHistory.caretOnLastLine;
  if(!edge(box.value,box.selectionStart,box.selectionEnd))return false;
  const next=up?composerNav.up(box.value):composerNav.down(box.value);
  if(next===null)return false;
  box.value=next;box.setSelectionRange(next.length,next.length);box.dispatchEvent(new Event('input'));return true;
}
$('message').onkeydown = event => { if(event.key==='Tab'&&!event.shiftKey&&composerSuggestion&&!$('message').value){event.preventDefault();$('message').value=composerSuggestion;$('message').dispatchEvent(new Event('input'));clearSuggestion();return;} if((event.key==='ArrowUp'||event.key==='ArrowDown')&&browseComposerHistory(event)){event.preventDefault();return;} if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); $('chat-form').requestSubmit(); } };
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
      if (saved.warning) notify(saved.warning === 'project-recovery-required' ? '上次關閉時有一次保存沒有完成，App 需要重新確認旅程資料夾。請到「設定 → 我的旅程資料」重新選取原本的旅程資料夾；你的檔案都還在。' : saved.warning === 'project-unavailable' ? '上次的旅程資料夾目前無法讀取，請到設定重新選擇資料夾。' : '連接紀錄無法讀取，原紀錄已保留，請讓 coding agent 協助處理。');
    } catch { notify('無法恢復上次的旅程資料夾連接，請到設定重新選擇。'); }
  }
  renderTheme();
  document.documentElement.dataset.ready = 'true';
}
if(!window.travelDesktop)seedDemo();setSidebar(ui.sidebar); setPreview(ui.preview); navigation(); renderProject();
initializeWorkspace();
if(window.travelDesktop?.appVersion){$('app-version').textContent='v'+window.travelDesktop.appVersion;$('app-version').hidden=false;$('about-version').textContent=window.travelDesktop.appVersion+(window.travelDesktop.appVersion.endsWith('-dev')?' · 開發中（從原始碼執行）':' · 測試版（未簽章）');}
if(window.travelDesktop){window.travelDesktop.feature('provider-status').then(result=>{if(result.ok&&result.provider)activeProvider=result.provider;}).catch(()=>{}).finally(restoreAIConnection);}

function renderCodexAccount(account) {
  queueMicrotask(renderSetupChecklist);
  if(account.provider&&account.provider!==activeProvider){activeProvider=account.provider;accountRequest++;}accountState = account;window.onFeatureAccount?.(account);
  const providerName=({codex:'Codex',claude:'Claude Code',gemini:'Gemini'})[activeProvider];$('provider-heading').textContent=providerName;$('chat-provider').value=activeProvider;window.refreshProviderOptions?.();$('codex-connect').textContent='檢查 '+providerName;$('codex-login').textContent=activeProvider==='codex'?'連接 ChatGPT':'登入 '+providerName;
  const labels = { checking:'正在恢復連線', paused:'暫停提供', unavailable:'尚未安裝', error:'連線待確認', disconnected:'尚未連接', 'needs-login':'需要登入', connected:'已連接', 'waiting-login':'等待授權', 'login-failed':'登入未完成', switching:'正在更換帳號', 'switch-failed':'需要重新確認' };
  $('codex-badge').textContent = account.cachedAuth?'登入已保存':labels[account.state] || '需要確認';
  $('sidebar-account-status').textContent = account.state==='connected' ? providerName+(account.cachedAuth?' · 登入已保存':' · 已連接') : labels[account.state] || '需要確認';
  $('codex-status').textContent = account.state === 'paused'?'舊 Gemini CLI 連接暫停；既有對話仍保留。':account.state === 'checking'?'正在核對這台電腦已保存的登入，無需重新授權。':account.state === 'connected' ? `已連接 ${account.label || providerName+' 帳號'}${account.plan ? ` · ${account.plan}` : ''}` : account.state === 'waiting-login' ? '請在開啟的官方頁面完成登入，完成後會自動更新。' : account.state === 'needs-login' ? `${providerName} ${account.version} 已就緒，請完成官方登入。` : '尚未完成帳號連接，可從更多選單重新核對。';
  $('codex-login').hidden = !['needs-login', 'login-failed'].includes(account.state);
  $('codex-cancel').hidden = account.state !== 'waiting-login';
  $('codex-refresh').hidden = !['waiting-login', 'connected', 'login-failed', 'switch-failed'].includes(account.state);
  $('codex-switch').hidden = account.state !== 'connected'||account.capabilities?.switchAccount===false;
  $('codex-copy-link').hidden = activeProvider!=='codex'||account.state !== 'waiting-login';
  $('codex-login-help').hidden = activeProvider!=='codex'||account.state !== 'waiting-login';
  $('provider-capabilities').textContent=activeProvider==='gemini'?'Gemini 連線暫停，請使用 Codex 或 Claude。':activeProvider==='codex'?'支援文字、圖片與原生對話續接。':'支援 Claude Pro／Max。支援文字、截圖、公開網址與來源研究；要調整思考級別請改用 Codex。';
  if (account.state !== 'connected') { modelRequest++; $('codex-model').replaceChildren(); $('chat-model').replaceChildren(); $('codex-model-row').hidden=true; }
  updateComposer();
  if (account.state === 'connected') loadModels();
}
async function restoreAIConnection(){
  const request=++accountRequest,provider=activeProvider;
  if(provider==='gemini'){renderCodexAccount({provider,state:'paused'});return;}
  renderCodexAccount({state:'checking'});
  try{const result=await window.travelDesktop.connectCodex();if(request!==accountRequest||provider!==activeProvider)return;if(result.ok)renderCodexAccount(result.account);else{renderCodexAccount({state:result.code==='CLI_MISSING'?'unavailable':'error'});$('codex-message').textContent=result.message;$('codex-message').hidden=false;}}
  catch{if(request!==accountRequest||provider!==activeProvider)return;renderCodexAccount({state:'error'});$('codex-message').textContent='無法核對登入，請稍後重試；已保存的登入資料仍保留。';$('codex-message').hidden=false;}
}
async function codexAction(method) {
  if(activeProvider==='gemini'){notify('Gemini 連線暫停；請用其他 AI 開新對話。');return;}
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
  syncSelect($('chat-model'),[...source.options].map(optionSpec),source.value);
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
