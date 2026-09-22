const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const SKILLS = ['tp-setup', 'tp-plan', 'tp-research', 'tp-basemap', 'tp-photos', 'tp-ship', 'tp-update', 'tp-maps-lists'];
const RULES = ['engine-content-boundary', 'data-schema-reference', 'research-integrity', 'privacy', 'contributing-upstream', 'which-trip'];
const REFS = ['places', 'routes', 'parking', 'dining', 'alternatives', 'photos'];

test('八個 tp-* skill 都在', () => {
  for (const s of SKILLS) assert.ok(exists(`.ai/skills/${s}/SKILL.md`), `缺 ${s}`);
});

test('rules 都在', () => {
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

test('機制說明在，而且 README 連得過去', () => {
  assert.ok(exists('docs/how-it-works.md'), '缺 docs/how-it-works.md');
  const how = read('docs/how-it-works.md');
  for (const w of ['進 git', '進產物', 'upstream', 'schemaVersion']) {
    assert.ok(how.includes(w), `機制說明缺 ${w}`);
  }
  assert.ok(read('README.md').includes('docs/how-it-works.md'), 'README 要連到機制說明');
});

test('版本落後有偵測機制，而且明講不會自己更新', () => {
  const ctx = read('.ai/entrypoints/project-context.md');
  assert.ok(ctx.includes('npm run update-check'), '開工流程要跑 update-check');
  assert.ok(/不要自己決定|問他要不要/.test(ctx), '要明講更新是人的決定');
  assert.ok(read('scripts/update-check.js').includes('只回報'), 'update-check 要自己說明它不更新');
});

test('回饋管道：PR 模板在，而且擋得住夾帶的行程資料', () => {
  assert.ok(exists('.github/PULL_REQUEST_TEMPLATE.md'), '缺 PR 模板');
  const pr = read('.github/PULL_REQUEST_TEMPLATE.md');
  assert.ok(pr.includes('npm run contrib-check'), 'PR 模板要要求跑 contrib-check');
  assert.ok(pr.includes('版本'), 'PR 模板要求填引擎版本');
  const rule = read('.ai/rules/contributing-upstream.md');
  assert.ok(/現在的行為是錯的/.test(rule), '要給出改進 vs 取捨的判準');
  assert.ok(/fork 一定是公開的/.test(rule), '要說明 fork 為什麼是公開的');
  assert.ok(rule.includes('npm run contrib-check'), '規則要指向那道閘門');
});

test('contrib-check 的文件承諾限於本機完整新增歷史的路徑檢查', () => {
  const rule = read('.ai/rules/contributing-upstream.md');
  assert.match(rule, /base\.\.HEAD/);
  for (const requirement of ['新增後刪除', '改名', '合併', '非零退出碼', '停止', '不檢查檔案內容']) {
    assert.ok(rule.includes(requirement), `貢獻閘門文件缺少：${requirement}`);
  }
  // 這一段的一半（contrib-check → hook → push → gh pr create）已於 2026-09-22 實測；
  // 仍未驗的是 gh repo fork 與跨帳號 push，守門點在「那一半必須仍被標示為未驗」。
  assert.match(rule, /未驗/, '不得聲稱整條貢獻路徑已驗證');
  assert.match(rule, /gh repo fork/, '未驗的那一段要指名是哪一段');
  assert.ok(!rule.includes('目前只檢查最終差異'), '修復後不能仍把舊行為當成現況');
});

test('plan 首次 profile 只在閘門一通過後建立，骨架不算填正式資料', () => {
  const plan = read('.ai/skills/tp-plan/SKILL.md');
  const beforeCollecting = plan.split(/^### 1\./m)[0];
  assert.match(beforeCollecting, /檔案不存在[\s\S]*閘門一通過後.*建立/);
  assert.ok(!/第 5 步之前把它建起來/.test(plan), '不能同時要求確認前建立 profile');
  assert.match(plan, /確認前只允許.*建立空白骨架/);
  assert.match(plan, /不得填入正式行程內容/);
  assert.match(plan, /閘門一通過之後[\s\S]*第一趟.*建立檔案/);
});

test('明確指定零或多趟匹配時停止，不能沿用前文或唯一行程', () => {
  const r = read('.ai/rules/which-trip.md');
  const order = r.split('## 判斷順序')[1].split('## ')[0];
  assert.match(order, /零.*多.*停下來問/);
  assert.match(order, /不得.*沿用.*前文/);
  assert.match(order, /完全沒有指定/);
  assert.ok(order.indexOf('明確指定') < order.indexOf('只有一趟'), '明確指定的歧義處理必須優先');
  assert.ok(!order.includes('對得上多趟就往下走'), '不能讓多重匹配回退到前文');
  assert.match(read('.ai/entrypoints/project-context.md'), /指定.*不唯一.*先問/);
});

test('「上次在弄」的最後更新只能用來提出候選並等待確認', () => {
  const r = read('.ai/rules/which-trip.md');
  assert.match(r, /「我上次在弄的那個」.*候選.*確認/);
  assert.ok(!r.includes('「我上次在弄的那個」用最後更新回答'));
  assert.match(r, /不要用「最近改過的那個」當預設/);
});

test('更新衝突先停止再看歸屬與紀錄，不以路徑一律選邊', () => {
  const update = read('.ai/skills/tp-update/SKILL.md');
  const policy = update.split('## 衝突策略')[1];
  assert.match(policy, /先停止/);
  assert.match(policy, /trips\/_example\/[\s\S]*引擎/);
  assert.match(policy, /engine-changes\.md/);
  assert.match(policy, /沒有記錄[\s\S]*問使用者/);
  assert.ok(!/git checkout --(?:ours|theirs)/.test(policy), '不能保留一律覆蓋某邊的指令');
  assert.ok(!/\*\*取上游\*\*|\*\*取本地\*\*/.test(policy));
  assert.match(policy, /逐項[\s\S]*保留/);
  assert.match(policy, /npm run check -- <slug>/);
});

test('README 更新說明承認 migrate 可能改寫資料檔', () => {
  const r = read('README.md');
  const section = r.split('**模板有更新的話？**')[1].split('---')[0];
  assert.match(section, /migrate[\s\S]*改寫.*資料檔/);
  assert.ok(!section.includes('你的行程資料不會被動到'));
});

test('README 私人筆記說明包含私有 GitHub 備份，不宣稱只在本機', () => {
  const r = read('README.md');
  const section = r.split('**這個網站別人看得到嗎？**')[1].split('**要花錢嗎？**')[0];
  assert.match(section, /私人.*筆記|筆記/);
  assert.match(section, /私有 GitHub/);
  assert.match(section, /不會進入網站/);
  assert.ok(!section.includes('只會留在你自己電腦'));
});

test('README 指令分成行程級與 repo 級，不能一概帶 slug', () => {
  const r = read('README.md');
  assert.ok(!r.includes('所有指令都吃一個'));
  assert.ok(r.includes('### 行程級指令'), '缺行程級指令分類');
  assert.ok(r.includes('### Repo 級指令'), '缺 repo 級指令分類');
  const trip = r.split('### 行程級指令')[1].split('### Repo 級指令')[0];
  const repo = r.split('### Repo 級指令')[1].split('## ')[0];
  const repoCommands = ['trips', 'update-check', 'contrib-check', 'sync:agent-assets', 'prepare', 'test'];
  for (const c of Object.keys(JSON.parse(read('package.json')).scripts)) {
    const command = c === 'test' ? 'npm test' : `npm run ${c}`;
    assert.ok((repoCommands.includes(c) ? repo : trip).includes(command), `${command} 分類錯誤或缺漏`);
  }
  assert.ok(!repo.includes('<slug>'), 'repo 級指令不能套用行程 slug');
  assert.match(repo, /contrib-check.*base/);
  assert.match(trip, /new.*必須.*slug/);
});

test('共同入口與機制文件也限定行程級指令才帶 slug', () => {
  for (const file of ['.ai/entrypoints/project-context.md', 'docs/how-it-works.md', 'README.md']) {
    const doc = read(file);
    assert.ok(doc.includes('行程級指令'), `${file} 缺行程級分類`);
    assert.ok(!/每個指令都要|每個指令都指定/.test(doc), `${file} 仍把 repo 級指令包含進去`);
  }
});

for (const file of ['README.md', '.ai/rules/privacy.md', '.ai/skills/tp-plan/SKILL.md', 'docs/schema/trip-config.md']) {
  test(`${file}：sections 關閉不代表資料不進 HTML`, () => {
    const doc = read(file);
    assert.match(doc, /sections[\s\S]*關閉[\s\S]*仍[\s\S]*HTML/);
    assert.match(doc, /不是隱私保護/);
  });
}

for (const file of ['.ai/skills/tp-research/references/photos.md', '.ai/skills/tp-photos/SKILL.md', 'docs/schema/photos.md']) {
  test(`${file}：官網照片也要再利用許可，check 不保證授權`, () => {
    const doc = read(file);
    assert.match(doc, /官網照片[\s\S]*再利用/);
    assert.match(doc, /credit.*不是授權/);
    assert.match(doc, /sources\.md/);
    assert.match(doc, /查核日期/);
    assert.match(doc, /check.*只.*欄位/);
    assert.match(doc, /不.*保證.*授權/);
  });
}

test('README 照片宣告不能把署名當作官網再利用許可', () => {
  const r = read('README.md');
  const section = r.split('## 授權與資料來源')[1].split('</details>')[0];
  assert.match(section, /官網照片.*再利用許可/);
  assert.match(section, /署名不是授權/);
  assert.match(section, /check.*只.*欄位/);
  assert.ok(!section.includes('官網照片並標明來源——授權不明的一律不收，`npm run check` 會擋'));
});

test('多趟行程時不准猜是哪一趟', () => {
  const r = read('.ai/rules/which-trip.md');
  assert.ok(/不要猜|問他/.test(r), '要明講不能猜');
  assert.ok(r.includes('npm run trips'), '要指向可以看候選的指令');
  assert.ok(/檔案編輯|改檔案/.test(r), '要點出危險的是檔案編輯不是指令');
  const ship = read('.ai/skills/tp-ship/SKILL.md');
  assert.ok(ship.includes('which-trip'), 'tp-ship 的維護流程要指向這條規則');
});

test('閘門二用影響範圍分層，不是用「改了什麼東西」分類', () => {
  const ship = read('.ai/skills/tp-ship/SKILL.md');
  // 舊表格把「換一家餐廳」無條件列為免確認——新餐廳在城市另一頭的話，
  // 那天的車程與抵達時間全錯了，而沒有人看過就上線。
  assert.ok(!/換一家餐廳.*\|\s*不用/.test(ship), '不該再無條件豁免「換一家餐廳」');
  for (const w of ['純呈現', '事實更新', '結構']) {
    assert.ok(ship.includes(w), `閘門二缺「${w}」這一層`);
  }
  assert.ok(/走不走得通|可行性/.test(ship), '事實更新要有升級判準');
  assert.ok(/最高|升級/.test(ship), '混合改動要採最高層級');
  assert.ok(/不確定/.test(ship), '要有「不確定就當結構性」的退路');
  assertGateOrder(ship);
});

test('三處講閘門二範圍的文件不能各講各的', () => {
  const ctx = read('.ai/entrypoints/project-context.md');
  const readme = read('README.md');
  // 進入點與 README 都曾把「換一家店」寫成免確認，跟 tp-ship 的新分層打架
  assert.ok(!/換一家店這類小修改.*直接 ship/.test(ctx), '進入點還留著舊說法');
  assert.ok(!/小修改（換一家店/.test(readme), 'README 還留著舊說法');
  assert.ok(/影響|走得通|可行性/.test(ctx), '進入點要指向影響範圍的判準');
  for (const [name, text] of [['入口', ctx], ['README', readme]]) {
    assert.match(text, /首次[\s\S]*固定第三層[\s\S]*優先/, `${name} 缺例外優先關係`);
    assert.match(text, /照片[\s\S]*版面[\s\S]*看過/, `${name} 缺照片／版面先看過的動作`);
    assert.match(text, /未命中[\s\S]*呈現/, `${name} 純呈現不能覆蓋固定例外`);
  }
});

function assertGateOrder(ship) {
  const scope = ship.split('### 閘門二適用範圍')[1].split('## 第一次部署')[0];
  const fixed = scope.indexOf('#### 固定第三層：優先檢查');
  const questions = scope.indexOf('#### 依序問這三個問題');
  assert.ok(fixed >= 0 && fixed < questions, '固定第三層必須先於任何三問返回路徑');
  const fixedBlock = scope.slice(fixed, questions);
  assert.match(fixedBlock, /命中.*第三層[\s\S]*人看過才 ship/);
  assert.match(fixedBlock, /未命中.*才.*三個問題/);
  const fixedRows = fixedBlock.split('\n').filter((line) => line.startsWith('- '));
  assert.deepEqual(fixedRows, [
    '- 第一次上線',
    '- 改 `trip.config.json`（日期、bbox、`deploy`、`sections`、主題）',
    '- 加減天數、加減地點、改一天的順序',
    '- 重產底圖或換照片',
    '- 改 `theme.css` 或 `extra.js`（版面結構會變）',
  ], '固定第三層條件不能只留在後面的例子裡');
  const q1 = scope.split('**1. ')[1].split('**2. ')[0];
  const q2 = scope.split('**2. ')[1].split('**3. ')[0];
  const q3 = scope.split('**3. ')[1].split('#### ')[0];
  assert.match(q1, /沒有 → \*\*第一層[\s\S]*check[\s\S]*直接 ship/);
  assert.match(q2, /可行性沒變[\s\S]*第二層[\s\S]*查核來源[\s\S]*checked/);
  assert.match(q3, /不確定[\s\S]*第三層[\s\S]*人看過才 ship/);
  const general = scope.split('#### 兩條總則')[1];
  assert.match(general, /一次改了好幾樣.*最高.*層/);
  assert.match(general, /不確定算哪一層.*第三層/);
}

test('可行性檢查包含從入場到後續銜接，而不是只驗抵達時開門', () => {
  const ship = read('.ai/skills/tp-ship/SKILL.md');
  const checks = ship.split('#### 「那天還走不走得通」怎麼判斷')[1].split('#### ')[0];
  assert.match(checks, /不是完整清單/);
  assert.match(checks, /最後入場[\s\S]*停留[\s\S]*末班車[\s\S]*後續預約/);
  assert.match(checks, /任何一條[\s\S]*第三層/);
});

const gateCases = [
  ['換照片，沒有改行程文字', '第三層', '查核後 preview，人看過才 ship'],
  ['只更新票價，沒有命中例外且整天仍可行', '第二層', '查核來源、更新 checked、check 後 ship'],
  ['抵達仍營業，但已過最後入場', '第三層', '重新安排並 preview，人看過才 ship'],
  ['改錯字加換照片的混合修改', '第三層', '採最高層級，preview 後人看過才 ship'],
  ['首次上線，即使只有文字', '第三層', '完整 preview，人看過才 ship'],
];
for (const [condition, level, action] of gateCases) {
  test(`閘門二具體情境：${condition} → ${level}及必要動作`, () => {
    const ship = read('.ai/skills/tp-ship/SKILL.md');
    assertGateOrder(ship);
    const rows = ship.split('\n').filter((line) => line.startsWith('| '))
      .map((line) => line.split('|').slice(1, -1).map((s) => s.trim()));
    assert.deepEqual(rows.find((row) => row[0] === condition), [condition, level, action]);
  });
}

test('守門測試會抓到固定例外後移、混合最高層刪除及不確定改成直接部署', () => {
  const ship = read('.ai/skills/tp-ship/SKILL.md');
  assertGateOrder(ship);
  const start = ship.indexOf('#### 固定第三層：優先檢查');
  const end = ship.indexOf('#### 依序問這三個問題', start);
  const block = ship.slice(start, end);
  const moved = ship.replace(block, '').replace('#### 兩條總則', block + '#### 兩條總則');
  assert.throws(() => assertGateOrder(moved), /固定第三層必須先於/);
  assert.throws(() => assertGateOrder(ship.replace('- 重產底圖或換照片\n', '')), /固定第三層條件/);
  assert.throws(() => assertGateOrder(ship.replace(/.*一次改了好幾樣.*\n/, '')));
  assert.throws(() => assertGateOrder(ship.replace('不確定算哪一層 → 當第三層', '不確定算哪一層 → 直接 ship')));
});

test('fork 指令不能帶 gh 不接受的旗標', () => {
  const rule = read('.ai/rules/contributing-upstream.md');
  // gh 回應：the --remote flag is unsupported when a repository argument is provided
  assert.ok(!/gh repo fork[^\n]*--remote/.test(rule), 'fork 指令不該帶 --remote，gh 會直接拒絕');
  assert.ok(rule.includes('gh repo fork'), '還是要有 fork 指令');
  assert.ok(rule.includes('git remote add contrib'), '帶 repo 參數時 gh 不動 remote，要自己補這一行');
});

test('貢獻流程要標明哪一段實測過、哪一段沒有與為什麼', () => {
  const rule = read('.ai/rules/contributing-upstream.md');
  assert.ok(/已驗|實測/.test(rule), '要說明已驗證的範圍');
  assert.ok(/未驗/.test(rule), '要說明未驗證的範圍');
  // 未驗不是因為偷懶，是 GitHub 不允許同一帳號同時擁有 parent 與 fork
  assert.ok(/parent and fork|同一個帳號|第二個 GitHub 帳號/.test(rule),
    '要寫出作者測不了的原因，否則下一輪還會有人去試');
});

test('_profile.md 要分清楚「這趟特有」與「永久改變」', () => {
  const plan = read('.ai/skills/tp-plan/SKILL.md');
  // 鎖定「寫回 _profile」那一節，避免抓到文件別處不相關的字眼。
  const start = plan.indexOf('把這趟學到的寫回');
  assert.ok(start > 0, '找不到「把這趟學到的寫回 _profile.md」那一節');
  const section = plan.slice(start, plan.indexOf('\n## ', start));

  // 使用者說「這次只有兩個人去」，agent 不該去改共用 profile 的人數——
  // 那會污染下一趟的前提。這趟特有的條件屬於那趟的 trip.config.json。
  assert.ok(/這趟特有|只有這趟|這次特有/.test(section), '這一節要講「這趟特有」的情況');
  assert.ok(/永久|長期/.test(section), '這一節要有「永久改變」的對照');
  assert.ok(section.includes('trip.config.json'), '要指出這趟特有的條件該寫哪裡');
  assert.ok(/不要(改|動|寫進)[^\n]*_profile|_profile[^\n]*不要(改|動)/.test(section),
    '要明講這趟特有的差異不可以寫進 _profile.md');
});

test('--from 帶過來的是複本，不是跟舊行程連動', () => {
  const plan = read('.ai/skills/tp-plan/SKILL.md');
  const start = plan.indexOf('--from` 會帶過來');
  assert.ok(start > 0, '找不到 --from 說明');
  const section = plan.slice(start, start + 900);
  assert.ok(/複本|各自一份|不會連動|不影響(舊|上一趟|前一趟)/.test(section),
    '要講明改新行程的設定不會動到舊行程');
});

test('deploy.target 的 pages 要標成過時並指出遷移方向', () => {
  const schema = read('docs/schema/trip-config.md');
  assert.ok(/過時|deprecated|不建議/.test(schema), 'schema 文件要標明 pages 已過時');
  assert.ok(/workers/.test(schema));
  const ship = read('.ai/skills/tp-ship/SKILL.md');
  assert.ok(/過時|deprecated|不建議/.test(ship), 'tp-ship 要說明 pages 已過時');
});

test('wrangler 自己產生的設定檔要被 gitignore', () => {
  const ig = read('.gitignore');
  assert.ok(/wrangler\.jsonc/.test(ig), 'wrangler pages deploy 會在根目錄產生 wrangler.jsonc');
});

test('repo 名稱撞到時要建議中立名稱，不是 travel-planner-2', () => {
  const setup = read('.ai/skills/tp-setup/SKILL.md');
  const i = setup.indexOf('名稱已存在');
  assert.ok(i > 0, '找不到名稱衝突的處理');
  const section = setup.slice(i, i + 700);
  assert.ok(/中立|不含目的地|不要用目的地/.test(section),
    '要建議中立、不含目的地的名稱——這個 repo 會裝他所有的行程');
  assert.ok(!/travel-planner-2/.test(section), 'travel-planner-2 看不出是什麼，不該當建議');
});

test('force push 的說法：規則與 hook 的實際行為不能打架', () => {
  const backup = read('.ai/rules/stage-backup.md');
  const own = read('.ai/rules/repo-ownership.md');
  const both = backup + own;
  // hook 實測不擋 force push；規則說禁止。要講明那是規則層的禁止，不是 hook 擋得住
  assert.ok(/hook 不會擋|hook 擋不住|不由 hook/.test(both),
    'force push 是規則層的禁止，要說明 hook 不會擋，否則會讓人誤以為被涵蓋');
});

test('多帳號時要提醒 gh auth switch 不會換 git 憑證', () => {
  const setup = read('.ai/skills/tp-setup/SKILL.md');
  assert.ok(/auth setup-git/.test(setup),
    'gh auth switch 不換 git 憑證，push 會回 Repository not found');
});

test('下線要人點頭，而且要在第一次部署時就告知可以關', () => {
  const ship = read('.ai/skills/tp-ship/SKILL.md');
  // 錨定標題，不要抓到前面那句「理由見下面『旅程結束之後』」的引用。
  const i = ship.indexOf('## 旅程結束之後');
  assert.ok(i > 0, 'tp-ship 缺「旅程結束之後」那一節');
  const section = ship.slice(i, ship.indexOf('\n## ', i));
  assert.ok(/不得自行決定|要人明確點頭/.test(section), 'agent 不得自行下線');
  assert.ok(/trips\//.test(section) && /不會動|不會被刪/.test(section), '要講明行程資料不動');
  assert.ok(/查核編號不是同意證明|不代表人已同意/.test(section));
  // 第一次部署就要講，不要等使用者自己想起來
  const first = ship.slice(ship.indexOf('## 第一次部署'), i);
  assert.ok(/可以關|下線/.test(first), '第一次部署時就要告知這件事可以關掉');
  assert.ok(read('.ai/rules/privacy.md').includes('unship'), 'privacy 要提到可以下線');
});

test('取得專案之後要把分支追蹤改到 origin，不能留在公開模板', () => {
  // clone 模板 + remote rename origin upstream 之後，main 追蹤的是 upstream/main。
  // 用 CLI 明確指定 remote 的人不會發現；用 GUI 的人一按 Push 就推向公開模板。
  const setup = read('.ai/skills/tp-setup/SKILL.md');
  assert.ok(/branch -u origin\/main|--set-upstream-to=origin\/main/.test(setup),
    'tp-setup 要把分支追蹤改到 origin');
  assert.ok(/GUI|Desktop|預設/.test(setup), '要說明為什麼——GUI 用預設目標會推錯');
  const update = read('.ai/skills/tp-update/SKILL.md');
  assert.ok(/branch -u origin\/main|--set-upstream-to=origin\/main/.test(update),
    'tp-update 的救援路徑也 clone 模板，同樣要修追蹤');
});
