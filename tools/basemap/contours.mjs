// 等高線：平滑 → marching squares → 串接 → 簡化。
// 移植自 SENTAI2026 tools/basemap/contours.py。
import { rdp } from './geom.mjs';
import { gridToLngLat } from './dem.mjs';

const LEVEL_STEPS = [100, 200, 250, 500, 1000];
const WANT_MIN = 6, WANT_MAX = 8;

// box blur：降低鋸齒，等高線才會順
export function boxBlur(grid, w, h, k) {
  const n = 2 * k + 1;
  const at = (r, c) => grid[Math.min(h - 1, Math.max(0, r)) * w + Math.min(w - 1, Math.max(0, c))];
  const out = new Float32Array(w * h);
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      let s = 0;
      for (let dr = -k; dr <= k; dr += 1) for (let dc = -k; dc <= k; dc += 1) s += at(r + dr, c + dc);
      out[r * w + c] = s / (n * n);
    }
  }
  return out;
}

const TABLE = {
  1: [['L', 'T']], 2: [['T', 'R']], 3: [['L', 'R']], 4: [['R', 'B']],
  5: [['L', 'T'], ['R', 'B']], 6: [['T', 'B']], 7: [['L', 'B']], 8: [['B', 'L']],
  9: [['B', 'T']], 10: [['T', 'R'], ['B', 'L']], 11: [['B', 'R']], 12: [['R', 'L']],
  13: [['R', 'T']], 14: [['T', 'L']],
};

export function marchingSquares(grid, w, h, level) {
  const segs = [];
  const g = (r, c) => grid[r * w + c];
  const ip = (v1, v2, p1, p2) => {
    const t = v2 === v1 ? 0.5 : (level - v1) / (v2 - v1);
    return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
  };
  for (let r = 0; r + 1 < h; r += 1) {
    for (let c = 0; c + 1 < w; c += 1) {
      const tl = g(r, c), tr = g(r, c + 1), br = g(r + 1, c + 1), bl = g(r + 1, c);
      const idx = (tl >= level ? 1 : 0) | (tr >= level ? 2 : 0) | (br >= level ? 4 : 0) | (bl >= level ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const P = {
        T: ip(tl, tr, [c, r], [c + 1, r]),
        R: ip(tr, br, [c + 1, r], [c + 1, r + 1]),
        B: ip(bl, br, [c, r + 1], [c + 1, r + 1]),
        L: ip(tl, bl, [c, r], [c, r + 1]),
      };
      (TABLE[idx] || []).forEach(([a, b]) => segs.push([P[a], P[b]]));
    }
  }
  return segs;
}

// 把零散線段接成連續折線
export function stitch(segs) {
  const key = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const adj = new Map();
  const add = (p, q) => { const k = key(p); if (!adj.has(k)) adj.set(k, []); adj.get(k).push(q); };
  segs.forEach(([a, b]) => { add(a, b); add(b, a); });

  const used = new Set();
  const mark = (a, b) => used.add(`${key(a)}|${key(b)}`);
  const seen = (a, b) => used.has(`${key(a)}|${key(b)}`) || used.has(`${key(b)}|${key(a)}`);

  const lines = [];
  segs.forEach(([a, b]) => {
    if (seen(a, b)) return;
    let line = [a, b];
    mark(a, b);
    for (let pass = 0; pass < 2; pass += 1) {
      for (;;) {
        const tail = line[line.length - 1];
        const next = (adj.get(key(tail)) || []).find((cand) => !seen(tail, cand));
        if (!next) break;
        mark(tail, next);
        line.push(next);
      }
      line.reverse();
    }
    lines.push(line);
  });
  return lines;
}

// 在允許的間距中挑一個，讓層數落在 6–8；都落不進去就挑最接近 7 的
export function autoLevels(maxElev) {
  if (!(maxElev > 0)) return [];
  const counts = LEVEL_STEPS.map((s) => ({ s, n: Math.floor(maxElev / s) }));
  const fit = counts.find((c) => c.n >= WANT_MIN && c.n <= WANT_MAX);
  const pick = fit || counts.filter((c) => c.n >= 1).sort((a, b) => Math.abs(a.n - 7) - Math.abs(b.n - 7))[0];
  if (!pick) return [];
  const n = Math.max(1, Math.min(pick.n, WANT_MAX));
  return Array.from({ length: n }, (_, i) => pick.s * (i + 1));
}

export function buildContours(grid, w, h, range, opts = {}) {
  const minPoints = opts.minPoints ?? 14;
  const eps = opts.eps ?? 1.6;
  let maxElev = 0;
  for (let i = 0; i < grid.length; i += 1) if (grid[i] > maxElev) maxElev = grid[i];
  const levels = opts.levels && opts.levels.length ? [...opts.levels] : autoLevels(maxElev);

  const contour = {};
  levels.forEach((lv) => {
    contour[String(lv)] = stitch(marchingSquares(grid, w, h, lv))
      .filter((ln) => ln.length >= minPoints)
      .map((ln) => rdp(ln, eps))
      .filter((ln) => ln.length >= 3)
      .map((ln) => ln.map(([c, r]) => gridToLngLat(c, r, range).map((v) => Number(v.toFixed(5)))));
  });
  return { contour, levels };
}
