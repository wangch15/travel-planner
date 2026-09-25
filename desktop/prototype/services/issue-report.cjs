// 「回報給開發者」：把 App 產生的去識別化回報開成模板 repo 的公開 issue。
// 內容只能來自 main 產生的回報（preview-diagnosis.cjs），不收畫面傳來的文字；送出前畫面必須先給人看過並按確認。
const { defaultRun } = require('./backup.cjs');

const REPORT_REPO = 'wangch15/travel-planner';
const fail = code => Object.assign(new Error(code), { code });

class IssueReportService {
  constructor({ run = defaultRun } = {}) { this.run = run; }
  // 用 App 已登入的 GitHub 帳號建立 issue；回傳的網址必須是模板 repo 的 issue 才算成功。
  async submit({ title, body }) {
    if (typeof title !== 'string' || !title || title.length > 200 || typeof body !== 'string' || body.length > 20000) throw fail('REPORT_FAILED');
    let result;
    try { result = await this.run('gh', ['issue', 'create', '-R', REPORT_REPO, '--title', title, '--body', body]); }
    catch (error) { throw fail(/auth login|not logged|authenticat/i.test(String(error.stderr || error.message || '')) ? 'GITHUB_LOGIN_REQUIRED' : 'REPORT_FAILED'); }
    const url = String(result?.stdout || '').match(new RegExp(`https://github\\.com/${REPORT_REPO}/issues/\\d+`))?.[0];
    if (!url) throw fail('REPORT_FAILED');
    return { url };
  }
  // 沒登入或送不出去時的備案：在瀏覽器打開已填好內容的新 issue 頁，由人自己按送出。
  newIssueURL({ title, body }) {
    const url = new URL(`https://github.com/${REPORT_REPO}/issues/new`);
    url.searchParams.set('title', title); url.searchParams.set('body', body);
    return url.toString();
  }
}

module.exports = { IssueReportService, REPORT_REPO };
