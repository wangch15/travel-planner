import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble, classify, pickTowns, townName, DETAIL_SCALE } from '../tools/basemap/assemble.mjs';

const BBOX = [140, 38, 141, 39];
const way = (tags, pts) => ({ type: 'way', tags, geometry: pts.map(([lon, lat]) => ({ lon, lat })) });
const node = (tags, lon, lat) => ({ type: 'node', tags, lon, lat });
const line = (y, n = 40) => Array.from({ length: n }, (_, i) => [140 + i * 0.02, y]);

const CONFIG = {
  lang: 'zh-Hant',
  region: { country: 'JP', bbox: BBOX },
  basemap: { dem: 'auto', detail: 'normal', contourLevels: null },
};

test('classify 依 tag 分到正確的圖層', () => {
  const g = classify([
    way({ natural: 'coastline' }, line(38.5)),
    way({ highway: 'motorway' }, line(38.6)),
    way({ highway: 'trunk' }, line(38.7)),
    way({ highway: 'primary' }, line(38.8)),
    way({ waterway: 'river', name: '川' }, line(38.9)),
    way({ natural: 'water', water: 'lake' }, line(38.4)),
    way({ boundary: 'administrative', admin_level: '4' }, line(38.3)),
    node({ place: 'city', name: '市' }, 140.5, 38.5),
  ]);
  ['coast', 'motorway', 'trunk', 'primary', 'river', 'lake', 'border', 'towns']
    .forEach((k) => assert.equal(g[k].length, 1, `${k} 分類錯誤`));
});

test('classify 丟掉點數不足的 way', () => {
  assert.equal(classify([way({ natural: 'coastline' }, [[140, 38]])]).coast.length, 0);
});

test('townName 依語言取 fallback 鏈', () => {
  assert.equal(townName({ 'name:zh-Hant': '甲', 'name:zh': '乙', name: '丙' }, 'zh-Hant'), '甲');
  assert.equal(townName({ 'name:zh': '乙', name: '丙' }, 'zh-Hant'), '乙');
  assert.equal(townName({ name: '丙' }, 'zh-Hant'), '丙');
  assert.equal(townName({}, 'zh-Hant'), '');
});

test('pickTowns：city 全留，town 依人口取前 20，沒人口標籤的排最後', () => {
  const nodes = [
    ...Array.from({ length: 5 }, (_, i) => node({ place: 'city', name: `市${i}` }, 140.1, 38.1)),
    ...Array.from({ length: 30 }, (_, i) => node({ place: 'town', name: `町${i}`, population: String(1000 * (i + 1)) }, 140.2, 38.2)),
    node({ place: 'town', name: '無人口町' }, 140.3, 38.3),
  ];
  const out = pickTowns(nodes, 'zh-Hant');
  assert.equal(out.filter((t) => t.r === 1).length, 5, 'city 要全留');
  assert.equal(out.filter((t) => t.r === 0).length, 20, 'town 只留 20 個');
  assert.ok(out.some((t) => t.n === '町29'), '人口最多的要留下');
  assert.ok(!out.some((t) => t.n === '無人口町'), '沒人口標籤的排最後，被擠掉');
  assert.deepEqual(Object.keys(out[0]).sort(), ['n', 'r', 'x', 'y']);
});

test('沒有名稱的城鎮不會進輸出', () => {
  assert.equal(pickTowns([node({ place: 'city' }, 140.1, 38.1)], 'zh-Hant').length, 0);
});

test('detail 三檔的簡化容差依序放寬', () => {
  assert.ok(DETAIL_SCALE.high < DETAIL_SCALE.normal);
  assert.ok(DETAIL_SCALE.normal < DETAIL_SCALE.low);
  assert.equal(DETAIL_SCALE.normal, 1);
});

test('assemble 輸出的頂層鍵與前端要的完全一致', () => {
  const out = assemble({
    elements: [way({ natural: 'coastline' }, [[139.5, 38.5], [141.5, 38.5]]), node({ place: 'city', name: '市' }, 140.5, 38.6)],
    contour: { 200: [] }, levels: [200], bbox: BBOX, config: CONFIG, demId: 'gsi', demCredit: '某機構',
  });
  assert.deepEqual(Object.keys(out).sort(), [
    'border', 'contour', 'islands', 'lake', 'meta', 'motorway', 'primary', 'river', 'sea', 'towns', 'trunk',
  ]);
  assert.deepEqual(out.meta.bbox, BBOX, 'meta.bbox 必須與 config 逐值相同');
  assert.equal(out.meta.dem, 'gsi');
  assert.equal(out.meta.demCredit, '某機構');
  assert.match(out.meta.generatedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(out.sea.length > 0, '有穿越 bbox 的海岸線就該有海');
});

test('assemble 在沒有海岸線時輸出空的 sea 與 islands', () => {
  const out = assemble({
    elements: [], contour: {}, levels: [], bbox: BBOX, config: CONFIG, demId: 'terrarium', demCredit: 'x',
  });
  assert.deepEqual(out.sea, []);
  assert.deepEqual(out.islands, []);
  assert.deepEqual(out.towns, []);
});
