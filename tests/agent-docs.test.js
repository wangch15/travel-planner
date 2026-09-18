const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const SKILLS = ['tp-setup', 'tp-plan', 'tp-research', 'tp-basemap', 'tp-photos', 'tp-ship', 'tp-update', 'tp-maps-lists'];
const RULES = ['engine-content-boundary', 'data-schema-reference', 'research-integrity', 'privacy'];
const REFS = ['places', 'routes', 'parking', 'dining', 'alternatives', 'photos'];

test('八個 tp-* skill 都在', () => {
  for (const s of SKILLS) assert.ok(exists(`.ai/skills/${s}/SKILL.md`), `缺 ${s}`);
});

test('四份 rules 都在', () => {
  for (const r of RULES) assert.ok(exists(`.ai/rules/${r}.md`), `缺 ${r}`);
});

test('tp-research 的六份 reference 都在', () => {
  for (const r of REFS) assert.ok(exists(`.ai/skills/tp-research/references/${r}.md`), `缺 ${r}`);
});

test('每個 npm 指令都有 skill 或 README 提到', () => {
  const cmds = Object.keys(JSON.parse(read('package.json')).scripts)
    .filter((c) => !['test', 'sync:agent-assets'].includes(c));
  const docs = SKILLS.map((s) => read(`.ai/skills/${s}/SKILL.md`)).join('\n') + read('README.md');
  for (const c of cmds) assert.ok(docs.includes(`npm run ${c}`), `沒有任何文件提到 npm run ${c}`);
});

test('AGENTS.md 的路由表涵蓋每一個 skill', () => {
  const agents = read('AGENTS.md');
  for (const s of SKILLS) assert.ok(agents.includes(s), `AGENTS.md 沒有提到 ${s}`);
});

test('GEMINI.md 指向 AGENTS.md', () => {
  assert.ok(read('GEMINI.md').includes('AGENTS.md'));
});

test('三道人類閘門都寫進 skills', () => {
  assert.ok(read('.ai/skills/tp-plan/SKILL.md').includes('閘門一'), 'tp-plan 缺閘門一');
  assert.ok(read('.ai/skills/tp-ship/SKILL.md').includes('閘門二'), 'tp-ship 缺閘門二');
  const all = SKILLS.map((s) => read(`.ai/skills/${s}/SKILL.md`)).join('\n');
  assert.ok(/不代訂|不代替|只給連結/.test(all), '沒有寫明 agent 不代替使用者花錢或註冊');
});

test('privacy 規則列出不得進資料檔的項目', () => {
  const p = read('.ai/rules/privacy.md');
  for (const w of ['飲食限制', '密碼', 'docs/']) assert.ok(p.includes(w), `privacy.md 缺 ${w}`);
});

test('research-integrity 要求附來源與查核日期', () => {
  const r = read('.ai/rules/research-integrity.md');
  assert.ok(r.includes('待確認'));
  assert.ok(/查核日期|查閱日期/.test(r));
});

test('兩個 issue 模板都在，且要求填引擎版本', () => {
  for (const f of ['bug.md', 'feature.md']) {
    assert.ok(exists(`.github/ISSUE_TEMPLATE/${f}`), `缺 ${f}`);
    assert.ok(read(`.github/ISSUE_TEMPLATE/${f}`).includes('版本'), `${f} 沒有要求填版本`);
  }
});

test('skills 與 rules 不含特定行程的專有名詞', () => {
  const all = SKILLS.map((s) => read(`.ai/skills/${s}/SKILL.md`)).join('\n')
    + REFS.map((r) => read(`.ai/skills/tp-research/references/${r}.md`)).join('\n')
    + RULES.map((r) => read(`.ai/rules/${r}.md`)).join('\n');
  for (const w of ['仙台', '山形', '鳴子', '松島', '星宇', 'sendai-2026']) {
    assert.ok(!all.includes(w), `skills/rules 不該出現行程專屬字眼：${w}`);
  }
});

test('README 只有一段 prompt，且假設環境已就緒', () => {
  const r = read('README.md');
  const blocks = [...r.matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.equal(blocks.length, 1, `README 應該只有一段 prompt，實際 ${blocks.length}`);
  const start = blocks[0];
  assert.ok(start.includes('https://github.com/wangch15/travel-planner'), '要帶 repo 網址');
  assert.ok(start.includes('AGENTS.md') && start.includes('tp-setup'), '要指名 AGENTS.md 與 tp-setup');
  assert.ok(/不要.*猜|卡在哪/.test(start), '要有「卡住就說、不要猜」');
  // 前置階段不該出現在 README（那是 agent 讀的檔案，會干擾它）
  assert.ok(!/gh auth login/.test(start), '環境準備不該混進這段');
  assert.ok(!r.includes('dash.cloudflare.com/sign-up'), '註冊連結屬於 HELPER.md，不該在 README');
});

test('HELPER.md 是給作者的前置說明，且不需要 repo 權限就能跑', () => {
  assert.ok(exists('HELPER.md'), '缺 HELPER.md');
  const h = read('HELPER.md');
  const blocks = [...h.matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.equal(blocks.length, 1, `HELPER 應該只有一段 prompt，實際 ${blocks.length}`);
  const boot = blocks[0];
  for (const w of ['github.com', 'dash.cloudflare.com/sign-up', 'Node.js', 'git', 'gh auth login']) {
    assert.ok(boot.includes(w), `前置 prompt 缺 ${w}`);
  }
  assert.ok(!boot.includes('wangch15/travel-planner'), '前置 prompt 不該需要 repo 權限');
  assert.ok(/不要.*猜|卡在哪/.test(boot), '要有「卡住就說、不要猜」');
  assert.ok(read('README.md').includes('HELPER.md'), 'README 要連到 HELPER.md');
});
