const test=require('node:test');const assert=require('node:assert/strict');
const {historyEntries,createNavigator,caretOnFirstLine,caretOnLastLine}=require('../composer-history.js');

const conversation=[
  {role:'user',text:'第一句'},{role:'assistant',text:'回覆一'},
  {role:'user',text:'第二句'},{role:'assistant',text:'回覆二'},
  {role:'user',text:'第二句'},{role:'user',text:'  '},{role:'user',text:'第三句'},
];

test('history lists sent user messages newest first, skipping blanks and repeats in a row',()=>{
  assert.deepEqual(historyEntries(conversation),['第三句','第二句','第一句']);
  assert.deepEqual(historyEntries([]),[]);
  assert.deepEqual(historyEntries(undefined),[]);
});

test('up walks to older messages and stops at the oldest',()=>{
  const nav=createNavigator(()=>historyEntries(conversation));
  assert.equal(nav.up(''),'第三句');
  assert.equal(nav.up('第三句'),'第二句');
  assert.equal(nav.up('第二句'),'第一句');
  assert.equal(nav.up('第一句'),null);
});

test('an unsent draft comes back after walking down past the newest message',()=>{
  const nav=createNavigator(()=>historyEntries(conversation));
  assert.equal(nav.up('還沒送出的草稿'),'第三句');
  assert.equal(nav.up('第三句'),'第二句');
  assert.equal(nav.down('第二句'),'第三句');
  assert.equal(nav.down('第三句'),'還沒送出的草稿');
  assert.equal(nav.down('還沒送出的草稿'),null);
  assert.equal(nav.browsing,false);
});

test('down does nothing when not browsing history',()=>{
  const nav=createNavigator(()=>historyEntries(conversation));
  assert.equal(nav.down('草稿'),null);
});

test('edits to a recalled message survive moving away and back',()=>{
  const nav=createNavigator(()=>historyEntries(conversation));
  nav.up('草稿');
  assert.equal(nav.up('第三句（改過）'),'第二句');
  assert.equal(nav.down('第二句'),'第三句（改過）');
  assert.equal(nav.down('第三句（改過）'),'草稿');
});

test('sending resets browsing and forgets edits',()=>{
  const nav=createNavigator(()=>historyEntries(conversation));
  nav.up('草稿');nav.up('第三句（改過）');
  nav.reset();
  assert.equal(nav.browsing,false);
  assert.equal(nav.up(''),'第三句');
});

test('an empty history leaves the composer alone',()=>{
  const nav=createNavigator(()=>[]);
  assert.equal(nav.up('草稿'),null);
  assert.equal(nav.browsing,false);
});

test('history is read fresh when browsing starts, so a new conversation starts clean',()=>{
  let messages=conversation;const nav=createNavigator(()=>historyEntries(messages));
  nav.up('');nav.reset();messages=[{role:'user',text:'新對話'}];
  assert.equal(nav.up(''),'新對話');
  assert.equal(nav.up('新對話'),null);
});

test('arrow keys only reach history from the first or last line of the text',()=>{
  assert.equal(caretOnFirstLine('一行',0,0),true);
  assert.equal(caretOnFirstLine('第一行\n第二行',2,2),true);
  assert.equal(caretOnFirstLine('第一行\n第二行',5,5),false);
  assert.equal(caretOnFirstLine('第一行\n第二行',0,5),false);
  assert.equal(caretOnLastLine('第一行\n第二行',5,5),true);
  assert.equal(caretOnLastLine('第一行\n第二行',2,2),false);
  assert.equal(caretOnLastLine('一行',1,1),true);
});
