const { app } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { createWindow } = require('./main.cjs');
const { createProjectStore } = require('./project-store.cjs');
app.on('window-all-closed', () => {});
let root, win, timeout;
let exitStatus = 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(test) {
  for (let i = 0; i < 200; i++) { if (await test()) return; await pause(50); }
  throw Error('Real preview condition timed out');
}
app.whenReady().then(async () => {
  timeout = setTimeout(() => app.exit(1), 30000);
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-real-preview-'));
  const project = path.join(root, 'project');
  const stateDirectory = path.join(root, 'state');
  await fs.mkdir(path.join(project, 'scripts'), { recursive: true });
  await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({ name: 'sample-project', version: '1.1.0' }));
  await fs.writeFile(path.join(project, 'scripts/build.js'), 'throw Error("must not run imported build")');
  await fs.writeFile(path.join(project, 'scripts/check.js'), 'throw Error("must not run imported check")');
  await fs.cp(path.resolve(__dirname, '../../trips/_example'), path.join(project, 'trips/sample-trip'), { recursive: true });
  const config = JSON.parse(await fs.readFile(path.join(project, 'trips/sample-trip/trip.config.json'), 'utf8'));
  const store = createProjectStore(stateDirectory);
  await store.connect({ id: 'fixture-project', root: await fs.realpath(project) });
  await store.select('fixture-project', 'sample-trip');
  await store.setTheme('dark');
  win = await createWindow({ stateDirectory });
  await waitFor(() => win.webContents.executeJavaScript('document.documentElement.dataset.ready === "true"'));
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("trip-title").textContent'), config.title);
  assert.equal(await win.webContents.executeJavaScript('document.documentElement.dataset.theme'), 'dark');
  // 面板預設可能已開啟；明確打開，不用切換（切換會把開著的關掉）。面板關著時不載入預覽，免得被記成「看過」。
  await win.webContents.executeJavaScript('setPreview(true)');
  await waitFor(() => win.webContents.executeJavaScript('document.getElementById("preview").getAttribute("src")?.startsWith("travel-preview://")'));
  let frame;
  await waitFor(async () => {
    frame = win.webContents.mainFrame.frames.find(item => item.url.startsWith('travel-preview://'));
    if (!frame) return false;
    try { return await frame.executeJavaScript('document.readyState === "complete" && document.body.textContent.length > 100'); } catch { return false; }
  });
  const inspected = await frame.executeJavaScript(`(() => {
    let parentBlocked = false; try { void parent.document.body; } catch { parentBlocked = true; }
    return { node:typeof require, bridge:typeof travelDesktop, parentBlocked, title:document.title, text:document.body.textContent.length };
  })()`);
  assert.equal(inspected.node, 'undefined'); assert.equal(inspected.bridge, 'undefined'); assert.equal(inspected.parentBlocked, true);
  assert.equal(inspected.title, config.title);
  await fs.mkdir(path.resolve(__dirname, '../../.local/desktop-prototype'), { recursive: true });
  await fs.writeFile(path.resolve(__dirname, '../../.local/desktop-prototype/real-example-preview.png'), (await win.webContents.capturePage()).toPNG());
  // Recreate a fresh renderer and verify persisted state, not just live variables.
  win.destroy();
  win = await createWindow({ stateDirectory });
  await waitFor(() => win.webContents.executeJavaScript('document.documentElement.dataset.ready === "true"'));
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("trip-title").textContent'), config.title);
  console.log(JSON.stringify({ passed: true, restoredProject: true, restoredTrip: true, restoredTheme: true,
    realEngineRendered: true, previewHasNoNodeOrIPC: true, previewCannotReadParent: true }));
}).catch(error => { console.error(error); exitStatus = 1; }).finally(async () => {
  clearTimeout(timeout); if (win && !win.isDestroyed()) win.destroy();
  if (root) await fs.rm(root, { recursive: true, force: true });
  app.exit(exitStatus);
});
