// 聊天裡的動作卡片：AI 回覆附帶 appAction（備份、發布、更新專案、查核）時，在回覆下方顯示。
// AI 只負責「提出」；卡片走 App 原本的核對流程（私有檢查、預覽確認、衝突預演），由使用者按確認才執行。
(() => {
  if (!window.travelDesktop) return;
  const feature = async (name, input = {}) => { const r = await window.travelDesktop.feature(name, input); if (!r.ok) throw Error(r.message || '操作未完成'); return r; };
  const h = (tag, attrs = {}, ...children) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n[k] = v; else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); } for (const c of children.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c))); return n; };
  const realTrip = () => Boolean(selected && !selected.demo && project);
  const busyNow = () => aiBusy || pendingProposal || window.hasMaterialization?.();

  function shell(title, description) {
    const card = h('div', { class: 'action-card', role: 'group', 'aria-label': title });
    const body = h('div', { class: 'action-card-body' });
    const buttons = h('div', { class: 'action-card-buttons' });
    const note = h('p', { class: 'action-card-note', role: 'status' });
    card.append(h('strong', {}, title), h('p', { class: 'action-card-desc' }, description), body, note, buttons);
    const set = (...nodes) => buttons.replaceChildren(...nodes);
    const say = (text, tone = '') => { note.textContent = text || ''; note.dataset.tone = tone; };
    const run = (button, work, busyLabel) => {
      if (busyNow()) { say('請先等 AI 回覆完成，或確認／放棄目前的提案。', 'warn'); return; }
      say('');
      return withBusy(button, busyLabel, async () => { try { await work(); } catch (e) { say(e.message || '操作沒有完成。', 'warn'); } });
    };
    const btn = (label, onclick, primary = true, busyLabel) => { const b = h('button', { type: 'button', class: primary ? 'primary' : '' }, label); b.onclick = () => run(b, () => onclick(b), busyLabel); return b; };
    return { card, body, set, say, btn };
  }
  const list = (items, max = 8) => h('ul', {}, items.slice(0, max).map(t => h('li', {}, t)), items.length > max ? h('li', {}, `…另外 ${items.length - max} 個`) : null);

  // 備份與發布的核對在共用燈箱（sync-flow.js），卡片只負責打開它、並把結果記在回覆下方。
  function flowCard(title, description, label, opts) {
    const c = shell(title, description);
    const open = async () => {
      const outcome = await window.openSyncFlow(opts());
      if (outcome.status === 'blocked') { if (outcome.message) c.say(outcome.message, 'warn'); return; }
      if (outcome.status === 'canceled') { c.say('已取消，沒有上傳或發布任何東西。'); c.set(c.btn(label, open, true, '核對中…')); return; }
      c.say(outcome.message, outcome.tone);
      c.set(...(outcome.url ? [c.btn('開啟網站 ↗', async () => { await feature('open-link', { url: outcome.url }); }, false, '開啟中…')] : outcome.status === 'failed' ? [c.btn(label, open, true, '核對中…')] : []));
    };
    c.set(c.btn(label, open, true, '核對中…'));
    return c.card;
  }
  const backupCard = () => flowCard('備份到你的私人 GitHub', '先列出這次會上傳的內容，你確認後才上傳。上傳前會重新確認目的地是私人的。', '檢查要備份的內容', () => ({ kind: 'backup', scope: realTrip() ? 'trip' : 'project' }));
  const publishCard = () => flowCard('把這趟行程發布成網站', '發布前要先看過預覽，並確認網站是「拿到網址的人都能開」的公開頁面。', '準備發布', () => ({ kind: 'publish' }));

  function projectUpdateCard() {
    const c = shell('更新旅程資料夾', '只更新資料夾裡的網頁程式，不會改動你的行程、照片與私人筆記。會先預演，有衝突就停下。');
    const prepare = async () => {
      const { update: u } = await feature('project-update-prepare');
      if (!u.token) { c.say(u.message, 'ok'); c.set(); return; }
      c.body.replaceChildren(h('p', {}, u.upToDate ? '模板已是最新，只需要升級行程資料格式。' : `資料夾裡的網頁程式 ${u.fromVersion || '未知'} → ${u.toVersion || '未知'}，共 ${u.changedFiles} 個引擎檔案。`),
        ...u.highlights.map(e => h('div', {}, h('strong', {}, `${e.version}（${e.date}）`), list(e.highlights, 4))),
        u.migrateTrips.length ? h('p', {}, '會升級這些行程的資料格式：' + u.migrateTrips.join('、')) : null);
      c.set(c.btn('確認更新', async () => {
        const response = await feature('project-update-confirm', { token: u.token });
        await window.reloadProjectFromResult?.(response);
        c.say(response.result.merged ? '旅程資料夾已更新，下次私人備份會一起上傳。' : '旅程資料夾已是最新。', 'ok'); c.body.replaceChildren(); c.set(); window.refreshBackupStatus?.();
      }, true, '更新中…'));
    };
    c.set(c.btn('檢查更新內容', prepare, true, '檢查中…'));
    return c.card;
  }

  function researchCard() {
    const c = shell('查核來源與可行性', 'AI 會用 App 內建的瀏覽器查官網與 Google Maps，結果要你看過確認。');
    c.set(c.btn('開始查核', async () => {
      const trigger = $('research-trip');
      if (!trigger || trigger.hidden || trigger.disabled) throw Error('目前無法開始查核：請先開啟正式旅程，並等 AI 回覆完成。');
      trigger.click(); c.say('已開始查核，進度會顯示在對話裡。', 'ok'); c.set();
    }));
    return c.card;
  }

  const builders = { backup: backupCard, publish: publishCard, 'project-update': projectUpdateCard, research: researchCard };
  window.actionCard = action => builders[action]?.() || null;
})();
