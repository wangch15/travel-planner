const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { CodexEditor } = require('../editor.cjs');
const { CONFIG } = require('../policy.cjs');

function fixture({ usage = true, complete = true, answer } = {}) {
  const day = { id:1,date:'10/1',title:'Original',theme:'theme',lead:'lead',color:'#123456',stops:[] };
  const source = `module.exports = ${JSON.stringify({DAYS:[day]})};`;
  const calls = [];
  const transport = new EventEmitter(); transport.state='ready';
  transport.request = async (method, params) => {
    calls.push(method);
    if (method==='config/read') return {config:{web_search:'disabled',default_permissions:'travel_preview',model_provider:'openai',project_doc_max_bytes:0,mcp_servers:{},features:Object.fromEntries([...CONFIG.matchAll(/^(\w+) = false$/gm)].map(match=>[match[1],false]))}};
    if (method==='account/rateLimits/read') return {ordinaryUsageAllowed:usage};
    if (method==='thread/start') return {thread:{id:'thread'},modelProvider:'openai',approvalPolicy:'never'};
    if (method==='turn/start') {
      queueMicrotask(()=>{
        transport.emit('notification','turn/started',{threadId:'thread',turn:{id:'turn'}});
        if (complete) {
          transport.emit('notification','item/completed',{threadId:'thread',turnId:'turn',item:{type:'agentMessage',phase:'final_answer',text:JSON.stringify(answer || {summary:'title changed',replacementDayJson:JSON.stringify({...day,title:'New title'})})}});
          transport.emit('notification','turn/completed',{threadId:'thread',turn:{id:'turn',status:'completed'}});
        }
        transport.emit('started');
      });
      return {turn:{id:'turn'}};
    }
    if (method==='turn/interrupt') { transport.emit('notification','turn/completed',{threadId:'thread',turn:{id:'turn',status:'interrupted'}}); return {}; }
    throw Error('unexpected method '+method);
  };
  const account={transport,runtime:{work:'/fake'},connect:async()=>({state:'connected'}),models:async()=>[{id:'server-model',isDefault:true}]};
  return {editor:new CodexEditor(account),transport,calls,snapshot:{dataSource:source,trip:{PLACES:{}}}};
}
test('uses fresh permission/usage checks and accepts completion arriving before turn acknowledgement',async()=>{
  const f=fixture(); const result=await f.editor.generate({snapshot:f.snapshot,dayId:1,text:'change title'});
  assert.equal(result.replacementDay.title,'New title'); assert.equal(result.model,'server-model');
  assert.deepEqual(f.calls,['config/read','account/rateLimits/read','thread/start','turn/start']);
});
test('whole-trip discussion sends all raw days with only referenced place descriptions and returns no replacement',async()=>{
  const f=fixture({answer:{summary:'建議每天留一段休息時間。'}});
  const days=[
    {id:1,date:'10/1',stops:[{place:'first'}],alts:[{place:'alternate'}]},
    {id:2,date:'10/2',stops:[{place:'second'}],alts:[{places:['another','missing']}]},
  ];
  f.snapshot.dataSource=`module.exports = ${JSON.stringify({DAYS:days})};`;
  f.snapshot.trip.PLACES={
    first:{name:'First',cat:'sight',note:'Known note',gq:'PRIVATE_ADDRESS'},
    second:{name:'Second',cat:'stay',lat:25,lng:121},
    alternate:{name:'Alternate',cat:'sight'},another:{name:'Another',cat:'food'},
    unrelated:{name:'EXCLUDED_TOKEN',cat:'stay'},
  };
  const original=f.transport.request;let sent, schema, instructions;
  f.transport.request=async(method,params)=>{
    if(method==='thread/start')instructions=params.developerInstructions;
    if(method==='turn/start'){sent=JSON.parse(params.input[0].text);schema=params.outputSchema;}
    return original(method,params);
  };
  const result=await f.editor.generate({snapshot:f.snapshot,dayId:null,text:'整趟行程太緊了'});
  assert.deepEqual(sent.days,days);
  assert.deepEqual(sent.places,{first:{name:'First',cat:'sight',note:'Known note'},second:{name:'Second',cat:'stay'},alternate:{name:'Alternate',cat:'sight'},another:{name:'Another',cat:'food'}});
  assert.equal(JSON.stringify(sent).includes('PRIVATE_ADDRESS'),false);
  assert.equal(JSON.stringify(sent).includes('EXCLUDED_TOKEN'),false);
  assert.deepEqual(schema,{type:'object',additionalProperties:false,properties:{summary:{type:'string'},conversationTitle:{type:'string'},appAction:{type:'string',enum:['none','backup','publish','project-update','research']},nextScope:{type:'string'},nextReply:{type:'string'}},required:['summary','conversationTitle','appAction','nextScope','nextReply']});
  assert.match(instructions,/整趟/);
  assert.match(instructions,/不可.*(?:修改|保存)/);
  assert.deepEqual(result,{summary:'建議每天留一段休息時間。',discussion:true,threadId:'thread',turnId:'turn',model:'server-model'});
  assert.deepEqual(f.calls,['config/read','account/rateLimits/read','thread/start','turn/start']);
});
test('whole-trip discussion checks permissions before sending itinerary context',async()=>{
  const f=fixture();const original=f.transport.request;
  f.transport.request=async(method,params)=>{const result=await original(method,params);if(method==='config/read')result.config.project_doc_max_bytes=100;return result;};
  await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:'整趟行程太緊了'}),{code:'POLICY_MISMATCH'});
  assert.deepEqual(f.calls,['config/read']);
});
for(const usage of [false,null])test('whole-trip discussion blocks unavailable ordinary usage '+usage,async()=>{
  const f=fixture({usage});
  await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:'整趟行程太緊了'}),{code:'QUOTA_UNAVAILABLE'});
  assert.equal(f.calls.includes('thread/start'),false);
});
test('whole-trip discussion can be stopped without releasing a result',async()=>{
  const f=fixture({complete:false});const original=f.transport.request;
  f.transport.request=async(method,params)=>{
    const result=await original(method,params);
    if(method==='turn/start')queueMicrotask(()=>f.editor.stop());
    return result;
  };
  await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:'整趟行程太緊了'}),{code:'AI_CANCELED'});
  assert.equal(f.calls.includes('turn/interrupt'),true);
  assert.equal(f.editor.active,null);
});
test('whole-trip discussion rejects disconnected account state before reading policy or sending context',async()=>{
  const f=fixture();f.editor.account.connect=async()=>({state:'unknown'});
  await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:'整趟行程太緊了'}),{code:'LOGIN_REQUIRED'});
  assert.deepEqual(f.calls,[]);
  assert.equal(f.editor.active,null);
});
test('whole-trip discussion reports transport loss as unknown and clears the active request',async()=>{
  const f=fixture({complete:false});const original=f.transport.request;
  f.transport.request=async(method,params)=>{
    const result=await original(method,params);
    if(method==='turn/start')queueMicrotask(()=>{f.transport.state='closed';f.transport.emit('close');});
    return result;
  };
  await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:'整趟行程太緊了'}),{code:'AI_RESULT_UNKNOWN'});
  assert.equal(f.editor.active,null);
});
test('whole-trip discussion rejects a replacement payload outside the summary-only contract',async()=>{
  const f=fixture({answer:{summary:'建議調整',replacementDayJson:'{}'}});
  await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:'整趟行程太緊了'}),{code:'AI_OUTPUT_INVALID'});
});
for(const usage of [false,null])test('does not send a model turn when included usage permission is '+usage,async()=>{
  const f=fixture({usage}); await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:1,text:'change'}),{code:'QUOTA_UNAVAILABLE'});
  assert.equal(f.calls.includes('thread/start'),false);
});
test('stop interrupts the same turn and another request cannot run concurrently',async()=>{
  const f=fixture({complete:false}); const started=new Promise(resolve=>f.transport.once('started',resolve));
  const pending=f.editor.generate({snapshot:f.snapshot,dayId:1,text:'change'});
  const rejected=assert.rejects(pending,{code:'AI_CANCELED'});
  await started;
  await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:1,text:'again'}),{code:'AI_BUSY'});
  await f.editor.stop(); await rejected; assert.equal(f.editor.active,null);
});
test('confirmed user interruption records its terminal turn for safe continuation',async()=>{
  const f=fixture({complete:false});const started=new Promise(resolve=>f.transport.once('started',resolve));
  const pending=f.editor.generate({snapshot:f.snapshot,dayId:null,text:'discuss'});
  await started;
  const stopped=assert.rejects(pending,error=>error.code==='AI_CANCELED'&&error.stopConfirmed===true&&error.turnId==='turn');
  await f.editor.stop();await stopped;
});
test('closing transport while a stop is requested cannot confirm the stop',async()=>{
  const f=fixture({complete:false});const started=new Promise(resolve=>f.transport.once('started',resolve));
  const pending=f.editor.generate({snapshot:f.snapshot,dayId:null,text:'discuss'});
  await started;
  const stopped=assert.rejects(pending,error=>error.code==='AI_RESULT_UNKNOWN'&&error.stopConfirmed!==true);
  f.transport.state='closed';f.transport.emit('close');await stopped;
});
test('stop after completion but before turn acknowledgement never releases the answer',async()=>{
  const f=fixture(); let release;
  const gate=new Promise(resolve=>{release=resolve;}); const original=f.transport.request;
  f.transport.request=async(method,params)=>{const result=await original(method,params);if(method==='turn/start')await gate;return result;};
  const started=new Promise(resolve=>f.transport.once('started',resolve));
  const pending=f.editor.generate({snapshot:f.snapshot,dayId:1,text:'change'});
  const rejected=assert.rejects(pending,{code:'AI_CANCELED'});
  await started; await f.editor.stop(); release(); await rejected;
});
test('model context includes only referenced place names and never unrelated places or navigation addresses',async()=>{
  const f=fixture(); const data=JSON.parse(f.snapshot.dataSource.replace('module.exports = ','').replace(/;$/,''));
  data.DAYS[0].stops=[{place:'included',time:'10:00',kind:'main',label:'Visit'}];
  f.snapshot.dataSource=`module.exports = ${JSON.stringify(data)};`;
  f.snapshot.trip.PLACES={included:{name:'Place',cat:'sight',note:'Known note',gq:'PRIVATE_ADDRESS'},unrelated:{name:'EXCLUDED_TOKEN',cat:'stay'}};
  const original=f.transport.request;let sent;
  f.transport.request=async(method,params)=>{if(method==='turn/start')sent=JSON.parse(params.input[0].text);return original(method,params);};
  await f.editor.generate({snapshot:f.snapshot,dayId:1,text:'change title'});
  assert.deepEqual(sent.places,{included:{name:'Place',cat:'sight',note:'Known note'}});
  assert.equal(JSON.stringify(sent).includes('PRIVATE_ADDRESS'),false);
  assert.equal(JSON.stringify(sent).includes('EXCLUDED_TOKEN'),false);
});
test('resumes recorded thread with current scope/model and checkpoints before sending',async()=>{
 const f=fixture({answer:{summary:'第二個建議是保留午後空檔。'}});const original=f.transport.request;const sequence=[];let resumed,turn;
 f.transport.request=async(method,params)=>{
   sequence.push(method);
   if(method==='thread/read')return {thread:{id:'thread',modelProvider:'openai',cwd:'/fake',status:{type:'notLoaded'},turns:[{id:'previous-turn',status:'completed'}]}};
   if(method==='thread/resume'){resumed=params;return {thread:{id:'thread',status:{type:'idle'}},modelProvider:'openai',approvalPolicy:'never'};}
   if(method==='turn/start')turn=params;
   return original(method,params);
 };
 await f.editor.generate({snapshot:f.snapshot,dayId:null,text:'詳細說第二個建議',thread:{id:'thread',lastTurnId:'previous-turn'},lastOutcome:'上次提案已放棄。',onThread:async id=>{assert.equal(id,'thread');sequence.push('checkpoint');}});
 assert.equal(sequence.includes('thread/start'),false);assert.ok(sequence.indexOf('checkpoint')<sequence.indexOf('turn/start'));
 assert.equal(resumed.model,'server-model');assert.match(resumed.developerInstructions,/整趟/);assert.equal(turn.model,'server-model');assert.equal(JSON.parse(turn.input[0].text).hostStatus,'上次提案已放棄。');
});
for(const kind of ['active','missing-turn','wrong-project'])test('fails closed without a new turn on resume '+kind,async()=>{
 const f=fixture();const original=f.transport.request;
 f.transport.request=async(method,params)=>{
   if(method==='thread/read')return {thread:{id:'thread',modelProvider:'openai',cwd:kind==='wrong-project'?'/other':'/fake',status:{type:kind==='active'?'active':'notLoaded'},turns:kind==='missing-turn'?[]:[{id:'previous-turn',status:'completed'}]}};
   return original(method,params);
 };
 await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:1,text:'continue',thread:{id:'thread',lastTurnId:'previous-turn'}}),{code:'CONTINUATION_UNAVAILABLE'});
 assert.equal(f.calls.includes('turn/start'),false);assert.equal(f.calls.includes('thread/start'),false);
});
test('cannot send before the durable thread checkpoint succeeds',async()=>{
 const f=fixture();await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:1,text:'change',onThread:async()=>{throw Error('disk failed');}}),/disk failed/);assert.equal(f.calls.includes('turn/start'),false);
});

test('discussion and edit share durable instructions and declare current scope per turn',async()=>{
 const instructions=[],modes=[];
 for(const discussion of [true,false]){
  const f=fixture(discussion?{answer:{summary:'discussion'}}:{});const original=f.transport.request;
  f.transport.request=async(method,params)=>{if(method==='thread/start')instructions.push(params.developerInstructions);if(method==='turn/start')modes.push(JSON.parse(params.input[0].text).mode);return original(method,params);};
  await f.editor.generate({snapshot:f.snapshot,dayId:discussion?null:1,text:'test'});
 }
 assert.equal(instructions[0],instructions[1]);assert.deepEqual(modes,['discussion','edit-day']);
});
test('old turn completions received before acknowledgement cannot satisfy a new request',async()=>{
 const f=fixture({answer:{summary:'fresh answer'}}),original=f.transport.request;
 f.transport.request=async(method,params)=>{
   if(method==='turn/start'){
     f.transport.emit('notification','item/completed',{threadId:'thread',turnId:'old-turn',item:{type:'agentMessage',phase:'final_answer',text:'{"summary":"stale answer"}'}});
     f.transport.emit('notification','turn/completed',{threadId:'thread',turn:{id:'old-turn',status:'completed'}});
   }return original(method,params);
 };
 const result=await f.editor.generate({snapshot:f.snapshot,dayId:null,text:'new request'});assert.equal(result.summary,'fresh answer');assert.equal(result.turnId,'turn');
});
test('multi-day scope sends all days and validates per-model effort',async()=>{
 const f=fixture({answer:{summary:'multi',replacementDaysJson:'[{"id":1,"date":"10/1","title":"Updated"}]'}});f.editor.account.models=async()=>[{id:'server-model',isDefault:true,effort:[{reasoningEffort:'low'}]}];
 const original=f.transport.request;let sent;
 f.transport.request=async(method,params)=>{if(method==='turn/start')sent=params;return original(method,params);};
 const result=await f.editor.generate({snapshot:f.snapshot,dayId:-1,text:'all days',effort:'low'});assert.equal(result.replacementDays[0].title,'Updated');assert.equal(sent.effort,'low');assert.equal(JSON.parse(sent.input[0].text).mode,'edit-all');
 await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:-1,text:'all days',effort:'invalid'}),{code:'EFFORT_UNAVAILABLE'});
});
test('completed stored result is recovered by request identity without starting a model turn',async()=>{
 const f=fixture();f.editor.account.transport.request=async(method,params)=>{assert.equal(method,'thread/read');return {thread:{id:'thread',cwd:'/fake',modelProvider:'openai',turns:[{id:'recovered',status:'completed',items:[{type:'userMessage',content:[{type:'text',text:'{"requestId":"request-one"}'}]},{type:'agentMessage',phase:'final_answer',text:'{"summary":"stored answer"}'}]}]}};};
 const result=await f.editor.recover({threadId:'thread',turnId:null,requestId:'request-one',mode:'discussion',model:'server-model'});assert.equal(result.status,'completed');assert.equal(result.answer.summary,'stored answer');assert.equal(f.calls.length,0);
});
test('stop reconciliation confirms a terminal turn without replaying its answer',async()=>{
 const f=fixture();f.editor.account.transport.request=async method=>{assert.equal(method,'thread/read');return {thread:{id:'thread',cwd:'/fake',modelProvider:'openai',status:{type:'idle'},turns:[{id:'stopped-turn',status:'completed',items:[{type:'userMessage',content:[{type:'text',text:'{"requestId":"request-one"}'}]},{type:'agentMessage',phase:'final_answer',text:'not parseable'}]}]}};};
 const result=await f.editor.recover({threadId:'thread',turnId:null,requestId:'request-one',mode:'discussion',model:'server-model',metadataOnly:true});
 assert.deepEqual(result,{status:'completed',threadId:'thread',turnId:'stopped-turn'});
});

test('research runtime enables only the read-only search dispatcher while local execution stays disabled',async()=>{
 const f=fixture({answer:{summary:'Research',sources:[],unresolved:['No source'],feasibility:'Unknown'}});const original=f.transport.request;let runtime;
 f.editor.account.ensureMode=async mode=>{runtime=mode;};
 f.transport.request=async(method,params)=>{const value=await original(method,params);if(method==='config/read'){value.config.web_search='live';for(const key of ['search_tool','code_mode','code_mode_host'])value.config.features[key]=true;}return value;};
 const result=await f.editor.generate({snapshot:f.snapshot,dayId:null,mode:'research',text:'check sources'});assert.equal(runtime,'research');assert.equal(result.research,true);
 const safe=f.transport.request;f.transport.request=async(method,params)=>{const value=await safe(method,params);if(method==='config/read')value.config.features.shell_tool=true;return value;};
 await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,mode:'research',text:'check sources'}),{code:'POLICY_MISMATCH'});
});
test('research with App tools requires exactly the App research MCP server in effective config',async()=>{
 const tools={name:'travel_research',url:'http://127.0.0.1:43210/mcp',token:'t',tools:['research_open']};
 const make=servers=>{const f=fixture({answer:{summary:'Research',sources:[],unresolved:['No source'],feasibility:'Unknown',privateNotes:'訂單 ABC123456'}});const original=f.transport.request;let seen;
  f.editor.account.ensureMode=async(mode,endpoint)=>{seen={mode,endpoint};};
  f.transport.request=async(method,params)=>{const value=await original(method,params);if(method==='config/read'){value.config.web_search='live';for(const key of ['search_tool','code_mode','code_mode_host'])value.config.features[key]=true;value.config.mcp_servers=servers;}return value;};return {f,seen:()=>seen};};
 const ok=make({travel_research:{url:tools.url,bearer_token_env_var:'TP_RESEARCH_TOKEN'}});
 const result=await ok.f.editor.generate({snapshot:ok.f.snapshot,dayId:null,mode:'research',text:'check',researchTools:tools});
 assert.deepEqual(ok.seen(),{mode:'research',endpoint:tools});assert.equal(result.privateNotes,'訂單 ABC123456');
 for(const servers of [{},{travel_research:{url:'http://127.0.0.1:1/mcp'}},{travel_research:{url:tools.url},other:{url:'https://x.example/mcp'}}]){
  const bad=make(servers);await assert.rejects(bad.f.editor.generate({snapshot:bad.f.snapshot,dayId:null,mode:'research',text:'check',researchTools:tools}),{code:'POLICY_MISMATCH'});}
});
test('automatic effort explicitly restores the advertised model default after a stronger turn',async()=>{
 const f=fixture();f.editor.account.models=async()=>[{id:'server-model',isDefault:true,effort:['low','medium','high'],defaultEffort:'medium'}];const original=f.transport.request,sent=[];
 f.transport.request=async(method,params)=>{if(method==='turn/start')sent.push(params.effort);if(method==='thread/read')return {thread:{id:'thread',cwd:'/fake',modelProvider:'openai',status:{type:'idle'},turns:[{id:'turn',status:'completed'}]}};if(method==='thread/resume')return {thread:{id:'thread',status:{type:'idle'}},modelProvider:'openai',approvalPolicy:'never'};return original(method,params);};
 await f.editor.generate({snapshot:f.snapshot,dayId:1,text:'First',effort:'high'});await f.editor.generate({snapshot:f.snapshot,dayId:1,text:'Next',thread:{id:'thread',lastTurnId:'turn'}});assert.deepEqual(sent,['high','medium']);
});

test('conversationTitle is optional, cleaned and never mixed into the answer payload',()=>{
  const {decodeAnswer}=require('../editor.cjs');
  const titled=decodeAnswer(JSON.stringify({summary:'好',conversationTitle:'「仙台第三天午餐調整」。'}),{mode:'discussion'});
  assert.equal(titled.conversationTitle,'仙台第三天午餐調整');assert.equal(titled.discussion,true);
  assert.equal(decodeAnswer(JSON.stringify({summary:'好'}),{mode:'discussion'}).conversationTitle,undefined);
  assert.equal(decodeAnswer(JSON.stringify({summary:'好',conversationTitle:'x'.repeat(41)}),{mode:'discussion'}).conversationTitle,undefined);
  assert.throws(()=>decodeAnswer(JSON.stringify({summary:'好',conversationTitle:3}),{mode:'discussion'}),{code:'AI_OUTPUT_INVALID'});
});

test('appAction is an optional App action proposal; unknown actions are rejected',()=>{
  const {decodeAnswer}=require('../editor.cjs');
  assert.equal(decodeAnswer(JSON.stringify({summary:'好',conversationTitle:'備份',appAction:'backup'}),{mode:'discussion'}).appAction,'backup');
  assert.equal(decodeAnswer(JSON.stringify({summary:'好',appAction:'none'}),{mode:'discussion'}).appAction,undefined);
  assert.equal(decodeAnswer(JSON.stringify({summary:'好'}),{mode:'discussion'}).appAction,undefined);
  assert.throws(()=>decodeAnswer(JSON.stringify({summary:'好',appAction:'delete-everything'}),{mode:'discussion'}),{code:'AI_OUTPUT_INVALID'});
  // 研究模式的其他欄位仍照原本檢查
  const research=decodeAnswer(JSON.stringify({summary:'查完',sources:[],unresolved:[],feasibility:'可行',privateNotes:'',appAction:'publish'}),{mode:'research'});
  assert.equal(research.research,true);assert.equal(research.appAction,'publish');
});

test('nextScope／nextReply become a suggestion; malformed hints are ignored instead of failing the reply',()=>{
  const {decodeAnswer}=require('../editor.cjs');
  const d=decodeAnswer(JSON.stringify({summary:'好',nextScope:'all',nextReply:'請套用修改'}),{mode:'discussion'});
  assert.deepEqual(d.suggestion,{scope:'all',reply:'請套用修改'});assert.equal(d.discussion,true);
  assert.deepEqual(decodeAnswer(JSON.stringify({summary:'好',nextScope:'3',nextReply:''}),{mode:'discussion'}).suggestion,{scope:'3'});
  assert.equal(decodeAnswer(JSON.stringify({summary:'好',nextScope:'keep',nextReply:''}),{mode:'discussion'}).suggestion,undefined);
  assert.equal(decodeAnswer(JSON.stringify({summary:'好',nextScope:'rm -rf',nextReply:'x'.repeat(80)}),{mode:'discussion'}).suggestion,undefined);
  assert.equal(decodeAnswer(JSON.stringify({summary:'好'}),{mode:'discussion'}).suggestion,undefined);
});
