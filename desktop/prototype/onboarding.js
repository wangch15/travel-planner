// 首次引導：第一次打開 App 時，一步一步帶使用者完成 GitHub → Git → 私人專案 → AI 助手 → Cloudflare（可跳過），
// 最後直接進入第一段規劃。每一步是否完成都由實際狀態判斷（不是勾選紀錄），所以關掉 App 再開會從還沒完成的那一步繼續。
(() => {
  if (!window.travelDesktop) { delete document.body.dataset.onboarding; return; }
  // 引導不需要出現時才露出一般畫面。
  const reveal = () => { if (document.body.dataset.onboarding === 'pending') delete document.body.dataset.onboarding; };
  const feature = async (name, input = {}) => { const r = await window.travelDesktop.feature(name, input); if (!r.ok) throw Error(r.message || '操作未完成'); return r; };
  const root = $('onboarding');
  const STEPS = [['github', 'GitHub'], ['git', 'Git'], ['project', '旅程資料夾'], ['ai', 'AI 助手'], ['cloudflare', 'Cloudflare']];
  let facts = null, saved = { completed: false, cloudflareSkipped: false }, view = null, busy = false, message = null, detail = {};
  let dismissedForSession = false, pollTimer = null, authWatch = null;

  // ---------- 狀態偵測 ----------
  async function detect() {
    // AI 帳號剛啟動時是「檢查中」；等它有結果再判斷，避免把已登入的人當成沒登入。
    for (let i = 0; i < 20; i++) { const list = await feature('provider-accounts').then(r => r.accounts).catch(() => []); if (!list.some(a => ['checking', 'switching'].includes(a.state))) break; await new Promise(r => setTimeout(r, 500)); }
    const [env, github, cloudflare, accounts, state] = await Promise.all([
      feature('environment').catch(() => ({ tools: [] })),
      feature('auth-status', { provider: 'github' }).then(r => r.auth).catch(() => ({ connected: false })),
      feature('auth-status', { provider: 'cloudflare' }).then(r => r.auth).catch(() => ({ connected: false })),
      feature('provider-accounts').then(r => r.accounts).catch(() => []),
      feature('onboarding-state').then(r => r.onboarding).catch(() => saved),
    ]);
    const tool = id => (env.tools || []).find(t => t.id === id);
    saved = state;
    facts = {
      ghTool: tool('gh')?.status === 'ready', git: tool('git')?.status === 'ready', gitVersion: tool('git')?.version,
      codexTool: tool('codex')?.status === 'ready', claudeTool: tool('claude')?.status === 'ready',
      github: Boolean(github?.connected), cloudflare: Boolean(cloudflare?.connected),
      ai: accounts.filter(a => a.state === 'connected').map(a => a.provider || a.id),
      project: Boolean(project),
    };
    facts.done = { github: facts.github, git: facts.git, project: facts.project, ai: facts.ai.length > 0, cloudflare: facts.cloudflare || saved.cloudflareSkipped };
    return facts;
  }
  const firstOpen = () => STEPS.map(([id]) => id).find(id => !facts.done[id]) || 'ready';

  // ---------- 小元件 ----------
  const h = (tag, attrs = {}, ...children) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n[k] = v; else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); } for (const c of children.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c))); return n; };
  const button = (label, onclick, { primary = true, external = false, disabled = false } = {}) => h('button', { type: 'button', class: primary ? 'primary' : '', onclick, disabled }, label, external ? h('span', { class: 'ob-ext', 'aria-hidden': 'true' }, '↗') : null);
  const link = (label, onclick, cls = '') => h('button', { type: 'button', class: 'text-button ' + cls, onclick }, label);
  const status = (text, tone = 'muted') => h('div', { class: 'ob-status ob-' + tone }, h('span', { class: 'ob-dot' }), text);
  const human = text => h('div', { class: 'ob-human' }, h('span', { class: 'ob-badge' }, '需要你'), h('span', {}, text));
  const card = (...children) => h('div', { class: 'ob-card' }, ...children);
  const heading = (title, sub) => h('div', { class: 'ob-heading' }, h('h1', {}, title), sub ? h('p', {}, sub) : null);
  const open = url => feature('open-link', { url }).catch(() => notify('無法開啟瀏覽器，請手動前往：' + url));
  function stepper(current) {
    const index = STEPS.findIndex(([id]) => id === current);
    return h('ol', { class: 'ob-stepper', 'aria-label': '準備進度' }, STEPS.map(([id, label], i) => {
      const done = facts.done[id] && i !== index, state = done ? 'done' : i === index ? 'current' : 'todo';
      return h('li', { class: 'ob-step ob-' + state, 'aria-current': i === index ? 'step' : null }, h('span', { class: 'ob-num' }, done ? '✓' : String(i + 1)), h('span', {}, label, id === 'cloudflare' ? h('small', {}, ' 可跳過') : null));
    }));
  }
  function problem(text) { return message && message.step === view ? h('div', { class: 'ob-problem', role: 'alert' }, message.text) : null; }
  function fail(step, error, fallback) { message = { step, text: (error && error.message) || fallback }; busy = false; render(); }

  // ---------- 各步驟 ----------
  function welcome() {
    return [h('div', { class: 'ob-hero' }, h('img', { src: 'assets/brand/travel-planner-mark-on-light-v3.svg', 'data-logo': '', width: 64, height: 64, alt: '' }),
      h('h1', {}, '下一段旅程，從這裡開始。'),
      h('p', {}, '第一次使用要花大約 10–15 分鐘準備。App 會一步一步幫你做好，只有要你本人登入的地方才會停下來。')),
    card(h('ol', { class: 'ob-overview' }, [
      ['連接 GitHub', '行程存在你自己的私人 GitHub，換電腦也不會不見。沒有帳號的話先免費註冊。'],
      ['準備 Git', 'Mac 沒有的話會跳出 Apple 的安裝視窗。'],
      ['建立旅程資料夾', 'App 自動建立並完成第一次備份。'],
      ['連接 AI 助手', 'Codex（ChatGPT）或 Claude，選一個登入。'],
      ['連接 Cloudflare（可跳過）', '要把行程網頁分享給旅伴時才需要。'],
    ].map(([t, d], i) => h('li', {}, h('span', { class: 'ob-num' }, String(i + 1)), h('div', {}, h('strong', {}, t), h('span', {}, d))))),
      h('p', { class: 'ob-note' }, 'Node.js、GitHub 工具、Cloudflare 工具與行程網頁引擎都已經內建在 App 裡，不用另外安裝。')),
    h('div', { class: 'ob-actions ob-center' }, button('開始準備', () => go(firstOpen())),
      link('我已經有旅程資料夾了', () => { go('existing'); }),
      link('先看看示範旅程', () => { dismissedForSession = true; hide(); openDemo(); }, 'ob-quiet'))];
  }

  function githubStep() {
    const d = detail.github || {};
    const body = [heading('連接你的 GitHub', '你的行程、照片和私人筆記會存在你自己的「私人」GitHub 備份裡，只有你看得到。')];
    const main = card(
      status(facts.ghTool ? 'GitHub 工具已準備好' : 'App 會先下載 GitHub 官方工具（約 15 MB）', facts.ghTool ? 'ok' : 'muted'),
      h('div', { class: 'ob-actions' }, button(d.waiting ? '重新開啟 GitHub 登入頁' : '在瀏覽器連接 GitHub', d.waiting ? () => open(d.url || 'https://github.com/login/device') : connectGitHub, { external: true, disabled: busy && !d.waiting }), button('還沒有帳號？免費註冊', () => open('https://github.com/signup'), { primary: false, external: true })),
      human('按下後會打開瀏覽器，請登入 GitHub、輸入下方的一次性代碼並按「Authorize」。完成後回到這裡，會自動繼續。'));
    body.push(main);
    if (d.code) body.push(card(h('div', { class: 'ob-code' }, h('span', {}, '一次性代碼'), h('strong', {}, d.code)), status(d.progress || '等待授權…', 'active'), h('div', { class: 'ob-actions' }, button('複製代碼並打開 GitHub', () => { navigator.clipboard?.writeText(d.code).catch(() => {}); open(d.url || 'https://github.com/login/device'); }, { primary: false, external: true }))));
    else if (d.progress) body.push(card(status(d.progress, 'active')));
    if (d.stuck) body.push(stuckCard('GitHub 授權還沒完成', ['瀏覽器登入的是另一個 GitHub 帳號 → 先登出再試', '授權頁面被關掉了 → 按「重新連接」', '公司電腦擋住了 github.com → 換個網路或電腦'], connectGitHub));
    return body;
  }
  function stuckCard(title, reasons, retry) {
    return h('div', { class: 'ob-card ob-stuck' }, status(title, 'warn'), h('p', { class: 'ob-note' }, '沒關係，這一步可以重來，目前沒有建立或改動任何東西。'),
      h('ul', {}, reasons.map(r => h('li', {}, r))), h('div', { class: 'ob-actions' }, button('重新連接', retry, { external: true })));
  }
  async function connectGitHub() {
    if (busy && !detail.github?.waiting) return; busy = true; message = null; detail.github = { progress: facts.ghTool ? '正在開啟 GitHub 登入…' : '正在下載 GitHub 官方工具…' }; render();
    try {
      if (!facts.ghTool) { const { preparation } = await feature('tool-prepare', { id: 'gh' }); await feature('tool-install', { token: preparation.token, confirmed: true }); facts.ghTool = true; }
      detail.github = { progress: '等待瀏覽器授權…', waiting: true }; render();
      authWatch = 'github';
      const { auth } = await feature('auth-start', { provider: 'github' });
      if (auth.state === 'environment-auth') throw Error(auth.message);
    } catch (e) { detail.github = {}; authWatch = null; fail('github', e, 'GitHub 登入沒有開始，請再試一次。'); }
  }

  function gitStep() {
    const d = detail.git || {};
    return [heading('準備 Git', 'Git 用來記錄行程的每一個版本，備份到 GitHub 時會用到。'),
      card(status('已連接 GitHub', 'ok'),
        d.waiting ? status(window.travelDesktop.platform === 'darwin' ? '等待 Apple 的安裝完成…（約 3–5 分鐘）' : '正在安裝 Git for Windows…', 'active') : status('這台電腦還沒有 Git', 'muted'),
        h('div', { class: 'ob-actions' }, button(d.waiting ? '重新檢查' : '安裝 Git', d.waiting ? refresh : installGit, { disabled: busy && !d.waiting })),
        window.travelDesktop.platform === 'darwin'
          ? human('畫面上會跳出 Apple 的視窗，請按「安裝」→「同意」。這是 Apple 官方工具，不需要 Apple ID。')
          : human('Windows 可能會問「是否允許這個 App 變更你的裝置」，請按「是」。'))];
  }
  async function installGit() {
    busy = true; message = null; detail.git = { waiting: true }; render();
    try {
      const { preparation } = await feature('tool-prepare', { id: 'git' });
      const { result } = await feature('tool-install', { token: preparation.token, confirmed: true });
      if (result.installed) { busy = false; await refresh(); return; }
      poll(async () => { await detect(); return facts.git; }, 5000);
    } catch (e) { detail.git = {}; fail('git', e, 'Git 安裝沒有開始，請再試一次。'); }
  }

  function projectStep() {
    const d = detail.project || {};
    if (!d.suggestion && !d.loading && !d.running) { d.loading = true; detail.project = d; feature('onboarding-project-plan').then(r => { d.suggestion = r.suggestion; d.name = r.suggestion.name; }).catch(e => { message = { step: 'project', text: e.message }; }).finally(() => { d.loading = false; render(); }); }
    const s = d.suggestion;
    const nameInput = h('input', { id: 'ob-project-name', value: d.name || '', maxlength: 90, 'aria-label': 'GitHub 備份名稱', oninput: e => { d.name = e.target.value.trim(); } });
    const body = [heading('建立你的旅程資料夾', 'App 會在這台電腦建立旅程資料夾，並在你的 GitHub 開一個私人備份，之後所有行程都存在這裡。')];
    body.push(card(
      h('div', { class: 'ob-row' }, h('span', {}, 'GitHub 私人備份'), h('div', { class: 'ob-inline' }, h('span', { class: 'ob-muted' }, s ? s.owner + ' /' : '…'), nameInput)),
      h('div', { class: 'ob-row' }, h('span', {}, '可見度'), h('strong', { class: 'ob-okText' }, '私人（只有你看得到）')),
      h('div', { class: 'ob-row' }, h('span', {}, '這台電腦'), h('span', { class: 'ob-path', title: s ? s.parentDirectory : '' }, s ? '…/' + s.parentDirectory.split(/[\\/]/).filter(Boolean).slice(-1)[0] + '/' + (d.name || s.name) : '…'), link('改位置', async () => { try { const r = await feature('onboarding-project-location'); if (r.suggestion) { d.suggestion = r.suggestion; d.name = r.suggestion.name; render(); } } catch (e) { fail('project', e); } })),
      h('div', { class: 'ob-actions' }, button('建立並完成第一次備份', createProject, { disabled: busy || !s }), link('我已經有旅程資料夾了', () => go('existing')))));
    if (d.steps) body.push(card(...d.steps.map(([text, tone]) => status(text, tone))));
    return body;
  }
  async function createProject() {
    const d = detail.project; if (!d?.name) return;
    busy = true; message = null; d.steps = [['建立 GitHub 私人備份…', 'active']]; render();
    const mark = (i, text, tone) => { d.steps[i] = [text, tone]; render(); };
    try {
      const prep = await feature('onboarding-project-prepare', { name: d.name });
      const confirm = await feature('project-setup-confirm', { kind: 'create', token: prep.preparation.token });
      if (!confirm.result.ready) throw Error(confirm.result.message || '旅程資料夾沒有建立完成。');
      mark(0, '已建立 GitHub 私人備份：' + confirm.result.repo, 'ok');
      await window.reloadProjectFromResult?.(confirm);
      d.steps.push(['下載模板並設定備份保護', 'ok'], ['第一次備份：上傳到你的私人 GitHub…', 'active']); render();
      try {
        const { preparation } = await feature('backup-project-prepare');
        const { result } = await feature('backup-confirm', { token: preparation.token });
        mark(2, result.backedUp ? '第一次備份完成，遠端版本已核對' : '第一次備份沒有完成：' + result.message + '（之後可在「設定 → 備份與分享」重試）', result.backedUp ? 'ok' : 'warn');
      } catch (e) { mark(2, '第一次備份沒有完成：' + e.message + '（之後可在「設定 → 備份與分享」重試）', 'warn'); }
      busy = false; await refresh();
    } catch (e) { d.steps = null; fail('project', e, '旅程資料夾沒有建立完成，請再試一次。'); }
  }

  // 已經有私人專案：在引導裡直接選資料夾或從 GitHub 下載，不跳到設定頁。
  function existingStep() {
    const d = detail.existing || (detail.existing = {});
    const repoInput = h('input', { id: 'ob-existing-repo', value: d.repo || '', placeholder: '例如 your-name/travel-planner', 'aria-label': 'GitHub 私人備份', oninput: e => { d.repo = e.target.value.trim(); } });
    return [heading('使用你已經有的旅程資料夾', '行程會繼續存在原本的旅程資料夾裡。連接時只檢查資料夾，不會改動任何檔案；之後你請 AI 修改時才會寫入。'),
      card(h('strong', {}, '這台電腦上已經有旅程資料夾'), h('span', { class: 'ob-muted' }, '例如之前用 AI 助手在終端機做的 travel-planner 資料夾。'),
        h('div', { class: 'ob-actions' }, button('選擇資料夾…', chooseLocalProject, { disabled: busy }))),
      card(h('strong', {}, '備份在 GitHub 上，這台電腦還沒有'), h('span', { class: 'ob-muted' }, '會下載到「文件／Travel Planner」，並確認它是私人的。'),
        h('div', { class: 'ob-inline' }, repoInput), h('div', { class: 'ob-actions' }, button('下載這個旅程資料夾', cloneProject, { disabled: busy }))),
      d.progress ? card(status(d.progress, 'active')) : null,
      h('div', { class: 'ob-actions' }, link('← 改成建立新的旅程資料夾', () => go('project')))];
  }
  async function chooseLocalProject() {
    busy = true; message = null; render();
    try { await $('choose-project').onclick(); } finally { busy = false; }
    if (project) { await refresh(); } else render();
  }
  async function cloneProject() {
    const d = detail.existing; if (!d?.repo || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(d.repo)) { message = { step: 'existing', text: '請輸入「帳號/備份名稱」，例如 your-name/travel-planner。' }; render(); return; }
    busy = true; message = null; d.progress = '正在確認這是你的私人備份…'; render();
    try {
      const prep = await feature('onboarding-clone-prepare', { repo: d.repo });
      d.progress = '正在下載旅程資料夾…'; render();
      const confirm = await feature('project-setup-confirm', { kind: 'clone', token: prep.preparation.token });
      if (!confirm.result.ready) throw Error(confirm.result.message || '旅程資料夾沒有下載完成。');
      await window.reloadProjectFromResult?.(confirm);
      d.progress = null; busy = false; await refresh();
    } catch (e) { d.progress = null; fail('existing', e, '旅程資料夾沒有下載完成，請確認名稱與權限後再試。'); }
  }

  function aiStep() {
    const d = detail.ai || {};
    const option = (id, name, sub, ready) => h('div', { class: 'ob-choice' + (d.chosen === id ? ' ob-chosen' : '') },
      h('strong', {}, name), h('span', { class: 'ob-muted' }, sub),
      d.chosen === id && d.progress ? status(d.progress, 'active') : status(ready ? '已安裝' : '選它的話，App 會在背景安裝', ready ? 'ok' : 'muted'),
      button(ready ? (id === 'codex' ? '用 ChatGPT 登入' : '登入 Claude') : '安裝並登入', () => connectAI(id), { primary: d.chosen === id || !d.chosen, external: ready, disabled: busy }));
    return [heading('選一個 AI 助手', '它會陪你規劃行程、查官網和 Google Maps。之後可以再加另一個。'),
      h('div', { class: 'ob-choices' }, option('codex', 'Codex', '用 ChatGPT 帳號登入（Plus 以上方案）', facts.codexTool), option('claude', 'Claude', '用 Claude 帳號登入（Pro 或 Max 方案）', facts.claudeTool)),
      human('登入會在瀏覽器完成。App 使用自己獨立的登入，不會讀取你電腦上其他 AI 工具的帳號。')];
  }
  async function connectAI(id) {
    busy = true; message = null; detail.ai = { chosen: id, progress: '準備中…' }; render();
    try {
      const ready = id === 'codex' ? facts.codexTool : facts.claudeTool;
      if (!ready) {
        detail.ai.progress = id === 'codex' ? '正在安裝 Codex（第一次會一併準備 Node.js），約一兩分鐘…' : '正在安裝 Claude Code，約一兩分鐘…'; render();
        const { preparation } = await feature('tool-prepare', { id });
        await feature('tool-install', { token: preparation.token, confirmed: true });
      }
      detail.ai.progress = '已開啟瀏覽器登入，完成後會自動繼續…'; render();
      await feature('provider-account-action', { id, action: 'login' });
      poll(async () => { const accounts = await feature('provider-accounts').then(r => r.accounts).catch(() => []); const ok = accounts.some(a => (a.provider || a.id) === id && a.state === 'connected'); if (ok) { await feature('ai-defaults-set', { provider: id }).catch(() => {}); await feature('provider-select', { id }).catch(() => {}); restoreAIConnection(); } return ok; }, 3000, 15 * 60 * 1000, () => fail('ai', null, '登入還沒完成。可以再按一次登入，或到瀏覽器確認是否已授權。'));
    } catch (e) { detail.ai = {}; fail('ai', e, 'AI 助手沒有準備好，請再試一次。'); }
  }

  function cloudflareStep() {
    const d = detail.cloudflare || {};
    return [heading('要分享給旅伴嗎？', '連接免費的 Cloudflare 帳號後，行程可以變成手機打得開的網頁，傳連結給同行的人就能看。現在不需要的話可以先跳過，之後按「發布網站」時再連接。'),
      card(status('Cloudflare 工具已內建在 App 裡', 'ok'), d.progress ? status(d.progress, 'active') : null,
        h('div', { class: 'ob-actions' }, button('在瀏覽器連接 Cloudflare', connectCloudflare, { external: true, disabled: busy }), button('還沒有帳號？免費註冊', () => open('https://dash.cloudflare.com/sign-up'), { primary: false, external: true })),
        human('在瀏覽器登入 Cloudflare 並按「Allow」。第一次發布時會請你取一個網址名稱，之後每趟行程的網址都會用它。')),
      h('div', { class: 'ob-card ob-info' }, h('strong', {}, '先知道這兩件事'), h('span', {}, '・網頁不是密碼保護：拿到網址的人都打得開。只會放行程內容，訂房碼等私人筆記不會上網。'), h('span', {}, '・每次發布前都會先讓你看預覽、確認後才上線；旅程結束後可以一鍵下線。')),
      h('div', { class: 'ob-actions ob-between' }, link('先跳過，之後再說', skipCloudflare), h('span', { class: 'ob-muted' }, '跳過不影響規劃與備份'))];
  }
  async function connectCloudflare() {
    busy = true; message = null; detail.cloudflare = { progress: '等待瀏覽器授權…' }; render();
    try { authWatch = 'cloudflare'; await feature('auth-start', { provider: 'cloudflare' }); }
    catch (e) { detail.cloudflare = {}; authWatch = null; fail('cloudflare', e, 'Cloudflare 登入沒有開始，請再試一次。'); }
  }
  async function skipCloudflare() { saved = { ...saved, cloudflareSkipped: true }; await feature('onboarding-save', saved).catch(() => {}); await refresh(); }

  function readyStep() {
    const text = h('textarea', { id: 'ob-first-request', rows: 4, maxlength: 2000, 'aria-label': '描述想去的旅程', placeholder: '例如：10 月想和家人去日本東北自駕 6、7 天，想泡溫泉、看紅葉，不想每天換旅館…' });
    const chips = ['我已經有訂好的住宿', '我有別人給的行程可以貼上', '只有大概的地點和日期'];
    return [h('div', { class: 'ob-hero' }, h('span', { class: 'ob-okBig', 'aria-hidden': 'true' }, '✓'), h('h1', {}, '準備好了。想去哪裡？'), h('p', {}, '用平常說話的方式寫就好，想到什麼先寫什麼，AI 會幫你整理成逐日草案。')),
      h('div', { class: 'ob-card ob-compose' }, text, h('div', { class: 'ob-actions ob-between' }, h('span', { class: 'ob-muted' }, '下一步會請你幫這趟旅程取個名字'), button('開始規劃', () => startPlanning(text.value)))),
      h('div', { class: 'ob-chips' }, chips.map(c => h('button', { type: 'button', class: 'ob-chip', onclick: () => { text.value = (text.value ? text.value + '\n' : '') + c + '：'; text.focus(); } }, c))),
      facts.project ? h('div', { class: 'ob-center' }, status('行程會存到你的旅程資料夾', 'ok')) : null,
      h('div', { class: 'ob-center' }, link('先不用，回到旅程', async () => { saved = { ...saved, completed: true }; await feature('onboarding-save', saved).catch(() => {}); hide(); }, 'ob-quiet'))];
  }
  async function startPlanning(request) {
    saved = { ...saved, completed: true }; await feature('onboarding-save', saved).catch(() => {});
    hide();
    newTripModal();
    requestAnimationFrame(() => { const notes = $('new-notes'); if (notes && request.trim()) notes.value = request.trim(); $('new-title')?.focus(); });
  }

  // ---------- 流程 ----------
  function go(step) { view = step; message = null; render(); }
  function poll(check, every, limit = 20 * 60 * 1000, onTimeout) {
    clearTimeout(pollTimer); const started = Date.now();
    const tick = async () => { try { if (await check()) { busy = false; await refresh(); return; } } catch {} if (Date.now() - started > limit) { busy = false; onTimeout?.(); return; } pollTimer = setTimeout(tick, every); };
    pollTimer = setTimeout(tick, every);
  }
  async function refresh() { clearTimeout(pollTimer); await detect(); if (view !== 'welcome') view = firstOpen(); render(); }
  function render() {
    if (root.hidden) return;
    if (!facts || view === 'loading') { root.replaceChildren(h('div', { class: 'ob-inner' }, h('div', { class: 'ob-body ob-loading' }, status('正在檢查這台電腦的準備狀況…', 'active')))); return; }
    const screens = { welcome, github: githubStep, git: gitStep, project: projectStep, existing: existingStep, ai: aiStep, cloudflare: cloudflareStep, ready: readyStep };
    const content = screens[view]?.() || [];
    const top = STEPS.some(([id]) => id === view) ? stepper(view) : view === 'existing' ? stepper('project') : null;
    // 每一步都能先離開；之後缺的東西會在聊天上方提示，也能從設定頁底部「重新走一次設定」回來。
    const later = view !== 'welcome' && view !== 'ready' ? h('div', { class: 'ob-later' }, link('稍後再設定', later_)) : null;
    root.replaceChildren(h('div', { class: 'ob-inner' }, later, top, h('div', { class: 'ob-body' }, ...content, problem())));
    const logo = `assets/brand/travel-planner-mark-on-${document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'}-v3.svg`;
    root.querySelectorAll('[data-logo]').forEach(image => { image.src = logo; });
  }
  function show() { root.hidden = false; document.body.dataset.onboarding = 'on'; render(); }
  function later_() { dismissedForSession = true; busy = false; authWatch = null; hide(); }
  function hide() { root.hidden = true; delete document.body.dataset.onboarding; clearTimeout(pollTimer); }

  // 瀏覽器授權（GitHub／Cloudflare）的進度由主程式推送。
  window.travelDesktop.onAuthProgress?.(event => {
    if (root.hidden || event.provider !== authWatch) return;
    const provider = event.provider;
    if (event.state === 'waiting-browser' && event.deviceCode) { detail.github = { ...detail.github, waiting: true, code: event.deviceCode, url: event.deviceUrl, progress: '等待你在 GitHub 輸入代碼並授權…' }; render(); return; }
    if (event.state === 'connected') { authWatch = null; busy = false; detail[provider] = {}; refresh(); return; }
    if (['failed', 'timed-out', 'needs-login', 'canceled'].includes(event.state)) { authWatch = null; busy = false; detail[provider] = provider === 'github' ? { stuck: true } : {}; if (provider !== 'github') message = { step: provider, text: event.message || '登入沒有完成，請再試一次。' }; render(); }
  });

  // 專案在設定頁連接好之後，回到引導繼續下一步。
  window.onOnboardingProjectChanged = () => { if (!root.hidden || (!saved.completed && !dismissedForSession)) refresh().then(() => { if (!saved.completed && !dismissedForSession) show(); }); };
  // 給測試與「重新顯示引導」用：切到指定步驟、讀目前狀態。
  window.onboarding = { go: step => { show(); go(step); }, state: () => ({ view, facts, saved, hidden: root.hidden }) };
  window.resumeOnboarding = async () => { dismissedForSession = false; await detect(); view = firstOpen(); show(); };

  $('onboarding-resume').hidden = false;
  $('onboarding-resume').onclick = () => { closeSettings(); window.resumeOnboarding(); };
  (async () => {
    // 先用便宜的讀取判斷要不要引導；只有真的需要時才做完整偵測（會檢查多個工具與登入，較慢）。
    saved = await feature('onboarding-state').then(r => r.onboarding).catch(() => saved);
    if (saved.completed) { reveal(); return; }
    const workspace = await window.travelDesktop.readWorkspace?.().catch(() => null);
    // 已經有專案的人（包括從舊版升級的人）直接視為完成，不強迫重走；需要時可從設定頁底部「重新走一次設定」打開。
    if (workspace?.project) { reveal(); saved = { ...saved, completed: true }; await feature('onboarding-save', saved).catch(() => {}); return; }
    // 需要引導：先顯示歡迎頁（不必等完整偵測），偵測完再決定從哪一步開始。
    view = 'loading'; show();
    await detect();
    if (facts.project) { hide(); saved = { ...saved, completed: true }; await feature('onboarding-save', saved).catch(() => {}); return; }
    view = facts.done.github ? firstOpen() : 'welcome';
    show();
  })().catch(() => { reveal(); if (view === 'loading') hide(); });
})();
