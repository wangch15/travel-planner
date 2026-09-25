// 預覽建不起來時，把原因翻成人話、決定給哪些按鈕，並產生可以交給幫忙的人的去識別化摘要。
// 純函式：不讀檔、不碰 Electron。輸入由 main.cjs 收集（錯誤、旅程資料夾狀態、上次備份能不能用）。

const FILE_LABELS = {
  'trip.config.json': '行程設定', 'data.js': '每日行程與地點', 'details.js': '地點說明', 'dining.js': '餐食',
  'map-lists.js': 'Google Maps 清單', 'photos.json': '照片清單', 'basemap.json': '地圖底圖', 'extra.js': '自訂區塊', 'theme.css': '外觀',
};

// 引擎的檢查訊息（packages/engine/schema.cjs）開頭固定，依此對到使用者會打開的那個檔案；對不到就歸「其他」。
function problemFile(message) {
  const m = String(message);
  if (/^trip\.config|^deploy\./.test(m)) return 'trip.config.json';
  if (/^basemap/.test(m)) return 'basemap.json';
  if (/^PHOTOS\./.test(m)) return 'photos.json';
  if (/^DETAILS\.|缺 detail$|沒有詳細說明$/.test(m)) return 'details.js';
  if (/^Day \S+ meal |缺餐食規劃/.test(m)) return 'dining.js';
  if (/Google Maps 清單|的清單少了/.test(m)) return 'map-lists.js';
  if (/^(PLACES\.|Day |DAYS|OVERVIEW_ROUTE|ADDONS|STAYS|CHECKLIST)/.test(m)) return 'data.js';
  return null;
}

// 只認得固定的檔名；照片檔名含地點代碼，一律只說「照片檔」。
function fileName(file) {
  if (typeof file !== 'string') return null;
  if (FILE_LABELS[file]) return { file, label: FILE_LABELS[file] };
  if (/^photos\//.test(file)) return { file: null, label: '照片檔' };
  return null;
}
const named = f => f ? (f.file ? `${f.label}（${f.file}）` : f.label) : '行程資料';

function groupProblems(problems) {
  const counts = new Map();
  for (const p of problems) { const file = problemFile(p); counts.set(file, (counts.get(file) || 0) + 1); }
  const order = [...Object.keys(FILE_LABELS), null];
  return order.filter(file => counts.has(file)).map(file => ({ file, label: file ? FILE_LABELS[file] : '其他', count: counts.get(file) }));
}
const areaText = a => `${a.file ? `${a.label}（${a.file}）` : a.label}${a.count} 處`;

const CODE_REASON = { INVALID_TRIP: 'invalid', INCOMPATIBLE_DATA: 'unreadable', READ_FAILED: 'missing', UNSAFE_PATH: 'unsafe', INPUT_LIMIT: 'too-large', SOURCE_CHANGED: 'changed' };

function explain(reason, where, areas, total) {
  switch (reason) {
    case 'outdated': return '這趟旅程的資料格式比 App 舊，所以還不能顯示預覽。按「更新旅程資料夾」升級格式後就能顯示，你的行程內容不會被改掉。';
    case 'app-older': return '這趟旅程是用比較新版的 Travel Planner 做的，這個 App 讀不懂。請先更新 App。';
    case 'invalid': return total
      ? `這趟旅程的資料有 ${total} 個地方沒通過檢查，所以還不能顯示預覽：${areas.map(areaText).join('、')}。`
      : '這趟旅程的資料缺了必要的部分或結構不對，所以還不能顯示預覽。';
    case 'unreadable': return `${named(where)}的內容 App 讀不懂，可能少了括號、引號或逗號，或被加進了程式碼。`;
    case 'missing': return `讀不到${named(where)}，可能檔案被移走、改名，或沒有讀取權限。`;
    case 'unsafe': return `${named(where)}是捷徑或連結，為了安全 App 不會跟著讀。請把真正的檔案放回旅程資料夾。`;
    case 'too-large': return `${where ? named(where) : '行程資料或照片'}超過 App 能讀取的大小。`;
    case 'changed': return '檢查時檔案剛好在變動，按「重新檢查」再試一次就好。';
    default: return '建立預覽時沒有完成，可能是資料很大或電腦正忙。可以再試一次；還是不行的話，把狀況複製給幫忙的人。';
  }
}

function diagnosePreviewFailure({ code, file = null, problems = [], update = null, backup = null, appVersion = null, platform = null } = {}) {
  const list = Array.isArray(problems) ? problems.map(String) : [];
  const reason = update?.state === 'app-older' ? 'app-older' : update?.migrating ? 'outdated' : CODE_REASON[code] || 'unknown';
  const where = fileName(file), areas = reason === 'invalid' ? groupProblems(list) : [];
  const canGoBack = Boolean(backup?.usable && backup.pendingFiles > 0) && !['outdated', 'app-older', 'changed'].includes(reason);
  const actions = [
    ...(reason === 'outdated' ? ['project-update'] : reason === 'app-older' ? ['app-update'] : canGoBack ? ['last-backup'] : []),
    'retry', ...(reason === 'changed' ? [] : ['copy-report']),
  ];
  const backupNote = !backup || !(backup.pendingFiles > 0) || ['outdated', 'app-older', 'changed'].includes(reason) ? ''
    : backup.usable ? `上次備份的版本可以正常顯示。可以回到那一版；之後還沒備份的 ${backup.pendingFiles} 個修改會丟掉。`
      : '上次備份的版本也有問題，回到那一版也沒辦法解決。';
  // 給幫忙的人：只有版本、錯誤代碼、檔案種類與數量；不含行程內容、名稱、網址或本機路徑。
  const safeCode = /^[A-Za-z0-9_-]{1,40}$/.test(String(code || '')) ? code : 'UNKNOWN';
  const report = [
    'Travel Planner 桌面版：行程預覽無法建立',
    `App 版本：${appVersion || '未知'}（${platform || '未知系統'}）`,
    `錯誤代碼：${safeCode}`,
    areas.length ? `問題所在：${areas.map(areaText).join('；')}` : where ? `問題所在：${named(where)}` : null,
    update ? `旅程資料夾：${({ current: '已是最新', 'update-available': '需要更新', 'app-older': '比 App 新' })[update.state] || '未知'}${update.migrating ? '，這趟的資料格式需要升級' : ''}` : null,
    backup ? `上次備份：${backup.pendingFiles > 0 ? (backup.usable ? '可以正常顯示' : '也無法顯示') : '沒有未備份的修改'}` : null,
    '（為了保護隱私，這段不含行程內容、地點名稱、網址或電腦上的位置。）',
  ].filter(Boolean).join('\n');
  return { reason, code: safeCode, explanation: explain(reason, where, areas, list.length), areas, problems: list, actions, backupNote, report };
}

module.exports = { diagnosePreviewFailure, problemFile, FILE_LABELS };
