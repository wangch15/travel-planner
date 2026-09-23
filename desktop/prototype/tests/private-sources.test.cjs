const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {judgeSite,PrivateSources}=require('../services/private-sources.cjs');
const {mapsRouteURL,routeExcerpt,sheetExportURL,pageKey}=require('../services/research-browser.cjs');

test('ordinary booking, travel and note sites are accepted without a fixed list',()=>{
  for(const [raw,host] of [['https://www.booking.com/mytrips','booking.com'],['secure.booking.com','secure.booking.com'],['https://www.agoda.com/zh-tw/account/bookings.html','agoda.com'],['https://www.jalan.net/','jalan.net'],['https://travel.rakuten.co.jp/','travel.rakuten.co.jp'],['https://www.notion.so/My-trip','notion.so'],['https://docs.google.com/spreadsheets/d/abc','docs.google.com'],['https://www.small-ryokan-kyoto.jp/reserve','small-ryokan-kyoto.jp'],['https://www.hotels.com/','hotels.com'],['https://www.trip.com/','trip.com']])
    assert.equal(judgeSite(raw).host,host,raw);
});

test('odd sites are refused with a human reason',()=>{
  const cases={
    PRIVATE_SITE_NOT_HTTPS:['http://www.booking.com'],PRIVATE_SITE_LOCAL:['https://192.168.1.10','https://nas.local','https://localhost'],
    PRIVATE_SITE_LOOKALIKE:['https://www.b00king.com','https://agodda.com','https://booking-secure-login.com','https://www.xn--bking-gra.com','https://www.bоoking.com','https://airbnb-verify.net'],
    PRIVATE_SITE_SHORTENER:['https://bit.ly/abc','https://reurl.cc/xyz','https://maps.app.goo.gl/abc'],
    PRIVATE_SITE_CATEGORY:['https://mail.google.com/mail/u/0','https://outlook.live.com','https://www.paypal.com','https://www.facebook.com','https://drive.google.com','https://ebank.example-bank.com.tw','https://1password.com'],
    PRIVATE_SITE_INVALID:['https://user:pw@booking.com','https://booking.com:8443'],
  };
  for(const [code,urls] of Object.entries(cases))for(const url of urls)assert.throws(()=>judgeSite(url),error=>{assert.equal(error.code,code,url);assert.ok(error.hint&&!/^[A-Z_]+$/.test(error.hint),url);return true;});
});

test('connected hosts allow only themselves and subdomains, persist, and can be removed',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'private-sources-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const sources=new PrivateSources(dir,{now:()=>new Date('2026-09-24T00:00:00Z')});await sources.load();
  await sources.add('https://www.booking.com');await sources.add('docs.google.com');await sources.add('https://booking.com/again');
  assert.deepEqual(sources.list(),[{host:'booking.com',addedAt:'2026-09-24T00:00:00.000Z'},{host:'docs.google.com',addedAt:'2026-09-24T00:00:00.000Z'}]);
  for(const url of ['https://booking.com/x','https://secure.booking.com/mytrips','https://docs.google.com/spreadsheets/d/1'])assert.equal(sources.allows(url),true,url);
  for(const url of ['https://mail.google.com/','https://www.google.com/','https://notbooking.com/','https://booking.com.evil.example/','http://booking.com/','not a url'])assert.equal(sources.allows(url),false,url);
  const again=new PrivateSources(dir);await again.load();assert.equal(again.list().length,2);
  assert.equal(await again.remove('booking.com'),true);assert.equal(again.allows('https://booking.com/x'),false);
  await assert.rejects(again.add('https://gmail.com'),{code:'PRIVATE_SITE_CATEGORY'});
});

test('maps route URLs, route excerpts, sheet exports and page keys',()=>{
  const url=new URL(mapsRouteURL({origin:'京都車站',destination:'清水寺',mode:'transit'}));
  assert.equal(url.origin+url.pathname,'https://www.google.com/maps/dir/');assert.equal(url.searchParams.get('origin'),'京都車站');assert.equal(url.searchParams.get('travelmode'),'transit');
  assert.throws(()=>mapsRouteURL({origin:'',destination:'x',mode:'driving'}),{code:'INVALID_ROUTE'});assert.throws(()=>mapsRouteURL({origin:'a',destination:'b',mode:'flying'}),{code:'INVALID_ROUTE'});
  const excerpt=routeExcerpt('路線\n複製連結\n\n10 分\n3.3 公里\n途經河原町通和五条通\n最快路線');
  assert.match(excerpt.routes,/10 分\n3\.3 公里\n途經河原町通和五条通/);assert.equal(excerpt.quote,'10 分\n3.3 公里\n途經河原町通和五条通');assert.equal(routeExcerpt('沒有路線'),null);
  assert.equal(sheetExportURL('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=42'),'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=csv&gid=42');
  assert.equal(sheetExportURL('https://www.notion.so/page'),null);
  assert.equal(pageKey('https://example.com/a/#x'),'https://example.com/a');
});
