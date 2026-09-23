/* Settings distinguish future defaults, independent accounts and the active chat. */
(() => {
  const catalog={codex:{name:'Codex',hint:'使用 ChatGPT 帳號，登入保存在 App。'},claude:{name:'Claude Code',hint:'支援 Pro／Max 帳號，使用獨立登入。'}};
  const records=new Map(),busy=new Set();let defaults={provider:'codex',models:{}},modelRequest=0,loadingAccounts=false,savingDefaults=false;
  const api=async(action,input={})=>{if(!window.travelDesktop)throw Error('請在桌面 App 進行設定。');const result=await window.travelDesktop.feature(action,input);if(!result.ok)throw Error(result.message||'設定未完成，請重試。');return result;};
  const stateLabels={checking:'檢查中',disconnected:'尚未檢查','needs-login':'未連接',connected:'已連接','waiting-login':'等待授權','login-failed':'登入未完成','switch-failed':'需要確認',unavailable:'待安裝',error:'需要確認'};
  function renderProvider(id){
    const value=records.get(id)||{state:'disconnected'},old=document.getElementById('provider-row-'+id),focused=old?.contains(document.activeElement)?document.activeElement.dataset.providerAction:null;
    const row=el('div',undefined,'provider-row setting-row');row.id='provider-row-'+id;row.dataset.provider=id;
    const content=el('div',undefined,'setting-copy'),heading=el('div',undefined,'inline-heading'),title=el('h3',catalog[id].name),badge=el('span',value.cachedAuth?'登入已保存':stateLabels[value.state]||'需要確認','status-pill');badge.dataset.status=value.state==='connected'?'ready':value.state;heading.append(title,badge);content.append(heading);
    const text=value.message||(value.state==='connected'?(value.label||'登入已保存'):value.state==='waiting-login'?'請在官方頁面完成登入，完成後會自動更新。':catalog[id].hint);
    const description=el('p',text);description.id='provider-description-'+id;description.title=text;content.append(description);
    const actions=el('div',undefined,'settings-actions'),connect=el('button',value.state==='unavailable'?'設定工具':value.state==='waiting-login'?'重新確認':'連接');connect.dataset.providerAction='connect';connect.disabled=busy.has(id);connect.hidden=value.state==='connected';connect.setAttribute('aria-describedby',description.id);connect.onclick=()=>value.state==='unavailable'?settingTab('tools'):runAccountAction(id,value.state==='waiting-login'?'check':'login');
    const more=moreButton(catalog[id].name+' 帳號操作',()=>[
      {label:'重新核對登入',icon:'chat',disabled:busy.has(id),action:()=>runAccountAction(id,'check')},
      {label:'更換帳號',icon:'chat',disabled:busy.has(id)||value.state!=='connected'||value.capabilities?.switchAccount===false,action:()=>runAccountAction(id,'switch')},
      ...(value.state==='waiting-login'?[{label:'取消登入',icon:'close',disabled:busy.has(id),action:()=>runAccountAction(id,'cancel')},...(id==='codex'?[{label:'複製登入連結',icon:'external',action:()=>runAccountAction(id,'copy-link')}]:[])]:[]),
      {separator:true},{label:'工具設定',icon:'settings',action:()=>settingTab('tools')}
    ]);more.dataset.providerAction='more';actions.append(connect,more);row.append(content,actions);if(old)old.replaceWith(row);else $('provider-accounts').append(row);if(focused)row.querySelector('[data-provider-action="'+focused+'"]')?.focus({preventScroll:true});
  }
  function syncProviderOptions(){
    for(const select of [$('chat-provider'),$('settings-provider'),$('provider-switch-choice')]){
      select.querySelector('option[value="gemini"]').hidden=true;
      for(const id of Object.keys(catalog))select.querySelector(`option[value="${id}"]`).hidden=records.get(id)?.state!=='connected';
    }
    $('chat-provider').value=records.get(activeProvider)?.state==='connected'?activeProvider:'';
    $('settings-provider').value=records.get(defaults.provider)?.state==='connected'?defaults.provider:'';
  }
  window.refreshProviderOptions=syncProviderOptions;
  window.updateProviderRow=value=>{if(!catalog[value.provider])return;const previous=records.get(value.provider);records.set(value.provider,value);renderProvider(value.provider);syncProviderOptions();if(previous?.state==='waiting-login'&&value.state==='connected'&&defaults.provider===value.provider)loadDefaultModels();};
  window.travelDesktop?.onProviderAccount?.(window.updateProviderRow);
  async function runAccountAction(id,action){if(busy.has(id))return;busy.add(id);renderProvider(id);try{const result=await api('provider-account-action',{id,action});window.updateProviderRow(result.account);if(result.copied)notify('登入連結已複製。');if(result.account.state==='connected'&&defaults.provider===id)await loadDefaultModels();}catch(e){notify(e.message);}finally{busy.delete(id);renderProvider(id);}}
  function renderDefaults(){syncProviderOptions();}
  let defaultModels=[];
  function renderDefaultEffort(){
    const field=$('defaults-effort-field'),select=$('defaults-effort');select.replaceChildren();
    const model=defaultModels.find(m=>m.id===$('defaults-model').value)||defaultModels.find(m=>m.isDefault)||defaultModels[0];
    const efforts=(model?.effort||[]).map(e=>typeof e==='string'?e:e.reasoningEffort).filter(Boolean);
    field.hidden=defaults.provider!=='codex'||!efforts.length;
    const names={none:'不額外思考',minimal:'最少',low:'低',medium:'中',high:'高',xhigh:'更高',max:'最高'};
    for(const effort of efforts){const option=el('option',names[effort]||effort);option.value=effort;select.append(option);}
    select.value=efforts.includes(defaults.effort)?defaults.effort:efforts.includes(model?.defaultEffort)?model.defaultEffort:efforts[0]||'';
    $('defaults-effort-note').textContent=efforts.includes(defaults.effort)?'只套用新對話；仍可在聊天欄逐則調整。':'此模型不支援原本的強度；選擇並保存可用的強度。';
  }
  async function loadDefaultModels(){
    const request=++modelRequest,id=defaults.provider,select=$('defaults-model');defaultModels=[];select.disabled=true;select.replaceChildren();const automatic=el('option','使用服務預設模型');automatic.value='';select.append(automatic);
    try{const result=await api('provider-models',{id});if(request!==modelRequest||id!==defaults.provider)return;defaultModels=result.models;for(const model of result.models){const option=el('option',model.name||model.id);option.value=model.id;select.append(option);}const saved=defaults.models[id]||'';if(saved&&![...select.options].some(o=>o.value===saved)){const option=el('option','已保存：'+saved);option.value=saved;select.append(option);}select.value=saved;renderDefaultEffort();}
    catch{if(request===modelRequest)$('defaults-status').textContent='連接後可選模型';}
    finally{if(request===modelRequest){select.disabled=savingDefaults;renderDefaultEffort();}}
  }
  async function saveDefaults(input){if(savingDefaults)return;savingDefaults=true;$('settings-provider').disabled=true;$('defaults-model').disabled=true;$('defaults-effort').disabled=true;$('defaults-status').textContent='保存中…';try{const result=await api('ai-defaults-set',input);defaults=result.defaults;renderDefaults();await loadDefaultModels();$('defaults-status').textContent='已保存';}catch(e){renderDefaults();await loadDefaultModels();$('defaults-status').textContent='未保存';notify(e.message);}finally{savingDefaults=false;$('settings-provider').disabled=false;$('defaults-model').disabled=false;$('defaults-effort').disabled=false;}}
  $('settings-provider').onchange=e=>saveDefaults({provider:e.target.value});
  $('defaults-model').onchange=e=>{renderDefaultEffort();saveDefaults({provider:defaults.provider,model:e.target.value,...(defaults.provider==='codex'&&!$('defaults-effort-field').hidden?{effort:$('defaults-effort').value}:{})});};
  $('defaults-effort').onchange=e=>saveDefaults({provider:defaults.provider,effort:e.target.value});
  async function loadAccounts(){if(loadingAccounts)return;loadingAccounts=true;try{const result=await api('provider-accounts');defaults=result.defaults;renderDefaults();result.accounts.forEach(window.updateProviderRow);await Promise.all([loadDefaultModels(),...Object.keys(catalog).map(id=>runAccountAction(id,'check'))]);}catch(e){notify(e.message);}finally{loadingAccounts=false;}}
  Object.keys(catalog).forEach(renderProvider);syncProviderOptions();
  if(window.travelDesktop)loadAccounts().catch(e=>notify(e.message));
  const previous=window.onFeatureSetting;window.onFeatureSetting=section=>{previous?.(section);if(section==='ai')loadAccounts();};
  $('open-project-github').onclick=()=>{const open=$('project-github-options').hidden;$('project-github-options').hidden=!open;$('open-project-github').setAttribute('aria-expanded',String(open));if(open)$('setup-repository').focus();};
  $('setup-kind').onchange=()=>{const create=$('setup-kind').value==='create';$('setup-clone').hidden=create;$('setup-create').hidden=!create;$('setup-repository-label').textContent=create?'新專案名稱':'GitHub 專案';$('setup-repository').placeholder=create?'travel-planner-trips':'your-name/travel-planner-trips';window.resetSetupReview?.();};
  $('setup-repository').addEventListener('input',()=>window.resetSetupReview?.());
  const tabs=[...document.querySelectorAll('[data-sync-tab]')];tabs.forEach((button,index)=>{button.onclick=()=>settingTab(button.dataset.syncTab);button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].click();tabs[next].focus();};});
})();
