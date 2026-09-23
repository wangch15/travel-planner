// Electron's package entry must bootstrap unconditionally. Its CommonJS loader
// does not guarantee Node's `require.main === module` entry-point convention.
const { app, dialog, BrowserWindow } = require('electron');
const { createWindow, shutdown, isUpdateHandoff } = require('./main.cjs');

if (!app.requestSingleInstanceLock()) app.quit();
else {
let quitting = false, quitReady = false;
app.on('before-quit', event => {
  if (quitReady || isUpdateHandoff()) return;
  event.preventDefault();if(quitting)return;quitting = true;
  shutdown().finally(() => {quitReady=true;app.quit();});
});
app.on('second-instance', () => { const win = BrowserWindow.getAllWindows()[0]; if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => createWindow()).catch(() => {
  dialog.showErrorBox('無法開啟桌面原型', '桌面介面未能載入。請重新啟動；若仍失敗，請讓 coding agent 檢查本機執行環境。');
  app.exit(1);
});
app.on('window-all-closed', () => app.quit());
}
