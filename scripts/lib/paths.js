// slug 解析與路徑計算。引擎所有 CLI 都從這裡取得行程資料夾位置。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const tripDir = (slug) => path.join(ROOT, 'trips', slug);
const distDir = (slug) => path.join(ROOT, 'dist', slug);

function listTrips() {
  return fs.readdirSync(path.join(ROOT, 'trips'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name);
}

function resolveSlug(argv) {
  const given = (argv || []).find((a) => !a.startsWith('--'));
  if (given) return given;
  const trips = listTrips();
  if (trips.length === 1) return trips[0];
  if (!trips.length) throw new Error('trips/ 底下沒有行程。先跑 npm run new -- <slug>');
  throw new Error(`有多個行程，請指定其中一個：${trips.join('、')}`);
}

module.exports = { ROOT, tripDir, distDir, listTrips, resolveSlug };
