const { parentPort, workerData } = require('node:worker_threads');
const path = require('node:path');
const { readTripSnapshot } = require('@travel-planner/engine');
const { createRenderer } = require('@travel-planner/engine/render');

(async () => {
  const snapshot = await readTripSnapshot(path.join(workerData.projectRoot, 'trips', workerData.slug), {
    slug: workerData.slug, includePhotoBytes: true,
  });
  const render = createRenderer(path.resolve(__dirname, '../../src'));
  // Offline preview uses local fonts; no third-party requests are necessary.
  const html = render(snapshot).replace(/<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g, '');
  parentPort.postMessage({ ok: true, html, digest: snapshot.digest,
    snapshot: { trip: snapshot.trip, theme: snapshot.theme, extra: snapshot.extra, photos: snapshot.photos, dataSource: snapshot.dataSource, contextDigest:snapshot.contextDigest, digest: snapshot.digest },
    photos: snapshot.photoFiles.map(photo => ({ name: photo.target, bytes: photo.bytes })),
    summary: { days: snapshot.trip.DAYS.length, places: Object.keys(snapshot.trip.PLACES).length, photos: snapshot.photoFiles.length,
      dayOptions: snapshot.trip.DAYS.map(day => ({ id: day.id, title: day.title, date: day.date })) },
  });
})().catch(error => parentPort.postMessage({ ok: false, code: error.code || 'preview-invalid',
  message: String(error.message || '資料無法安全載入').slice(0, 1200),
  // 哪個檔案、哪些欄位沒過檢查：只給擁有者在本機看，數量與長度都設上限。
  file: typeof error.file === 'string' ? error.file.slice(0, 200) : null,
  problems: Array.isArray(error.problems) ? error.problems.slice(0, 50).map(p => String(p).slice(0, 300)) : [] }));
