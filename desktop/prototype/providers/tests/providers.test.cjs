const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createProvider } = require('../index.cjs');
const { startProcess } = require('../process.cjs');

const FAKE = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const provider = process.env.CLAUDE_CONFIG_DIR ? 'claude' : 'gemini';
const send = value => process.stdout.write(JSON.stringify(value)+'\n');
if (args.includes('--version')) { console.log(provider==='claude'?'2.1.278 (Claude Code)':'0.46.0'); process.exit(); }
if (args.includes('auth') && args.includes('status')) {
  send({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',email:'fixture@example.invalid',subscriptionType:'pro'});process.exit();
}
if (args.includes('auth')) { process.exit(); }
if (args.includes('--acp')) {
  let buffer=''; process.stdin.on('data',chunk=>{buffer+=chunk;let i;
    while((i=buffer.indexOf('\n'))>=0){const msg=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);
      if(msg.method==='initialize')send({jsonrpc:'2.0',id:msg.id,result:{protocolVersion:1,agentInfo:{name:'gemini-cli',version:'0.46.0'},authMethods:[{id:'oauth-personal'}]}});
      if(msg.method==='authenticate'){
        fs.writeFileSync(path.join(process.env.GEMINI_CLI_HOME,'.gemini','oauth_creds.json'),'{}');
        fs.writeFileSync(path.join(process.env.GEMINI_CLI_HOME,'.gemini','google_accounts.json'),JSON.stringify({active:'fixture@example.invalid',old:[]}));
        send({jsonrpc:'2.0',id:msg.id,result:{}});
      }
    }
  });
} else {
  let input=''; process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{
    let payload=JSON.parse(input),images=[];
    if(payload.type==='user'){const content=payload.message.content;images=content.filter(b=>b.type==='image');payload=JSON.parse(content.find(b=>b.type==='text').text);}
    if(payload.request==='hang'){setInterval(()=>{},1000);return;}
    if(payload.request==='bad-json'){console.log('{broken');return;}
    if(payload.request==='oversized'){process.stdout.write('x'.repeat(2200000));return;}
    if(payload.request==='crash'){process.exit(1);}
    const answer={summary:payload.history?.length?'已保留對話':'完成'};
    if(payload.mode==='edit-day')answer.replacementDayJson=JSON.stringify({...payload.day,title:'Changed'});
    if(payload.mode==='edit-all')answer.replacementDaysJson=JSON.stringify(payload.days.map(d=>({...d,title:'Changed'})));
    if(payload.mode==='planning')answer.planMarkdown='# 草案';
    if(payload.mode==='materialize')answer.filesJson=JSON.stringify({'data.js':'export const DAYS = [];'});
    if(payload.mode==='research')Object.assign(answer,{sources:[{url:'https://example.invalid/official',title:'Official fixture',evidence:'Fixture evidence'}],unresolved:[],feasibility:'待人工核對',privateNotes:''});
    if(payload.request==='invalid-answer')answer.extra='unrequested';
    if(images.length)answer.summary='圖片:'+images.map(b=>b.source.type+'/'+b.source.media_type+'/'+Buffer.from(b.source.data,'base64').length).join(',');
    const sid='11111111-1111-4111-8111-111111111111';
    if(provider==='claude') {
      const mcpAt=args.indexOf('--mcp-config'),mcp=mcpAt>=0?JSON.parse(args[mcpAt+1]).mcpServers:{};
      const allowed=args.includes('--allowedTools')?args[args.indexOf('--allowedTools')+1].split(','):[];
      send({type:'system',subtype:'init',session_id:sid,tools:allowed.filter(t=>t.startsWith('mcp__')),mcp_servers:[...Object.keys(mcp).map(name=>({name,status:'connected'})),...(payload.request==='rogue-mcp'?[{name:'rogue',status:'connected'}]:[])],plugins:payload.request==='user-plugin'?[{name:'x',source:'x@market'}]:[{name:'telemetry',source:'telemetry@builtin'}],skills:[]});
      if(payload.request.startsWith('result-error:')){send({type:'result',subtype:'success',is_error:true,result:payload.request.slice(13)});return;}
      if(payload.request.startsWith('assistant-error:')){send({type:'assistant',error:payload.request.slice(16),message:{content:[{type:'text',text:'API Error'}]}});send({type:'result',subtype:'success',is_error:true,result:'API Error'});return;}
      if(payload.request==='slow-stream'){let n=0;const timer=setInterval(()=>{send({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'x'}}});if(++n===6){clearInterval(timer);send({type:'result',subtype:'success',is_error:false,session_id:sid,structured_output:answer});}},60);return;}
      if(payload.request==='mcp-call')send({type:'assistant',message:{content:[{type:'tool_use',name:'mcp__travel_research__research_open',input:{url:'https://example.invalid'}}]}});
      if(payload.request==='other-mcp-call')send({type:'assistant',message:{content:[{type:'tool_use',name:'mcp__travel_research__shell',input:{}}]}});
      if(payload.request==='forbidden-tool')send({type:'assistant',message:{content:[{type:'tool_use',name:'Bash',input:{command:'never executed'}}]}});
      send({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'chunk'}}});
      send({type:'result',subtype:'success',is_error:false,session_id:sid,structured_output:answer});
    } else {
      send({type:'init',session_id:sid,model:'auto-gemini-3'});
      if(payload.request==='forbidden-tool')send({type:'tool_use',tool_name:'run_shell_command'});
      const text=JSON.stringify(answer);send({type:'message',role:'assistant',content:text.slice(0,5),delta:true});
      send({type:'message',role:'assistant',content:text.slice(5),delta:true});send({type:'result',status:'success'});
    }
  });
}
`;

// Claude receives one stream-json user message; Gemini receives the payload itself.
function payloadOf(input) {
  const message = JSON.parse(input);
  return message.type === 'user' ? JSON.parse(message.message.content.find(b => b.type === 'text').text) : message;
}

async function fixture(t, provider, options = {}) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tp-providers-')));
  t.after(() => fs.rm(directory, {recursive:true,force:true}));
  const script = path.join(directory,'fake.cjs'); await fs.writeFile(script, FAKE);
  const launches=[];
  const instance=createProvider(provider,path.join(directory,'state'),{
    ...options, spawnProcess:(command,args,config)=>{
      const record={command,args,config};launches.push(record);
      const child=spawn(process.execPath,[script,...args],config);const end=child.stdin.end.bind(child.stdin);
      child.stdin.end=(input,...rest)=>{record.input=input;return end(input,...rest);};return child;
    },
  });
  if(provider==='gemini'){
    await instance.account.connect();
    await fs.writeFile(path.join(instance.account.runtime.home,'.gemini/oauth_creds.json'),'{}');
    await fs.writeFile(path.join(instance.account.runtime.home,'.gemini/google_accounts.json'),JSON.stringify({active:'fixture@example.invalid',old:[]}));
  }
  t.after(()=>instance.account.stop());t.after(()=>instance.editor.stop());
  const snapshot={dataSource:'const DAYS = [{id:1,date:"2026-09-23",title:"Start",stops:[],alts:[]}]; module.exports = {DAYS};',trip:{PLACES:{}}};
  return {...instance,snapshot,launches,directory};
}

for(const provider of ['claude','gemini']) {
  test(`${provider}: real process stream supports every declared text mode`,async t=>{
    const f=await fixture(t,provider); const progress=[];
    for(const mode of f.capabilities.modes){
      const answer=await f.editor.generate({snapshot:f.snapshot,dayId:1,text:'change title',mode,onProgress:s=>progress.push(s)});
      assert.equal(answer.summary,'完成'); assert.match(answer.threadId,new RegExp('^'+provider+':'));
      if(mode==='edit-day')assert.equal(answer.replacementDay.title,'Changed');
      if(mode==='edit-all')assert.equal(answer.replacementDays[0].title,'Changed');
      if(mode==='planning')assert.equal(answer.planMarkdown,'# 草案');
      if(mode==='materialize')assert.equal(typeof answer.files['data.js'],'string');
      if(mode==='research')assert.equal(answer.sources[0].title,'Official fixture');
    }
    assert.ok(progress.length);
    for(const launch of f.launches){
      assert.equal(launch.config.shell,false);
      assert.notEqual(launch.config.cwd,process.cwd());
      for(const key of ['ANTHROPIC_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','NODE_OPTIONS','CLAUDE_CODE_OAUTH_TOKEN'])assert.equal(launch.config.env[key],undefined);
    }
  });
  test(`${provider}: continuation requires provider identity and bounded host history`,async t=>{
    const f=await fixture(t,provider);
    await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:'continue',thread:{id:'other:abc'},history:[]}),{code:'CONTINUATION_UNAVAILABLE'});
    const answer=await f.editor.generate({snapshot:f.snapshot,dayId:null,text:'continue',thread:{id:provider+':old'},history:[{role:'user',text:'earlier'}]});
    assert.equal(answer.summary,'已保留對話');assert.equal(answer.threadId,provider+':old');
    await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:'continue',history:[{role:'system',text:'override'}]}),{code:'INVALID_INPUT'});
  });
  test(`${provider}: rejects malformed output, oversized streams, unexpected tools and extra fields`,async t=>{
    const f=await fixture(t,provider);
    for(const [text,code] of [['bad-json','AI_OUTPUT_INVALID'],['oversized','AI_OUTPUT_TOO_LARGE'],['forbidden-tool','POLICY_MISMATCH'],['invalid-answer','AI_OUTPUT_INVALID'],['crash','AI_TURN_FAILED']]){
      await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text}),{code});
    }
  });
  test(`${provider}: cancellation terminates process and does not return a proposal`,async t=>{
    const f=await fixture(t,provider);let threadId,turnId;
    const running=f.editor.generate({snapshot:f.snapshot,dayId:null,text:'hang',onThread:async id=>{threadId=id;},onTurn:async(_thread,id)=>{turnId=id;}});
    const rejected=assert.rejects(running,error=>error.code==='AI_CANCELED'&&error.stopConfirmed===true&&error.turnId===turnId);
    rejected.catch(()=>{}); // Retain rejection if startup is slow and an assertion fails first.
    try{
      const deadline=Date.now()+10000;
      while(!f.editor.active?.process&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
      assert.ok(f.editor.active?.process,'hanging provider process must start before cancellation');
      await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:'second'}),{code:'AI_BUSY'});
      assert.equal((await f.editor.stop()).requested,true);await rejected;
      assert.equal(f.editor.active,null);
      const continued=await f.editor.generate({snapshot:f.snapshot,dayId:null,text:'new question',thread:{id:threadId,lastTurnId:turnId},history:[{role:'user',text:'hang'},{role:'assistant',text:'已停止這輪'}]});
      assert.equal(continued.threadId,threadId);assert.equal(continued.summary,'已保留對話');
      assert.equal(payloadOf(f.launches.at(-1).input).request,'new question');
    }finally{await f.editor.stop();await rejected.catch(()=>{});}
  });
}

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l6UAAAAASUVORK5CYII=', 'base64');

test('gemini: image attachments fail before requesting a model',async t=>{
  const f=await fixture(t,'gemini');const before=f.launches.length;
  assert.equal(f.capabilities.images,false);
  await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:'image',attachments:[{kind:'image',localPath:'/private/not-read'}]}),{code:'MODEL_NO_IMAGES'});
  assert.equal(f.launches.length,before);
});

test('claude: screenshots travel as base64 image blocks in one stream-json user message',async t=>{
  const f=await fixture(t,'claude');
  assert.equal(f.capabilities.images,true);
  const image=path.join(f.directory,'booking.bin');await fs.writeFile(image,PNG_1PX);
  const answer=await f.editor.generate({snapshot:f.snapshot,dayId:null,text:'讀這張訂房截圖',attachments:[{kind:'image',mime:'image/png',size:PNG_1PX.length,localPath:image}]});
  assert.equal(answer.summary,'圖片:base64/image/png/'+PNG_1PX.length);
  const launch=f.launches.at(-1);
  assert.deepEqual(launch.args.slice(launch.args.indexOf('--input-format'),launch.args.indexOf('--input-format')+2),['--input-format','stream-json']);
  assert.equal(payloadOf(launch.input).request,'讀這張訂房截圖');
  assert.equal(launch.input.endsWith('\n'),true);
});

test('claude: image attachments with unsafe path, type or size fail before launch',async t=>{
  const f=await fixture(t,'claude');const image=path.join(f.directory,'ok.bin');await fs.writeFile(image,PNG_1PX);const before=f.launches.length;
  for(const attachment of [
    {kind:'image',mime:'image/png',size:PNG_1PX.length,localPath:'relative.bin'},
    {kind:'image',mime:'image/gif',size:PNG_1PX.length,localPath:image},
    {kind:'image',mime:'image/png',size:PNG_1PX.length+1,localPath:image},
    {kind:'image',mime:'image/png',size:PNG_1PX.length,localPath:path.join(f.directory,'missing.bin')},
  ])await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:'image',attachments:[attachment]}),{code:'INVALID_INPUT'});
  assert.equal(f.launches.length,before);
});

test('Gemini isolated ACP login uses only oauth-personal and preserves outside credential files',async t=>{
  const f=await fixture(t,'gemini');await fs.unlink(path.join(f.account.runtime.home,'.gemini/oauth_creds.json'));
  assert.equal((await f.account.refresh()).state,'needs-login');
  const completed=new Promise(resolve=>f.account.on('changed',a=>{if(a.state==='connected')resolve(a);}));
  const result=await f.account.login();assert.equal(result.account.state,'waiting-login');
  assert.equal((await completed).state,'connected');
  assert.ok(f.launches.some(l=>l.args.includes('--acp')));
  const launch=f.launches.find(l=>l.args.includes('--acp'));
  const settings=JSON.parse(await fs.readFile(launch.config.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH,'utf8'));
  assert.equal(settings.security.auth.selectedType,'');
  assert.equal(settings.security.auth.useExternal,true);
});

test('accounts expose stable email identity and provider on changes',async t=>{
  for(const id of ['claude','gemini']){
    const f=await fixture(t,id);const events=[];f.account.on('changed',a=>events.push(a));
    assert.equal((await f.account.connect()).label,'fixture@example.invalid');
    assert.equal(events.at(-1).provider,id);
  }
});

test('managed executable resolution prepends arguments without inheriting credential environment',async t=>{
  const f=await fixture(t,'claude',{resolveCommand:async()=>({command:'/managed/node',args:['/managed/claude.js'],env:{PATH:process.env.PATH,ANTHROPIC_API_KEY:'must-not-leak'}})});
  await f.account.connect();
  assert.equal(f.launches[0].command,'/managed/node');
  assert.equal(f.launches[0].args[0],'/managed/claude.js');
  assert.equal(f.launches[0].config.env.ANTHROPIC_API_KEY,undefined);
});

test('runtime policy tampering is rejected before starting a model process',async t=>{
  const f=await fixture(t,'gemini');
  await fs.writeFile(f.account.runtime.settings,'{}');const before=f.launches.length;
  await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:'hello'}),{code:'POLICY_MISMATCH'});
  assert.equal(f.launches.length,before);
});

test('CLI at-file preprocessing never sees literal at signs from user input or history',async t=>{
  const f=await fixture(t,'gemini');
  const request='請討論 @/private/fixture-secret';
  await f.editor.generate({snapshot:f.snapshot,dayId:null,text:request,history:[{role:'user',text:'@../private-file'}]});
  const payload=f.launches.find(l=>l.args.includes('--prompt')).input;
  assert.equal(payload.includes('@'),false);
  assert.equal(JSON.parse(payload).request,request);
});

test('Claude newer CLI version retains App-only auth and protocol checks',async t=>{
  const f=await fixture(t,'claude');const script=path.join(f.directory,'fake.cjs');
  await fs.writeFile(script,FAKE.replace('2.1.278 (Claude Code)','2.1.280 (Claude Code)'));
  assert.equal((await f.account.connect()).state,'connected');
  assert.equal(f.account.account.version,'2.1.280 (Claude Code)');
  assert.equal((await f.editor.generate({snapshot:f.snapshot,dayId:null,text:'hello'})).summary,'完成');
});
test('API-key and managed Claude accounts fail closed independently of CLI version',async t=>{
  const f=await fixture(t,'claude');const script=path.join(f.directory,'fake.cjs');
  await fs.writeFile(script,FAKE.replace("authMethod:'claude.ai'","authMethod:'api_key'"));
  await assert.rejects(f.account.connect(),{code:'SUBSCRIPTION_LOGIN_REQUIRED'});
  await fs.writeFile(script,FAKE.replace("subscriptionType:'pro'","subscriptionType:'enterprise'"));
  await assert.rejects(f.account.connect(),{code:'EXTERNAL_PROVIDER_POLICY'});
  assert.equal(f.launches.some(l=>l.args.includes('--print')),false);
});

test('external Gemini admin policies block launch instead of silently overriding app restrictions',async t=>{
  const f=await fixture(t,'gemini');const lstat=fs.lstat;const before=f.launches.length;
  t.mock.method(fs,'lstat',async(file,...rest)=>{
    if(String(file).endsWith('GeminiCli/policies')||String(file).endsWith('gemini-cli/policies')||String(file).endsWith('gemini-cli\\policies'))return {};
    return lstat(file,...rest);
  });
  await assert.rejects(f.account.connect(),{code:'EXTERNAL_PROVIDER_POLICY'});
  assert.equal(f.launches.length,before);
});

test('a stalled model process ends as a settled timeout the user can resend',async t=>{
  const f=await fixture(t,'gemini',{timeoutMs:100});
  await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:'hang'}),error=>error.code==='AI_TIMEOUT'&&error.settled===true);
  assert.equal(f.editor.active,null);
});

// 一次性的 CLI 程序結束就代表這輪確定結束：錯誤要標成 settled，App 才不會鎖住送出。
test('claude: failed turns name the cause without exposing its text, and are settled',async t=>{
  const f=await fixture(t,'claude');
  for(const [text,code] of [
    ['result-error:Invalid API key · Please run /login','LOGIN_REQUIRED'],
    ['result-error:OAuth token has expired. Please obtain a new token or refresh your existing token.','LOGIN_REQUIRED'],
    ['result-error:Claude AI usage limit reached|1760000000','AI_USAGE_LIMIT'],
    ['result-error:API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}','AI_SERVICE_BUSY'],
    ['assistant-error:authentication_failed','LOGIN_REQUIRED'],
    ['assistant-error:rate_limit','AI_USAGE_LIMIT'],
    ['assistant-error:server_error','AI_SERVICE_BUSY'],
    ['result-error:something unexpected','AI_TURN_FAILED'],
    ['crash','AI_TURN_FAILED'],['bad-json','AI_OUTPUT_INVALID'],
  ]){
    await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text}),error=>{
      assert.equal(error.code,code,text);assert.equal(error.settled,true,text);
      assert.doesNotMatch(error.message,/API Error|usage limit|OAuth/,text);return true;
    });
  }
});

test('claude: a slow but steady reply is not cut off, while silence times out',async t=>{
  const f=await fixture(t,'claude',{timeoutMs:200});
  const answer=await f.editor.generate({snapshot:f.snapshot,dayId:null,text:'slow-stream'});
  assert.equal(answer.summary,'完成');
  await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:'hang'}),error=>error.code==='AI_TIMEOUT'&&error.settled===true);
});

test('process idle timeout restarts on output but a total cap still applies',async()=>{
  const runtime={work:os.tmpdir(),env:{PATH:process.env.PATH}};
  const ticking='let n=0;const t=setInterval(()=>{process.stdout.write("tick\\n");if(++n===5){clearInterval(t);}},50);';
  const steady=startProcess(process.execPath,['-e',ticking],runtime,{input:'',idleTimeoutMs:150,timeoutMs:5000});
  assert.equal((await steady.done).exitCode,0);
  const endless=startProcess(process.execPath,['-e','setInterval(()=>process.stdout.write("tick\\n"),30);'],runtime,{input:'',idleTimeoutMs:150,timeoutMs:400});
  await assert.rejects(endless.done,{code:'AI_RESULT_UNKNOWN'});
  const began=Date.now(),silent=startProcess(process.execPath,['-e','setInterval(()=>{},1000);'],runtime,{input:'',idleTimeoutMs:100,timeoutMs:5000});
  await assert.rejects(silent.done,{code:'AI_RESULT_UNKNOWN'});
  assert.ok(Date.now()-began<2000,'silence must end at the idle limit, not the total cap');
});

test('missing CLI executables have a distinct installation-needed error',async()=>{
  const process=startProcess(path.join(os.tmpdir(),'tp-missing-'+Date.now()),[],{work:os.tmpdir(),env:{}},{input:''});
  await assert.rejects(process.done,{code:'CLI_MISSING'});
});

test('Gemini login completes after authentication even if ACP waits after stdin closes',async t=>{
  const f=await fixture(t,'gemini',{loginExitGraceMs:20});
  await fs.unlink(path.join(f.account.runtime.home,'.gemini/oauth_creds.json'));
  await fs.writeFile(path.join(f.directory,'fake.cjs'),FAKE.replace("send({jsonrpc:'2.0',id:msg.id,result:{}});","send({jsonrpc:'2.0',id:msg.id,result:{}});setInterval(()=>{},1000);"));
  const completed=new Promise(resolve=>f.account.on('changed',a=>{if(a.state==='connected')resolve(a);}));
  await f.account.login();let timer;
  try { await Promise.race([completed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('login did not finish')),500);})]); }
  finally { clearTimeout(timer); }
});

test('Claude login reconciles delayed official status even when login command exits nonzero',async t=>{
  const f=await fixture(t,'claude',{loginStatusAttempts:3,loginStatusIntervalMs:5});
  const script=path.join(f.directory,'fake.cjs');
  const marker="path.join(process.env.CLAUDE_CONFIG_DIR,'test-login-marker')";
  const status="const marker="+marker+";const attempt=fs.existsSync(marker)?Number(fs.readFileSync(marker,'utf8')):0;"+
    "if(attempt)fs.writeFileSync(marker,String(attempt+1));"+
    "send({loggedIn:attempt>=2,authMethod:attempt>=2?'claude.ai':'none',apiProvider:'firstParty',email:attempt>=2?'fixture@example.invalid':null,subscriptionType:attempt>=2?'pro':null});process.exit(attempt>=2?0:1);";
  const login="fs.writeFileSync("+marker+",'1');process.stderr.write('Login failed: credential store unavailable\\n');process.exit(1);";
  await fs.writeFile(script,FAKE.replace("send({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',email:'fixture@example.invalid',subscriptionType:'pro'});process.exit();",status)
    .replace("if (args.includes('auth')) { process.exit(); }","if (args.includes('auth')) { "+login+" }"));
  assert.equal((await f.account.connect()).state,'needs-login');
  const completed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('status was not reconciled')),5000);
    f.account.on('changed',a=>{if(a.state==='connected'){clearTimeout(timer);resolve(a);}else if(a.state==='login-failed'){clearTimeout(timer);reject(Error('premature failure'));}});});
  assert.equal((await f.account.login()).account.state,'waiting-login');
  assert.equal((await completed).label,'fixture@example.invalid');
});

test('Claude login reports an unsupported credential separately from incomplete login',async t=>{
  const f=await fixture(t,'claude',{loginStatusAttempts:1});
  const script=path.join(f.directory,'fake.cjs');
  const marker="path.join(process.env.CLAUDE_CONFIG_DIR,'test-login-marker')";
  const status="const loggedIn=fs.existsSync("+marker+");send({loggedIn,authMethod:loggedIn?'api_key':'none',apiProvider:'firstParty',email:loggedIn?'fixture@example.invalid':null,subscriptionType:null});process.exit(loggedIn?0:1);";
  await fs.writeFile(script,FAKE.replace("send({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',email:'fixture@example.invalid',subscriptionType:'pro'});process.exit();",status)
    .replace("if (args.includes('auth')) { process.exit(); }","if (args.includes('auth')) { fs.writeFileSync("+marker+",'1');process.exit(); }"));
  assert.equal((await f.account.connect()).state,'needs-login');
  const ended=new Promise(resolve=>f.account.on('changed',a=>{if(a.state==='error'||a.state==='login-failed')resolve(a);}));
  await f.account.login();
  const result=await ended;
  assert.equal(result.state,'error');
  assert.equal(result.authFailure,'unsupported-account');
  assert.match(result.message,/訂閱帳號/);
  assert.equal(f.launches.some(l=>l.args.includes('--print')),false);
});

test('CLI auth stderr is reduced to a fixed failure category without exposing its text',async()=>{
  const work=await fs.mkdtemp(path.join(os.tmpdir(),'tp-auth-error-'));
  try{
    const script=path.join(work,'error.cjs');
    await fs.writeFile(script,"process.stderr.write('Login failed: Keychain access denied at https://example.invalid/?token=private-secret\\n');process.exit(1);");
    const processHandle=startProcess(process.execPath,[script],{work,env:process.env},{input:'',classifyAuthFailure:true});
    await assert.rejects(processHandle.done,error=>{
      assert.equal(error.code,'AI_TURN_FAILED');
      assert.equal(error.authFailure,'credential-store');
      assert.equal(JSON.stringify(error).includes('private-secret'),false);
      assert.equal(String(error).includes('private-secret'),false);
      return true;
    });
  }finally{await fs.rm(work,{recursive:true,force:true});}
});

test('Claude login preserves the credential-store failure when official status stays logged out',async t=>{
  const f=await fixture(t,'claude',{loginStatusAttempts:2,loginStatusIntervalMs:5});
  const script=path.join(f.directory,'fake.cjs');
  await fs.writeFile(script,FAKE.replace("send({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',email:'fixture@example.invalid',subscriptionType:'pro'});process.exit();",
    "send({loggedIn:false,authMethod:'none',apiProvider:'firstParty'});process.exit(1);")
    .replace("if (args.includes('auth')) { process.exit(); }",
      "if (args.includes('auth')) { process.stderr.write('Login failed: Keychain access denied https://example.invalid/?code=private-secret\\n');process.exit(1); }"));
  assert.equal((await f.account.connect()).state,'needs-login');
  const ended=new Promise(resolve=>f.account.on('changed',a=>{if(a.state==='login-failed')resolve(a);}));
  await f.account.login();
  const result=await ended;
  assert.equal(result.authFailure,'credential-store');
  assert.match(result.message,/鑰匙圈/);
  assert.equal(JSON.stringify(result).includes('private-secret'),false);
});

test('cancel during delayed Claude status reconciliation cannot publish an older login result',async t=>{
  const f=await fixture(t,'claude',{loginStatusAttempts:3,loginStatusIntervalMs:5});
  const script=path.join(f.directory,'fake.cjs');
  await fs.writeFile(script,FAKE.replace("send({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',email:'fixture@example.invalid',subscriptionType:'pro'});process.exit();",
    "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,70);send({loggedIn:false,authMethod:'none',apiProvider:'firstParty'});process.exit(1);")
    .replace("if (args.includes('auth')) { process.exit(); }",
      "if (args.includes('auth')) { process.exit(1); }"));
  assert.equal((await f.account.connect()).state,'needs-login');
  await f.account.login();
  for(let i=0;i<100&&f.launches.filter(l=>l.args.includes('status')).length<2;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(f.launches.filter(l=>l.args.includes('status')).length>=2);
  const afterCancel=await f.account.cancelLogin();
  assert.equal(afterCancel.state,'needs-login');
  await new Promise(resolve=>setTimeout(resolve,120));
  assert.equal(f.account.account.state,'needs-login');
});

test('an authorize URL does not turn a network or unspecified login failure into a callback error',async t=>{const directory=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'tp-auth-category-')));t.after(()=>fs.rm(directory,{recursive:true,force:true}));for(const [extra,category] of [['Login failed: fetch failed ECONNRESET','network'],['','login-command']]){const script=path.join(directory,'fake.cjs');await fs.writeFile(script,'process.stderr.write('+JSON.stringify('Open https://example.invalid/authorize?redirect_uri=callback&token=private-secret\n'+extra+'\n')+');process.exit(1);');const task=startProcess(process.execPath,[script],{work:directory,env:process.env},{input:'',classifyAuthFailure:true});await assert.rejects(task.done,error=>{assert.equal(error.authFailure,category);assert.equal(JSON.stringify(error).includes('private-secret'),false);return true;});}});

const RESEARCH_TOOLS={name:'travel_research',url:'http://127.0.0.1:43210/mcp',token:'fixture-token',tools:['research_open','maps_route','research_screenshot']};

test('claude research gets exactly the App research server without safe mode',async t=>{
  const f=await fixture(t,'claude');
  const answer=await f.editor.generate({snapshot:f.snapshot,dayId:null,text:'mcp-call',mode:'research',researchTools:RESEARCH_TOOLS});
  assert.equal(answer.sources[0].title,'Official fixture');
  const launch=f.launches.at(-1);
  assert.equal(launch.args.includes('--safe-mode'),false);assert.equal(launch.config.env.CLAUDE_CODE_SAFE_MODE,undefined);
  for(const flag of ['--restricted','--strict-mcp-config','--disable-slash-commands','--no-chrome'])assert.ok(launch.args.includes(flag),flag);
  const mcp=JSON.parse(launch.args[launch.args.indexOf('--mcp-config')+1]).mcpServers;
  assert.deepEqual(mcp,{travel_research:{type:'http',url:RESEARCH_TOOLS.url,headers:{Authorization:'Bearer fixture-token'}}});
  assert.deepEqual(launch.args[launch.args.indexOf('--allowedTools')+1].split(','),['WebSearch','mcp__travel_research__research_open','mcp__travel_research__maps_route','mcp__travel_research__research_screenshot']);
});

test('claude ordinary modes keep safe mode and no MCP even when research tools exist',async t=>{
  const f=await fixture(t,'claude');
  await f.editor.generate({snapshot:f.snapshot,dayId:null,text:'hello',mode:'discussion',researchTools:RESEARCH_TOOLS});
  const launch=f.launches.at(-1);
  assert.ok(launch.args.includes('--safe-mode'));assert.equal(launch.args[launch.args.indexOf('--mcp-config')+1],'{"mcpServers":{}}');
});

test('claude research rejects extra MCP servers, unknown MCP tools and non-builtin plugins',async t=>{
  const f=await fixture(t,'claude');
  for(const request of ['rogue-mcp','other-mcp-call','user-plugin'])
    await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:request,mode:'research',researchTools:RESEARCH_TOOLS}),{code:'POLICY_MISMATCH'},request);
  await assert.rejects(f.editor.generate({snapshot:f.snapshot,dayId:null,text:'mcp-call',mode:'research'}),{code:'POLICY_MISMATCH'});
});
