// Uses only temporary fake projects. Run with Electron, never a real trip.
const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { PNG } = require('pngjs');
const { createWindow } = require('./main.cjs');

const output = path.resolve(__dirname, '../../.local/desktop-prototype');
const failures = [];
let win;
let root;
let deadline;
let exitStatus = 0;
// Keep Electron alive until fixture cleanup and the explicit test exit code.
app.on('window-all-closed', () => {});

async function waitFor(expression) {
  const start = Date.now();
  while (Date.now() - start < 7000) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw Error(`Timed out: ${expression}`);
}

async function capture(name) {
  await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await fs.mkdir(output, { recursive: true });
  const bounds = await win.webContents.executeJavaScript(`(() => {
    const frame = document.getElementById('preview');
    if (!frame || frame.hidden || document.getElementById('preview-panel').hidden || !document.getElementById('settings').hidden || document.getElementById('new-dialog').open) return null;
    const r = frame.getBoundingClientRect();
    return { x:r.x, y:r.y, width:r.width, height:r.height, viewport:innerWidth, dark:document.documentElement.dataset.theme === 'dark' };
  })()`);
  for (let attempt = 0; attempt < 30; attempt++) {
    const buffer = (await win.webContents.capturePage()).toPNG();
    let painted = !bounds;
    if (bounds) {
      const png = PNG.sync.read(buffer); const scale = png.width / bounds.viewport;
      let textPixels = 0;
      for (let y = Math.max(0, Math.ceil((bounds.y + 20) * scale)); y < Math.min(png.height, (bounds.y + bounds.height - 20) * scale); y += 2) {
        for (let x = Math.max(0, Math.ceil((bounds.x + 20) * scale)); x < Math.min(png.width, (bounds.x + bounds.width - 20) * scale); x += 2) {
          const value = png.data[(y * png.width + x) * 4];
          if (bounds.dark ? value > 170 : value < 100) textPixels++;
        }
      }
      painted = textPixels > 20;
    }
    if (painted) { await fs.writeFile(path.join(output, name), buffer); return; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error('Preview DOM loaded but screenshot was not painted');
}

async function waitForPreview(text) {
  const start = Date.now();
  while (Date.now() - start < 7000) {
    try {
      const document = await previewDocument();
      const nodes = flatten(document);
      if (nodes.filter(n => n.nodeType === 3).map(n => n.nodeValue).join('').includes(text)) return nodes;
    } catch { /* A prior preview frame can detach while its replacement loads. */ }
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw Error('Preview did not load expected content');
}

function flatten(node) {
  return node ? [node, ...(node.children || []).flatMap(flatten)] : [];
}

async function previewDocument() {
  // Inspect through DevTools DOM, not script evaluation: sandbox="" deliberately
  // rejects script execution even when a test calls WebFrameMain.executeJavaScript.
  const { root } = await win.webContents.debugger.sendCommand('DOM.getDocument', { depth: -1, pierce: true });
  const iframe = flatten(root).find(n => n.nodeName === 'IFRAME');
  if (iframe?.contentDocument) return iframe.contentDocument;
  const { targetInfos } = await win.webContents.debugger.sendCommand('Target.getTargets');
  const target = targetInfos.find(t => t.type === 'iframe' && t.url === 'about:srcdoc');
  if (!target) return null;
  const { sessionId } = await win.webContents.debugger.sendCommand('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  try {
    return (await win.webContents.debugger.sendCommand('DOM.getDocument', { depth: -1, pierce: true }, sessionId)).root;
  } finally {
    await win.webContents.debugger.sendCommand('Target.detachFromTarget', { sessionId });
  }
}

app.whenReady().then(async () => {
  deadline = setTimeout(() => { console.error('SMOKE timeout'); app.exit(1); }, 45000);
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-desktop-smoke-'));
  async function write(file, value) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value));
  }
  await write('package.json', { name: 'sample-travel-project', version: '1.1.0' });
  await write('scripts/build.js', 'throw Error("must never execute");');
  await write('scripts/check.js', 'throw Error("must never execute");');
  for (const slug of ['coast', 'mountain']) {
    await write(`trips/${slug}/trip.config.json`, {
      schemaVersion: 1, title: slug === 'coast' ? '海邊的三天兩夜' : '山間散步',
      dates: { start: '2027-05-01', end: '2027-05-03' }, deploy: { target: 'workers', name: `sample-${slug}` },
    });
    for (const name of ['data.js', 'details.js', 'dining.js', 'map-lists.js', 'photos.json']) await write(`trips/${slug}/${name}`, 'throw Error("never load this");');
    await write(`trips/${slug}/docs/status.md`, 'PRIVATE_SENTINEL');
  }
  const choices = [
    { canceled: true, filePaths: [] },
    { canceled: false, filePaths: [root] },
    { canceled: false, filePaths: [path.join(root, 'missing')] },
  ];
  win = await createWindow({ pickDirectory: async () => choices.shift(), stateDirectory: path.join(root, 'app-state') });
  win.webContents.setBackgroundThrottling(false);
  await win.webContents.insertCSS('* { transition: none !important; animation: none !important; }');
  win.webContents.debugger.attach('1.3');
  win.webContents.on('console-message', details => {
    if (details?.level === 'error') failures.push(details.message);
  });
  win.webContents.on('render-process-gone', (_event, details) => failures.push(details.reason));
  assert.deepEqual(await win.webContents.executeJavaScript('({node: typeof require, bridge: typeof travelDesktop.chooseProject})'), { node: 'undefined', bridge: 'function' });
  await win.webContents.executeJavaScript('setTheme("light")');
  await win.webContents.executeJavaScript('Promise.all([...document.querySelectorAll("img[data-logo]")].map(image => image.decode()))');
  await capture('workbench-welcome-light.png');
  await win.webContents.executeJavaScript('document.getElementById("open-settings").click(); document.getElementById("choose-project").click()');
  await waitFor('document.getElementById("notification").textContent.includes("已取消")');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("project-summary").hidden'), true);
  await win.webContents.executeJavaScript('document.getElementById("choose-project").click()');
  await waitFor('!document.getElementById("project-summary").hidden');
  assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll("#summary-trips .trip-row").length'), 2);
  assert.equal(await win.webContents.executeJavaScript('document.body.textContent.includes("PRIVATE_SENTINEL")'), false);
  await capture('workbench-settings-light.png');
  await win.webContents.executeJavaScript('document.querySelector("#summary-trips button").click()');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("settings").hidden'), true);
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("send-message").disabled'), true);
  await win.webContents.executeJavaScript('document.getElementById("open-settings").click(); document.getElementById("choose-project").click()');
  await waitFor('!document.getElementById("choose-project").disabled');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("trip-title").textContent'), '海邊的三天兩夜');
  await win.webContents.executeJavaScript('document.getElementById("back-to-trip").click(); openDemo()');
  await waitFor('selected?.demo === true');
  await win.webContents.executeJavaScript('document.getElementById("message").value="下午留一段自由活動的時間";document.getElementById("chat-form").requestSubmit()');
  await waitFor('document.getElementById("revision").textContent.includes("2")');
  await waitForPreview('下午留一段自由活動的時間');
  const bubble = await win.webContents.executeJavaScript(`(() => {
    const bubble = document.querySelector('.message.user');
    return { align: getComputedStyle(bubble).alignSelf, background: getComputedStyle(bubble).backgroundColor };
  })()`);
  assert.equal(bubble.align, 'flex-end');
  assert.notEqual(bubble.background, 'rgba(0, 0, 0, 0)');
  await capture('workbench-chat-light.png');
  await win.webContents.executeJavaScript('document.getElementById("trip-search").value="山間";document.getElementById("trip-search").dispatchEvent(new Event("input"))');
  assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll("#trips .trip-button").length'),1);
  assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll("#demo-trips .trip-button").length'),0);
  await win.webContents.executeJavaScript('document.getElementById("trip-search").value="沒有這趟";document.getElementById("trip-search").dispatchEvent(new Event("input"))');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("search-empty").hidden'),false);
  await win.webContents.executeJavaScript('document.getElementById("trip-search").value="";document.getElementById("trip-search").dispatchEvent(new Event("input"));document.querySelector(".journey-toggle").click()');
  assert.equal(await win.webContents.executeJavaScript('document.querySelector(".journey-toggle").getAttribute("aria-expanded")'),"true");
  await win.webContents.executeJavaScript('document.querySelector(".journey-toggle").click()');
  // Panel toggles preserve the conversation and draft.
  await win.webContents.executeJavaScript('document.getElementById("message").value = "尚未送出的草稿"; document.getElementById("message").dispatchEvent(new Event("input")); document.getElementById("sidebar-toggle").click(); document.getElementById("preview-toggle").click()');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("sidebar-content").hidden && document.getElementById("preview-panel").hidden'), true);
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("message").value'), '尚未送出的草稿');
  assert.ok(await win.webContents.executeJavaScript('document.querySelector(".chat-column").getBoundingClientRect().width >= 320'), 'chat must retain width when both panels collapse');
  await capture('workbench-collapsed-light.png');
  // Exercise both panels, all four combinations, keyboard resizing, and pointer dragging.
  await win.webContents.executeJavaScript('document.getElementById("preview-toggle").click()');
  assert.ok(await win.webContents.executeJavaScript('document.querySelector(".chat-column").getBoundingClientRect().width >= 320'));
  await capture('workbench-sidebar-collapsed-preview-light.png');
  await win.webContents.executeJavaScript('document.getElementById("sidebar-toggle").click(); document.getElementById("preview-toggle").click()');
  assert.ok(await win.webContents.executeJavaScript('document.querySelector(".chat-column").getBoundingClientRect().width >= 320'));
  await win.webContents.executeJavaScript('document.getElementById("preview-toggle").click()');
  for (const name of ['sidebar','preview']) {
    const before=await win.webContents.executeJavaScript(`Number(document.getElementById('${name}-resizer').getAttribute('aria-valuenow'))`);
    await win.webContents.executeJavaScript(`document.getElementById('${name}-resizer').dispatchEvent(new KeyboardEvent('keydown',{key:'${name === 'sidebar' ? 'ArrowRight' : 'ArrowLeft'}',bubbles:true}))`);
    const after=await win.webContents.executeJavaScript(`Number(document.getElementById('${name}-resizer').getAttribute('aria-valuenow'))`);
    assert.equal(after,before+20);
    const point=await win.webContents.executeJavaScript(`(()=>{const r=document.getElementById('${name}-resizer').getBoundingClientRect();return {x:Math.round(r.x+4),y:Math.round(r.y+150)}})()`);
    win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
    win.webContents.sendInputEvent({type:'mouseMove',x:point.x+(name === 'sidebar' ? 30 : -30),y:point.y});
    win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:point.x+(name === 'sidebar' ? 30 : -30),y:point.y});
    await waitFor(`Number(document.getElementById('${name}-resizer').getAttribute('aria-valuenow')) > ${after}`);
    assert.ok(await win.webContents.executeJavaScript('document.querySelector(".chat-column").getBoundingClientRect().width >= 320'));
  }
  await capture('workbench-resized-light.png');
  await win.webContents.executeJavaScript('document.getElementById("open-settings").click(); document.querySelector("[data-setting=appearance]").click()');
  await win.webContents.executeJavaScript('setTheme("dark")');
  await waitFor('document.documentElement.dataset.theme === "dark"');
  assert.equal(require('electron').nativeTheme.shouldUseDarkColors, true);
  const logos = await win.webContents.executeJavaScript('Promise.all([...document.querySelectorAll("img[data-logo]")].map(async image => { await image.decode(); return { src: image.getAttribute("src"), width: image.naturalWidth }; }))');
  assert.ok(logos.every(image => image.src.endsWith('-on-dark-v2.svg') && image.width > 0));
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("favicon").getAttribute("href")'), 'assets/brand/favicon-dark.svg');
  await capture('workbench-appearance-dark.png');
  assert.equal(await win.webContents.executeJavaScript('document.querySelector(".chat-heading").hidden && !document.getElementById("settings-heading").hidden'),true);
  await win.webContents.executeJavaScript('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("settings").hidden'),true);
  await win.webContents.executeJavaScript('document.dispatchEvent(new KeyboardEvent("keydown",{key:",",ctrlKey:true,bubbles:true}))');
  assert.equal(await win.webContents.executeJavaScript('!document.getElementById("settings").hidden && !document.getElementById("setting-appearance").hidden'),true);

  await win.webContents.executeJavaScript('document.getElementById("back-to-trip").click()');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("message").value'), '尚未送出的草稿');
  await waitForPreview('下午留一段自由活動的時間');
  await capture('workbench-chat-dark.png');
  await win.webContents.executeJavaScript('document.getElementById("new-demo").click(); document.getElementById("new-kind").value="demo"; document.getElementById("new-title").value = "秋天的小旅行"; document.getElementById("new-destination").value = "山間小鎮"; document.getElementById("new-start").value = "2027-10-01"; document.getElementById("new-end").value = "2027-10-04"; document.getElementById("new-notes").value = "想走得慢一點，多留一些自由活動時間。"');
  await capture('workbench-new-trip-dark.png');
  await win.webContents.executeJavaScript('document.getElementById("new-end").value = "2027-09-30"; document.getElementById("new-form").requestSubmit()');
  assert.equal(await win.webContents.executeJavaScript('!document.getElementById("new-error").hidden && document.getElementById("new-dialog").open'), true);
  await win.webContents.executeJavaScript('document.getElementById("new-end").value = "2027-10-04"; document.getElementById("new-form").requestSubmit()');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("trip-title").textContent'), '秋天的小旅行');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("message").value'), '');
  assert.equal(await win.webContents.executeJavaScript('document.querySelector(".message.user .message-content").textContent'), '想走得慢一點，多留一些自由活動時間。');
  await win.webContents.executeJavaScript('document.getElementById("open-demo").click()');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("message").value'), '尚未送出的草稿');
  // Script-like input remains literal text in the isolated preview.
  await win.webContents.executeJavaScript(`document.getElementById('message').value = '<img src=x onerror="parent.pwned=true"><script>parent.pwned=true</script>'; document.getElementById('chat-form').requestSubmit()`);
  const previewNodes = await waitForPreview('<img src=x');
  assert.equal(previewNodes.filter(n => n.nodeName === 'IMG' || n.nodeName === 'SCRIPT').length, 0);
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("preview").getAttribute("sandbox")'), '');
  assert.equal(await win.webContents.executeJavaScript('typeof pwned'), 'undefined');
  // An unspecified return date must stay unknown, not become the departure day.
  await win.webContents.executeJavaScript('document.getElementById("new-demo").click(); document.getElementById("new-kind").value="demo"; document.getElementById("new-title").value = "日期未定的旅程"; document.getElementById("new-start").value = "2027-10-01"; document.getElementById("new-form").requestSubmit()');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("trip-status").textContent.includes("回程未定")'), true);
  // Start a clean demo for small-window captures; do not show injection-test text.
  await win.webContents.executeJavaScript('newDemo("週末的慢旅行"); document.getElementById("message").value = "午後安排自由散步，不用太趕。"; document.getElementById("chat-form").requestSubmit()');
  await waitForPreview('午後安排自由散步，不用太趕。');
  win.setSize(900, 700);
  await waitFor('window.innerWidth <= 900');
  await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  assert.equal(await win.webContents.executeJavaScript('document.documentElement.scrollWidth <= window.innerWidth'), true);
  assert.ok(await win.webContents.executeJavaScript('document.querySelector(".chat-column").getBoundingClientRect().width >= 320'));
  await capture('workbench-small-preview-dark.png');
  await win.webContents.executeJavaScript('document.getElementById("preview-close").click()');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("preview-panel").hidden'), true);
  await capture('workbench-small-chat-dark.png');
  await win.webContents.executeJavaScript('setTheme("system")');
  assert.equal(await win.webContents.executeJavaScript('document.querySelector("img[data-logo]").getAttribute("src")'), 'assets/brand/travel-planner-mark-on-' + (require('electron').nativeTheme.shouldUseDarkColors ? 'dark' : 'light') + '-v2.svg');
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ passed: true, platform: process.platform, arch: process.arch, electron: process.versions.electron,
    cases: ['settings import + cancel', 'private notes omitted', 'real trip read-only', 'invalid selection recovery', 'chat + right user bubbles', 'sidebar + preview toggles', 'draft preservation', 'light/dark/system logos + native theme', 'new trip modal + dates + notes', 'trip isolation', 'preview HTML escaping', 'small window center remains visible', 'resize both panes with pointer and keyboard', 'four collapse combinations'], screenshots: output }, null, 2));
}).catch(async error => {
  exitStatus = 1;
  console.error(error);
  console.error('Renderer errors:', failures);
  if (win && !win.isDestroyed()) {
    console.error('Frames:', win.webContents.mainFrame.frames.map(frame => ({ url: frame.url, detached: frame.detached })));
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, 'smoke-failure.png'), (await win.webContents.capturePage()).toPNG());
  }
  exitStatus = 1;
}).finally(async () => {
  clearTimeout(deadline);
  if (win && !win.isDestroyed()) win.destroy();
  if (root) await fs.rm(root, { recursive: true, force: true });
  app.exit(exitStatus);
});
