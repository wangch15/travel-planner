# travel-planner 引擎骨架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 SENTAI2026 的單一行程頁面抽成「引擎 + `trips/<slug>/` 內容」的模板，讓 `npm run check/build/preview/ship` 能對任一行程資料夾運作，並附一份可完整 build 的去識別化範例行程。

**Architecture:** 引擎（`src/`、`scripts/`）只從 `trips/<slug>/` 讀 config 與五個純資料檔。`src/render.js` 是不碰 DOM 的純函式，資料以自由變數（`CONFIG`、`PLACES`、`DAYS`…）取得——瀏覽器端由 build 內嵌的資料 script 定義，測試端用 `node:vm` 注入。build 把 CSS／JS／資料內嵌成單一 `index.html`。

**Tech Stack:** Node 20+（開發機為 v24）、npm、`node:test` + `node:assert/strict`、`node:vm`、零執行期相依套件；`wrangler` 僅為 devDependency。

**Spec:** `docs/superpowers/specs/2026-09-18-travel-planner-template-design.md`

**本計畫範圍：** spec §10 實作順序的第 1 階段。第 2 階段（底圖 Node 化）、第 3 階段（照片、transit／parking 進 UI）、第 4 階段（skills 與文件）各自另立計畫。本階段結束時：`_example` 行程可 check、build、preview，`npm test` 全綠，但地圖底圖仍是手寫的最小佔位檔、`photos.json` 為空、`leg.mode` 已驗證但 UI 仍一律以自駕樣式呈現。

## Global Constraints

- Node.js ≥ 20；套件管理器為 **npm**（不是 pnpm）。
- 引擎執行期零相依套件；`package.json` 的 `dependencies` 必須是空的。`devDependencies` 只有 `wrangler`。
- 測試一律用 `node --test` + `node:assert/strict`，不引入測試框架。
- `SCHEMA_VERSION = 1`。
- 引擎（`src/`、`scripts/`、`docs/schema/`）**不得**寫入 `trips/`，`new-trip.js` 與 `migrate.js` 除外。
- `trips/<slug>/docs/` 的任何內容都不得進入 build 產物。
- 所有使用者可見字串一律繁體中文；引擎不得內含特定行程的專有名詞（地名、店名、航班、人名）。
- 檔案上限 800 行，函式上限 50 行。
- commit 訊息格式 `<type>: <描述>`，type 取 feat/fix/refactor/docs/test/chore。每個 commit 結尾加一行 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`。
- 工作目錄一律 `/Users/wangch/GitHub/travel-planner`。

## File Structure

| 檔案 | 責任 |
|---|---|
| `package.json` | 引擎版本、npm scripts、devDependencies |
| `scripts/lib/paths.js` | slug 解析與路徑計算 |
| `scripts/lib/schema.js` | `SCHEMA_VERSION` 與所有驗證規則，回傳錯誤字串陣列 |
| `scripts/lib/load-trip.js` | 讀 config 與五個資料檔、合併接線、呼叫驗證 |
| `scripts/check.js` | CLI：載入並驗證，印出統計或錯誤 |
| `scripts/build.js` | CLI：內嵌成 `dist/<slug>/site/index.html` 並產 `wrangler.json` |
| `scripts/preview.js` | CLI：build 後起 Node 靜態伺服器 |
| `scripts/ship.js` | CLI：build 後呼叫 wrangler |
| `scripts/new-trip.js` | CLI：產生最小骨架 |
| `scripts/migrate.js` + `scripts/migrate/0-to-1.js` | 舊格式資料升版 |
| `src/index.html` | 頁面外殼、SVG sprite、佔位符 |
| `src/styles.css` | 全部樣式 |
| `src/util.js` | `esc`／`ico`／`md`／連結與金額格式化等純函式 |
| `src/render.js` | 產 HTML 字串的純函式，不碰 DOM |
| `src/app.js` | 地圖繪製、燈箱、分頁、互動 |
| `trips/_example/` | 去識別化三天範例行程 |
| `tests/` | `node --test` 測試與 fixtures |
| `docs/schema/` | 六份資料檔的欄位文件 |

---

### Task 1: 專案骨架與 slug 解析

**Files:**
- Create: `package.json`、`.gitignore`、`scripts/lib/paths.js`、`tests/paths.test.js`

**Interfaces:**
- Consumes: 無
- Produces: `scripts/lib/paths.js` 匯出 `ROOT: string`、`resolveSlug(argv: string[]): string`、`tripDir(slug: string): string`、`distDir(slug: string): string`、`listTrips(): string[]`。`resolveSlug` 取 `argv` 第一個非 `--` 開頭的值；沒給值時掃 `trips/` 下不以 `_` 開頭的資料夾，恰好一個就回傳它，零個或多個則 `throw new Error`。

- [ ] **Step 1: 建立 `package.json`**

```json
{
  "name": "travel-planner",
  "version": "0.1.0",
  "private": true,
  "description": "可 fork 的旅程網頁模板：引擎 + trips/<slug>/ 內容",
  "engines": { "node": ">=20" },
  "scripts": {
    "check": "node scripts/check.js",
    "build": "node scripts/build.js",
    "preview": "node scripts/preview.js",
    "ship": "node scripts/ship.js",
    "new": "node scripts/new-trip.js",
    "migrate": "node scripts/migrate.js",
    "test": "node --test tests/"
  },
  "dependencies": {},
  "devDependencies": { "wrangler": "^4.133.0" }
}
```

- [ ] **Step 2: 建立 `.gitignore`**

```
node_modules/
dist/
.wrangler/
.DS_Store
trips/*/.cache/
```

- [ ] **Step 3: 寫失敗的測試 `tests/paths.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { resolveSlug, tripDir, distDir, ROOT } = require('../scripts/lib/paths.js');

test('明確指定 slug 時直接採用', () => {
  assert.equal(resolveSlug(['_example']), '_example');
});

test('忽略 -- 開頭的旗標', () => {
  assert.equal(resolveSlug(['--force', '_example']), '_example');
});

test('沒給 slug 時，唯一的非底線行程會被自動選中', (t) => {
  t.mock.method(fs, 'readdirSync', () => [
    { name: '_example', isDirectory: () => true },
    { name: 'sendai-2026', isDirectory: () => true },
  ]);
  assert.equal(resolveSlug([]), 'sendai-2026');
});

test('沒給 slug 且有多個行程時報錯並列出可選項', (t) => {
  t.mock.method(fs, 'readdirSync', () => [
    { name: 'a-trip', isDirectory: () => true },
    { name: 'b-trip', isDirectory: () => true },
  ]);
  assert.throws(() => resolveSlug([]), /a-trip.*b-trip/s);
});

test('路徑落在專案內', () => {
  assert.equal(tripDir('x'), path.join(ROOT, 'trips', 'x'));
  assert.equal(distDir('x'), path.join(ROOT, 'dist', 'x'));
});
```

- [ ] **Step 4: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，訊息為 `Cannot find module '../scripts/lib/paths.js'`

- [ ] **Step 5: 實作 `scripts/lib/paths.js`**

```js
// slug 解析與路徑計算。引擎所有 CLI 都從這裡取得行程資料夾位置。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const tripDir = (slug) => path.join(ROOT, 'trips', slug);
const distDir = (slug) => path.join(ROOT, 'dist', slug);

function listTrips() {
  return fs.readdirSync(path.join(ROOT, 'trips'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name);
}

function resolveSlug(argv) {
  const given = (argv || []).find((a) => !a.startsWith('--'));
  if (given) return given;
  const trips = listTrips();
  if (trips.length === 1) return trips[0];
  if (!trips.length) throw new Error('trips/ 底下沒有行程。先跑 npm run new -- <slug>');
  throw new Error(`有多個行程，請指定其中一個：${trips.join('、')}`);
}

module.exports = { ROOT, tripDir, distDir, listTrips, resolveSlug };
```

- [ ] **Step 6: 執行測試確認通過**

Run: `npm test`
Expected: PASS，5 個測試全過

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore scripts/lib/paths.js tests/paths.test.js
git commit -m "feat: 專案骨架與 slug 解析

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: schema 驗證

**Files:**
- Create: `scripts/lib/schema.js`、`tests/fixtures/make-trip.js`、`tests/schema.test.js`

**Interfaces:**
- Consumes: 無（純函式，不讀檔）
- Produces:
  - `schema.js` 匯出 `SCHEMA_VERSION = 1`、`validate(trip): string[]`、`KINDS`、`MODES`、`CATS`（皆為 `Set<string>`）。`trip` 是 Task 3 `loadTrip` 合併後的物件，回傳空陣列代表通過。
  - `tests/fixtures/make-trip.js` 匯出 `makeTrip(overrides?: object): Trip`、`place(over?): object`、`detail(over?): object`。`makeTrip` 回傳一份最小但合法的行程物件，`overrides` 以淺層合併覆蓋頂層鍵。

- [ ] **Step 1: 寫 fixture `tests/fixtures/make-trip.js`**

```js
// 最小但合法的行程物件，供 schema 測試逐條破壞。全為合成資料。
const place = (over) => ({ name: '地點', local: 'Place', lat: 38.2, lng: 140.5, gq: '地點', cat: 'sight', ...over });
const detail = (over) => ({
  summary: '這是一段足夠長的說明文字，用來滿足最少四十個字的驗證規則，內容本身不重要，只要長度足夠即可。',
  highlights: ['看點一', '看點二'], stay: '60 分', info: [], refs: [{ t: '官方', u: 'https://example.com/' }], ...over,
});

function makeTrip(overrides = {}) {
  const base = {
    slug: '_fixture',
    config: {
      schemaVersion: 1, title: '測試行程', lang: 'zh-Hant',
      dates: { start: '2026-10-11', end: '2026-10-12' },
      region: { country: 'JP', bbox: [139.9, 37.8, 141.5, 39.0] },
      transport: ['drive'], party: 2, currency: '¥',
      sections: { overview: true, dining: false, mapLists: false, checklist: true },
      theme: { accent: '#B0552D', favicon: '🗾' },
      basemap: { dem: 'auto', detail: 'normal', contourLevels: null },
      deploy: { name: 'fixture', target: 'workers' },
    },
    PLACES: { hubA: place({ cat: 'hub' }), sightA: place(), stayA: place({ cat: 'stay' }) },
    DAYS: [
      { id: 1, date: '10/11（日）', color: '#C2683A', title: '第一天', theme: '主軸', lead: '引言',
        stops: [
          { time: '10:00', place: 'hubA', kind: 'main', label: '抵達' },
          { time: '12:00', place: 'stayA', kind: 'stay', label: '入住',
            leg: { mode: 'drive', dist: '20 公里', time: '30 分', buffer: '45 分', via: '國道', url: 'https://maps.example.com/' } },
        ], meals: [], alts: [], cautions: [] },
      { id: 2, date: '10/12（一）', color: '#4F7A4A', title: '第二天', theme: '主軸', lead: '引言',
        stops: [
          { time: '09:00', place: 'stayA', kind: 'stay', label: '出發' },
          { time: '10:00', place: 'sightA', kind: 'main', label: '參觀',
            leg: { mode: 'transit', time: '25 分', via: 'JR 線', fare: '¥420', url: 'https://maps.example.com/' } },
        ], meals: [], alts: [], cautions: [] },
    ],
    OVERVIEW_ROUTE: ['hubA', 'stayA', 'sightA'],
    ADDONS: [{ place: 'sightA', day: '10/12', why: '順路', cost: '30 分' }],
    CHECKLIST: ['確認一件事'],
    STAYS: [{ place: 'stayA', day: 1, range: '10/11 → 10/12', nights: 1, meals: '不含餐', check: '15:00 入住', role: '基地' }],
    OVERVIEW: { checked: '2026/09/18', foot: ['頁尾說明'] },
    DETAILS: { sightA: detail(), stayA: detail() },
    DINING: { checked: '2026/09/18', places: {}, venues: {}, days: {} },
    MAP_LISTS: {},
    PHOTOS: {},
    basemap: { meta: { bbox: [139.9, 37.8, 141.5, 39.0] } },
  };
  return { ...base, ...overrides };
}

module.exports = { makeTrip, place, detail };
```

- [ ] **Step 2: 寫失敗的測試 `tests/schema.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, SCHEMA_VERSION } = require('../scripts/lib/schema.js');
const { makeTrip } = require('./fixtures/make-trip.js');

const has = (errs, re) => errs.some((e) => re.test(e));

test('SCHEMA_VERSION 是 1', () => assert.equal(SCHEMA_VERSION, 1));

test('合法行程沒有錯誤', () => assert.deepEqual(validate(makeTrip()), []));

test('schemaVersion 不符時提示跑 migrate', () => {
  const trip = makeTrip();
  trip.config.schemaVersion = 0;
  assert.ok(has(validate(trip), /migrate/));
});

test('座標超出 bbox 會被抓到', () => {
  const trip = makeTrip();
  trip.PLACES.sightA.lat = 12.3;
  assert.ok(has(validate(trip), /sightA.*座標/));
});

test('stop 引用未知地點會被抓到', () => {
  const trip = makeTrip();
  trip.DAYS[0].stops[0].place = 'nope';
  assert.ok(has(validate(trip), /nope/));
});

test('leg 缺 mode 會被抓到', () => {
  const trip = makeTrip();
  delete trip.DAYS[0].stops[1].leg.mode;
  assert.ok(has(validate(trip), /mode/));
});

test('transit 的 leg 缺 via 會被抓到', () => {
  const trip = makeTrip();
  delete trip.DAYS[1].stops[1].leg.via;
  assert.ok(has(validate(trip), /via/));
});

test('drive 的 leg 缺 dist 會被抓到', () => {
  const trip = makeTrip();
  delete trip.DAYS[0].stops[1].leg.dist;
  assert.ok(has(validate(trip), /dist/));
});

test('非 hub 地點缺 detail 會被抓到，hub 沒 detail 不擋', () => {
  const trip = makeTrip();
  delete trip.DETAILS.sightA;
  const errs = validate(trip);
  assert.ok(has(errs, /sightA/));
  assert.ok(!has(errs, /hubA/));
});

test('detail summary 太短會被抓到', () => {
  const trip = makeTrip();
  trip.DETAILS.sightA.summary = '太短';
  assert.ok(has(validate(trip), /summary/));
});

test('ref 網址不是 http(s) 會被抓到', () => {
  const trip = makeTrip();
  trip.DETAILS.sightA.refs = [{ t: '官方', u: 'ftp://example.com' }];
  assert.ok(has(validate(trip), /網址/));
});

test('STAYS.day 指向不存在的天會被抓到', () => {
  const trip = makeTrip();
  trip.STAYS[0].day = 9;
  assert.ok(has(validate(trip), /STAYS.*day/));
});

test('dining 關閉時不檢查餐食；開啟時每天至少一餐', () => {
  assert.deepEqual(validate(makeTrip()), []);
  const trip = makeTrip();
  trip.config.sections.dining = true;
  assert.ok(has(validate(trip), /Day 1.*餐/));
});

test('mapLists 開啟時清單必須涵蓋當天所有地點', () => {
  const trip = makeTrip();
  trip.config.sections.mapLists = true;
  trip.MAP_LISTS = {
    1: { name: 'D1', url: 'https://maps.example.com/1', placeKeys: ['hubA'] },
    2: { name: 'D2', url: 'https://maps.example.com/2', placeKeys: ['stayA', 'sightA'] },
  };
  trip.DAYS[0].mapList = trip.MAP_LISTS[1];
  trip.DAYS[1].mapList = trip.MAP_LISTS[2];
  assert.ok(has(validate(trip), /Day 1 的清單少了 stayA/));
});

test('basemap 的 bbox 與 config 不符會被抓到', () => {
  const trip = makeTrip();
  trip.basemap.meta.bbox = [0, 0, 1, 1];
  assert.ok(has(validate(trip), /bbox/));
});

test('天數不限，但 id 必須連號', () => {
  const trip = makeTrip();
  trip.DAYS[1].id = 5;
  assert.ok(has(validate(trip), /id/));
});

test('parking 缺座標會被抓到', () => {
  const trip = makeTrip();
  trip.PLACES.sightA.parking = { name: '停車場' };
  assert.ok(has(validate(trip), /parking/));
});

test('照片授權不明會被抓到', () => {
  const trip = makeTrip();
  trip.PHOTOS = { sightA: [{ title: 'a.jpg', artist: '某人', license: '未知', page: 'https://example.com/a' }] };
  assert.ok(has(validate(trip), /授權/));
});
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，`Cannot find module '../scripts/lib/schema.js'`

- [ ] **Step 4: 實作 `scripts/lib/schema.js`**

規則逐條對應 spec §3「驗證規則」。為了守住 50 行的函式上限，`validate` 只負責串接，各段拆成獨立函式。

```js
// 行程資料的驗證規則。回傳錯誤字串陣列，空陣列代表通過。
const SCHEMA_VERSION = 1;
const KINDS = new Set(['main', 'suggest', 'optional', 'stay', 'transit', 'alt']);
const MODES = new Set(['drive', 'transit', 'walk', 'taxi', 'ferry']);
const CATS = new Set(['hub', 'stay', 'sight', 'food', 'shop']);

function checkPlaces(trip, fail) {
  const [lngMin, latMin, lngMax, latMax] = trip.config.region.bbox;
  Object.entries(trip.PLACES).forEach(([key, p]) => {
    if (!p.name) fail(`PLACES.${key} 缺 name`);
    if (!CATS.has(p.cat)) fail(`PLACES.${key} cat 不合法：${p.cat}`);
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') fail(`PLACES.${key} 座標不是數字`);
    else if (p.lat < latMin || p.lat > latMax || p.lng < lngMin || p.lng > lngMax) {
      fail(`PLACES.${key} 座標超出 region.bbox：${p.lat},${p.lng}`);
    }
    if (!p.gq && !p.gurl) fail(`PLACES.${key} 缺 gq 或 gurl`);
    if (p.parking && (typeof p.parking.lat !== 'number' || typeof p.parking.lng !== 'number')) {
      fail(`PLACES.${key} 的 parking 缺座標`);
    }
    if (p.cat !== 'hub' && !trip.DETAILS[key]) fail(`${key} 缺 detail`);
  });
}

function checkLeg(day, s, j, fail) {
  if (!MODES.has(s.leg.mode)) fail(`Day ${day.id} stop ${j} leg.mode 不合法：${s.leg.mode}`);
  if (!s.leg.time) fail(`Day ${day.id} stop ${j} leg 缺 time`);
  if (s.leg.mode === 'transit' && !s.leg.via) fail(`Day ${day.id} stop ${j} 大眾運輸的 leg 缺 via（路線名）`);
  if (s.leg.mode === 'drive' && !s.leg.dist) fail(`Day ${day.id} stop ${j} 自駕的 leg 缺 dist`);
}

function checkDays(trip, fail) {
  const { DAYS, PLACES, DETAILS, config } = trip;
  if (!DAYS.length) fail('DAYS 為空');
  DAYS.forEach((d, i) => {
    if (d.id !== i + 1) fail(`DAYS[${i}].id 應為 ${i + 1}，實際 ${d.id}`);
    if (!/^#[0-9A-Fa-f]{6}$/.test(d.color || '')) fail(`Day ${d.id} color 不是 hex`);
    if (!d.date || !d.title || !d.theme) fail(`Day ${d.id} 缺 date/title/theme`);
    if (!Array.isArray(d.stops) || d.stops.length < 2) fail(`Day ${d.id} 停留點不足 2 個`);
    (d.stops || []).forEach((s, j) => {
      if (!PLACES[s.place]) fail(`Day ${d.id} stop ${j} 引用未知地點 ${s.place}`);
      if (!KINDS.has(s.kind)) fail(`Day ${d.id} stop ${j} kind 不合法：${s.kind}`);
      if (!s.time) fail(`Day ${d.id} stop ${j} 缺 time`);
      if (s.leg) checkLeg(d, s, j, fail);
    });
    (d.alts || []).forEach((a, j) => {
      [...(a.place ? [a.place] : []), ...(a.places || [])].forEach((k) => {
        if (!PLACES[k]) fail(`Day ${d.id} alt ${j} 引用未知地點 ${k}`);
        else if (!DETAILS[k]) fail(`Day ${d.id} alt ${j} 的 ${k} 沒有詳細說明`);
      });
    });
    if (config.sections.dining) checkMeals(trip, d, fail);
  });
}

function checkMeals(trip, d, fail) {
  if (!Array.isArray(d.meals) || !d.meals.length) {
    fail(`Day ${d.id} 缺餐食規劃（sections.dining 已開啟）`);
    return;
  }
  d.meals.forEach((m, j) => {
    if (!m.slot || !m.time || !m.plan || !m.fallback) fail(`Day ${d.id} meal ${j} 缺 slot/time/plan/fallback`);
    [...(m.places || []), ...(m.backupPlaces || [])].forEach((k) => {
      if (!trip.PLACES[k] || !trip.DETAILS[k]) fail(`Day ${d.id} meal ${j} 地點或詳細說明不存在：${k}`);
    });
  });
}

function checkRefsAndLists(trip, fail) {
  const { PLACES, DETAILS, STAYS, ADDONS, OVERVIEW_ROUTE, DAYS } = trip;
  (OVERVIEW_ROUTE || []).forEach((k) => { if (!PLACES[k]) fail(`OVERVIEW_ROUTE 未知地點 ${k}`); });
  (ADDONS || []).forEach((a, i) => {
    if (!PLACES[a.place]) fail(`ADDONS[${i}] 未知地點 ${a.place}`);
    if (!a.day || !a.why || !a.cost) fail(`ADDONS[${i}] 缺 day/why/cost`);
  });
  (STAYS || []).forEach((s, i) => {
    if (!PLACES[s.place]) fail(`STAYS[${i}] 未知地點 ${s.place}`);
    if (!DAYS.some((d) => d.id === s.day)) fail(`STAYS[${i}] 的 day 指向不存在的天：${s.day}`);
    if (typeof s.nights !== 'number' || s.nights < 1) fail(`STAYS[${i}] nights 不合法`);
  });
  Object.entries(DETAILS).forEach(([k, d]) => {
    if (!PLACES[k]) fail(`DETAILS.${k} 引用未知地點`);
    if (!d.summary || d.summary.length < 40) fail(`DETAILS.${k} summary 太短`);
    if (!Array.isArray(d.highlights) || d.highlights.length < 2) fail(`DETAILS.${k} highlights 不足 2 點`);
    if (!d.stay) fail(`DETAILS.${k} 缺 stay`);
    if (!Array.isArray(d.refs) || !d.refs.length) fail(`DETAILS.${k} 缺 refs`);
    (d.refs || []).forEach((r) => { if (!/^https?:\/\//.test(r.u || '')) fail(`DETAILS.${k} ref 網址不合法：${r.u}`); });
    (d.info || []).forEach((row) => { if (!Array.isArray(row) || row.length !== 2) fail(`DETAILS.${k} info 每列需為 [標籤, 內容]`); });
  });
}

function checkMapLists(trip, fail) {
  trip.DAYS.forEach((d) => {
    const list = trip.MAP_LISTS[d.id];
    if (!list) { fail(`Day ${d.id} 缺 Google Maps 清單`); return; }
    const need = new Set([
      ...d.stops.map((s) => s.place),
      ...(d.meals || []).flatMap((m) => [...(m.places || []), ...(m.backupPlaces || [])]),
      ...(d.alts || []).flatMap((a) => [...(a.place ? [a.place] : []), ...(a.places || [])]),
    ]);
    [...need].forEach((k) => {
      if (!list.placeKeys.includes(k)) fail(`Day ${d.id} 的清單少了 ${k}：先更新實際 Maps 清單再改 map-lists.js`);
    });
  });
}

function checkPhotosAndBasemap(trip, fail) {
  Object.entries(trip.PHOTOS || {}).forEach(([k, list]) => {
    if (!trip.PLACES[k]) fail(`PHOTOS.${k} 引用未知地點`);
    list.forEach((ph, i) => {
      if (ph.url) { if (!ph.credit) fail(`PHOTOS.${k}[${i}] 直接網址缺 credit`); return; }
      if (!ph.license || !/CC|Public domain/i.test(ph.license)) fail(`PHOTOS.${k}[${i}] 授權不明：${ph.license}`);
      if (!ph.page) fail(`PHOTOS.${k}[${i}] 缺來源頁面連結`);
    });
  });
  if (!trip.basemap) return;
  const b = trip.basemap.meta && trip.basemap.meta.bbox;
  if (!b) fail('basemap.json 缺 meta.bbox：重跑 npm run basemap');
  else if (b.join(',') !== trip.config.region.bbox.join(',')) {
    fail(`basemap 的 bbox 與 trip.config 不符：${b.join(',')} vs ${trip.config.region.bbox.join(',')}；重跑 npm run basemap`);
  }
}

function validate(trip) {
  const errs = [];
  const fail = (m) => errs.push(m);
  if (trip.config.schemaVersion !== SCHEMA_VERSION) {
    fail(`trip.config.schemaVersion 是 ${trip.config.schemaVersion}，引擎需要 ${SCHEMA_VERSION}：跑 npm run migrate -- ${trip.slug}`);
  }
  checkPlaces(trip, fail);
  checkDays(trip, fail);
  checkRefsAndLists(trip, fail);
  if (trip.config.sections.mapLists) checkMapLists(trip, fail);
  checkPhotosAndBasemap(trip, fail);
  if (trip.config.sections.checklist && !(trip.CHECKLIST || []).length) fail('CHECKLIST 為空');
  return errs;
}

module.exports = { SCHEMA_VERSION, validate, KINDS, MODES, CATS };
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm test`
Expected: PASS，schema 的 18 個測試全過

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/schema.js tests/schema.test.js tests/fixtures/make-trip.js
git commit -m "feat: 行程資料 schema 驗證

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 行程載入與 check 指令

**Files:**
- Create: `scripts/lib/load-trip.js`、`scripts/check.js`、`tests/load-trip.test.js`

**Interfaces:**
- Consumes: `paths.js` 的 `tripDir`；`schema.js` 的 `validate`
- Produces: `load-trip.js` 匯出 `loadTrip(slug: string, opts?: { validate?: boolean }): Trip`。`Trip` 欄位如 Task 2 的 fixture。`opts.validate` 預設 `true`，驗證失敗時 `throw new Error`，訊息含所有錯誤。載入時做三件接線：把 `DINING.places` 併入 `PLACES` 並標 `approximate: true`、把 `DINING.days[id]` 掛成 `day.meals`、把 `MAP_LISTS[id]` 掛成 `day.mapList`、把 `DINING.checklist` 併入 `CHECKLIST`。

- [ ] **Step 1: 寫失敗的測試 `tests/load-trip.test.js`**

測試用暫存資料夾寫出一份行程，避免依賴 `trips/_example`（它在 Task 5 才出現）。

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { loadTrip } = require('../scripts/lib/load-trip.js');
const { makeTrip } = require('./fixtures/make-trip.js');

const SLUG = '_loadtest';
const dir = path.join(ROOT, 'trips', SLUG);

function writeTrip(mutate) {
  const t = makeTrip();
  if (mutate) mutate(t);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'trip.config.json'), JSON.stringify(t.config, null, 2));
  const mod = (name, value) => fs.writeFileSync(path.join(dir, name), `module.exports = ${JSON.stringify(value, null, 2)};\n`);
  mod('data.js', { PLACES: t.PLACES, DAYS: t.DAYS, OVERVIEW_ROUTE: t.OVERVIEW_ROUTE, ADDONS: t.ADDONS, CHECKLIST: t.CHECKLIST, STAYS: t.STAYS, OVERVIEW: t.OVERVIEW });
  mod('details.js', t.DETAILS);
  mod('dining.js', t.DINING);
  mod('map-lists.js', t.MAP_LISTS);
  fs.writeFileSync(path.join(dir, 'photos.json'), JSON.stringify(t.PHOTOS));
  fs.writeFileSync(path.join(dir, 'basemap.json'), JSON.stringify(t.basemap));
}

test.afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test('載入合法行程並回傳合併後的物件', () => {
  writeTrip();
  const t = loadTrip(SLUG);
  assert.equal(t.slug, SLUG);
  assert.equal(t.DAYS.length, 2);
  assert.equal(t.config.title, '測試行程');
});

test('餐飲地點併入 PLACES 並標為概略位置，三餐掛到當天', () => {
  writeTrip((t) => {
    t.DINING.places = { cafeA: { name: '咖啡店', lat: 38.3, lng: 140.6, gq: '咖啡店', cat: 'food' } };
    t.DINING.venues = { cafeA: { menu: '咖啡', booking: '不用訂位' } };
    t.DINING.days = { 1: [{ slot: '午餐', time: '12:00', plan: '喝咖啡', fallback: '便利商店', places: ['cafeA'] }] };
    t.DETAILS.cafeA = t.DETAILS.sightA;
    t.config.sections.dining = true;
  });
  const t = loadTrip(SLUG);
  assert.equal(t.PLACES.cafeA.approximate, true);
  assert.equal(t.DAYS[0].meals.length, 1);
  assert.equal(t.DAYS[1].meals.length, 0);
});

test('dining.checklist 併入 CHECKLIST', () => {
  writeTrip((t) => { t.DINING.checklist = ['問餐廳能不能訂位']; });
  assert.ok(loadTrip(SLUG).CHECKLIST.includes('問餐廳能不能訂位'));
});

test('驗證失敗時丟出含所有問題的錯誤', () => {
  writeTrip((t) => { t.PLACES.sightA.lat = 0; });
  assert.throws(() => loadTrip(SLUG), /座標超出/);
});

test('validate:false 時略過驗證', () => {
  writeTrip((t) => { t.PLACES.sightA.lat = 0; });
  assert.ok(loadTrip(SLUG, { validate: false }).PLACES.sightA);
});

test('資料夾不存在時給明確訊息', () => {
  assert.throws(() => loadTrip('_nope'), /找不到行程資料夾/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，`Cannot find module '../scripts/lib/load-trip.js'`

- [ ] **Step 3: 實作 `scripts/lib/load-trip.js`**

```js
// 讀 trips/<slug>/ 的 config 與資料檔，合併接線後驗證。
const fs = require('node:fs');
const path = require('node:path');
const { tripDir } = require('./paths.js');
const { validate } = require('./schema.js');

const readJSON = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);
// 測試會重複寫入同一路徑，require 快取必須清掉才會拿到新內容。
const readJS = (p, fallback) => { if (!fs.existsSync(p)) return fallback; delete require.cache[require.resolve(p)]; return require(p); };

function loadTrip(slug, opts = {}) {
  const dir = tripDir(slug);
  if (!fs.existsSync(dir)) throw new Error(`找不到行程資料夾：trips/${slug}`);
  const config = readJSON(path.join(dir, 'trip.config.json'), null);
  if (!config) throw new Error(`trips/${slug}/trip.config.json 不存在`);

  const data = readJS(path.join(dir, 'data.js'), {});
  const DINING = readJS(path.join(dir, 'dining.js'), { checked: '', places: {}, venues: {}, days: {} });
  const MAP_LISTS = readJS(path.join(dir, 'map-lists.js'), {});
  const trip = {
    slug, config,
    PLACES: { ...data.PLACES },
    DAYS: (data.DAYS || []).map((d) => ({ ...d })),
    OVERVIEW_ROUTE: data.OVERVIEW_ROUTE || [],
    ADDONS: data.ADDONS || [],
    CHECKLIST: [...(data.CHECKLIST || [])],
    STAYS: data.STAYS || [],
    OVERVIEW: data.OVERVIEW || {},
    DETAILS: readJS(path.join(dir, 'details.js'), {}),
    DINING, MAP_LISTS,
    PHOTOS: readJSON(path.join(dir, 'photos.json'), {}),
    basemap: readJSON(path.join(dir, 'basemap.json'), null),
  };

  // 餐飲地點併入 PLACES：座標是街區概略位置，導航以店名與地址為準。
  Object.entries(DINING.places || {}).forEach(([key, p]) => { trip.PLACES[key] = { approximate: true, ...p }; });
  trip.DAYS.forEach((d) => {
    d.meals = (DINING.days || {})[d.id] || [];
    d.mapList = MAP_LISTS[d.id] || null;
  });
  trip.CHECKLIST.push(...(DINING.checklist || []));

  if (opts.validate !== false) {
    const errs = validate(trip);
    if (errs.length) throw new Error(`資料檢查失敗（${errs.length} 個問題）：\n  - ${errs.join('\n  - ')}`);
  }
  return trip;
}

module.exports = { loadTrip };
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS，load-trip 的 6 個測試全過

- [ ] **Step 5: 實作 `scripts/check.js`**

```js
#!/usr/bin/env node
// 驗證行程資料：node scripts/check.js <slug>
const { resolveSlug } = require('./lib/paths.js');
const { loadTrip } = require('./lib/load-trip.js');

try {
  const slug = resolveSlug(process.argv.slice(2));
  const t = loadTrip(slug);
  const stops = t.DAYS.reduce((n, d) => n + d.stops.length, 0);
  const photos = Object.values(t.PHOTOS).reduce((n, l) => n + l.length, 0);
  console.log(`✓ ${slug}：${Object.keys(t.PLACES).length} 個地點、${t.DAYS.length} 天、${stops} 個停留點、`
    + `${Object.keys(t.DETAILS).length} 份詳細說明、${photos} 張照片`);
} catch (e) {
  console.error('✗ ' + e.message);
  process.exit(1);
}
```

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/load-trip.js scripts/check.js tests/load-trip.test.js
git commit -m "feat: 行程載入與 check 指令

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 把 template.html 拆成引擎前端檔案（行為不變）

從 SENTAI2026 複製既有頁面程式碼進來並拆檔。這一步**刻意不改任何輸出**，用 parity 測試證明拆檔沒改壞東西；泛化留到 Task 5。

**Files:**
- Create: `src/legacy-template.html`（暫時，Task 5 結束時刪除）、`src/index.html`、`src/styles.css`、`src/util.js`、`src/render.js`、`src/app.js`、`tests/helpers/render-ctx.js`、`tests/render-parity.test.js`

**Interfaces:**
- Consumes: Task 2 的 `makeTrip`
- Produces:
  - `tests/helpers/render-ctx.js` 匯出 `renderContext(trip: Trip, sources: string[]): object`。它建立一個 `node:vm` context，注入 `CONFIG`／`PLACES`／`DAYS`／`DETAILS`／`DINING`／`PHOTOS`／`STAYS`／`ADDONS`／`CHECKLIST`／`OVERVIEW`／`OVERVIEW_ROUTE`／`MAP_LISTS` 全域，依序 `runInContext` 每段原始碼，回傳該 context（可直接取用 `dayHTML`、`overviewHTML` 等函式）。
  - `src/util.js` 定義 `esc(s)`、`ico(id, cls?)`、`md(t)`、`KIND`、`ll(p)`、`mapsUrl(p)`、`routeUrl(from, to, mode)`。
  - `src/render.js` 定義 `legHTML(leg, fromKey, toKey)`、`stopHTML(s, i, stops)`、`mealsHTML(day)`、`dayHTML(day)`、`overviewHTML()`、`roleOf(key)`、`detailBodyHTML(key)`。全部只回傳字串，不觸碰 `document`。
  - `src/app.js` 保留所有碰 DOM 的程式：投影與地圖繪製、pin 佈局、地圖對話框、FAB、燈箱開關、分頁、勾選狀態、主題、啟動序列。

- [ ] **Step 1: 複製既有頁面程式碼**

```bash
mkdir -p src
cp /Users/wangch/GitHub/SENTAI2026/src/template.html src/legacy-template.html
```

- [ ] **Step 2: 寫測試輔助 `tests/helpers/render-ctx.js`**

```js
const vm = require('node:vm');

// util.js / render.js 都是 `const fn = …` 與 `function fn(){}` 的混合。vm 的頂層 const
// 不會變成 context 屬性，且分次 runInContext 彼此看不到對方的 const，所以這裡把所有
// 原始碼接成一段執行，最後再把要用的名字逐一掛上 globalThis（沒宣告的用 try 略過）。
const EXPORTS = ['esc', 'ico', 'md', 'money', 'KIND', 'll', 'mapsUrl', 'routeUrl',
  'legHTML', 'stopHTML', 'mealsHTML', 'dayHTML', 'overviewHTML', 'roleOf', 'detailBodyHTML', 'extraHTML'];

function renderContext(trip, sources) {
  const ctx = {
    CONFIG: trip.config,
    PLACES: trip.PLACES, DAYS: trip.DAYS, DETAILS: trip.DETAILS, DINING: trip.DINING,
    PHOTOS: trip.PHOTOS, STAYS: trip.STAYS, ADDONS: trip.ADDONS, CHECKLIST: trip.CHECKLIST,
    OVERVIEW: trip.OVERVIEW, OVERVIEW_ROUTE: trip.OVERVIEW_ROUTE, MAP_LISTS: trip.MAP_LISTS,
    EXTRA: trip.EXTRA || { sections: [] },
    console,
  };
  vm.createContext(ctx);
  const expose = EXPORTS.map((n) => `try{ globalThis.${n} = ${n}; }catch(e){}`).join('');
  vm.runInContext(sources.join('\n') + '\n;' + expose, ctx);
  return ctx;
}

// 從 legacy-template.html 取出一段程式碼（含頭尾標記之間的內容）
function legacySlice(html, startMarker, endMarker) {
  const a = html.indexOf(startMarker);
  const b = html.indexOf(endMarker, a);
  if (a === -1 || b === -1) throw new Error(`找不到切片標記：${startMarker}`);
  return html.slice(a, b);
}

module.exports = { renderContext, legacySlice };
```

- [ ] **Step 3: 寫失敗的 parity 測試 `tests/render-parity.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { renderContext, legacySlice } = require('./helpers/render-ctx.js');
const { makeTrip, detail } = require('./fixtures/make-trip.js');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 拆檔前後要餵一樣的資料。dining 打開，好讓 mealsHTML 也被比對到。
// legacy 的 overviewHTML 寫死 DAYS[0]／DAYS[3]／DAYS[4] 與三筆 STAYS，
// 所以 parity 的樣本必須有 5 天 3 宿，否則舊程式會取到 undefined 而爆掉。
function fixture() {
  const t = makeTrip();
  t.config.sections.dining = true;
  t.config.sections.mapLists = true;
  const colors = ['#C2683A', '#4F7A4A', '#3E6B8A', '#8A5A9B', '#A8823C'];
  while (t.DAYS.length < 5) {
    const id = t.DAYS.length + 1;
    t.DAYS.push({ ...JSON.parse(JSON.stringify(t.DAYS[1])), id, color: colors[id - 1], date: `10/1${id}（—）`, title: `第 ${id} 天` });
  }
  t.STAYS = [
    { place: 'stayA', day: 1, range: 'r1', nights: 2, meals: '不含餐', check: '15:00 入住', role: '基地一' },
    { place: 'stayA', day: 3, range: 'r2', nights: 1, meals: '含早餐', check: '15:00 入住', role: '基地二' },
    { place: 'stayA', day: 4, range: 'r3', nights: 1, meals: '含早餐', check: '16:00 入住', role: '基地三' },
  ];
  t.DINING = {
    checked: '2026/09/18',
    places: { cafeA: { name: '咖啡店', local: 'Cafe A', lat: 38.3, lng: 140.6, gq: '咖啡店', cat: 'food', approximate: true } },
    venues: { cafeA: { menu: '咖啡與三明治', booking: '不用訂位', budget: [800, 1500] } },
    days: { 1: [{ slot: '午餐', time: '12:00', plan: '在咖啡店吃', fallback: '便利商店', places: ['cafeA'] }], 2: [] },
  };
  t.PLACES.cafeA = { ...t.DINING.places.cafeA };
  t.DETAILS.cafeA = detail({ dining: true });
  t.DAYS.forEach((d, i) => { d.meals = t.DINING.days[d.id] || []; });
  t.MAP_LISTS = {};
  t.DAYS.forEach((d) => {
    t.MAP_LISTS[d.id] = { name: `D${d.id}`, url: `https://maps.example.com/${d.id}`,
      placeKeys: [...new Set([...d.stops.map((x) => x.place), ...d.meals.flatMap((m) => m.places || [])])] };
    d.mapList = t.MAP_LISTS[d.id];
  });
  return t;
}

test('拆檔後的 render.js 與原 template 產出完全一致', () => {
  const legacy = read('src/legacy-template.html');
  const legacySrc = [
    legacySlice(legacy, 'const $ = (s, r)', '/* ── 投影 ── */').replace(/^const \$ = .*\n/, ''),
    legacySlice(legacy, 'function legHTML(', '/* ── 詳細燈箱 ── */'),
    legacySlice(legacy, 'const md = (t)', 'function openDetail('),
  ].join('\n');
  const modern = [read('src/util.js'), read('src/render.js')];

  const a = renderContext(fixture(), [legacySrc]);
  const b = renderContext(fixture(), modern);

  for (const day of fixture().DAYS) {
    assert.equal(b.dayHTML(day), a.dayHTML(day), `Day ${day.id} 的 HTML 不一致`);
  }
  assert.equal(b.legHTML({ mode: 'drive', dist: '20 公里', drive: '30 分', buffer: '45 分', road: '國道' }, 'hubA', 'stayA'),
    a.legHTML({ mode: 'drive', dist: '20 公里', drive: '30 分', buffer: '45 分', road: '國道' }, 'hubA', 'stayA'),
    'leg 的 HTML 不一致');
  assert.equal(b.overviewHTML(), a.overviewHTML(), '總覽 HTML 不一致');
});
```

- [ ] **Step 4: 執行測試確認失敗**

Run: `node --test tests/render-parity.test.js`
Expected: FAIL，`ENOENT`（`src/util.js` 尚未存在）

- [ ] **Step 5: 從 legacy-template.html 抽出 `src/styles.css` 與 `src/index.html`**

- `src/styles.css`：`legacy-template.html` 第 6 行（`<style>` 的下一行）到 `</style>` 前一行的全部內容，原樣搬移，不改任何一條規則。
- `src/index.html`：`<title>` 那行改成 `<title>/*__TITLE__*/</title>`、字型 `<link>` 三行、`<link rel="stylesheet" href="styles.css">`，接著原樣搬入 `</style>` 之後到 `<script>` 之前的 body 標記（SVG sprite、`header.top`、`.wrap`、`.fab`、兩個 `<dialog>`），最後放四個佔位符：

```html
<script>
const CONFIG = /*__CONFIG__*/null;
const BASEMAP = /*__BASEMAP__*/null;
const PHOTOS = /*__PHOTOS__*/null;
/*__DATA__*/
</script>
<script src="util.js"></script>
<script src="render.js"></script>
<script src="app.js"></script>
```

（build 會把這些 `<script src>` 換成內嵌內容；`src/` 直接用瀏覽器開不是支援的用法。）

- [ ] **Step 6: 建立 `src/util.js`**

搬入 legacy 的 `esc`、`ico`、`md`、`KIND`、`ll`、`mapsUrl`、`routeUrl`，**內容一字不改**，只把 `routeUrl` 的第三個參數從 `walking` 改名為 `mode` 並保持既有行為：

```js
'use strict';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const ico = (id, cls) => '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#' + id + '"/></svg>';
const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const KIND = { main:'已定主軸', suggest:'本版建議', optional:'加選', stay:'住宿', transit:'移動', alt:'替換' };
/* 地點連結用座標，名稱搜尋會配錯分店；有官方連結的用官方連結 */
const ll = (p) => p.lat.toFixed(6) + ',' + p.lng.toFixed(6);
const mapsUrl = (p) => p.gurl
  || (p.cat === 'stay' || p.approximate ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.gq)
    : 'https://www.google.com/maps/search/?api=1&query=' + ll(p));
/* 路線連結：起訖都用實際停留點的座標，而不是參考地標 */
const routeUrl = (from, to, mode) => 'https://www.google.com/maps/dir/?api=1&origin=' + ll(from)
  + '&destination=' + ll(to) + '&travelmode=' + (mode === 'walk' ? 'walking' : 'driving');
```

- [ ] **Step 7: 建立 `src/render.js`**

搬入 legacy 的 `legHTML`、`stopHTML`、`mealsHTML`、`dayHTML`、`overviewHTML`、`roleOf`，以及 `openDetail` 裡組 `lbBody.innerHTML` 的那段（抽成 `detailBodyHTML(key)`，回傳同一個字串，照片區塊仍留在 `app.js`）。**這一步一個字都不改**——包含 `legHTML` 裡 `/步行/.test(leg.drive)` 這種舊欄位用法，那是 Task 5 的事。

- [ ] **Step 8: 建立 `src/app.js`**

legacy `<script>` 內剩下的全部：`$`／`el`／`reduced`、投影與地圖（`prj`、`d`、`shape`、`drawBase`、`setView`、`fitTo`、`zoom`、`drawScale`、`placePins`、`layoutLabels`）、地圖對話框與 FAB、`renderMap`、`focusPlace`、`startSpy`、`openDetail`（改為呼叫 `detailBodyHTML`）、`afterDetailClose`／`closeDetail`、`openFromHash`、`buildTabs`、`show`、勾選狀態、主題、啟動序列。整份仍包在 `(function(){ 'use strict'; … })()` 裡。

localStorage 的 key 從寫死的 `sentai.*` 改為 `CONFIG.deploy.name + '.'` 前綴（`checks`／`tab`／`theme`），這樣同一台裝置開不同行程不會互相覆蓋。

- [ ] **Step 9: 執行 parity 測試確認通過**

Run: `node --test tests/render-parity.test.js`
Expected: PASS，兩天的 `dayHTML` 與 `overviewHTML` 完全一致

- [ ] **Step 10: 確認檔案大小都在上限內**

Run: `wc -l src/*.js src/*.css src/*.html`
Expected: 每個檔案 < 800 行

- [ ] **Step 11: Commit**

```bash
git add src tests/helpers/render-ctx.js tests/render-parity.test.js
git commit -m "refactor: 把單一 template 拆成 index/styles/util/render/app

行為不變，以 parity 測試比對拆檔前後的 HTML 輸出。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 泛化 render.js（移除行程專屬內容）

**Files:**
- Modify: `src/render.js`、`src/index.html`
- Create: `tests/render.test.js`
- Delete: `src/legacy-template.html`、`tests/render-parity.test.js`

**Interfaces:**
- Consumes: Task 4 的 `renderContext`、Task 2 的 `makeTrip`
- Produces: `render.js` 的函式簽章不變，但輸出改為由 `CONFIG` 與 `OVERVIEW` 驅動。新增 `money(range: [number, number]): string`（放 `util.js`），回傳 `每人約 ¥800–1,500／2 人約 ¥1,600–3,000`，幣別取 `CONFIG.currency`、人數取 `CONFIG.party`。

- [ ] **Step 1: 寫失敗的測試 `tests/render.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { renderContext } = require('./helpers/render-ctx.js');
const { makeTrip } = require('./fixtures/make-trip.js');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sources = () => [read('src/util.js'), read('src/render.js')];
const ctxFor = (trip) => renderContext(trip, sources());

test('引擎原始碼不含任何行程專屬字眼', () => {
  const src = ['src/util.js', 'src/render.js', 'src/app.js', 'src/index.html'].map(read).join('\n');
  for (const word of ['仙台', '山形', '鳴子', '松島', '星宇', 'Serena', '国土地理院', 'sentai', '七天', '六個晚上']) {
    assert.ok(!src.includes(word), `引擎不該出現行程專屬字眼：${word}`);
  }
});

test('總覽的天數與住宿晚數由資料決定', () => {
  const trip = makeTrip();
  const html = ctxFor(trip).overviewHTML();
  assert.ok(html.includes('2 天主軸'), '標題要用實際天數');
  assert.ok(html.includes('1 晚'));
  assert.ok(!html.includes('七天'));
});

test('住宿色條取 STAYS.day 對應那天的顏色，不是寫死的索引', () => {
  const trip = makeTrip();
  trip.STAYS[0].day = 2;
  const html = ctxFor(trip).overviewHTML();
  assert.ok(html.includes('--sc:' + trip.DAYS[1].color));
});

test('OVERVIEW 的欄位缺席時該區塊不渲染', () => {
  const trip = makeTrip();
  trip.OVERVIEW = {};
  const html = ctxFor(trip).overviewHTML();
  assert.ok(!html.includes('<div class="foot">'));
  assert.ok(html.includes('class="checks"'), '其他區塊仍要在');
});

test('OVERVIEW.foot 的每一段都會出現在頁尾', () => {
  const trip = makeTrip();
  trip.OVERVIEW.foot = ['第一段說明', '第二段說明'];
  const html = ctxFor(trip).overviewHTML();
  assert.ok(html.includes('第一段說明') && html.includes('第二段說明'));
});

test('sections 關掉的區塊不渲染', () => {
  const trip = makeTrip();
  trip.config.sections.checklist = false;
  assert.ok(!ctxFor(trip).overviewHTML().includes('class="checks"'));
});

test('sections.mapLists 關閉時每日標題不出現清單按鈕', () => {
  const trip = makeTrip();
  const html = ctxFor(trip).dayHTML(trip.DAYS[0]);
  assert.ok(!html.includes('map-list-link'));
});

test('sections.dining 關閉時不渲染三餐區塊與捷徑', () => {
  const trip = makeTrip();
  const html = ctxFor(trip).dayHTML(trip.DAYS[0]);
  assert.ok(!html.includes('class="meals"'));
  assert.ok(!html.includes('meal-jump'));
});

test('money 依 CONFIG.party 與 currency 計算', () => {
  const trip = makeTrip();
  const ctx = ctxFor(trip);
  assert.equal(ctx.money([800, 1500]), '每人約 ¥800–1,500／2 人約 ¥1,600–3,000');
  trip.config.party = 5;
  trip.config.currency = 'NT$';
  assert.equal(ctxFor(trip).money([100, 200]), '每人約 NT$100–200／5 人約 NT$500–1,000');
});

test('leg 依 mode 決定圖示與導航模式，不再靠字串比對', () => {
  const trip = makeTrip();
  const ctx = ctxFor(trip);
  const walk = ctx.legHTML({ mode: 'walk', dist: '850 公尺', time: '12 分' }, 'hubA', 'sightA');
  assert.ok(walk.includes('i-walk') && walk.includes('travelmode=walking'));
  const transit = ctx.legHTML({ mode: 'transit', time: '25 分', via: 'JR 線', fare: '¥420' }, 'hubA', 'sightA');
  assert.ok(transit.includes('JR 線') && transit.includes('¥420'));
  const drive = ctx.legHTML(trip.DAYS[0].stops[1].leg, 'hubA', 'stayA');
  assert.ok(drive.includes('i-car') && drive.includes('20 公里'));
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test tests/render.test.js`
Expected: FAIL，多條：引擎含「仙台」等字眼、`money is not a function`、總覽仍寫「七天主軸」

- [ ] **Step 3: 在 `src/util.js` 加 `money`**

```js
const money = (range) => {
  const c = CONFIG.currency, n = CONFIG.party;
  const fmt = (v) => c + v.toLocaleString('en-US');
  return '每人約 ' + fmt(range[0]) + '–' + range[1].toLocaleString('en-US')
    + '／' + n + ' 人約 ' + fmt(range[0] * n) + '–' + (range[1] * n).toLocaleString('en-US');
};
```

- [ ] **Step 4: 改寫 `legHTML`**

```js
const MODE_ICON = { drive:'i-car', transit:'i-train', walk:'i-walk', taxi:'i-car', ferry:'i-ship' };
const MODE_NAME = { drive:'地圖車程', transit:'乘車時間', walk:'步行時間', taxi:'車程', ferry:'航行時間' };
function legHTML(leg, fromKey, toKey) {
  const url = (fromKey && toKey && PLACES[fromKey] && PLACES[toKey] && fromKey !== toKey)
    ? routeUrl(PLACES[fromKey], PLACES[toKey], leg.mode) : leg.url;
  return '<div class="leg">' + ico(MODE_ICON[leg.mode] || 'i-car')
    + (leg.dist ? '<b>' + esc(leg.dist) + '</b>' : '')
    + '<span><span class="k">' + MODE_NAME[leg.mode] + '</span> <b>' + esc(leg.time) + '</b></span>'
    + (leg.buffer ? '<span><span class="k">建議預留</span> <b>' + esc(leg.buffer) + '</b></span>' : '')
    + (leg.fare ? '<span><span class="k">車資</span> <b>' + esc(leg.fare) + '</b></span>' : '')
    + '<span class="road">' + esc(leg.via || '')
    + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">Google Maps 路線' + ico('i-ext') + '</a>' : '')
    + '</span></div>';
}
```

`i-train` 與 `i-ship` 兩個 symbol 加進 `src/index.html` 的 sprite：

```html
<symbol id="i-train" viewBox="0 0 24 24"><rect x="5.5" y="4" width="13" height="12" rx="2.5"/><path d="M5.5 10.5h13M8.5 19.5l-1.5 1.5M15.5 19.5l1.5 1.5M9 13.3h.01M15 13.3h.01M8.5 16h7"/></symbol>
<symbol id="i-ship" viewBox="0 0 24 24"><path d="M4 14.5 12 12l8 2.5-1.6 5H5.6Z"/><path d="M6.5 12V7.5h11V12M12 4v3.5"/></symbol>
```

- [ ] **Step 5: 新增 `extraHTML`，讓 `extra.js` 插槽真的被渲染**

```js
// trips/<slug>/extra.js 的自訂區塊。html 是行程擁有者自己的內容，原樣插入。
function extraHTML(where, dayId) {
  return (EXTRA.sections || [])
    .filter((s) => s.where === where && (where !== 'day' || s.day === dayId))
    .map((s) => '<section class="extra" id="extra-' + esc(s.id) + '">'
      + (s.title ? '<h3>' + esc(s.title) + '</h3>' : '') + s.html + '</section>')
    .join('');
}
```

`dayHTML` 結尾加 `extraHTML('day', day.id)`，`overviewHTML` 結尾（頁尾之前）加 `extraHTML('overview')`。對應測試加進 `tests/render.test.js`：

```js
test('extra.js 的自訂區塊會被渲染到指定位置', () => {
  const trip = makeTrip();
  trip.EXTRA = { sections: [
    { id: 'packing', title: '打包清單', where: 'overview', html: '<ul><li>雨具</li></ul>' },
    { id: 'parkNote', title: '停車提醒', where: 'day', day: 2, html: '<p>先繳費再上車</p>' },
  ] };
  const ctx = ctxFor(trip);
  assert.ok(ctx.overviewHTML().includes('打包清單'));
  assert.ok(!ctx.dayHTML(trip.DAYS[0]).includes('停車提醒'));
  assert.ok(ctx.dayHTML(trip.DAYS[1]).includes('停車提醒'));
});
```

- [ ] **Step 6: 改寫 `dayHTML`／`mealsHTML` 的區塊開關**

- `dayHTML`：`day.mapList && CONFIG.sections.mapLists` 才輸出 `map-list-link` 與 `map-list-note`；`CONFIG.sections.dining && day.meals.length` 才輸出 `meal-jump` 與 `mealsHTML(day)`。
- `mealsHTML`：每人預算一律走 `money(venue.budget)`；`meal.budget` 存在時優先用它；`meal.cooking` 那段的金額改讀 `DINING.cooking.total`（缺就不輸出那行）；固定文案裡的「五人」改成 `CONFIG.party + ' 人'`。

- [ ] **Step 7: 改寫 `overviewHTML`**

各區塊改為資料驅動，缺資料就整段不輸出：

| 區塊 | 資料來源 | 缺席時 |
|---|---|---|
| 餐食與訂位 | `OVERVIEW.dining.{hint, notes[], chips[]}` | 不輸出 |
| 住宿 | `STAYS` + `OVERVIEW.stays.{title, hint, arrive, depart}` | `title` 缺則用 `${總晚數} 個晚上，${STAYS.length} 個落腳處`；`arrive`／`depart` 缺則用 `Day 1 ${DAYS[0].date}` 與 `Day N ${最後一天.date}` |
| 每日主軸 | `DAYS` | 標題固定 `${DAYS.length} 天主軸` |
| 加點建議 | `ADDONS` + `OVERVIEW.addonsHint` | `ADDONS` 為空則不輸出 |
| 行前清單 | `CHECKLIST` + `CONFIG.sections.checklist` | 關閉或為空則不輸出 |
| 頁尾 | `OVERVIEW.foot[]` | 不輸出 |

住宿色條與列表的顏色改成 `DAYS.find((d) => d.id === s.day).color`，取代原本寫死的 `DAYS[i === 0 ? 0 : (i === 1 ? 3 : 4)]`。最後一天的過夜欄仍標「返程」。

- [ ] **Step 8: 改寫 `detailBodyHTML`**

- `p.jp` 改 `p.local`。
- 查閱日期的兩句話改讀 `DINING.checked` 與 `OVERVIEW.checked`，缺就不輸出該句。
- 「僅供家人旅行參考」改為中性的「照片來源標於各張下方」。
- `p.parking` 存在時，在「實用資訊」之後插入停車區塊：名稱、費用、`note`，以及一個導向停車場座標的 Google Maps 連結。

- [ ] **Step 9: 執行測試確認通過**

Run: `node --test tests/render.test.js`
Expected: PASS，11 個測試全過

- [ ] **Step 10: 刪掉 legacy 與 parity 測試**

```bash
git rm src/legacy-template.html tests/render-parity.test.js
```

- [ ] **Step 11: 全部測試再跑一次**

Run: `npm test`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add src tests/render.test.js
git commit -m "feat: render 改為 config 驅動，移除行程專屬內容

leg 依 mode 決定圖示與導航模式；住宿顏色取自 STAYS.day；
總覽各區塊改由 OVERVIEW 與 sections 決定是否渲染。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `trips/_example/` 去識別化範例行程

三天兩夜的自駕＋電車混合行程，作為新行程的參考樣本與 `npm test` 的真實資料。內容取材自公開景點（真實官網連結），**住宿為虛構名稱**，不含航班、電話、訂單或任何個人資訊。

**Files:**
- Create: `trips/_example/trip.config.json`、`data.js`、`details.js`、`dining.js`、`map-lists.js`、`photos.json`、`basemap.json`、`theme.css`、`extra.js`、`docs/status.md`

**Interfaces:**
- Consumes: Task 3 的 `loadTrip`
- Produces: 一個能通過 `node scripts/check.js _example` 的行程資料夾。`basemap.json` 是手寫的最小佔位檔，格式與 Task 2 階段的產物相同：`{ meta: { bbox, dem: 'placeholder', generatedAt }, sea: [], islands: [], contour: {}, motorway: [], trunk: [], primary: [], river: [], lake: [], border: [], towns: [] }`，第 2 階段會被真正產生的內容取代。

- [ ] **Step 1: 寫 `trip.config.json`**

```json
{
  "schemaVersion": 1,
  "title": "範例行程手帳",
  "heading": "山寺・銀山・松島",
  "subtitle": "三天兩夜　自駕＋電車",
  "description": "travel-planner 的去識別化範例行程：三天兩夜，含地形圖、逐段交通與行前清單。",
  "lang": "zh-Hant",
  "dates": { "start": "2026-10-11", "end": "2026-10-13" },
  "region": { "country": "JP", "bbox": [139.95, 37.85, 141.45, 39.0] },
  "transport": ["drive", "transit"],
  "party": 2,
  "currency": "¥",
  "sections": { "overview": true, "dining": true, "mapLists": false, "checklist": true },
  "theme": { "accent": "#B0552D", "favicon": "🗾" },
  "basemap": { "dem": "auto", "detail": "normal", "contourLevels": null },
  "deploy": { "name": "example-trip", "target": "workers" }
}
```

- [ ] **Step 2: 寫 `data.js`**

`PLACES` 六筆：`stationA`（`cat: 'hub'`，用真實車站座標）、`yamadera`、`ginzan`、`matsushima`（`cat: 'sight'`）、`innA`、`innB`（`cat: 'stay'`，名稱寫「範例民宿 A／B」，座標用街區層級並標 `approximate: true`）。`yamadera` 與 `ginzan` 各帶一組 `parking`，示範停車欄位。

`DAYS` 三天，每天至少兩個 stop；Day 1 的移動用 `mode: 'drive'`（含 `dist`／`time`／`buffer`／`via`），Day 2 用 `mode: 'transit'`（含 `time`／`via`／`fare`），Day 3 有一段 `mode: 'walk'`。每天都有 `alts` 與 `cautions` 各一到兩筆。

`OVERVIEW` 示範所有欄位都填的樣子：

```js
const OVERVIEW = {
  checked: '2026/09/18',
  dining: { hint: '餐廳尚未預約；每天的選擇與備案見詳細行程。', notes: ['熱門店家出發前一週再確認座位。'], chips: [{ day: 2, label: '查看第二天用餐' }] },
  stays: { title: '兩個晚上，兩個落腳處', hint: '色塊寬度就是住幾晚。', arrive: 'Day 1 抵達', depart: 'Day 3 返程' },
  addonsHint: '時間不夠就先砍加點，不要砍主軸。',
  foot: [
    '距離與交通時間為規劃查核當下的結果，不是旅遊當日的路況預報，也不含休息與找車位。',
    '地圖為 OpenStreetMap 圖資（© OpenStreetMap 貢獻者，ODbL）與公開高程資料繪製；點與點之間的虛線只表示造訪順序。',
    '這是範例資料，出發前請以官方網站為準。',
  ],
};
```

`STAYS` 兩筆，各帶 `day: 1` 與 `day: 2`。`ADDONS` 兩筆、`CHECKLIST` 三條，全部用中性文字。檔尾 `module.exports = { PLACES, DAYS, OVERVIEW_ROUTE, ADDONS, CHECKLIST, STAYS, OVERVIEW };`

- [ ] **Step 3: 寫 `details.js`**

除 `stationA`（hub）外每個地點一筆：`summary` 至少 40 字、`highlights` 至少兩點、`stay`、`info`（含一列「停車」示範）、`refs` 指向真實官方網站。

- [ ] **Step 4: 寫 `dining.js`**

`places` 兩筆（一間餐廳 `cat: 'food'`、一間超市 `cat: 'shop'`，名稱用「範例食堂」「範例超市」），`venues` 對應兩筆含 `menu`／`booking`／`budget`／`hours`／`route`，`days` 三天各兩餐（午餐、晚餐），`checklist` 一條。這些地點也要在 `details.js` 有對應說明（`dining: true`）。

- [ ] **Step 5: 寫其餘檔案**

```bash
echo '{}' > trips/_example/photos.json
printf '/* 覆寫引擎 CSS 變數就能換整套配色。範例保持空白。 */\n' > trips/_example/theme.css
printf '// 自訂區塊插槽。範例沒有額外區塊。\nmodule.exports = { sections: [] };\n' > trips/_example/extra.js
printf '// 這趟行程沒有建立 Google Maps 清單（trip.config 的 sections.mapLists 為 false）。\nmodule.exports = {};\n' > trips/_example/map-lists.js
```

`basemap.json` 依 Interfaces 的形狀手寫，`meta.bbox` 必須與 config 的 `region.bbox` 逐值相同。

`docs/status.md`：

```markdown
# 範例行程進度

- brief：不適用（這是模板附的範例）
- plan：不適用
- research：places ✓ routes ✓ parking ✓ dining ✓
- basemap：佔位檔，待 `npm run basemap -- _example` 產生
- photos：無
- shipped：未部署

範例資料僅供參考，住宿為虛構名稱，出發前請以官方網站為準。
```

- [ ] **Step 6: 執行 check 確認通過**

Run: `node scripts/check.js _example`
Expected: `✓ _example：8 個地點、3 天、…`（地點數依實際筆數）

- [ ] **Step 7: 寫測試 `tests/example-trip.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { loadTrip } = require('../scripts/lib/load-trip.js');

test('_example 通過驗證', () => {
  const t = loadTrip('_example');
  assert.ok(t.DAYS.length >= 3);
});

test('_example 示範三種交通方式與停車欄位', () => {
  const t = loadTrip('_example');
  const modes = new Set(t.DAYS.flatMap((d) => d.stops.filter((s) => s.leg).map((s) => s.leg.mode)));
  assert.ok(modes.has('drive') && modes.has('transit') && modes.has('walk'));
  assert.ok(Object.values(t.PLACES).some((p) => p.parking));
});

test('_example 不含個人或訂位資訊', () => {
  const dir = path.join(ROOT, 'trips/_example');
  const text = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile())
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  assert.ok(!/\d{2,4}-\d{3,4}-\d{4}/.test(text), '不該出現電話號碼');
  for (const word of ['確認碼', '訂單', '密碼', '護照', '身分證']) {
    assert.ok(!text.includes(word), `不該出現：${word}`);
  }
});
```

- [ ] **Step 8: 執行測試確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add trips/_example tests/example-trip.test.js
git commit -m "feat: 去識別化範例行程 _example

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: build 指令

**Files:**
- Create: `scripts/build.js`、`public/_headers`、`public/robots.txt`、`tests/build.test.js`

**Interfaces:**
- Consumes: `loadTrip`、`resolveSlug`、`distDir`
- Produces: `build.js` 匯出 `buildTrip(slug: string): { html: string, outDir: string, bytes: number, photos: number }` 並在直接執行時當 CLI 用。產物：`dist/<slug>/site/index.html`、`dist/<slug>/site/img/*`、`dist/<slug>/site/{_headers,robots.txt}`、`dist/<slug>/wrangler.json`。

- [ ] **Step 1: 建立 `public/` 的兩個靜態檔**

`public/_headers`：

```
/*
  X-Robots-Tag: noindex, nofollow, noarchive, noimageindex
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff

# 照片一週內不回源驗證；換照片時改檔名即可立即生效
/img/*
  Cache-Control: public, max-age=604800
```

`public/robots.txt`：

```
# 這份行程不希望被搜尋引擎收錄；有網址的人仍可直接開啟。
User-agent: *
Disallow: /
```

- [ ] **Step 2: 寫失敗的測試 `tests/build.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildTrip } = require('../scripts/build.js');
const { loadTrip } = require('../scripts/lib/load-trip.js');

const built = buildTrip('_example');
const read = (p) => fs.readFileSync(path.join(built.outDir, p), 'utf8');

test('產出單一 HTML，佔位符都被取代', () => {
  const html = read('site/index.html');
  for (const ph of ['/*__CONFIG__*/', '/*__BASEMAP__*/', '/*__PHOTOS__*/', '/*__DATA__*/', '/*__TITLE__*/']) {
    assert.ok(!html.includes(ph), `佔位符未取代：${ph}`);
  }
  assert.ok(!html.includes('<script src='), 'JS 必須內嵌');
  assert.ok(!html.includes('<link rel="stylesheet" href="styles.css"'), 'CSS 必須內嵌');
});

test('標題與描述取自 trip.config', () => {
  const html = read('site/index.html');
  const cfg = loadTrip('_example').config;
  assert.ok(html.includes(`<title>${cfg.title}</title>`));
  assert.ok(html.includes(cfg.description));
  assert.ok(html.includes('<html lang="zh-Hant">'));
});

test('靜態檔一起複製到 site/', () => {
  assert.ok(read('site/robots.txt').includes('Disallow: /'));
  assert.ok(read('site/_headers').includes('X-Robots-Tag'));
});

test('wrangler.json 放在 site 外層並指向 ./site', () => {
  const w = JSON.parse(read('wrangler.json'));
  assert.equal(w.name, 'example-trip');
  assert.equal(w.assets.directory, './site');
  assert.match(w.compatibility_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!fs.existsSync(path.join(built.outDir, 'site', 'wrangler.json')), 'wrangler.json 不能被當靜態檔發布');
});

test('trips/<slug>/docs 不進產物', () => {
  const html = read('site/index.html');
  assert.ok(!html.includes('範例行程進度'));
});

test('theme.css 接在引擎 CSS 之後', () => {
  const html = read('site/index.html');
  assert.ok(html.indexOf('覆寫引擎 CSS 變數') > html.indexOf(':root{'));
});
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `node --test tests/build.test.js`
Expected: FAIL，`Cannot find module '../scripts/build.js'`

- [ ] **Step 4: 實作 `scripts/build.js`**

流程：`loadTrip(slug)` → 讀 `src/index.html`、`styles.css`、`util.js`、`render.js`、`app.js` → 取代佔位符 → 把 `<link rel="stylesheet">` 換成 `<style>` 內容 + `theme.css`、把三個 `<script src>` 換成 `<script>` 內容 → 補上完整文件外殼（`<!doctype html>`、`meta viewport`、`meta robots`、`meta description`、`color-scheme`、`theme-color`、emoji favicon `data:` URI）→ 寫檔 → 複製照片與 `public/` → 產 `wrangler.json`。

要點：
- `/*__DATA__*/` 換成 `const PLACES = …;` 等十個 `const` 宣告（`PLACES`、`DAYS`、`OVERVIEW_ROUTE`、`ADDONS`、`CHECKLIST`、`STAYS`、`OVERVIEW`、`DETAILS`、`DINING`、`MAP_LISTS`），值用 `JSON.stringify`。`EXTRA` 由 `trips/<slug>/extra.js` 來，缺檔就是 `{ sections: [] }`，同樣以 `const EXTRA = …;` 內嵌（`render.js` 的 `extraHTML` 會用到）。
- `JSON.stringify` 的結果要把 `</script` 轉義成 `<\\/script`，避免資料內的連結或文字提前關掉 script 區塊。
- `PHOTOS` 只收 `trips/<slug>/photos/` 裡實際存在的檔案，格式 `{ src: 'img/<key>-<n>.jpg', credit, page, commons }`。
- 每次 build 先 `fs.rmSync(outDir, { recursive: true, force: true })`。
- `compatibility_date` 取 build 當天 `new Date().toISOString().slice(0, 10)`。
- 結束時印出 `✓ dist/<slug>/site/index.html <大小> KB，照片 N 張 M MB，靜態檔 K 個`。
- 檔尾：`if (require.main === module) { … CLI … }`，讓測試可以直接 `require`。

- [ ] **Step 5: 執行測試確認通過**

Run: `node --test tests/build.test.js`
Expected: PASS，6 個測試全過

- [ ] **Step 6: 用瀏覽器實際看一次**

Run: `node scripts/build.js _example && node -e "const {execSync}=require('child_process');console.log(require('fs').statSync('dist/_example/site/index.html').size)"`
接著用內建瀏覽器開啟 `dist/_example/site/index.html`，確認：分頁切換、地圖（此時只有點與連線、沒有底圖線條）、燈箱、手機寬度都正常，主控台沒有錯誤。

- [ ] **Step 7: Commit**

```bash
git add scripts/build.js public tests/build.test.js
git commit -m "feat: build 指令，內嵌成單一 HTML 並產 wrangler 設定

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: preview、ship、new-trip 三個 CLI

**Files:**
- Create: `scripts/preview.js`、`scripts/ship.js`、`scripts/new-trip.js`、`scripts/templates/`（骨架檔）、`tests/new-trip.test.js`

**Interfaces:**
- Consumes: `buildTrip`、`resolveSlug`、`distDir`、`tripDir`
- Produces: `new-trip.js` 匯出 `newTrip(slug: string): string`（回傳建立的資料夾路徑），已存在時 `throw`。

- [ ] **Step 1: 實作 `scripts/preview.js`**

```js
#!/usr/bin/env node
// build 後起一個最小靜態伺服器：node scripts/preview.js <slug>
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { resolveSlug } = require('./lib/paths.js');
const { buildTrip } = require('./build.js');

const TYPES = { '.html':'text/html; charset=utf-8', '.jpg':'image/jpeg', '.png':'image/png', '.txt':'text/plain; charset=utf-8' };
const slug = resolveSlug(process.argv.slice(2));
const { outDir } = buildTrip(slug);
const root = path.join(outDir, 'site');

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('找不到檔案');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(4173, '127.0.0.1', () => {
  console.log(`預覽：http://localhost:4173　（Ctrl+C 結束）`);
});
```

- [ ] **Step 2: 實作 `scripts/ship.js`**

```js
#!/usr/bin/env node
// build 後部署：node scripts/ship.js <slug>
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveSlug } = require('./lib/paths.js');
const { loadTrip } = require('./lib/load-trip.js');
const { buildTrip } = require('./build.js');

const slug = resolveSlug(process.argv.slice(2));
const { config } = loadTrip(slug);
const { outDir } = buildTrip(slug);
const target = (config.deploy && config.deploy.target) || 'workers';
const args = target === 'pages'
  ? ['pages', 'deploy', path.join(outDir, 'site'), '--project-name', config.deploy.name]
  : ['deploy', '--config', path.join(outDir, 'wrangler.json')];

console.log(`部署 ${slug} → ${target}：wrangler ${args.join(' ')}`);
const r = spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error('✗ 部署失敗。第一次部署要先跑 npx wrangler login；新帳號會被問要不要註冊 workers.dev 子網域，選是。');
  process.exit(r.status || 1);
}
```

- [ ] **Step 3: 建立 `scripts/templates/` 骨架**

六個檔案，每個都只有說明註解與一筆範例，並在開頭寫明「改這個檔之前先讀 `docs/schema/<name>.md`」：`trip.config.json`（`schemaVersion: 1`、其餘欄位留待填的預設值）、`data.js`、`details.js`、`dining.js`、`map-lists.js`、`photos.json`。另加 `theme.css`、`extra.js`、`docs/status.md` 三個空樣板。

- [ ] **Step 4: 寫失敗的測試 `tests/new-trip.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { newTrip } = require('../scripts/new-trip.js');
const { ROOT } = require('../scripts/lib/paths.js');

const SLUG = '_newtest';
test.afterEach(() => fs.rmSync(path.join(ROOT, 'trips', SLUG), { recursive: true, force: true }));

test('建立骨架並帶入 slug', () => {
  const dir = newTrip(SLUG);
  for (const f of ['trip.config.json', 'data.js', 'details.js', 'dining.js', 'map-lists.js', 'photos.json', 'theme.css', 'extra.js', 'docs/status.md']) {
    assert.ok(fs.existsSync(path.join(dir, f)), `缺 ${f}`);
  }
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'trip.config.json'), 'utf8'));
  assert.equal(cfg.schemaVersion, 1);
  assert.equal(cfg.deploy.name, SLUG);
});

test('已存在時拒絕覆蓋', () => {
  newTrip(SLUG);
  assert.throws(() => newTrip(SLUG), /已經存在/);
});
```

- [ ] **Step 5: 執行測試確認失敗**

Run: `node --test tests/new-trip.test.js`
Expected: FAIL，`Cannot find module '../scripts/new-trip.js'`

- [ ] **Step 6: 實作 `scripts/new-trip.js`**

複製 `scripts/templates/` 到 `trips/<slug>/`，把骨架裡的 `__SLUG__` 換成實際 slug；資料夾已存在時 `throw new Error('trips/<slug> 已經存在')`。結束時印出接下來要做什麼（填 `trip.config.json`、跑 `npm run check -- <slug>`）。

- [ ] **Step 7: 執行測試確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: 手動驗證 preview**

Run: `node scripts/preview.js _example`
用內建瀏覽器開 `http://localhost:4173`，確認頁面正常後 Ctrl+C。

- [ ] **Step 9: Commit**

```bash
git add scripts/preview.js scripts/ship.js scripts/new-trip.js scripts/templates tests/new-trip.test.js
git commit -m "feat: preview、ship 與 new-trip 指令

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: 舊格式資料遷移

把 SENTAI2026 那種 schemaVersion 0 的資料升到 1。測試只用合成的舊格式樣本，不放任何真實行程資料。

**Files:**
- Create: `scripts/migrate.js`、`scripts/migrate/0-to-1.js`、`tests/fixtures/legacy-trip/`、`tests/migrate.test.js`

**Interfaces:**
- Consumes: `tripDir`
- Produces: `scripts/migrate/0-to-1.js` 匯出 `migrate(dir: string): string[]`，就地改寫 `dir` 底下的資料檔並回傳變更說明陣列。`scripts/migrate.js` 依 `trip.config.json` 的 `schemaVersion` 依序套用 `<n>-to-<n+1>.js` 直到等於 `SCHEMA_VERSION`。

- [ ] **Step 1: 建立合成的舊格式樣本 `tests/fixtures/legacy-trip/`**

`data.js` 用 schemaVersion 0 的寫法：地點有 `jp` 沒有 `local`、`leg` 是 `{ dist, drive, buffer, road, url }` 沒有 `mode`、檔尾有 `if (typeof module !== 'undefined') module.exports = …`、尾端有「把 dining 併進 PLACES、把 meals 掛到 day」的接線程式。另附 `dining.js`、`details.js`、`map-lists.js`、`photos.json`，以及一個沒有 `schemaVersion` 的 `trip.config.json`。內容全為合成值。

- [ ] **Step 2: 寫失敗的測試 `tests/migrate.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { migrate } = require('../scripts/migrate/0-to-1.js');

function copyFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-migrate-'));
  fs.cpSync(path.join(__dirname, 'fixtures', 'legacy-trip'), dir, { recursive: true });
  return dir;
}

test('jp 改名為 local', () => {
  const dir = copyFixture();
  migrate(dir);
  const data = require(path.join(dir, 'data.js'));
  assert.ok(Object.values(data.PLACES).every((p) => !('jp' in p)));
  assert.ok(Object.values(data.PLACES).some((p) => p.local));
});

test('leg 補上 mode 並改名欄位', () => {
  const dir = copyFixture();
  migrate(dir);
  const data = require(path.join(dir, 'data.js'));
  const leg = data.DAYS.flatMap((d) => d.stops).find((s) => s.leg).leg;
  assert.equal(leg.mode, 'drive');
  assert.ok(leg.time && leg.via);
  assert.ok(!('drive' in leg) && !('road' in leg));
});

test('含「步行」字樣的舊 leg 被判為 walk', () => {
  const dir = copyFixture();
  migrate(dir);
  const data = require(path.join(dir, 'data.js'));
  assert.ok(data.DAYS.flatMap((d) => d.stops).some((s) => s.leg && s.leg.mode === 'walk'));
});

test('STAYS 補上 day', () => {
  const dir = copyFixture();
  migrate(dir);
  const data = require(path.join(dir, 'data.js'));
  assert.ok(data.STAYS.every((s) => typeof s.day === 'number'));
});

test('schemaVersion 升為 1', () => {
  const dir = copyFixture();
  migrate(dir);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'trip.config.json'), 'utf8')).schemaVersion, 1);
});

test('回傳的變更說明涵蓋每一項改動', () => {
  const dir = copyFixture();
  const notes = migrate(dir);
  assert.ok(notes.some((n) => n.includes('local')));
  assert.ok(notes.some((n) => n.includes('mode')));
});
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `node --test tests/migrate.test.js`
Expected: FAIL，`Cannot find module '../scripts/migrate/0-to-1.js'`

- [ ] **Step 4: 實作 `scripts/migrate/0-to-1.js`**

以 `require` 載入舊 `data.js` 取得物件，轉換後用 `JSON.stringify` 寫回 `module.exports = …`（註解會消失，因此回傳的變更說明要提醒作者：原檔已備份成 `data.js.bak`，來源註解請自行搬回）。轉換規則：

| 舊 | 新 |
|---|---|
| `p.jp` | `p.local` |
| `leg.drive` | `leg.time` |
| `leg.road` | `leg.via` |
| 無 `leg.mode` | `/步行/.test(舊 dist + 舊 drive)` 為真 → `'walk'`，否則 `'drive'` |
| `STAYS[i]` 無 `day` | 依 `range` 開頭日期比對 `DAYS[].date` 前五字，配不到就用索引 `i + 1` 並在說明裡標示需人工確認 |
| 無 `OVERVIEW` | 建立 `{ checked: '', foot: [] }` 並提醒把原本寫死在 template 的文字搬進來 |
| `trip.config.json` 無 `schemaVersion` | 補 `schemaVersion: 1`、`party`、`currency`、`sections`、`deploy` 等必填欄位的預設值 |

- [ ] **Step 5: 實作 `scripts/migrate.js`**

讀 `trip.config.json` 的 `schemaVersion`（缺就當 0），迴圈套用 `scripts/migrate/<n>-to-<n+1>.js` 直到等於 `SCHEMA_VERSION`，把每一步的變更說明印出來，最後提示跑 `npm run check -- <slug>`。

- [ ] **Step 6: 執行測試確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate.js scripts/migrate tests/migrate.test.js tests/fixtures/legacy-trip
git commit -m "feat: schemaVersion 0 → 1 資料遷移

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: schema 文件、README 與 CHANGELOG

**Files:**
- Create: `docs/schema/{trip-config,data,details,dining,map-lists,photos}.md`、`README.md`、`CHANGELOG.md`、`tests/docs.test.js`

**Interfaces:**
- Consumes: `scripts/lib/schema.js`
- Produces: 六份欄位文件；`tests/docs.test.js` 確保文件與驗證規則不脫節。

- [ ] **Step 1: 寫 `docs/schema/` 六份文件**

每份固定四節：**這個檔負責什麼** → **欄位表**（欄位／必填／型別／說明／範例）→ **完整範例**（可直接複製的一筆）→ **常見錯誤**（對應 `schema.js` 會吐出的訊息）。`data.md` 要涵蓋 `PLACES`（含 `parking`）、`DAYS`（含 `stops`、`leg` 五種 `mode`、`alts`、`cautions`）、`OVERVIEW_ROUTE`、`ADDONS`、`CHECKLIST`、`STAYS`、`OVERVIEW`。

- [ ] **Step 2: 寫測試 `tests/docs.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { MODES, KINDS, CATS } = require('../scripts/lib/schema.js');

const docs = fs.readdirSync(path.join(ROOT, 'docs/schema'))
  .map((f) => fs.readFileSync(path.join(ROOT, 'docs/schema', f), 'utf8')).join('\n');

test('六份 schema 文件都在', () => {
  const files = fs.readdirSync(path.join(ROOT, 'docs/schema')).sort();
  assert.deepEqual(files, ['data.md', 'details.md', 'dining.md', 'map-lists.md', 'photos.md', 'trip-config.md']);
});

test('每個合法的 mode / kind / cat 都有被文件提到', () => {
  for (const v of [...MODES, ...KINDS, ...CATS]) {
    assert.ok(docs.includes(`\`${v}\``), `docs/schema 沒有說明 ${v}`);
  }
});
```

- [ ] **Step 3: 執行測試確認通過**

Run: `node --test tests/docs.test.js`
Expected: PASS（若失敗，補上文件缺的那個值的說明）

- [ ] **Step 4: 寫 `README.md`**

給「拿到這個 repo 的人」看，不是給 agent 看（agent 讀 `AGENTS.md`，第 4 階段才會建立）。內容：這是什麼、需要什麼（Node 20+、GitHub 帳號、Cloudflare 免費帳號）、五個指令的用途、目錄結構的引擎／內容邊界、`trips/_example` 怎麼看、以及「請把想做的事直接告訴你的 coding agent」這個主要用法。標明目前為第 1 階段，底圖與照片指令尚未實作。

- [ ] **Step 5: 寫 `CHANGELOG.md`**

```markdown
# 變更紀錄

## 0.1.0（2026-09-18）

- 引擎骨架：`trips/<slug>/` 內容與引擎分離，指令為 check／build／preview／ship／new／migrate。
- 資料 schema v1：`leg.mode` 支援自駕、大眾運輸、步行、計程車、渡輪；地點可帶 `parking`。
- 版面改由 `trip.config.json` 與 `OVERVIEW` 驅動，天數與住宿數不再寫死。
- 附去識別化範例行程 `trips/_example`。
- 資料需要 migrate：是（schemaVersion 0 → 1，跑 `npm run migrate -- <slug>`）。

尚未實作：`npm run basemap`、`npm run photos`，以及 agent skills。
```

- [ ] **Step 6: 全部測試最後跑一次並確認 `_example` 能走完全程**

Run: `npm test && node scripts/check.js _example && node scripts/build.js _example`
Expected: 全部 PASS 且 build 成功

- [ ] **Step 7: Commit 並打 tag**

```bash
git add docs/schema README.md CHANGELOG.md tests/docs.test.js
git commit -m "docs: schema 文件、README 與 CHANGELOG

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git tag v0.1.0
```

---

## 完成後的狀態

- `npm test` 全綠，涵蓋 slug 解析、schema 驗證、行程載入、render 泛化、build 產物、new-trip、migrate、schema 文件一致性。
- `trips/_example` 可 check、build、preview，頁面在瀏覽器裡可操作。
- 引擎原始碼不含任何特定行程的專有名詞（由測試把關）。

## 下一階段的接續點

- **第 2 階段（底圖）**：`trips/_example/basemap.json` 目前是佔位檔，`npm run basemap` 尚未存在；`schema.js` 的 bbox 比對規則已就緒。
- **第 3 階段（照片與 UI）**：`npm run photos` 尚未存在，`trips/_example/photos.json` 為空；`leg.mode` 已進資料與 `legHTML`，但地圖動線仍一律同一種線型，`parking` 已在燈箱顯示、尚未在每日頁尾彙整。
- **第 4 階段（skills）**：`AGENTS.md`、`.ai/`、issue 模板尚未建立。
