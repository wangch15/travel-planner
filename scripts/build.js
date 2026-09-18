#!/usr/bin/env node
// 把引擎與行程資料內嵌成單一 HTML：node scripts/build.js <slug>
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, tripDir, distDir, resolveSlug } = require('./lib/paths.js');
const { loadTrip } = require('./lib/load-trip.js');

const DATA_KEYS = ['PLACES', 'DAYS', 'OVERVIEW_ROUTE', 'ADDONS', 'CHECKLIST', 'STAYS', 'OVERVIEW', 'DETAILS', 'DINING', 'MAP_LISTS'];
const readEngine = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
// 資料裡的連結或文字可能含 </script，不轉義會提前關掉 script 區塊
const json = (v) => JSON.stringify(v).replace(/<\/script/gi, '<\\/script');

function readExtra(dir) {
  const p = path.join(dir, 'extra.js');
  if (!fs.existsSync(p)) return { sections: [] };
  delete require.cache[require.resolve(p)];
  return require(p);
}

// 只收 trips/<slug>/photos/ 裡實際存在的檔案
function collectPhotos(trip, dir) {
  const out = {};
  Object.entries(trip.PHOTOS || {}).forEach(([key, list]) => {
    const kept = list
      .map((ph, i) => ({ file: `${key}-${i + 1}.jpg`, credit: ph.url ? ph.credit : `${ph.artist || '—'}・${ph.license}`, page: ph.page || null, commons: !ph.url }))
      .filter((ph) => fs.existsSync(path.join(dir, 'photos', ph.file)))
      .map((ph) => ({ src: 'img/' + ph.file, credit: ph.credit, page: ph.page, commons: ph.commons }));
    if (kept.length) out[key] = kept;
  });
  return out;
}

function documentHTML(trip, head, body) {
  const { config } = trip;
  const favicon = 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="82" font-size="82">${(config.theme && config.theme.favicon) || '🗺'}</text></svg>`);
  return `<!doctype html>
<html lang="${config.lang || 'zh-Hant'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive,noimageindex">
<meta name="description" content="${(config.description || '').replace(/"/g, '&quot;')}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#F4F0E5" media="(prefers-color-scheme:light)">
<meta name="theme-color" content="#15130F" media="(prefers-color-scheme:dark)">
<link rel="icon" href="${favicon}">
<style>
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
img{max-width:100%}
[hidden]{display:none!important}
</style>
${head}
</head>
<body>
${body}
</body>
</html>
`;
}

function inline(trip, dir, photos) {
  const theme = fs.existsSync(path.join(dir, 'theme.css')) ? fs.readFileSync(path.join(dir, 'theme.css'), 'utf8') : '';
  const data = DATA_KEYS.map((k) => `const ${k} = ${json(trip[k])};`).join('\n')
    + `\nconst EXTRA = ${json(readExtra(dir))};`;
  return readEngine('src', 'index.html')
    .replace('/*__TITLE__*/', trip.config.title)
    .replace('/*__CONFIG__*/null', json(trip.config))
    .replace('/*__BASEMAP__*/null', json(trip.basemap))
    .replace('/*__PHOTOS__*/null', json(photos))
    .replace('/*__DATA__*/', data)
    .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${readEngine('src', 'styles.css')}\n${theme}</style>`)
    .replace('<script src="util.js"></script>', `<script>\n${readEngine('src', 'util.js')}\n</script>`)
    .replace('<script src="render.js"></script>', `<script>\n${readEngine('src', 'render.js')}\n</script>`)
    .replace('<script src="app.js"></script>', `<script>\n${readEngine('src', 'app.js')}\n</script>`);
}

function buildTrip(slug) {
  const trip = loadTrip(slug);
  const dir = tripDir(slug);
  const outDir = distDir(slug);
  const site = path.join(outDir, 'site');
  const photos = collectPhotos(trip, dir);

  const filled = inline(trip, dir, photos);
  const cut = filled.indexOf('</style>');
  if (cut === -1) throw new Error('src/index.html 找不到 </style>，無法切分 head 與 body');
  const html = documentHTML(trip, filled.slice(0, cut + 8), filled.slice(cut + 8).trim());

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(site, { recursive: true });
  fs.writeFileSync(path.join(site, 'index.html'), html);

  let photoBytes = 0, photoCount = 0;
  const imgDir = path.join(site, 'img');
  Object.values(photos).flat().forEach((ph) => {
    fs.mkdirSync(imgDir, { recursive: true });
    const from = path.join(dir, 'photos', path.basename(ph.src));
    fs.copyFileSync(from, path.join(imgDir, path.basename(ph.src)));
    photoBytes += fs.statSync(from).size;
    photoCount += 1;
  });

  const statics = fs.readdirSync(path.join(ROOT, 'public'));
  statics.forEach((f) => fs.copyFileSync(path.join(ROOT, 'public', f), path.join(site, f)));

  fs.writeFileSync(path.join(outDir, 'wrangler.json'), JSON.stringify({
    name: trip.config.deploy.name,
    compatibility_date: new Date().toISOString().slice(0, 10),
    assets: { directory: './site' },
  }, null, 2) + '\n');

  return { html, outDir, bytes: Buffer.byteLength(html), photos: photoCount, photoBytes, statics: statics.length };
}

module.exports = { buildTrip };

if (require.main === module) {
  try {
    const slug = resolveSlug(process.argv.slice(2));
    const r = buildTrip(slug);
    console.log(`✓ dist/${slug}/site/index.html ${(r.bytes / 1024).toFixed(0)} KB，`
      + `照片 ${r.photos} 張 ${(r.photoBytes / 1048576).toFixed(1)} MB，靜態檔 ${r.statics} 個`);
  } catch (e) {
    console.error('✗ ' + e.message);
    process.exit(1);
  }
}
