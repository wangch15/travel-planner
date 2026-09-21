const test = require('node:test');
const assert = require('node:assert/strict');
const { readDoc, section, row } = require('./helpers/doc-contracts.js');

function contract(doc) {
  const guard = section(doc, '## 最後一道 pre-push');
  assert.match(guard, /argv[\s\S]*URL[\s\S]*不.*重新.*remote/);
  assert.match(guard, /每次[\s\S]*README[\s\S]*刪除/);
  assert.match(guard, /--no-verify[\s\S]*刻意/);
  assert.match(guard, /不.*執行.*hook/);
  assert.match(guard, /stage-backup\.md/);
  assert.deepEqual(row(guard, '其他目的地為 PUBLIC、INTERNAL 或查核失敗'),
    ['其他目的地為 PUBLIC、INTERNAL 或查核失敗', '拒絕，說明原因及下一步', '目前只有本機備份，尚未異地備份']);
  assert.deepEqual(row(guard, '其他目的地本次查核為 PRIVATE'),
    ['其他目的地本次查核為 PRIVATE', '允許這次推送，之後仍須核對備份結果', '不快取許可']);
}

test('規則保留第一道，hook 是最後一道；拒絕與繞過邊界不誇大', () => contract(readDoc('.ai/rules/repo-ownership.md')));

test('setup 與 update 都驗安裝；既有 hooksPath 衝突不得直接覆蓋', () => {
  for (const skill of ['tp-setup', 'tp-update']) {
    const doc = readDoc(`.ai/skills/${skill}/SKILL.md`);
    assert.match(doc, /git config --get core\.hooksPath/);
    assert.match(doc, /其他.*hooksPath[\s\S]*不.*覆蓋[\s\S]*人/);
  }
  const readme = readDoc('README.md');
  assert.match(readme, /npm run prepare/);
  assert.match(readme, /--no-verify/);
  assert.match(readme, /Git hooks|Git hook/);
  assert.match(readDoc('.ai/rules/stage-backup.md'), /第一道[\s\S]*最後一道/);
});

test('公開 contrib fork 也會被拒絕，文件不能暗示有自動豁免', () => {
  const rule = readDoc('.ai/rules/contributing-upstream.md');
  assert.match(rule, /公開.*fork[\s\S]*hook.*拒絕/);
  assert.match(rule, /agent 不得.*--no-verify/);
  assert.match(rule, /停止[\s\S]*討論/);
});

test('CHANGELOG 說明 prepare 安裝與公開 contrib 被拒絕的相容性影響', () => {
  const log = readDoc('CHANGELOG.md');
  assert.match(log, /pre-push[\s\S]*prepare[\s\S]*core\.hooksPath/);
  assert.match(log, /公開 contrib fork.*拒絕/);
  assert.match(log, /--no-verify/);
});

test('變異：PUBLIC 放行、快取 PRIVATE 的許可，都不符合文件契約', () => {
  const good = readDoc('.ai/rules/repo-ownership.md');
  contract(good);
  assert.throws(() => contract(good.replace('拒絕，說明原因及下一步', '直接放行')));
  assert.throws(() => contract(good.replace('不快取許可', '永久放行')));
});
