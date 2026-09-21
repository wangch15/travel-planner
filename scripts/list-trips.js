#!/usr/bin/env node
// 列出這份 repo 裡的所有行程：node scripts/list-trips.js [--all]
//
// 有兩趟以上行程之後，每個指令都要帶 slug，而 agent 沒有東西可以先看一眼
// 「有哪些行程、各自做到哪」。這個指令就是那個東西——從檔案系統讀，
// 不用人維護，所以不會跟現況脫節。
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, tripDir, listTrips } = require('./lib/paths.js');
const { loadTrip } = require('./lib/load-trip.js');

// 模板內建的行程（底線開頭）平常不列，--all 才顯示。
function allSlugs(includeBuiltin) {
  const names = fs.readdirSync(path.join(ROOT, 'trips'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  return includeBuiltin ? names.sort() : listTrips().sort();
}

function describe(slug) {
  const dir = tripDir(slug);
  const row = { slug, title: null, dates: null, deploy: null, ok: false, problem: null };
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
function render(rows, own = listTrips()) {
  if (!rows.length) {
    return 'trips/ 底下沒有行程。先跑 npm run new -- <slug>';
  }
  const out = [];
  for (const r of rows) {
    out.push(`${r.ok ? '✓' : '✗'} ${r.slug}${r.title ? `　${r.title}` : ''}`);
    if (r.dates) out.push(`    日期　${r.dates}`);
    if (r.deploy) out.push(`    網址　${r.deploy}`);
    if (r.problem) out.push(`    問題　${r.problem}`);
  }
  out.push('');
  if (own.length === 1) {
    out.push('只有一趟行程，指令可以省略 slug。');
  } else if (own.length > 1) {
    out.push(`有 ${own.length} 趟行程，**每個指令都要指定 slug**，例如 npm run check -- ${own[0]}`);
  } else {
    out.push('上面都是模板內建的範例，指令一定要指定 slug，例如 npm run preview -- _example');
  }
  return out.join('\n');
}

module.exports = { allSlugs, describe, render };

if (require.main === module) {
  const includeBuiltin = process.argv.includes('--all');
  console.log(render(allSlugs(includeBuiltin).map(describe)));
}
