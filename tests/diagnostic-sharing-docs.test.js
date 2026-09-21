const test = require('node:test');
const assert = require('node:assert/strict');
const { readDoc, section, row } = require('./helpers/doc-contracts.js');
const file = '.ai/rules/diagnostic-sharing.md';

function sharingContract(text) {
  const steps = section(text, '## 對外分享順序');
  const sanitize = steps.indexOf('1. 由 agent');
  const inspect = steps.indexOf('2. 逐項檢查');
  const review = steps.indexOf('3. 把最終摘要');
  const send = steps.indexOf('4. 使用者明確同意後');
  assert.ok(sanitize >= 0 && sanitize < inspect && inspect < review && review < send,
    'agent 最小化／去識別化→複查→給人看→人同意才送，不能顛倒');
  assert.match(steps, /不是請使用者自己.*辨認/);
  assert.deepEqual(row(text, '尚未由 agent 去識別化的原始 stack trace'),
    ['尚未由 agent 去識別化的原始 stack trace', 'agent 先產生去識別化的最小診斷摘要', '不可送出']);
  assert.deepEqual(row(text, '無法判斷字串是否為私人資訊'),
    ['無法判斷字串是否為私人資訊', '省略或用假資料重現，不交給人猜', '不可送原文']);
  assert.deepEqual(row(text, '摘要已去識別化，但使用者尚未看過同意'),
    ['摘要已去識別化，但使用者尚未看過同意', '顯示最終摘要、收件對象及公開程度，停下來等', '不可送出']);
  assert.deepEqual(row(text, '使用者已同意該份最終摘要與目的地'),
    ['使用者已同意該份最終摘要與目的地', '只送核准的摘要，不附回原始 log', '可送出']);
  assert.deepEqual(row(text, '確認後又新增內容或附件'),
    ['確認後又新增內容或附件', '重新去識別化並請人確認', '尚不可送出']);
  const removed = section(text, '## agent 必須移除的內容');
  for (const item of ['姓名', '私人網址', '訂單號', '確認碼', '憑證', '本機路徑中的使用者名稱']) {
    assert.ok(removed.includes(item), `去識別化範圍缺 ${item}`);
  }
  assert.match(removed, /截圖[\s\S]*附件/);
}

test('對外分享把辨識與最小化責任交給 agent，再由人確認是否送出', () => sharingContract(readDoc(file)));

test('貢獻規則與共同入口在對外行為之前導向最小診斷摘要', () => {
  assert.match(readDoc('.ai/entrypoints/project-context.md'), /diagnostic-sharing\.md/);
  const contrib = readDoc('.ai/rules/contributing-upstream.md');
  const pointer = contrib.indexOf('diagnostic-sharing.md');
  assert.ok(pointer >= 0 && pointer < contrib.indexOf('gh issue create'), '不能只在送出指令之後才補警告');
  assert.match(contrib, /agent[\s\S]*最小診斷摘要[\s\S]*使用者.*確認/);
});

test('HELPER 不再要求原始錯誤整段外傳，改請 AI 處理後讓人看過', () => {
  const helper = readDoc('HELPER.md');
  assert.ok(!helper.includes('把 AI 給你的錯誤訊息整段貼給我'));
  assert.match(helper, /先請.*AI[\s\S]*去識別化[\s\S]*最小診斷摘要[\s\S]*看過[\s\S]*傳給我/);
  assert.match(helper, /不用你自己.*辨認/);
});

test('bug 模板保留人類警告作第二道，不再要求完整原始錯誤', () => {
  const bug = readDoc('.github/ISSUE_TEMPLATE/bug.md');
  assert.match(bug, /請不要貼上任何個人資料/);
  assert.match(bug, /agent[\s\S]*最小診斷摘要/);
  assert.match(bug, /diagnostic-sharing\.md/);
  assert.ok(!bug.includes('貼上完整的錯誤訊息'));
  assert.match(bug, /核准.*去識別化/);
});

test('README 回報入口也要求 agent 摘要而非讓使用者判斷 stack trace', () => {
  const report = section(readDoc('README.md'), '## 回報問題與貢獻改進');
  assert.match(report, /agent|AI/);
  assert.match(report, /最小診斷摘要[\s\S]*看過[\s\S]*同意[\s\S]*送/);
});

test('變異：把去識別化交給人、未同意就送、確認後附原文都會被擋', () => {
  const good = readDoc(file);
  sharingContract(good);
  for (const broken of [
    good.replace('1. 由 agent', '1. 由使用者'),
    good.replace('顯示最終摘要、收件對象及公開程度，停下來等', '直接送出'),
    good.replace('只送核准的摘要，不附回原始 log', '附回完整原始 log'),
  ]) assert.throws(() => sharingContract(broken));
});
