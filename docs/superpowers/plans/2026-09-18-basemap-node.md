# 底圖 Node 化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 SENTAI2026 那套 Python + curl 的底圖產生流程移植成純 Node，讓 `npm run basemap -- <slug>` 一個指令就能從 OSM 與公開高程資料產出 `trips/<slug>/basemap.json`，非技術使用者不需要安裝 Python。

**Architecture:** `tools/basemap/` 六個 ESM 模組各管一段：`overpass` 抓向量資料、`dem` 抓高程圖磚、`geom` 提供 rdp／join／seglen 三個純幾何函式、`coast` 把海岸線裁進 bbox 並沿周界閉合成海域多邊形、`contours` 用 marching squares 產等高線、`assemble` 組裝與簡化。`index.mjs` 是 CLI。所有網路存取都先查 `trips/<slug>/.cache/`，測試只吃合成資料、完全不連網。輸出格式與現有 `basemap.json` 完全相同，前端一行都不用改。

**Tech Stack:** Node 20+（ESM `.mjs`）、`node:test`、`pngjs`、Node 內建 `fetch`。

**Spec:** `docs/superpowers/specs/2026-09-18-travel-planner-template-design.md`（§4 底圖 Node 化）

**本計畫範圍：** spec §10 實作順序的第 2 階段。結束時 `npm run basemap -- _example` 能產出真實底圖並取代第 1 階段留下的佔位檔，幾何單元測試全綠，且已用 SENTAI 的 bbox 與 `/Users/wangch/GitHub/SENTAI2026/src/basemap.json` 做過比對並把結果寫成報告。**不含** 照片、transit UI、parking 彙整（第 3 階段）。

## Global Constraints

- Node.js ≥ 20；套件管理器為 **npm**。
- **本階段放寬第 1 階段的「零執行期相依」規則**：`dependencies` 新增 `pngjs`（spec §4 指定）。這是引擎的第一個執行期相依套件，`devDependencies` 仍只有 `wrangler`。除 `pngjs` 外不得再加任何套件。
- `tools/basemap/` 一律用 ESM（`.mjs`）；`scripts/` 與 `src/` 維持 CommonJS，兩邊不互相 import。
- 測試一律 `node --test` + `node:assert/strict`，**不得連網**：Overpass 與圖磚下載都以注入的 fetch 假函式測試。
- 輸出的 `basemap.json` 頂層鍵必須恰好是 `sea, islands, contour, motorway, trunk, primary, river, lake, border, towns, meta`，前十個的形狀與現有檔案相同（座標為 `[lng, lat]` 數字對），前端不得修改。
- `meta` 必須有 `bbox`（與 `trip.config.region.bbox` 逐值相同）、`dem`、`generatedAt`（`YYYY-MM-DD`）、`demCredit`。`demCredit` 是第 1 階段 `src/app.js` 的 `applyChrome()` 已經在讀的欄位。
- 所有使用者可見字串一律繁體中文；引擎不得內含特定行程的專有名詞。
- 快取一律寫在 `trips/<slug>/.cache/`（已 gitignore）。引擎除 `new-trip`、`migrate` 外不得寫入 `trips/`，**本階段的 basemap 是第三個例外**：它只寫 `basemap.json` 與 `.cache/`。
- 檔案上限 800 行，函式上限 50 行。
- commit 訊息格式 `<type>: <描述>`，結尾加 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`。
- 工作目錄一律 `/Users/wangch/GitHub/travel-planner`。**不得修改 `/Users/wangch/GitHub/SENTAI2026` 的任何檔案**，只能讀它的 `src/basemap.json` 做比對。
- 要在瀏覽器看版面時用 **ego-browser（ego lite）**，不要用其他瀏覽器工具。

## 比對基準（來自 `/Users/wangch/GitHub/SENTAI2026/src/basemap.json`）

`trips/_example/trip.config.json` 的 `region.bbox` 刻意與 SENTAI 相同（`[139.95, 37.85, 141.45, 39.0]`），所以 `npm run basemap -- _example` 同時是範例行程的真實底圖，也是本階段的驗收比對。基準數字：

| 項目 | 現有值 |
|---|---|
| `sea` | 一個封閉環，660 點 |
| `islands` | **46** 個封閉環（松島灣） |
| `contour` 層級 | 200 / 400 / 600 / 800 / 1000 / 1300 / 1600 |
| `contour` 線數 | 71 / 72 / 79 / 53 / 44 / 14 / 7 |
| `motorway` / `trunk` / `primary` | 33 / 53 / 140 條 |
| `river` / `lake` / `border` | 123 / 18 / 5 條 |
| `towns` | 24 個 |
| 檔案大小 | 294 KB |

**層級的注意事項：** 現有的七個層級是手選的非等距值（…1000, 1300, 1600），新的自動選級規則只產生等距層級，兩者不可能相同。Task 7 的比對要跑兩次：一次用 `contourLevels` 明確指定成上面七個值來比對幾何，一次用 `auto` 記錄它選了什麼。這是預期中的差異，不是 bug。

## File Structure

| 檔案 | 責任 |
|---|---|
| `tools/basemap/geom.mjs` | `rdp`、`join`、`seglen`、`round2` 四個純幾何函式 |
| `tools/basemap/coast.mjs` | 海岸線裁切、沿 bbox 周界閉合成海域多邊形、分離島嶼 |
| `tools/basemap/dem.mjs` | 圖磚範圍計算、PNG 解碼成高程、網格組裝 |
| `tools/basemap/contours.mjs` | box blur、marching squares、stitch、自動選層級 |
| `tools/basemap/overpass.mjs` | 單一 Overpass 查詢、鏡像重試、原始回應快取 |
| `tools/basemap/assemble.mjs` | 分類、簡化、城鎮挑選、組裝輸出 |
| `tools/basemap/index.mjs` | CLI 入口 |
| `tests/basemap-geom.test.mjs` | `geom.mjs` 的單元測試 |
| `tests/basemap-coast.test.mjs` | `coast.mjs` 的五類合成案例 |
| `tests/basemap-dem.test.mjs` | 圖磚數學與兩種 PNG 編碼的解碼 |
| `tests/basemap-contours.test.mjs` | marching squares 與自動選層級 |
| `tests/basemap-overpass.test.mjs` | 查詢組裝、快取、鏡像重試（注入假 fetch） |
| `tests/basemap-assemble.test.mjs` | 城鎮挑選、名稱 fallback、輸出形狀 |

---

### Task 1: 幾何基礎與 ESM 測試管道

把 Python `simplify.py` 的三個函式移植成 ESM，並讓測試管道認得 `.mjs` 測試檔。

**Files:**
- Create: `tools/basemap/geom.mjs`、`tests/basemap-geom.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: 無
- Produces: `geom.mjs` 匯出
  - `seglen(pts: [number, number][]): number` — 折線總長（歐氏，單位同輸入）
  - `rdp(pts: [number, number][], eps: number): [number, number][]` — Douglas–Peucker 簡化，保留頭尾
  - `join(ways: [number, number][][]): [number, number][][]` — 把共用端點的 way 串成連續線
  - `round2(pts: [number, number][], n: number): [number, number][]` — 每個座標四捨五入到小數 `n` 位

- [ ] **Step 1: 在 `package.json` 加 basemap 指令並讓測試涵蓋 `.mjs`**

把 `scripts` 裡的 `test` 那行改掉並新增 `basemap`：

```json
    "basemap": "node tools/basemap/index.mjs",
    "test": "node --test \"tests/**/*.test.js\" \"tests/**/*.test.mjs\""
```

並把 `dependencies` 改成：

```json
  "dependencies": { "pngjs": "^7.0.0" },
```

- [ ] **Step 2: 安裝 pngjs**

Run: `npm install`
Expected: `node_modules/pngjs` 出現，`package-lock.json` 被建立或更新

- [ ] **Step 3: 寫失敗的測試 `tests/basemap-geom.test.mjs`**

```js
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
  const out = rdp([[0, 0], [1, 5], [2, 0]], 0.1);
  assert.equal(out.length, 3);
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
```

- [ ] **Step 4: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，`ERR_MODULE_NOT_FOUND`（`tools/basemap/geom.mjs` 不存在）

- [ ] **Step 5: 實作 `tools/basemap/geom.mjs`**

```js
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
```

- [ ] **Step 6: 執行測試確認通過**

Run: `npm test`
Expected: PASS，geom 的 9 個測試全過，第 1 階段的 59 個也仍然過（總數 68）

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tools/basemap/geom.mjs tests/basemap-geom.test.mjs
git commit -m "feat: 底圖幾何工具與 ESM 測試管道

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 海域多邊形

這是整個階段最難的一段，也是比 Python 版真正改善的地方——Python 的 `assemble.py` 是把最長的那條海岸線硬接兩個「遠方外海」的點閉合（寫死 `[142.6, 39.6]`、`[142.6, 36.8]`，只對日本東岸成立）。這裡改成通用做法：把海岸線裁進 bbox，再沿 bbox 周界順時針接回去。

OSM 慣例：沿著海岸線的儲存方向走，**陸地在左、海在右**。所以海岸線的原方向就是「海域多邊形邊界的順時針方向」，接周界時也順時針走。

**Files:**
- Create: `tools/basemap/coast.mjs`、`tests/basemap-coast.test.mjs`

**Interfaces:**
- Consumes: `geom.mjs` 的 `seglen`
- Produces: `coast.mjs` 匯出
  - `perimeterT(pt: [number, number], bbox: [number, number, number, number]): number` — 邊界點在周界上的位置參數，`[0, 4)`，NW 角為 0，順時針遞增；不在邊界上時為 `NaN`
  - `clipToBbox(line: [number, number][], bbox): [number, number][][]` — 把折線裁成若干段完全落在 bbox 內的子折線
  - `buildSea(coastWays: [number, number][][], bbox): { sea: [number, number][], islands: [number, number][][] }` — `sea` 是一個封閉環（首尾同點），沒有海岸線時為 `[]`

- [ ] **Step 1: 寫失敗的測試 `tests/basemap-coast.test.mjs`**

bbox 一律用 `[0, 0, 10, 10]`（`[lngMin, latMin, lngMax, latMax]`），好手算。

```js
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

test('perimeterT 從 NW 角開始順時針遞增', () => {
  assert.equal(perimeterT([0, 10], BBOX), 0);        // NW 角
  assert.equal(perimeterT([5, 10], BBOX), 0.5);      // 上緣中點
  assert.equal(perimeterT([10, 10], BBOX), 1);       // NE 角
  assert.equal(perimeterT([10, 5], BBOX), 1.5);      // 右緣中點
  assert.equal(perimeterT([10, 0], BBOX), 2);        // SE 角
  assert.equal(perimeterT([5, 0], BBOX), 2.5);       // 下緣中點
  assert.equal(perimeterT([0, 0], BBOX), 3);         // SW 角
  assert.equal(perimeterT([0, 5], BBOX), 3.5);       // 左緣中點
  assert.ok(Number.isNaN(perimeterT([5, 5], BBOX)), '內部點不在周界上');
});

test('clipToBbox 保留內部段並在邊界補上交點', () => {
  const out = clipToBbox([[-5, 5], [5, 5], [15, 5]], BBOX);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0][0], [0, 5]);
  assert.deepEqual(out[0][out[0].length - 1], [10, 5]);
});

test('clipToBbox 把進出兩次的線切成兩段', () => {
  const out = clipToBbox([[-1, 2], [5, 2], [-1, 6], [5, 6], [11, 6]], BBOX);
  assert.equal(out.length, 2);
});

test('完全在外面的線被丟掉', () => {
  assert.deepEqual(clipToBbox([[-5, -5], [-4, -4]], BBOX), []);
});

// 海岸線沿 y=5 由西向東：左（北）是陸、右（南）是海
test('單次穿越：海域是南半部，且封閉、順時針', () => {
  const { sea, islands } = buildSea([[[-2, 5], [12, 5]]], BBOX);
  assert.ok(closed(sea), '海域必須是封閉環');
  assert.equal(islands.length, 0);
  assert.ok(area(sea) < 0, '順時針環的面積應為負');
  assert.ok(Math.abs(Math.abs(area(sea)) - 50) < 1e-6, `南半部面積應為 50，實際 ${Math.abs(area(sea))}`);
  assert.ok(has(sea, [10, 0]) && has(sea, [0, 0]), '要沿著下緣走');
  assert.ok(!has(sea, [10, 10]) && !has(sea, [0, 10]), '不該繞到上緣');
});

test('方向相反時海域換成北半部', () => {
  const { sea } = buildSea([[[12, 5], [-2, 5]]], BBOX);
  assert.ok(Math.abs(Math.abs(area(sea)) - 50) < 1e-6);
  assert.ok(has(sea, [0, 10]) && has(sea, [10, 10]), '要沿著上緣走');
});

test('封閉環被當成島，不進海域', () => {
  const island = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  const { sea, islands } = buildSea([[[-2, 5], [12, 5]], island], BBOX);
  assert.equal(islands.length, 1);
  assert.deepEqual(islands[0], island);
  assert.ok(closed(sea));
});

test('多段海岸線都會被接進同一個海域環', () => {
  const { sea } = buildSea([[[-2, 3], [12, 3]], [[-2, 7], [12, 7]]], BBOX);
  assert.ok(closed(sea));
  const ys = new Set(sea.map((p) => p[1]));
  assert.ok(ys.has(3) && ys.has(7), '兩條海岸線都要出現在海域邊界上');
});

test('bbox 內沒有海岸線時沒有海', () => {
  const empty = buildSea([], BBOX);
  assert.deepEqual(empty.sea, []);
  assert.deepEqual(empty.islands, []);
  assert.deepEqual(buildSea([[[20, 20], [30, 30]]], BBOX).sea, []);
});

test('海岸線恰好沿著邊界時不會炸掉', () => {
  const { sea } = buildSea([[[0, 10], [10, 10]]], BBOX);
  assert.ok(Array.isArray(sea));
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test tests/basemap-coast.test.mjs`
Expected: FAIL，`ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: 實作 `tools/basemap/coast.mjs`**

```js
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

// 順時針方向上，離目前位置最近、還沒用過的入口
function pickNext(open, used, t) {
  let best = -1, bestD = Infinity;
  open.forEach((o, i) => {
    if (used.has(i)) return;
    let d = (o.tIn - t + 4) % 4;
    if (d < EPS) d = 4;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

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

  // 沿海岸線走到出口，再順時針沿周界走到下一條線的入口
  const used = new Set([0]);
  const start = open[0];
  const sea = [...start.seg];
  let t = start.tOut;
  for (let guard = 0; guard < open.length; guard += 1) {
    const next = pickNext(open, used, t);
    if (next === -1) break;
    sea.push(...cornersBetween(t, open[next].tIn, bbox));
    sea.push(...open[next].seg);
    used.add(next);
    t = open[next].tOut;
  }
  sea.push(...cornersBetween(t, start.tIn, bbox));
  if (!same(sea[sea.length - 1], sea[0])) sea.push([...sea[0]]);
  return { sea, islands };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test tests/basemap-coast.test.mjs`
Expected: PASS，11 個測試全過

若「單次穿越」的面積是 50 但走的是上緣，代表順逆時針判斷反了：檢查 `perimeterT` 的四個分支順序，**不要改測試的期望值**——「陸左海右」是 OSM 的規範，不是可調參數。

- [ ] **Step 5: Commit**

```bash
git add tools/basemap/coast.mjs tests/basemap-coast.test.mjs
git commit -m "feat: 海域多邊形（bbox 裁切與周界閉合）

取代 SENTAI 版寫死外海座標的做法，改為沿 bbox 周界順時針閉合，任何地區都成立。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 高程圖磚

**Files:**
- Create: `tools/basemap/dem.mjs`、`tests/basemap-dem.test.mjs`

**Interfaces:**
- Consumes: 無
- Produces: `dem.mjs` 匯出
  - `Z = 10`（常數）
  - `tileRange(bbox): { z, x0, x1, y0, y1 }`
  - `decodeGSI(rgb: Uint8Array): Float32Array` / `decodeTerrarium(rgb: Uint8Array): Float32Array` — 輸入是 `r,g,b,r,g,b…`，回傳長度為輸入的三分之一，無效值為 `NaN`
  - `demSource(config): { id: 'gsi' | 'terrarium', url(z, x, y): string, credit: string, decode: fn }`
  - `buildGrid(tiles: Map<string, Float32Array>, range): { grid: Float32Array, w: number, h: number }` — 缺圖磚填 0
  - `gridToLngLat(col: number, row: number, range): [number, number]`

- [ ] **Step 1: 寫失敗的測試 `tests/basemap-dem.test.mjs`**

```js
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
  const h = decodeGSI(Uint8Array.from([1, 226, 8]));   // 123400 → 1234 m
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
  const range = { z: Z, x0: 909, x1: 910, y0: 403, y1: 404 };
  const [lng, lat] = gridToLngLat(0, 0, range);
  assert.ok(lng > 139 && lng < 142, `lng=${lng}`);
  assert.ok(lat > 36 && lat < 41, `lat=${lat}`);
  assert.ok(gridToLngLat(256, 0, range)[0] > lng, '往右一個圖磚，經度要變大');
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test tests/basemap-dem.test.mjs`
Expected: FAIL，`ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: 實作 `tools/basemap/dem.mjs`**

```js
// 高程圖磚：範圍計算、解碼成高程網格。
// 移植自 SENTAI2026 contours.py 的前半段與 README 裡的 curl 步驟。
export const Z = 10;
const TILE = 256;

const lng2tile = (lng, z) => (lng + 180) / 360 * (1 << z);
const lat2tile = (lat, z) => {
  const s = Math.sin(lat * Math.PI / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * (1 << z);
};

export function tileRange(bbox) {
  const [lngMin, latMin, lngMax, latMax] = bbox;
  return {
    z: Z,
    x0: Math.floor(lng2tile(lngMin, Z)), x1: Math.floor(lng2tile(lngMax, Z)),
    y0: Math.floor(lat2tile(latMax, Z)), y1: Math.floor(lat2tile(latMin, Z)),
  };
}

// 国土地理院 dem_png：v = R·65536 + G·256 + B，h = v < 2^23 ? v·0.01 : (v − 2^24)·0.01
export function decodeGSI(rgb) {
  const out = new Float32Array(rgb.length / 3);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 1) {
    const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
    if (r === 128 && g === 0 && b === 0) { out[j] = NaN; continue; }
    const v = r * 65536 + g * 256 + b;
    out[j] = v < 2 ** 23 ? v * 0.01 : (v - 2 ** 24) * 0.01;
  }
  return out;
}

// Terrarium：h = R·256 + G + B/256 − 32768
export function decodeTerrarium(rgb) {
  const out = new Float32Array(rgb.length / 3);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 1) {
    out[j] = rgb[i] * 256 + rgb[i + 1] + rgb[i + 2] / 256 - 32768;
  }
  return out;
}

const SOURCES = {
  gsi: {
    id: 'gsi',
    url: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/dem_png/${z}/${x}/${y}.png`,
    credit: '国土地理院',
    decode: decodeGSI,
  },
  terrarium: {
    id: 'terrarium',
    url: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
    credit: 'Terrain Tiles（AWS Open Data）',
    decode: decodeTerrarium,
  },
};

export function demSource(config) {
  const want = (config.basemap && config.basemap.dem) || 'auto';
  if (want !== 'auto') {
    if (!SOURCES[want]) throw new Error(`basemap.dem 不合法：${want}（可用 auto、gsi、terrarium）`);
    return SOURCES[want];
  }
  return config.region.country === 'JP' ? SOURCES.gsi : SOURCES.terrarium;
}

// 缺圖磚（多半是外海）視為 0 公尺
export function buildGrid(tiles, range) {
  const cols = range.x1 - range.x0 + 1, rows = range.y1 - range.y0 + 1;
  const w = cols * TILE, h = rows * TILE;
  const grid = new Float32Array(w * h);
  for (let ty = range.y0; ty <= range.y1; ty += 1) {
    for (let tx = range.x0; tx <= range.x1; tx += 1) {
      const tile = tiles.get(`${tx}_${ty}`);
      if (!tile) continue;
      const ox = (tx - range.x0) * TILE, oy = (ty - range.y0) * TILE;
      for (let r = 0; r < TILE; r += 1) {
        for (let c = 0; c < TILE; c += 1) {
          const v = tile[r * TILE + c];
          grid[(oy + r) * w + ox + c] = Number.isNaN(v) ? 0 : v;
        }
      }
    }
  }
  return { grid, w, h };
}

export function gridToLngLat(col, row, range) {
  const n = TILE * (1 << range.z);
  const gx = (range.x0 * TILE + col) / n;
  const gy = (range.y0 * TILE + row) / n;
  return [gx * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * gy))) * 180 / Math.PI];
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test tests/basemap-dem.test.mjs`
Expected: PASS，9 個測試全過

- [ ] **Step 5: Commit**

```bash
git add tools/basemap/dem.mjs tests/basemap-dem.test.mjs
git commit -m "feat: 高程圖磚範圍計算與 GSI／Terrarium 解碼

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 等高線

**Files:**
- Create: `tools/basemap/contours.mjs`、`tests/basemap-contours.test.mjs`

**Interfaces:**
- Consumes: `geom.mjs` 的 `rdp`；`dem.mjs` 的 `gridToLngLat`
- Produces: `contours.mjs` 匯出
  - `boxBlur(grid: Float32Array, w: number, h: number, k: number): Float32Array`
  - `marchingSquares(grid, w, h, level): [[number, number], [number, number]][]` — 以 `(col, row)` 浮點座標表示的線段
  - `stitch(segs): [number, number][][]`
  - `autoLevels(maxElev: number): number[]`
  - `buildContours(grid, w, h, range, opts?: { levels?: number[], minPoints?: number, eps?: number }): { contour: Record<string, [number, number][][]>, levels: number[] }`

- [ ] **Step 1: 寫失敗的測試 `tests/basemap-contours.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { boxBlur, marchingSquares, stitch, autoLevels, buildContours } from '../tools/basemap/contours.mjs';

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

test('marchingSquares 對單峰產生封閉的等高線', () => {
  const { g, n } = cone();
  const segs = marchingSquares(g, n, n, 500);
  assert.ok(segs.length > 8, `線段數 ${segs.length}`);
  const lines = stitch(segs);
  assert.equal(lines.length, 1, '單峰在一個層級上只該有一條線');
  const l = lines[0];
  assert.ok(Math.hypot(l[0][0] - l[l.length - 1][0], l[0][1] - l[l.length - 1][1]) < 1.5, '應該接近閉合');
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
  for (const max of [800, 1500, 1900, 2500, 3800, 6000]) {
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

test('buildContours 輸出以層級為鍵、經緯度為值', () => {
  const { g, n } = cone(41, 1200);
  const range = { z: 10, x0: 909, x1: 909, y0: 403, y1: 403 };
  const { contour, levels } = buildContours(g, n, n, range, { levels: [400, 800], minPoints: 3, eps: 0.5 });
  assert.deepEqual(levels, [400, 800]);
  assert.deepEqual(Object.keys(contour).sort((a, b) => a - b), ['400', '800']);
  const pt = contour['400'][0][0];
  assert.equal(pt.length, 2);
  assert.ok(pt[0] > 139 && pt[0] < 142, `經度 ${pt[0]}`);
  assert.ok(pt[1] > 36 && pt[1] < 41, `緯度 ${pt[1]}`);
});

test('buildContours 丟掉太短的碎片', () => {
  const { g, n } = cone(41, 1200);
  const range = { z: 10, x0: 909, x1: 909, y0: 403, y1: 403 };
  assert.equal(buildContours(g, n, n, range, { levels: [400], minPoints: 999, eps: 0.5 }).contour['400'].length, 0);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test tests/basemap-contours.test.mjs`
Expected: FAIL，`ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: 實作 `tools/basemap/contours.mjs`**

```js
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
```

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test tests/basemap-contours.test.mjs`
Expected: PASS，9 個測試全過

- [ ] **Step 5: Commit**

```bash
git add tools/basemap/contours.mjs tests/basemap-contours.test.mjs
git commit -m "feat: 等高線（marching squares 與自動選層級）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Overpass 查詢與快取

**Files:**
- Create: `tools/basemap/overpass.mjs`、`tests/basemap-overpass.test.mjs`

**Interfaces:**
- Consumes: 無
- Produces: `overpass.mjs` 匯出
  - `MIRRORS: string[]`
  - `expandBbox(bbox, ratio?: number): [number, number, number, number]` — 每邊各外擴寬／高的 ratio，預設 0.05
  - `buildQuery(bbox): string` — 單一查詢抓齊所有圖層
  - `fetchOverpass(bbox, opts: { cacheDir: string, fetchImpl?: fn, sleep?: fn, log?: fn }): Promise<object>`

- [ ] **Step 1: 寫失敗的測試 `tests/basemap-overpass.test.mjs`**

```js
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
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test tests/basemap-overpass.test.mjs`
Expected: FAIL，`ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: 實作 `tools/basemap/overpass.mjs`**

```js
// Overpass：一次查詢抓齊所有圖層，原始回應快取在 trips/<slug>/.cache/。
// 公共 API 會限流與逾時，429／5xx 換鏡像重試。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const UA = 'travel-planner-basemap/1.0';
const RETRY_STATUS = new Set([429, 502, 503, 504]);

export function expandBbox(bbox, ratio = 0.05) {
  const [x0, y0, x1, y1] = bbox;
  const dx = (x1 - x0) * ratio, dy = (y1 - y0) * ratio;
  return [x0 - dx, y0 - dy, x1 + dx, y1 + dy];
}

export function buildQuery(bbox) {
  const [x0, y0, x1, y1] = expandBbox(bbox);
  const r = (v) => Number(v.toFixed(5));
  const b = `(${r(y0)},${r(x0)},${r(y1)},${r(x1)})`;   // Overpass 是 south,west,north,east
  return `[out:json][timeout:180];
(
  way["natural"="coastline"]${b};
  way["waterway"="river"]["name"]${b};
  way["natural"="water"]["water"="lake"]${b};
  way["highway"="motorway"]${b};
  way["highway"="trunk"]${b};
  way["highway"="primary"]${b};
  way["boundary"="administrative"]["admin_level"="4"]${b};
  node["place"~"^(city|town)$"]${b};
);
out geom;`;
}

const cachePath = (dir, query) =>
  path.join(dir, `overpass-${crypto.createHash('sha1').update(query).digest('hex').slice(0, 12)}.json`);

export async function fetchOverpass(bbox, opts = {}) {
  const { cacheDir, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = opts;
  const query = buildQuery(bbox);
  const file = cachePath(cacheDir, query);
  if (fs.existsSync(file)) {
    log(`使用快取的 Overpass 回應：${path.basename(file)}`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  const problems = [];
  for (let attempt = 0; attempt < MIRRORS.length * 2; attempt += 1) {
    const url = MIRRORS[attempt % MIRRORS.length];
    log(`向 ${new URL(url).host} 查詢 Overpass…（第 ${attempt + 1} 次）`);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
        body: new URLSearchParams({ data: query }).toString(),
      });
      if (res.ok) {
        const text = await res.text();
        const json = JSON.parse(text);
        fs.writeFileSync(file, text);
        return json;
      }
      problems.push(`${new URL(url).host} → HTTP ${res.status}`);
      if (!RETRY_STATUS.has(res.status)) break;
    } catch (e) {
      problems.push(`${new URL(url).host} → ${e.message}`);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error('Overpass 查詢失敗，所有鏡像都不通：\n  - ' + problems.join('\n  - ')
    + '\n公共 API 有速率限制。等幾分鐘再重試，不要為了讓它過而縮小 bbox 或降低精度。');
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test tests/basemap-overpass.test.mjs`
Expected: PASS，8 個測試全過

- [ ] **Step 5: Commit**

```bash
git add tools/basemap/overpass.mjs tests/basemap-overpass.test.mjs
git commit -m "feat: Overpass 查詢、快取與鏡像重試

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 組裝與 CLI

**Files:**
- Create: `tools/basemap/assemble.mjs`、`tools/basemap/index.mjs`、`tests/basemap-assemble.test.mjs`

**Interfaces:**
- Consumes: `geom.mjs` 的 `join`／`rdp`／`round2`／`seglen`；`coast.mjs` 的 `buildSea`
- Produces:
  - `assemble.mjs` 匯出 `classify(elements): object`、`townName(tags, lang): string`、`pickTowns(nodes, lang): object[]`、`DETAIL_SCALE`、`sizeWarnKB`、`assemble({ elements, contour, levels, bbox, config, demId, demCredit }): object`
  - `index.mjs` 是 CLI，無匯出

- [ ] **Step 1: 寫失敗的測試 `tests/basemap-assemble.test.mjs`**

```js
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
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test tests/basemap-assemble.test.mjs`
Expected: FAIL，`ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: 實作 `tools/basemap/assemble.mjs`**

```js
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
  const { sea, islands } = buildSea(join(g.coast), bbox);
  return {
    sea: sea.length ? round2(sea, 5) : [],
    islands: islands.map((r) => round2(r, 5)),
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
```

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test tests/basemap-assemble.test.mjs`
Expected: PASS，8 個測試全過

- [ ] **Step 5: 實作 CLI `tools/basemap/index.mjs`**

```js
#!/usr/bin/env node
// 產生 trips/<slug>/basemap.json：node tools/basemap/index.mjs <slug>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { fetchOverpass } from './overpass.mjs';
import { buildGrid, demSource, tileRange } from './dem.mjs';
import { boxBlur, buildContours } from './contours.mjs';
import { assemble, sizeWarnKB } from './assemble.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const log = (m) => console.log(m);

function resolveSlug(argv) {
  const given = argv.find((a) => !a.startsWith('--'));
  if (given) return given;
  const trips = fs.readdirSync(path.join(ROOT, 'trips'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name);
  if (trips.length === 1) return trips[0];
  throw new Error(trips.length ? `有多個行程，請指定其中一個：${trips.join('、')}` : 'trips/ 底下沒有行程');
}

// 缺圖磚（多半是外海）就跳過，buildGrid 會當成 0 公尺
async function fetchTiles(src, range, cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const tiles = new Map();
  let missing = 0, fetched = 0;
  for (let y = range.y0; y <= range.y1; y += 1) {
    for (let x = range.x0; x <= range.x1; x += 1) {
      const file = path.join(cacheDir, `${x}_${y}.png`);
      if (!fs.existsSync(file)) {
        const res = await fetch(src.url(range.z, x, y), { headers: { 'user-agent': 'travel-planner-basemap/1.0' } });
        if (!res.ok) { missing += 1; continue; }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 8 || buf[1] !== 0x50 || buf[2] !== 0x4e) { missing += 1; continue; }   // 不是 PNG
        fs.writeFileSync(file, buf);
        fetched += 1;
      }
      try {
        const png = PNG.sync.read(fs.readFileSync(file));
        const rgb = new Uint8Array(png.width * png.height * 3);
        for (let i = 0, j = 0; i < png.data.length; i += 4, j += 3) {
          rgb[j] = png.data[i]; rgb[j + 1] = png.data[i + 1]; rgb[j + 2] = png.data[i + 2];
        }
        tiles.set(`${x}_${y}`, src.decode(rgb));
      } catch { missing += 1; }
    }
  }
  log(`高程圖磚：新下載 ${fetched} 張、可用 ${tiles.size} 張、缺 ${missing} 張（缺的當成 0 公尺）`);
  return tiles;
}

async function main() {
  const slug = resolveSlug(process.argv.slice(2));
  const dir = path.join(ROOT, 'trips', slug);
  const cfgPath = path.join(dir, 'trip.config.json');
  if (!fs.existsSync(cfgPath)) throw new Error(`找不到 trips/${slug}/trip.config.json`);
  const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const bbox = config.region.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) {
    throw new Error('trip.config 的 region.bbox 不合法，應為 [lngMin, latMin, lngMax, latMax]');
  }
  const cacheDir = path.join(dir, '.cache');

  const data = await fetchOverpass(bbox, { cacheDir, log });
  log(`Overpass 回傳 ${(data.elements || []).length} 個元素`);

  const src = demSource(config);
  const range = tileRange(bbox);
  log(`高程來源：${src.id}（${src.credit}），z${range.z} 圖磚 ${range.x1 - range.x0 + 1}×${range.y1 - range.y0 + 1}`);
  const tiles = await fetchTiles(src, range, path.join(cacheDir, 'dem', src.id));
  const { grid, w, h } = buildGrid(tiles, range);
  const smooth = boxBlur(grid, w, h, 3);

  const { contour, levels } = buildContours(smooth, w, h, range, {
    levels: config.basemap && config.basemap.contourLevels ? config.basemap.contourLevels : null,
  });
  levels.forEach((lv) => log(`  ${String(lv).padStart(5)} m  ${contour[lv].length} 條  ${contour[lv].reduce((n, l) => n + l.length, 0)} 點`));

  const out = assemble({ elements: data.elements, contour, levels, bbox, config, demId: src.id, demCredit: src.credit });
  const file = path.join(dir, 'basemap.json');
  fs.writeFileSync(file, JSON.stringify(out));
  const kb = fs.statSync(file).size / 1024;

  log(`\n✓ trips/${slug}/basemap.json ${kb.toFixed(1)} KB`);
  log(`  海域 ${out.sea.length} 點、島 ${out.islands.length} 個、等高線 ${levels.join('／')} m`);
  log(`  高速 ${out.motorway.length}／快速 ${out.trunk.length}／國道 ${out.primary.length}／河 ${out.river.length}／湖 ${out.lake.length}／界 ${out.border.length}／城鎮 ${out.towns.length}`);
  if (kb > sizeWarnKB) log(`⚠ 超過 ${sizeWarnKB} KB，考慮把 trip.config 的 basemap.detail 改成 low`);
  log(`  接著跑 npm run check -- ${slug} 確認 bbox 一致`);
}

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
```

- [ ] **Step 6: 執行全部測試**

Run: `npm test`
Expected: PASS，總數約 104（第 1 階段 59 + 本階段 45）

- [ ] **Step 7: 確認檔案大小都在上限內**

Run: `wc -l tools/basemap/*.mjs`
Expected: 每個檔案 < 800 行

- [ ] **Step 8: Commit**

```bash
git add tools/basemap/assemble.mjs tools/basemap/index.mjs tests/basemap-assemble.test.mjs
git commit -m "feat: 底圖組裝與 npm run basemap 指令

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: 真實產出與 SENTAI 比對

這一步**會連網**，抓 Overpass 與數十張高程圖磚。Overpass 有速率限制：失敗就等幾分鐘重試或換鏡像，**不要縮小 bbox 或降低 detail 來讓它過**——那會讓比對失去意義。

**Files:**
- Modify: `trips/_example/basemap.json`（佔位檔換成真實產出）、`trips/_example/trip.config.json`、`trips/_example/docs/status.md`、`CHANGELOG.md`、`README.md`、`package.json`
- Create: `docs/superpowers/notes/2026-09-18-basemap-parity.md`

**Interfaces:**
- Consumes: Task 6 的 CLI
- Produces: 真實的 `trips/_example/basemap.json` 與一份比對報告

- [ ] **Step 1: 用明確層級跑一次，好跟 SENTAI 比對幾何**

先把 `trips/_example/trip.config.json` 的 `basemap` 那行暫時改成：

```json
  "basemap": { "dem": "auto", "detail": "normal", "contourLevels": [200, 400, 600, 800, 1000, 1300, 1600] },
```

Run: `npm run basemap -- _example`
Expected: 成功產出，印出海域點數、島數、各層級線數

- [ ] **Step 2: 比對數字**

Run:

```bash
node -e "
const a = require('/Users/wangch/GitHub/SENTAI2026/src/basemap.json');
const b = require('./trips/_example/basemap.json');
const row = (k, x, y) => console.log(String(k).padEnd(12), String(x).padStart(8), String(y).padStart(8), x === y ? '' : '  ← 不同');
console.log('項目'.padEnd(12), 'SENTAI'.padStart(8), '新版'.padStart(8));
row('sea 點數', a.sea.length, b.sea.length);
row('islands', a.islands.length, b.islands.length);
['motorway','trunk','primary','river','lake','border','towns'].forEach(k => row(k, a[k].length, b[k].length));
Object.keys(a.contour).sort((x,y)=>x-y).forEach(lv => row(lv + 'm 線數', a.contour[lv].length, (b.contour[lv]||[]).length));
"
```

Expected：
- **`islands` 必須是 46。** 不是 46 就是 `coast.mjs` 的封閉環判斷或 bbox 裁切有問題，回 Task 2 修，**不要調參數硬湊**。
- 等高線各層級線數與 SENTAI 相差在 ±15% 內即可（numpy float32 與 Float32Array 的邊界處理略有差異）。差更多時檢查 `boxBlur` 的 k 值與 `minPoints`。
- `sea` 點數**會**不同且應該不同：SENTAI 是硬接兩個外海點，新版沿 bbox 周界閉合。這是預期的改善。
- 道路與河湖線數相差在 ±10% 內即可（Overpass 資料本身隨時間變動）。

- [ ] **Step 3: 在瀏覽器肉眼確認松島灣**

Run: `npm run preview -- _example`

**用 ego-browser（ego lite）** 開 `http://localhost:4173`，確認：
- 海域填色在正確的一側（陸地不該被填成海）
- 松島灣的碎島看得出來（這是這張圖最好認的特徵）
- 等高線隨高度加深，山勢浮現
- 主控台沒有錯誤

看完 Ctrl+C 結束。

- [ ] **Step 4: 改回自動選層級並重跑**

把 `contourLevels` 改回 `null`：

```json
  "basemap": { "dem": "auto", "detail": "normal", "contourLevels": null },
```

Run: `npm run basemap -- _example && npm run check -- _example`
Expected: 成功，且 `check` 通過（`meta.bbox` 與 config 一致）。記下自動選到的間距與層數。

- [ ] **Step 5: 寫比對報告 `docs/superpowers/notes/2026-09-18-basemap-parity.md`**

固定四節：**怎麼跑的**（兩次執行的指令與設定）→ **數字對照表**（Step 2 的輸出，照抄）→ **肉眼確認**（Step 3 看到什麼）→ **已知差異與原因**（至少涵蓋：海域閉合方式改變、自動選層級與手選層級不同、Overpass 資料隨時間變動）。

- [ ] **Step 6: 更新 `trips/_example/docs/status.md`**

把 basemap 那一行從「佔位檔，待產生」改成實際狀態，寫明產生日期、高程來源與等高線層級。

- [ ] **Step 7: 更新 `CHANGELOG.md` 與 `README.md`**

`CHANGELOG.md` 最上面加一節：

```markdown
## 0.2.0（2026-09-18）

- 新增 `npm run basemap -- <slug>`：純 Node 產生地形底圖，不再需要 Python。
- 海域改用 bbox 周界閉合演算法，任何地區都成立（舊版只對日本東岸成立）。
- 等高線層級可自動選擇，也可在 `trip.config` 明確指定。
- 高程來源：日本用国土地理院，其他地區用 Terrain Tiles；來源標示寫進 `basemap.json` 的 `meta.demCredit`。
- 新增執行期相依套件 `pngjs`（解碼高程圖磚用）。
- 資料需要 migrate：否。

尚未實作：`npm run photos`，以及 agent skills。
```

`README.md`：把「目前是第 1 階段」那段改成第 2 階段，從「尚未實作」清單移除 `npm run basemap`，並在指令表加一列：

```markdown
| `npm run basemap -- <slug>` | 從 OpenStreetMap 與公開高程資料產生地形底圖 |
```

- [ ] **Step 8: 把 `package.json` 的 `version` 改成 `0.2.0`**

- [ ] **Step 9: 全部測試與完整流程最後跑一次**

Run: `npm test && npm run check -- _example && npm run build -- _example`
Expected: 全部 PASS

- [ ] **Step 10: Commit 並打 tag**

```bash
git add trips/_example package.json CHANGELOG.md README.md docs/superpowers/notes
git commit -m "feat: _example 換上真實底圖，並與 SENTAI 比對

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git tag v0.2.0
```

---

## 完成後的狀態

- `npm run basemap -- <slug>` 可用，純 Node、無 Python。
- 幾何單元測試全綠：rdp／join／seglen、海岸線五類合成案例、marching squares 的單峰與鞍點、兩種高程編碼、自動選層級、城鎮挑選。
- `trips/_example/basemap.json` 是真實產出，`npm run check` 通過。
- 與 SENTAI 的比對結果寫成報告，島數 46 一致，差異都有解釋。

## 下一階段的接續點

- **第 3 階段（照片與 UI）**：`npm run photos` 尚未存在，`trips/_example/photos.json` 為空；`leg.mode` 已進資料與 `legHTML`，但地圖動線仍一律同一種線型（`src/app.js` 的 `renderMap`），`parking` 已在燈箱顯示、尚未在每日頁尾彙整。
- **第 4 階段（skills）**：`AGENTS.md`、`.ai/`、issue 模板尚未建立。`tp-basemap` skill 要說明 Overpass 限流時等幾分鐘再試。
