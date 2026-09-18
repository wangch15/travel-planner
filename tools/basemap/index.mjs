#!/usr/bin/env node
// 產生 trips/<slug>/basemap.json：node tools/basemap/index.mjs <slug>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { fetchOverpass } from './overpass.mjs';
import { buildGrid, demSource, tileRange } from './dem.mjs';
import { boxBlur, buildContours } from './contours.mjs';
import { assemble, sizeWarnKB } from './assemble.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const log = (m) => console.log(m);

function resolveSlug(argv) {
  const given = argv.find((a) => !a.startsWith('--'));
  if (given) return given;
  const trips = fs.readdirSync(path.join(ROOT, 'trips'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name);
  if (trips.length === 1) return trips[0];
  throw new Error(trips.length ? `有多個行程，請指定其中一個：${trips.join('、')}` : 'trips/ 底下沒有行程');
}

// 缺圖磚（多半是外海）就跳過，buildGrid 會當成 0 公尺
async function fetchTiles(src, range, cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const tiles = new Map();
  let missing = 0, fetched = 0;
  for (let y = range.y0; y <= range.y1; y += 1) {
    for (let x = range.x0; x <= range.x1; x += 1) {
      const file = path.join(cacheDir, `${x}_${y}.png`);
      if (!fs.existsSync(file)) {
        const res = await fetch(src.url(range.z, x, y), { headers: { 'user-agent': 'travel-planner-basemap/1.0' } });
        if (!res.ok) { missing += 1; continue; }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 8 || buf[1] !== 0x50 || buf[2] !== 0x4e) { missing += 1; continue; }   // 不是 PNG
        fs.writeFileSync(file, buf);
        fetched += 1;
      }
      try {
        const png = PNG.sync.read(fs.readFileSync(file));
        const rgb = new Uint8Array(png.width * png.height * 3);
        for (let i = 0, j = 0; i < png.data.length; i += 4, j += 3) {
          rgb[j] = png.data[i]; rgb[j + 1] = png.data[i + 1]; rgb[j + 2] = png.data[i + 2];
        }
        tiles.set(`${x}_${y}`, src.decode(rgb));
      } catch { missing += 1; }
    }
  }
  log(`高程圖磚：新下載 ${fetched} 張、可用 ${tiles.size} 張、缺 ${missing} 張（缺的當成 0 公尺）`);
  return tiles;
}

async function main() {
  const slug = resolveSlug(process.argv.slice(2));
  const dir = path.join(ROOT, 'trips', slug);
  const cfgPath = path.join(dir, 'trip.config.json');
  if (!fs.existsSync(cfgPath)) throw new Error(`找不到 trips/${slug}/trip.config.json`);
  const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const bbox = config.region.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) {
    throw new Error('trip.config 的 region.bbox 不合法，應為 [lngMin, latMin, lngMax, latMax]');
  }
  const cacheDir = path.join(dir, '.cache');

  const data = await fetchOverpass(bbox, { cacheDir, log });
  log(`Overpass 回傳 ${(data.elements || []).length} 個元素`);

  const src = demSource(config);
  const range = tileRange(bbox);
  log(`高程來源：${src.id}（${src.credit}），z${range.z} 圖磚 ${range.x1 - range.x0 + 1}×${range.y1 - range.y0 + 1}`);
  const tiles = await fetchTiles(src, range, path.join(cacheDir, 'dem', src.id));
  const { grid, w, h } = buildGrid(tiles, range);
  const smooth = boxBlur(grid, w, h, 3);

  const { contour, levels } = buildContours(smooth, w, h, range, {
    levels: config.basemap && config.basemap.contourLevels ? config.basemap.contourLevels : null,
  });
  levels.forEach((lv) => log(`  ${String(lv).padStart(5)} m  ${contour[lv].length} 條  ${contour[lv].reduce((n, l) => n + l.length, 0)} 點`));

  const out = assemble({ elements: data.elements, contour, levels, bbox, config, demId: src.id, demCredit: src.credit });
  const file = path.join(dir, 'basemap.json');
  fs.writeFileSync(file, JSON.stringify(out));
  const kb = fs.statSync(file).size / 1024;

  log(`\n✓ trips/${slug}/basemap.json ${kb.toFixed(1)} KB`);
  log(`  海域 ${out.sea.length} 點、島 ${out.islands.length} 個、等高線 ${levels.join('／')} m`);
  log(`  高速 ${out.motorway.length}／快速 ${out.trunk.length}／國道 ${out.primary.length}／河 ${out.river.length}／湖 ${out.lake.length}／界 ${out.border.length}／城鎮 ${out.towns.length}`);
  if (kb > sizeWarnKB) log(`⚠ 超過 ${sizeWarnKB} KB，考慮把 trip.config 的 basemap.detail 改成 low`);
  log(`  接著跑 npm run check -- ${slug} 確認 bbox 一致`);
}

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
