const { app, BrowserWindow, dialog, ipcMain, protocol, session, nativeTheme, nativeImage, shell, clipboard } = require('electron');
const path = require('node:path');
const fs=require('node:fs/promises');
const { randomUUID, createHash } = require('node:crypto');
const { inspectProject } = require('../spikes/inspect-project.cjs');
const { CSP, readAsset } = require('./assets.cjs');
const { createProjectStore } = require('./project-store.cjs');
const { buildPreview, PREVIEW_CSP } = require('./preview.cjs');
const { BrowserPreview } = require('./browser-preview.cjs');
const { CodexAccount } = require('./codex/account.cjs');
const { CodexEditor } = require('./codex/editor.cjs');
const {JobController}=require('./services/jobs.cjs');
const {NewTripService}=require('./services/new-trip.cjs');
const {AttachmentStore,fetchPublicReference}=require('./services/attachments.cjs');
const {createResearchTools}=require('./services/research-tools.cjs');
const {findPrivateData,appendPrivateNotes,privateMarkers}=require('./services/private-guard.cjs');
const {AuthTools}=require('./services/auth-tools.cjs');
const {LocalArchiveService}=require('./services/local-archive.cjs');
const {ToolSupport}=require('./services/tool-support.cjs');
const {TripTrashService}=require('./services/trip-trash.cjs');
const {ProjectSetupService}=require('./services/project-setup.cjs');
const {BackupService}=require('./services/backup.cjs');
const {PublishingService}=require('./services/publishing.cjs');
const {UpdateManager}=require('./services/updater.cjs');
const {requestReset,applyPendingReset}=require('./services/app-reset.cjs');
const {prepareNodeShim}=require('./services/node-shim.cjs');
const {claimProject,releaseProject}=require('./services/project-lock.cjs');
const {ProjectUpdateService,migrateWithAppScripts}=require('./services/project-update.cjs');
// 打包版記錄了建置時的引擎版本與 commit；從原始碼執行時直接讀這個 repo。
function readBuildInfo(){try{return require('./build-info.json');}catch{}try{const root=path.resolve(__dirname,'../..');const commit=require('node:child_process').execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim();return {engineVersion:require(path.join(root,'package.json')).version,commit};}catch{return {engineVersion:null,commit:null};}}
const { ProposalStore, verifyPrivateProject } = require('./proposals.cjs');
const { VersionStore } = require('./version-store.cjs');
const { ConversationStore,SESSION_FIELDS,applySuggestedTitle } = require('./conversation-store.cjs');
const clients = new Set();
const chatStores = new Set();
const activeOperations=new Set(),shutdownHooks=new Set();
let shuttingDown=false,nativeUpdateHandoff=false;
function tracked(action){const task=Promise.resolve().then(action);activeOperations.add(task);task.finally(()=>activeOperations.delete(task)).catch(()=>{});return task;}
async function waitForOperations(){while(activeOperations.size)await Promise.allSettled([...activeOperations]);}

const APP_URL = 'travel-app://prototype/index.html';
protocol.registerSchemesAsPrivileged(['travel-app', 'travel-preview'].map(scheme => ({ scheme, privileges: { standard: true, secure: true, supportFetchAPI: true } })));
app.setName('Travel Planner');
// 測試（smoke 直接以自己的檔案當入口，或設定 TRAVEL_PLANNER_BACKGROUND=1）在背景跑：
// 不出現在 Dock、不顯示視窗，也就不會搶走開發者正在用的視窗焦點。
// 由 boot.cjs 明確標記：Electron 下 require.main 不是 boot.cjs，不能拿它判斷入口。
const backgroundRun = process.env.TRAVEL_PLANNER_BACKGROUND === '1' || globalThis.__travelPlannerBoot !== true;
if (backgroundRun && process.platform === 'darwin') app.setActivationPolicy?.('accessory');
const bundledApp=()=>{const rel=path.relative(path.join(process.resourcesPath,'app'),__dirname);return rel!==''&&!rel.startsWith('..')&&!path.isAbsolute(rel);};
// 安裝版與從原始碼執行的開發版各用各的資料夾：專案連接、對話與 App 專屬的 AI 登入互不影響。
app.setPath('userData', process.env.TRAVEL_PLANNER_STATE_DIR || path.join(app.getPath('appData'), bundledApp() ? 'Travel Planner' : 'travel-planner-prototype'));
// 「重置 App 資料」在上次關閉前留下標記；必須在 Chromium 開啟資料夾之前刪除。
applyPendingReset(app.getPath('userData'));

async function createWindow({ pickDirectory,pickReferences,saveArchivePath,pickArchivePath,pickProjectParent,makeToolSupport=(dir,options)=>new ToolSupport(dir,options),makeTrash=()=>new TripTrashService(),makeProvider=(id,directory,options)=>require('./providers/index.cjs').createProvider(id,directory,options),makeProjectSetup=()=>new ProjectSetupService(),fetchReference=fetchPublicReference,referenceOptions,makeResearch=options=>createResearchTools(options),
  makeArchive=()=>new LocalArchiveService(),makeAuth=options=>new AuthTools(options),makeUpdater=options=>new UpdateManager(options),environmentService, stateDirectory = app.getPath('userData'), codexAccount,
  makeNewTrips = () => new NewTripService({checkPrivate:verifyPrivateProject}),
  makeBackup = hookPath => new BackupService({ hookPath }), makePublisher = directory => new PublishingService(directory),
  makeVersions = directory => new VersionStore(directory),
  makeConversations = directory => new ConversationStore(directory),
  makeEditor = account => new CodexEditor(account), makeProposals = directory => new ProposalStore(directory),
  defaultProjectParentDirectory = null, openLoginURL = url => shell.openExternal(url), copyLoginURL = url => clipboard.writeText(url), openPreviewURL = url => shell.openExternal(url) } = {}) {
  const handle=(channel,fn)=>ipcMain.handle(channel,(...args)=>{if((shuttingDown||windowClosing)&&channel!=='conversation:preferences')throw Error('APP_CLOSING');return tracked(()=>fn(...args));});
  let sendToolProgress=()=>{};const toolSupport=makeToolSupport(stateDirectory,{onProgress:value=>sendToolProgress(value)});await toolSupport.applyEnvironment();
  const store = createProjectStore(stateDirectory);
  const versions=makeVersions(stateDirectory);chatStores.add(versions);
  const conversations = makeConversations(stateDirectory); chatStores.add(conversations);
  const researchKit=makeResearch({electron:{BrowserWindow,session},stateDirectory});
  const jobs=new JobController(conversations),newTrips=makeNewTrips(),attachments=new AttachmentStore(stateDirectory),backup=makeBackup(await prepareNodeShim(stateDirectory).catch(()=>null)),publisher=makePublisher(stateDirectory),archives=makeArchive(),projectSetup=makeProjectSetup(),trash=makeTrash();
  let pendingTripRemoval=null,materialization=null,previewSeenURL=null,autoTarget=null,polling=false,windowClosing=false;
  const restored = await store.read();
  nativeTheme.themeSource = restored.state.theme;
  let currentProject = null;
  let activeSlug=restored.state.project?.selectedSlug||null;
  let restoreWarning = restored.ok ? null : 'store-invalid';
  if (restored.ok && restored.state.project) {
    try { await newTrips.recover?.(restored.state.project.root); } catch { restoreWarning='project-recovery-required'; }
    const checked = await inspectProject(restored.state.project.root);
    if (restoreWarning!=='project-recovery-required' && checked.ok && checked.root === restored.state.project.root) currentProject = { ...checked, projectId: restored.state.project.id };
    else restoreWarning ||= 'project-unavailable';
  }
  const browserPreview = new BrowserPreview();
  let artifact = null;
  let previewAttempt = 0;
  let generating = false;
  let versionBusy=false;
  let generationNonce = 0, explicitStopNonce = null, activeGenerationTarget = null, activeGenerationRunId = null;
  let accountSwitching = false;
  let pendingLoginURL = null;
  const isolatedSession = session.fromPartition('travel-planner-prototype');
  isolatedSession.setPermissionRequestHandler((_contents, _permission, done) => done(false));
  isolatedSession.setPermissionCheckHandler(() => false);
  await isolatedSession.protocol.handle('travel-preview', request => {
    const url = new URL(request.url);
    if (request.method !== 'GET' || !artifact || url.host !== artifact.token) return new Response(null, { status: 404 });
    const asset = artifact.read(url.pathname);
    if (!asset) return new Response(null, { status: 404 });
    return new Response(asset.body, { headers: { 'Content-Type': asset.type, 'Content-Security-Policy': PREVIEW_CSP,
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
  });
  await isolatedSession.protocol.handle('travel-app', async request => {
    const url = new URL(request.url);
    if (url.host !== 'prototype' || request.method !== 'GET') return new Response(null, { status: 404 });
    const asset = await readAsset(url.pathname);
    if (!asset) return new Response(null, { status: 404 });
    return new Response(asset.body, {
      headers: { 'Content-Type': asset.type, 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff' },
    });
  });
  const win = new BrowserWindow({
    show: !backgroundRun,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x:18, y:20 } } : {titleBarOverlay:{height:56}}),
    width: 1380, height: 900, minWidth: 860, minHeight: 640,
    title: 'Travel Planner · 接手既有旅程', backgroundColor: nativeTheme.shouldUseDarkColors ? '#191919' : '#ffffff',
    icon: path.join(__dirname, `assets/brand/${nativeTheme.shouldUseDarkColors ? 'dark' : 'light'}/${process.platform === 'darwin' ? 'macos-icon' : 'icon'}-256.png`),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), session: isolatedSession,
      nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false,
      // 開發中（未打包）顯示 -dev。不用 app.isPackaged：打包版的執行檔仍叫 Electron，它會誤判為開發中。
      additionalArguments: ['--tp-app-version='+require('./package.json').version+(bundledApp()?'':'-dev')],
    },
  });
  sendToolProgress=value=>{if(!win.isDestroyed())win.webContents.send('feature:tool-progress',value);};
  const authOptions={onProgress:value=>{if(!win.isDestroyed())win.webContents.send('feature:auth-progress',value);}};let auth=makeAuth(authOptions);
  let updateInstallScheduled=false,updateShutdownStarted=false;
  const updater=makeUpdater({app,...(environmentService?.checkForUpdates?{checkRelease:input=>environmentService.checkForUpdates(input)}:{})});
  const restoreAfterUpdateFailure=()=>{if(!updateInstallScheduled)return;nativeUpdateHandoff=false;updateInstallScheduled=false;if(updateShutdownStarted){shuttingDown=false;updateShutdownStarted=false;reopenAfterCloseFailure();}else windowClosing=false;};
  const updateChanged=value=>{if(value.state==='error')restoreAfterUpdateFailure();if(!win.isDestroyed())win.webContents.send('feature:update-state',value);};
  updater.on('changed',updateChanged);
  let providerId=codexAccount?'codex':restored.state.aiProvider||'codex';
  let defaultsQueue=Promise.resolve();
  const savedDefaultProvider=restored.state.aiDefaults?.provider||restored.state.aiProvider||'codex';
  // Keep saved Gemini preferences/history intact, but never start a new hidden Google conversation.
  let aiDefaults={provider:savedDefaultProvider==='gemini'?'codex':savedDefaultProvider,models:restored.state.aiDefaults?.models||{},effort:restored.state.aiDefaults?.effort??'medium'};
  const createAI=id=>id==='codex'?{account:codexAccount||new CodexAccount(stateDirectory)}:makeProvider(id,stateDirectory,{resolveCommand:tool=>toolSupport.resolveCommand(tool)});
  const providerBundles=new Map(),providerListeners=new Map(),providerLoginURLs=new Map(),providerAuthBusy=new Set();
  let bundle=createAI(providerId);bundle.editor ||= makeEditor(bundle.account);providerBundles.set(providerId,bundle);
  let account=bundle.account,editor=bundle.editor;
  const proposals = makeProposals(stateDirectory);
  proposals.beforeWrite=async proposal=>{
    await versions.observe(proposal.target,{source:proposal.originalSource,contextDigest:proposal.contextDigest});
    return versions.prepare(proposal.target,{beforeSource:proposal.originalSource,afterSource:proposal.source,contextDigest:proposal.contextDigest,label:proposal.label,kind:proposal.kind});
  };
  proposals.afterWrite=(proposal,id)=>versions.finish(proposal.target,id,proposal.source);
  clients.add(account);
  const accountChanged = value => {
    value={...value,provider:providerId,capabilities:bundle.capabilities||null};
    if (value.state !== 'waiting-login') pendingLoginURL=null;
    if (!win.isDestroyed()) win.webContents.send('codex:account-changed', value);
  };
  function providerView(id){const item=providerBundles.get(id);return {provider:id,...item.account.account,capabilities:item.capabilities||null};}
  function listenProvider(id,item){const changed=value=>{if(value.state!=='waiting-login')providerLoginURLs.delete(id);if(!win.isDestroyed())win.webContents.send('feature:provider-account',{...value,provider:id,capabilities:item.capabilities||null});if(id===providerId)accountChanged(value);};providerListeners.set(id,changed);item.account.on('changed',changed);clients.add(item.account);}
  function getProvider(id){if(!['codex','claude','gemini'].includes(id))throw Object.assign(Error('INVALID_PROVIDER'),{code:'INVALID_PROVIDER'});if(!providerBundles.has(id)){const item=createAI(id);item.editor ||= makeEditor(item.account);providerBundles.set(id,item);listenProvider(id,item);}return providerBundles.get(id);}
  listenProvider(providerId,bundle);
  async function activateProvider(id){if(id===providerId)return;const next=getProvider(id);await store.setAIProvider(id);providerId=id;bundle=next;account=next.account;editor=next.editor;pendingLoginURL=providerLoginURLs.get(id)||null;autoTarget=null;accountChanged(account.account);}
  function sessionProvider(state){if(state.provider)return state.provider;const tagged=['claude','gemini'].find(id=>state.thread?.id?.startsWith(id+':'));if(tagged)return tagged;if(state.thread)return 'codex';if(/^(?:auto-)?gemini/.test(state.model||''))return 'gemini';if(/^(?:claude-|sonnet|opus|haiku)/.test(state.model||''))return 'claude';if(/^(?:gpt-|codex|o[1-9])/.test(state.model||''))return 'codex';return providerId;}
  function assignSessionProvider(state){if(!state.provider){state.provider=state.thread||state.messages.length?sessionProvider(state):aiDefaults.provider;if(!state.model)state.model=aiDefaults.models[state.provider]||'';if(!state.started&&!state.messages.length&&!state.effort&&state.provider==='codex')state.effort=aiDefaults.effort;}}

  win.setMenuBarVisibility(false);
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-frame-navigate', event => {
    // Only the UI-owned, script-disabled srcdoc preview may load in a child frame.
    const preview = !event.isMainFrame && (event.url === 'about:srcdoc' || event.url === artifact?.url)
      && event.frame?.parent === win.webContents.mainFrame;
    if (!preview) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('did-frame-finish-load', (_event, isMainFrame) => {
    if(!isMainFrame&&artifact&&win.webContents.mainFrame.frames.some(frame=>frame.url===artifact.url)){
      previewSeenURL=artifact.url;
      win.webContents.send('preview:viewed', { url: artifact.url });
    }
    if (!isMainFrame && proposals.pending && win.webContents.mainFrame.frames.some(frame => frame.url === proposals.pending.artifact.url)) proposals.markViewed(proposals.pending.artifact.url);
  });
  const applyNativeIcon = () => {
    const mode = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    const icon = nativeImage.createFromPath(path.join(__dirname, `assets/brand/${mode}/${process.platform === 'darwin' ? 'macos-icon' : 'icon'}-256.png`));
    if (icon.isEmpty()) throw new Error('App icon could not be loaded');
    if (process.platform === 'darwin') app.dock.setIcon(icon);
    else win.setIcon(icon);
    if (process.platform !== 'darwin') win.setTitleBarOverlay({color:mode === 'dark' ? '#191919' : '#ffffff',symbolColor:mode === 'dark' ? '#ededed' : '#202020',height:56});
    win.setBackgroundColor(mode === 'dark' ? '#191919' : '#ffffff');
  };
  applyNativeIcon();
  nativeTheme.on('updated', applyNativeIcon);
  function assertSender(event) {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame
      || event.senderFrame.url !== APP_URL) throw new Error('Request rejected');
  }
  const accountAction = action => async event => {
    assertSender(event);
    if (accountSwitching) return {ok:false,message:'正在更換帳號，請稍候。'};
    const requestedProvider=providerId,capabilities=bundle.capabilities||null;
    try { if(requestedProvider==='gemini')throw Object.assign(Error('PROVIDER_UNAVAILABLE'),{code:'PROVIDER_UNAVAILABLE'});return { ok: true, account: {...await action(),provider:requestedProvider,capabilities} }; }
    catch (error) {
      const messages = {
        ENOENT: '尚未找到所選 AI 工具。請到「工具與更新」完成安裝。',
        CLI_MISSING:'尚未找到所選 AI 工具，請到「工具與更新」完成安裝。',PROVIDER_UNAVAILABLE:'Gemini 連線暫停；既有對話仍保留，請改用 Codex 或 Claude。',EXTERNAL_PROVIDER_POLICY:'這個工具的公司管理原則與 App 隔離設定不相容，原設定保持不變。Claude 目前支援 Pro／Max 帳號。',UNSUPPORTED_PROVIDER_VERSION:'舊版 Gemini CLI 接法無法驗證目前工具的安全限制；不會只因版本號而忽略限制。',SUBSCRIPTION_LOGIN_REQUIRED:'請使用這個服務的官方帳號登入；App 不會自動改用付費 API。',PROVIDER_AUTH_INVALID:'登入資料需要重新核對，請使用更多選單重新登入。',
        'login-already-pending': '登入正在進行，請完成瀏覽器授權，或先取消再重試。',
        'unexpected-login-url': '登入網址不符合預期，已停止連接。',
        'logout-not-confirmed': '尚未確認舊帳號已登出，請重新確認狀態後再試。',
      };
      return { ok: false, code:error.code==='ENOENT'?'CLI_MISSING':error.code||error.message, message: messages[error.code] || messages[error.message] || 'AI 連接未完成，已保存的登入仍保留。請重新檢查或到「工具與更新」查看狀態。' };
    }
  };
  handle('codex:connect', accountAction(() => account.connect()));
  handle('codex:refresh', accountAction(async () => { await account.connect(); return account.refresh(); }));
  handle('codex:login', accountAction(async () => {
    const result = await account.login();
    pendingLoginURL=result.authUrl || null;if(pendingLoginURL)providerLoginURLs.set(providerId,pendingLoginURL);
    if (pendingLoginURL) await openLoginURL(pendingLoginURL);
    return account.account;
  }));
  handle('codex:cancel-login', accountAction(() => account.cancelLogin()));
  handle('codex:switch-account', async event => {
    assertSender(event);
    if (accountSwitching) return {ok:false,message:'正在更換帳號，請稍候。'};
    if (versionBusy || generating || editor.active || proposals.saving || proposals.pending || materialization) return {ok:false,message:'請先停止 AI 工作，並確認或放棄目前的提案，再更換帳號。'};
    accountSwitching=true; pendingLoginURL=null;
    try {
      const result=await account.switchAccount();
      pendingLoginURL=result.authUrl || null;if(pendingLoginURL)providerLoginURLs.set(providerId,pendingLoginURL);
      accountSwitching=false;
      if (pendingLoginURL) await openLoginURL(pendingLoginURL);
      return {ok:true,account:{...account.account,provider:providerId,capabilities:bundle.capabilities||null}};
    } catch { return {ok:false,message:'更換帳號未完成，請先重新確認登入狀態後再試。'}; }
    finally { accountSwitching=false; }
  });
  handle('codex:copy-login-link', event => {
    assertSender(event);
    if (!pendingLoginURL || account.account?.state !== 'waiting-login') return {ok:false,message:'登入連結已失效，請重新開始登入。'};
    copyLoginURL(pendingLoginURL);
    return {ok:true};
  });
  handle('codex:models', async event => {
    assertSender(event);
    if (accountSwitching) return {ok:true,models:[]};
    try { return { ok: true, models: await account.models() }; }
    catch { return { ok: false, models: [] }; }
  });
  function sessionStarted(state){return state.started===true||Boolean(state.thread)||Boolean(state.run)||state.messages.some(m=>m.role==='user');}
  function displayConversation(state) {
    return {provider:sessionProvider(state),started:sessionStarted(state),conversationId:state.conversationId||null,conversationTitle:state.conversationTitle||'旅程討論',messages:state.messages,draft:state.draft,model:state.model,dayId:state.dayId,effort:state.effort||'',job:state.job||null,plan:state.plan?{...state.plan,digest:createHash('sha256').update(state.plan.markdown).digest('hex')}:null,research:state.research||null,handoff:state.handoff||null,
      needsRestart:['pending','unknown'].includes(state.run?.status)||(state.run?.status==='stopped'&&state.run.stopConfirmed!==true),stopped:state.run?.status==='stopped'&&state.run.stopConfirmed===true,
      stopRequested:state.run?.stopRequested===true,legacyStopped:state.run?.status==='stopped'&&state.run.stopRequested!==true,
      proposalLost:state.pendingProposal && !proposals.pending};
  }
  const accountKey = () => {
    if (!account.account?.label) throw Object.assign(Error('ACCOUNT_IDENTITY_UNKNOWN'),{code:'ACCOUNT_IDENTITY_UNKNOWN'});
    return createHash('sha256').update(JSON.stringify(providerId==='codex'?[account.account.label,account.account.plan || '']:[providerId,account.account.label,account.account.plan||''])).digest('hex');
  };
  const workflowFailure = error => {
    const messages = {
      SESSION_PROVIDER_LOCKED:'這段對話的 AI 服務已固定，請回到原服務或使用其他 AI 開新對話。',
      PROVIDER_UNAVAILABLE:'Gemini 連線暫停；既有對話仍保留，請改用 Codex 或 Claude 開新對話。',
      JOB_WAITING:'已有工作正在等待額度，請先取消等待再送出新要求。',
      PLAN_CONFIRMATION_REQUIRED:'請先確認逐日草案，再開始研究或建立正式資料。',
      RESEARCH_CONFIRMATION_REQUIRED:'請先完成來源查核並確認查核摘要。',
      INVALID_MATERIALIZATION:'完整候選資料尚不齊全，請讓 AI 補齊 schema 要求的資料後再試，原草稿仍保留。',
      INVALID_TRIP:'候選資料未通過完整驗證，請要求 AI 核對日期、座標、交通與必填欄位；原資料未修改。',
      MODEL_NO_IMAGES:'目前模型不支援圖片，請改選支援圖片的模型或取消圖片附件。',PRIVATE_DATA_IN_TRIP:'候選內容含有訂房確認碼或私人網站網址，不能寫進會公開的行程檔，已擋下。請再請 AI 修改一次。',
      EFFORT_UNAVAILABLE:'這個模型不支援選取的思考強度，請重新選擇。',
      QUOTA_EXHAUSTED:'這輪因一般額度不足而停止，可以選擇等待恢復後繼續。',
      VERSION_STORE_INVALID:'版本紀錄無法安全讀寫，原紀錄已保留，請檢查本機儲存空間。',
      VERSION_LIMIT:'本機版本紀錄已達容量上限，本次未保存；請先整理或匯出紀錄。',
      VERSION_CONFLICT:'版本紀錄與目前內容不同，請重新載入日程。',
      VERSION_RECONCILIATION_REQUIRED:'上次保存結果與目前檔案不一致，請先核對，未自動覆寫。',
      VERSION_CONTEXT_CHANGED:'照片、設定或其他日程資料已變動，這個版本目前不能直接套用。',
      EMPTY_SELECTION:'請至少選擇一項要保存的修改。',
      INVALID_SELECTION:'修改選取已失效，請重新開啟提案。',
      STALE_CONVERSATION:'對話已切換，舊草稿沒有覆蓋新對話。',
      REFERENCE_CONTEXT_TOO_LARGE:'選取的參考資料超過單次處理大小，請減少附件或拆成較短的文字再送出。',
      CONVERSATION_STORE_INVALID:'對話紀錄未能安全讀寫，已停止送出。原紀錄保留，請先排除本機儲存問題。',
      CONVERSATION_INTERRUPTED:'上一輪結果尚未確認，沒有自動重送。請先找回上次回覆，或重新開始（保留紀錄）。',
      ACCOUNT_CHANGED:'這段 AI 對話屬於先前的帳號。請選「重新開始（保留紀錄）」。',
      ACCOUNT_IDENTITY_UNKNOWN:'無法確認目前帳號身分，請重新檢查登入。',
      CONTINUATION_UNAVAILABLE:'原 AI 對話目前無法安全續接，沒有重送。請選「重新開始（保留紀錄）」。',
      LOGIN_REQUIRED:'請先到設定連接 ChatGPT。', QUOTA_UNAVAILABLE:'目前無法確認一般額度可用，這次未送出模型請求。',
      POLICY_MISMATCH:'Codex 的執行設定與工作台要求不符，已停止送出。', AI_BUSY:'已有一個 AI 工作正在執行。',
      AI_CANCELED:'這輪未完成，狀態需要確認。', AI_RESULT_UNKNOWN:'回覆結果未能確認，沒有重送，也沒有保存到原專案。',
      UNKNOWN_RESULT:'送出結果未能確認，沒有自動重送。', AI_TURN_FAILED:'Codex 未完成這次回覆，原專案未修改。',
      CONTENT_CHANGED:'原始行程已有新修改，這份提案已失效，請重新產生。', PRIVATE_REPO_REQUIRED:'無法確認你的 GitHub 專案是私人的（可能是網路不通或 GitHub 沒登入），這次修改沒有保存。確認連線後再說一次即可。',
      PREVIEW_REQUIRED:'請先開啟這份提案的預覽，再確認保存。', RESEARCH_REQUIRED:'停留或交通有變動，需要先完成來源與可行性查核。',
      STALE_PROPOSAL:'這份提案已失效，請重新產生。', INVALID_CANDIDATE:'AI 提案未通過完整資料驗證，原專案未修改。',
      UNSUPPORTED_DAY_CHANGE:'提案修改了本輪不支援的欄位，原專案未修改。', MODEL_UNAVAILABLE:'目前沒有可用模型，請重新確認帳號連接。',
    };
    return { ok:false, code:error.code || error.message, message:messages[error.code] || messages[error.message] || '這次操作未完成，原始行程未被本次操作修改。' };
  };
  async function planningFor(target){
    try{const d=await newTrips.readDraft(target.root,target.slug);return d.status==='planning'?d:null;}catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
  async function aiBaseline(target,conversation){
    const planning=await planningFor(target);
    if(!planning)return {baseline:await buildPreview(target.root,target.slug),planning:null};
    const digest=createHash('sha256').update(JSON.stringify([planning,conversation.plan?.markdown||''])).digest('hex');
    return {planning,baseline:{digest,snapshot:{dataSource:'module.exports={DAYS:[],PLACES:{}};',trip:{PLACES:{},DAYS:[]},contextDigest:digest},summary:{days:0,places:0,photos:0,dayOptions:[]}}};
  }
  async function referenceInputs(target,ids){
    if(!Array.isArray(ids)||ids.length>12)throw Error('INVALID_INPUT');
    const refs=await Promise.all(ids.map(async id=>{const item=await attachments.read({...target,accountKey:accountKey()},id);return {...item,kind:item.kind==='reference'?'url':item.kind,localPath:item.imagePath};}));
    if(refs.reduce((n,r)=>n+(r.text?.length||0),0)>120000||refs.filter(r=>r.kind==='image').length>6||refs.filter(r=>r.kind==='image').reduce((n,r)=>n+r.size,0)>24*1024*1024)throw Object.assign(Error('REFERENCE_CONTEXT_TOO_LARGE'),{code:'REFERENCE_CONTEXT_TOO_LARGE'});return refs;
  }
  const sameTarget=(a,b)=>Boolean(a&&b&&a.root===b.root&&a.slug===b.slug&&a.projectId===b.projectId);
  function researchBinding(target,baseline,proposal){return createHash('sha256').update(JSON.stringify([target.root,target.slug,baseline.digest,proposal?.contextDigest||null,proposal?createHash('sha256').update(proposal.source).digest('hex'):null])).digest('hex');}
  // Private codes (from docs/private-notes.md) and connected private sites must never reach public trip files.
  async function assertNoPrivateData(target,texts){const markers=await privateMarkers(path.join(target.root,'trips',target.slug),researchKit.sources.list().map(s=>s.host));const reason=findPrivateData(texts,markers);if(reason)throw Object.assign(Error('PRIVATE_DATA_IN_TRIP'),{code:'PRIVATE_DATA_IN_TRIP',reason});}
  // AI 的修改直接寫進本機檔案（git 工作區），每次自動記一個版本，改錯可以回到前一版。
  // 保存前的私有檢查、私人資料檢查與「內容沒被別人改過」的核對仍照舊；需要查核的變更改成提醒，不擋保存。
  // 要不要附「開始查核」由 AI 判斷（needsResearch）：照使用者給的資訊改不用查，新事實才要。
  async function applyPendingNow(target,{needsResearch=false}={}){
    const pending=proposals.pending;const research=needsResearch&&pending.kind!=='restore',required=pending.requiresResearch;
    const labels=pending.changes.filter(c=>pending.selectedKeys.includes(c.key)).map(c=>c.label).slice(0,30);
    pending.seen=true;pending.requiresResearch=false;
    try{await assertPendingClean(target);const result=await proposals.apply(pending.id,target);
      artifact=null;previewAttempt++;
      const history=await versions.read(target).catch(()=>null);const index=history&&result.version?history.revisions.findIndex(r=>r.id===result.version.id):-1;const previous=index>0?history.revisions[index-1]:null;
      return {versionId:result.version?.id||null,number:result.version?.number||null,previousId:previous?.id||null,previousNumber:previous?.number||null,labels,research};
    }catch(error){if(proposals.pending===pending){pending.seen=false;pending.requiresResearch=required;}throw error;}
  }
  async function assertPendingClean(target){if(!proposals.pending)return;try{await assertNoPrivateData(target,[proposals.pending.fullSource||proposals.pending.source||'']);}catch(error){proposals.discard();throw error;}}
  async function checkResearch(answer,sourceHash,proposalId,checkCanceled=()=>{}){
    const sources=[];const unresolved=[...answer.unresolved];let renders=0;
    for(const source of answer.sources){
      checkCanceled();
      try{const normalize=s=>String(s).replace(/\s+/g,'');const quote=normalize(source.evidence);
        // Text the App's research browser rendered while the agent read the page beats a fresh plain fetch.
        const seen=researchKit.findPage(source.url);let checked=seen&&normalize(seen.text).includes(quote)?seen:null;
        if(!checked){try{checked=await fetchReference(source.url);}catch(error){if(!seen)throw error;checked=seen;}}checkCanceled();
        if(quote.length>=15&&!normalize(checked.text).includes(quote)&&!researchKit.sources.allows(source.url)&&renders++<8){try{const rendered=await researchKit.publicBrowser.open(source.url);if(normalize(rendered.text).includes(quote))checked=rendered;}catch{}}checkCanceled();
        const verified=quote.length>=15&&normalize(checked.text).includes(quote);
        sources.push({...source,url:checked.url,checkedAt:checked.checkedAt,verified});if(!verified)unresolved.push(`來源短摘未能核對：${source.title}`);
      }catch(error){if(error.code==='AI_CANCELED')throw error;sources.push({...source,checkedAt:new Date().toISOString(),verified:false});unresolved.push(`來源未能取得：${source.title}`);}
    }
    if(!sources.length)unresolved.push('尚未取得可核對來源。');
    return {summary:answer.summary,sources,unresolved:[...new Set(unresolved)],feasibility:answer.feasibility,privateNotes:answer.privateNotes||'',sourceHash,proposalId:proposalId||null,confirmed:false};
  }
  async function runAI(input,target,{automatic=false}={}){
    if(providerId==='gemini')return workflowFailure({code:'PROVIDER_UNAVAILABLE'});
    if(accountSwitching||versionBusy||generating||editor.active||proposals.saving||materialization)return workflowFailure({code:'AI_BUSY'});
    generating=true;activeGenerationTarget=target;const nonce=++generationNonce;const checkCanceled=()=>{if(nonce!==generationNonce||win.isDestroyed())throw Object.assign(Error('AI_CANCELED'),{code:'AI_CANCELED'});};let requestSaved=false,candidateCreated=false,applied=null,editorStarted=false,job,completedAnswer=null;
    try{
      const requestedMode=input.mode|| (input.dayId===null?'discussion':input.dayId===-1?'edit-all':'edit-day');
      if(proposals.pending&&(!sameTarget(proposals.pending.target,target)||requestedMode!=='research'))throw Object.assign(Error('STALE_PROPOSAL'),{code:'STALE_PROPOSAL'});
      if(typeof input.text!=='string'||!input.text.trim()||input.text.length>12000)throw Error('INVALID_INPUT');
      await account.connect();const binding=accountKey();let conversation=await conversations.read(target);
      if(conversation.provider&&conversation.provider!==providerId)throw Object.assign(Error('SESSION_PROVIDER_LOCKED'),{code:'SESSION_PROVIDER_LOCKED'});
      if(['pending','unknown'].includes(conversation.run?.status)||(conversation.run?.status==='stopped'&&conversation.run.stopConfirmed!==true))throw Object.assign(Error('CONVERSATION_INTERRUPTED'),{code:'CONVERSATION_INTERRUPTED'});
      if(conversation.thread&&conversation.thread.accountKey!==binding)throw Object.assign(Error('ACCOUNT_CHANGED'),{code:'ACCOUNT_CHANGED'});
      const {baseline,planning}=await aiBaseline(target,conversation);
      const mode=planning&&['discussion','edit-day','edit-all'].includes(requestedMode)?'planning':requestedMode;
      if(planning&&['research','materialize'].includes(mode)&&(!conversation.plan?.markdown||conversation.plan.approvedDigest!==createHash('sha256').update(conversation.plan.markdown).digest('hex')))throw Object.assign(Error('PLAN_CONFIRMATION_REQUIRED'),{code:'PLAN_CONFIRMATION_REQUIRED'});
      if(mode==='materialize'&&(!planning||!conversation.research?.confirmed||conversation.research.sourceHash!==researchBinding(target,baseline,null)))throw Object.assign(Error('RESEARCH_CONFIRMATION_REQUIRED'),{code:'RESEARCH_CONFIRMATION_REQUIRED'});
      if(!planning){await versions.observe(target,{source:baseline.snapshot.dataSource,contextDigest:baseline.snapshot.contextDigest});if((await versions.read(target)).draft&&!proposals.pending)throw Object.assign(Error('STALE_PROPOSAL'),{code:'STALE_PROPOSAL'});}
      const refs=await referenceInputs(target,input.attachmentIds||[]);
      checkCanceled();
      const jobInput={text:input.text,dayId:input.dayId??null,model:input.model||'',effort:input.effort||'',mode,attachmentIds:input.attachmentIds||[],autoAttempts:automatic?(input.autoAttempts||0)+1:0,...(mode==='research'?{researchSourceHash:researchBinding(target,baseline,proposals.pending)}:{})};
      job=await jobs.begin(target,{input:jobInput,accountKey:binding,baselineDigest:baseline.digest});activeGenerationRunId=job.id;autoTarget=target;
      await conversations.update(target,state=>{state.started=true;if(!automatic)state.messages.push({role:'user',text:input.text,...(refs.length?{attachments:refs.map((r,i)=>({id:String(input.attachmentIds[i]),name:String(r.name||'附件').slice(0,200),kind:r.kind==='image'?'image':'file'}))}:{})});state.draft='';state.model=input.model||'';state.effort=input.effort||'';state.dayId=input.dayId??null;state.run={id:job.id,status:'pending'};});requestSaved=true;
      const sourceSnapshot=mode==='research'&&proposals.pending?proposals.pending.artifact.snapshot:baseline.snapshot;
      const boundSource=researchBinding(target,baseline,mode==='research'?proposals.pending:null);
      let planningContext=planning?{...planning,slug:target.slug,planMarkdown:conversation.plan?.markdown,research:conversation.research}:null;
      if(mode==='materialize'){
        const docs=await Promise.all(['trip-config','data','details','dining','map-lists','photos'].map(async name=>[name,(await fs.readFile(path.resolve(__dirname,'../../docs/schema',name+'.md'),'utf8')).slice(0,25000)]));
        planningContext={...planningContext,schema:Object.fromEntries(docs),requiredDeployName:target.slug};
      }
      checkCanceled();
      const researchTools=['research','materialize'].includes(mode)?await researchKit.endpoint().catch(()=>null):null;
      editorStarted=true;
      const answer=await editor.generate({researchTools,snapshot:sourceSnapshot,dayId:input.dayId??null,text:input.text,model:input.model,effort:input.effort||undefined,mode,attachments:refs,planningDraft:planningContext,handoff:conversation.handoff,history:conversation.thread?conversation.messages:[],requestId:job.id,thread:conversation.thread,lastOutcome:conversation.lastOutcome,
        onThread:async id=>{await conversations.update(target,s=>{s.thread={id,accountKey:binding,lastTurnId:conversation.thread?.lastTurnId||null};});await jobs.checkpoint(target,job.id,id);},
        onTurn:(threadId,turnId)=>jobs.checkpoint(target,job.id,threadId,turnId),
        onProgress:message=>{if(!win.isDestroyed())win.webContents.send('ai:progress',{projectId:target.projectId,slug:target.slug,message});},
        onDelta:progress=>{if(!win.isDestroyed())win.webContents.send('ai:progress',{projectId:target.projectId,slug:target.slug,...progress});}
      });
      completedAnswer=answer;checkCanceled();
      let proposal={changed:false,summary:answer.summary},research=null;
      if(answer.research)research=await checkResearch(answer,boundSource,proposals.pending?.id,checkCanceled);
      else if(answer.materialize){
        await assertNoPrivateData(target,Object.values(answer.files));const preparation=await newTrips.prepareMaterialization(target.root,target.slug,{files:answer.files});
        let candidate;try{candidate=await buildPreview(preparation.root,preparation.slug);checkCanceled();}catch(e){await newTrips.discardMaterialization(preparation.token);throw e;}materialization={...preparation,target,artifact:candidate,planDigest:conversation.plan.approvedDigest,seen:false};artifact=candidate;previewSeenURL=null;previewAttempt++;
        proposal={changed:false,summary:answer.summary,materialization:true,previewUrl:candidate.url,previewSummary:candidate.summary};
      }else if(!answer.discussion&&!answer.planning){proposal=proposals.create(target,baseline,input.dayId,answer);
        if(proposal.changed){
          // 直接套用；寫入失敗（例如檔案剛被別的程式改過）才退回舊的提案確認流程。
          try{applied=await applyPendingNow(target,{needsResearch:answer.needsResearch===true});proposal={changed:false,applied:true,summary:answer.summary,...applied};}
          catch(e){if(!proposals.pending)throw e;if(e.code!=='CONTENT_CHANGED'){proposals.discard();throw e;}await assertPendingClean(target);candidateCreated=true;await versions.saveDraft(target,proposals.draft());artifact=proposals.pending.artifact;previewAttempt++;}
        }}
      checkCanceled();
      const updated=await conversations.update(target,s=>{applySuggestedTitle(s,answer);s.messages.push({role:'assistant',text:answer.summary+(answer.planning?'\n\n'+answer.planMarkdown:''),...(answer.appAction?{action:answer.appAction}:applied?.research?{action:'research'}:{}),...(applied?{applied}:{}),generation:{provider:providerId,model:answer.model||input.model||'',effort:input.effort||'',...(!input.effort&&answer.resolvedEffort?{resolvedEffort:answer.resolvedEffort}:{})}});s.run={id:job.id,status:'complete'};s.thread={id:answer.threadId,accountKey:binding,lastTurnId:answer.turnId};s.model=answer.model;s.pendingProposal=Boolean(proposals.pending);s.lastOutcome=proposals.pending?'提案尚未保存。':applied?`上一輪的修改已直接保存到本機檔案（V${applied.number||'?'}），尚未備份到 GitHub。`:'上一輪沒有修改原檔。';if(answer.planning)s.plan={markdown:answer.planMarkdown,approvedDigest:null};if(research)s.research=research;});
      await jobs.finish(target,job.id);return {ok:true,proposal,research,planning:Boolean(planning),model:answer.model,...(answer.suggestion?{suggestion:answer.suggestion}:{}),conversation:displayConversation({...updated,job:{...job,status:'completed',autoResume:false}})};
    }catch(e){
      if(candidateCreated){proposals.discard();artifact=null;previewAttempt++;await versions.saveDraft(target,null).catch(()=>{});}
      const failure={...workflowFailure(e),accepted:requestSaved};
      // 修改已經寫進檔案之後才失敗（例如對話紀錄寫不進去）：照實說已保存，並告訴人怎麼退回。
      if(applied){failure.applied=applied;failure.message=`修改已保存到本機（V${applied.number||'?'}），但這次對話紀錄沒有寫入。要退回可以從上方「版本紀錄」回到 V${applied.previousNumber||'前一版'}。`;}
      if(job){try{await jobs.fail(target,job.id,e.code,e.limits);if(automatic&&['QUOTA_UNAVAILABLE','QUOTA_EXHAUSTED'].includes(e.code)&&job.input.autoAttempts<3)await jobs.wait(target,true);}catch{}}
      if(requestSaved){try{const uncertain=!completedAnswer&&!['LOGIN_REQUIRED','QUOTA_UNAVAILABLE','QUOTA_EXHAUSTED','POLICY_MISMATCH','MODEL_UNAVAILABLE','INVALID_DAY','EFFORT_UNAVAILABLE'].includes(e.code);const updated=await conversations.update(target,s=>{
        const stopRequested=s.run?.id===job.id&&(s.run.stopRequested===true||explicitStopNonce===nonce);
        const stopConfirmed=stopRequested&&(e.stopConfirmed===true||!editorStarted||Boolean(completedAnswer));
        s.run={id:job.id,status:stopConfirmed?'stopped':uncertain?'unknown':'failed',...(stopRequested?{stopRequested:true,stopConfirmed}: {})};
        if(stopConfirmed){if(s.thread&&(e.turnId||completedAnswer?.turnId))s.thread.lastTurnId=e.turnId||completedAnswer.turnId;s.lastOutcome='上一輪已停止，回覆未套用到原行程。';if(s.job?.id===job.id)Object.assign(s.job,{status:'paused',autoResume:false,reason:'user-stopped'});}
        else if(stopRequested&&s.job?.id===job.id)Object.assign(s.job,{status:'unknown',autoResume:false,reason:'stop-unconfirmed'});
        else if(e.code==='AI_CANCELED'&&s.job?.id===job.id)Object.assign(s.job,{status:'unknown',autoResume:false,reason:'connection-interrupted'});
        if(e.code==='QUOTA_EXHAUSTED'&&e.turnId&&s.thread)s.thread.lastTurnId=e.turnId;if(completedAnswer&&s.thread)s.thread.lastTurnId=completedAnswer.turnId;
        s.messages.push({role:'assistant',text:stopConfirmed?'已停止這輪。可以在原對話送出新訊息，沒有自動重送。':failure.message});
      });failure.conversation=displayConversation(updated);}catch{failure.message+=' 對話結果未能保存，請檢查本機儲存。';}}
      return failure;
    }finally{generating=false;activeGenerationTarget=null;activeGenerationRunId=null;}
  }
  handle('ai:generate',(event,input)=>{assertSender(event);return runAI(input,selectedTarget(input));});
  handle('ai:stop', async event => {
    assertSender(event);
    if(generating)explicitStopNonce=generationNonce;
    generationNonce++;
    const target=activeGenerationTarget,runId=activeGenerationRunId,currentEditor=editor;
    let stopPromise;
    try{stopPromise=Promise.resolve(currentEditor.stop());}catch(error){stopPromise=Promise.reject(error);}
    stopPromise.catch(()=>{});
    let saveError=null;
    if(target&&runId)try{await conversations.update(target,s=>{if(s.run?.id===runId&&s.run.status==='pending'){
      s.run.stopRequested=true;
      if(s.job?.id===runId)Object.assign(s.job,{autoResume:false,claimId:null,reason:'user-stop-requested'});
    }});}catch(error){saveError=error;}
    try { const stopped=await stopPromise;return saveError?workflowFailure(saveError):{ok:true,...stopped}; } catch(error) { return workflowFailure(error); }
  });
  handle('proposal:discard',async event=>{
    assertSender(event);
    if(versionBusy||generating||proposals.saving)return workflowFailure({code:'AI_BUSY'});
    versionBusy=true;
    try{
      const target=proposals.pending?.target;
      if(target)await versions.saveDraft(target,null);
      if(target)await conversations.update(target,state=>{state.pendingProposal=false;state.lastOutcome='使用者已放棄上次提案，原檔未修改。';state.messages.push({role:'assistant',text:state.lastOutcome});});
      proposals.discard();artifact=null;previewAttempt++;return {ok:true};
    }catch(error){return workflowFailure(error);}finally{versionBusy=false;}
  });
  handle('proposal:status', event => {
    assertSender(event);
    return { id:proposals.pending?.id || null, seen:Boolean(proposals.pending?.seen) };
  });
  handle('proposal:apply', async (event,input) => {
    assertSender(event);
    if(versionBusy||generating||proposals.saving)return workflowFailure({code:'AI_BUSY'});
    versionBusy=true;
    try {
      const target=selectedTarget(input);
      await assertPendingClean(target);
      const result=await proposals.apply(input.proposalId,target);
      artifact=null; previewAttempt++;
      let conversationWarning=false;
      try { await conversations.update(target,state=>{state.pendingProposal=false;state.lastOutcome='使用者已確認並保存上次提案到本機。尚未異地備份或部署。';state.messages.push({role:'assistant',text:state.lastOutcome});}); }
      catch { conversationWarning=true; }
      const version=result.version?{id:result.version.id,number:result.version.number}:null;
      return {ok:true,...result,version,conversationWarning};
    } catch(error) { return workflowFailure(error); }
    finally{versionBusy=false;}
  });
  const extraChannels=[];
  const feature=(name,handler,{exclusive=false}={})=>{
    const channel='feature:'+name;extraChannels.push(channel);
    handle(channel,async(event,input={})=>{assertSender(event);if(exclusive&&(generating||versionBusy||proposals.saving))return workflowFailure({code:'AI_BUSY'});if(exclusive)versionBusy=true;
      try{return {ok:true,...await handler(input)};}catch(error){const failure=workflowFailure(error);return {...failure,message:featureMessage(error)};}finally{if(exclusive)versionBusy=false;}});
  };
  function featureMessage(error){
    const texts={RESET_LOGOUT_FAILED:'無法確認 AI 帳號已登出，資料沒有重置。請到 AI 設定重新核對登入狀態後再試。',SESSION_PROVIDER_LOCKED:'這段對話的 AI 服務已固定，請使用「使用其他 AI 開新對話」。',WAIT_UNSUPPORTED:'此 AI 服務目前不支援自動等待額度。請稍後自行重試，不會自動轉用其他付費方式。',TRIP_CHANGED:'旅程已變動，請重新核對移除內容。',TRASH_NOT_IGNORED:'此專案尚未忽略本機回收區，請先檢查 .gitignore，旅程未移除。',TRIP_EXISTS:'原位置已有同名旅程，無法覆蓋還原。',GIT_IDENTITY_REQUIRED:'Git 尚未設定提交者名稱與電子郵件。請使用下方「設定備份署名」後再重新核對備份；原檔未變。',PRIVATE_REPO_REQUIRED:'請先連接 GitHub，並確認這是你有權存取的私人專案。',INVALID_REPOSITORY:'請填寫正確的 GitHub 擁有者／專案名稱。',NESTED_PROJECT:'請選擇 Git 專案以外的存放位置。',DESTINATION_EXISTS:'目的地資料夾已存在，請選擇其他位置。',STALE_CONFIRMATION:'確認已過期，請重新核對。',CONVERSATION_LIMIT:'這趟旅程已達50段對話上限，舊紀錄完整保留。可先複製重要紀錄，暫時繼續使用既有對話。',NO_PROJECT:'請先從專案管理連接你的私人專案。',PRIVATE_PROJECT_REQUIRED:'建立旅程需要可確認的私人專案。',UNSUPPORTED_ATTACHMENT_TYPE:'目前支援文字、Markdown、JSON、PNG、JPEG 與 WebP；PDF/OCR 尚未支援。',ATTACHMENT_LIMIT:'附件數量已達上限，請先移除不需要的附件。',UNSAFE_REFERENCE_ADDRESS:'參考網址必須是公開網站，不能讀取本機或內部網路。',REFERENCE_TIMEOUT:'網站未在時間內回應，請稍後重試或附上文字。',REFERENCE_HTTP_ERROR:'未能讀取這個網站，請檢查網址或使用文字附件。',PLAN_CONFIRMATION_REQUIRED:'請先確認最新逐日草案。',RESEARCH_CONFIRMATION_REQUIRED:'請先完成查核並確認摘要。',RESEARCH_INCOMPLETE:'仍有未核對的來源或待確認事項，請補充來源並重新查核。',DRAFT_CHANGED:'草稿或候選資料已變動，請重新建立預覽。',PREVIEW_CONFIRMATION_REQUIRED:'請先查看這份候選預覽。',ADOPTION_REQUIRED:'網站已存在，請先查核並明確接管，避免覆蓋其他網站。',TRUSTED_HOOK_REQUIRED:'專案的備份保護尚未安裝，請先完成 Git hook 設定。',UNTRUSTED_HOOK:'專案含未知的 Git hook，請先核對，App 不會執行。',UNSAFE_GIT_CONFIG:'Git 設定包含未知的外部指令，請先核對。',STAGED_CHANGES:'已有其他暫存修改，請先處理再備份。',NO_WAITING_JOB:'目前沒有可自動等待的工作。',STALE_JOB:'工作已更新，請重新載入。',MISSING_TOOL:'所需工具尚未安裝，請查看工具與更新。',PRIVATE_DATA_IN_TRIP:'候選內容含有訂房確認碼或私人網站網址，不能寫進會公開的行程檔，已擋下。請再請 AI 修改一次。',UNSAFE_PRIVATE_NOTES:'這趟的 docs 資料夾狀態異常（可能是捷徑），私人筆記沒有寫入。',PRIVATE_SITE_NOT_CONNECTED:'這個網站尚未連接，請先在「資料來源」連接。',TOOL_CHECKSUM_MISMATCH:'下載的檔案和官方檢查碼不符，已停止安裝，電腦沒有被改動。請稍後重試。',TOOL_INSTALL_UNVERIFIED:'安裝跑完了，但 App 沒找到可用的工具。請按「重新檢查」，或稍後重試。',TOOL_DOWNLOAD_FAILED:'下載失敗，請確認網路連線後重試。',TOOL_DOWNLOAD_TIMEOUT:'下載太久沒有完成，請確認網路連線後重試。',TOOL_INSTALL_BUSY:'另一個工具正在安裝，請等它完成。',PRIVATE_SITE_INVALID:'網站資料不正確，請重新整理後再試。',UNSAFE_ATTACHMENT:'這個檔案無法加入：可能超過 8MB（文字 1MB），或檔名不正確。',INVALID_IMAGE:'無法辨識這張圖片，或尺寸超過 8192px；請換成 PNG、JPEG 或 WebP 截圖。',INVALID_TEXT:'文字檔不是 UTF-8 文字，請另存為純文字後再加入。'};
    if(/^PRIVATE_SITE_/.test(error.code||'')&&error.hint)return error.hint;
    if(typeof error.userMessage==='string')return error.userMessage;
    return texts[error.code]||workflowFailure(error).message;
  }
  async function refreshProject(slug){
    const checked=await inspectProject(currentProject.root);if(!checked.ok)throw Error('project-unreadable');currentProject={...checked,projectId:currentProject.projectId};if(slug){await store.select(currentProject.projectId,slug);activeSlug=slug;}artifact=null;previewSeenURL=null;previewAttempt++;return {project:currentProject,selectedSlug:slug};
  }
  const sessionFields=SESSION_FIELDS;
  function sessionPayload(state){return Object.fromEntries(sessionFields.filter(key=>state[key]!==undefined).map(key=>[key,structuredClone(state[key])]));}
  function ensureSessions(state){state.conversationId ||= randomUUID();state.conversationTitle ||= '旅程討論';state.archives ||= [];state.conversationOrder ||= [state.conversationId,...state.archives.map(c=>c.id)];}
  function stashSession(state,archived=false){ensureSessions(state);const payload=sessionPayload(state);if(archived&&payload.job){payload.job.autoResume=false;payload.job.claimId=null;if(payload.job.status!=='completed')payload.job.status='paused';payload.job.reason='conversation-archived';}state.archives.push({id:state.conversationId,title:state.conversationTitle,...(state.conversationTitleCustom===true?{titleCustom:true}:{}),archived,payload});if(state.archives.length>50)throw Error('CONVERSATION_LIMIT');}
  function freshSession(state,title){state.conversationId=randomUUID();state.conversationOrder.unshift(state.conversationId);state.conversationTitle=title;state.conversationTitleCustom=false;state.started=false;state.messages=[];state.draft='';state.thread=null;state.run=null;state.job=null;state.handoff=null;state.pendingProposal=false;state.lastOutcome='新的 AI 對話，以最新行程為準。';state.provider=aiDefaults.provider;state.model=aiDefaults.models[state.provider]||'';state.effort=state.provider==='codex'?aiDefaults.effort:'';}
  feature('conversations-list',async input=>{const state=await conversations.update(selectedTarget(input),ensureSessions);const items=[{id:state.conversationId,title:state.conversationTitle,archived:false,current:true},...state.archives.map(({id,title,archived})=>({id,title,archived,current:false}))];const byId=new Map(items.map(item=>[item.id,item]));return {currentId:state.conversationId,items:state.conversationOrder.map(id=>byId.get(id))};});
  feature('conversation-new',async input=>{if(proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});const target=selectedTarget(input);const state=await conversations.update(target,s=>{assignSessionProvider(s);stashSession(s);freshSession(s,'新的討論');});await activateProvider(state.provider);return {conversation:displayConversation(state)};},{exclusive:true});
  feature('conversation-switch',async input=>{if(proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});const target=selectedTarget(input);const state=await conversations.update(target,s=>{ensureSessions(s);if(s.conversationId===input.id)return;const index=s.archives.findIndex(c=>c.id===input.id);if(index<0)throw Error('CONVERSATION_NOT_FOUND');const chosen=s.archives.splice(index,1)[0];stashSession(s);for(const field of sessionFields)delete s[field];for(const field of sessionFields)if(Object.hasOwn(chosen.payload,field))s[field]=structuredClone(chosen.payload[field]);s.conversationId=chosen.id;s.conversationTitle=chosen.title;s.conversationTitleCustom=chosen.titleCustom===true;s.pendingProposal=false;s.lastOutcome='切換到既有對話；本轮仍以最新行程為準，過去提案不代表目前已保存。';});await activateProvider(sessionProvider(state));autoTarget=target;return {conversation:displayConversation(state)};},{exclusive:true});
  feature('conversation-copy',async input=>{const state=await conversations.read(selectedTarget(input));const messages=!input.id||state.conversationId===input.id?state.messages:state.archives?.find(c=>c.id===input.id)?.payload.messages;if(!messages)throw Error('CONVERSATION_NOT_FOUND');clipboard.writeText(messages.map(m=>`${m.role==='user'?'你':'Travel Planner'}：\n${m.text}`).join('\n\n'));return {copied:true};});
  feature('conversation-rename',async input=>{if(typeof input.title!=='string'||!input.title.trim()||input.title.length>80)throw Error('INVALID_INPUT');const state=await conversations.update(selectedTarget(input),s=>{ensureSessions(s);if(s.conversationId===input.id){s.conversationTitle=input.title.trim();s.conversationTitleCustom=true;}else{const c=s.archives.find(c=>c.id===input.id);if(!c)throw Error('CONVERSATION_NOT_FOUND');c.title=input.title.trim();c.titleCustom=true;}});return {conversation:displayConversation(state)};},{exclusive:true});
  feature('conversation-archive',async input=>{if(proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});const state=await conversations.update(selectedTarget(input),s=>{ensureSessions(s);if(s.conversationId===input.id){stashSession(s,true);freshSession(s,'新的討論');}else{const c=s.archives.find(c=>c.id===input.id);if(!c)throw Error('CONVERSATION_NOT_FOUND');c.archived=input.archived!==false;}});await activateProvider(sessionProvider(state));return {conversation:displayConversation(state)};},{exclusive:true});
  let pickedProjectParent=null;
  feature('project-setup-prepare',async input=>{
    if(proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});
    if(!['clone','create'].includes(input.kind))throw Error('INVALID_INPUT');
    const choice=await(pickProjectParent?pickProjectParent():dialog.showOpenDialog(win,{title:'選擇專案存放位置',properties:['openDirectory','createDirectory']}));
    if(choice.canceled||!choice.filePaths?.length)return {canceled:true};
    const preparation=await projectSetup[input.kind==='clone'?'prepareClone':'prepareCreate']({...input,parentDirectory:choice.filePaths[0]});
    return {preparation,kind:input.kind};
  },{exclusive:true});
  // 首次引導：預設放在「文件／Travel Planner」，使用者可改名稱或位置。
  const defaultProjectParent=async()=>{const dir=defaultProjectParentDirectory||path.join(app.getPath('documents'),'Travel Planner');await fs.mkdir(dir,{recursive:true});return dir;};
  feature('onboarding-project-plan',async()=>{if(!pickedProjectParent)pickedProjectParent=await defaultProjectParent();return {suggestion:await projectSetup.suggestCreate({parentDirectory:pickedProjectParent})};});
  feature('onboarding-project-location',async()=>{const choice=await(pickProjectParent?pickProjectParent():dialog.showOpenDialog(win,{title:'選擇專案存放位置',properties:['openDirectory','createDirectory']}));if(choice.canceled||!choice.filePaths?.length)return {canceled:true};pickedProjectParent=choice.filePaths[0];return {suggestion:await projectSetup.suggestCreate({parentDirectory:pickedProjectParent})};});
  feature('onboarding-project-prepare',async input=>{if(proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});if(!pickedProjectParent)pickedProjectParent=await defaultProjectParent();return {preparation:await projectSetup.prepareCreate({name:input.name,parentDirectory:pickedProjectParent}),kind:'create'};},{exclusive:true});
  // 已有 GitHub 私人專案：下載到預設位置（引導內使用，不跳到設定頁）。
  feature('onboarding-clone-prepare',async input=>{if(proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});if(!pickedProjectParent)pickedProjectParent=await defaultProjectParent();return {preparation:await projectSetup.prepareClone({repo:input.repo,parentDirectory:pickedProjectParent}),kind:'clone'};},{exclusive:true});
  feature('onboarding-state',async()=>({onboarding:(await store.read()).state.onboarding||{completed:false,cloudflareSkipped:false}}));
  feature('onboarding-save',async input=>{await store.setOnboarding({completed:input.completed===true,cloudflareSkipped:input.cloudflareSkipped===true});return {saved:true};});
  feature('project-setup-confirm',async input=>{
    if(proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});
    if(!['clone','create'].includes(input.kind))throw Error('INVALID_INPUT');
    const result=await projectSetup[input.kind==='clone'?'confirmClone':'confirmCreate'](input.token);
    if(!result.ready)return {result};
    const checked=await inspectProject(result.root);
    if(!checked.ok)return {result:{...result,ready:false,message:'專案已下載，但格式檢查未通過。資料保留在所選位置，尚未切換目前專案。'}};
    const projectId=randomUUID();await store.connect({id:projectId,root:checked.root});
    currentProject={...checked,projectId};activeSlug=null;autoTarget=null;restoreWarning=null;artifact=null;previewSeenURL=null;previewAttempt++;
    return {result,project:currentProject,selectedSlug:null};
  },{exclusive:true});
  feature('trip-delete-prepare',async input=>{if(proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});const target=selectedTarget(input);const preparation=await trash.prepare(target);pendingTripRemoval={token:preparation.token,projectId:currentProject.projectId,root:target.root};return {preparation};},{exclusive:true});
  // 在 App 裡更新私人專案的引擎（相當於 CLI 的 tp-update）。預演與確認分兩段，確認後才合併。
  const buildInfo=readBuildInfo(),projectUpdate=new ProjectUpdateService({appCommit:buildInfo.commit,engineVersion:buildInfo.engineVersion});
  // 同一專案被另一個 Travel Planner 開著時提醒；關閉 App 時釋放。
  let claimedRoot=null;
  const releaseClaim=async()=>{if(claimedRoot){const root=claimedRoot;claimedRoot=null;await releaseProject(root);}};
  shutdownHooks.add(releaseClaim);
  feature('project-open-check',async()=>{if(!currentProject){await releaseClaim();return {warning:null};}if(claimedRoot===currentProject.root)return {warning:null};await releaseClaim();claimedRoot=currentProject.root;return {warning:await claimProject(currentProject.root,{dataDir:app.getPath('userData'),kind:bundledApp()?'installed':'dev'})};});
  feature('project-update-status',async()=>{if(!currentProject)throw Error('PROJECT_REQUIRED');return {update:await projectUpdate.status(currentProject.root)};});
  feature('project-update-prepare',async()=>{if(!currentProject)throw Error('PROJECT_REQUIRED');if(generating||editor.active||proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});return {update:await projectUpdate.prepare(currentProject.root)};},{exclusive:true});
  feature('project-update-confirm',async input=>{if(!currentProject)throw Error('PROJECT_REQUIRED');if(generating||editor.active||proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});const result=await projectUpdate.confirm(input.token,{migrate:dir=>migrateWithAppScripts(dir)});return {result,...await refreshProject(activeSlug)};},{exclusive:true});
  feature('trip-delete-confirm',async input=>{if(proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});if(!pendingTripRemoval||pendingTripRemoval.token!==input.token||pendingTripRemoval.projectId!==currentProject?.projectId||pendingTripRemoval.root!==currentProject?.root)throw Error('PROJECT_CHANGED');pendingTripRemoval=null;const result=await trash.confirm(input.token);if(result.root!==currentProject?.root)throw Error('PROJECT_CHANGED');if(activeSlug===result.slug){await store.clearSelection();activeSlug=null;autoTarget=null;}return {result,...await refreshProject(activeSlug)};},{exclusive:true});
  feature('trip-trash-list',async()=>{if(!currentProject)throw Object.assign(Error('NO_PROJECT'),{code:'NO_PROJECT'});return {items:await trash.list({root:currentProject.root})};});
  feature('trip-restore',async input=>{if(!currentProject)throw Object.assign(Error('NO_PROJECT'),{code:'NO_PROJECT'});const result=await trash.restore({root:currentProject.root,id:input.id});return {result,...await refreshProject(activeSlug)};},{exclusive:true});
  feature('demo-visibility',async input=>{await store.setDemoHidden(input.hidden===true);return {hidden:input.hidden===true};});
  feature('provider-status',async()=>({provider:providerId,account:providerView(providerId),defaults:aiDefaults,capabilities:bundle.capabilities||null}));
  feature('provider-accounts',async()=>({accounts:['codex','claude'].map(id=>{getProvider(id);return providerView(id);}),defaults:aiDefaults}));
  // 重置只動 App 自己的資料夾：先登出 App 專屬的 Codex／Claude（清掉鑰匙圈），再標記、重新啟動後整個刪除。
  // 使用者的專案資料夾、GitHub 與 Cloudflare（和終端機共用）都不動。
  feature('reset-app-data',async input=>{
    if(input.confirmed!==true)throw Object.assign(Error('CONFIRMATION_REQUIRED'),{code:'CONFIRMATION_REQUIRED'});
    if(generating||editor.active||proposals.pending||materialization||providerAuthBusy.size)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});
    const loggedOut=[];
    for(const id of ['codex','claude']){
      const account=getProvider(id).account;
      try{await account.connect();if(account.refresh)await account.refresh();}catch{continue;}
      if(account.account?.state!=='connected')continue;
      try{await account.logout();loggedOut.push(id);}catch{throw Object.assign(Error('RESET_LOGOUT_FAILED'),{code:'RESET_LOGOUT_FAILED',provider:id});}
    }
    requestReset(app.getPath('userData'));
    setTimeout(()=>{app.relaunch();app.quit();},300);
    return {loggedOut};
  },{exclusive:true});
  feature('provider-account-action',async input=>{
    if(input.id==='gemini')throw Object.assign(Error('PROVIDER_UNAVAILABLE'),{code:'PROVIDER_UNAVAILABLE'});
    const item=getProvider(input.id),id=input.id;
    if(!['check','login','cancel','switch','copy-link'].includes(input.action))throw Error('INVALID_ACTION');
    if(input.action==='copy-link'){const url=providerLoginURLs.get(id)||(id===providerId?pendingLoginURL:null);if(!url||item.account.account.state!=='waiting-login')throw Error('LOGIN_LINK_EXPIRED');copyLoginURL(url);return {account:providerView(id),copied:true};}
    if(providerAuthBusy.has(id))throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});
    if(id===providerId&&input.action!=='check'&&(generating||versionBusy||editor.active||proposals.pending||materialization))throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});
    providerAuthBusy.add(id);
    try{
      let result;if(input.action==='check'){await item.account.connect();if(item.account.refresh)await item.account.refresh();}
      else if(input.action==='login')result=await item.account.login();
      else if(input.action==='cancel')await item.account.cancelLogin();
      else result=await item.account.switchAccount();
      if(result?.authUrl){providerLoginURLs.set(id,result.authUrl);if(id===providerId)pendingLoginURL=result.authUrl;await openLoginURL(result.authUrl);}
      return {account:providerView(id)};
    }catch(error){const code=error.code||error.message;const messages={CLI_MISSING:'尚未安裝，請到工具與更新設定。',ENOENT:'尚未安裝，請到工具與更新設定。',UNSUPPORTED_PROVIDER_VERSION:'舊版 Gemini CLI 接法無法驗證目前工具的安全限制。',EXTERNAL_PROVIDER_POLICY:'帳號或公司管理原則與這版隔離設定不相容。',SUBSCRIPTION_LOGIN_REQUIRED:'請以官方訂閱帳號登入。'};return {account:{...providerView(id),state:['CLI_MISSING','ENOENT'].includes(code)?'unavailable':'error',message:messages[code]||'連線未完成，請重新檢查或重試。'}};}
    finally{providerAuthBusy.delete(id);}
  });
  feature('provider-models',async input=>{if(input.id==='gemini')throw Object.assign(Error('PROVIDER_UNAVAILABLE'),{code:'PROVIDER_UNAVAILABLE'});return {models:await getProvider(input.id).account.models()};});
  feature('ai-defaults-set',async input=>{
    const operation=defaultsQueue.then(async()=>{
    if(input.provider==='gemini')throw Object.assign(Error('PROVIDER_UNAVAILABLE'),{code:'PROVIDER_UNAVAILABLE'});
    const item=getProvider(input.provider);const next={provider:input.provider,models:{...aiDefaults.models},effort:aiDefaults.effort};
    if(input.model!==undefined){if(typeof input.model!=='string'||input.model.length>200)throw Error('INVALID_MODEL');if(input.model&&!(await item.account.models()).some(model=>model.id===input.model))throw Object.assign(Error('MODEL_UNAVAILABLE'),{code:'MODEL_UNAVAILABLE'});next.models[input.provider]=input.model;}
    if(input.effort!==undefined){if(input.provider!=='codex'||typeof input.effort!=='string')throw Error('INVALID_INPUT');const models=await item.account.models(),model=models.find(m=>m.id===next.models.codex)||models.find(m=>m.isDefault)||models[0];const allowed=(model?.effort||[]).map(e=>typeof e==='string'?e:e.reasoningEffort);if(!allowed.includes(input.effort))throw Object.assign(Error('EFFORT_UNAVAILABLE'),{code:'EFFORT_UNAVAILABLE'});next.effort=input.effort;}
    await store.setAIDefaults(next);aiDefaults=next;return {defaults:aiDefaults};
    });defaultsQueue=operation.catch(()=>{});return operation;
  });
  feature('provider-select',async input=>{
    if(input.id==='gemini')throw Object.assign(Error('PROVIDER_UNAVAILABLE'),{code:'PROVIDER_UNAVAILABLE'});
    getProvider(input.id);if(proposals.pending||materialization||editor.active)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});
    if(providerId===input.id&&input.newConversation!==true)return {provider:providerId,account:providerView(providerId)};
    let conversation=null;if(currentProject&&activeSlug){const state=await conversations.update({root:currentProject.root,slug:activeSlug},s=>{
      assignSessionProvider(s);if(sessionStarted(s)&&input.newConversation!==true)throw Object.assign(Error('SESSION_PROVIDER_LOCKED'),{code:'SESSION_PROVIDER_LOCKED'});
      if(input.newConversation===true){stashSession(s);freshSession(s,'新的討論');}
      s.provider=input.id;s.model=aiDefaults.models[input.id]||'';s.effort=input.id==='codex'?aiDefaults.effort:'';
    });conversation=displayConversation(state);}
    await activateProvider(input.id);return {provider:providerId,account:providerView(providerId),conversation};
  },{exclusive:true});
  feature('trip-create',async input=>{if(!currentProject)throw Object.assign(Error('NO_PROJECT'),{code:'NO_PROJECT'});if(proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});const created=await newTrips.create(currentProject.root,input);return {...await refreshProject(created.slug),draft:created.draft};},{exclusive:true});
  feature('trip-draft',async input=>({draft:await planningFor(selectedTarget(input))}));
  feature('plan-confirm',async input=>{const target=selectedTarget(input);const state=await conversations.read(target);if(!state.plan?.markdown)throw Object.assign(Error('PLAN_CONFIRMATION_REQUIRED'),{code:'PLAN_CONFIRMATION_REQUIRED'});const digest=createHash('sha256').update(state.plan.markdown).digest('hex');if(input.digest!==digest)throw Object.assign(Error('DRAFT_CHANGED'),{code:'DRAFT_CHANGED'});const updated=await conversations.update(target,s=>{s.plan.approvedDigest=digest;s.research=null;s.messages.push({role:'assistant',text:'逐日草案已由你確認，接下來可以進行來源查核。'});});return {conversation:displayConversation(updated)};},{exclusive:true});
  function openPrivateLogin(url){
    researchKit.privateBrowser.configure();
    const secure={partition:'persist:tp-private',sandbox:true,contextIsolation:true,nodeIntegration:false};
    const login=new BrowserWindow({parent:win,width:1100,height:820,title:'登入後關閉這個視窗',autoHideMenuBar:true,webPreferences:secure});
    login.webContents.setWindowOpenHandler(()=>({action:'allow',overrideBrowserWindowOptions:{parent:login,autoHideMenuBar:true,webPreferences:secure}}));
    login.loadURL(url).catch(()=>{});
  }
  async function clearPrivateSite(host){
    const ses=session.fromPartition('persist:tp-private');
    for(const cookie of await ses.cookies.get({})){const domain=String(cookie.domain||'').replace(/^\./,'');if(domain===host||domain.endsWith('.'+host))await ses.cookies.remove(`https://${domain}${cookie.path||'/'}`,cookie.name).catch(()=>{});}
    await ses.clearStorageData({origin:'https://'+host}).catch(()=>{});
  }
  feature('private-sources',async()=>({items:await researchKit.ready()}));
  feature('private-source-add',async input=>{await researchKit.ready();const {host}=await researchKit.sources.add(input.url);openPrivateLogin('https://'+host);return {host,items:researchKit.sources.list()};});
  feature('private-source-login',async input=>{await researchKit.ready();if(!researchKit.sources.list().some(s=>s.host===input.host))throw Object.assign(Error('PRIVATE_SITE_NOT_CONNECTED'),{code:'PRIVATE_SITE_NOT_CONNECTED'});openPrivateLogin('https://'+input.host);return {};});
  feature('private-source-remove',async input=>{await researchKit.ready();if(typeof input.host!=='string')throw Object.assign(Error('PRIVATE_SITE_INVALID'),{code:'PRIVATE_SITE_INVALID'});await researchKit.sources.remove(input.host);await clearPrivateSite(input.host);return {items:researchKit.sources.list()};});
  feature('references-list',async input=>({items:await attachments.list({...selectedTarget(input),accountKey:accountKey()})}));
  feature('references-add',async input=>{const target=selectedTarget(input);const selected=await (pickReferences?pickReferences():dialog.showOpenDialog(win,{title:'加入參考資料',properties:['openFile','multiSelections'],filters:[{name:'文字與圖片',extensions:['txt','md','json','png','jpg','jpeg','webp']}]}));if(selected.canceled)return {canceled:true};const items=[];for(const file of selected.filePaths.slice(0,12))items.push(await attachments.add({...target,accountKey:accountKey()},file));return {items};},{exclusive:true});
  feature('references-add-bytes',async input=>{const target=selectedTarget(input);if(!(input.bytes instanceof Uint8Array))throw Object.assign(Error('UNSAFE_ATTACHMENT'),{code:'UNSAFE_ATTACHMENT'});return {item:await attachments.addBytes({...target,accountKey:accountKey()},{name:input.name,bytes:input.bytes})};},{exclusive:true});
  feature('references-url',async input=>({item:await attachments.fetchURL({...selectedTarget(input),accountKey:accountKey()},input.url,referenceOptions)}),{exclusive:true});
  feature('references-remove',async input=>({removed:await attachments.remove({...selectedTarget(input),accountKey:accountKey()},input.id)}),{exclusive:true});
  feature('research-confirm',async input=>{
    const target=selectedTarget(input),state=await conversations.read(target),report=state.research;const open=report?report.unresolved.length:0;
    // 至少一個核對過的來源；仍有待確認或未核對的項目時，要使用者明確勾選「我了解」。
    if(!report||!report.sources.some(s=>s.verified)||(open&&input.acknowledgeOpen!==true))throw Object.assign(Error('RESEARCH_INCOMPLETE'),{code:'RESEARCH_INCOMPLETE'});
    const {baseline}=await aiBaseline(target,state);if(proposals.pending&&!sameTarget(proposals.pending.target,target))throw Object.assign(Error('STALE_PROPOSAL'),{code:'STALE_PROPOSAL'});
    const bound=researchBinding(target,baseline,proposals.pending);
    if(bound!==report.sourceHash||report.proposalId!==(proposals.pending?.id||null))throw Object.assign(Error('CONTENT_CHANGED'),{code:'CONTENT_CHANGED'});
    const savedNotes=await appendPrivateNotes(path.join(target.root,'trips',target.slug),report.privateNotes);
    const updated=await conversations.update(target,s=>{s.research.confirmed=true;if(savedNotes)s.research.privateNotes='';s.messages.push({role:'assistant',text:'你已確認來源與可行性查核摘要'+(open?`（其中 ${open} 項仍待確認，出發前請再查）`:'')+'。內容仍需經預覽後確認保存。'+(savedNotes?'查核時讀到的訂單號等私人資訊已記到這趟的 docs/private-notes.md，不會進公開網站。':'')});});
    if(proposals.pending){proposals.pending.requiresResearch=false;proposals.pending.seen=false;previewSeenURL=null;}
    return {conversation:displayConversation(updated),proposal:proposals.view()};
  },{exclusive:true});
  feature('materialize-confirm',async input=>{
    const target=selectedTarget(input);if(!materialization||materialization.target.root!==target.root||materialization.target.slug!==target.slug)throw Error('STALE_PROPOSAL');
    const state=await conversations.read(target);const result=await newTrips.confirmMaterialization(materialization.token,{planConfirmed:state.plan?.approvedDigest===materialization.planDigest,previewConfirmed:previewSeenURL===materialization.artifact.url});materialization=null;
    await conversations.update(target,s=>{s.lastOutcome='已確認候選預覽，正式行程資料已保存到本機，尚未備份或發布。';s.messages.push({role:'assistant',text:s.lastOutcome});});
    return {...await refreshProject(result.slug)};
  },{exclusive:true});
  feature('materialize-discard',async()=>{if(materialization)await newTrips.discardMaterialization(materialization.token);materialization=null;artifact=null;previewAttempt++;return {discarded:true};},{exclusive:true});
  feature('job-status',async input=>{const target=selectedTarget(input);autoTarget=target;return {job:(await conversations.read(target)).job||null};});
  feature('job-wait',async input=>{if(providerId!=='codex')throw Object.assign(Error('WAIT_UNSUPPORTED'),{code:'WAIT_UNSUPPORTED'});return {job:await jobs.wait(selectedTarget(input),input.enabled===true)};},{exclusive:true});
  feature('job-pause',async input=>({job:await jobs.pause(selectedTarget(input))}),{exclusive:true});
  feature('job-recover',async input=>{
    const target=selectedTarget(input),state=await conversations.read(target),job=state.job;if(!job||!job.threadId||job.accountKey!==accountKey())throw Object.assign(Error('ACCOUNT_CHANGED'),{code:'ACCOUNT_CHANGED'});
    if(typeof editor.recover!=='function')throw Error('RECOVERY_UNAVAILABLE');
    const stopRequested=state.run?.id===job.id&&state.run.stopRequested===true;
    const legacyStopped=state.run?.id===job.id&&state.run.status==='stopped'&&state.run.stopRequested!==true;
    const result=await editor.recover({threadId:job.threadId,turnId:job.turnId,requestId:job.id,mode:job.input.mode,model:job.input.model,metadataOnly:stopRequested||legacyStopped});
    if(stopRequested||legacyStopped){
      if(!['completed','interrupted','failed'].includes(result.status))return {status:result.status,message:'停止狀態尚未確認，請稍後再試；沒有重送上次要求。'};
      const updated=await conversations.update(target,s=>{
        if(s.run?.id!==job.id||(stopRequested?s.run.stopRequested!==true:s.run.status!=='stopped'||s.run.stopRequested===true))throw Object.assign(Error('STALE_JOB'),{code:'STALE_JOB'});
        s.run=stopRequested?{id:job.id,status:'stopped',stopRequested:true,stopConfirmed:true}:{id:job.id,status:'failed'};
        if(s.thread)s.thread.lastTurnId=result.turnId;
        s.lastOutcome=stopRequested?'上一輪已停止，回覆未套用到原行程。':'上一輪已結束，回覆未套用到原行程。';
        if(s.job?.id===job.id)Object.assign(s.job,{status:'paused',autoResume:false,reason:stopRequested?'user-stopped':'terminal-confirmed'});
        s.messages.push({role:'assistant',text:stopRequested?'已確認上一輪停止。可以在原對話送出新訊息，沒有自動重送。':'已確認上一輪結束。可以在原對話送出新訊息，沒有自動重送。'});
      });
      return {status:stopRequested?'stopped':'failed',conversation:displayConversation(updated)};
    }
    if(result.status==='completed'){
      const {baseline,planning}=await aiBaseline(target,state);if(baseline.digest!==job.baselineDigest)throw Object.assign(Error('CONTENT_CHANGED'),{code:'CONTENT_CHANGED'});
      const answer=result.answer;let proposal={changed:false,summary:answer.summary},recoveredResearch=null;
      if(proposals.pending&&!sameTarget(proposals.pending.target,target))throw Object.assign(Error('STALE_PROPOSAL'),{code:'STALE_PROPOSAL'});
      if(answer.research){const bound=researchBinding(target,baseline,proposals.pending);if(bound!==job.input.researchSourceHash)throw Object.assign(Error('CONTENT_CHANGED'),{code:'CONTENT_CHANGED'});recoveredResearch=await checkResearch(answer,bound,proposals.pending?.id);}
      if(answer.materialize){if(!planning||!state.plan?.approvedDigest||!state.research?.confirmed)throw Object.assign(Error('PLAN_CONFIRMATION_REQUIRED'),{code:'PLAN_CONFIRMATION_REQUIRED'});await assertNoPrivateData(target,Object.values(answer.files));const prep=await newTrips.prepareMaterialization(target.root,target.slug,{files:answer.files});let candidate;try{candidate=await buildPreview(prep.root,prep.slug);}catch(e){await newTrips.discardMaterialization(prep.token);throw e;}materialization={...prep,target,artifact:candidate,planDigest:state.plan.approvedDigest};artifact=candidate;previewSeenURL=null;proposal={...proposal,materialization:true,previewUrl:candidate.url,previewSummary:candidate.summary};}
      if(answer.replacementDay||answer.replacementDays){proposal=proposals.create(target,baseline,job.input.dayId,answer);if(proposal.changed)await assertPendingClean(target);if(proposal.changed){await versions.saveDraft(target,proposals.draft());artifact=proposals.pending.artifact;previewAttempt++;}}
      const updated=await conversations.update(target,s=>{applySuggestedTitle(s,answer);s.run={id:job.id,status:'complete'};s.thread={id:answer.threadId,lastTurnId:answer.turnId,accountKey:job.accountKey};s.messages.push({role:'assistant',text:'已核對上次完成的回覆，沒有重送。\n\n'+answer.summary,generation:{provider:providerId,model:answer.model||job.input.model||'',effort:job.input.effort||''}});if(answer.planning)s.plan={markdown:answer.planMarkdown,approvedDigest:null};if(recoveredResearch)s.research=recoveredResearch;});await jobs.finish(target,job.id);return {status:'completed',proposal,research:recoveredResearch,conversation:displayConversation(await conversations.read(target))};
    }
    if(['interrupted','failed'].includes(result.status)){const updated=await conversations.update(target,s=>{s.run={id:job.id,status:'failed'};if(s.thread)s.thread.lastTurnId=result.turnId;s.messages.push({role:'assistant',text:'已確認上一輪停止。可以在原對話送出新的要求，沒有自動重送。'});});await jobs.patch(target,job.id,{status:'paused',autoResume:false,claimId:null,reason:'terminal-confirmed'});return {status:result.status,conversation:displayConversation(await conversations.read(target))};}
    return {status:result.status,message:'尚未確認完整結果，沒有重送。可稍後再次核對，或交接到新的 AI 對話。'};
  },{exclusive:true});
  feature('handoff',async input=>{
    const target=selectedTarget(input),state=await conversations.read(target);if(proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});
    const summary=typeof input.summary==='string'?input.summary.trim():'';if(!summary||summary.length>16000)throw Error('INVALID_INPUT');
    const updated=await conversations.update(target,s=>{s.thread=null;s.run=null;s.handoff=summary;s.job=null;s.messages.push({role:'assistant',text:'已開始新的 AI 對話，以下是你確認的交接摘要：\n\n'+summary});});return {conversation:displayConversation(updated)};
  },{exclusive:true});
  feature('archive-export',async input=>{const target=selectedTarget(input);const choice=await(saveArchivePath?saveArchivePath():dialog.showSaveDialog(win,{title:'匯出私人旅程備份',defaultPath:target.slug+'.travel-planner.json',filters:[{name:'Travel Planner 備份',extensions:['json']}]}));if(choice.canceled||!choice.filePath)return {canceled:true};return {archive:await archives.exportTrip(target,choice.filePath,{allowPlanning:Boolean(await planningFor(target))})};},{exclusive:true});
  feature('archive-import',async()=>{if(!currentProject)throw Object.assign(Error('NO_PROJECT'),{code:'NO_PROJECT'});if(proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});const choice=await(pickArchivePath?pickArchivePath():dialog.showOpenDialog(win,{title:'還原為另一趟旅程',properties:['openFile'],filters:[{name:'Travel Planner 備份',extensions:['json']}]}));if(choice.canceled||!choice.filePaths.length)return {canceled:true};const imported=await archives.importTrip(currentProject.root,choice.filePaths[0],{allowPlanning:true});return {...await refreshProject(imported.slug),imported};},{exclusive:true});
  feature('auth-status',async input=>({auth:await auth.status(input.provider)}));
  feature('auth-start',async input=>({auth:await auth.start(input.provider)}),{exclusive:true});
  feature('auth-cancel',async input=>({auth:await auth.cancel(input.provider)}),{exclusive:true});
  feature('cloudflare-accounts',async()=>({selection:await publisher.accounts()}));
  feature('cloudflare-account',async input=>publisher.setAccount(input.id||null),{exclusive:true});
  feature('git-identity-prepare',async()=>{if(!currentProject)throw Object.assign(Error('NO_PROJECT'),{code:'NO_PROJECT'});return {preparation:await projectSetup.prepareIdentity(currentProject.root)};},{exclusive:true});
  feature('git-identity-confirm',async input=>({result:await projectSetup.confirmIdentity(input.token)}),{exclusive:true});
  // scope all：所有旅程一起備份；否則只備份目前這趟。
  feature('backup-prepare',async input=>({preparation:await backup.prepare(input?.scope==='all'?(()=>{if(!currentProject)throw Error('PROJECT_REQUIRED');return {root:currentProject.root,slug:'*'};})():selectedTarget(input))}),{exclusive:true});
  // 「備份與發布」頁用：每趟的本機備份狀態、全部旅程的狀態，以及目前這趟的網站與預覽狀態。都不連網。
  feature('sync-overview',async input=>{if(!currentProject)return {overview:null};const root=currentProject.root,safe=async run=>{try{return await run();}catch{return null;}};
    const trips=await Promise.all(currentProject.trips.map(async t=>({slug:t.slug,title:t.title,dates:t.dates||null,backup:await safe(()=>backup.localStatus(root,t.slug))})));
    const slug=input?.slug&&currentProject.trips.some(t=>t.slug===input.slug)?input.slug:null;
    return {overview:{trips,all:await safe(()=>backup.localStatus(root,'*')),project:await safe(()=>backup.localStatus(root,null)),site:slug?await safe(()=>publisher.status({root,slug})):null,previewSeen:Boolean(slug&&slug===activeSlug&&artifact&&previewSeenURL===artifact.url)}};});
  feature('backup-confirm',async input=>({result:await backup.confirm(input.token)}),{exclusive:true});
  // 全部不要：這趟旅程回到上次備份。有未處理的提案時不做，避免兩邊互相覆蓋。
  feature('backup-discard-prepare',async input=>{if(proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});const target=selectedTarget(input);return {preparation:await backup.discardPrepare({root:target.root,slug:target.slug})};},{exclusive:true});
  feature('backup-discard-confirm',async input=>{if(proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});const result=await backup.discardConfirm(input.token);artifact=null;previewAttempt++;return {result};},{exclusive:true});
  // 專案層級備份：還沒有旅程、或只有引擎更新時，也能推送到私人 GitHub。
  feature('backup-project-prepare',async()=>{if(!currentProject)throw Error('PROJECT_REQUIRED');return {preparation:await backup.prepare({root:currentProject.root,slug:null})};},{exclusive:true});
  // 不連網的「尚未備份」提示用；失敗時回報未知，不阻擋其他操作。
  feature('backup-status',async input=>{if(!currentProject)return {status:null};const slug=input?.slug&&currentProject.trips.some(t=>t.slug===input.slug)?input.slug:null;try{return {status:await backup.localStatus(currentProject.root,slug)};}catch{return {status:null};}});
  // 發布前如果還有沒備份的修改，先自動 commit + push 到私人 GitHub（備份本身仍會重新確認目的地是私人專案）。
  const needsBackup=async target=>{try{const st=await backup.localStatus(target.root,target.slug);return st.neverBackedUp||st.pendingFiles>0||st.unpushedCommits>0?{pendingFiles:st.pendingFiles}:null;}catch{return null;}};
  feature('publish-prepare',async input=>{if(proposals.pending||materialization)throw Object.assign(Error('PREVIEW_REQUIRED'),{code:'PREVIEW_REQUIRED'});const target=selectedTarget(input);return {preparation:{...await publisher.prepare({...target,previewSeen:previewSeenURL===artifact?.url,previewDigest:artifact?.digest,previewOutputDigest:artifact?.outputDigest}),backupFirst:await needsBackup(target)}};},{exclusive:true});
  feature('publish-confirm',async input=>{if(proposals.pending||materialization)throw Object.assign(Error('PREVIEW_REQUIRED'),{code:'PREVIEW_REQUIRED'});
    let backedUp=null;
    if(input.slug){const target=selectedTarget(input);if(await needsBackup(target)){const prep=await backup.prepare({root:target.root,slug:target.slug});backedUp=await backup.confirm(prep.token);
      if(!backedUp.backedUp)throw Object.assign(Error('BACKUP_BEFORE_PUBLISH'),{code:'BACKUP_BEFORE_PUBLISH',userMessage:'發布前的備份沒有完成，網站沒有更新：'+backedUp.message});}}
    const result=await publisher.confirm(input.token,{previewSeen:previewSeenURL===artifact?.url,previewDigest:artifact?.digest,previewOutputDigest:artifact?.outputDigest});
    return {result:backedUp?{...result,message:'已先備份到你的私人 GitHub。'+(result.message||'')}:result};},{exclusive:true});
  feature('adoption-prepare',async input=>({preparation:await publisher.prepareAdoption(selectedTarget(input))}),{exclusive:true});
  feature('adoption-confirm',async input=>({result:await publisher.confirmAdoption(input.token)}),{exclusive:true});
  feature('environment',async()=>{await toolSupport.applyEnvironment();auth.env={...process.env};return environmentService?environmentService.inspectEnvironment():toolSupport.inspect();});
  feature('tool-prepare',async input=>({preparation:await toolSupport.prepare(input.id)}),{exclusive:true});
  feature('tool-install',async input=>{const result=await toolSupport.install(input.token,{confirmed:input.confirmed===true});await toolSupport.applyEnvironment();auth.env={...process.env};return {result};},{exclusive:true});
  feature('updates',async()=>({update:await updater.check()}));
  feature('updates-status',async()=>({update:updater.status()}));
  feature('updates-download',async()=>({update:await updater.download()}));
  feature('updates-install',async()=>{
    if(updateInstallScheduled||generating||editor.active||versionBusy||proposals.saving)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});
    if(updater.status().state!=='downloaded')throw Object.assign(Error('UPDATE_NOT_DOWNLOADED'),{code:'UPDATE_NOT_DOWNLOADED'});
    updateInstallScheduled=true;windowClosing=true;
    // Run only after this tracked IPC has resolved: shutdown() waits for tracked operations.
    setImmediate(async()=>{
      try{
        if(win.isDestroyed())throw Error('WINDOW_CLOSED');
        win.webContents.send('app:closing');
        if(!await win.webContents.executeJavaScript('flushConversationDraft()'))throw Error('DRAFT_SAVE_FAILED');
        updateShutdownStarted=true;await shutdown();nativeUpdateHandoff=true;
        await updater.install();
      }catch{restoreAfterUpdateFailure();if(!win.isDestroyed())win.webContents.send('feature:update-state',{...updater.status(),state:'error',error:'UPDATE_INSTALL_FAILED'});}
    });
    return {scheduled:true,update:{...updater.status(),state:'installing'}};
  });
  feature('open-link',async input=>{const url=new URL(input.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>4096)throw Error('INVALID_LINK');await shell.openExternal(url.href);return {opened:true};});
  const pollQuota=async()=>{
    if(windowClosing||shuttingDown||!autoTarget||polling||generating||versionBusy||accountSwitching||materialization||win.isDestroyed())return;
    const target={...autoTarget};const current=()=>!windowClosing&&!shuttingDown&&sameTarget(autoTarget,target)&&currentProject?.projectId===target.projectId&&currentProject.root===target.root&&activeSlug===target.slug&&!generating&&!versionBusy&&!accountSwitching&&!materialization&&!win.isDestroyed();
    if(!current())return;polling=true;
    try{
      const state=await conversations.read(target);if(!state.job?.autoResume||state.job.status!=='waiting_quota'||Date.now()<state.job.nextCheck)return;
      if(state.job.input.autoAttempts>=3){await jobs.patch(target,state.job.id,{autoResume:false,status:'paused',reason:'JOB_RETRY_LIMIT'});return;}
      if(proposals.pending&&(state.job.input.mode!=='research'||!sameTarget(proposals.pending.target,target)))return;
      await account.connect();const {baseline}=await aiBaseline(target,state);
      if(state.job.input.mode==='research'&&state.job.input.researchSourceHash!==researchBinding(target,baseline,proposals.pending)){await jobs.patch(target,state.job.id,{autoResume:false,status:'paused',reason:'CONTENT_CHANGED'});return;}
      let limits=null;try{limits=await account.transport.request('account/rateLimits/read',{});}catch{}
      if(!current())return;
      const job=await jobs.poll(target,{accountKey:accountKey(),baselineDigest:baseline.digest,limits,busy:!current()});
      if(job){
        if(!current()){await jobs.releaseClaim(target,job.id,job.claimId);return;}
        const claimed=await jobs.takeClaim(target,job.id,job.claimId);if(!claimed)return;
        if(!current()){await jobs.releaseClaim(target,job.id,job.claimId);return;}
        win.webContents.send('feature:job-result',{projectId:target.projectId,slug:target.slug,started:true});
        const result=await runAI(job.input,target,{automatic:true});if(!win.isDestroyed())win.webContents.send('feature:job-result',{projectId:target.projectId,slug:target.slug,result});
      }
    }catch{}finally{polling=false;}
  };
  let quotaTimer=setInterval(()=>tracked(pollQuota).catch(()=>{}),15000);quotaTimer.unref();
  handle('workspace:read', async event => {
    assertSender(event);
    const latest = await store.read();
    return { project: currentProject, selectedSlug: latest.state.project?.selectedSlug || null,
      theme: latest.state.theme,demoHidden:latest.state.demoHidden===true, provider:providerId, warning: restoreWarning };
  });
  function selectedTarget(input) {
    if (!currentProject || input?.projectId !== currentProject.projectId
      || !currentProject.trips.some(trip => trip.slug === input.slug)) throw Error('stale-project');
    return { root: currentProject.root, slug: input.slug, projectId: currentProject.projectId };
  }
  handle('conversation:read', async (event,input)=>{
    assertSender(event);
    try {const target=selectedTarget(input);autoTarget=target;const state=await conversations.update(target,s=>{ensureSessions(s);assignSessionProvider(s);});if(activeSlug===target.slug&&target.root===currentProject.root&&sessionProvider(state)!==providerId){if(generating||proposals.pending||materialization)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});await activateProvider(sessionProvider(state));}return {ok:true,conversation:displayConversation(state)};}
    catch(error){return workflowFailure(error);}
  });
  handle('conversation:preferences',async(event,input)=>{
    assertSender(event);
    try {
      const target=selectedTarget(input);
      if (generating || proposals.saving) return {ok:true};
      const state=await conversations.update(target,state=>{
        if(!input.conversationId||state.conversationId!==input.conversationId)throw Object.assign(Error('STALE_CONVERSATION'),{code:'STALE_CONVERSATION'});
        if(input.draft!==undefined)state.draft=input.draft;
        if(input.model!==undefined)state.model=input.model;
        if(input.effort!==undefined)state.effort=input.effort;
        if(input.dayId!==undefined)state.dayId=input.dayId;
      });return {ok:true,conversation:displayConversation(state)};
    }catch(error){return workflowFailure(error);}
  });
  handle('conversation:restart',async(event,input)=>{
    assertSender(event);
    try {
      if(versionBusy || generating || editor.active || proposals.saving || proposals.pending)throw Object.assign(Error('AI_BUSY'),{code:'AI_BUSY'});
      const state=await conversations.update(selectedTarget(input),state=>{
        state.thread=null;state.run=null;state.job=null;state.handoff=null;state.pendingProposal=false;state.lastOutcome='已開始新的 AI 對話，上方舊紀錄只供使用者查看，不會自動送出。';
        state.messages.push({role:'assistant',text:state.lastOutcome});
      });return {ok:true,conversation:displayConversation(state)};
    }catch(error){return workflowFailure(error);}
  });
  handle('workspace:select',async(event,input)=>{
    assertSender(event);const target=selectedTarget(input);
    if(versionBusy||generating||editor.active||proposals.saving)throw Error('workspace-busy');
    if(proposals.pending||materialization)throw Error('workspace-pending-proposal');
    versionBusy=true;
    try{proposals.discard();await store.select(target.projectId,target.slug);activeSlug=target.slug;previewAttempt++;artifact=null;return {ok:true};}
    finally{versionBusy=false;}
  });
  async function observeVersions(target,baseline){return versions.observe(target,{source:baseline.snapshot.dataSource,contextDigest:baseline.snapshot.contextDigest});}
  function proposalResult(baseline,proposal,version,warning){
    return {ok:true,url:proposal?.previewUrl||baseline.url,digest:baseline.digest,summary:baseline.summary,proposal,version:version?{id:version.id,number:version.number}:null,warning};
  }
  handle('preview:build', async (event,input)=>{
    assertSender(event);const target=selectedTarget(input);
    if(versionBusy||generating||proposals.saving)return workflowFailure({code:'AI_BUSY'});
    const attempt=++previewAttempt;versionBusy=true;
    try{
      const planning=await planningFor(target);
      if(planning)return {ok:true,planning:true,draft:planning,summary:{days:0,places:0,photos:0,dayOptions:[]}};
      const baseline=await buildPreview(target.root,target.slug);
      if(attempt!==previewAttempt||target.projectId!==currentProject?.projectId)return {ok:false,code:'preview-stale'};
      const revision=await observeVersions(target,baseline);
      let proposal=null,warning=null;
      const history=await versions.read(target),draft=history.draft;
      if(draft){
        const trustedRestore=draft.kind!=='restore'||history.revisions.some(r=>r.source===draft.proposedSource&&r.contextDigest===draft.contextDigest);
        if(draft.originalSource!==baseline.snapshot.dataSource||draft.baselineDigest!==baseline.digest||draft.contextDigest!==baseline.snapshot.contextDigest||!trustedRestore){
          await versions.saveDraft(target,null);proposals.discard();warning='原始資料已有變動，先前提案已失效；對話紀錄仍保留。';
        }else proposal=proposals.createSource(target,baseline,draft.proposedSource,{label:draft.label,kind:draft.kind,selectedKeys:draft.selectedKeys});
      }
      artifact=proposal?.changed?proposals.pending.artifact:baseline;
      return proposalResult(baseline,proposal,revision,warning);
    }catch(error){return workflowFailure(error);}finally{versionBusy=false;}
  });
  handle('versions:list',async(event,input)=>{
    assertSender(event);const target=selectedTarget(input);
    if(versionBusy||generating||proposals.saving)return workflowFailure({code:'AI_BUSY'});
    versionBusy=true;
    try{
      const baseline=await buildPreview(target.root,target.slug);const latest=await observeVersions(target,baseline);
      const history=await versions.read(target);
      return {ok:true,revisions:history.revisions.map(({id,number,createdAt,label,kind,contextDigest})=>({id,number,createdAt,label,kind,current:id===latest.id,compatible:contextDigest===baseline.snapshot.contextDigest})).reverse()};
    }catch(error){return workflowFailure(error);}finally{versionBusy=false;}
  });
  // 某一版相對於前一版改了什麼（聊天裡的「查看修改對照」）。
  handle('versions:changes',async(event,input)=>{
    assertSender(event);const target=selectedTarget(input);
    try{const history=await versions.read(target);const index=history.revisions.findIndex(r=>r.id===input.versionId);
      if(index<1)throw Object.assign(Error('STALE_PROPOSAL'),{code:'STALE_PROPOSAL'});
      const {changesBetween}=require('./proposal-diff.cjs');
      return {ok:true,number:history.revisions[index].number,previousNumber:history.revisions[index-1].number,changes:changesBetween(history.revisions[index-1].source,history.revisions[index].source)};
    }catch(error){return workflowFailure(error);}
  });
  handle('versions:restore',async(event,input)=>{
    assertSender(event);const target=selectedTarget(input);
    if(versionBusy||generating||proposals.saving||proposals.pending)return workflowFailure({code:'AI_BUSY'});
    versionBusy=true;
    try{
      const baseline=await buildPreview(target.root,target.slug);await observeVersions(target,baseline);
      const history=await versions.read(target);if(history.draft)throw Object.assign(Error('STALE_PROPOSAL'),{code:'STALE_PROPOSAL'});
      const revision=history.revisions.find(r=>r.id===input.versionId);if(!revision)throw Object.assign(Error('STALE_PROPOSAL'),{code:'STALE_PROPOSAL'});
      if(revision.contextDigest!==baseline.snapshot.contextDigest)throw Object.assign(Error('VERSION_CONTEXT_CHANGED'),{code:'VERSION_CONTEXT_CHANGED'});
      const proposal=proposals.createSource(target,baseline,revision.source,{kind:'restore',label:`回復 V${revision.number} 的日程內容`});
      // 回到某個版本也直接套用；它本身會成為新的一版，所以還可以再回來。
      if(proposal.changed){try{const applied=await applyPendingNow(target);
          let conversation=null;try{conversation=displayConversation(await conversations.update(target,st=>{st.messages.push({role:'assistant',text:`已回到 V${revision.number} 的內容，存成新的一版 V${applied.number||'?'}。尚未備份到 GitHub。`,applied});st.lastOutcome=`已回到 V${revision.number} 的內容，保存於本機，尚未備份。`;}));}catch{}
          return {ok:true,proposal:{changed:false,applied:true,...applied},conversation};}
        catch(e){if(!proposals.pending)throw e;try{await versions.saveDraft(target,proposals.draft());}catch(err){proposals.discard();throw err;}artifact=proposals.pending.artifact;previewAttempt++;}}
      return {ok:true,proposal};
    }catch(error){return workflowFailure(error);}finally{versionBusy=false;}
  });
  handle('proposal:select',async(event,input)=>{
    assertSender(event);const target=selectedTarget(input);
    if(versionBusy||generating||proposals.saving)return workflowFailure({code:'AI_BUSY'});
    if(!proposals.pending||proposals.pending.target.projectId!==target.projectId||proposals.pending.target.slug!==target.slug)return workflowFailure({code:'STALE_PROPOSAL'});
    versionBusy=true;const old=proposals.pending;
    try{
      const proposal=proposals.select(input.proposalId,input.selectedKeys);
      await versions.saveDraft(target,proposals.draft());artifact=proposals.pending.artifact;previewAttempt++;
      return {ok:true,proposal};
    }catch(error){proposals.pending=old;return workflowFailure(error);}finally{versionBusy=false;}
  });
  handle('preview:open-browser', async (event, url) => {
    assertSender(event);
    if (!artifact || url !== artifact.url) return {ok:false,message:'這份預覽已失效，請重新開啟右側預覽。'};
    try { await openPreviewURL(await browserPreview.open(artifact)); return {ok:true}; }
    catch { return {ok:false,message:'無法開啟瀏覽器預覽，請重試。'}; }
  });
  handle('appearance:set-theme', async (event, mode) => {
    assertSender(event);
    if (!['system', 'light', 'dark'].includes(mode)) throw new Error('Invalid theme');
    nativeTheme.themeSource = mode;
    applyNativeIcon();
    await store.setTheme(mode);
    return { mode, dark: nativeTheme.shouldUseDarkColors };
  });
  let selecting = false;
  handle('project:choose', async event => {
    assertSender(event);
    if (selecting) return { ok: false, code: 'selection-busy' };
    if (versionBusy || generating || editor.active || proposals.saving) return { ok:false,code:'workspace-busy' };
    if (proposals.pending || materialization) return { ok:false,code:'workspace-pending-proposal' };
    selecting = true;versionBusy=true;
    try {
      const choice = await (pickDirectory ? pickDirectory() : dialog.showOpenDialog(win, {
        title: '選擇既有 travel-planner 專案', buttonLabel: '檢查這個專案', properties: ['openDirectory'],
      }));
      if (choice.canceled || !choice.filePaths.length) return { canceled: true };
      await newTrips.recover?.(choice.filePaths[0]);
      const checked = await inspectProject(choice.filePaths[0]);
      if (!checked.ok) return checked;
      const projectId = currentProject?.root === checked.root ? currentProject.projectId : randomUUID();
      await store.connect({ id: projectId, root: checked.root });
      currentProject = { ...checked, projectId };activeSlug=null;
      restoreWarning = null; artifact = null; previewAttempt += 1;
      return currentProject;
    } catch {
      return { ok: false, code: 'project-unreadable' };
    } finally {
      selecting = false;versionBusy=false;
    }
  });
  const stopForClose=async()=>{windowClosing=true;updater.cancelDownload?.();clearInterval(quotaTimer);generationNonce++;await auth.close();if(editor.active)await editor.stop().catch(()=>{});};
  shutdownHooks.add(stopForClose);
  let closing=false,closeRequested=false;
  const reopenAfterCloseFailure=()=>{closeRequested=false;windowClosing=false;auth=makeAuth(authOptions);clearInterval(quotaTimer);quotaTimer=setInterval(()=>tracked(pollQuota).catch(()=>{}),15000);quotaTimer.unref();};
  win.on('close',event=>{
    if(closing||nativeUpdateHandoff)return;event.preventDefault();if(closeRequested)return;closeRequested=true;
    if(!win.isDestroyed())win.webContents.send('app:closing');
    (async()=>{
      await stopForClose();await waitForOperations();
      const saved=await win.webContents.executeJavaScript('flushConversationDraft()');
      if(!saved){reopenAfterCloseFailure();dialog.showErrorBox('草稿尚未保存','請檢查本機儲存空間，再關閉視窗。');return;}
      await Promise.all([conversations.flush(),versions.flush()]);closing=true;win.close();
    })().catch(()=>{reopenAfterCloseFailure();dialog.showErrorBox('尚未確認作業完成','目前作業或草稿尚未確認保存，請稍後重試。');});
  });
  win.on('closed', () => {
    updater.removeListener('changed',updateChanged);
    shutdownHooks.delete(stopForClose);
    clearInterval(quotaTimer);for(const channel of extraChannels)ipcMain.removeHandler(channel);
    auth.close().catch(()=>{});
    if(materialization)newTrips.discardMaterialization(materialization.token).catch(()=>{});
    ipcMain.removeHandler('project:choose');
    ipcMain.removeHandler('appearance:set-theme');
    for (const channel of ['workspace:read', 'workspace:select', 'preview:build', 'preview:open-browser', 'conversation:read', 'conversation:preferences', 'conversation:restart', 'versions:list', 'versions:restore', 'versions:changes', 'proposal:select']) ipcMain.removeHandler(channel);
    for (const channel of ['codex:connect', 'codex:refresh', 'codex:login', 'codex:cancel-login', 'codex:switch-account', 'codex:copy-login-link']) ipcMain.removeHandler(channel);
    for (const channel of ['codex:models','ai:generate','ai:stop','proposal:discard','proposal:apply','proposal:status']) ipcMain.removeHandler(channel);
    conversations.flush().finally(()=>chatStores.delete(conversations));
    versions.flush().finally(()=>chatStores.delete(versions));
    for(const [id,item] of providerBundles){item.account.removeListener('changed',providerListeners.get(id));item.account.stop().catch(()=>{}).finally(()=>clients.delete(item.account));}
    artifact = null; previewAttempt += 1;
    browserPreview.close();
    researchKit.close().catch(()=>{});
    nativeTheme.removeListener('updated', applyNativeIcon);
    isolatedSession.protocol.unhandle('travel-app');
    isolatedSession.protocol.unhandle('travel-preview');
  });
  await win.loadURL(APP_URL);
  return win;
}

async function shutdown() {shuttingDown=true;await Promise.allSettled([...shutdownHooks].map(stop=>stop()));await waitForOperations();await Promise.allSettled([...clients].map(client=>client.stop()));await Promise.allSettled([...chatStores].map(store=>store.flush()));}
module.exports = { createWindow, shutdown, isUpdateHandoff:()=>nativeUpdateHandoff };
