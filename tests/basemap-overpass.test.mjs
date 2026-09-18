import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildQuery, expandBbox, fetchOverpass, MIRRORS } from '../tools/basemap/overpass.mjs';

const BBOX = [140, 38, 141, 39];
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tp-ovp-'));
const ok = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
const cached = (dir) => fs.readdirSync(dir).filter((f) => f.startsWith('overpass-')).length;

test('expandBbox 每邊各外擴 5%', () => {
  assert.deepEqual(expandBbox([0, 0, 10, 20], 0.05), [-0.5, -1, 10.5, 21]);
});

test('buildQuery 一次抓齊所有圖層，且用 south,west,north,east 的順序', () => {
  const q = buildQuery(BBOX);
  for (const needle of ['coastline', 'waterway"="river', 'water"="lake', 'motorway', 'trunk', 'primary', 'admin_level', 'place']) {
    assert.ok(q.includes(needle), `查詢少了 ${needle}`);
  }
  assert.ok(q.includes('out geom'));
  assert.ok(/\(37\.95,139\.95,39\.05,141\.05\)/.test(q), `bbox 順序或外擴不對：${q}`);
});

test('成功時回傳解析後的 JSON 並寫進快取', async () => {
  const cacheDir = tmp();
  const body = { elements: [{ type: 'way', id: 1 }] };
  let calls = 0;
  const r = await fetchOverpass(BBOX, { cacheDir, fetchImpl: async () => { calls += 1; return ok(body); } });
  assert.deepEqual(r, body);
  assert.equal(calls, 1);
  assert.equal(cached(cacheDir), 1);
});

test('第二次呼叫直接用快取，不再連網', async () => {
  const cacheDir = tmp();
  await fetchOverpass(BBOX, { cacheDir, fetchImpl: async () => ok({ elements: [] }) });
  let calls = 0;
  await fetchOverpass(BBOX, { cacheDir, fetchImpl: async () => { calls += 1; return ok({ elements: [] }); } });
  assert.equal(calls, 0, '快取命中就不該再連網');
});

test('bbox 不同時快取不會互相沖到', async () => {
  const cacheDir = tmp();
  await fetchOverpass(BBOX, { cacheDir, fetchImpl: async () => ok({ elements: [1] }) });
  await fetchOverpass([1, 2, 3, 4], { cacheDir, fetchImpl: async () => ok({ elements: [2] }) });
  assert.equal(cached(cacheDir), 2);
});

test('429 會換下一個鏡像重試', async () => {
  const cacheDir = tmp();
  const hosts = [];
  const fetchImpl = async (url) => {
    hosts.push(new URL(url).host);
    return hosts.length === 1 ? { ok: false, status: 429, text: async () => '' } : ok({ elements: [] });
  };
  await fetchOverpass(BBOX, { cacheDir, fetchImpl, sleep: async () => {} });
  assert.equal(hosts.length, 2);
  assert.notEqual(hosts[0], hosts[1], '第二次要換鏡像');
});

test('所有鏡像都失敗時丟出可行動的錯誤訊息', async () => {
  const cacheDir = tmp();
  await assert.rejects(
    () => fetchOverpass(BBOX, { cacheDir, fetchImpl: async () => ({ ok: false, status: 504, text: async () => '' }), sleep: async () => {} }),
    /Overpass[\s\S]*重試/,
  );
});

test('至少要有兩個鏡像可以輪替', () => {
  assert.ok(MIRRORS.length >= 2);
});
