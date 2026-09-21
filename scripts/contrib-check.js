#!/usr/bin/env node
// 開 PR 回模板之前的安全檢查：node scripts/contrib-check.js [<base>]
//
// 模板是公開的，而它的 fork 也一定是公開的（GitHub 不允許把公開 repo 的
// fork 改成私有）。所以推上去的分支裡只要夾帶一個 trips/ 底下的檔案，
// 使用者的行程、訂房確認碼與私人筆記就公開了，而且 git 歷史刪不掉。
//
// 檢查 base..HEAD 的全部新增歷史，不只最後 diff；已刪除的私人檔案仍會隨 Git 推送。
const { execFileSync } = require('node:child_process');
const { ROOT } = require('./lib/paths.js');

const DEFAULT_BASE = 'upstream/main';

// trips/_example 是模板附的範例，屬於引擎；其他 trips/ 底下的都是某個人的行程。
const BLOCKED = [
  { re: /^trips\/_profile\.md$/, why: '跨行程的私人偏好（同行的人、飲食限制）' },
  { re: /^trips\/(?!_example\/)/, why: '某個人的行程資料與私人筆記' },
  { re: /^dist\//, why: 'build 產物，不該進 git' },
  { re: /\/\.cache\//, why: '快取，不該進 git' },
];

function classifyPaths(paths) {
  const blocked = [];
  const engine = [];
  for (const p of paths) {
    const hit = BLOCKED.find((b) => b.re.test(p));
    (hit ? blocked : engine).push(p);
  }
  return { blocked, engine };
}

function renderVerdict({ blocked, engine }) {
  if (blocked.length) {
    const lines = ['✗ 這個分支不能開 PR——裡面有不該公開的東西：', ''];
    for (const p of blocked) {
      const why = (BLOCKED.find((b) => b.re.test(p)) || {}).why || '';
      lines.push(`  ${p}${why ? `　（${why}）` : ''}`);
    }
    lines.push('');
    lines.push('**模板的 fork 一定是公開的**，GitHub 不允許把它改成私有。');
    lines.push('這些檔案推上去就公開了，而且事後刪檔案沒有用——git 歷史還在。');
    lines.push('');
    lines.push('修法：另開一條乾淨的分支，只 cherry-pick 引擎那幾個 commit。');
    lines.push('  git switch -c contrib-<主題> upstream/main');
    lines.push('  git cherry-pick <只動引擎的 commit>');
    lines.push('  npm run contrib-check');
    return lines.join('\n');
  }
  if (!engine.length) {
    return [
      '這個分支相對 base 沒有新增的檔案歷史，沒有東西可以提。',
      '',
      '只是想提建議或回報問題的話開 issue 就好，不用 PR：',
      '  gh issue create -R wangch15/travel-planner',
    ].join('\n');
  }
  return [
    `✓ 本機路徑歷史檢查通過。新增歷史涉及的引擎檔案共 ${engine.length} 個：`,
    '',
    ...engine.map((p) => `  ${p}`),
    '',
    '接著確認一次（見 .ai/rules/contributing-upstream.md）：',
    '  - npm test 全綠',
    '  - 這是純粹的改進，不是設計取捨——不確定就改開 issue 問',
    '  - PR 說明寫清楚：解決什麼問題、為什麼兩個插槽做不到',
  ].join('\n');
}

function changedPaths(base) {
  // 兩點：HEAD 可達而 base 不可達的 commits，包含合併進來的側支。
  // -m：merge 對每個 parent 比較，包含只在解衝突時加入的檔案。
  // --no-renames：改名視為刪除 + 新增，兩端路徑都要查。
  // -z：保留非 ASCII、空白與換行路徑，避免 Git quoting 隱藏 trips/ 前綴。
  const out = execFileSync('git', [
    'log', '--format=', '--name-only', '-z', '--no-renames', '-m', '--root',
    '--end-of-options', `${base}..HEAD`, '--',
  ], { cwd: ROOT, encoding: 'utf8' });
  return [...new Set(out.split('\0').filter(Boolean))].sort();
}

module.exports = { classifyPaths, renderVerdict, changedPaths, BLOCKED };

if (require.main === module) {
  const base = process.argv[2] || DEFAULT_BASE;
  try {
    const verdict = classifyPaths(changedPaths(base));
    console.log(renderVerdict(verdict));
    if (verdict.blocked.length) process.exitCode = 1;
  } catch (e) {
    console.log(`比不出差異（base：${base}）：${e.message}`);
    console.log('\nupstream 沒接好的話見 tp-setup 第 3 步，或自己指定 base：');
    console.log('  npm run contrib-check -- origin/main');
    process.exitCode = 1;
  }
}
