import test from 'node:test';
import assert from 'node:assert/strict';
import { tileRange, decodeGSI, decodeTerrarium, demSource, buildGrid, gridToLngLat, Z } from '../tools/basemap/dem.mjs';

const BBOX = [139.95, 37.85, 141.45, 39.0];

test('tileRange 依 bbox 算出 z10 的圖磚範圍', () => {
  const r = tileRange(BBOX);
  assert.equal(r.z, 10);
  assert.ok(r.x1 >= r.x0 && r.y1 >= r.y0);
  assert.ok(r.x0 >= 900 && r.x0 <= 915, `x0=${r.x0}`);
  assert.ok((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) < 60, '圖磚數量應在合理範圍');
});

test('GSI 編碼：v = R*65536 + G*256 + B，乘 0.01 公尺', () => {
  const h = decodeGSI(Uint8Array.from([1, 226, 8]));
  assert.ok(Math.abs(h[0] - 1234) < 0.01, `實際 ${h[0]}`);
});

test('GSI 的負高程用 2^24 補數表示', () => {
  const v = 2 ** 24 - 500;
  const h = decodeGSI(Uint8Array.from([(v >> 16) & 255, (v >> 8) & 255, v & 255]));
  assert.ok(Math.abs(h[0] + 5) < 0.01, `實際 ${h[0]}`);
});

test('GSI 的 (128,0,0) 是無效值', () => {
  assert.ok(Number.isNaN(decodeGSI(Uint8Array.from([128, 0, 0]))[0]));
});

test('Terrarium 編碼：h = R*256 + G + B/256 − 32768', () => {
  const h = decodeTerrarium(Uint8Array.from([128, 10, 128]));
  assert.ok(Math.abs(h[0] - 10.5) < 0.01, `實際 ${h[0]}`);
});

test('demSource：auto 在日本選 GSI，其他選 Terrarium', () => {
  const jp = demSource({ region: { country: 'JP' }, basemap: { dem: 'auto' } });
  assert.equal(jp.id, 'gsi');
  assert.ok(jp.credit.length > 0);
  assert.equal(demSource({ region: { country: 'TW' }, basemap: { dem: 'auto' } }).id, 'terrarium');
  assert.equal(demSource({ region: { country: 'JP' }, basemap: { dem: 'terrarium' } }).id, 'terrarium');
});

test('demSource 的 url 帶入 z/x/y', () => {
  const u = demSource({ region: { country: 'JP' }, basemap: { dem: 'auto' } }).url(10, 909, 403);
  assert.ok(u.includes('/10/909/403'), u);
  assert.ok(u.startsWith('https://'));
});

test('buildGrid 把圖磚拼起來，缺的填 0', () => {
  const range = { z: Z, x0: 0, x1: 1, y0: 0, y1: 0 };
  const { grid, w, h } = buildGrid(new Map([['0_0', new Float32Array(256 * 256).fill(7)]]), range);
  assert.equal(w, 512);
  assert.equal(h, 256);
  assert.equal(grid[0], 7, '有圖磚的格子用實際高程');
  assert.equal(grid[300], 0, '缺圖磚的格子當成 0 公尺');
});

test('gridToLngLat 把網格索引換回經緯度', () => {
  // 用實際 bbox 推出來的圖磚範圍，左上角應該落回 bbox 附近
  const range = tileRange(BBOX);
  const [lng, lat] = gridToLngLat(0, 0, range);
  assert.ok(lng > 139 && lng < 142, `lng=${lng}`);
  assert.ok(lat > 37 && lat < 40, `lat=${lat}`);
  assert.ok(gridToLngLat(256, 0, range)[0] > lng, '往右一個圖磚，經度要變大');
  assert.ok(gridToLngLat(0, 256, range)[1] < lat, '往下一個圖磚，緯度要變小');
});
