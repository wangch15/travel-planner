const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {extractCodes,findPrivateData,appendPrivateNotes,privateMarkers}=require('../services/private-guard.cjs');

test('booking-style codes are extracted, dates and prices are not',()=>{
  const codes=extractCodes('Booking.com 確認碼 4815.162.342，PIN 7788。Agoda 訂單 1234567890。飯店電話 +81-75-123-4567。入住 2027-03-10，房價 12,800 日圓，Wi-Fi 密碼 kyoto2027stay');
  for(const code of ['4815162342','1234567890','81751234567','KYOTO2027STAY'])assert.ok(codes.includes(code),code);
  for(const code of ['20270310','12800','7788'])assert.equal(codes.includes(code),false,code);
});

test('private codes and connected private hosts are found in candidate files',()=>{
  const markers={codes:['4815162342'],hosts:['booking.com','docs.google.com']};
  assert.equal(findPrivateData(['const DAYS=[{title:"Kyoto"}]'],markers),null);
  assert.match(findPrivateData(['note:"確認碼 4815-162-342"'],markers),/私人筆記/);
  assert.match(findPrivateData(['refs:["https://secure.booking.com/mytrips/abc"]'],markers),/booking\.com/);
  assert.match(findPrivateData(['url:"https://docs.google.com/spreadsheets/d/x"'],markers),/docs\.google\.com/);
  assert.equal(findPrivateData(['url:"https://www.notbooking.com/"'],markers),null);
});

test('private notes append under the trip docs and feed later markers',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'private-guard-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const trip=path.join(root,'trips','sample');await fs.mkdir(trip,{recursive:true});
  await appendPrivateNotes(trip,'Booking.com 確認碼 4815.162.342',{now:()=>new Date('2026-09-24T01:00:00Z')});
  await appendPrivateNotes(trip,'  ',{now:()=>new Date()});
  const text=await fs.readFile(path.join(trip,'docs','private-notes.md'),'utf8');
  assert.match(text,/^# 私人筆記/);assert.match(text,/## 2026-09-24 研究查核（App 自動記錄）\n\nBooking\.com 確認碼 4815\.162\.342/);assert.equal(text.match(/## /g).length,1);
  assert.deepEqual((await privateMarkers(trip,['booking.com'])).codes,['4815162342']);
  await fs.rm(path.join(trip,'docs'),{recursive:true});await fs.symlink(os.tmpdir(),path.join(trip,'docs'));
  await assert.rejects(appendPrivateNotes(trip,'x 12345678'),{code:'UNSAFE_PRIVATE_NOTES'});
});
