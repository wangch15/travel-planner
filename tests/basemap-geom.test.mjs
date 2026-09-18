import test from 'node:test';
import assert from 'node:assert/strict';
import { rdp, join, seglen, round2 } from '../tools/basemap/geom.mjs';

test('seglen 是各段長度的總和', () => {
  assert.equal(seglen([[0, 0], [3, 4], [3, 4]]), 5);
  assert.equal(seglen([[0, 0]]), 0);
});

test('rdp 砍掉共線的中間點', () => {
  assert.deepEqual(rdp([[0, 0], [1, 0], [2, 0], [3, 0]], 0.1), [[0, 0], [3, 0]]);
});

test('rdp 保留超過容差的轉折', () => {
  assert.equal(rdp([[0, 0], [1, 5], [2, 0]], 0.1).length, 3);
});

test('rdp 永遠保留頭尾，且少於三點時原樣回傳', () => {
  const two = [[0, 0], [9, 9]];
  assert.deepEqual(rdp(two, 99), two);
  assert.deepEqual(rdp([[0, 0], [1, 0.01], [2, 0]], 1), [[0, 0], [2, 0]]);
});

test('join 把共用端點的兩條 way 串成一條', () => {
  const out = join([[[0, 0], [1, 1]], [[1, 1], [2, 2]]]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], [[0, 0], [1, 1], [2, 2]]);
});

test('join 會在需要時把 way 反向接上', () => {
  const out = join([[[0, 0], [1, 1]], [[2, 2], [1, 1]]]);
  assert.equal(out.length, 1);
  assert.equal(out[0].length, 3);
  assert.deepEqual(out[0][0], [0, 0]);
  assert.deepEqual(out[0][2], [2, 2]);
});

test('join 不會把不相接的 way 硬串在一起', () => {
  assert.equal(join([[[0, 0], [1, 1]], [[5, 5], [6, 6]]]).length, 2);
});

test('join 保留封閉環', () => {
  const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
  const out = join([ring]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0][0], out[0][out[0].length - 1]);
});

test('round2 把座標降到指定小數位', () => {
  assert.deepEqual(round2([[1.234567, 2.345678]], 4), [[1.2346, 2.3457]]);
});
