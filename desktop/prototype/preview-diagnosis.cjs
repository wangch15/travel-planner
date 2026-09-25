// 預覽建不起來時，把原因翻成人話、決定給哪些按鈕，並產生回報給開發者的去識別化 issue。
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

function diagnosePreviewFailure({ code, file = null, problems = [], update = null, backup = null, appVersion = null, appCommit = null, platform = null } = {}) {
  const list = Array.isArray(problems) ? problems.map(String) : [];
  const reason = update?.state === 'app-older' ? 'app-older' : update?.migrating ? 'outdated' : CODE_REASON[code] || 'unknown';
  const where = fileName(file), areas = reason === 'invalid' ? groupProblems(list) : [];
  const canGoBack = Boolean(backup?.usable && backup.pendingFiles > 0) && !['outdated', 'app-older', 'changed'].includes(reason);
  const actions = [
    ...(reason === 'outdated' ? ['project-update'] : reason === 'app-older' ? ['app-update'] : canGoBack ? ['last-backup'] : []),
    'retry', ...(reason === 'changed' ? [] : ['report']),
  ];
  const backupNote = !backup || !(backup.pendingFiles > 0) || ['outdated', 'app-older', 'changed'].includes(reason) ? ''
    : backup.usable ? `上次備份的版本可以正常顯示。可以回到那一版；之後還沒備份的 ${backup.pendingFiles} 個修改會丟掉。`
      : '上次備份的版本也有問題，回到那一版也沒辦法解決。';
  const safeCode = /^[A-Za-z0-9_-]{1,40}$/.test(String(code || '')) ? code : 'UNKNOWN';
  const issue = developerIssue({ safeCode, where, areas, list, update, backup, appVersion, appCommit, platform });
  return { reason, code: safeCode, explanation: explain(reason, where, areas, list.length), areas, problems: list, actions, backupNote, issue };
}

// 引擎檢查訊息（packages/engine/schema.cjs）固定部分用到的字。去掉地點代碼與值之後，只要還有這以外的字就整行不送。
const TEMPLATE_TEXT = 'basemap.json 缺 meta.bbox：重跑 npm run basemap CHECKLIST 為空 DAYS 為空 trip.config 缺 deploy.name（部署用的 Worker／Pages 專案名稱）'
  + ' 缺 detail ADDONS 未知地點 缺 day/why/cost 的 bbox 與 不符 的清單少了 先更新實際 Maps 清單再改 map-lists.js 停留點不足 2 個 缺 date/title/theme 缺 Google Maps 清單'
  + ' alt 沒有詳細說明 引用未知地點 color 不是 hex meal 缺 slot/time/plan/fallback 地點或詳細說明不存在 缺餐食規劃（sections.dining 已開啟） stop 缺 time kind 不合法'
  + ' 自駕的 leg 缺 dist 大眾運輸的 leg 缺 via（路線名） leg.mode id 應為 實際 deploy.target DETAILS 缺 refs 缺 stay highlights 不足 點 info 每列需為 [標籤, 內容] ref 網址不合法 summary 太短'
  + ' OVERVIEW_ROUTE PHOTOS 直接網址缺 credit 缺來源頁面連結 授權不明 PLACES 缺 gq 或 gurl 缺 name 的 parking 缺座標 座標超出 region.bbox 座標不是數字 cat STAYS 的 day 指向不存在的天 nights'
  + ' schemaVersion 是 引擎需要 Day';
const TEMPLATE_WORDS = new Set(TEMPLATE_TEXT.match(/[A-Za-z_]+/g));
const TEMPLATE_CHARS = new Set([...TEMPLATE_TEXT.replace(/[\x00-\x7f]/g, ''), '＊', '，']);

// 把一條檢查訊息變成「問題類型」：去掉地點代碼、全形冒號後的值、不是數字的天數代號；認不得的字就整行換成「其他規則」。
function generalizeProblem(message) {
  const m = String(message).split('：')[0]
    .replace(/^(PLACES|DETAILS|PHOTOS)\.[^\s[]+/, '$1.＊')
    .replace(/^Day (\S+)/, (all, id) => /^\d{1,3}$/.test(id) ? all : 'Day ＊')
    .replace(/(引用未知地點|未知地點|的清單少了) \S+/, '$1 ＊')
    .replace(/ 的 \S+ 沒有詳細說明$/, ' 的 ＊ 沒有詳細說明')
    .replace(/^\S+ 缺 detail$/, '＊ 缺 detail')
    .replace(/，實際 .*$/, '，實際 ＊')
    .replace(/schemaVersion 是 [^，]*，/, 'schemaVersion 是 ＊，');
  const words = m.match(/[A-Za-z_]+/g) || [], chars = [...m.replace(/[\x00-\x7f]/g, '')];
  if (m.length > 120 || !words.every(w => TEMPLATE_WORDS.has(w)) || !chars.every(c => TEMPLATE_CHARS.has(c))) return '（其他規則）';
  return m;
}

// 回報給開發者的 issue：只有版本、錯誤代碼、檔案種類與處數、去識別化的問題類型；不含行程內容、名稱、網址或本機路徑。
function developerIssue({ safeCode, where, areas, list, update, backup, appVersion, appCommit, platform }) {
  const kinds = new Map();
  for (const p of list) { const k = generalizeProblem(p); kinds.set(k, (kinds.get(k) || 0) + 1); }
  const mainFile = areas.find(a => a.file)?.file || where?.file || null;
  const version = `${appVersion || '未知'}${/^[0-9a-f]{7,40}$/.test(appCommit || '') ? `（commit ${appCommit.slice(0, 7)}）` : ''}`;
  const lines = [
    '## 環境', `- App 版本：${version}`, `- 作業系統：${platform || '未知'}`, '',
    '## 發生什麼事', `行程預覽無法建立。錯誤代碼：\`${safeCode}\``, '',
    ...(areas.length || where ? ['## 問題所在', ...(areas.length ? areas.map(a => `- ${areaText(a)}`) : [`- ${named(where)}`]), ''] : []),
    ...(kinds.size ? ['## 問題類型', ...[...kinds].slice(0, 30).map(([k, n]) => `- ${k}${n > 1 ? `（${n} 處）` : ''}`), ...(kinds.size > 30 ? [`- …另外 ${kinds.size - 30} 種`] : []), ''] : []),
    '## 狀態',
    ...(update ? [`- 旅程資料夾：${({ current: '已是最新', 'update-available': '需要更新', 'app-older': '比 App 新' })[update.state] || '未知'}${update.migrating ? '，這趟的資料格式需要升級' : ''}`] : []),
    `- 上次備份：${!backup ? '無法確認' : backup.pendingFiles > 0 ? (backup.usable ? '可以正常顯示' : '也無法顯示') : '沒有未備份的修改'}`,
    '', '_由 Travel Planner 桌面版產生，已去掉行程內容、地點代碼、網址與電腦上的位置。_',
  ];
  return { title: `[App 回報] 預覽無法建立：${safeCode}${mainFile ? `（${mainFile}）` : ''}`, body: lines.join('\n') };
}

module.exports = { diagnosePreviewFailure, problemFile, generalizeProblem, FILE_LABELS };
