// Clipboard screenshots and dropped files reach the model as attachments; fake model and temporary project only.
const { app } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createWindow, shutdown } = require('./main.cjs');
const { createProjectStore } = require('./project-store.cjs');
app.on('window-all-closed', () => {});
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l6UAAAAASUVORK5CYII=';
let root, win, timeout, exitStatus = 0;
async function waitFor(expression) {
  for (let i = 0; i < 200; i++) { if (await win.webContents.executeJavaScript(expression)) return; await new Promise(r => setTimeout(r, 50)); }
  const state = await win.webContents.executeJavaScript('JSON.stringify({notification:document.getElementById("notification").textContent,tray:document.getElementById("composer-attachments").outerHTML.slice(0,300),selected:window.selectedReferenceIds?.()})');
  throw Error('Paste condition timed out: ' + expression + ' | ' + state);
}
const run = script => win.webContents.executeJavaScript(script);
app.whenReady().then(async () => {
  timeout = setTimeout(() => app.exit(1), 30000);
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'travel-paste-')));
  const project = path.join(root, 'project'), state = path.join(root, 'state');
  await fs.mkdir(path.join(project, 'scripts'), { recursive: true });
  await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({ name: 'sample-project', version: '1.1.0' }));
  for (const name of ['build.js', 'check.js']) await fs.writeFile(path.join(project, 'scripts', name), 'throw Error("must not execute imported script")');
  await fs.cp(path.resolve(__dirname, '../../trips/_example'), path.join(project, 'trips/sample'), { recursive: true });
  const store = createProjectStore(state); await store.connect({ id: 'paste-project', root: project }); await store.select('paste-project', 'sample');
  const account = new EventEmitter(); account.account = { state: 'connected', label: '測試帳號', version: '0.155.1' };
  account.connect = async () => account.account; account.stop = async () => {};
  account.models = async () => [{ id: 'fake-model', name: 'Fake model', isDefault: true, inputModalities: ['text', 'image'] }];
  const received = [];
  win = await createWindow({
    stateDirectory: state, codexAccount: account, openPreviewURL: async () => {},
    makeProvider: id => { const a = new EventEmitter(); a.account = { state: 'needs-login', provider: id }; a.connect = async () => a.account; a.refresh = a.connect; a.models = async () => []; a.stop = async () => {}; return { account: a, editor: { active: null, stop: async () => {} } }; },
    makeEditor: () => ({ active: null, stop: async () => ({ requested: true }), generate: async ({ attachments, onThread, thread }) => {
      await onThread(thread?.id || 'fake-thread');
      received.push(await Promise.all(attachments.map(async a => ({ kind: a.kind, name: a.name, bytes: a.localPath ? (await fs.readFile(a.localPath)).toString('base64') : null }))));
      return { summary: '已看到附件。', discussion: true, model: 'fake-model', threadId: 'fake-thread', turnId: 'fake-turn-1' };
    } }),
  });
  await waitFor('document.documentElement.dataset.ready === "true"');
  await waitFor('document.getElementById("preview").getAttribute("src")?.startsWith("travel-preview://")');
  await run('document.getElementById("open-settings").click(); document.querySelector("[data-setting=accounts]").click(); document.getElementById("codex-connect").click()');
  await waitFor('document.getElementById("codex-badge").textContent === "已連接"');
  await run('document.getElementById("back-to-trip").click()');
  await waitFor('!document.getElementById("message").disabled');

  // A macOS/Windows screenshot on the clipboard arrives as a nameless "image.png" file.
  const pastePrevented = await run(`(() => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(PNG_1PX)}), c => c.charCodeAt(0));
    const data = new DataTransfer(); data.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    document.getElementById('message').dispatchEvent(event); return event.defaultPrevented;
  })()`);
  assert.equal(pastePrevented, true);
  await waitFor('document.querySelectorAll("#composer-attachments .composer-attachment img").length === 1');
  assert.match(await run('document.querySelector("#composer-attachments span").textContent'), /^截圖-\d{8}-\d{6}\.png$/);

  // Plain text paste keeps the browser default.
  assert.equal(await run(`(() => { const data = new DataTransfer(); data.setData('text/plain', '第一天'); const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }); document.getElementById('message').dispatchEvent(event); return event.defaultPrevented; })()`), false);

  // Dropped files, including unsupported ones, go through the same path.
  await run(`(() => {
    const data = new DataTransfer(); data.items.add(new File(['# 訂房備註'], 'notes.md', { type: 'text/markdown' })); data.items.add(new File(['%PDF'], 'ticket.pdf', { type: 'application/pdf' }));
    const form = document.getElementById('chat-form');
    form.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }));
    form.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  })()`);
  await waitFor('document.querySelectorAll("#composer-attachments .composer-attachment").length === 2');
  await waitFor('document.getElementById("notification").textContent.includes("只能加入")');
  assert.equal(await run('document.getElementById("chat-form").classList.contains("drop-target")'), false);

  // Removing a chip only detaches it from this message.
  await run('[...document.querySelectorAll("#composer-attachments button")].find(b => b.getAttribute("aria-label").includes("notes.md")).click()');
  await waitFor('document.querySelectorAll("#composer-attachments .composer-attachment").length === 1');

  await run('document.getElementById("message").value = "幫我讀這張訂房截圖"; document.getElementById("chat-form").requestSubmit()');
  await waitFor('document.getElementById("messages").textContent.includes("已看到附件")');
  assert.equal(received.length, 1); assert.equal(received[0].length, 1);
  assert.equal(received[0][0].kind, 'image'); assert.equal(received[0][0].bytes, PNG_1PX);
  console.log(JSON.stringify({ passed: true, fakeModel: true, clipboardImage: true, textPasteUntouched: true, dropFiles: true, unsupportedDropRejected: true, detachChip: true, bytesReachModel: true }));
}).catch(error => { console.error(error); exitStatus = 1; }).finally(async () => {
  clearTimeout(timeout); if (win && !win.isDestroyed()) win.destroy(); await shutdown();
  if (root) await fs.rm(root, { recursive: true, force: true }); app.exit(exitStatus);
});
