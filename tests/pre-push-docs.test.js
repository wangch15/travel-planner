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
  assert.deepEqual(row(guard, '其他目的地為 INTERNAL、未知或查核失敗'),
    ['其他目的地為 INTERNAL、未知或查核失敗', '拒絕，說明原因及下一步', '目前只有本機備份，尚未異地備份']);
  assert.deepEqual(row(guard, 'PUBLIC 且推送範圍可信、歷史乾淨'),
    ['PUBLIC 且推送範圍可信、歷史乾淨', '允許乾淨引擎歷史，不依 repo 名稱豁免', '提醒舊資料仍可能已公開']);
  assert.deepEqual(row(guard, 'PUBLIC 且含禁止路徑'),
    ['PUBLIC 且含禁止路徑', '整批拒絕，列出路徑與 commit', '目前只有本機備份，尚未異地備份']);
  assert.deepEqual(row(guard, 'PUBLIC 但範圍或完整歷史無法確認'),
    ['PUBLIC 但範圍或完整歷史無法確認', '拒絕，不把掃不到當成乾淨', '取得可信基準後再查核']);
  assert.match(guard, /remote-sha[\s\S]*local-sha/);
  assert.match(guard, /upstream\/main[\s\S]*stdin/);
  assert.match(guard, /刪除.*沒有新增歷史[\s\S]*查.*目的地/);
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

test('公開貢獻恢復成兩道歷史查核，不是 fork 白名單或停在推送前', () => {
  const rule = readDoc('.ai/rules/contributing-upstream.md');
  assert.match(rule, /pre-push.*再驗一次歷史/);
  assert.match(rule, /乾淨.*分支[\s\S]*放行/);
  assert.match(rule, /夾帶.*trips\/[\s\S]*兩道.*擋/);
  assert.match(rule, /agent 不得.*--no-verify/);
  assert.match(rule, /fork → push → PR.*未.*端到端/);
  assert.match(rule, /^git push contrib contrib-<主題>$/m, '恢復正常貢獻推送步驟，不是刪掉整條路');
  assert.ok(!rule.includes('到此停止：pre-push 會拒絕這個公開 fork'));
});

test('CHANGELOG 保留安裝說明並補上 PUBLIC 歷史驗證的新政策', () => {
  const log = readDoc('CHANGELOG.md');
  assert.match(log, /pre-push[\s\S]*prepare[\s\S]*core\.hooksPath/);
  assert.match(log, /PUBLIC[\s\S]*歷史[\s\S]*乾淨[\s\S]*放行/);
  assert.match(log, /--no-verify/);
});

test('變異：未知目的地放行、缺範圍放行、快取 PRIVATE 都不符合文件契約', () => {
  const good = readDoc('.ai/rules/repo-ownership.md');
  contract(good);
  assert.throws(() => contract(good.replace('拒絕，說明原因及下一步', '直接放行')));
  assert.throws(() => contract(good.replace('| 不快取許可 |', '| 永久放行 |')));
  assert.throws(() => contract(good.replace('拒絕，不把掃不到當成乾淨', '沒有範圍也放行')));
});
