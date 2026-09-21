#!/usr/bin/env node
// 驗證行程資料：node scripts/check.js <slug>
const { resolveSlug } = require('./lib/paths.js');
const { loadTrip } = require('./lib/load-trip.js');
const { findConflict, conflictMessage } = require('./lib/deploy-names.js');

try {
  const slug = resolveSlug(process.argv.slice(2));

  // 撞名先驗：它是跨行程的設定問題（schema 只看得到一趟），而且後果比任何
  // 資料錯誤都嚴重——資料錯只是頁面不對，撞名是把另一趟的線上網站換掉。
  // 放在 loadTrip 之前，資料還沒填完的行程也看得到這個警告。
  const conflict = findConflict(slug);
  if (conflict) throw new Error(conflictMessage(slug, conflict.name, conflict.others));

  const t = loadTrip(slug);
  const stops = t.DAYS.reduce((n, d) => n + d.stops.length, 0);
  const photos = Object.values(t.PHOTOS).reduce((n, l) => n + l.length, 0);
  console.log(`✓ ${slug}：${Object.keys(t.PLACES).length} 個地點、${t.DAYS.length} 天、${stops} 個停留點、`
    + `${Object.keys(t.DETAILS).length} 份詳細說明、${photos} 張照片`);
} catch (e) {
  console.error('✗ ' + e.message);
  process.exit(1);
}
