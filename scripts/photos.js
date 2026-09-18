#!/usr/bin/env node
// 依 photos.json 把照片抓進 trips/<slug>/photos/：node scripts/photos.js <slug> [--force]
const fs = require('node:fs');
const path = require('node:path');
const { tripDir, resolveSlug } = require('./lib/paths.js');
const { downloadTo } = require('./lib/fetch-file.js');

// Commons 的原圖常常好幾 MB，這個端點會回傳指定寬度的縮圖
const commonsUrl = (title) =>
  'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(title) + '?width=1024';

function photoJobs(manifest, dir, opts = {}) {
  const jobs = [];
  Object.entries(manifest || {}).forEach(([key, list]) => {
    (list || []).forEach((ph, i) => {
      const file = path.join(dir, 'photos', `${key}-${i + 1}.jpg`);
      if (!opts.force && fs.existsSync(file)) return;
      jobs.push({
        key, index: i + 1, file,
        url: ph.url || commonsUrl(ph.title),
        label: ph.url ? ph.credit || ph.url : ph.title,
      });
    });
  });
  return jobs;
}

async function runPhotos(slug, opts = {}) {
  const { force = false, fetchImpl, log = () => {} } = opts;
  const dir = tripDir(slug);
  const manifestPath = path.join(dir, 'photos.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`找不到 trips/${slug}/photos.json`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const jobs = photoJobs(manifest, dir, { force });
  const total = Object.values(manifest).reduce((n, l) => n + l.length, 0);
  if (!jobs.length) {
    log(`✓ ${slug}：${total} 張照片都已經在 trips/${slug}/photos/（--force 可全部重抓）`);
    return { ok: 0, skipped: total, failed: [] };
  }

  log(`要抓 ${jobs.length} 張（共 ${total} 張）…`);
  const failed = [];
  let ok = 0;
  for (const job of jobs) {
    try {
      const r = await downloadTo(job.url, job.file, fetchImpl ? { fetchImpl } : {});
      ok += 1;
      log(`  ✓ ${path.basename(job.file)}　${(r.bytes / 1024).toFixed(0)} KB　${job.label}`);
    } catch (e) {
      failed.push({ file: path.basename(job.file), reason: e.message });
      log(`  ✗ ${path.basename(job.file)}　${e.message}`);
    }
  }
  return { ok, skipped: total - jobs.length, failed };
}

module.exports = { runPhotos, photoJobs, commonsUrl };

if (require.main === module) {
  const argv = process.argv.slice(2);
  (async () => {
    try {
      const slug = resolveSlug(argv);
      const r = await runPhotos(slug, { force: argv.includes('--force'), log: (m) => console.log(m) });
      if (r.failed.length) {
        console.error(`\n✗ ${r.failed.length} 張失敗。授權不明或連不上的就從 photos.json 拿掉，不要硬塞。`);
        process.exit(1);
      }
      console.log(`\n✓ 新抓 ${r.ok} 張、已存在 ${r.skipped} 張。接著跑 npm run build -- ${slug} 看效果。`);
    } catch (e) {
      console.error('✗ ' + e.message);
      process.exit(1);
    }
  })();
}
