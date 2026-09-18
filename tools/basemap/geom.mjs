// 純幾何工具。移植自 SENTAI2026 tools/basemap/simplify.py 的同名函式。
// 座標一律是 [x, y]；這個檔案不假設單位是經緯度還是網格像素。

export function seglen(pts) {
  let n = 0;
  for (let i = 0; i + 1 < pts.length; i += 1) n += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return n;
}

// Douglas–Peucker：保留頭尾，砍掉偏離弦線小於 eps 的點
export function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = pts[s], [x2, y2] = pts[e];
    const dx = x2 - x1, dy = y2 - y1, den = Math.hypot(dx, dy);
    let dmax = 0, idx = s;
    for (let i = s + 1; i < e; i += 1) {
      const [x0, y0] = pts[i];
      const dist = den ? Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / den : Math.hypot(x0 - x1, y0 - y1);
      if (dist > dmax) { dmax = dist; idx = i; }
    }
    if (dmax > eps) { keep[idx] = true; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const key = (p) => p[0] + ',' + p[1];

// 把共用端點的 way 串成連續線。封閉環（頭尾同點）原樣保留。
export function join(ways) {
  const ends = new Map();
  const push = (k, i) => { if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); };
  ways.forEach((w, i) => { push(key(w[0]), i); push(key(w[w.length - 1]), i); });

  const used = new Set();
  const out = [];
  ways.forEach((w, i) => {
    if (used.has(i)) return;
    used.add(i);
    let line = [...w];
    for (let pass = 0; pass < 2; pass += 1) {
      for (;;) {
        const tail = line[line.length - 1];
        if (line.length > 2 && key(tail) === key(line[0])) break;   // 已經閉合
        const next = (ends.get(key(tail)) || []).find((j) => !used.has(j));
        if (next === undefined) break;
        used.add(next);
        const ow = ways[next];
        line = line.concat(key(ow[0]) === key(tail) ? ow.slice(1) : [...ow].reverse().slice(1));
      }
      line.reverse();
    }
    out.push(line);
  });
  return out;
}

export const round2 = (pts, n) => pts.map(([x, y]) => [Number(x.toFixed(n)), Number(y.toFixed(n))]);
