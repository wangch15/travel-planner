const test = require('node:test');
const assert = require('node:assert/strict');
const { readDoc, section, row } = require('./helpers/doc-contracts.js');
const file = '.ai/rules/stage-backup.md';
const warning = '目前只有本機備份，尚未異地備份';

function backupContract(text) {
  const order = section(text, '## 執行順序');
  const checkpoint = order.indexOf('git commit');
  const remote = order.indexOf('git remote get-url --push --all origin');
  const visibility = order.indexOf('gh repo view <origin-owner>/<repo> --json visibility');
  const push = order.indexOf('git push origin HEAD:<已確認的分支>');
  const verify = order.indexOf('git ls-remote origin refs/heads/<已確認的分支>');
  assert.ok(checkpoint >= 0 && checkpoint < remote && remote < visibility && visibility < push && push < verify,
    '本機保存→實際 push 目的地→這次私有查詢→明確 origin 推送→遠端驗證，順序不可省略');
  assert.match(order, /每次[\s\S]*重新[\s\S]*不能沿用/);
  assert.match(order, /只有這次查詢成功且 visibility 為 PRIVATE[\s\S]*才可執行/);
  assert.match(order, /public repo|PUBLIC/);
  assert.match(order, /遠端.*commit[\s\S]*本次.*commit/);
  assert.deepEqual(row(text, '查不到 visibility、gh 未登入或離線'),
    ['查不到 visibility、gh 未登入或離線', `停止，不 push；回報「${warning}」`, '不可回報階段完成']);
  assert.deepEqual(row(text, 'visibility 是 PUBLIC、INTERNAL 或未知值'),
    ['visibility 是 PUBLIC、INTERNAL 或未知值', `停止，不 push；回報「${warning}」`, '不可回報階段完成']);
  assert.deepEqual(row(text, '之前查過 PRIVATE，但這次尚未查'),
    ['之前查過 PRIVATE，但這次尚未查', '重新查核 origin 私有狀態，尚不可 push', '不可回報階段完成']);
  assert.deepEqual(row(text, 'push 失敗或遠端 commit 無法核對'),
    ['push 失敗或遠端 commit 無法核對', `停止；回報「${warning}」；重試前重查私有狀態`, '不可回報階段完成']);
  assert.deepEqual(row(text, '這次 PRIVATE、push 成功且遠端 commit 核對成功'),
    ['這次 PRIVATE、push 成功且遠端 commit 核對成功', '回報本階段與異地備份已完成', '可回報階段完成']);
}

test('階段備份契約：新鮮 PRIVATE 查核是 push 的必要前提，成功還須驗遠端', () => backupContract(readDoc(file)));

for (const [skill, trigger] of [
  ['tp-plan', /閘門一.*通過/], ['tp-research', /研究.*查核/], ['tp-basemap', /底圖.*確認/],
  ['tp-photos', /照片.*確認/], ['tp-maps-lists', /對帳.*通過/],
  ['tp-ship', /第一次部署.*維護/], ['tp-update', /更新.*驗證/],
]) {
  test(`${skill} 把保存列為完成條件，不只是提到 commit`, () => {
    const text = readDoc(`.ai/skills/${skill}/SKILL.md`);
    const save = section(text, '## 階段保存（完成條件）');
    assert.match(save, trigger);
    assert.match(save, /stage-backup\.md/);
    assert.match(save, /每次 push 前[\s\S]*origin[\s\S]*私有/);
    assert.match(save, /備份.*成功[\s\S]*才.*完成/);
    assert.ok(save.includes(warning));
  });
}

test('ownership、入口與 setup 接上每次 push 的 guard，不留 create --push 捷徑', () => {
  for (const file of ['.ai/rules/repo-ownership.md', '.ai/skills/tp-setup/SKILL.md']) {
    const doc = readDoc(file);
    assert.match(doc, /stage-backup\.md/);
    assert.ok(!/gh repo create[^\n]*--push/.test(doc), `${file} 建 repo 時仍隱含推送，沒有機會先查私有`);
  }
  assert.match(readDoc('.ai/entrypoints/project-context.md'), /stage-backup\.md/);
  assert.match(readDoc('.ai/rules/research-integrity.md'), /stage-backup\.md/);
});

test('使用者文件分清楚本機 commit、網站上線與已核對的異地備份', () => {
  const how = readDoc('docs/how-it-works.md');
  assert.match(how, /commit 只.*本機[\s\S]*push[\s\S]*核對[\s\S]*異地備份/);
  const readme = readDoc('README.md');
  assert.match(readme, /階段.*保存[\s\S]*每次.*私有/);
  assert.ok(readme.includes(warning));
});

test('變異：省略 gh、先 push、以 PUBLIC 放行、離線也說完成均被拒絕', () => {
  const good = readDoc(file);
  backupContract(good);
  for (const broken of [
    good.replace('gh repo view <origin-owner>/<repo> --json visibility', 'echo 上次查過了'),
    good.replace('git remote get-url --push --all origin', 'git push origin HEAD:<已確認的分支>'),
    good.replace('只有這次查詢成功且 visibility 為 PRIVATE', '只有這次查詢成功且 visibility 為 PUBLIC'),
    good.replace(`停止，不 push；回報「${warning}」`, '直接 push，回報完成'),
  ]) assert.throws(() => backupContract(broken));
});
