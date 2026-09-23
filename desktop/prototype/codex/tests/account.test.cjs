const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { CodexAccount } = require('../account.cjs');
class FakeTransport extends EventEmitter {
  constructor() { super(); this.state = 'stopped'; this.starts = 0; }
  async start() { this.starts++; this.state = 'ready'; return {}; }
  async stop() { this.state = 'stopped'; this.emit('close', {}); }
  async request(method) {
    if (method === 'account/read') return { account: null, requiresOpenaiAuth: true };
    if (method === 'account/login/start') return { loginId: 'login-one', authUrl: 'https://auth.openai.com/oauth/authorize?state=fake' };
    return {};
  }
}
function options(extra = {}) {
  return { prepareRuntime: async () => ({ work: '/fake', env: {} }), readVersion: async () => 'codex-cli 0.155.1', ...extra };
}
test('stop during preparation prevents a late transport start and awaits cancellation', async () => {
  let resolve; const gate = new Promise(r => { resolve = r; });
  const transport = new FakeTransport();
  const account = new CodexAccount('/fake', options({ prepareRuntime: () => gate, makeTransport: () => transport }));
  const connecting = account.connect().catch(error => error);
  const stopping = account.stop();
  resolve({ work: '/fake', env: {} });
  await stopping; await connecting;
  assert.equal(transport.starts, 0);
  assert.equal(transport.state, 'stopped');
});
test('a newer installed Codex version connects when the app-server protocol works', async () => {
 const account=new CodexAccount('/fake',options({readVersion:async()=> 'codex-cli 0.156.3',makeTransport:()=>new FakeTransport()}));
 assert.equal((await account.connect()).version,'0.156.3');
 await account.stop();
});
test('missing Codex executable still reports missing instead of masking it as a protocol failure',async()=>{
 const missing=Object.assign(Error('not found'),{code:'ENOENT'});
 const account=new CodexAccount('/fake',options({readVersion:async()=>{throw missing;},makeTransport:()=>{throw Error('must not launch');}}));
 await assert.rejects(account.connect(),{code:'ENOENT'});
});
test('closing a transport clears its pending login and permits a fresh login', async () => {
  const transports = [];
  const account = new CodexAccount('/fake', options({ makeTransport: () => { const transport = new FakeTransport(); transports.push(transport); return transport; } }));
  await account.login();
  await transports[0].stop();
  const next = await account.login();
  assert.match(next.authUrl, /^https:\/\/auth.openai.com\//);
  assert.equal(transports.length, 2);
  await account.stop();
});

test('switch logs out the old account, verifies logout and starts a fresh login once', async () => {
  const calls=[]; let signedIn=true; let serial=0;
  const account=new CodexAccount('/fake', options({makeTransport:()=>{
    const transport=new FakeTransport(); const id=++serial;
    transport.request=async method=>{
      calls.push([id,method]);
      if(method==='account/read')return {account:signedIn?{type:'chatgpt',email:'old@example.invalid',planType:'plus'}:null};
      if(method==='account/logout'){signedIn=false;return {};}
      if(method==='account/login/start')return {loginId:'fresh-login',authUrl:'https://auth.openai.com/oauth/authorize?state=fresh'};
      return {};
    };return transport;
  }}));
  await account.connect();
  const [first,second]=await Promise.all([account.switchAccount(),account.switchAccount()]);
  assert.equal(first.authUrl,second.authUrl);
  assert.equal(calls.filter(([,method])=>method==='account/logout').length,1);
  assert.equal(calls.filter(([,method])=>method==='account/login/start').length,1);
  assert.equal(serial,2);
  assert.equal(account.account.state,'waiting-login');
  assert.equal(account.account.label,null);
  await account.stop();
});

test('logout failure never starts another login or claims successful logout', async () => {
  const transport=new FakeTransport();let logins=0;
  transport.request=async method=>{
    if(method==='account/read')return {account:{type:'chatgpt',email:'old@example.invalid',planType:'plus'}};
    if(method==='account/logout')throw Error('logout failed');
    if(method==='account/login/start')logins++;
    return {};
  };
  const account=new CodexAccount('/fake',options({makeTransport:()=>transport}));
  await account.connect();
  await assert.rejects(account.switchAccount(),/logout failed/);
  assert.equal(logins,0);
  assert.notEqual(account.account.state,'needs-login');
  await account.stop();
});

test('late old-account read and model list cannot revive the previous account during switching', async () => {
  let holdRead=false,releaseRead,releaseModels;let signedIn=true;let serial=0;
  const account=new CodexAccount('/fake',options({makeTransport:()=>{
    const transport=new FakeTransport();const id=++serial;
    transport.request=async method=>{
      if(method==='account/read'){
        if(holdRead && id===1){holdRead=false;return new Promise(resolve=>{releaseRead=()=>resolve({account:{type:'chatgpt',email:'old@example.invalid',planType:'plus'}});});}
        return {account:signedIn?{type:'chatgpt',email:'old@example.invalid',planType:'plus'}:null};
      }
      if(method==='model/list')return new Promise(resolve=>{releaseModels=()=>resolve({data:[{id:'old-model'}]});});
      if(method==='account/logout'){signedIn=false;return {};}
      if(method==='account/login/start')return {loginId:'new-login',authUrl:'https://auth.openai.com/oauth/authorize?state=new'};
      return {};
    };return transport;
  }}));
  await account.connect();
  const models=account.models();await new Promise(setImmediate);
  holdRead=true;const reading=account.refresh();
  await account.switchAccount();releaseRead();releaseModels();
  await reading;assert.deepEqual(await models,[]);
  assert.equal(account.account.state,'waiting-login');assert.equal(account.account.label,null);
  await account.stop();
});
test('research mode adds only the App research MCP server with its token in the environment', async () => {
  const launches = [];
  const account = new CodexAccount('/fake', options({ makeTransport: config => { launches.push(config); return new FakeTransport(); } }));
  const endpoint = { name: 'travel_research', url: 'http://127.0.0.1:43210/mcp', token: 'fixture-token', tools: ['research_open'] };
  await account.ensureMode('research', endpoint);
  const args = launches.at(-1).args;
  assert.ok(args.includes('mcp_servers.travel_research.url="http://127.0.0.1:43210/mcp"'));
  assert.ok(args.includes('mcp_servers.travel_research.bearer_token_env_var="TP_RESEARCH_TOKEN"'));
  assert.equal(args.join(' ').includes('fixture-token'), false);
  assert.equal(launches.at(-1).env.TP_RESEARCH_TOKEN, 'fixture-token');
  await account.ensureMode('research', endpoint);
  assert.equal(launches.length, 1);
  await account.ensureMode('research', { ...endpoint, url: 'http://127.0.0.1:43211/mcp' });
  assert.equal(launches.length, 2);
  await account.ensureMode('normal');
  assert.equal(launches.at(-1).args.some(a => a.startsWith('mcp_servers.')), false);
  assert.equal(launches.at(-1).env.TP_RESEARCH_TOKEN, undefined);
  await account.stop();
});
