// 「回報給開發者」：把 App 產生的去識別化回報開成模板 repo 的公開 issue。
// 內容只能來自 main 產生的回報（preview-diagnosis.cjs），不收畫面傳來的文字；送出前畫面必須先給人看過並按確認。
const { defaultRun } = require('./backup.cjs');

const REPORT_REPO = 'wangch15/travel-planner';
// 只用原專案既有的標籤；其他值一律丟掉，避免在 repo 裡建出新標籤。
const LABELS = new Set(['bug', 'enhancement']);
const cleanLabels = labels => Array.isArray(labels) ? [...new Set(labels.filter(l => LABELS.has(l)))] : [];
const fail = code => Object.assign(new Error(code), { code });

class IssueReportService {
  constructor({ run = defaultRun } = {}) { this.run = run; }
  // 用 App 已登入的 GitHub 帳號建立 issue；回傳的網址必須是模板 repo 的 issue 才算成功。
  async submit({ title, body, labels }) {
    if (typeof title !== 'string' || !title || title.length > 200 || typeof body !== 'string' || body.length > 20000) throw fail('REPORT_FAILED');
    const base = ['issue', 'create', '-R', REPORT_REPO, '--title', title, '--body', body];
    const tags = cleanLabels(labels).flatMap(l => ['--label', l]);
    const failure = error => fail(/auth login|not logged|authenticat/i.test(String(error.stderr || error.message || '')) ? 'GITHUB_LOGIN_REQUIRED' : 'REPORT_FAILED');
    let result;
    try { result = await this.run('gh', [...base, ...tags]); }
    catch (error) {
      // 一般使用者通常沒有替別人的 repo 加標籤的權限：這時改成不帶標籤再送一次，分類仍在標題開頭。
      if (!tags.length || !/label|permission|not allowed|forbidden|403/i.test(String(error.stderr || error.message || '')) || failure(error).code === 'GITHUB_LOGIN_REQUIRED') throw failure(error);
      try { result = await this.run('gh', base); } catch (retry) { throw failure(retry); }
    }
    const url = String(result?.stdout || '').match(new RegExp(`https://github\\.com/${REPORT_REPO}/issues/\\d+`))?.[0];
    if (!url) throw fail('REPORT_FAILED');
    return { url };
  }
  // 沒登入或送不出去時的備案：在瀏覽器打開已填好內容的新 issue 頁，由人自己按送出。
  newIssueURL({ title, body, labels }) {
    const url = new URL(`https://github.com/${REPORT_REPO}/issues/new`);
    url.searchParams.set('title', title); url.searchParams.set('body', body);
    const tags = cleanLabels(labels); if (tags.length) url.searchParams.set('labels', tags.join(','));
    return url.toString();
  }
}

module.exports = { IssueReportService, REPORT_REPO };
