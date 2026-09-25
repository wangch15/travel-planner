const test = require('node:test');
const assert = require('node:assert/strict');
const { IssueReportService, REPORT_REPO } = require('../services/issue-report.cjs');

const issue = { title: '[App 回報] 預覽無法建立：INVALID_TRIP（data.js）', body: '## 環境\n- App 版本：0.1.6' };

test('submits to the template repository only and returns the new issue link', async () => {
  const calls = [];
  const service = new IssueReportService({ run: async (bin, args) => { calls.push([bin, ...args]); return { stdout: `https://github.com/${REPORT_REPO}/issues/42\n` }; } });
  assert.deepEqual(await service.submit(issue), { url: `https://github.com/${REPORT_REPO}/issues/42` });
  assert.deepEqual(calls, [['gh', 'issue', 'create', '-R', REPORT_REPO, '--title', issue.title, '--body', issue.body]]);
});

test('a missing GitHub login and other failures are told apart and never claim success', async () => {
  const failing = message => new IssueReportService({ run: async () => { throw Object.assign(Error('Command failed'), { stderr: message }); } });
  await assert.rejects(failing('To get started with GitHub CLI, please run:  gh auth login').submit(issue), { code: 'GITHUB_LOGIN_REQUIRED' });
  await assert.rejects(failing('HTTP 502').submit(issue), { code: 'REPORT_FAILED' });
  const odd = new IssueReportService({ run: async () => ({ stdout: 'https://github.com/someone/else/issues/1' }) });
  await assert.rejects(odd.submit(issue), { code: 'REPORT_FAILED' }, '回傳的不是模板 repo 的 issue 就不算成功');
  await assert.rejects(new IssueReportService({ run: async () => ({ stdout: '' }) }).submit({ title: '', body: 'x' }), { code: 'REPORT_FAILED' });
});

test('the browser fallback opens a prefilled new-issue page on the template repository', () => {
  const url = new URL(new IssueReportService().newIssueURL(issue));
  assert.equal(url.origin + url.pathname, `https://github.com/${REPORT_REPO}/issues/new`);
  assert.equal(url.searchParams.get('title'), issue.title);
  assert.equal(url.searchParams.get('body'), issue.body);
});
