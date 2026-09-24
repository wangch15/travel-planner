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
    const run = async (button, work) => {
      if (busyNow()) { say('請先等 AI 回覆完成，或確認／放棄目前的提案。', 'warn'); return; }
      const label = button.textContent; button.disabled = true; button.textContent = '處理中…'; say('');
      try { await work(); } catch (e) { say(e.message || '操作沒有完成。', 'warn'); button.disabled = false; button.textContent = label; }
    };
    const btn = (label, onclick, primary = true) => { const b = h('button', { type: 'button', class: primary ? 'primary' : '' }, label); b.onclick = () => run(b, () => onclick(b)); return b; };
    return { card, body, set, say, btn };
  }
  const list = (items, max = 8) => h('ul', {}, items.slice(0, max).map(t => h('li', {}, t)), items.length > max ? h('li', {}, `…另外 ${items.length - max} 個`) : null);

  function backupCard() {
    const c = shell('備份到你的私人 GitHub', '先列出這次會推送的內容，你確認後才推送。推送前會重新確認目的地是私人專案。');
    const prepare = async () => {
      const { preparation: p } = realTrip() ? await feature('backup-prepare', conversationTarget()) : await feature('backup-project-prepare');
      c.body.replaceChildren(h('p', {}, `私人專案：${p.repo} · 分支 ${p.branch}`),
        p.files.length ? list(p.files.map(f => `${f.status === 'deleted' ? '刪除' : '保存'} · ${f.path}`)) : h('p', {}, '這趟旅程沒有新的檔案改動。'),
        p.unpublishedCommits ? h('p', {}, `另外會一起推送 ${p.unpublishedCommits} 個尚未備份的提交${p.firstPush ? '（第一次推送，包含模板本身）' : ''}。`) : null);
      if (!p.files.length && !p.unpublishedCommits) { c.say('目前沒有需要備份的內容，已經是最新。', 'ok'); c.set(); return; }
      c.set(c.btn('確認備份', async () => {
        const { result } = await feature('backup-confirm', { token: p.token });
        c.say(result.message, result.backedUp ? 'ok' : 'warn'); c.set(); window.refreshBackupStatus?.();
      }), c.btn('取消', async () => { c.body.replaceChildren(); c.say('已取消，沒有推送任何東西。'); c.set(c.btn('重新檢查', prepare, false)); }, false));
    };
    c.set(c.btn('檢查要備份的內容', prepare));
    return c.card;
  }

  function publishCard() {
    const c = shell('把這趟行程發布成網站', '發布前要先看過預覽，並確認網站是「拿到網址的人都能開」的公開頁面。');
    const start = async () => {
      if (!realTrip()) { c.say('請先開啟一趟正式旅程。', 'warn'); return; }
      const { auth } = await feature('auth-status', { provider: 'cloudflare' });
      if (!auth.connected) { c.say('還沒連接 Cloudflare。', 'warn'); c.set(c.btn('連接 Cloudflare', async () => { openSettings('publish'); }), c.btn('連好了，繼續', start, false)); return; }
      if (!window.previewViewed?.()) { c.say('請先在右側預覽看過目前內容。', 'warn'); c.set(c.btn('打開預覽', async () => { setPreview(true); }), c.btn('我看過了，繼續', start, false)); return; }
      const { preparation: p } = await feature('publish-prepare', conversationTarget());
      const ack = h('input', { type: 'checkbox', id: 'ack-' + Math.random().toString(36).slice(2) });
      c.body.replaceChildren(h('p', {}, `網站：${p.name}`), h('p', {}, `Cloudflare：${p.accountName || p.accountId}`), h('p', {}, p.warning), p.backupFirst ? h('p', {}, `發布前會先把${p.backupFirst.pendingFiles ? ` ${p.backupFirst.pendingFiles} 個` : '尚未備份的'}修改備份（commit + push）到你的私人 GitHub。`) : null,
        h('label', { class: 'action-card-ack', for: ack.id }, ack, '我已看過目前預覽，並了解網站可由持有網址的人開啟。'));
      c.say('');
      c.set(c.btn('確認發布', async () => {
        if (!ack.checked) throw Error('請先勾選上面的提醒。');
        const { result } = await feature('publish-confirm', { token: p.token, ...conversationTarget() });
        c.say(result.message, result.url ? 'ok' : 'warn'); c.body.replaceChildren();
        if (result.code === 'WORKERS_SUBDOMAIN_REQUIRED') { c.set(c.btn('打開 Cloudflare 設定', async () => { await feature('open-link', { url: 'https://dash.cloudflare.com/?to=/:account/workers-and-pages' }); }), c.btn('設定好了，重新準備', start, false)); return; }
        c.set(...(result.url ? [c.btn('開啟網站', async () => { await feature('open-link', { url: result.url }); }, false)] : []));
      }));
    };
    c.set(c.btn('準備發布', start));
    return c.card;
  }

  function projectUpdateCard() {
    const c = shell('更新專案', '只更新模板的引擎檔案，不會改動你的行程、照片與私人筆記。會先預演，有衝突就停下。');
    const prepare = async () => {
      const { update: u } = await feature('project-update-prepare');
      if (!u.token) { c.say(u.message, 'ok'); c.set(); return; }
      c.body.replaceChildren(h('p', {}, u.upToDate ? '模板已是最新，只需要升級行程資料格式。' : `專案引擎 ${u.fromVersion || '未知'} → ${u.toVersion || '未知'}，共 ${u.changedFiles} 個引擎檔案。`),
        ...u.highlights.map(e => h('div', {}, h('strong', {}, `${e.version}（${e.date}）`), list(e.highlights, 4))),
        u.migrateTrips.length ? h('p', {}, '會升級這些行程的資料格式：' + u.migrateTrips.join('、')) : null);
      c.set(c.btn('確認更新', async () => {
        const response = await feature('project-update-confirm', { token: u.token });
        await window.reloadProjectFromResult?.(response);
        c.say(response.result.merged ? '專案已更新，下次私人備份會一起推送。' : '專案已是最新。', 'ok'); c.body.replaceChildren(); c.set(); window.refreshBackupStatus?.();
      }));
    };
    c.set(c.btn('檢查更新內容', prepare));
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
