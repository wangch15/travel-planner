const test=require('node:test');const assert=require('node:assert/strict');
const {checkResearchURL,isPublicAddress,createHostGuard}=require('../services/research-guard.cjs');

test('research URLs must be public http(s) pages without credentials or odd ports',()=>{
  assert.equal(checkResearchURL('https://www.google.com/maps/dir/?api=1&origin=A#x').href,'https://www.google.com/maps/dir/?api=1&origin=A');
  for(const url of ['file:///etc/passwd','javascript:alert(1)','ftp://example.com','http://localhost:3000','http://127.0.0.1','http://[::1]/','http://user:pw@example.com','https://example.com:8443','http://router.local','http://svc.internal','http://10.0.0.8','http://192.168.1.1','http://169.254.169.254/latest','not a url'])
    assert.throws(()=>checkResearchURL(url),{code:'RESEARCH_URL_BLOCKED'},url);
});

test('public address check covers private, loopback, link-local and mapped IPv6',()=>{
  for(const ip of ['93.184.216.34','2606:4700::6810:85e5','2001:4860:4860::8888'])assert.equal(isPublicAddress(ip),true,ip);
  for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.0.5','100.64.0.1','169.254.1.1','::1','::','fe80::1','fc00::1','fd12:3456::1','::ffff:127.0.0.1','::ffff:10.0.0.1','ff02::1','2001:db8::1','not-an-ip'])assert.equal(isPublicAddress(ip),false,ip);
});

test('host guard blocks names that resolve to private addresses and caches answers',async()=>{
  let lookups=0;
  const guard=createHostGuard({lookup:async host=>{lookups++;return host==='rebind.example'?[{address:'93.184.216.34'},{address:'10.0.0.1'}]:host==='fail.example'?Promise.reject(Object.assign(Error('nx'),{code:'ENOTFOUND'})):[{address:'93.184.216.34'}];}});
  assert.equal(await guard('www.example.com'),true);
  assert.equal(await guard('www.example.com'),true);
  assert.equal(lookups,1);
  assert.equal(await guard('rebind.example'),false);
  assert.equal(await guard('fail.example'),false);
  assert.equal(await guard('127.0.0.1'),false);
  assert.equal(await guard('93.184.216.34'),true);
  assert.equal(await guard('localhost'),false);
});
