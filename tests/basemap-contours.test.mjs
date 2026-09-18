import test from 'node:test';
import assert from 'node:assert/strict';
import { boxBlur, marchingSquares, stitch, autoLevels, buildContours } from '../tools/basemap/contours.mjs';
import { tileRange } from '../tools/basemap/dem.mjs';

const RANGE = tileRange([139.95, 37.85, 141.45, 39.0]);

// 單峰：中心高、四周低的錐形
function cone(n = 21, peak = 1000) {
  const g = new Float32Array(n * n);
  const c = (n - 1) / 2;
  for (let r = 0; r < n; r += 1) {
    for (let col = 0; col < n; col += 1) {
      const d = Math.hypot(col - c, r - c) / c;
      g[r * n + col] = Math.max(0, peak * (1 - d));
    }
  }
  return { g, n };
}

test('boxBlur 讓常數網格保持不變', () => {
  boxBlur(new Float32Array(25).fill(5), 5, 5, 1).forEach((v) => assert.ok(Math.abs(v - 5) < 1e-5));
});

test('boxBlur 把單一尖點抹平', () => {
  const g = new Float32Array(25);
  g[12] = 100;
  const out = boxBlur(g, 5, 5, 1);
  assert.ok(out[12] < 100 && out[12] > 0);
});

test('marchingSquares 對單峰產生一條封閉的主等高線', () => {
  const { g, n } = cone();
  const segs = marchingSquares(g, n, n, 500);
  assert.ok(segs.length > 8, `線段數 ${segs.length}`);
  const lines = stitch(segs).sort((a, b) => b.length - a.length);
  const main = lines[0];
  assert.ok(main.length > 20, `主線應該涵蓋大部分線段，實際 ${main.length} 點`);
  assert.ok(Math.hypot(main[0][0] - main[main.length - 1][0], main[0][1] - main[main.length - 1][1]) < 1.5, '主線應該接近閉合');
  // 完全對稱的合成錐體會讓少數交點座標重合，留下兩點碎片；
  // 這正是 buildContours 要用 minPoints 濾掉的東西。
  lines.slice(1).forEach((l) => assert.ok(l.length < 14, `碎片應該短於門檻，實際 ${l.length}`));
});

test('minPoints 濾掉碎片後，單峰只剩一條等高線', () => {
  const { g, n } = cone(41, 1000);
  const { contour } = buildContours(g, n, n, RANGE, { levels: [500] });
  assert.equal(contour['500'].length, 1, '過濾後應該只剩主等高線');
});

test('高於最高點的層級沒有等高線', () => {
  const { g, n } = cone();
  assert.equal(marchingSquares(g, n, n, 5000).length, 0);
});

test('鞍點會產生兩條分開的等高線', () => {
  const n = 21, g = new Float32Array(n * n);
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      const x = (c - 10) / 10, y = (r - 10) / 10;
      g[r * n + c] = (x * x - y * y) * 100;
    }
  }
  const lines = stitch(marchingSquares(g, n, n, 20));
  assert.ok(lines.length >= 2, `鞍點應該有兩條分支，實際 ${lines.length}`);
});

test('autoLevels 讓層數落在 6–8 且等距', () => {
  for (const max of [800, 1500, 1900, 2000, 3800, 6000]) {
    const lv = autoLevels(max);
    assert.ok(lv.length >= 6 && lv.length <= 8, `max=${max} 產生 ${lv.length} 層：${lv}`);
    const step = lv[0];
    assert.ok([100, 200, 250, 500, 1000].includes(step), `間距 ${step} 不在允許集合內`);
    lv.forEach((v, i) => assert.equal(v, step * (i + 1), '層級必須等距'));
  }
});

test('地勢很平時 autoLevels 不會回傳空陣列，完全沒高度時才回空', () => {
  assert.ok(autoLevels(120).length >= 1);
  assert.deepEqual(autoLevels(0), []);
});

test('沒有任何間距能讓層數落在 6–8 時，挑最接近的', () => {
  // 2500 m：250 m 間距會有 10 層、500 m 只有 5 層，兩者都不在 6–8，取較接近的 500 m
  const lv = autoLevels(2500);
  assert.equal(lv[0], 500);
  assert.equal(lv.length, 5);
});

test('buildContours 輸出以層級為鍵、經緯度為值', () => {
  const { g, n } = cone(41, 1200);
  const { contour, levels } = buildContours(g, n, n, RANGE, { levels: [400, 800], minPoints: 3, eps: 0.5 });
  assert.deepEqual(levels, [400, 800]);
  assert.deepEqual(Object.keys(contour).sort((a, b) => a - b), ['400', '800']);
  const pt = contour['400'][0][0];
  assert.equal(pt.length, 2);
  assert.ok(pt[0] > 139 && pt[0] < 142, `經度 ${pt[0]}`);
  assert.ok(pt[1] > 37 && pt[1] < 40, `緯度 ${pt[1]}`);
});

test('buildContours 丟掉太短的碎片', () => {
  const { g, n } = cone(41, 1200);
  assert.equal(buildContours(g, n, n, RANGE, { levels: [400], minPoints: 999, eps: 0.5 }).contour['400'].length, 0);
});
