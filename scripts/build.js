#!/usr/bin/env node
// 把引擎與行程資料內嵌成單一 HTML：node scripts/build.js <slug>
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, tripDir, distDir, resolveSlug } = require('./lib/paths.js');
const { loadTrip } = require('./lib/load-trip.js');

const { createRenderer } = require('../packages/engine/render.cjs');
const render = createRenderer(path.join(ROOT, 'src'));

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

function buildTrip(slug) {
  const trip = loadTrip(slug);
  const dir = tripDir(slug);
  const outDir = distDir(slug);
  const site = path.join(outDir, 'site');
  const photos = collectPhotos(trip, dir);

  const theme = fs.existsSync(path.join(dir, 'theme.css')) ? fs.readFileSync(path.join(dir, 'theme.css'), 'utf8') : '';
  const html = render({trip, theme, extra: readExtra(dir), photos});

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
