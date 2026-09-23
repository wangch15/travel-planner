const { checkResearchURL, createHostGuard } = require('./research-guard.cjs');

const fail = (code, hint) => Object.assign(new Error(code), { code, ...(hint ? { hint } : {}) });
const MAX_CHARS = 20000, MAX_PAGES = 60;
const READ_PAGE = `(() => ({ url: location.href, title: document.title || '', text: document.body ? document.body.innerText : '' }))()`;
const normalizeText = text => String(text || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const pageKey = raw => { try { const u = new URL(raw); u.hash = ''; return u.href.replace(/\/$/, ''); } catch { return null; } };

// A hidden, sandboxed Chromium window the agent drives through App-owned tools.
// Each profile has its own session partition; the public one never holds a login.
class ResearchBrowser {
  constructor({ electron, partition, allowPage = () => true, hostGuard = createHostGuard(), checkURL = checkResearchURL,
    timeoutMs = 30000, settleMs = 8000, now = () => new Date() }) {
    Object.assign(this, { electron, partition, allowPage, hostGuard, checkURL, timeoutMs, settleMs, now });
    this.window = null; this.queue = Promise.resolve(); this.pages = new Map(); this.configured = false;
  }
  session() { return this.electron.session.fromPartition(this.partition); }
  configure() {
    if (this.configured) return;
    this.configured = true;
    const ses = this.session();
    const ua = ses.getUserAgent().replace(/ Electron\/\S+/, '').replace(/ [\w-]*travel-planner\S*/i, '');
    ses.setUserAgent(ua, 'zh-TW,zh;q=0.9,en;q=0.8,ja;q=0.7');
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    ses.on('will-download', (_event, item) => item.cancel());
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      let url;
      try { url = new URL(details.url); } catch { return callback({ cancel: true }); }
      if (['data:', 'blob:', 'about:'].includes(url.protocol)) return callback({ cancel: false });
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return callback({ cancel: true });
      // The agent window may only navigate to pages this profile allows; login windows are user-driven.
      if (details.resourceType === 'mainFrame' && this.window && details.webContentsId === this.window.webContents.id && !this.allowPage(details.url)) return callback({ cancel: true });
      this.hostGuard(url.hostname).then(ok => callback({ cancel: !ok }), () => callback({ cancel: true }));
    });
  }
  ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return this.window;
    this.configure();
    const win = new this.electron.BrowserWindow({ show: false, width: 1280, height: 900,
      webPreferences: { partition: this.partition, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false, spellcheck: false } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.setAudioMuted(true);
    this.window = win;
    return win;
  }
  run(task) { const next = this.queue.then(task); this.queue = next.catch(() => {}); return next; }
  async read(win) {
    const page = await win.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: READ_PAGE }]);
    return { url: String(page.url), title: String(page.title).slice(0, 300), text: normalizeText(page.text) };
  }
  // Pages render asynchronously; wait until the visible text stops growing.
  async settle(win) {
    let last = -1, stable = 0, page;
    for (const started = Date.now(); Date.now() - started < this.settleMs;) {
      page = await this.read(win);
      if (page.text.length === last && page.text.length > 0) { if (++stable >= 2) break; } else stable = 0;
      last = page.text.length;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return page || this.read(win);
  }
  open(raw) {
    return this.run(async () => {
      const url = this.checkURL(raw);
      if (!this.allowPage(url.href)) throw fail('PRIVATE_SITE_NOT_CONNECTED', '這個網站尚未在「資料來源」連接，或不在允許的網域內。');
      if (!await this.hostGuard(url.hostname)) throw fail('RESEARCH_URL_BLOCKED', '只能開啟公開網站。');
      const win = this.ensureWindow();
      let timer;
      try {
        await Promise.race([win.loadURL(url.href), new Promise((_, reject) => { timer = setTimeout(() => reject(fail('RESEARCH_TIMEOUT')), this.timeoutMs); })]);
      } catch (error) {
        clearTimeout(timer);
        // Slow pages still yield useful text; blocked or failed navigations do not.
        if (error.code !== 'RESEARCH_TIMEOUT' && !String(error.message).includes('ERR_ABORTED')) throw fail('RESEARCH_LOAD_FAILED', '網頁無法開啟，請換一個來源。');
        win.webContents.stop();
      } finally { clearTimeout(timer); }
      const page = await this.settle(win);
      let final;
      try { final = this.checkURL(page.url); } catch { final = null; }
      if (!final || !this.allowPage(final.href)) { await win.loadURL('about:blank').catch(() => {}); throw fail('PRIVATE_LOGIN_REQUIRED', '網站把頁面導到未連接的網域，可能需要到「資料來源」重新登入。'); }
      const entry = { url: final.href, requestedUrl: url.href, title: page.title, text: page.text.slice(0, MAX_CHARS * 5), checkedAt: this.now().toISOString() };
      this.remember(entry);
      return { ...entry, text: page.text.slice(0, MAX_CHARS), truncated: page.text.length > MAX_CHARS };
    });
  }
  // Fetch with this profile's cookies, e.g. a spreadsheet's CSV export.
  fetchText(raw, { maxBytes = 2 * 1024 * 1024 } = {}) {
    return this.run(async () => {
      const url = this.checkURL(raw);
      if (!this.allowPage(url.href) || !await this.hostGuard(url.hostname)) throw fail('PRIVATE_SITE_NOT_CONNECTED');
      this.configure();
      const response = await this.session().fetch(url.href, { redirect: 'follow' });
      if (!response.ok) throw fail('RESEARCH_LOAD_FAILED', '讀取失敗，可能需要重新登入或確認分享權限。');
      const type = String(response.headers.get('content-type') || '');
      if (/text\/html/.test(type)) throw fail('PRIVATE_LOGIN_REQUIRED', '拿到的是登入頁，請到「資料來源」重新登入。');
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maxBytes) throw fail('RESEARCH_TOO_LARGE');
      const entry = { url: url.href, requestedUrl: url.href, title: '', text: normalizeText(buffer.toString('utf8')), checkedAt: this.now().toISOString() };
      this.remember(entry);
      return { ...entry, text: entry.text.slice(0, MAX_CHARS), truncated: entry.text.length > MAX_CHARS };
    });
  }
  screenshot() {
    return this.run(async () => {
      if (!this.window || this.window.isDestroyed() || this.window.webContents.getURL() === 'about:blank') throw fail('RESEARCH_NO_PAGE', '請先用 open 開啟頁面。');
      let image = await this.window.webContents.capturePage();
      if (image.getSize().width > 1280) image = image.resize({ width: 1280 });
      return image.toPNG().toString('base64');
    });
  }
  remember(entry) {
    for (const key of new Set([pageKey(entry.url), pageKey(entry.requestedUrl)])) {
      if (!key) continue;
      this.pages.delete(key); this.pages.set(key, entry);
    }
    while (this.pages.size > MAX_PAGES) this.pages.delete(this.pages.keys().next().value);
  }
  // Text the App itself saw while the agent researched; used to verify quoted evidence.
  findPage(raw) { const key = pageKey(raw); return key ? this.pages.get(key) || null : null; }
  close() { if (this.window && !this.window.isDestroyed()) this.window.destroy(); this.window = null; }
}

const ROUTE_MODES = { driving: 'driving', transit: 'transit', walking: 'walking' };
function mapsRouteURL({ origin, destination, mode = 'driving' }) {
  if (typeof origin !== 'string' || typeof destination !== 'string' || !origin.trim() || !destination.trim() || origin.length > 300 || destination.length > 300 || !ROUTE_MODES[mode]) throw fail('INVALID_ROUTE', 'origin、destination 必填，mode 只能是 driving、transit 或 walking。');
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1'); url.searchParams.set('origin', origin.trim()); url.searchParams.set('destination', destination.trim());
  url.searchParams.set('travelmode', ROUTE_MODES[mode]); url.searchParams.set('hl', 'zh-TW');
  return url.href;
}
// Keep the part of a Maps page that lists route options (time, distance, via), plus a
// quote of the fastest route copied verbatim from the page so the App can verify it.
function routeExcerpt(text) {
  const all = text.split('\n').map(line => line.trim());
  const first = all.findIndex(line => /^\d[\d.,]*\s*(公里|km|公尺|m|英里|mi)$/i.test(line));
  if (first < 0) return null;
  const quote = all.slice(Math.max(0, first - 1), first + 2).filter(Boolean).join('\n');
  return { routes: all.slice(Math.max(0, first - 3), first + 30).filter(Boolean).join('\n'), quote };
}

const text = value => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }];
const urlSchema = { type: 'object', properties: { url: { type: 'string', description: '完整 https 網址' } }, required: ['url'], additionalProperties: false };
const emptySchema = { type: 'object', properties: {}, additionalProperties: false };

function publicTools(browser) {
  return [
    { name: 'research_open', description: '在 App 的隔離瀏覽器開啟公開網頁（會執行 JavaScript），回傳頁面標題、最終網址、查核時間與可見文字。引用來源時請用回傳的 url，evidence 必須逐字取自回傳的 text。', inputSchema: urlSchema,
      call: async ({ url }) => text(await browser.open(url)) },
    { name: 'maps_route', description: '用 Google Maps 查兩地之間的路線，回傳各路線的時間、距離與途經道路摘要，以及可引用的網址。mode：driving（自駕）、transit（大眾運輸）、walking（步行）。',
      inputSchema: { type: 'object', properties: { origin: { type: 'string' }, destination: { type: 'string' }, mode: { type: 'string', enum: Object.keys(ROUTE_MODES) } }, required: ['origin', 'destination', 'mode'], additionalProperties: false },
      call: async args => { const page = await browser.open(mapsRouteURL(args)); const found = routeExcerpt(page.text);
        return text(found ? { url: page.url, checkedAt: page.checkedAt, routes: found.routes, evidence: found.quote, note: '引用這條路線時，sources.evidence 請直接用 evidence 欄位的原文。' } : { url: page.url, checkedAt: page.checkedAt, routes: '找不到路線資訊，請改用更精確的地名或地址再查。' }); } },
    { name: 'research_screenshot', description: '擷取目前開啟頁面的畫面（PNG），用來看地圖、菜單等圖片資訊。', inputSchema: emptySchema,
      call: async () => [{ type: 'image', data: await browser.screenshot(), mimeType: 'image/png' }] },
  ];
}

function sheetExportURL(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  const match = /^\/spreadsheets\/d\/([\w-]{20,})/.exec(url.pathname);
  if (url.hostname !== 'docs.google.com' || !match) return null;
  const gid = /gid=(\d+)/.exec(url.hash + url.search)?.[1];
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gid ? '&gid=' + gid : ''}`;
}

function privateTools(browser, sources) {
  return [
    { name: 'private_sources', description: '列出使用者已在 App 連接並登入的私人資料網站（訂房網站、Notion、Google 試算表等）。只能讀取這些網站。', inputSchema: emptySchema,
      call: async () => text({ sources: sources.list().map(s => ({ host: s.host, addedAt: s.addedAt })) }) },
    { name: 'private_open', description: '用使用者已登入的私人瀏覽器開啟已連接網站的頁面並回傳文字（唯讀，不能點擊或送出表單）。Google 試算表網址會自動改讀 CSV。訂單號、確認碼等只能寫進 privateNotes，不可寫進行程資料。', inputSchema: urlSchema,
      call: async ({ url }) => { const sheet = sheetExportURL(url); return text(sheet ? await browser.fetchText(sheet) : await browser.open(url)); } },
    { name: 'private_screenshot', description: '擷取私人瀏覽器目前頁面的畫面（PNG）。', inputSchema: emptySchema,
      call: async () => [{ type: 'image', data: await browser.screenshot(), mimeType: 'image/png' }] },
  ];
}

module.exports = { ResearchBrowser, publicTools, privateTools, mapsRouteURL, routeExcerpt, sheetExportURL, pageKey };
