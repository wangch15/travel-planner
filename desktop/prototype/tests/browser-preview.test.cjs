const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { BrowserPreview } = require('../browser-preview.cjs');
const artifact = body => ({ read: path => path === '/index.html' ? {body,type:'text/html'} : path === '/img/sample-1.jpg' ? {body:Buffer.from([1,2,3]),type:'image/jpeg'} : null });
function request(url, {path, method='GET', host} = {}) {
  return new Promise((resolve,reject) => {
    const u = new URL(url);
    const req=http.request({hostname:u.hostname,port:u.port,path:path||u.pathname,method,headers:host?{host}:{}},res=>{
      const chunks=[];res.on('data',data=>chunks.push(data));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
    });req.on('error',reject);req.end();
  });
}
test('browser preview serves isolated immutable snapshots, rejects routing escapes and foreign hosts', async t => {
  const server=new BrowserPreview();t.after(()=>server.close());
  const first=await server.open(artifact('<h1>First</h1>'));const second=await server.open(artifact('<h1>Second</h1>'));
  const response=await request(first);assert.equal(response.status,200);assert.equal(response.body.toString(),'<h1>First</h1>');
  assert.equal((await request(second)).body.toString(),'<h1>Second</h1>');
  assert.match(response.headers['content-security-policy'],/sandbox allow-scripts/);assert.match(response.headers['content-security-policy'],/connect-src 'none'/);
  assert.equal(response.headers['referrer-policy'],'no-referrer');
  assert.deepEqual((await request(first.replace('index.html','img/sample-1.jpg'))).body,Buffer.from([1,2,3]));
  assert.equal((await request(first,{host:'evil.example'})).status,403);
  assert.equal((await request(first,{method:'POST'})).status,405);
  for(const path of ['/index.html','/../../package.json',new URL(first).pathname.replace('/index.html','/../index.html'),new URL(first).pathname.replace('/index.html','/%69ndex.html')]) assert.equal((await request(first,{path})).status,404);
  assert.equal((await request(first,{method:'HEAD'})).body.length,0);
});
test('old browser previews expire or are evicted and closing revokes access',async t=>{
  const server=new BrowserPreview({limit:1,ttl:10000});t.after(()=>server.close());
  const first=await server.open(artifact('first'));const second=await server.open(artifact('second'));
  assert.equal((await request(first)).status,404);
  for(const entry of server.entries.values())entry.expires=Date.now()-1;
  assert.equal((await request(second)).status,404);
  server.close();await assert.rejects(server.open(artifact('closed')));
  await assert.rejects(request(second));
});
