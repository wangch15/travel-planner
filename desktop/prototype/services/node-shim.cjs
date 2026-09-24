// 備份保護 hook（.githooks/pre-push）需要 `node`。一般使用者多半沒裝 Node.js，
// 所以 App 在自己的資料夾放一個名為 node 的小腳本，用 App 內建的執行環境（ELECTRON_RUN_AS_NODE）
// 執行 hook。只在 App 自己發起的推送中放進 PATH，不影響使用者的終端機。
const fs = require('node:fs/promises');
const path = require('node:path');

function script(execPath) {
  // Git for Windows 用 bash 執行 hook；bash 接受正斜線的 Windows 路徑。
  const target = process.platform === 'win32' ? execPath.replace(/\\/g, '/') : execPath;
  if (/["$`\\\n]/.test(target)) throw Object.assign(Error('UNSAFE_NODE_SHIM'), { code: 'UNSAFE_NODE_SHIM' });
  return `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${target}" "$@"\n`;
}

// 回傳放 node 腳本的資料夾；內容每次都重寫，避免被改成別的程式。
async function prepareNodeShim(stateDirectory, execPath = process.execPath) {
  if (!path.isAbsolute(stateDirectory) || !path.isAbsolute(execPath)) throw Object.assign(Error('UNSAFE_NODE_SHIM'), { code: 'UNSAFE_NODE_SHIM' });
  const directory = path.join(stateDirectory, 'hook-runtime');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'node');
  await fs.rm(file, { force: true });
  await fs.writeFile(file, script(execPath), { mode: 0o700, flag: 'wx' });
  return directory;
}

module.exports = { prepareNodeShim, script };
