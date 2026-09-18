import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSea, clipToBbox, perimeterT } from '../tools/basemap/coast.mjs';

const BBOX = [0, 0, 10, 10];
const closed = (ring) => ring.length > 2
  && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
// 鞋帶公式；螢幕上北朝上時，順時針為負
const area = (ring) => {
  let a = 0;
  for (let i = 0; i + 1 < ring.length; i += 1) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
};
const has = (ring, p) => ring.some((q) => Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9);
// sea 是環的陣列；多數測試只關心主環
const main = (sea) => [...sea].sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0];
const totalArea = (sea) => sea.reduce((n, r) => n + Math.abs(area(r)), 0);

test('perimeterT 從 NW 角開始順時針遞增', () => {
  assert.equal(perimeterT([0, 10], BBOX), 0);
  assert.equal(perimeterT([5, 10], BBOX), 0.5);
  assert.equal(perimeterT([10, 10], BBOX), 1);
  assert.equal(perimeterT([10, 5], BBOX), 1.5);
  assert.equal(perimeterT([10, 0], BBOX), 2);
  assert.equal(perimeterT([5, 0], BBOX), 2.5);
  assert.equal(perimeterT([0, 0], BBOX), 3);
  assert.equal(perimeterT([0, 5], BBOX), 3.5);
  assert.ok(Number.isNaN(perimeterT([5, 5], BBOX)), '內部點不在周界上');
});

test('clipToBbox 保留內部段並在邊界補上交點', () => {
  const out = clipToBbox([[-5, 5], [5, 5], [15, 5]], BBOX);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0][0], [0, 5]);
  assert.deepEqual(out[0][out[0].length - 1], [10, 5]);
});

test('clipToBbox 把進出兩次的線切成兩段', () => {
  assert.equal(clipToBbox([[-1, 2], [5, 2], [-1, 6], [5, 6], [11, 6]], BBOX).length, 2);
});

test('完全在外面的線被丟掉', () => {
  assert.deepEqual(clipToBbox([[-5, -5], [-4, -4]], BBOX), []);
});

test('單次穿越：海域是南半部，且封閉、順時針', () => {
  const { sea, islands } = buildSea([[[-2, 5], [12, 5]]], BBOX);
  assert.equal(sea.length, 1, '單一穿越只該產生一個環');
  const ring = sea[0];
  assert.ok(closed(ring), '海域必須是封閉環');
  assert.equal(islands.length, 0);
  assert.ok(area(ring) < 0, '順時針環的面積應為負');
  assert.ok(Math.abs(Math.abs(area(ring)) - 50) < 1e-6, `南半部面積應為 50，實際 ${Math.abs(area(ring))}`);
  assert.ok(has(ring, [10, 0]) && has(ring, [0, 0]), '要沿著下緣走');
  assert.ok(!has(ring, [10, 10]) && !has(ring, [0, 10]), '不該繞到上緣');
});

test('方向相反時海域換成北半部', () => {
  const ring = main(buildSea([[[12, 5], [-2, 5]]], BBOX).sea);
  assert.ok(Math.abs(Math.abs(area(ring)) - 50) < 1e-6);
  assert.ok(has(ring, [0, 10]) && has(ring, [10, 10]), '要沿著上緣走');
});

test('封閉環被當成島，不進海域', () => {
  const island = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  const { sea, islands } = buildSea([[[-2, 5], [12, 5]], island], BBOX);
  assert.equal(islands.length, 1);
  assert.deepEqual(islands[0], island);
  assert.ok(closed(main(sea)));
});

test('多段海岸線都會被接進同一個海域環', () => {
  const { sea } = buildSea([[[-2, 3], [12, 3]], [[-2, 7], [12, 7]]], BBOX);
  sea.forEach((r) => assert.ok(closed(r)));
  const ys = new Set(sea.flat().map((p) => p[1]));
  assert.ok(ys.has(3) && ys.has(7), '兩條海岸線都要出現在海域邊界上');
});

test('bbox 內沒有海岸線時沒有海', () => {
  const empty = buildSea([], BBOX);
  assert.deepEqual(empty.sea, []);
  assert.deepEqual(empty.islands, []);
  assert.deepEqual(buildSea([[[20, 20], [30, 30]]], BBOX).sea, []);
});

test('海岸線恰好沿著邊界時不會炸掉', () => {
  assert.ok(Array.isArray(buildSea([[[0, 10], [10, 10]]], BBOX).sea));
});

test('同一條邊進出的小碎片不會讓海域淹沒整張圖', () => {
  // 主海岸線由西向東穿過（海在南半部），外加一個「右邊進、右邊出」的小半島碎片。
  // 舊版會把碎片硬串進同一個環，找不到下一段時繞遍整個周界 → 海域面積超過 bbox。
  const mainCoast = [[-2, 5], [12, 5]];
  const speck = [[10, 2], [9.8, 1.9], [10, 1.8]];
  const { sea } = buildSea([mainCoast, speck], BBOX);
  const total = totalArea(sea);
  assert.ok(total < 100, `海域總面積不該超過 bbox 的 100，實際 ${total}`);
  assert.ok(Math.abs(Math.abs(area(main(sea))) - 50) < 1, `主環仍應是南半部約 50，實際 ${Math.abs(area(main(sea)))}`);
  sea.forEach((r) => assert.ok(closed(r), '每個環都要封閉'));
});

test('每個環都是順時針（海在右）', () => {
  const { sea } = buildSea([[[-2, 5], [12, 5]], [[10, 2], [9.8, 1.9], [10, 1.8]]], BBOX);
  sea.forEach((r, i) => assert.ok(area(r) < 0, `環 ${i} 應為順時針，面積 ${area(r)}`));
});
