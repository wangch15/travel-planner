const test=require('node:test');const assert=require('node:assert/strict');
const {applySuggestedTitle}=require('../conversation-store.cjs');

test('AI title replaces only default conversation names',()=>{
  assert.equal(applySuggestedTitle({conversationTitle:'新的討論'},{conversationTitle:'仙台午餐調整'}).conversationTitle,'仙台午餐調整');
  assert.equal(applySuggestedTitle({},{conversationTitle:'整體節奏'}).conversationTitle,'整體節奏');
  // 已經被 AI 命名過的對話，之後的回覆不再改名
  assert.equal(applySuggestedTitle({conversationTitle:'仙台午餐調整'},{conversationTitle:'別的主題'}).conversationTitle,'仙台午餐調整');
});

test('a name the user set is kept, even if it equals a default name',()=>{
  assert.equal(applySuggestedTitle({conversationTitle:'我的討論',conversationTitleCustom:true},{conversationTitle:'AI 的名字'}).conversationTitle,'我的討論');
  assert.equal(applySuggestedTitle({conversationTitle:'新的討論',conversationTitleCustom:true},{conversationTitle:'AI 的名字'}).conversationTitle,'新的討論');
});

test('replies without a title leave the name unchanged',()=>{
  assert.equal(applySuggestedTitle({conversationTitle:'新的討論'},{summary:'x'}).conversationTitle,'新的討論');
});
