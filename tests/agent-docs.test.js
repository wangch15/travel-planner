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

test('HELPER.md 的 prompt 只做環境準備，辦帳號是給人看的白話說明', () => {
  assert.ok(exists('HELPER.md'), '缺 HELPER.md');
  const h = read('HELPER.md');
  const blocks = [...h.matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.equal(blocks.length, 1, `HELPER 應該只有一段 prompt，實際 ${blocks.length}`);
  const boot = blocks[0];

  // 環境準備該做的都要在 prompt 裡
  for (const w of ['Node.js', 'git', 'gh auth login', 'gh auth status']) {
    assert.ok(boot.includes(w), `環境 prompt 缺 ${w}`);
  }
  // 辦帳號不該在 prompt 裡——那是人自己先做完的事
  for (const w of ['github.com/signup', 'dash.cloudflare.com', '辦兩個', '註冊']) {
    assert.ok(!boot.includes(w), `prompt 不該要 AI 帶著辦帳號：出現了「${w}」`);
  }
  assert.ok(/已經辦好 GitHub 帳號/.test(boot), 'prompt 要說明帳號已經辦好了');
  // 但整份文件要有給人看的註冊說明
  assert.ok(h.includes('https://github.com'), 'HELPER 要有 GitHub 註冊連結');
  assert.ok(h.includes('https://dash.cloudflare.com/sign-up'), 'HELPER 要有 Cloudflare 註冊連結');

  assert.ok(!boot.includes('wangch15/travel-planner'), '環境 prompt 不該需要 repo 權限');
  assert.ok(/不要.*猜|卡在哪/.test(boot), '要有「卡住就說、不要猜」');
  assert.ok(read('README.md').includes('HELPER.md'), 'README 要連到 HELPER.md');
});

test('辦帳號的說明有講到 Cloudflare 會影響公開網址', () => {
  const h = read('HELPER.md');
  assert.ok(h.includes('workers.dev'), 'HELPER 要說明網址的形式');
  assert.ok(/你自己選|自己改掉|自己決定/.test(h), '要提醒使用者那段代號可以自己選');
  assert.ok(/舊網址.*失效|失效/.test(h), '要講明改掉之後舊網址會失效');
  // tp-setup 要教 agent 停下來問，而不是直接採用預設
  const setup = read('.ai/skills/tp-setup/SKILL.md');
  assert.ok(setup.includes('workers.dev'), 'tp-setup 要說明網址組成');
  assert.ok(/不要直接採用.*預設值/.test(setup), 'tp-setup 要禁止直接採用預設子網域');
  assert.ok(setup.includes('deploy.name'), 'tp-setup 要提到行程名稱那一段也會公開');
});

test('網址說明有完整的實際範例，看得出 email 與代號的關聯', () => {
  const h = read('HELPER.md');
  assert.ok(/[a-z0-9-]+\.[a-z0-9]+\.workers\.dev/.test(h), 'HELPER 要有一個完整的範例網址');
  assert.ok(h.includes('@'), '要有 email 範例，才看得出代號是從哪來的');
  const setup = read('.ai/skills/tp-setup/SKILL.md');
  assert.ok(/[a-z0-9-]+\.[a-z0-9]+\.workers\.dev/.test(setup), 'tp-setup 也要有完整範例供 agent 照唸');
});
