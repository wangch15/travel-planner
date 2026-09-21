const test = require('node:test');
const assert = require('node:assert/strict');
const { readDoc, section, row } = require('./helpers/doc-contracts.js');
const SKILLS = ['tp-setup', 'tp-plan', 'tp-research', 'tp-basemap', 'tp-photos', 'tp-maps-lists', 'tp-ship', 'tp-update'];
const fields = ['目前階段', '等待確認', '阻礙', '下一步'];

function progressContract(doc) {
  const procedure = section(doc, '## 更新順序');
  const target = procedure.indexOf('1. 先確認');
  const update = procedure.indexOf('2. 更新');
  const save = procedure.indexOf('3. 保存');
  const reply = procedure.indexOf('4. 回覆');
  assert.ok(target >= 0 && target < update && update < save && save < reply, '先確認目標，再更新、保存、回覆');
  for (const f of fields) assert.ok(procedure.includes(f));
  assert.match(procedure, /stage-backup\.md/);
  assert.match(doc, /不是.*人類同意.*證明/);
  assert.deepEqual(row(doc, '內容驗證通過，準備結束 skill'),
    ['內容驗證通過，準備結束 skill', '先更新四欄，再依階段保存規則備份', '備份核對成功才回報階段完成']);
  assert.deepEqual(row(doc, '等待 plan、preview 或其他人類決定'),
    ['等待 plan、preview 或其他人類決定', '更新等待確認的具體問題與下一步，停下來等', '不可當作已同意']);
  assert.deepEqual(row(doc, '工具失敗、查核未通過或工作暫停'),
    ['工具失敗、查核未通過或工作暫停', '記錄實際階段、阻礙與可執行下一步，不勾完成', '回報未完成與原因']);
  assert.deepEqual(row(doc, 'push 失敗或離線'),
    ['push 失敗或離線', '更新阻礙與下一步，只保存本機', '目前只有本機備份，尚未異地備份']);
  assert.deepEqual(row(doc, '尚無行程目錄、slug 未確定或 ownership 未通過'),
    ['尚無行程目錄、slug 未確定或 ownership 未通過', '不寫 trips/；先在回話交接四欄與未寫入原因', '不得猜行程或提前建目錄']);
}

test('既有 status.md 的事件→更新→回報契約，不把等待或備份失敗寫成完成', () => {
  progressContract(readDoc('.ai/rules/progress-tracking.md'));
});

for (const skill of SKILLS) {
  test(`${skill} 完成與暫停都必須寫 status，且在階段保存之前`, () => {
    const doc = readDoc(`.ai/skills/${skill}/SKILL.md`);
    const hook = section(doc, '## 進度交接（完成或暫停時）');
    assert.match(hook, /完成[\s\S]*暫停[\s\S]*阻礙[\s\S]*回覆前更新/);
    assert.match(hook, /trips\/<slug>\/docs\/status\.md/);
    assert.match(hook, /progress-tracking\.md/);
    for (const f of fields) assert.ok(hook.includes(f), `${skill} 缺 ${f}`);
    if (skill !== 'tp-setup') {
      assert.ok(doc.indexOf('## 進度交接（完成或暫停時）') < doc.indexOf('## 階段保存（完成條件）'),
        '先寫 status，再 commit/push，避免保存到的是舊進度');
    }
  });
}

test('setup 無行程時只回話；plan 在 new 成功後才補交接，不破壞建立順序', () => {
  const setup = section(readDoc('.ai/skills/tp-setup/SKILL.md'), '## 進度交接（完成或暫停時）');
  assert.match(setup, /尚無行程[\s\S]*不.*建立[\s\S]*回話/);
  const plan = readDoc('.ai/skills/tp-plan/SKILL.md');
  assert.match(plan, /new 成功後[\s\S]*setup[\s\S]*status\.md/);
});

test('新骨架保留內容進度且有四欄；入口指向如何寫，不再只叫人讀', () => {
  const template = readDoc('scripts/templates/docs/status.md');
  for (const f of fields) assert.ok(template.includes(`## ${f}`), `模板缺 ${f}`);
  for (const existing of ['brief', 'plan', 'research', 'basemap', 'photos', 'shipped']) {
    assert.ok(template.includes(existing), `保留原本的 ${existing} 進度`);
  }
  assert.match(template, /尚未開始|尚未記錄/);
  assert.match(template, /不代表備份成功/);
  const ctx = readDoc('.ai/entrypoints/project-context.md');
  assert.match(ctx, /完成.*暫停[\s\S]*progress-tracking\.md/);
});

test('提早返回也要交接：已是最新與 Maps 未啟用不能直接略過進度', () => {
  const update = readDoc('.ai/skills/tp-update/SKILL.md').split('\n').find((s) => s.startsWith('如果沒有落後'));
  assert.match(update, /進度交接.*結束/);
  const maps = readDoc('.ai/skills/tp-maps-lists/SKILL.md').split('## 順序很重要')[0];
  assert.match(maps, /false[\s\S]*進度交接[\s\S]*未啟用/);
});

test('不可寫入的前提優先，單純離線仍保留已確認行程的本機進度', () => {
  const doc = readDoc('.ai/rules/progress-tracking.md');
  const table = section(doc, '## 條件 → 動作');
  assert.ok(table.indexOf('| 尚無行程目錄、slug 未確定或 ownership 未通過 |') < table.indexOf('| push 失敗或離線 |'),
    'ownership／目錄例外先於一般更新動作');
  assert.match(table, /不能寫入.*優先[\s\S]*已確認可寫/);
  assert.match(doc, /單純離線.*本機進度/);
  assert.ok(!doc.includes('私有查核未通過則先停止寫入'), '不能把無法連線與已知公開／歸屬不明混為一談');
});

test('變異：不更新就結束、等待視為點頭、無 slug 先建目錄都會被抓到', () => {
  const good = readDoc('.ai/rules/progress-tracking.md');
  progressContract(good);
  for (const broken of [
    good.replace('先更新四欄，再依階段保存規則備份', '直接結束，不更新'),
    good.replace('不可當作已同意', '可當作已同意'),
    good.replace('不寫 trips/；先在回話交接四欄與未寫入原因', '先建立一個猜測的行程目錄'),
  ]) assert.throws(() => progressContract(broken));
});
