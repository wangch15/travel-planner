#!/usr/bin/env node
// 驗證行程資料：node scripts/check.js <slug>
const { resolveSlug } = require('./lib/paths.js');
const { loadTrip } = require('./lib/load-trip.js');

try {
  const slug = resolveSlug(process.argv.slice(2));
  const t = loadTrip(slug);
  const stops = t.DAYS.reduce((n, d) => n + d.stops.length, 0);
  const photos = Object.values(t.PHOTOS).reduce((n, l) => n + l.length, 0);
  console.log(`✓ ${slug}：${Object.keys(t.PLACES).length} 個地點、${t.DAYS.length} 天、${stops} 個停留點、`
    + `${Object.keys(t.DETAILS).length} 份詳細說明、${photos} 張照片`);
} catch (e) {
  console.error('✗ ' + e.message);
  process.exit(1);
}
