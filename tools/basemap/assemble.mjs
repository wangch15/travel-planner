// 組裝最終底圖：分類、簡化、海域、城鎮標籤。
import { join, rdp, round2, seglen } from './geom.mjs';
import { buildSea } from './coast.mjs';

// detail 三檔縮放簡化容差：high 留得多、low 砍得凶
export const DETAIL_SCALE = { high: 0.5, normal: 1, low: 2 };
export const sizeWarnKB = 600;

// 每個圖層的（簡化容差, 最短保留長度），單位是度。移植自 SENTAI 的 CFG。
const CFG = {
  coast: [0.00035, 0.004],
  lake: [0.0004, 0.004],
  motorway: [0.0012, 0.010],
  trunk: [0.0018, 0.030],
  primary: [0.0016, 0.020],
  river: [0.0025, 0.130],
  border: [0.0020, 0.050],
};
const JOINED = new Set(['coast', 'motorway', 'trunk', 'primary', 'river', 'border']);
const MAX_TOWNS = 20;

export function classify(elements) {
  const g = { coast: [], lake: [], motorway: [], trunk: [], primary: [], river: [], border: [], towns: [] };
  (elements || []).forEach((e) => {
    const t = e.tags || {};
    if (e.type === 'node') { if (/^(city|town)$/.test(t.place || '')) g.towns.push(e); return; }
    const geo = e.geometry || [];
    if (geo.length < 2) return;
    const pts = geo.map((p) => [Number(p.lon.toFixed(6)), Number(p.lat.toFixed(6))]);
    if (t.natural === 'coastline') g.coast.push(pts);
    else if (t.natural === 'water') g.lake.push(pts);
    else if (t.highway === 'motorway') g.motorway.push(pts);
    else if (t.highway === 'trunk') g.trunk.push(pts);
    else if (t.highway === 'primary') g.primary.push(pts);
    else if (t.waterway === 'river') g.river.push(pts);
    else if (t.boundary === 'administrative') g.border.push(pts);
  });
  return g;
}

function prep(ways, layer, scale) {
  const [eps, minlen] = CFG[layer];
  return (JOINED.has(layer) ? join(ways) : ways)
    .filter((ln) => seglen(ln) >= minlen * scale)
    .map((ln) => rdp(ln, eps * scale))
    .filter((ln) => ln.length >= 2)
    .map((ln) => round2(ln, 5));
}

// zh-Hant → name:zh-Hant, name:zh, name
export function townName(tags, lang) {
  const chain = [`name:${lang}`];
  if (lang.startsWith('zh')) chain.push('name:zh');
  chain.push('name');
  for (const k of chain) if (tags[k]) return tags[k];
  return '';
}

// city 全留；town 依 population 取前 20，沒有 population 標籤的排最後
export function pickTowns(nodes, lang) {
  const rows = (nodes || [])
    .map((e) => ({
      n: townName(e.tags || {}, lang),
      x: Number(e.lon.toFixed(4)), y: Number(e.lat.toFixed(4)),
      r: (e.tags || {}).place === 'city' ? 1 : 0,
      pop: Number.parseInt((e.tags || {}).population, 10),
    }))
    .filter((t) => t.n);
  const towns = rows.filter((t) => t.r === 0)
    .sort((a, b) => (Number.isNaN(b.pop) ? -1 : b.pop) - (Number.isNaN(a.pop) ? -1 : a.pop))
    .slice(0, MAX_TOWNS);
  return [...rows.filter((t) => t.r === 1), ...towns].map(({ n, x, y, r }) => ({ n, x, y, r }));
}

export function assemble({ elements, contour, levels, bbox, config, demId, demCredit }) {
  const scale = DETAIL_SCALE[(config.basemap && config.basemap.detail) || 'normal'] ?? 1;
  const g = classify(elements);
  // 海岸線要先簡化再閉合：OSM 的海岸線被切成上千段，不濾掉碎環的話
  // 每個岩礁都會變成一座島。這一步對應 SENTAI 版 simplify.py 的 coast 設定。
  const { sea, islands } = buildSea(prep(g.coast, 'coast', scale), bbox);
  return {
    sea: sea.length ? round2(sea, 5) : [],
    islands,
    contour,
    motorway: prep(g.motorway, 'motorway', scale),
    trunk: prep(g.trunk, 'trunk', scale),
    primary: prep(g.primary, 'primary', scale),
    river: prep(g.river, 'river', scale),
    lake: prep(g.lake, 'lake', scale),
    border: prep(g.border, 'border', scale),
    towns: pickTowns(g.towns, config.lang || 'zh-Hant'),
    meta: { bbox, dem: demId, demCredit, generatedAt: new Date().toISOString().slice(0, 10), levels },
  };
}
