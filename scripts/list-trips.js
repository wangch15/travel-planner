#!/usr/bin/env node
// 列出這份 repo 裡的所有行程：node scripts/list-trips.js [--all]
//
// 有兩趟以上行程之後，每個指令都要帶 slug，而 agent 沒有東西可以先看一眼
// 「有哪些行程、各自做到哪」。這個指令就是那個東西——從檔案系統讀，
// 不用人維護，所以不會跟現況脫節。
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ROOT, tripDir, listTrips } = require('./lib/paths.js');
const { loadTrip } = require('./lib/load-trip.js');

// 模板內建的行程（底線開頭）平常不列，--all 才顯示。
function allSlugs(includeBuiltin) {
  const names = fs.readdirSync(path.join(ROOT, 'trips'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  return includeBuiltin ? names.sort() : listTrips().sort();
}

const TEMPLATE_REPO = 'wangch15/travel-planner';

// origin 指向模板本身的時候，「trips/ 是空的」不代表該開一趟——模板 repo 裡
// 不放任何真實行程（見 .ai/rules/repo-ownership.md）。拿不到 origin 就當不是，
// 誤判成模板會擋住一個本來該往下走的人。
function isTemplateOrigin(url) {
  if (!url) return false;
  return new RegExp(`[/:]${TEMPLATE_REPO}(\\.git)?/?$`).test(String(url).trim());
}

function originUrl() {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null; // 沒裝 git、不是 git repo、或沒有 origin
  }
}

// 這兩段是「trips/ 空的」時候唯一的下一步指示，兩種 repo 的正確答案不一樣。
const EMPTY_OWN = [
  'trips/ 底下沒有行程。先跑 npm run new -- <slug>',
  '',
  '（模板附了一份範例可以先看：npm run trips -- --all，或 npm run preview -- _example）',
].join('\n');

const EMPTY_TEMPLATE = [
  `trips/ 底下沒有自己的行程，只有模板內建的範例（npm run trips -- --all 可以看）。`,
  '',
  `origin 是 ${TEMPLATE_REPO} 本身，所以**先分清楚現在是哪一種情況**：`,
  '',
  '  (a) 在維護引擎（模板作者本人）→ 正常。模板 repo 裡不放任何真實行程，',
  '      **不要**在這裡跑 npm run new。自己的行程另外開一份私有 repo。',
  '',
  '  (b) 要做自己的行程 → 走錯路了。還沒開自己的私有 repo，',
  '      先照 .ai/rules/repo-ownership.md 的「取得專案的正確方式」做完，',
  '      再跑 npm run new -- <slug>。',
  '',
  '分不出來就問使用者一句。規則見 .ai/rules/repo-ownership.md',
].join('\n');

// 「我上次在弄的那個」是使用者最常見的講法。沒有這個欄位，agent 只能猜。
// 用最後一個碰到那個資料夾的 commit，不是檔案 mtime——新 clone 的 mtime 全都一樣。
function gitRun(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function lastTouched(slug, run = gitRun) {
  try {
    const out = run(['log', '-1', '--format=%cI', '--', `trips/${slug}`]).trim();
    return out ? out.slice(0, 10) : null;
  } catch {
    return null; // 不是 git repo、或 git 不在
  }
}

function describe(slug) {
  const dir = tripDir(slug);
  const row = { slug, title: null, dates: null, deploy: null, ok: false, problem: null, updated: lastTouched(slug) };
  try {
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'trip.config.json'), 'utf8'));
    row.title = config.title || null;
    if (config.dates && config.dates.start) row.dates = `${config.dates.start} → ${config.dates.end || '?'}`;
    if (config.deploy && config.deploy.name) {
      row.deploy = config.deploy.target === 'pages'
        ? `${config.deploy.name}.pages.dev`
        : `${config.deploy.name}.<你的帳號>.workers.dev`;
    }
  } catch (e) {
    row.problem = `讀不到 trip.config.json：${e.message}`;
    return row;
  }
  try {
    loadTrip(slug);
    row.ok = true;
  } catch (e) {
    // loadTrip 的訊息是「…（N 個問題）：」後面接明細，這裡只要第一行當摘要。
    row.problem = `${String(e.message).split('\n')[0].replace(/[:：]\s*$/, '')}——跑 npm run check -- ${slug} 看細節`;
  }
  return row;
}

// `own` 是「不是模板內建的」那些行程——resolveSlug 只認得它們，
// 所以能不能省略 slug 要看它的數量，不是看列出了幾行。
function render(rows, own = listTrips(), onTemplate = isTemplateOrigin(originUrl())) {
  if (!rows.length) {
    return onTemplate ? EMPTY_TEMPLATE : EMPTY_OWN;
  }
  const out = [];
  for (const r of rows) {
    out.push(`${r.ok ? '✓' : '✗'} ${r.slug}${r.title ? `　${r.title}` : ''}`);
    if (r.dates) out.push(`    日期　${r.dates}`);
    if (r.updated) out.push(`    最後更新　${r.updated}`);
    if (r.deploy) out.push(`    網址　${r.deploy}`);
    if (r.problem) out.push(`    問題　${r.problem}`);
  }
  out.push('');
  if (own.length === 1) {
    out.push('只有一趟行程，指令可以省略 slug。');
  } else if (own.length > 1) {
    out.push(`有 ${own.length} 趟行程，**每個指令都要指定 slug**，例如 npm run check -- ${own[0]}`);
    out.push('');
    out.push('**使用者沒明講是哪一趟就問他，不要猜。** 上面的標題、日期與最後更新');
    out.push('就是拿來給他認的。猜錯的代價是改到、甚至覆蓋掉另一趟已經上線的網站，');
    out.push('而且不會有任何警告——見 .ai/rules/which-trip.md。');
  } else {
    out.push('上面都是模板內建的範例，指令一定要指定 slug，例如 npm run preview -- _example');
  }
  return out.join('\n');
}

module.exports = { allSlugs, describe, render, isTemplateOrigin, lastTouched };

if (require.main === module) {
  const includeBuiltin = process.argv.includes('--all');
  console.log(render(allSlugs(includeBuiltin).map(describe)));
}
