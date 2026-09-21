// 最後一道「目的地」檢查；不看 diff、不掃歷史、不快取可見度。
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const TEMPLATE = 'wangch15/travel-planner';
const GH_TIMEOUT_MS = 10000;
const WARNING = '目前只有本機備份，尚未異地備份';

function destinationRepo(url) {
  if (typeof url !== 'string') return null;
  // 只接受可明確識別的 github.com URL。不解 SSH alias、百分比路徑或帶憑證的 URL。
  const match = /^(?:https:\/\/github\.com(?::443)?\/|git@github\.com:|ssh:\/\/git@github\.com(?::22)?\/)([a-z0-9][a-z0-9-]*)\/([a-z0-9_.-]+)\/?$/i.exec(url);
  if (!match) return null;
  const repo = match[2].replace(/\.git$/i, '');
  if (!repo || repo === '.' || repo === '..') return null;
  return `${match[1]}/${repo}`;
}

function reject(reason, next) {
  return { allowed: false, message: `✗ pre-push 已擋下這次推送。\n${WARNING}\n原因：${reason}\n下一步：${next}` };
}

function hasRealTrip(root) {
  let entries;
  try { entries = fs.readdirSync(path.join(root, 'trips'), { withFileTypes: true }); }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
  return entries.some((e) => !e.name.startsWith('_') &&
    (e.isDirectory() || (e.isSymbolicLink() && fs.statSync(path.join(root, 'trips', e.name)).isDirectory())));
}

function checkPush({ remoteUrl, remoteName, updates, root = process.cwd() }, { run = spawnSync } = {}) {
  // Git 給的 URL 才是目的地。remoteName 只是標籤；刪除／空 refs 也不能略過。
  // 刻意不依 remoteName 或 updates 決定是否查核，更不重新讀 origin。
  const repo = destinationRepo(remoteUrl);
  if (!repo) return reject('無法明確辨識這次推送的 GitHub 目的地網址。',
    '請確認推送目的地使用標準 github.com HTTPS 或 git SSH URL；不要在網址放憑證，也不要猜 SSH 別名。請讓 AI 協助檢查設定後再試。');

  if (repo.toLowerCase() === TEMPLATE) {
    try {
      if (hasRealTrip(root)) return reject('目的地是公開模板，但 trips/ 下有真實行程資料夾；行程擁有者不能推模板。',
        '請依 repo-ownership 規則改用自己的私有複本，保留本機資料；不要刪行程目錄來繞過檢查。');
      return { allowed: true, repo };
    } catch {
      return reject('無法讀取 trips/，不能確認這是只有引擎的模板維護。',
        '請確認行程資料夾與檔案權限正常後再推送，現在不要繼續。');
    }
  }

  let result;
  try {
    result = run('gh', ['repo', 'view', repo, '--json', 'visibility'], {
      cwd: root, encoding: 'utf8', timeout: GH_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1' },
    });
  } catch {
    return reject('無法啟動 GitHub 私有狀態查核。', '請確認已安裝 GitHub CLI（gh）且這個工具能使用它，再重新登入及查核。');
  }
  if (result?.error?.code === 'ETIMEDOUT' || result?.signal) {
    return reject('GitHub 私有狀態查核逾時或被中斷，不能把它當成私有。', '請確認網路與 GitHub 可連線，再重試；不要跳過檢查。');
  }
  if (result?.error?.code === 'ENOENT') {
    return reject('這個工具找不到 GitHub CLI（gh）。', '請先安裝 gh，讓執行推送的工具也能找到它，並完成 gh auth login 授權。');
  }
  if (!result || result.error || result.status !== 0) {
    return reject('無法查核目的地是否私有；可能尚未登入、沒有權限或 repo 不存在。',
      '請完成 gh auth login，確認有權限讀取這次推送的 repo，再重試。');
  }
  let visibility;
  try {
    const data = JSON.parse(result.stdout);
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('invalid');
    visibility = data.visibility;
  } catch {
    return reject('GitHub 可見度輸出格式無法判讀，不能確認是私有 repo。', '請讓 AI 檢查 gh 版本與查核結果，再重新嘗試；不要直接推送。');
  }
  if (visibility === 'PUBLIC') {
    return reject(`目的地 ${repo} 現在是 PUBLIC。已在該 repo 的內容已經公開，可能包含 docs/ 的訂房確認碼或門鎖密碼；擋這次推送不會撤回舊資料。`,
      '請先檢查 GitHub 的可見度與已公開內容，處理可能外洩的密碼；確認自己的行程 repo 恢復 PRIVATE 後才重試。');
  }
  if (visibility !== 'PRIVATE') {
    return reject('目的地不是可確認的 PRIVATE repo（INTERNAL 或未知值也不算私有）。',
      '請核對這是否為自己的私有行程 repo，處理可見度或查核問題後再試。');
  }
  return { allowed: true, repo };
}

module.exports = { checkPush, destinationRepo, GH_TIMEOUT_MS, WARNING };
