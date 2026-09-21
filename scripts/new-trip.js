#!/usr/bin/env node
// 產生新行程的骨架：node scripts/new-trip.js <slug> [--from <舊slug>]
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, tripDir, listTrips } = require('./lib/paths.js');

const TEMPLATES = path.join(ROOT, 'scripts', 'templates');

// 跨行程不會變的偏好：語言、幣別、人數、交通方式、要開哪些區塊、配色、底圖精度。
// 刻意不含 title / dates / bbox / deploy.name——那些每趟都不一樣，沿用只會讓人
// 忘記改，最後兩趟共用一個 deploy.name 把線上網站互相覆蓋掉。
const CARRIED = ['lang', 'currency', 'party', 'transport', 'sections', 'theme', 'basemap'];

// 骨架檔裡的 __SLUG__ 換成實際 slug
function copyTree(from, to, slug) {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from, { withFileTypes: true }).forEach((e) => {
    const src = path.join(from, e.name), dst = path.join(to, e.name);
    if (e.isDirectory()) { copyTree(src, dst, slug); return; }
    fs.writeFileSync(dst, fs.readFileSync(src, 'utf8').replace(/__SLUG__/g, slug));
  });
}

// 把舊行程的偏好欄位套進新的骨架設定，回傳實際沿用了哪些欄位。
function carryOver(config, from) {
  const carried = [];
  for (const key of CARRIED) {
    if (from[key] === undefined) continue;
    config[key] = JSON.parse(JSON.stringify(from[key]));
    carried.push(key);
  }
  if (from.region && from.region.country) {
    config.region.country = from.region.country;
    carried.push('region.country');
  }
  return carried;
}

function newTrip(slug, opts = {}) {
  if (!/^_?[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`slug 只能用小寫英數與連字號（底線開頭保留給模板內建行程）：${slug}`);
  }
  const dir = tripDir(slug);
  if (fs.existsSync(dir)) throw new Error(`trips/${slug} 已經存在`);

  let source = null;
  if (opts.from) {
    if (opts.from === slug) throw new Error('--from 不能指向自己');
    const fromDir = tripDir(opts.from);
    if (!fs.existsSync(path.join(fromDir, 'trip.config.json'))) {
      const known = listTrips();
      throw new Error(`找不到 trips/${opts.from}/trip.config.json`
        + (known.length ? `。現有的行程：${known.join('、')}` : ''));
    }
    source = fromDir;
  }

  copyTree(TEMPLATES, dir, slug);
  if (!source) return { dir, carried: [], themeCss: false };

  const cfgPath = path.join(dir, 'trip.config.json');
  const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const from = JSON.parse(fs.readFileSync(path.join(source, 'trip.config.json'), 'utf8'));
  const carried = carryOver(config, from);
  fs.writeFileSync(cfgPath, `${JSON.stringify(config, null, 2)}\n`);

  // theme.css 是插槽，整份沿用；行程內容一個字都不複製。
  const themeSrc = path.join(source, 'theme.css');
  const themeCss = fs.existsSync(themeSrc);
  if (themeCss) fs.copyFileSync(themeSrc, path.join(dir, 'theme.css'));

  return { dir, carried, themeCss };
}

// `--from` 會吃掉後面那個值，所以不能只用「開頭不是 --」來認 slug。
function parseArgs(argv) {
  let slug = null, from = null, sawFrom = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--from') { sawFrom = true; from = argv[i + 1] || null; i += 1; continue; }
    if (a.startsWith('--from=')) { sawFrom = true; from = a.slice('--from='.length) || null; continue; }
    if (a.startsWith('--')) continue;
    if (slug === null) slug = a;
  }
  return { slug, from, sawFrom };
}

module.exports = { newTrip, carryOver, parseArgs, CARRIED };

if (require.main === module) {
  try {
    const { slug, from, sawFrom } = parseArgs(process.argv.slice(2));
    if (!slug) throw new Error('請給一個 slug：npm run new -- my-trip');
    if (sawFrom && !from) throw new Error('--from 後面要接一個現有的 slug');

    const { carried, themeCss } = newTrip(slug, { from });
    const lines = [`✓ 建好 trips/${slug}/`];
    if (carried.length) {
      lines.push(`  已沿用 ${from} 的偏好設定：${carried.join('、')}${themeCss ? '、theme.css' : ''}`);
      lines.push('  日期、範圍 bbox、標題與 deploy.name 沒有沿用，要重新填。');
    }
    lines.push('');
    lines.push(`  1. 填 trips/${slug}/trip.config.json（日期、bbox、人數、部署名稱）`);
    lines.push(`  2. 把行程寫進 data.js 與 details.js`);
    lines.push(`  3. 跑 npm run check -- ${slug}`);
    console.log(lines.join('\n'));
  } catch (e) {
    console.error('✗ ' + e.message);
    process.exit(1);
  }
}
