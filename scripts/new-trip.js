#!/usr/bin/env node
// 產生新行程的最小骨架：node scripts/new-trip.js <slug>
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, tripDir } = require('./lib/paths.js');

const TEMPLATES = path.join(ROOT, 'scripts', 'templates');

// 骨架檔裡的 __SLUG__ 換成實際 slug
function copyTree(from, to, slug) {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from, { withFileTypes: true }).forEach((e) => {
    const src = path.join(from, e.name), dst = path.join(to, e.name);
    if (e.isDirectory()) { copyTree(src, dst, slug); return; }
    fs.writeFileSync(dst, fs.readFileSync(src, 'utf8').replace(/__SLUG__/g, slug));
  });
}

function newTrip(slug) {
  if (!/^_?[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`slug 只能用小寫英數與連字號（底線開頭保留給模板內建行程）：${slug}`);
  }
  const dir = tripDir(slug);
  if (fs.existsSync(dir)) throw new Error(`trips/${slug} 已經存在`);
  copyTree(TEMPLATES, dir, slug);
  return dir;
}

module.exports = { newTrip };

if (require.main === module) {
  try {
    const slug = process.argv.slice(2).find((a) => !a.startsWith('--'));
    if (!slug) throw new Error('請給一個 slug：npm run new -- my-trip');
    newTrip(slug);
    console.log(`✓ 建好 trips/${slug}/\n`
      + `  1. 填 trips/${slug}/trip.config.json（日期、bbox、人數、部署名稱）\n`
      + `  2. 把行程寫進 data.js 與 details.js\n`
      + `  3. 跑 npm run check -- ${slug}`);
  } catch (e) {
    console.error('✗ ' + e.message);
    process.exit(1);
  }
}
