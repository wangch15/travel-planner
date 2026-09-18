// 海域多邊形：把海岸線裁進 bbox，再沿周界順時針接成封閉環。
// OSM 慣例是「陸左海右」，所以海岸線的原方向就是海域邊界的順時針方向，
// 接周界時同樣順時針走（NW → NE → SE → SW → NW）。
import { seglen } from './geom.mjs';

const EPS = 1e-9;
const ON = 1e-7;
const same = (a, b) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
const inside = ([x, y], [x0, y0, x1, y1]) => x >= x0 - EPS && x <= x1 + EPS && y >= y0 - EPS && y <= y1 + EPS;

// 邊界點 → 周界參數 [0, 4)：NW=0、NE=1、SE=2、SW=3，順時針遞增
export function perimeterT(pt, bbox) {
  const [x0, y0, x1, y1] = bbox;
  const w = x1 - x0, h = y1 - y0;
  const [x, y] = pt;
  if (Math.abs(y - y1) < ON) return (x - x0) / w;            // 上緣：西 → 東
  if (Math.abs(x - x1) < ON) return 1 + (y1 - y) / h;        // 右緣：北 → 南
  if (Math.abs(y - y0) < ON) return 2 + (x1 - x) / w;        // 下緣：東 → 西
  if (Math.abs(x - x0) < ON) return 3 + (y - y0) / h;        // 左緣：南 → 北
  return NaN;
}

const cornerPoint = (i, [x0, y0, x1, y1]) => [[x0, y1], [x1, y1], [x1, y0], [x0, y0]][i];

// 從 tFrom 順時針走到 tTo，回傳沿途要經過的角點
function cornersBetween(tFrom, tTo, bbox) {
  let span = (tTo - tFrom + 4) % 4;
  if (span < EPS) span = 4;                      // 同一點：整圈
  const out = [];
  for (let k = 0; k < 4; k += 1) {
    const d = (k - tFrom + 4) % 4;
    if (d > EPS && d < span - EPS) out.push([d, cornerPoint(k, bbox)]);
  }
  return out.sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

// 線段對 bbox 的參數裁切（Liang–Barsky）
function clipSegment(a, b, [x0, y0, x1, y1]) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const tests = [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]];
  for (const [p, q] of tests) {
    if (Math.abs(p) < EPS) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [t0, t1];
}

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// 把折線裁成若干段完全落在 bbox 內的子折線
export function clipToBbox(line, bbox) {
  const out = [];
  let cur = [];
  const flush = () => { if (cur.length > 1) out.push(cur); cur = []; };
  for (let i = 0; i + 1 < line.length; i += 1) {
    const a = line[i], b = line[i + 1];
    const t = clipSegment(a, b, bbox);
    if (!t) { flush(); continue; }
    const [t0, t1] = t;
    const p0 = t0 <= EPS ? a : lerp(a, b, t0);
    const p1 = t1 >= 1 - EPS ? b : lerp(a, b, t1);
    if (!cur.length) cur.push(p0);
    else if (!same(cur[cur.length - 1], p0)) { flush(); cur = [p0]; }
    if (!same(cur[cur.length - 1], p1)) cur.push(p1);
    if (t1 < 1 - EPS) flush();
  }
  flush();
  return out;
}

// 順時針方向上，離目前位置最近的入口。候選是 pool 裡的索引。
function pickNext(open, pool, fromT) {
  let best = -1, bestD = Infinity;
  pool.forEach((i) => {
    let d = (open[i].tIn - fromT + 4) % 4;
    if (d < EPS) d = 4;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// 把開放的海岸線段接成封閉環：沿海岸線走到出口，再順時針沿周界走到下一段的入口，
// 回到本環起點就閉合。剩下的段落另起新環——bbox 邊上常有「同一條邊進、同一條邊出」
// 的小碎片（半島、被邊界切到的島），硬串成一個環會讓海域繞遍整個周界而淹掉整張圖。
function buildRings(open, bbox) {
  const used = new Set();
  const rings = [];
  for (let s = 0; s < open.length; s += 1) {
    if (used.has(s)) continue;
    const ring = [];
    let cur = s;
    for (let guard = 0; guard <= open.length; guard += 1) {
      ring.push(...open[cur].seg);
      used.add(cur);
      const pool = open.map((_, i) => i).filter((i) => !used.has(i));
      pool.push(s);                                   // 本環起點永遠是候選，用來閉合
      const next = pickNext(open, pool, open[cur].tOut);
      ring.push(...cornersBetween(open[cur].tOut, open[next].tIn, bbox));
      if (next === s) break;
      cur = next;
    }
    if (!same(ring[ring.length - 1], ring[0])) ring.push([...ring[0]]);
    rings.push(ring);
  }
  return rings;
}

// sea 是「環的陣列」：一個 bbox 內可能有數塊不相連的海域。
export function buildSea(coastWays, bbox) {
  const islands = [];
  const open = [];
  coastWays.forEach((w) => {
    if (w.length > 2 && same(w[0], w[w.length - 1])) {
      if (w.some((p) => inside(p, bbox))) islands.push(w);
      return;
    }
    clipToBbox(w, bbox).forEach((seg) => {
      const tIn = perimeterT(seg[0], bbox), tOut = perimeterT(seg[seg.length - 1], bbox);
      if (Number.isNaN(tIn) || Number.isNaN(tOut)) return;   // 有懸空端點，資料有缺，略過
      if (seglen(seg) < EPS) return;
      open.push({ seg, tIn, tOut });
    });
  });
  if (!open.length) return { sea: [], islands };
  return { sea: buildRings(open, bbox), islands };
}
