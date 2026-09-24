// 同一個專案資料夾被兩個 Travel Planner（例如安裝版與開發版）同時開啟時提醒使用者。
// 紀錄放在專案的 .local/（已 gitignore），只記程序編號與 App 資料夾，不擋操作，只提醒。
const fs = require('node:fs/promises');
const path = require('node:path');

const FILE = path.join('.local', 'desktop-open.json');

function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

async function readLock(root) {
  try { const value = JSON.parse(await fs.readFile(path.join(root, FILE), 'utf8')); return value && typeof value === 'object' ? value : null; }
  catch { return null; }
}

// 回傳提醒文字（沒有衝突時為 null），並把這個 App 記為目前開啟者。
async function claimProject(root, { pid = process.pid, dataDir, kind, isAlive = alive } = {}) {
  const other = await readLock(root);
  const warning = other && other.pid !== pid && other.dataDir !== dataDir && isAlive(other.pid)
    ? `這個專案同時在另一個 Travel Planner（${other.kind === 'dev' ? '從原始碼執行的開發版' : '安裝版'}）開著。兩邊同時修改可能互相覆蓋，請先關掉其中一個。`
    : null;
  try {
    await fs.mkdir(path.join(root, '.local'), { recursive: true });
    await fs.writeFile(path.join(root, FILE), JSON.stringify({ pid, dataDir, kind, since: new Date().toISOString() }) + '\n');
  } catch {}
  return warning;
}

async function releaseProject(root, { pid = process.pid } = {}) {
  const current = await readLock(root);
  if (current?.pid === pid) await fs.rm(path.join(root, FILE), { force: true }).catch(() => {});
}

module.exports = { claimProject, releaseProject, alive };
