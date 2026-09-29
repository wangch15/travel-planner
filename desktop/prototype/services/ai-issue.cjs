// 「回報給開發者」的第二個來源：AI 在對話裡整理的問題或建議（capabilityGap）。
// 內容一律在這裡去識別化後才存進對話紀錄，送出時只用存下來的版本，不收畫面傳來的文字；
// 畫面仍要先顯示完整內容與公開目的地，由人按確認才送（見 issue-report.cjs）。
const { randomUUID } = require('node:crypto');

const MIN_NAME = 2;
const REPO_URL = /^https:\/\/github\.com\/wangch15\/travel-planner(?:[/#?]|$)/;

// 會洩漏是哪一趟旅程的字串：地點、行程標題、每日標題、住宿指南與店名、slug 與部署名稱。
function tripNames(trip = {}, slug = '') {
  const names = new Set([slug, trip.config?.deploy?.name, trip.config?.title, trip.config?.heading, trip.config?.subtitle]);
  for (const p of Object.values(trip.PLACES || {})) { names.add(p?.name); names.add(p?.local); }
  for (const d of trip.DAYS || []) { names.add(d?.title); names.add(d?.theme); }
  for (const g of trip.STAY_GUIDES || []) {
    names.add(g?.title);
    for (const l of g?.lists || []) for (const it of l?.items || []) names.add(it?.name);
  }
  return [...names].filter((n) => typeof n === 'string' && n.trim().length >= MIN_NAME).map((n) => n.trim()).sort((a, b) => b.length - a.length);
}

// 單一正則擋不住所有私人資訊，所以 AI 的指示也要求它先寫成通用描述；這裡是第二道。
function scrub(text, { names = [], codes = [] } = {}) {
  let t = String(text || '');
  for (const c of codes) if (c) t = t.split(c).join('〔已移除〕');
  t = t.replace(/https?:\/\/[^\s<>「」『』（）()"'`]+/g, (u) => (REPO_URL.test(u) ? u : 'https://example.invalid/'));
  t = t.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '〔已移除〕');
  t = t.replace(/(?:\/Users|\/home)\/[^\s/]+/g, '<HOME>').replace(/[A-Za-z]:\\Users\\[^\s\\]+/g, '<HOME>');
  t = t.replace(/\+?\d[\d -]{8,}\d/g, '〔已移除〕');
  for (const n of names) t = t.split(n).join('〔地點或名稱〕');
  t = t.replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, '〔日期〕').replace(/(?<![\d./])\d{1,2}\/\d{1,2}(?![\d/])/g, '〔日期〕');
  return t;
}

const firstSentence = (text) => String(text).split(/[。！？\n]/)[0].trim();
// 分類：標題開頭一定有（誰都看得到），GitHub 標籤用原專案既有的 bug／enhancement（沒權限加標籤時由 issue-report 略過）。
const KINDS = Object.freeze({
  bug: { prefix: '[App 錯誤]', labels: ['bug'], heading: '發生什麼問題' },
  ui: { prefix: '[畫面問題]', labels: ['bug'], heading: '畫面上的問題' },
  feature: { prefix: '[功能建議]', labels: ['enhancement'], heading: '使用者想要的' },
});

function aiIssueReport({ gap, trip, slug, codes = [], appVersion, engineVersion, platform }) {
  if (!gap || typeof gap.missing !== 'string' || !gap.missing.trim()) return null;
  const rules = { names: tripNames(trip, slug), codes };
  const summary = scrub(gap.missing, rules).trim();
  const details = scrub(gap.handoffPrompt || '', rules).trim();
  const kind = KINDS[gap.kind] || KINDS.feature;
  const title = `${kind.prefix} ${firstSentence(summary).slice(0, 80) || '使用者回報'}`;
  const body = [
    `## ${kind.heading}`, summary, '',
    ...(details ? ['## 詳細說明與驗收', details, ''] : []),
    '## 環境', `- App 版本：${appVersion || '未知'}`, `- 網站引擎（旅程資料夾）：${engineVersion || '未知'}`, `- 作業系統：${platform || '未知'}`, '',
    '_由 Travel Planner 桌面版裡的 AI 助手整理，使用者看過後送出；已自動去掉行程名稱、地點、日期、網址與私人資訊。_',
  ].join('\n');
  return { id: randomUUID(), title: title.slice(0, 200), body: body.slice(0, 20000), labels: [...kind.labels] };
}

module.exports = { aiIssueReport, scrub, tripNames, KINDS };
