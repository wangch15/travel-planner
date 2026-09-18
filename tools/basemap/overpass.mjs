// Overpass：一次查詢抓齊所有圖層，原始回應快取在 trips/<slug>/.cache/。
// 公共 API 會限流與逾時，429／5xx 換鏡像重試。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const UA = 'travel-planner-basemap/1.0';
const RETRY_STATUS = new Set([429, 502, 503, 504]);

export function expandBbox(bbox, ratio = 0.05) {
  const [x0, y0, x1, y1] = bbox;
  const dx = (x1 - x0) * ratio, dy = (y1 - y0) * ratio;
  return [x0 - dx, y0 - dy, x1 + dx, y1 + dy];
}

export function buildQuery(bbox) {
  const [x0, y0, x1, y1] = expandBbox(bbox);
  const r = (v) => Number(v.toFixed(5));
  const b = `(${r(y0)},${r(x0)},${r(y1)},${r(x1)})`;   // Overpass 是 south,west,north,east
  return `[out:json][timeout:180];
(
  way["natural"="coastline"]${b};
  way["waterway"="river"]["name"]${b};
  way["natural"="water"]["water"="lake"]${b};
  way["highway"="motorway"]${b};
  way["highway"="trunk"]${b};
  way["highway"="primary"]${b};
  way["boundary"="administrative"]["admin_level"="4"]${b};
  node["place"~"^(city|town)$"]${b};
);
out geom;`;
}

const cachePath = (dir, query) =>
  path.join(dir, `overpass-${crypto.createHash('sha1').update(query).digest('hex').slice(0, 12)}.json`);

export async function fetchOverpass(bbox, opts = {}) {
  const { cacheDir, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = opts;
  const query = buildQuery(bbox);
  const file = cachePath(cacheDir, query);
  if (fs.existsSync(file)) {
    log(`使用快取的 Overpass 回應：${path.basename(file)}`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  const problems = [];
  for (let attempt = 0; attempt < MIRRORS.length * 2; attempt += 1) {
    const url = MIRRORS[attempt % MIRRORS.length];
    log(`向 ${new URL(url).host} 查詢 Overpass…（第 ${attempt + 1} 次）`);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
        body: new URLSearchParams({ data: query }).toString(),
      });
      if (res.ok) {
        const text = await res.text();
        const json = JSON.parse(text);
        fs.writeFileSync(file, text);
        return json;
      }
      problems.push(`${new URL(url).host} → HTTP ${res.status}`);
      if (!RETRY_STATUS.has(res.status)) break;
    } catch (e) {
      problems.push(`${new URL(url).host} → ${e.message}`);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error('Overpass 查詢失敗，所有鏡像都不通：\n  - ' + problems.join('\n  - ')
    + '\n公共 API 有速率限制。等幾分鐘再重試，不要為了讓它過而縮小 bbox 或降低精度。');
}
