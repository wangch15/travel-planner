const test = require('node:test');
const assert = require('node:assert/strict');
const { readDoc, section } = require('./helpers/doc-contracts.js');
const wording = '要求搜尋引擎不要收錄，但那是請求不是保證；任何拿到網址的人都能開啟';

function privacyContract(text) {
  assert.ok(text.includes(wording), '收錄指示只是請求，不能保證；網址持有人仍可開啟');
  assert.match(text, /不是密碼保護/);
  assert.ok(!/不會被搜尋引擎收錄|搜尋引擎不會收錄/.test(text), '不能同段又保留不收錄保證');
}

const passages = [
  ['privacy rule', () => section(readDoc('.ai/rules/privacy.md'), '## 網站的隱私程度要講清楚')],
  ['README FAQ', () => readDoc('README.md').split('**這個網站別人看得到嗎？**')[1].split('**要花錢嗎？**')[0]],
  ['README 技術隱私說明', () => section(readDoc('README.md'), '## 隱私')],
  ['setup 部署說明', () => readDoc('.ai/skills/tp-setup/SKILL.md').split('### 6. 說明部署會發生什麼')[1].split('## 網址會長')[0]],
];
for (const [name, get] of passages) test(`${name}：不收錄請求不等於保證或存取保護`, () => privacyContract(get()));

test('變異：改成保證或移除拿到網址能開啟的提醒都會失敗', () => {
  const good = passages[0][1]();
  privacyContract(good);
  assert.throws(() => privacyContract(good.replace('請求不是保證', '保證不收錄')));
  assert.throws(() => privacyContract(good.replace('任何拿到網址的人都能開啟', '只有本人能開啟')));
  assert.throws(() => privacyContract(good.replace('不是密碼保護', '有密碼保護')));
});
