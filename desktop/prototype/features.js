/* Additional desktop flows use fixed main-process capabilities and explicit confirmations. */
(() => {
  // Thumbnails exist only for images added in this window; stored bytes stay in the main process.
  const thumbnails=new Map();
  let models=[],references=[],selectedRefs=new Set(),referenceScope='',lastAccount='',featureState={},materializedCandidate=false,viewedPreviewURL=null;
  let conversationItems=[],currentConversation=null,showArchived=false,conversationRequest=0,renameConversationId=null;
  let backupToken=null,publishToken=null,adoptionToken=null,elapsedTimer=null,startedAt=0;
  const exclusive=new Set(['project-update-prepare','project-update-confirm','tool-prepare','tool-install','provider-select','trip-delete-prepare','trip-delete-confirm','trip-restore','project-setup-prepare','project-setup-confirm','git-identity-prepare','git-identity-confirm','trip-create','plan-confirm','references-add','references-add-bytes','references-url','references-remove','research-confirm','materialize-confirm','materialize-discard','job-wait','job-pause','job-recover','handoff','backup-prepare','backup-confirm','publish-prepare','publish-confirm','adoption-prepare','adoption-confirm','archive-export','archive-import','auth-start','auth-cancel','cloudflare-account','conversation-new','conversation-switch','conversation-rename','conversation-archive']);
  const api=async(action,input={})=>{
    if(!window.travelDesktop?.feature)throw Error('請在桌面 App 使用這個功能。');
    const owns=exclusive.has(action)&&!aiBusy;if(owns){aiBusy=true;proposalBusy=true;updateComposer();}
    try{const result=await window.travelDesktop.feature(action,input);if(!result.ok)throw Error(result.message||'操作未完成');return result;}
    finally{if(owns){aiBusy=false;proposalBusy=false;renderProposal();updateComposer();}}
  };
  const target=()=>conversationTarget();
  const tell=(id,text)=>{$(id).textContent=text||'';};
  const button=(text,click)=>{const b=el('button',text);b.type='button';b.onclick=click;return b;};
  async function action(id,fn){const b=$(id),label=b.textContent;b.disabled=true;b.textContent='處理中…';try{return await fn();}catch(e){notify(e.message||'操作未完成');}finally{b.disabled=false;b.textContent=label;}}
  function useConversation(result){if(result.conversation&&selected){applyConversation(result.conversation,selected.trip);if(accountState.state==='disconnected')restoreAIConnection();}}
  window.reloadProjectFromResult=result=>reloadProject(result);
  async function reloadProject(result){const changed=project?.projectId!==result.project.projectId;if(changed){clearTimeout(draftTimer);selected=null;window.onFeatureTrip?.();$('welcome').hidden=false;$('messages').hidden=true;$('messages').replaceChildren();$('message').value='';$('trip-title').textContent='選擇一趟旅程';$('trip-status').textContent='已切換專案';}project=result.project;pendingProposal=null;materializedCandidate=false;realPreview=null;navigation();renderProject();updateComposer();window.onOnboardingProjectChanged?.();if(changed)renderPreview();const trip=project.trips.find(t=>t.slug===result.selectedSlug);if(trip){await selectTrip(trip);setPreview(true);}}
  async function changeConversation(actionName,extra={}){
    if(aiBusy||pendingProposal||materializedCandidate){notify('請先停止 AI 工作，或確認／放棄目前的提案，再操作對話。');return;}
    const archiving=actionName==='conversation-archive'&&extra.archived!==false,wasCurrent=extra.id===currentConversation,archivedTitle=archiving?(wasCurrent?selected?.trip.featureState?.conversationTitle:null)||conversationItems.find(c=>c.id===extra.id)?.title||'這段對話':null;
    aiBusy=true;proposalBusy=true;updateComposer();
    try{if(!await flushConversationDraft())return;useConversation(await api(actionName,{...target(),...extra}));await loadConversations();
      // 封存目前對話會自動換成一段新的討論，畫面看起來像沒變化，所以明確告知。
      if(archiving)notify('已封存「'+archivedTitle+'」'+(wasCurrent?'，並開始一段新的討論':'')+'。可從對話清單的「⋯ → 顯示已封存對話」找回。');}
    catch(e){notify(e.message);}finally{aiBusy=false;proposalBusy=false;updateComposer();}
  }
  async function loadConversations(){if(!selected||selected.demo||!window.travelDesktop)return;const request=++conversationRequest;const result=await api('conversations-list',target());if(request!==conversationRequest)return;conversationItems=result.items;currentConversation=result.currentId;navigation();window.refreshBackupStatus();}
  // 頂部「尚未備份」：只看本機（未提交的行程改動、未推送的提交），不連網。
  let backupStatusRequest=0;
  let backupStatusTimer=null;
  // 多個觸發點可能同時呼叫，合併成一次本機查詢。
  window.refreshBackupStatus=()=>{clearTimeout(backupStatusTimer);backupStatusTimer=setTimeout(()=>updateBackupStatus().catch(()=>{}),400);};
  async function updateBackupStatus(){
    const button=$('backup-status');if(!project||!selected||selected.demo||!window.travelDesktop){button.hidden=true;return;}
    const request=++backupStatusRequest;let status=null;try{status=(await window.travelDesktop.feature('backup-status',{slug:selected.trip.slug})).status;}catch{}
    if(request!==backupStatusRequest)return;
    const pending=status&&(status.neverBackedUp||status.pendingFiles>0||status.unpushedCommits>0);
    button.hidden=!pending||$('versions-open').hidden;if(!pending)return;
    button.textContent=status.neverBackedUp?'尚未備份到 GitHub':'尚未備份'+(status.pendingFiles?` · ${status.pendingFiles} 個檔案`:'');
  }
  $('backup-status').onclick=()=>openSettings('backup');
  window.addEventListener('focus',()=>window.refreshBackupStatus());
  function conversationMenu(item){const disabled=aiBusy||Boolean(pendingProposal)||materializedCandidate;return [
    {label:'命名對話',icon:'chat',disabled,action:()=>{renameConversationId=item.id;$('conversation-name').value=item.title;$('conversation-name-dialog').showModal();}},
    {label:'複製對話',icon:'chat',disabled:aiBusy,action:async()=>{await api('conversation-copy',{...target(),id:item.id});notify('對話文字已複製；可能含私人資訊，請留意貼上的位置。');}},
    {label:pendingProposal||materializedCandidate?'封存對話（請先處理提案）':item.archived?'取消封存':'封存對話',icon:'folder',disabled,title:pendingProposal||materializedCandidate?'請先確認或放棄目前提案，再封存對話':'',action:()=>changeConversation('conversation-archive',{id:item.id,archived:!item.archived})}
  ];}
  function renderConversations(){
    $('conversation-list').replaceChildren();for(const item of conversationItems.filter(c=>showArchived||!c.archived)){
      const row=el('div',undefined,'conversation-row');const b=button((item.archived?'已封存 · ':'')+item.title,()=>changeConversation('conversation-switch',{id:item.id}));b.className='conversation-button';b.prepend(icon('chat'));if(item.current)b.setAttribute('aria-current','page');
      const more=moreButton(item.title+'的更多操作',()=>conversationMenu(item));row.append(b,more);row.oncontextmenu=e=>openActionMenu(more,conversationMenu(item),e);$('conversation-list').append(row);
    }
  }
  window.renderSidebarConversations=renderConversations;
  window.populateTripConversations=async(trip,container)=>{
    const projectId=project?.projectId;try{const result=await api('conversations-list',{projectId,slug:trip.slug});if(!container.isConnected||project?.projectId!==projectId)return;
      for(const item of result.items.filter(c=>showArchived||!c.archived)){const activate=async()=>{if(selected?.trip===trip)return true;if(pendingProposal||materializedCandidate||aiBusy)return false;await selectTrip(trip);await selectionReady;return selected?.trip===trip;};const row=el('div',undefined,'conversation-row'),b=button(item.title,async()=>{if(await activate())await changeConversation('conversation-switch',{id:item.id});});b.className='conversation-button';b.prepend(icon('chat'));const items=()=>conversationMenu(item).map(entry=>entry.action?{...entry,disabled:entry.disabled||((pendingProposal||materializedCandidate)&&selected?.trip!==trip),action:async()=>{if(await activate())return entry.action();}}:entry);const more=moreButton(item.title+'的更多操作',items);row.append(b,more);row.oncontextmenu=e=>openActionMenu(more,items(),e);container.append(row);}
    }catch{if(container.isConnected)container.append(el('small','無法載入對話，請選取旅程重試。'));}
  };
  window.newTripConversation=async trip=>{if(selected?.trip!==trip){await selectTrip(trip);await selectionReady;}if(selected?.trip===trip)await changeConversation('conversation-new');};
  $('conversation-new').onclick=()=>changeConversation('conversation-new');
  const copyCurrentConversation=()=>action('conversation-copy',async()=>{await api('conversation-copy',{...target(),id:currentConversation});notify('對話文字已複製；可能含私人資訊，請留意貼上的位置。');});
  $('conversation-copy').onclick=copyCurrentConversation;
  $('conversation-rename').onclick=()=>{renameConversationId=currentConversation;$('conversation-name').value=conversationItems.find(c=>c.id===currentConversation)?.title||'';$('conversation-name-dialog').showModal();};$('close-conversation-name').onclick=()=>$('conversation-name-dialog').close();
  $('conversation-name-form').onsubmit=async event=>{event.preventDefault();try{useConversation(await api('conversation-rename',{...target(),id:renameConversationId||currentConversation,title:$('conversation-name').value}));$('conversation-name-dialog').close();await loadConversations();}catch(e){notify(e.message);}};
  $('conversation-archive').onclick=()=>changeConversation('conversation-archive',{id:currentConversation});
  $('conversation-show-archived').onclick=()=>{showArchived=!showArchived;$('conversation-show-archived').textContent=showArchived?'隱藏封存':'顯示封存';renderConversations();};
  let nextProvider=null;
  async function switchProvider(id,newConversation=false){
    if(aiBusy||pendingProposal||materializedCandidate)return;aiBusy=true;proposalBusy=true;updateComposer();
    try{if(!await flushConversationDraft())return;const result=await api('provider-select',{id,newConversation});activeProvider=result.provider;useConversation(result);renderCodexAccount(result.account);$('provider-switch-dialog').close();await restoreAIConnection();}
    catch(e){notify(e.message);$('chat-provider').value=activeProvider;}
    finally{aiBusy=false;proposalBusy=false;updateComposer();}
  }
  function requestProvider(id){
    $('chat-provider').value=activeProvider;if(id===activeProvider)return;
    if(selected?.trip.featureState?.started){notify('這段對話的 AI 服務已固定，請從右上方選單開新對話。');return;}
    switchProvider(id);
  }
  function newProviderConversation(){
    if(aiBusy||pendingProposal||materializedCandidate)return;
    const select=$('provider-switch-choice');for(const option of select.options)option.disabled=option.value===activeProvider;
    const available=[...select.options].find(option=>!option.hidden&&!option.disabled);if(!available){notify('目前沒有其他已連接的 AI；請先到 AI 設定連接服務。');return;}
    nextProvider=available.value;select.value=nextProvider;
    $('provider-switch-description').textContent='目前對話、設定與草稿都會保留。新對話使用所選服務，不會自動收到舊對話內容。';$('provider-switch-dialog').showModal();select.focus();
  }
  $('chat-provider').onchange=e=>requestProvider(e.target.value);$('cancel-provider-switch').onclick=()=>$('provider-switch-dialog').close();
  $('provider-switch-choice').onchange=e=>{nextProvider=e.target.value;};
  $('confirm-provider-switch').onclick=()=>action('confirm-provider-switch',()=>nextProvider&&switchProvider(nextProvider,true));
  $('chat-more').onclick=e=>openActionMenu(e.currentTarget,[
    {label:'使用其他 AI 開新對話…',icon:'plus',disabled:aiBusy||Boolean(pendingProposal)||materializedCandidate,action:newProviderConversation},
    {separator:true},
    {label:'命名對話',icon:'chat',disabled:aiBusy,action:()=>$('conversation-rename').click()},
    {label:'複製對話',icon:'chat',disabled:aiBusy,action:copyCurrentConversation},
    {separator:true},{label:'交接到新對話…',icon:'chat',disabled:aiBusy||Boolean(pendingProposal),action:()=>$('handoff-open').click()},
    {label:'重新開始（保留紀錄）',icon:'chat',disabled:$('restart-conversation').disabled,action:()=>$('restart-conversation').click()},
    {separator:true},{label:pendingProposal||materializedCandidate?'封存對話（請先處理提案）':'封存對話',icon:'folder',disabled:aiBusy||Boolean(pendingProposal)||materializedCandidate,title:pendingProposal||materializedCandidate?'請先確認或放棄目前提案，再封存對話':'',action:()=>changeConversation('conversation-archive',{id:currentConversation})}
  ]);
  $('journeys-more').onclick=e=>openActionMenu(e.currentTarget,[
    {label:showArchived?'隱藏已封存對話':'顯示已封存對話',icon:'chat',action:()=>{showArchived=!showArchived;navigation();}},
    {label:'已移除的旅程…',icon:'trash',disabled:!project,action:()=>window.openTripTrash?.()},
    {separator:true},{label:'恢復示範旅程',icon:'plus',disabled:demos.some(t=>t.id==='welcome-demo'),action:async()=>{if(window.travelDesktop)await api('demo-visibility',{hidden:false});try{localStorage.removeItem('travel-planner.demo-removed');}catch{}seedDemo();navigation();}}
  ]);
  let deletion=null;
  function clearSelectedTrip(){clearTimeout(draftTimer);selected=null;realPreview=null;previewRequest++;pendingProposal=null;window.onFeatureTrip?.();$('welcome').hidden=false;$('messages').hidden=true;$('messages').replaceChildren();$('message').value='';$('trip-title').textContent='選擇一趟旅程';$('trip-status').textContent='Travel Planner';renderPreview();updateComposer();}
  window.requestTripRemoval=async(trip,demo)=>{
    if(aiBusy||pendingProposal||materializedCandidate)return;
    try{const preparation=demo?null:(await api('trip-delete-prepare',{projectId:project.projectId,slug:trip.slug})).preparation;
      deletion={trip,demo,preparation};$('trip-delete-title').textContent=demo?'刪除示範旅程':'移除「'+trip.title+'」';$('trip-delete-description').textContent=demo?'這份示範與示範對話會移除。你可以從旅程清單的更多選單重新加入示範。':preparation.warning;
      $('confirm-trip-delete').textContent=demo?'刪除示範旅程':'移到本機回收區';$('trip-delete-error').hidden=true;$('trip-delete-dialog').showModal();
    }catch(e){notify(e.message);}
  };
  $('cancel-trip-delete').onclick=()=>$('trip-delete-dialog').close();
  $('reset-app-open').hidden=!window.travelDesktop;
  $('reset-app-open').onclick=()=>{if(aiBusy||pendingProposal||materializedCandidate){notify('請先停止 AI 工作，或確認／放棄目前的提案，再重置。');return;}$('reset-app-error').hidden=true;$('confirm-reset-app').disabled=false;$('reset-app-dialog').showModal();};
  $('cancel-reset-app').onclick=()=>$('reset-app-dialog').close();
  $('confirm-reset-app').onclick=async()=>{
    $('confirm-reset-app').disabled=true;$('confirm-reset-app').textContent='正在登出並重置…';$('reset-app-error').hidden=true;
    try{await api('reset-app-data',{confirmed:true});}
    catch(e){$('reset-app-error').textContent=e.message;$('reset-app-error').hidden=false;$('confirm-reset-app').disabled=false;$('confirm-reset-app').textContent='重置並重新啟動';}
  };
  $('confirm-trip-delete').onclick=()=>action('confirm-trip-delete',async()=>{
    if(!deletion||aiBusy)return;const {trip,demo,preparation}=deletion;
    aiBusy=true;proposalBusy=true;updateComposer();try{if(!await flushConversationDraft())return;
      if(demo){if(trip.id==='welcome-demo'&&window.travelDesktop)await api('demo-visibility',{hidden:true});const i=demos.indexOf(trip);if(i>=0)demos.splice(i,1);if(trip.id==='welcome-demo')try{localStorage.setItem('travel-planner.demo-removed','true');}catch{}if(selected?.trip===trip)clearSelectedTrip();navigation();}
      else{const result=await api('trip-delete-confirm',{token:preparation.token});if(selected?.trip===trip)clearSelectedTrip();project=result.project;navigation();renderProject();}
      $('trip-delete-dialog').close();deletion=null;notify(demo?'示範已刪除。':'旅程已移到本機回收區，可從旅程清單的更多選單還原。');
    }catch(e){$('trip-delete-error').textContent=e.message;$('trip-delete-error').hidden=false;}finally{aiBusy=false;proposalBusy=false;updateComposer();}
  });
  window.openTripTrash=async()=>{try{const {items}=await api('trip-trash-list');$('trip-trash-list').replaceChildren();for(const item of items){const row=el('div',undefined,'setting-row');row.append(el('span',item.title||item.slug),button('還原',async()=>{try{const result=await api('trip-restore',{id:item.id});project=result.project;navigation();renderProject();await window.openTripTrash();notify('旅程已還原。');}catch(e){notify(e.message);}}));$('trip-trash-list').append(row);}if(!items.length)$('trip-trash-list').append(el('p','目前沒有已移除的旅程。'));if(!$('trip-trash-dialog').open)$('trip-trash-dialog').showModal();}catch(e){notify(e.message);}};
  $('close-trip-trash').onclick=()=>$('trip-trash-dialog').close();
  window.createRealTripFromForm=async form=>{
    if(!project){$('new-error').textContent='請先在設定連接你的私人專案，再建立正式旅程。';$('new-error').hidden=false;return;}
    $('new-submit').disabled=true;
    try{const result=await api('trip-create',form);$('new-dialog').close();await reloadProject(result);notify('正式旅程草稿已保存。先討論逐日安排，再查核與建立预覽。');}
    catch(e){$('new-error').textContent=e.message;$('new-error').hidden=false;}
    finally{$('new-submit').disabled=false;}
  };
  window.onFeatureTrip=()=>{conversationRequest++;conversationItems=[];currentConversation=null;$('conversation-list').replaceChildren();references=[];selectedRefs.clear();referenceScope='';featureState={};updateReferenceCount();renderJob();};
  window.selectedReferenceIds=()=>[...selectedRefs];
  window.hasMaterialization=()=>materializedCandidate;
  window.setFeatureModels=value=>{models=value;window.refreshEffort();};
  window.refreshEffort=()=>{
    const model=models.find(m=>m.id===$('chat-model').value);const previous=selected?.trip.effort??featureState.effort??'';
    const names={none:'不額外思考',minimal:'最少',low:'低',medium:'中',high:'高',xhigh:'更高',max:'最高'};
    $('chat-effort').replaceChildren();const automatic=el('option',model?.defaultEffort?`模型預設（${names[model.defaultEffort]||model.defaultEffort}）`:'模型預設（由服務決定）');automatic.value='';$('chat-effort').append(automatic);
    for(const item of model?.effort||[]){const value=typeof item==='string'?item:item.reasoningEffort;const option=el('option',({none:'不額外思考',minimal:'最少',low:'低',medium:'中',high:'高',xhigh:'更高',max:'最高'})[value]||value);option.value=value;$('chat-effort').append(option);}
    const allowed=[...$('chat-effort').options].some(o=>o.value===previous);$('chat-effort').value=allowed?previous:'';
    if(model&&selected&&!selected.demo&&!allowed)selected.trip.effort='';
    $('chat-effort').hidden=!selected||selected.demo||accountState.state!=='connected'||!model?.effort?.length;
  };
  $('chat-effort').onchange=()=>{if(selected){selected.trip.effort=$('chat-effort').value;queuePreferences();}};
  window.onFeatureAccount=account=>{window.updateProviderRow?.({...account,provider:activeProvider});const identity=JSON.stringify([activeProvider,account.label,account.plan]);if(account.state!=='connected'||identity!==lastAccount){references=[];selectedRefs.clear();referenceScope='';$('chat-effort').hidden=true;}lastAccount=identity;updateReferenceCount();};
  window.renderFeatureState=state=>{featureState=state;currentConversation=state.conversationId;if(conversationItems.find(c=>c.current)?.id!==currentConversation){conversationItems=[];renderConversations();}loadConversations().catch(()=>{});window.refreshEffort();renderJob();renderPlan();};
  function renderPlan(){const planning=Boolean(realPreview?.planning);$('planning-actions').hidden=!planning;
    tell('planning-status',featureState.plan?.approvedDigest?'逐日草案已確認':'規劃草案 · 尚待確認');
    $('confirm-plan').disabled=!featureState.plan?.markdown||Boolean(featureState.plan?.approvedDigest)||aiBusy;
    $('materialize-plan').disabled=!featureState.plan?.approvedDigest||!featureState.research?.confirmed||aiBusy;
    $('show-research').hidden=!featureState.research;
  }
  window.updateFeatureControls=({real,ready,busy,pending,planning})=>{
    document.querySelectorAll('#trips .conversation-button').forEach(b=>b.disabled=busy||Boolean(pending)||materializedCandidate);
    $('conversation-sidebar').hidden=!real;for(const id of ['conversation-new','conversation-rename','conversation-archive'])$(id).disabled=busy||Boolean(pending)||materializedCandidate;
    $('conversation-copy').disabled=busy;
    $('feature-workflow').hidden=!real;$('open-references').hidden=!real;
    $('open-references').disabled=busy||accountState.state!=='connected';$('chat-effort').disabled=busy||Boolean(pending);
    $('research-trip').disabled=!ready||busy||accountState.state!=='connected'||(planning&&!featureState.plan?.approvedDigest);
    const jobRestart=document.querySelector('#job-card .job-restart');if(jobRestart)jobRestart.disabled=busy||Boolean(pending)||!ready;
    $('handoff-open').disabled=busy||Boolean(pending)||materializedCandidate;
    $('planning-actions').hidden=!planning;renderPlan();
    $('materialization-actions').hidden=!materializedCandidate;
    if(materializedCandidate){$('message').disabled=true;$('send-message').disabled=true;$('versions-open').hidden=true;$('confirm-materialization').disabled=busy||viewedPreviewURL!==realPreview?.url;}
    if(busy&&!elapsedTimer){startedAt=Date.now();elapsedTimer=setInterval(()=>{const node=document.querySelector('#ai-progress .message-meta');if(node)node.textContent=`處理中 · ${Math.floor((Date.now()-startedAt)/1000)} 秒`;},1000);}
    if(!busy&&elapsedTimer){clearInterval(elapsedTimer);elapsedTimer=null;}
  };
  window.acceptFeatureResult=result=>{
    // AI 可能替預設名稱的對話取了新名字，側欄清單要跟著更新。
    if(result.conversation)loadConversations().catch(()=>{});
    if(result.research){featureState.research=result.research;$('show-research').hidden=false;}
    if(result.proposal?.materialization){materializedCandidate=true;viewedPreviewURL=null;realPreview={status:'ready',planning:false,url:result.proposal.previewUrl,summary:result.proposal.previewSummary};setPreview(true);renderPreview();$('confirm-materialization').disabled=true;}
    renderJob();renderPlan();
  };
  // iframe load can arrive before the main process records its receipt (or for
  // an older document). Enable confirmation only after the host acknowledges it.
  // 目前預覽是否已在 App 內完整載入（發布與保存前的確認依據）；供介面與測試查詢。
  window.previewViewed=()=>Boolean(realPreview?.url)&&viewedPreviewURL===realPreview.url;
  window.travelDesktop?.onPreviewViewed?.(({url})=>{
    if(url!==realPreview?.url)return;
    viewedPreviewURL=url;
    if(materializedCandidate)$('confirm-materialization').disabled=aiBusy;
  });
  async function specialized(mode,text){
    if(aiBusy||!selected||selected.demo)return;
    aiBusy=true;updateComposer();if(!await flushConversationDraft()){aiBusy=false;updateComposer();return;}
    const trip=selected.trip;const progress=addMessage({role:'assistant',text:mode==='research'?'正在查詢與核對公開來源…':'正在建立完整行程候選…'});markAIProgress(progress);
    try{const result=await window.travelDesktop.generateProposal({...target(),dayId:pendingProposal?.changes?.[0]?.dayId??null,mode,text,model:$('chat-model').value,effort:$('chat-effort').value||undefined,attachmentIds:[...selectedRefs]});progress.remove();useConversation(result);window.acceptFeatureResult(result);if(!result.ok&&!result.conversation)notify(result.message);if(result.proposal?.changed)stageProposal(result.proposal);}
    catch{progress.remove();notify('結果未能確認，沒有自動重送。');}
    finally{aiBusy=false;renderProposal();updateComposer();}
  }
  $('research-trip').onclick=()=>specialized('research',pendingProposal?'請查核目前候選行程中調整的停留安排與備案，確認營業時間、交通順序與緩衝可行性。引用官方來源與原文短摘，任何未知都列入待確認。':'請依目前逐日安排／已確認草案，查核景點、交通、餐食與行程可行性；引用官方來源與原文短摘，任何未知都列入待確認。');
  $('confirm-plan').onclick=()=>action('confirm-plan',async()=>{const result=await api('plan-confirm',{...target(),digest:featureState.plan?.digest});useConversation(result);renderPlan();});
  $('materialize-plan').onclick=()=>specialized('materialize','請依已確認逐日草案與來源查核結果，建立符合所有 schema 的完整旅程資料檔。保留指定 deploy.name；不填造假的座標、日期或來源。若仍缺必要事實，明確指出，不能宣稱已保存。');
  $('confirm-materialization').onclick=()=>action('confirm-materialization',async()=>{const result=await api('materialize-confirm',target());await reloadProject(result);window.refreshBackupStatus();notify('正式行程資料已保存本機，尚未發布或異地備份。');});
  $('discard-materialization').onclick=()=>action('discard-materialization',async()=>{await api('materialize-discard',target());materializedCandidate=false;realPreview=null;renderPreview();updateComposer();});
  function renderResearch(){
    const report=featureState.research;$('research-report').replaceChildren();if(!report)return;
    const summary=el('div');renderMarkdown(summary,report.summary);$('research-report').append(summary,el('h3','可行性摘要'),el('p',report.feasibility));
    for(const source of report.sources){const row=el('section',undefined,'source-row');const link=button(source.title||source.url,()=>api('open-link',{url:source.url}).catch(e=>notify(e.message)));link.className='inline-link';row.append(link,el('small',`${source.verified?'已取得頁面並核對短摘':'尚未核對'} · ${new Date(source.checkedAt).toLocaleString('zh-TW')}`),el('blockquote',source.evidence));$('research-report').append(row);}
    if(report.privateNotes){$('research-report').append(el('h3','私人筆記（確認後存到這趟的 docs/private-notes.md，不進公開網站）'),el('pre',report.privateNotes));}
    if(report.unresolved.length){$('research-report').append(el('h3','待確認事項'));const ul=el('ul');report.unresolved.forEach(item=>ul.append(el('li',item)));$('research-report').append(ul);}
    $('confirm-research').disabled=report.unresolved.length>0||!report.sources.length||report.sources.some(s=>!s.verified)||aiBusy;
  }
  $('show-research').onclick=()=>{renderResearch();$('research-dialog').showModal();};$('close-research').onclick=()=>$('research-dialog').close();
  $('confirm-research').onclick=()=>action('confirm-research',async()=>{const result=await api('research-confirm',target());useConversation(result);if(result.proposal){pendingProposal={...result.proposal,...target(),previewLoaded:false};$('preview').removeAttribute('src');renderPreview();renderProposal();}$('research-dialog').close();notify('查核摘要已確認，請再次檢查候選預覽。');});
  function updateReferenceCount(){tell('references-count',selectedRefs.size?`${selectedRefs.size} 份參考資料`:'');renderComposerAttachments();}
  function renderComposerAttachments(){
    const tray=$('composer-attachments'),items=references.filter(item=>selectedRefs.has(item.id));tray.replaceChildren();tray.hidden=!items.length;
    for(const item of items){const chip=el('li',undefined,'composer-attachment');if(thumbnails.has(item.id)){const img=el('img');img.src=thumbnails.get(item.id);img.alt='';chip.append(img);}
      chip.append(el('span',item.name));const remove=button('×',()=>{selectedRefs.delete(item.id);renderReferences();$('message').focus();});remove.setAttribute('aria-label',`不附加 ${item.name}`);remove.title='這次不附加（仍保留在參考資料）';chip.append(remove);tray.append(chip);}
  }
  async function loadReferences(){const scope=JSON.stringify([project?.projectId,selected?.trip.slug,accountState.label]);if(scope!==referenceScope){referenceScope=scope;selectedRefs.clear();}const result=await api('references-list',target());references=result.items;renderReferences();}
  function renderReferences(){$('references-list').replaceChildren();for(const item of references){const row=el('div',undefined,'reference-row'),label=el('label'),check=document.createElement('input');check.type='checkbox';check.checked=selectedRefs.has(item.id);check.onchange=()=>{if(check.checked)selectedRefs.add(item.id);else selectedRefs.delete(item.id);updateReferenceCount();};label.append(check,document.createTextNode(` ${item.name} · ${Math.ceil(item.size/1024)} KB`));row.append(label,button('移除',async()=>{await api('references-remove',{...target(),id:item.id});selectedRefs.delete(item.id);await loadReferences();}));$('references-list').append(row);}if(!references.length)$('references-list').append(el('p','尚未加入參考資料。'));updateReferenceCount();}
  $('open-references').onclick=async()=>{$('references-dialog').showModal();tell('reference-message','');try{await loadReferences();}catch(e){tell('reference-message',e.message);}};$('close-references').onclick=()=>$('references-dialog').close();
  $('add-reference-file').onclick=()=>action('add-reference-file',async()=>{const result=await api('references-add',target());if(result.canceled)return;result.items.forEach(i=>selectedRefs.add(i.id));await loadReferences();});
  const ATTACHABLE=/\.(txt|md|json|png|jpe?g|webp)$/i,IMAGE_NAMES={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
  const readDataURL=file=>new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>resolve(null);reader.readAsDataURL(file);});
  function attachmentName(file){if(file.name&&file.name!=='image.png'&&ATTACHABLE.test(file.name))return file.name;const ext=IMAGE_NAMES[file.type];if(!ext)return null;const d=new Date(),p=n=>String(n).padStart(2,'0');return `截圖-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;}
  async function attachFiles(files){
    if(!selected||selected.demo||!window.travelDesktop){notify('請先連接專案並選擇旅程，再加入截圖或檔案。');return;}
    if(aiBusy){notify('AI 回覆中，請稍後再加入附件。');return;}
    const accepted=files.map(file=>({file,name:attachmentName(file)})).filter(item=>item.name).slice(0,6);
    if(accepted.length<files.length)notify('只能加入文字、Markdown、JSON、PNG、JPEG 或 WebP，一次最多 6 個。');
    // Settle the trip/account scope first; a scope change clears selections, including ones added below.
    try{await loadReferences();}catch(e){notify(e.message);return;}
    for(const {file,name} of accepted){try{const {item}=await api('references-add-bytes',{...target(),name,bytes:new Uint8Array(await file.arrayBuffer())});selectedRefs.add(item.id);if(item.kind==='image'){const url=await readDataURL(file);if(url)thumbnails.set(item.id,url);}}catch(e){notify(e.message||'附件未能加入。');}}
    try{await loadReferences();}catch(e){notify(e.message);}
  }
  $('message').addEventListener('paste',event=>{const files=[...(event.clipboardData?.files||[])];if(!files.length)return;if(!event.clipboardData.getData('text/plain'))event.preventDefault();attachFiles(files);});
  const hasFiles=event=>[...(event.dataTransfer?.types||[])].includes('Files');
  $('chat-form').addEventListener('dragover',event=>{if(!hasFiles(event))return;event.preventDefault();event.dataTransfer.dropEffect='copy';$('chat-form').classList.add('drop-target');});
  $('chat-form').addEventListener('dragleave',event=>{if(!$('chat-form').contains(event.relatedTarget))$('chat-form').classList.remove('drop-target');});
  $('chat-form').addEventListener('drop',event=>{$('chat-form').classList.remove('drop-target');if(!hasFiles(event))return;event.preventDefault();attachFiles([...event.dataTransfer.files]);});
  async function loadPrivateSources(){try{const {items}=await api('private-sources');renderPrivateSources(items);}catch(e){tell('private-source-message',e.message);}}
  function renderPrivateSources(items){$('private-source-list').replaceChildren();for(const item of items){const row=el('div',undefined,'setting-row'),copy=el('div',undefined,'tool-copy');copy.append(el('h3',item.host),el('p','連接於 '+new Date(item.addedAt).toLocaleDateString('zh-TW')));const actions=el('div',undefined,'tool-actions');
      actions.append(button('重新登入',()=>api('private-source-login',{host:item.host}).then(()=>tell('private-source-message','已開啟登入視窗，登入完成後關閉視窗即可。')).catch(e=>tell('private-source-message',e.message))),
        button('移除',()=>api('private-source-remove',{host:item.host}).then(r=>{renderPrivateSources(r.items);tell('private-source-message',`已移除 ${item.host}，並清掉這個網站在 App 裡的登入。`);}).catch(e=>tell('private-source-message',e.message))));row.append(copy,actions);$('private-source-list').append(row);}
    if(!items.length)$('private-source-list').append(el('p','尚未連接任何私人網站。'));}
  document.querySelector('[data-setting=sources]')?.addEventListener('click',loadPrivateSources);
  $('private-source-form').onsubmit=async event=>{event.preventDefault();tell('private-source-message','正在檢查網站…');try{const result=await api('private-source-add',{url:$('private-source-url').value});renderPrivateSources(result.items);$('private-source-url').value='';tell('private-source-message',`${result.host} 已通過檢查。請在跳出的視窗登入，完成後關閉視窗即可。`);}catch(e){tell('private-source-message',e.message);}};
  $('reference-url-form').onsubmit=async event=>{event.preventDefault();tell('reference-message','正在讀取公開頁面…');try{const result=await api('references-url',{...target(),url:$('reference-url').value});selectedRefs.add(result.item.id);await loadReferences();tell('reference-message','已讀取並記錄取得時間；內容仍需要查核。');$('reference-url').value='';}catch(e){tell('reference-message',e.message);}};
  function renderJob(){
    const fallback=featureState.needsRestart&&(!featureState.job||!featureState.job.threadId||['running','completed'].includes(featureState.job.status));
    const job=fallback?{status:'unknown'}:featureState.job,box=$('job-card');box.replaceChildren();box.hidden=!selected||selected.demo||!job||['running','completed'].includes(job.status);if(box.hidden)return;
    const confirmedStop=featureState.stopped&&job.reason==='user-stopped',stopPending=featureState.stopRequested&&!featureState.stopped,legacyStopped=featureState.legacyStopped,priorTurnConfirmed=job.reason==='terminal-confirmed';
    const heading=el('div',undefined,'chat-event-line'),copy=el('div',undefined,'chat-event-title');copy.append(icon('info'),el('span',confirmedStop?'已停止這輪':priorTurnConfirmed?'上一輪已結束':stopPending?'停止狀態尚未確認':legacyStopped?'上次工作狀態尚未確認':job.status==='paused'?'上次工作已暫停':job.status==='waiting_quota'?'目前一般額度暫時不可用':job.status==='failed'?'這次工作未完成':'上次回覆尚未確認'));heading.append(copy);box.append(heading);
    const details=el('p',undefined,'chat-event-description'),actions=el('div',undefined,'chat-event-actions');box.append(details,actions);
    if(fallback){details.textContent='沒有自動重送。上次狀態缺少可核對的紀錄，請重新開始後再送出新的要求。';const restart=button('重新開始（保留紀錄）',()=>$('restart-conversation').click());restart.className='job-restart';restart.disabled=$('restart-conversation').disabled;actions.append(restart);return;}
    if(confirmedStop){details.textContent='可以在原對話送出新訊息；上次要求不會自動重送。';return;}
    if(priorTurnConfirmed){details.textContent='可以在原對話送出新訊息；上次回覆未套用到行程。';return;}
    if(activeProvider!=='codex'){
      details.textContent=stopPending?'停止狀態尚未確認。此服務無法讀取中斷的回覆；草稿與聊天紀錄已保留。':'上次回覆尚未確認。此服務無法讀取中斷的回覆；草稿與聊天紀錄已保留。';
      if(featureState.needsRestart){const restart=button('重新開始（保留紀錄）',()=>$('restart-conversation').click());restart.className='job-restart';restart.disabled=$('restart-conversation').disabled;actions.append(restart);}
      return;
    }
    if(job.status==='waiting_quota'){
      details.textContent=job.autoResume?`已開啟自動等待，下次核對：${new Date(job.nextCheck).toLocaleString('zh-TW')}。此旅程開啟且電腦醒著才會繼續。`:'可選擇等待同一帳號恢復；不會切換付費方式。';
      actions.append(button(job.autoResume?'取消自動等待':'額度恢復後繼續',async()=>{try{const result=await api('job-wait',{...target(),enabled:!job.autoResume});featureState.job=result.job;renderJob();}catch(e){notify(e.message);}}));
    }else{
      details.textContent=stopPending||legacyStopped?'沒有自動重送。先確認上一輪是否已結束。':job.status==='unknown'?'沒有自動重送。可以找回上次回覆，確認結果後再繼續。':'這次工作未完成，可嘗試找回上次回覆。';actions.append(button(stopPending?'確認停止狀態':legacyStopped?'確認上次狀態':'找回上次回覆',async()=>{try{const result=await api('job-recover',target());useConversation(result);window.acceptFeatureResult(result);if(result.proposal?.changed)stageProposal(result.proposal);if(result.message)notify(result.message);await refreshJob();}catch(e){notify(e.message);}}));if(featureState.needsRestart){const restart=button('重新開始（保留紀錄）',()=>$('restart-conversation').click());restart.className='job-restart';restart.disabled=$('restart-conversation').disabled;actions.append(restart);}
    }
  }
  async function refreshJob(){if(!selected||selected.demo)return;try{const result=await api('job-status',target());featureState.job=result.job;renderJob();}catch{}}
  setInterval(()=>{if(featureState.job?.status==='waiting_quota')refreshJob();},15000);
  window.travelDesktop?.onJobResult?.(event=>{if(project?.projectId!==event.projectId||selected?.trip.slug!==event.slug)return;if(event.started){aiBusy=true;updateComposer();const node=addMessage({role:'assistant',text:'一般額度已恢復，正在繼續原工作…'});markAIProgress(node);return;}aiBusy=false;document.getElementById('ai-progress')?.remove();useConversation(event.result);window.acceptFeatureResult(event.result);if(event.result.proposal?.changed)stageProposal(event.result.proposal);refreshJob();renderProposal();updateComposer();});
  $('handoff-open').onclick=()=>{const messages=selected?.trip.conversation||[];const text=`旅程：${selected?.trip.title||''}\n目前行程內容以 App 最新檔案為準。任何提案、備份與發布都必須重新確認。\n\n最近討論：\n${messages.slice(-12).map(m=>`${m.role==='user'?'使用者':'助手'}：${m.text.slice(0,1000)}`).join('\n\n')}`;$('handoff-summary').value=text.slice(0,16000);$('handoff-dialog').showModal();};$('close-handoff').onclick=()=>$('handoff-dialog').close();
  $('confirm-handoff').onclick=()=>action('confirm-handoff',async()=>{const result=await api('handoff',{...target(),summary:$('handoff-summary').value});useConversation(result);$('handoff-dialog').close();updateComposer();});
  async function prepareRemote(kind){
    const allTrips=kind==='backup'&&syncScope==='all'&&Boolean(project),projectLevel=kind==='backup'&&!allTrips&&(!selected||selected.demo)&&Boolean(project);
    if(!projectLevel&&!allTrips&&(!selected||selected.demo))throw Error('請先選擇一趟正式旅程。');const id=kind==='backup'?'backup':'publish';tell(id+'-result','正在檢查…');const result=allTrips?await api('backup-prepare',{scope:'all'}):projectLevel?await api('backup-project-prepare'):await api(kind+'-prepare',target()),p=result.preparation;
    $(id+'-cancel').hidden=false;
    const box=$(id+'-review');box.hidden=false;box.replaceChildren();
    if(kind==='backup'){backupToken=p.token;box.append(el('p',`私人專案：${p.repo} · 分支：${p.branch}`),el('p',`本次 ${p.files.length} 個檔案；另有 ${p.unpublishedCommits} 個既有提交會一併推送。`));const list=el('ul');p.files.forEach(f=>list.append(el('li',`${f.status==='deleted'?'刪除':'保存'} · ${f.path}`)));box.append(list);for(const warning of p.warnings||[])box.append(el('p',warning));if(p.firstPush)box.append(el('p','這是第一次推送到這個私人專案，會包含模板本身的所有檔案。'));if(p.unrelatedCommittedFiles?.length){box.append(el('h3','既有未推送提交另包含'));const others=el('ul');p.unrelatedCommittedFiles.slice(0,20).forEach(f=>others.append(el('li',f)));if(p.unrelatedCommittedFiles.length>20)others.append(el('li',`…另外 ${p.unrelatedCommittedFiles.length-20} 個檔案`));box.append(others);}$('backup-confirm').hidden=false;}
    else {publishToken=p.token;box.append(el('p',`網站：${p.name}`),el('p',`Cloudflare：${p.accountName||p.accountId}`),el('p',p.warning));$('publish-ack').checked=false;$('publish-ack-row').hidden=false;$('publish-confirm').hidden=false;$('adoption-confirm').hidden=true;}
    tell(id+'-result','請核對以上資訊，再確認。');
  }
  let setupPending=null;window.resetSetupReview=()=>{setupPending=null;$('setup-confirm').hidden=true;$('setup-review').hidden=true;$('setup-result').textContent='';};
  for(const kind of ['clone','create'])$('setup-'+kind).onclick=()=>action('setup-'+kind,async()=>{
    if(pendingProposal||materializedCandidate)throw Error('請先保存或放棄目前提案。');
    setupPending=null;$('setup-confirm').hidden=true;$('setup-review').hidden=true;
    const value=$('setup-repository').value.trim();if(!value)throw Error('請先填寫專案名稱。');
    const result=await api('project-setup-prepare',{kind,...(kind==='clone'?{repo:value}:{name:value})});if(result.canceled)return;
    setupPending={kind,token:result.preparation.token};const p=result.preparation;
    $('setup-review').replaceChildren(el('p',`GitHub：${p.repo} · 私人`),el('p',`本機位置：${p.destination}`),el('p',p.warning||'只下載到新資料夾，不會推送或覆蓋既有資料。'));
    $('setup-review').hidden=false;$('setup-confirm').hidden=false;$('setup-confirm').textContent=kind==='create'?'確認建立私人 GitHub 專案':'確認下載';tell('setup-result','請核對帳號、專案與存放位置。');
  });
  $('setup-confirm').onclick=()=>action('setup-confirm',async()=>{
    if(!setupPending||aiBusy)return;aiBusy=true;proposalBusy=true;updateComposer();
    try{if(!await flushConversationDraft())return;
    const input=setupPending;setupPending=null;$('setup-confirm').hidden=true;tell('setup-result','正在處理，請稍候…');
    const response=await api('project-setup-confirm',input);const result=response.result;
    tell('setup-result',result.message||result.warning||'私人專案已下載並連接。');
    if(result.ready){await reloadProject(response);notify(result.warning||'已連接私人專案，可選擇或新增旅程。');}
    }finally{aiBusy=false;proposalBusy=false;updateComposer();}
  });
  $('archive-export').onclick=()=>action('archive-export',async()=>{const result=await api('archive-export',target());if(!result.canceled)tell('backup-result',`本機備份已匯出，共 ${result.archive.count} 個檔案；尚未異地備份。`);});
  $('archive-import').onclick=()=>action('archive-import',async()=>{const result=await api('archive-import');if(!result.canceled){await reloadProject(result);closeSettings();notify('已還原為另一趟旅程，原旅程保持原樣。');}});
  let identityToken=null;
  $('identity-prepare').onclick=()=>action('identity-prepare',async()=>{$('identity-card').hidden=false;const {preparation:p}=await api('git-identity-prepare');identityToken=p.token;$('identity-review').replaceChildren(el('p',`專案：${p.repo}`),el('p',`${p.author.name} · ${p.author.email}`),el('p',p.warning));$('identity-review').hidden=false;$('identity-confirm').hidden=false;});
  $('identity-confirm').onclick=()=>action('identity-confirm',async()=>{if(!identityToken)return;const token=identityToken;identityToken=null;$('identity-confirm').hidden=true;const {result}=await api('git-identity-confirm',{token});tell('identity-result',result.message);});
  // 缺少提交者名稱時才顯示「備份署名」。
  // 錯誤直接寫在卡片裡（不只跳通知），並在缺少提交者名稱時才顯示「備份署名」。
  $('backup-prepare').onclick=()=>action('backup-prepare',async()=>{try{await prepareRemote('backup');}catch(e){if(/提交作者/.test(e.message||''))$('identity-card').hidden=false;tell('backup-result',e.message||'檢查沒有完成，請再試一次。');resetReview('backup');throw e;}});
  $('backup-confirm').onclick=()=>action('backup-confirm',async()=>{const token=backupToken;backupToken=null;$('backup-confirm').hidden=true;const {result}=await api('backup-confirm',{token});tell('backup-result',result.message);$('backup-cancel').hidden=true;$('backup-review').hidden=true;window.refreshBackupStatus();window.renderSync();});
  $('publish-prepare').onclick=()=>action('publish-prepare',async()=>{try{await prepareRemote('publish');}catch(e){tell('publish-result',e.message||'檢查沒有完成，請再試一次。');resetReview('publish');throw e;}});
  // ---------- 備份與發布：目前旅程下拉、狀態與第一次發布清單 ----------
  let syncScope='trip',syncRequest=0;
  const syncDate=iso=>{try{const d=new Date(iso);return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}catch{return '';}};
  function backupWords(st){if(!st)return {tone:'muted',head:'無法讀取備份狀態',sub:'請確認專案資料夾還在，或到「專案管理」重新連接。'};if(st.neverBackedUp)return {tone:'warn',head:'還沒有備份到 GitHub',sub:'第一次備份會把專案推送到你的私人 GitHub。'};if(st.pendingFiles>0)return {tone:'warn',head:`有 ${st.pendingFiles} 個檔案還沒備份`,sub:'備份會先列出這些檔案，你確認後才推送。'};if(st.unpushedCommits>0)return {tone:'warn',head:`有 ${st.unpushedCommits} 個提交還沒推送`,sub:'例如專案更新；備份時會一起推送。'};return {tone:'ok',head:'已經是最新的備份',sub:'這台電腦的內容都已經在你的私人 GitHub。'};}
  function setStatus(prefix,{tone,head,sub}){$(prefix+'-dot').dataset.tone=tone;$(prefix+'-headline').textContent=head;$(prefix+'-sub').textContent=sub;}
  function resetReview(kind){$(kind+'-review').hidden=true;$(kind+'-review').replaceChildren();$(kind+'-confirm').hidden=true;$(kind+'-cancel').hidden=true;if(kind==='publish'){$('publish-ack-row').hidden=true;$('adoption-confirm').hidden=true;publishToken=null;adoptionToken=null;}else backupToken=null;}
  $('backup-cancel').onclick=()=>{resetReview('backup');tell('backup-result','已取消，沒有推送任何東西。');};
  $('publish-cancel').onclick=()=>{resetReview('publish');tell('publish-result','已取消，網站沒有變動。');};
  window.renderSync=async()=>{
    if(!window.travelDesktop||$('setting-sync').hidden)return;
    const request=++syncRequest,tab=ui.syncTab,real=selected&&!selected.demo?selected.trip:null;
    let overview=null;try{overview=(await api('sync-overview',{slug:real?.slug})).overview;}catch{}
    if(request!==syncRequest)return;
    const menu=$('sync-trip-select');menu.replaceChildren();
    if(!project||!overview){menu.append(el('option','尚未連接專案'));menu.disabled=true;setStatus('backup',{tone:'muted',head:'尚未連接私人專案',sub:'先到「專案管理」連接或建立專案。'});setStatus('publish',{tone:'muted',head:'尚未連接私人專案',sub:''});return;}
    menu.disabled=false;
    if(tab==='backup'){const o=el('option','整個專案（所有旅程）');o.value='*';menu.append(o);}
    for(const t of overview.trips){const w=backupWords(t.backup),o=el('option',t.title+(tab==='backup'?' · '+w.head:''));o.value=t.slug;menu.append(o);}
    if(!overview.trips.length&&tab==='publish'){menu.append(el('option','還沒有旅程'));menu.disabled=true;}
    menu.value=tab==='backup'&&(syncScope==='all'||!real)?'*':real?.slug||'';
    // 備份
    const scopeAll=tab==='backup'&&(syncScope==='all'||!real);const st=scopeAll?(overview.trips.length?overview.all:overview.project):overview.trips.find(t=>t.slug===real?.slug)?.backup;
    const words=backupWords(st);setStatus('backup',{...words,sub:(scopeAll?'範圍：所有旅程。':'範圍：這趟旅程。')+words.sub});
    $('backup-prepare').textContent=scopeAll?'備份所有旅程到 GitHub':'備份到 GitHub';
    // 發布
    const checklist=$('publish-checklist');checklist.replaceChildren();$('publish-open-site').hidden=true;
    if(!real){setStatus('publish',{tone:'muted',head:'請先選擇一趟旅程',sub:'網站是一趟旅程一個網址。'});$('publish-prepare').disabled=true;return;}
    $('publish-prepare').disabled=false;
    const cf=await api('auth-status',{provider:'cloudflare'}).then(r=>r.auth.connected).catch(()=>false);if(request!==syncRequest)return;
    const site=overview.site;
    if(site?.url){setStatus('publish',{tone:'ok',head:'網站已上線',sub:`${site.url.replace(/^https:\/\//,'')} · 上次發布 ${syncDate(site.publishedAt)}${site.source==='cli'?'（之前用終端機發布）':''}`});$('publish-open-site').hidden=false;$('publish-open-site').onclick=()=>api('open-link',{url:site.url}).catch(e=>notify(e.message));}
    else setStatus('publish',{tone:'muted',head:'這趟旅程還沒有網站',sub:'第一次發布前，先完成下面的步驟。'});
    const step=(done,text,action)=>{const row=el('div',undefined,'sync-step');row.dataset.done=String(done);row.append(el('span',done?'✓':'','sync-step-mark'),el('span',text));if(!done&&action)row.append(action);checklist.append(row);};
    step(cf,cf?'Cloudflare 已連接':'連接 Cloudflare（免費帳號，在瀏覽器登入一次）',cf?null:button('連接 Cloudflare',()=>$('cloudflare-connect').click()));
    step(overview.previewSeen,overview.previewSeen?'已在右側預覽看過目前版本':'在右側預覽看過目前版本',overview.previewSeen?null:button('打開預覽',()=>{closeSettings();setPreview(true);}));
    // 不停用按鈕：按下時由後端檢查（登入、預覽），缺什麼直接寫在卡片裡。
  };
  $('sync-trip-select').onchange=async()=>{
    const value=$('sync-trip-select').value;resetReview('backup');resetReview('publish');
    if(value==='*'){syncScope='all';window.renderSync();return;}
    syncScope='trip';const trip=project?.trips.find(t=>t.slug===value);
    // 切換 = 在左側列表點這趟旅程；AI 回覆中或有提案時 selectTrip 會擋下並說明。
    if(trip&&selected?.trip!==trip){await selectTrip(trip);await selectionReady;}
    window.renderSync();
  };
  $('publish-confirm').onclick=()=>action('publish-confirm',async()=>{if(!$('publish-ack').checked)throw Error('請先勾選公開網站提醒。');const token=publishToken;publishToken=null;$('publish-confirm').hidden=true;const {result}=await api('publish-confirm',{token});tell('publish-result',result.message);$('publish-ack-row').hidden=true;$('publish-cancel').hidden=true;$('publish-review').hidden=true;window.renderSync();if(result.code==='WORKERS_SUBDOMAIN_REQUIRED')$('publish-result').append(document.createTextNode(' '),button('打開 Cloudflare 設定',()=>api('open-link',{url:'https://dash.cloudflare.com/?to=/:account/workers-and-pages'})));if(result.url)$('publish-result').append(document.createTextNode(' '),button('開啟網站',()=>api('open-link',{url:result.url})));});
  $('adoption-prepare').onclick=()=>action('adoption-prepare',async()=>{const {preparation:p}=await api('adoption-prepare',target());adoptionToken=p.token;const box=$('publish-review');box.hidden=false;box.replaceChildren(el('p',`網站：${p.name}`),el('p',`帳號：${p.accountName||p.accountId}`),el('p',`目前版本：${p.versionId}`),el('p',p.warning));$('adoption-confirm').hidden=false;$('publish-confirm').hidden=true;});
  $('adoption-confirm').onclick=()=>action('adoption-confirm',async()=>{const {result}=await api('adoption-confirm',{token:adoptionToken});adoptionToken=null;$('adoption-confirm').hidden=true;tell('publish-result',result.message||'已記錄網站歸屬，尚未發布。');});
  $('codex-more').onclick=e=>openActionMenu(e.currentTarget,[
    {label:'重新核對登入',icon:'chat',disabled:aiBusy,action:()=>$('codex-connect').click()},
    {label:'更換帳號',icon:'chat',disabled:aiBusy||accountState.state!=='connected'||accountState.capabilities?.switchAccount===false,action:()=>$('codex-switch').click()},
    ...(accountState.state==='waiting-login'?[{label:'取消登入',icon:'close',action:()=>$('codex-cancel').click()},...(activeProvider==='codex'?[{label:'複製登入連結',icon:'external',action:()=>$('codex-copy-link').click()}]:[])]:[])
  ]);
  for(const provider of ['github','cloudflare'])$(provider+'-more').onclick=e=>openActionMenu(e.currentTarget,[
    {label:'重新核對連線',icon:'chat',action:()=>$(provider+'-status').click()},
    {label:'重新登入',icon:'external',disabled:aiBusy,action:()=>$(provider+'-connect').click()},
    {label:'取消登入',icon:'close',disabled:$(provider+'-cancel').hidden,action:()=>$(provider+'-cancel').click()},
    ...(provider==='github'?[{separator:true},{label:'設定備份署名…',icon:'settings',disabled:!project,action:()=>$('identity-prepare').click()}]:[])
  ]);
  async function authStatus(provider){const {auth}=await api('auth-status',{provider});$(provider+'-connect').hidden=auth.connected;$(provider+'-auth-badge').textContent=auth.connected?'已連接':'未連接';$(provider+'-auth-badge').dataset.status=auth.connected?'ready':'missing';$(provider+'-auth-message').hidden=auth.connected;tell(provider+'-auth-message',auth.connected?'已連接官方工具帳號。':'尚未連接，請完成官方頁面授權。');if(provider==='cloudflare'&&auth.connected)await cloudflareAccounts();return auth;}
  async function cloudflareAccounts(){const {selection}=await api('cloudflare-accounts');$('cloudflare-account').replaceChildren();const none=el('option','依登入帳號核對');none.value='';$('cloudflare-account').append(none);for(const a of selection.accounts){const option=el('option',a.name);option.value=a.id;$('cloudflare-account').append(option);}$('cloudflare-account').value=selection.selectedAccountId||'';}
  for(const provider of ['github','cloudflare']){
    $(provider+'-connect').onclick=()=>action(provider+'-connect',async()=>{const {auth}=await api('auth-start',{provider});tell(provider+'-auth-message',auth.message||'請在官方瀏覽器頁面完成授權。');$(provider+'-cancel').hidden=!auth.started;});
    $(provider+'-cancel').onclick=()=>action(provider+'-cancel',async()=>{await api('auth-cancel',{provider});$(provider+'-cancel').hidden=true;await authStatus(provider);});
    $(provider+'-status').onclick=()=>action(provider+'-status',()=>authStatus(provider));
  }
  $('cloudflare-account').onchange=async()=>{try{await api('cloudflare-account',{id:$('cloudflare-account').value||null});publishToken=null;adoptionToken=null;$('publish-confirm').hidden=true;$('adoption-confirm').hidden=true;tell('publish-result','帳號已選取，請重新核對發布目標。');}catch(e){notify(e.message);}};
  window.travelDesktop?.onAuthProgress?.(event=>{const provider=event.provider;if(!['github','cloudflare'].includes(provider))return;$(provider+'-auth-message').hidden=false;tell(provider+'-auth-message',(event.message||'')+(event.deviceCode?` 一次性代碼：${event.deviceCode}`:''));if(['connected','canceled','failed','completed','timed-out','needs-login'].includes(event.state)){$(provider+'-cancel').hidden=true;authStatus(provider).catch(e=>notify(e.message));}});
  let toolPlan=null;
  const toolNames={gh:'GitHub',git:'Git',node:'Node.js',codex:'Codex',claude:'Claude Code',gemini:'Gemini',wrangler:'Cloudflare'};
  const toolDescriptions={gh:'備份旅程、下載與建立私人專案。',git:'保存檔案版本與同步備份。',node:'執行部分 AI 工具及備份檢查。',codex:'以 ChatGPT 帳號規劃與調整旅程。',claude:'使用 Claude Code 官方登入。',gemini:'使用 Google 官方登入。',wrangler:'發布旅程網站，已隨 App 提供。'};
  async function prepareTool(id){const {preparation:p}=await api('tool-prepare',{id});toolPlan=p;$('tool-setup-title').textContent='準備 '+(toolNames[id]||id);$('tool-setup-steps').replaceChildren(...p.steps.map(step=>el('li',step)));$('tool-command').textContent=p.commandPreview||'';$('tool-command-details').hidden=!p.commandPreview;$('tool-setup-status').textContent='確認後才會開始，不會要求你把密碼貼進 App。';$('tool-setup-confirm').hidden=false;$('tool-setup-confirm').textContent=p.method==='terminal'?'開啟安裝視窗':['managed-download','managed-npm','managed-node'].includes(p.method)?'下載並安裝':'檢查內建工具';$('tool-setup-dialog').showModal();}
  window.openToolSetup=id=>prepareTool(id).catch(e=>notify(e.message));
  async function environment(){const result=await api('environment');$('environment-list').replaceChildren();for(const tool of result.tools){if(tool.id==='gemini')continue;const row=el('div',undefined,'setting-row'),copy=el('div',undefined,'tool-copy'),title=el('div',undefined,'tool-title');title.append(el('h3',toolNames[tool.id]||tool.id));if(tool.version)title.append(el('span',tool.version,'tool-version'));const badge=el('span',tool.status==='ready'?(['codex','claude','gemini'].includes(tool.id)?'已找到':'已就緒'):tool.status==='missing'?'待安裝':'尚不相容','status-pill');badge.dataset.status=tool.status;title.append(badge);copy.append(title,el('p',toolDescriptions[tool.id]||''));const actions=el('div',undefined,'tool-actions');
    if(tool.status!=='ready')actions.append(button('設定引導',()=>prepareTool(tool.id).catch(e=>notify(e.message))));
    else if(tool.id==='gh')actions.append(button('連接帳號',()=>settingTab('backup')));
    else if(tool.id==='wrangler')actions.append(button('連接帳號',()=>settingTab('publish')));
    else if(['codex','claude','gemini'].includes(tool.id))actions.append(button('AI 設定',()=>{settingTab('ai');document.getElementById('provider-row-'+tool.id)?.scrollIntoView({block:'nearest'});}));
    actions.append(moreButton((toolNames[tool.id]||tool.id)+'工具操作',()=>[{label:'重新設定',icon:'settings',action:()=>prepareTool(tool.id)},...(tool.setupUrl?[{label:'官方說明',icon:'external',action:()=>api('open-link',{url:tool.setupUrl})}]:[])]));row.append(copy,actions);$('environment-list').append(row);}}
  $('close-tool-setup').onclick=()=>$('tool-setup-dialog').close();
  $('tool-setup-confirm').onclick=()=>action('tool-setup-confirm',async()=>{if(!toolPlan)return;const token=toolPlan.token;toolPlan=null;const {result}=await api('tool-install',{token,confirmed:true});$('tool-setup-status').textContent=result.message||({installed:'安裝完成，已驗證版本。','terminal-opened':'請依系統安裝視窗完成，然後回到這裡重新檢查。','dialog-opened':'已開啟 Apple 的安裝視窗，請按「安裝」；完成後回到這裡重新檢查。',ready:'工具已就緒，可回設定連接帳號。','repair-app':'內建工具不完整，請重新安裝 App。'})[result.state]||'請重新檢查工具狀態。';$('tool-setup-confirm').hidden=true;await environment();});
  $('tool-setup-recheck').onclick=()=>action('tool-setup-recheck',async()=>{await environment();$('tool-setup-dialog').close();});
  window.travelDesktop?.onToolProgress?.(event=>{$('tool-setup-status').textContent=event.message||'正在處理…';});
  $('check-environment').onclick=()=>action('check-environment',environment);
  let currentUpdate={state:'idle'};
  function renderUpdate(update){
    currentUpdate=update;const release=update.release||update;const automatic=update.capability?.automatic===true;
    const labels={idle:'尚未檢查版本。',checking:'正在檢查官方版本…',current:'目前已是最新版本。',unpublished:'尚未發布可下載的正式桌面版本。',available:`可更新至 ${release.version||''}`,downloading:`正在下載更新${Number.isFinite(update.progress)?' · '+Math.round(update.progress)+'%':''}`,downloaded:'更新已下載。按「保存並重新啟動更新」完成安裝。',installing:'正在保存草稿並完成目前作業，接著重新啟動更新…',unavailable:'這個更新目前不適用於這台電腦。',error:'更新未完成。原有程式與行程保留，請稍後重試。'};
    tell('update-result',update.state==='manual-only'?(release.state==='unpublished'?labels.unpublished:release.state==='available'?`可下載 ${release.version}，請從官方版本頁手動更新。`:release.state==='current'?labels.current:'這個安裝版本目前使用手動更新。'):labels[update.state]||'請重新檢查更新。');
    tell('update-note',update.state==='manual-only'?'目前是開發版、未簽章版或可攜版；安裝正式簽章版本後，才能在 App 內下載並重新啟動更新。':'檢查不會自動下載或安裝。下載會驗證完整性，安裝時保留原生簽章檢查；更新前先保存草稿。');
    $('check-updates').disabled=['checking','downloading','installing'].includes(update.state);
    $('download-update').hidden=!(automatic&&update.state==='available');$('download-update').disabled=update.state!=='available';
    $('install-update').hidden=!['downloaded','installing'].includes(update.state);$('install-update').disabled=update.state!=='downloaded'||aiBusy;
    $('update-progress').hidden=update.state!=='downloading';if(Number.isFinite(update.progress))$('update-progress').value=update.progress;else $('update-progress').removeAttribute('value');
    $('update-links').replaceChildren();if(release.url)$('update-links').append(button('查看官方版本',()=>api('open-link',{url:release.url})));
  }
  async function updateAction(name){try{if(name==='updates-install'&&!await flushConversationDraft()){notify('草稿尚未保存，請先確認儲存狀態。');return;}const {update}=await api(name);if(!(name==='updates-install'&&currentUpdate.state==='error'))renderUpdate(update);}catch(e){notify(e.message||'更新未完成');renderUpdate({...currentUpdate,state:'error'});}}
  $('check-updates').onclick=()=>updateAction('updates');$('download-update').onclick=()=>updateAction('updates-download');$('install-update').onclick=()=>updateAction('updates-install');
  window.travelDesktop?.onUpdateState?.(update=>{renderUpdate(update);if(update.state==='error')notify('更新未完成，原有程式與行程保留。');});

  // 專案引擎更新：狀態不連網；按下「更新專案」才向 GitHub 取得模板並預演合併。
  let projectUpdatePlan=null,projectUpdateRequest=0;
  let checkedProjectRoot=null;
  window.renderProjectUpdate=async()=>{
    if(window.travelDesktop&&(project?.root||null)!==checkedProjectRoot){checkedProjectRoot=project?.root||null;window.travelDesktop.feature('project-open-check').then(r=>{if(r.ok&&r.warning)notify(r.warning);}).catch(()=>{});}
    const box=$('project-update');if(!project||!window.travelDesktop){box.hidden=true;return;}
    // 只在專案設定畫面開著時查（renderProject 很常被呼叫）。
    if($('settings').hidden||$('setting-projects').hidden)return;
    const request=++projectUpdateRequest;let update;try{update=(await api('project-update-status')).update;}catch{if(request===projectUpdateRequest)box.hidden=true;return;}
    if(request!==projectUpdateRequest)return;
    const notes=[];if(update.state==='update-available'){if(update.projectVersion&&update.appVersion&&update.projectVersion!==update.appVersion)notes.push(`專案引擎 ${update.projectVersion}，App 內建 ${update.appVersion}。`);if(!update.trusted)notes.push('備份保護程式需要更新，更新前無法備份到 GitHub。');if(update.migrateTrips.length)notes.push(`有 ${update.migrateTrips.length} 趟行程的資料格式需要升級。`);}
    if(update.state==='app-older')notes.push('這個專案比 App 內建的版本還新，請先到「工具與更新」更新 Travel Planner App。');
    box.hidden=update.state==='current';$('project-update-text').textContent=notes.join('');$('project-update-open').hidden=update.state!=='update-available';box.dataset.state=update.state;
  };
  function projectUpdateReview(plan){
    const root=document.createElement('div');
    root.append(el('p',plan.upToDate?'模板引擎已是最新，只需要升級行程資料格式。':`專案引擎 ${plan.fromVersion||'未知'} → ${plan.toVersion||'未知'}，共 ${plan.changedFiles} 個引擎檔案。`));
    for(const entry of plan.highlights||[]){root.append(el('strong',`${entry.version}（${entry.date}）${entry.needsMigrate?' · 需要升級資料格式':''}`));const list=document.createElement('ul');for(const line of entry.highlights)list.append(el('li',line));root.append(list);}
    if(plan.migrateTrips?.length)root.append(el('p','更新後會升級這些行程的資料格式：'+plan.migrateTrips.join('、')+'。原檔會另存 .bak。'));
    return root;
  }
  $('project-update-open').onclick=async()=>{
    if(aiBusy||pendingProposal||materializedCandidate){notify('請先停止 AI 工作，或確認／放棄目前的提案，再更新專案。');return;}
    $('project-update-open').disabled=true;$('project-update-open').textContent='正在從 GitHub 檢查…';
    try{const {update}=await api('project-update-prepare');if(!update.token){notify(update.message);window.renderProjectUpdate();return;}
      projectUpdatePlan=update;$('project-update-review').replaceChildren(projectUpdateReview(update));$('project-update-error').hidden=true;$('confirm-project-update').disabled=false;$('project-update-dialog').showModal();}
    catch(e){notify(e.message);}finally{$('project-update-open').disabled=false;$('project-update-open').textContent='更新專案…';}
  };
  $('cancel-project-update').onclick=()=>{projectUpdatePlan=null;$('project-update-dialog').close();};
  $('confirm-project-update').onclick=async()=>{
    if(!projectUpdatePlan)return;$('confirm-project-update').disabled=true;$('project-update-error').hidden=true;
    try{const response=await api('project-update-confirm',{token:projectUpdatePlan.token});projectUpdatePlan=null;$('project-update-dialog').close();await reloadProject(response);window.refreshBackupStatus();
      const r=response.result,parts=[r.merged?'專案已更新到 App 內建的引擎版本。':'專案引擎已是最新。'];if(r.migrated.length)parts.push(`已升級 ${r.migrated.length} 趟行程的資料格式。`);parts.push(r.status.trusted?'下次私人備份會一起推送這次更新。':'備份保護程式仍和 App 不同，請更新 App 後再備份。');notify(parts.join(''));}
    catch(e){$('project-update-error').textContent=e.message;$('project-update-error').hidden=false;$('confirm-project-update').disabled=false;}
  };
  window.onFeatureSetting=section=>{if(section==='projects')window.renderProjectUpdate();if(section==='backup')authStatus('github').catch(()=>{});if(section==='publish')authStatus('cloudflare').catch(()=>{});if(section==='tools'){environment().catch(e=>notify(e.message));api('updates-status').then(({update})=>renderUpdate(update)).catch(()=>{});}if(['backup','publish'].includes(section)){tell(section+'-result','');window.renderSync();}};
})();
