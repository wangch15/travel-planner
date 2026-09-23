const test=require('node:test');const assert=require('node:assert/strict');
const {startResearchServer}=require('../services/research-mcp.cjs');

async function server(t,tools){
  const s=await startResearchServer({tools:tools||[{name:'echo',description:'Echo text',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false},call:async({text})=>[{type:'text',text:'echo:'+text}]},{name:'boom',description:'Fails',inputSchema:{type:'object',properties:{}},call:async()=>{throw Object.assign(Error('RESEARCH_URL_BLOCKED'),{code:'RESEARCH_URL_BLOCKED'});}}]});
  t.after(()=>s.close());return s;
}
const rpc=(s,body,headers={})=>fetch(s.url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:'Bearer '+s.token,...headers},body:JSON.stringify(body)});

test('serves MCP initialize, tools/list and tools/call over loopback JSON',async t=>{
  const s=await server(t);
  assert.match(s.url,/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);assert.match(s.token,/^[A-Za-z0-9_-]{32,}$/);
  const init=await (await rpc(s,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'t',version:'1'}}})).json();
  assert.equal(init.result.protocolVersion,'2025-06-18');assert.deepEqual(init.result.capabilities,{tools:{listChanged:false}});
  assert.equal((await rpc(s,{jsonrpc:'2.0',method:'notifications/initialized'})).status,202);
  const list=await (await rpc(s,{jsonrpc:'2.0',id:2,method:'tools/list'})).json();
  assert.deepEqual(list.result.tools.map(t=>t.name),['echo','boom']);assert.equal(list.result.tools[0].call,undefined);
  const call=await (await rpc(s,{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'echo',arguments:{text:'hi'}}})).json();
  assert.deepEqual(call.result,{content:[{type:'text',text:'echo:hi'}],isError:false});
  const failed=await (await rpc(s,{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'boom',arguments:{}}})).json();
  assert.equal(failed.result.isError,true);assert.match(failed.result.content[0].text,/RESEARCH_URL_BLOCKED/);
  const unknown=await (await rpc(s,{jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'nope',arguments:{}}})).json();
  assert.equal(unknown.error.code,-32602);
  const older=await (await rpc(s,{jsonrpc:'2.0',id:6,method:'initialize',params:{protocolVersion:'1999-01-01',capabilities:{}}})).json();
  assert.equal(older.result.protocolVersion,'2025-06-18');
  assert.deepEqual((await (await rpc(s,{jsonrpc:'2.0',id:7,method:'ping'})).json()).result,{});
});

test('rejects missing token, browser origins, foreign hosts, other paths and oversized bodies',async t=>{
  const s=await server(t);
  assert.equal((await rpc(s,{jsonrpc:'2.0',id:1,method:'tools/list'},{Authorization:'Bearer wrong'})).status,401);
  assert.equal((await fetch(s.url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  assert.equal((await rpc(s,{jsonrpc:'2.0',id:1,method:'tools/list'},{Origin:'https://evil.example'})).status,403);
  assert.equal((await fetch(s.url,{headers:{Authorization:'Bearer '+s.token}})).status,405);
  assert.equal((await fetch(s.url.replace('/mcp','/other'),{method:'POST',headers:{Authorization:'Bearer '+s.token},body:'{}'})).status,404);
  assert.equal((await fetch(s.url,{method:'POST',headers:{Authorization:'Bearer '+s.token,'Content-Type':'application/json'},body:'x'.repeat(1024*1024+1)})).status,413);
  assert.equal((await fetch(s.url,{method:'POST',headers:{Authorization:'Bearer '+s.token,'Content-Type':'application/json'},body:'{bad'})).status,400);
  assert.equal((await rpc(s,[{jsonrpc:'2.0',id:1,method:'ping'}])).status,400);
});

test('tool arguments must be an object and calls after close fail',async t=>{
  const s=await server(t);
  const bad=await (await rpc(s,{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'echo',arguments:'text'}})).json();
  assert.equal(bad.error.code,-32602);
  await s.close();
  await assert.rejects(rpc(s,{jsonrpc:'2.0',id:2,method:'ping'}));
});
