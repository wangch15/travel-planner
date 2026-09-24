// 備份、發布、確認網站歸屬共用的步驟式燈箱。頁首、聊天卡片與設定頁都開這一個，流程只有一份：
// 先檢查 → 你核對 → 按確認才執行 → 顯示結果。token、私人 repo 檢查都在後端，這裡只負責呈現。
(() => {
  const dialog = $('sync-dialog');
  let flow = null;
  if (!window.travelDesktop) { window.openSyncFlow = async () => ({ status: 'unavailable' }); return; }
  const api = (name, input) => window.featureApi(name, input);
  const refresh = () => { window.refreshBackupStatus?.(); window.renderSync?.(); };

  const title = text => { $('sync-dialog-title').textContent = text; };
  function steps(names, current) {
    $('sync-dialog-steps').replaceChildren(...names.map((name, i) => {
      const item = el('li', name); item.dataset.state = i < current ? 'done' : i === current ? 'current' : 'todo';
      if (i === current) item.setAttribute('aria-current', 'step');
      return item;
    }));
  }
  const body = (...nodes) => $('sync-dialog-body').replaceChildren(...nodes.filter(Boolean));
  function say(text, tone = '') { const status = $('sync-dialog-status'); status.textContent = text || ''; status.dataset.tone = tone; }
  function footer(left, right) {
    $('sync-dialog-left').replaceChildren(...left.filter(Boolean));
    $('sync-dialog-right').replaceChildren(...right.filter(Boolean));
  }
  // 執行中鎖住關閉與其他按鈕：推送或發布進行時按「取消」不會真的取消，所以乾脆不給按。
  function setLocked(on) {
    $('sync-dialog-close').disabled = on;
    for (const b of dialog.querySelectorAll('.flow-actions button:not([aria-busy])')) {
      if (on) { b.dataset.lockedFrom = String(b.disabled); b.disabled = true; }
      else if (b.dataset.lockedFrom) { b.disabled = b.dataset.lockedFrom === 'true'; delete b.dataset.lockedFrom; }
    }
  }
  function button(label, flowAction, onclick, variant = '') {
    const b = el('button', label, variant || undefined); b.type = 'button'; b.dataset.flowAction = flowAction; b.onclick = onclick; return b;
  }
  // 要等結果的動作：按鈕顯示轉圈，錯誤寫在按鈕上方的狀態列。
  function act(label, flowAction, work, { variant = '', busy } = {}) {
    const b = button(label, flowAction, null, variant);
    b.onclick = () => withBusy(b, busy, async () => {
      const mine = flow; if (!mine) return;
      mine.busy = true; setLocked(true); say('');
      try { await work(); } catch (e) { if (flow === mine) say(e.message || '沒有完成，請再試一次。', 'warn'); }
      finally { mine.busy = false; setLocked(false); }
    });
    return b;
  }
  const closeButton = (label, flowAction = 'cancel', variant = '') => button(label, flowAction, () => { if (!flow?.busy) dialog.close(); }, variant);
  const list = (items, max = 40) => { const ul = el('ul'); items.slice(0, max).forEach(t => ul.append(el('li', t))); if (items.length > max) ul.append(el('li', `…另外 ${items.length - max} 個`)); return ul; };
  function fold(summary, items, open = false) { const d = document.createElement('details'); d.className = 'flow-files'; d.open = open; d.append(el('summary', summary), list(items)); return d; }
  function facts(pairs) { const dl = el('dl', undefined, 'flow-facts'); for (const [k, v] of pairs) dl.append(el('dt', k), el('dd', v || '—')); return dl; }
  function pending(text) { const p = el('p', undefined, 'flow-pending'); const s = el('span', undefined, 'busy-spinner'); s.setAttribute('aria-hidden', 'true'); p.append(s, document.createTextNode(text)); return p; }
  // 跟上次備份相比每天改了什麼，展開可看修改前後。
  function dayChanges(changes) {
    if (!changes?.length) return null;
    const box = el('section', undefined, 'flow-days'); box.append(el('h3', '跟上次備份相比，這趟改了'));
    for (const change of changes) {
      const d = document.createElement('details'); d.className = 'day-change';
      const pair = el('div', undefined, 'change-pair');
      for (const [name, text] of [['上次備份', change.before], ['現在', change.after]]) { const column = el('div'); column.append(el('h3', name), el('p', text)); pair.append(column); }
      d.append(el('summary', change.label), pair); box.append(d);
    }
    return box;
  }
  // 自動執行的檢查步驟：失敗就留在這一步，給「重新檢查」。關閉燈箱後才回來的結果直接丟掉。
  async function checking(names, text, work, retry, extraOnError = () => []) {
    const mine = flow; steps(names, 0); body(pending(text)); say(''); footer([], [closeButton('取消')]);
    try { const value = await work(); return flow === mine ? value : null; }
    catch (e) {
      if (flow !== mine) return null;
      body(el('p', e.message || '檢查沒有完成，請再試一次。', 'flow-error')); say('');
      footer(extraOnError(e), [closeButton('關閉'), act('重新檢查', 'retry', retry, { variant: 'primary', busy: '檢查中…' })]);
      return null;
    }
  }
  function done(names, head, text, tone, outcome, extra = []) {
    if (!flow) return;
    steps(names, names.length - 1);
    const heading = el('h3', head, 'flow-result'); heading.dataset.tone = tone;
    body(heading, text ? el('p', text) : null); say('');
    flow.outcome = outcome; footer([], [...extra, closeButton('完成', 'done', 'primary')]);
  }

  const BACKUP_STEPS = ['檢查', '核對', '完成'];
  function backupRequest(scope) { return scope === 'all' ? ['backup-prepare', { scope: 'all' }] : scope === 'project' ? ['backup-project-prepare', {}] : ['backup-prepare', conversationTarget()]; }
  function backupReview(p) {
    const nodes = [el('p', `私人專案：${p.repo} · 分支 ${p.branch}`, 'flow-meta'), dayChanges(p.dayChanges)];
    if (p.files.length) nodes.push(fold(`這次 ${p.files.length} 個檔案`, p.files.map(f => `${f.status === 'deleted' ? '刪除' : '保存'} · ${f.path}`), !p.dayChanges?.length && p.files.length <= 12));
    if (p.unpublishedCommits) nodes.push(el('p', `另有 ${p.unpublishedCommits} 個既有提交會一起推送。`));
    if (p.firstPush) nodes.push(el('p', '這是第一次推送到這個私人專案，會包含模板本身的所有檔案。'));
    for (const warning of p.warnings || []) nodes.push(el('p', warning, 'flow-warning'));
    if (p.unrelatedCommittedFiles?.length) nodes.push(fold(`既有未推送提交另包含 ${p.unrelatedCommittedFiles.length} 個檔案`, p.unrelatedCommittedFiles, false));
    return nodes;
  }
  const identityHelp = e => /提交作者/.test(e.message || '') ? [button('設定備份署名', 'identity', () => { dialog.close(); openSettings('backup'); $('identity-card').hidden = false; }, 'text-button')] : [];
  async function backup(opts) {
    const scope = opts.scope || 'trip';
    title(scope === 'all' ? '備份所有旅程到 GitHub' : scope === 'project' ? '備份專案到 GitHub' : '備份到 GitHub');
    const p = await checking(BACKUP_STEPS, '正在列出這次要備份的內容…', async () => { const [name, input] = backupRequest(scope); return (await api(name, input)).preparation; }, () => backup(opts), identityHelp);
    if (!p) return;
    if (!p.files.length && !p.unpublishedCommits) { const text = '目前沒有需要備份的內容，已經是最新。'; done(BACKUP_STEPS, '已經是最新的備份', text, 'ok', { status: 'done', message: text, tone: 'ok' }); return; }
    steps(BACKUP_STEPS, 1); body(...backupReview(p)); say('核對以上內容，確認後才推送到你的私人 GitHub。');
    footer([scope === 'trip' && p.files.length ? act('全部不要…', 'discard', () => discard(opts), { variant: 'text-button danger-text', busy: '檢查中…' }) : null],
      [closeButton('取消'), act('確認備份', 'confirm', async () => {
        const { result } = await api('backup-confirm', { token: p.token }); refresh();
        const tone = result.backedUp === false ? 'warn' : 'ok';
        done(BACKUP_STEPS, tone === 'ok' ? '備份完成' : '備份沒有完成', result.message, tone, { status: tone === 'ok' ? 'done' : 'failed', message: result.message, tone });
      }, { variant: 'primary', busy: '推送中…' })]);
  }
  async function discard(opts) {
    title('回到上次備份');
    const p = await checking(BACKUP_STEPS, '正在列出還沒備份的修改…', async () => (await api('backup-discard-prepare', conversationTarget())).preparation, () => discard(opts));
    if (!p) return;
    if (!p.restore.length && !p.remove.length) { const text = '這趟沒有還沒備份的修改。'; done(BACKUP_STEPS, '沒有需要丟掉的修改', text, 'ok', { status: 'done', message: text, tone: 'ok' }); return; }
    steps(BACKUP_STEPS, 1);
    body(el('p', '這趟旅程會回到上次備份的內容，下面這些還沒備份的修改會丟掉，無法從 GitHub 找回（App 的本機版本紀錄仍保留）。', 'flow-warning'), dayChanges(p.dayChanges),
      p.restore.length ? fold(`回到上次備份 · ${p.restore.length} 個檔案`, p.restore, true) : null,
      p.remove.length ? fold(`新加的檔案會刪除 · ${p.remove.length} 個`, p.remove, true) : null);
    say('核對清單，確認後才會改動檔案。');
    footer([], [closeButton('取消'), act('確認全部不要', 'confirm', async () => {
      const { result } = await api('backup-discard-confirm', { token: p.token });
      realPreview = null; renderPreview(); refresh();
      const text = `已回到上次備份：還原 ${result.restored} 個、刪除 ${result.removed} 個檔案。`;
      done(BACKUP_STEPS, '已回到上次備份', text, 'ok', { status: 'done', message: text, tone: 'ok' });
    }, { variant: 'danger', busy: '還原中…' })]);
  }

  const PUBLISH_STEPS = ['準備', '核對', '完成'];
  function prerequisite(ready, doneText, todoText, action) {
    const row = el('div', undefined, 'sync-step'); row.dataset.done = String(ready);
    row.append(el('span', ready ? '✓' : '', 'sync-step-mark'), el('span', ready ? doneText : todoText)); if (!ready && action) row.append(action); return row;
  }
  function prerequisites(ready, opts) {
    steps(PUBLISH_STEPS, 0);
    const checklist = el('div', undefined, 'sync-checklist');
    checklist.append(
      prerequisite(ready.cloudflare, 'Cloudflare 已連接', '連接 Cloudflare（免費帳號，在瀏覽器登入一次）', act('連接 Cloudflare', 'connect', async () => {
        const { auth } = await api('auth-start', { provider: 'cloudflare' }); say(auth.message || '請在瀏覽器完成授權，完成後按「重新檢查」。');
      }, { busy: '開啟瀏覽器…' })),
      prerequisite(ready.preview, '已在右側預覽看過目前版本', '在右側預覽看過目前版本', button('打開預覽', 'preview', () => { dialog.close(); closeSettings(); setPreview(true); })));
    body(el('p', '發布前還差下面的步驟，完成後按「重新檢查」。'), checklist); say('');
    footer([], [closeButton('取消'), act('重新檢查', 'retry', () => publish(opts), { variant: 'primary', busy: '檢查中…' })]);
  }
  function publishResult(result, opts) {
    const extra = [];
    if (result.url) extra.push(button('開啟網站 ↗', 'open-site', () => api('open-link', { url: result.url }).catch(e => say(e.message, 'warn'))));
    if (result.code === 'WORKERS_SUBDOMAIN_REQUIRED') extra.push(button('打開 Cloudflare 設定 ↗', 'open-cloudflare', () => api('open-link', { url: 'https://dash.cloudflare.com/?to=/:account/workers-and-pages' }).catch(e => say(e.message, 'warn'))), act('設定好了，重新準備', 'retry', () => publish(opts), { busy: '檢查中…' }));
    const tone = result.url ? 'ok' : 'warn';
    done(PUBLISH_STEPS, result.url ? '網站已發布' : '發布沒有完成', result.message, tone, { status: result.url ? 'done' : 'failed', message: result.message, tone, url: result.url || null, code: result.code || null }, extra);
  }
  async function publish(opts) {
    title('發布網站');
    if (!selected || selected.demo || !project) { steps(PUBLISH_STEPS, 0); body(); say('請先開啟一趟正式旅程。', 'warn'); footer([], [closeButton('關閉')]); return; }
    const ready = await checking(PUBLISH_STEPS, '正在確認 Cloudflare 連線與預覽…', async () => {
      const { auth } = await api('auth-status', { provider: 'cloudflare' }); return { cloudflare: Boolean(auth.connected), preview: Boolean(window.previewViewed?.()) };
    }, () => publish(opts));
    if (!ready) return;
    if (!ready.cloudflare || !ready.preview) { prerequisites(ready, opts); return; }
    // 網站之前用終端機發布過、App 還沒紀錄：直接在這裡接管，不用去設定頁的進階找。
    const adoptHelp = e => e.code === 'ADOPTION_REQUIRED' ? [act('這是我之前發布的網站…', 'adopt', () => adopt(opts), { variant: 'text-button', busy: '查詢中…' })] : [];
    const p = await checking(PUBLISH_STEPS, '正在核對發布目標…', async () => (await api('publish-prepare', conversationTarget())).preparation, () => publish(opts), adoptHelp);
    if (!p) return;
    steps(PUBLISH_STEPS, 1);
    const ack = el('input'); ack.type = 'checkbox'; ack.id = 'sync-publish-ack';
    const confirm = act('確認發布', 'confirm', async () => {
      const { result } = await api('publish-confirm', { token: p.token, ...conversationTarget() }); refresh(); publishResult(result, opts);
    }, { variant: 'primary', busy: '發布中…' });
    confirm.disabled = true; ack.onchange = () => { confirm.disabled = !ack.checked; };
    const label = el('label', undefined, 'flow-ack'); label.htmlFor = ack.id;
    label.append(ack, document.createTextNode('我已看過目前預覽，並了解網站是公開的，拿到網址的人都能打開。'));
    body(facts([['網站', p.name], ['Cloudflare', p.accountName || p.accountId]]), p.warning ? el('p', p.warning) : null,
      p.backupFirst ? el('p', `發布前會先把${p.backupFirst.pendingFiles ? ` ${p.backupFirst.pendingFiles} 個` : '尚未備份的'}修改備份（commit + push）到你的私人 GitHub。`) : null, label);
    say('勾選上面的提醒後才能發布。'); footer([], [closeButton('取消'), confirm]);
  }

  const ADOPT_STEPS = ['檢查', '核對', '完成'];
  async function adopt(opts) {
    title('確認這是我之前發布的網站');
    const p = await checking(ADOPT_STEPS, '正在查詢 Cloudflare 上的網站…', async () => (await api('adoption-prepare', conversationTarget())).preparation, () => adopt(opts));
    if (!p) return;
    steps(ADOPT_STEPS, 1);
    body(facts([['網站', p.name], ['帳號', p.accountName || p.accountId], ['目前版本', p.versionId]]), p.warning ? el('p', p.warning) : null);
    say('確認這個網站是你的，App 才會記下歸屬；這一步不會發布。');
    footer([], [closeButton('取消'), act('確認歸屬', 'confirm', async () => {
      const { result } = await api('adoption-confirm', { token: p.token }); refresh();
      const text = result.message || '已記錄網站歸屬，尚未發布。';
      // 從發布流程轉來接管的：記好歸屬後直接接著發布。
      const next = opts.kind === 'publish' ? [act('繼續發布', 'continue', () => publish(opts), { busy: '檢查中…' })] : [];
      done(ADOPT_STEPS, '已記下網站歸屬', text, 'ok', { status: 'done', message: text, tone: 'ok' }, next);
    }, { variant: 'primary', busy: '記錄中…' })]);
  }

  const runners = { backup: opts => opts.mode === 'discard' ? discard(opts) : backup(opts), publish, adopt };
  // 執行中不能關：Chromium 連按 Esc 時 cancel 事件不一定能取消，所以 keydown 先攔，真的被關掉就立刻重開，
  // 免得推送照樣完成、卡片卻寫成「已取消」。
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape' && flow?.busy) event.preventDefault(); });
  dialog.addEventListener('cancel', event => { if (flow?.busy) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    if (flow?.busy) { dialog.showModal(); return; }
    const ended = flow; flow = null; ended?.resolve(ended.outcome || { status: 'canceled' });
  });
  $('sync-dialog-close').onclick = () => { if (!flow?.busy) dialog.close(); };
  // 回傳 Promise：燈箱關閉時給結果 {status:'done'|'failed'|'canceled'|'blocked', message, tone, url}。
  window.openSyncFlow = (opts = {}) => {
    if (flow || !runners[opts.kind]) return Promise.resolve({ status: 'blocked' });
    if (aiBusy || pendingProposal || window.hasMaterialization?.()) { const message = '請先等 AI 回覆完成，或確認／放棄目前的提案。'; notify(message); return Promise.resolve({ status: 'blocked', message, tone: 'warn' }); }
    return new Promise(resolve => {
      flow = { ...opts, resolve, outcome: null, busy: false };
      $('sync-dialog-steps').replaceChildren(); body(); say(''); footer([], []); dialog.showModal();
      runners[opts.kind](opts).catch(e => { if (flow) { say(e.message || '沒有完成，請再試一次。', 'warn'); footer([], [closeButton('關閉')]); } });
    });
  };
})();
