const test = require('node:test');
const assert = require('node:assert/strict');
const {
  compareVersions, parseChangelog, entriesNewerThan, renderReport, pickRemote,
} = require('../scripts/update-check.js');

const SAMPLE = `# 變更紀錄

## 1.3.0（2026-11-02）

- 加了一個新功能。
- 資料需要 migrate：是。

## 1.2.1（2026-10-15）

- 修了一個 bug。
- 資料需要 migrate：否。

## 1.1.0（2026-09-21）

- 舊的東西。
- 資料需要 migrate：否。
`;

test('版本比大小', () => {
  assert.equal(compareVersions('1.2.0', '1.10.0') < 0, true, '1.10 比 1.2 新，不能當字串比');
  assert.equal(compareVersions('1.1.0', '1.1.0'), 0);
  assert.equal(compareVersions('2.0.0', '1.9.9') > 0, true);
  assert.equal(compareVersions('1.1.1', '1.1.0') > 0, true);
});

test('讀得出 CHANGELOG 的版本、日期與 migrate 旗標', () => {
  const e = parseChangelog(SAMPLE);
  assert.deepEqual(e.map((x) => x.version), ['1.3.0', '1.2.1', '1.1.0']);
  assert.equal(e[0].date, '2026-11-02');
  assert.equal(e[0].needsMigrate, true, '「資料需要 migrate：是」要讀成 true');
  assert.equal(e[1].needsMigrate, false);
});

test('只列出比本機新的版本', () => {
  const newer = entriesNewerThan(parseChangelog(SAMPLE), '1.1.0');
  assert.deepEqual(newer.map((x) => x.version), ['1.3.0', '1.2.1']);
  assert.equal(entriesNewerThan(parseChangelog(SAMPLE), '1.3.0').length, 0, '已經最新就不該列');
});

test('已經是最新：講一句就好，不要嚇人', () => {
  const out = renderReport({ local: '1.3.0', upstream: '1.3.0', entries: [], behind: 0 });
  assert.match(out, /已經是最新/);
  assert.ok(!/migrate/.test(out), '沒有要更新就不該提 migrate');
});

test('落後時要列出版本、並且明講不會自己更新', () => {
  const entries = entriesNewerThan(parseChangelog(SAMPLE), '1.1.0');
  const out = renderReport({ local: '1.1.0', upstream: '1.3.0', entries });
  assert.match(out, /1\.1\.0/);
  assert.match(out, /1\.3\.0/);
  assert.match(out, /1\.2\.1/, '中間的版本也要列，使用者才知道跳過了什麼');
  assert.match(out, /tp-update/, '要指向更新流程');
  assert.ok(/問|要不要|不會自己/.test(out), '一定要講明這只是回報、要人決定');
});

test('中間任何一版要 migrate 就要醒目標出來', () => {
  const entries = entriesNewerThan(parseChangelog(SAMPLE), '1.1.0');
  const out = renderReport({ local: '1.1.0', upstream: '1.3.0', entries });
  assert.match(out, /migrate/, '有版本需要 migrate 就要講');
  assert.match(out, /npm run migrate/, '要給出實際指令');
});

test('全部都不需要 migrate 時要講明，不要讓人以為有風險', () => {
  const entries = entriesNewerThan(parseChangelog(SAMPLE), '1.2.1');
  const out = renderReport({ local: '1.2.1', upstream: '1.2.1', entries: [], behind: 0 });
  assert.match(out, /已經是最新/);
});

test('沒有 upstream remote 時給出修法，不是丟一個 git 錯誤', () => {
  const out = renderReport({ local: '1.1.0', upstream: null, error: 'no-upstream' });
  assert.match(out, /upstream/);
  assert.match(out, /tp-setup/, '要指向設定 remote 的地方');
  assert.ok(!/undefined|null/.test(out), `不該把內部值印出來：${out}`);
});

test('抓不到上游（離線）時說清楚，不要假裝已經是最新', () => {
  const out = renderReport({ local: '1.1.0', upstream: null, error: 'fetch-failed' });
  assert.ok(!/已經是最新/.test(out), '離線不等於最新');
  assert.match(out, /網路|連不上|抓不到/);
});

test('本機比上游新：那是作者本人，不要叫他更新', () => {
  const out = renderReport({ local: '1.4.0', upstream: '1.3.0', entries: [] });
  assert.ok(!/tp-update/.test(out), '本機比較新的時候不該叫人更新');
  assert.match(out, /比上游新|尚未發佈|還沒推/);
});

test('模板作者本人：origin 就是上游，不該報「remote 沒設好」', () => {
  const out = renderReport({ local: '1.1.0', upstream: '1.1.0', entries: [], remote: 'origin', behind: 0 });
  assert.ok(!/remote 沒設好|找不到 upstream/.test(out), `不該誤報：\n${out}`);
  assert.match(out, /已經是最新/);
});

test('挑上游來源：有 upstream 用 upstream，沒有但 origin 是模板就用 origin', () => {
  assert.equal(pickRemote(['origin', 'upstream'], 'https://github.com/me/travel-planner.git'), 'upstream');
  assert.equal(pickRemote(['origin'], 'https://github.com/wangch15/travel-planner.git'), 'origin', '作者本人');
  assert.equal(pickRemote(['origin'], 'https://github.com/me/travel-planner.git'), null, '一般使用者沒接 upstream');
  assert.equal(pickRemote([], null), null);
});

test('版本號相同但落後 commit：不可回報「已經是最新」', () => {
  // 這個專案把改動併進未 tag 的版本，所以兩邊 package.json 常常同版本而內容不同。
  // 只比 semver 的話，每個 1.1.0 的使用者都會被告知自己最新，卻少了幾十個 commit。
  const out = renderReport({ local: '1.1.0', upstream: '1.1.0', entries: [], behind: 2 });
  assert.ok(!/已經是最新/.test(out), `落後 2 個 commit 不該說最新：\n${out}`);
  assert.match(out, /2 個 commit|落後/);
  assert.match(out, /tp-update/, '要指向更新流程');
});

test('版本號相同且沒有落後：才是真的最新', () => {
  const out = renderReport({ local: '1.1.0', upstream: '1.1.0', entries: [], behind: 0 });
  assert.match(out, /已經是最新/);
});

test('算不出落後數時不可假裝最新', () => {
  const out = renderReport({ local: '1.1.0', upstream: '1.1.0', entries: [], behind: null });
  assert.ok(!/已經是最新/.test(out), '落後數未知就不能斷言最新');
  assert.match(out, /無法確認|查不到|未知/);
});
