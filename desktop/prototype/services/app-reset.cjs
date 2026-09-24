// 重置 App 資料：先寫標記、重新啟動，下次啟動時在 Chromium 開啟資料夾之前整個刪掉。
// 執行中的 App 仍鎖著 Cookies、快取等檔案，所以不在當下刪。
const fs = require('node:fs');
const path = require('node:path');

const MARKER = '.reset-pending';

// 只接受明確的 App 資料夾，避免誤刪家目錄或根目錄。
function assertStateDirectory(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw Object.assign(Error('UNSAFE_RESET_DIRECTORY'), { code: 'UNSAFE_RESET_DIRECTORY' });
  const resolved = path.resolve(directory);
  if (resolved === path.parse(resolved).root || path.dirname(resolved) === resolved || resolved.split(path.sep).filter(Boolean).length < 3) {
    throw Object.assign(Error('UNSAFE_RESET_DIRECTORY'), { code: 'UNSAFE_RESET_DIRECTORY' });
  }
  return resolved;
}

function requestReset(directory) {
  const resolved = assertStateDirectory(directory);
  fs.mkdirSync(resolved, { recursive: true });
  fs.writeFileSync(path.join(resolved, MARKER), resolved + '\n', { mode: 0o600 });
}

// 標記內容必須是同一個資料夾，才會刪除；回傳是否真的重置了。
function applyPendingReset(directory) {
  const resolved = assertStateDirectory(directory);
  let recorded;
  try { recorded = fs.readFileSync(path.join(resolved, MARKER), 'utf8').trim(); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  if (recorded !== resolved) return false;
  fs.rmSync(resolved, { recursive: true, force: true });
  return true;
}

module.exports = { requestReset, applyPendingReset, MARKER };
