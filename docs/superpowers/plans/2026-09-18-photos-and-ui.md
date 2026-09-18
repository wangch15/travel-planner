# 照片與 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補上第 1、2 階段刻意留下的三個缺口——`npm run photos` 能把 Commons 與官網照片抓進行程資料夾；地圖上的每一段動線依 `leg.mode` 用不同線型畫；有 `parking` 的停留點在每日頁尾自動彙整成一張表。做完之後 `_example` 在畫面上就看得到照片、看得出哪一段是坐電車、也看得到當天要在哪裡停車。

**Architecture:** `scripts/photos.js` 是與 `build.js` 同層的 CLI，純 Node `fetch` + `fs`，把 `photos.json` 的每一筆抓成 `trips/<slug>/photos/<key>-<n>.jpg`；下載函式接受注入的 `fetchImpl`，所以測試完全不連網。地圖線型改在 `src/app.js` 的 `renderMap`：原本一條 path 串完所有停留點，改成逐段畫、每段依終點 stop 的 `leg.mode` 取線型。停車彙整是 `src/render.js` 新增的純函式 `dayParkingHTML(day)`，接在每天的頁尾。

**Tech Stack:** Node 20+、`node:test`、Node 內建 `fetch`。不新增任何套件。

**Spec:** `docs/superpowers/specs/2026-09-18-travel-planner-template-design.md`（§3 資料模型、§5 指令表的 `photos`）

**本計畫範圍：** spec §10 實作順序的第 3 階段。結束時 `npm run photos -- _example` 可用、`trips/_example/photos/` 有三張真實的 CC 授權照片並進 git、地圖線型與停車彙整都在畫面上看得到。**不含** agent skills 與 `.ai/`（第 4 階段）。

## Global Constraints

- Node.js ≥ 20；套件管理器為 **npm**。**不得新增任何相依套件**（第 2 階段加的 `pngjs` 是目前唯一的執行期相依）。
- 測試一律 `node --test` + `node:assert/strict`，**不得連網**：下載一律以注入的 `fetchImpl` 測試。
- `scripts/` 維持 CommonJS，`tools/basemap/` 維持 ESM，兩邊不互相 import。
- **照片只收 CC／Public domain，或官網照片並標註來源。授權不明就不要收**——`scripts/lib/schema.js` 已有這條驗證，不得放寬。
- 引擎除 `new-trip`、`migrate`、`basemap` 外不得寫入 `trips/`；**本階段的 `photos` 是第四個例外**，它只寫 `trips/<slug>/photos/`。
- 所有使用者可見字串一律繁體中文；引擎不得內含特定行程的專有名詞（`tests/render.test.js` 的守門測試涵蓋 `src/`）。
- 檔案上限 800 行，函式上限 50 行。
- commit 訊息格式 `<type>: <描述>`，結尾加 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`。
- 工作目錄一律 `/Users/wangch/GitHub/travel-planner`。**不得修改 `/Users/wangch/GitHub/SENTAI2026` 的任何檔案。**
- 要在瀏覽器看版面時用 **ego-browser（ego lite）**，不要用其他瀏覽器工具。

## 現況與缺口

第 1、2 階段已經完成、**本階段不要重做**的部分：

- `legHTML` 已經依 `leg.mode` 選圖示（`i-car`／`i-train`／`i-walk`／`i-ship`）與導航 travelmode，`i-train`、`i-ship` 兩個 symbol 已在 `src/index.html` 的 sprite 裡。
- `detailBodyHTML` 已經有**燈箱的**停車區塊（`parkingHTML(p)`，顯示停車場名稱、費用、注意、導航連結）。
- `scripts/build.js` 的 `collectPhotos()` 已經會把 `trips/<slug>/photos/` 裡**實際存在**的檔案收進 `PHOTOS`，並複製到 `dist/<slug>/site/img/`；`src/app.js` 的 `openDetail` 已經會渲染照片輪播與 credit。
- `schema.js` 已經驗證照片授權與 credit。

本階段要補的三個缺口：

| 缺口 | 位置 |
|---|---|
| `npm run photos` 不存在，`photos.json` 是空的、`photos/` 資料夾不存在 | `scripts/photos.js`、`trips/_example/` |
| 地圖上所有動線都是同一種線型，看不出哪段是坐電車 | `src/app.js` 的 `renderMap` |
| `parking` 只在燈箱看得到，每日頁尾沒有彙整 | `src/render.js` 的 `dayHTML` |

## File Structure

| 檔案 | 責任 |
|---|---|
| `scripts/lib/fetch-file.js` | 下載單一檔案到磁碟，可注入 `fetchImpl`；判斷是不是圖片 |
| `scripts/photos.js` | CLI：讀 `photos.json`、組來源網址、只補缺的、`--force` 全抓 |
| `src/map-modes.js` | 地圖線型對照表 |
| `src/render.js` | 新增 `dayParkingHTML(day)`，`dayHTML` 末端呼叫 |
| `src/app.js` | `renderMap` 改為逐段畫線，線型依 `leg.mode` |
| `src/styles.css` | 停車彙整表的樣式 |
| `trips/_example/photos.json` | 三筆 Commons 來源 |
| `trips/_example/photos/*.jpg` | 三張實際照片，進 git |
| `tests/photos.test.js` | `fetch-file` 與 `photoJobs` 的單元測試 |
| `tests/map-modes.test.js` | 線型對照表的單元測試 |
| `tests/render-parking.test.js` | `dayParkingHTML` 的單元測試 |

---

### Task 1: 下載工具與 `npm run photos`

**Files:**
- Create: `scripts/lib/fetch-file.js`、`scripts/photos.js`、`tests/photos.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `scripts/lib/paths.js` 的 `tripDir`／`resolveSlug`
- Produces:
  - `fetch-file.js` 匯出 `IMAGE_TYPES: Set<string>`、`downloadTo(url: string, dest: string, opts?: { fetchImpl?, headers? }): Promise<{ bytes: number, type: string }>`。非 2xx 或 content-type 不是圖片時 `throw`，且**不留下半個檔案**。
  - `photos.js` 匯出 `commonsUrl(title: string): string`、`photoJobs(manifest: object, dir: string, opts?: { force?: boolean }): { key, index, file, url, label }[]`、`runPhotos(slug: string, opts?: { force?, fetchImpl?, log? }): Promise<{ ok: number, skipped: number, failed: { file, reason }[] }>`，並在直接執行時當 CLI 用。

- [x] **Step 1: 在 `package.json` 加 photos 指令**

在 `"basemap"` 那行下面加一行：

```json
    "photos": "node scripts/photos.js",
```

- [x] **Step 2: 寫失敗的測試 `tests/photos.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { downloadTo } = require('../scripts/lib/fetch-file.js');
const { commonsUrl, photoJobs } = require('../scripts/photos.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tp-photos-'));
const jpeg = (bytes = 32) => ({
  ok: true, status: 200,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'image/jpeg' : null) },
  arrayBuffer: async () => new Uint8Array(bytes).buffer,
});

test('commonsUrl 用 Special:FilePath 並指定寬度 1024', () => {
  const u = commonsUrl('View of Yamadera.jpg');
  assert.ok(u.startsWith('https://commons.wikimedia.org/wiki/Special:FilePath/'), u);
  assert.ok(u.includes('width=1024'), u);
  assert.ok(!u.includes(' '), '檔名裡的空白要編碼');
});

test('commonsUrl 正確編碼非 ASCII 檔名', () => {
  assert.ok(commonsUrl('宝珠山立石寺.jpg').includes('%E5%AE%9D'));
});

test('downloadTo 把回應寫成檔案', async () => {
  const dest = path.join(tmp(), 'a-1.jpg');
  const r = await downloadTo('https://example.com/a.jpg', dest, { fetchImpl: async () => jpeg(64) });
  assert.equal(r.bytes, 64);
  assert.equal(fs.statSync(dest).size, 64);
});

test('downloadTo 會建立缺少的資料夾', async () => {
  const dest = path.join(tmp(), 'photos', 'a-1.jpg');
  await downloadTo('https://example.com/a.jpg', dest, { fetchImpl: async () => jpeg() });
  assert.ok(fs.existsSync(dest));
});

test('downloadTo 對非 2xx 丟錯且不留下半個檔案', async () => {
  const dest = path.join(tmp(), 'a-1.jpg');
  await assert.rejects(
    () => downloadTo('https://example.com/a.jpg', dest, {
      fetchImpl: async () => ({ ok: false, status: 404, headers: { get: () => null } }),
    }),
    /404/,
  );
  assert.ok(!fs.existsSync(dest), '失敗時不該留下檔案');
});

test('downloadTo 拒絕不是圖片的回應', async () => {
  const dest = path.join(tmp(), 'a-1.jpg');
  await assert.rejects(
    () => downloadTo('https://example.com/a.html', dest, {
      fetchImpl: async () => ({
        ok: true, status: 200,
        headers: { get: () => 'text/html' },
        arrayBuffer: async () => new Uint8Array(8).buffer,
      }),
    }),
    /不是圖片|text\/html/,
  );
  assert.ok(!fs.existsSync(dest));
});

test('photoJobs 依 manifest 產生檔名與網址，index 從 1 開始', () => {
  const dir = tmp();
  const jobs = photoJobs({
    yamadera: [
      { title: 'A.jpg', artist: '甲', license: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:A.jpg' },
      { url: 'https://example.com/b.jpg', credit: '© 官網' },
    ],
  }, dir);
  assert.equal(jobs.length, 2);
  assert.equal(path.basename(jobs[0].file), 'yamadera-1.jpg');
  assert.equal(path.basename(jobs[1].file), 'yamadera-2.jpg');
  assert.ok(jobs[0].url.includes('Special:FilePath'));
  assert.equal(jobs[1].url, 'https://example.com/b.jpg');
});

test('photoJobs 預設只補缺的，--force 時全抓', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'photos', 'yamadera-1.jpg'), 'x');
  const manifest = {
    yamadera: [
      { title: 'A.jpg', license: 'CC0', page: 'https://example.com/A' },
      { url: 'https://example.com/b.jpg', credit: 'c' },
    ],
  };
  assert.equal(photoJobs(manifest, dir).length, 1, '已存在的要跳過');
  assert.equal(photoJobs(manifest, dir, { force: true }).length, 2, 'force 時不跳過');
});

test('photoJobs 對空 manifest 回傳空陣列', () => {
  assert.deepEqual(photoJobs({}, tmp()), []);
});
```

- [x] **Step 3: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，`Cannot find module '../scripts/lib/fetch-file.js'`

- [x] **Step 4: 實作 `scripts/lib/fetch-file.js`**

```js
// 下載單一檔案到磁碟。測試會注入 fetchImpl，所以這裡不直接綁全域 fetch。
const fs = require('node:fs');
const path = require('node:path');

const UA = 'travel-planner-photos/1.0 (+https://github.com/wangch15/travel-planner)';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);

async function downloadTo(url, dest, opts = {}) {
  const { fetchImpl = fetch, headers = {} } = opts;
  const res = await fetchImpl(url, { headers: { 'user-agent': UA, ...headers }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES.has(type)) throw new Error(`回應不是圖片：${type || '未知型別'}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return { bytes: buf.length, type };
}

module.exports = { downloadTo, IMAGE_TYPES };
```

- [x] **Step 5: 實作 `scripts/photos.js`**

```js
#!/usr/bin/env node
// 依 photos.json 把照片抓進 trips/<slug>/photos/：node scripts/photos.js <slug> [--force]
const fs = require('node:fs');
const path = require('node:path');
const { tripDir, resolveSlug } = require('./lib/paths.js');
const { downloadTo } = require('./lib/fetch-file.js');

// Commons 的原圖常常好幾 MB，這個端點會回傳指定寬度的縮圖
const commonsUrl = (title) =>
  'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(title) + '?width=1024';

function photoJobs(manifest, dir, opts = {}) {
  const jobs = [];
  Object.entries(manifest || {}).forEach(([key, list]) => {
    (list || []).forEach((ph, i) => {
      const file = path.join(dir, 'photos', `${key}-${i + 1}.jpg`);
      if (!opts.force && fs.existsSync(file)) return;
      jobs.push({
        key, index: i + 1, file,
        url: ph.url || commonsUrl(ph.title),
        label: ph.url ? ph.credit || ph.url : ph.title,
      });
    });
  });
  return jobs;
}

async function runPhotos(slug, opts = {}) {
  const { force = false, fetchImpl, log = () => {} } = opts;
  const dir = tripDir(slug);
  const manifestPath = path.join(dir, 'photos.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`找不到 trips/${slug}/photos.json`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const jobs = photoJobs(manifest, dir, { force });
  const total = Object.values(manifest).reduce((n, l) => n + l.length, 0);
  if (!jobs.length) {
    log(`✓ ${slug}：${total} 張照片都已經在 trips/${slug}/photos/（--force 可全部重抓）`);
    return { ok: 0, skipped: total, failed: [] };
  }

  log(`要抓 ${jobs.length} 張（共 ${total} 張）…`);
  const failed = [];
  let ok = 0;
  for (const job of jobs) {
    try {
      const r = await downloadTo(job.url, job.file, fetchImpl ? { fetchImpl } : {});
      ok += 1;
      log(`  ✓ ${path.basename(job.file)}　${(r.bytes / 1024).toFixed(0)} KB　${job.label}`);
    } catch (e) {
      failed.push({ file: path.basename(job.file), reason: e.message });
      log(`  ✗ ${path.basename(job.file)}　${e.message}`);
    }
  }
  return { ok, skipped: total - jobs.length, failed };
}

module.exports = { runPhotos, photoJobs, commonsUrl };

if (require.main === module) {
  const argv = process.argv.slice(2);
  (async () => {
    try {
      const slug = resolveSlug(argv);
      const r = await runPhotos(slug, { force: argv.includes('--force'), log: (m) => console.log(m) });
      if (r.failed.length) {
        console.error(`\n✗ ${r.failed.length} 張失敗。授權不明或連不上的就從 photos.json 拿掉，不要硬塞。`);
        process.exit(1);
      }
      console.log(`\n✓ 新抓 ${r.ok} 張、已存在 ${r.skipped} 張。接著跑 npm run build -- ${slug} 看效果。`);
    } catch (e) {
      console.error('✗ ' + e.message);
      process.exit(1);
    }
  })();
}
```

- [x] **Step 6: 執行測試確認通過**

Run: `npm test`
Expected: PASS，photos 的 9 個測試全過

- [x] **Step 7: Commit**

```bash
git add package.json scripts/lib/fetch-file.js scripts/photos.js tests/photos.test.js
git commit -m "feat: npm run photos 指令

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 地圖動線依 mode 分線型

現在 `renderMap` 把當天所有停留點串成**一條** path。改成逐段畫，每一段用「終點那個 stop 的 `leg.mode`」決定線型。總覽頁沒有 leg 資訊，維持單一實線。

**Files:**
- Create: `src/map-modes.js`、`tests/map-modes.test.js`
- Modify: `src/app.js`、`src/index.html`、`scripts/build.js`

**Interfaces:**
- Consumes: 無
- Produces: `src/map-modes.js` 定義全域 `MODE_LINE: { [mode]: { dash: string | null, width: number } }` 與 `legStyle(mode): { dash, width }`（未知 mode 回傳 `drive` 的樣式）。`src/index.html` 多一個 `<script src="map-modes.js">`，`build.js` 多內嵌這一個檔。

- [x] **Step 1: 寫失敗的測試 `tests/map-modes.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT } = require('../scripts/lib/paths.js');
const { MODES } = require('../scripts/lib/schema.js');

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/map-modes.js'), 'utf8')
  + '\n;globalThis.MODE_LINE = MODE_LINE; globalThis.legStyle = legStyle;', ctx);

test('每個合法的 mode 都有線型', () => {
  for (const m of MODES) assert.ok(ctx.MODE_LINE[m], `${m} 沒有定義線型`);
});

test('自駕是實線、大眾運輸是虛線、步行是點線', () => {
  assert.equal(ctx.legStyle('drive').dash, null, '自駕不該有虛線樣式');
  const transit = ctx.legStyle('transit').dash;
  const walk = ctx.legStyle('walk').dash;
  assert.ok(transit && /\d/.test(transit), '大眾運輸要有 dasharray');
  assert.ok(walk && /\d/.test(walk), '步行要有 dasharray');
  assert.notEqual(transit, walk, '虛線與點線要看得出差別');
  assert.ok(parseFloat(walk) < parseFloat(transit), '步行的點要比大眾運輸的虛線短');
});

test('未知或缺少的 mode 退回自駕樣式', () => {
  assert.deepEqual(ctx.legStyle('nope'), ctx.legStyle('drive'));
  assert.deepEqual(ctx.legStyle(undefined), ctx.legStyle('drive'));
});

test('計程車沿用自駕線型，渡輪有自己的線型', () => {
  assert.equal(ctx.legStyle('taxi').dash, ctx.legStyle('drive').dash);
  assert.notEqual(ctx.legStyle('ferry').dash, ctx.legStyle('drive').dash);
});
```

- [x] **Step 2: 執行測試確認失敗**

Run: `node --test tests/map-modes.test.js`
Expected: FAIL，`ENOENT`（`src/map-modes.js` 不存在）

- [x] **Step 3: 建立 `src/map-modes.js`**

```js
'use strict';
/* 地圖動線的線型：drive 實線、transit 虛線、walk 點線。
   render.js 的 MODE_ICON 管的是文字列的圖示，這裡管的是地圖上的線。 */
const MODE_LINE = {
  drive:   { dash: null,       width: 2.2 },
  taxi:    { dash: null,       width: 2.2 },
  transit: { dash: '7 5',      width: 2.2 },
  walk:    { dash: '1.5 4',    width: 2.0 },
  ferry:   { dash: '10 4 2 4', width: 2.0 },
};
const legStyle = (mode) => MODE_LINE[mode] || MODE_LINE.drive;
```

- [x] **Step 4: 執行測試確認通過**

Run: `node --test tests/map-modes.test.js`
Expected: PASS，4 個測試全過

- [x] **Step 5: 把 `map-modes.js` 接進頁面**

`src/index.html`：在 `<script src="util.js"></script>` **之前**加一行

```html
<script src="map-modes.js"></script>
```

`scripts/build.js` 的 `inline()`：在替換 `util.js` 的那一行前面加上同樣形式的一行

```js
    .replace('<script src="map-modes.js"></script>', `<script>\n${readEngine('src', 'map-modes.js')}\n</script>`)
```

- [x] **Step 6: 改寫 `renderMap` 的路線繪製**

把 `src/app.js` 裡這一段：

```js
  const pts = seq.map((s) => PLACES[s.key]);
  if (pts.length > 1) {
    routeLayer.appendChild(shape('path', {
      d: d(pts.map((p) => [p.lng, p.lat])), fill:'none', stroke:color, 'stroke-width':2.2, opacity:.7,
      'stroke-linejoin':'round', 'stroke-linecap':'round', 'vector-effect':'non-scaling-stroke',
    }));
  }
```

換成：

```js
  const pts = seq.map((s) => PLACES[s.key]);
  drawRoute(day, pts, color);
```

並在 `renderMap` 前面加上這個函式（`day` 為 null 的總覽頁沒有 leg，畫成一條實線）：

```js
/* 逐段畫動線：每一段的線型取自「終點那個 stop 的 leg.mode」，
   這樣坐電車的段落在地圖上就看得出來是虛線。 */
function drawRoute(day, pts, color) {
  const base = { fill:'none', stroke:color, opacity:.7,
    'stroke-linejoin':'round', 'stroke-linecap':'round', 'vector-effect':'non-scaling-stroke' };
  if (!day) {
    if (pts.length > 1) {
      routeLayer.appendChild(shape('path', { d: d(pts.map((p) => [p.lng, p.lat])), ...base, 'stroke-width':2.2 }));
    }
    return;
  }
  const stops = day.stops;
  for (let i = 1; i < stops.length; i += 1) {
    const from = PLACES[stops[i - 1].place], to = PLACES[stops[i].place];
    if (!from || !to || stops[i - 1].place === stops[i].place) continue;   // 同一個地點不用畫線
    const st = legStyle(stops[i].leg && stops[i].leg.mode);
    const attrs = { d: d([[from.lng, from.lat], [to.lng, to.lat]]), ...base, 'stroke-width': st.width };
    if (st.dash) attrs['stroke-dasharray'] = st.dash;
    routeLayer.appendChild(shape('path', attrs));
  }
}
```

- [x] **Step 7: 全部測試通過**

Run: `npm test`
Expected: PASS

- [x] **Step 8: Commit**

```bash
git add src/map-modes.js src/index.html src/app.js scripts/build.js tests/map-modes.test.js
git commit -m "feat: 地圖動線依 leg.mode 分線型

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 每日停車彙整

spec §3：「每日頁尾自動列該日所有有 `parking` 的停留點（有資料才出現）」。燈箱的停車區塊第 1 階段已完成，這裡補的是每天的彙整表。

**Files:**
- Create: `tests/render-parking.test.js`
- Modify: `src/render.js`、`src/styles.css`、`tests/helpers/render-ctx.js`

**Interfaces:**
- Consumes: `tests/helpers/render-ctx.js` 的 `renderContext`、`tests/fixtures/make-trip.js` 的 `makeTrip`
- Produces: `render.js` 新增 `dayParkingHTML(day): string`，沒有任何停留點帶 `parking` 時回傳空字串。`dayHTML` 在 `extraHTML('day', …)` **之前**呼叫它。

- [x] **Step 1: 寫失敗的測試 `tests/render-parking.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { renderContext } = require('./helpers/render-ctx.js');
const { makeTrip } = require('./fixtures/make-trip.js');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ctxFor = (trip) => renderContext(trip, [read('src/util.js'), read('src/render.js')]);

const withParking = () => {
  const trip = makeTrip();
  trip.PLACES.stayA.parking = { name: '住宿停車場', lat: 38.21, lng: 140.51, fee: '一晚 ¥500' };
  trip.PLACES.sightA.parking = { name: '景點停車場', lat: 38.22, lng: 140.52, fee: '一日 ¥300', note: '旺季會滿' };
  return trip;
};

test('沒有任何 parking 時不渲染彙整區塊', () => {
  const trip = makeTrip();
  assert.equal(ctxFor(trip).dayParkingHTML(trip.DAYS[0]), '');
  assert.ok(!ctxFor(trip).dayHTML(trip.DAYS[0]).includes('day-parking'));
});

test('只列出「當天」有 parking 的停留點', () => {
  const trip = withParking();
  const ctx = ctxFor(trip);
  // Day 1 停 hubA（無 parking）與 stayA（有）
  const d1 = ctx.dayParkingHTML(trip.DAYS[0]);
  assert.ok(d1.includes('住宿停車場'));
  assert.ok(!d1.includes('景點停車場'), '不該列到別天的停車場');
  // Day 2 停 stayA 與 sightA，兩個都有
  const d2 = ctx.dayParkingHTML(trip.DAYS[1]);
  assert.ok(d2.includes('住宿停車場') && d2.includes('景點停車場'));
});

test('彙整表帶出費用、注意事項與導航連結', () => {
  const trip = withParking();
  const html = ctxFor(trip).dayParkingHTML(trip.DAYS[1]);
  assert.ok(html.includes('一日 ¥300'), '要有費用');
  assert.ok(html.includes('旺季會滿'), '要有注意事項');
  assert.ok(html.includes('38.220000,140.520000'), '導航連結要指向停車場座標，不是景點座標');
  assert.ok(html.includes('google.com/maps'), '要有 Google Maps 連結');
});

test('同一個地點在一天內出現兩次只列一次', () => {
  const trip = withParking();
  trip.DAYS[1].stops.push({ time: '18:00', place: 'stayA', kind: 'stay', label: '回住宿' });
  const html = ctxFor(trip).dayParkingHTML(trip.DAYS[1]);
  assert.equal(html.split('住宿停車場').length - 1, 1, '重複的停留點不該列兩次');
});

test('dayHTML 會把彙整接在停留點列表之後', () => {
  const trip = withParking();
  const html = ctxFor(trip).dayHTML(trip.DAYS[1]);
  assert.ok(html.includes('day-parking'));
  assert.ok(html.indexOf('day-parking') > html.indexOf('class="stops"'));
});

test('parking 只有座標、沒有名稱時用地點名稱代替', () => {
  const trip = makeTrip();
  trip.PLACES.sightA.parking = { lat: 38.22, lng: 140.52 };
  const html = ctxFor(trip).dayParkingHTML(trip.DAYS[1]);
  assert.ok(html.includes(trip.PLACES.sightA.name), '沒有停車場名稱時要顯示地點名稱');
});
```

- [x] **Step 2: 執行測試確認失敗**

Run: `node --test tests/render-parking.test.js`
Expected: FAIL，`dayParkingHTML is not a function`

- [x] **Step 3: 在 `src/render.js` 新增 `dayParkingHTML`**

放在 `dayHTML` 前面：

```js
/* 當天所有帶 parking 的停留點，彙整成一張表。自駕行程才會有東西。 */
function dayParkingHTML(day) {
  const seen = {};
  const rows = day.stops.filter((s) => {
    const p = PLACES[s.place];
    if (!p || !p.parking || seen[s.place]) return false;
    seen[s.place] = 1;
    return true;
  });
  if (!rows.length) return '';
  return '<section class="day-parking"><h3>' + ico('i-car') + '今天的停車</h3><ul>'
    + rows.map((s) => {
      const p = PLACES[s.place], pk = p.parking;
      return '<li><div class="pk-nm">' + esc(pk.name || p.name) + '</div>'
        + '<div class="pk-meta">'
        + (pk.fee ? '<span>' + esc(pk.fee) + '</span>' : '')
        + (pk.note ? '<span class="pk-note">' + esc(pk.note) + '</span>' : '')
        + '</div>'
        + '<a class="glink" href="https://www.google.com/maps/search/?api=1&query=' + ll(pk)
        + '" target="_blank" rel="noopener">導航到停車場' + ico('i-ext') + '</a></li>';
    }).join('')
    + '</ul></section>';
}
```

在 `dayHTML` 裡，把

```js
  h += extraHTML('day', day.id);
```

改成

```js
  h += dayParkingHTML(day);
  h += extraHTML('day', day.id);
```

並把 `'dayParkingHTML'` 加進 `tests/helpers/render-ctx.js` 的 `EXPORTS` 陣列。

- [x] **Step 4: 在 `src/styles.css` 末尾加樣式**

先確認可用的 CSS 變數名稱：

Run: `grep -n '\-\-line\|\-\-surface\|\-\-card' src/styles.css | head`

然後用**已存在的**變數寫這段（下面的 `--line`／`--surface-2` 若不存在就換成查到的等義名稱，**不要新增 `:root` 變數**，那會讓 `theme.css` 插槽的契約變複雜）：

```css
/* 每日停車彙整 */
.day-parking{margin:18px 0 0;padding:14px 16px;border:1px solid var(--line);border-radius:12px}
.day-parking h3{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:.95rem}
.day-parking ul{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.day-parking li{display:grid;gap:4px}
.day-parking .pk-nm{font-weight:600}
.day-parking .pk-meta{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:.85rem;opacity:.85}
.day-parking .pk-note{opacity:.75}
```

- [x] **Step 5: 執行測試確認通過**

Run: `node --test tests/render-parking.test.js && npm test`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/render.js src/styles.css tests/helpers/render-ctx.js tests/render-parking.test.js
git commit -m "feat: 每日停車彙整

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `_example` 加上真實照片並驗收畫面

**Files:**
- Modify: `trips/_example/photos.json`、`trips/_example/docs/status.md`、`CHANGELOG.md`、`README.md`、`package.json`
- Create: `trips/_example/photos/yamadera-1.jpg`、`ginzan-1.jpg`、`matsushima-1.jpg`

**Interfaces:**
- Consumes: Task 1 的 CLI
- Produces: 三張實際的 CC 授權照片，進 git

以下三個 Commons 檔案已經查證過（2026-09-18，透過 Commons API）：授權皆為 CC BY-SA、`Special:FilePath?width=1024` 都回傳 JPEG（270–410 KB）。

| placeKey | Commons 檔名 | 作者 | 授權 |
|---|---|---|---|
| `yamadera` | `View of Yamadera.jpg` | Japanexperterna.se | CC BY-SA 3.0 |
| `ginzan` | `Ginzan Onsen Ashiyu.jpg` | さかおり | CC BY-SA 4.0 |
| `matsushima` | `Zuiganji Hondo.JPG` | アラツク | CC BY-SA 4.0 |

- [x] **Step 1: 寫 `trips/_example/photos.json`**

```json
{
  "yamadera": [
    {
      "title": "View of Yamadera.jpg",
      "artist": "Japanexperterna.se",
      "license": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:View_of_Yamadera.jpg"
    }
  ],
  "ginzan": [
    {
      "title": "Ginzan Onsen Ashiyu.jpg",
      "artist": "さかおり",
      "license": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Ginzan_Onsen_Ashiyu.jpg"
    }
  ],
  "matsushima": [
    {
      "title": "Zuiganji Hondo.JPG",
      "artist": "アラツク",
      "license": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Zuiganji_Hondo.JPG"
    }
  ]
}
```

- [x] **Step 2: 抓照片**

Run: `npm run photos -- _example`
Expected: 三張都成功，每張 250–450 KB

- [x] **Step 3: 確認 check 與 build 都收得到**

Run: `npm run check -- _example && npm run build -- _example`
Expected: `check` 印出「3 張照片」；`build` 印出「照片 3 張」且 `dist/_example/site/img/` 有三個檔

- [x] **Step 4: 確認 `.gitignore` 沒有把照片擋掉**

Run: `git check-ignore -v trips/_example/photos/yamadera-1.jpg || echo "沒有被 ignore，可以進 git"`
Expected: 印出「沒有被 ignore，可以進 git」

- [x] **Step 5: 用 ego-browser 驗收四件事**

Run: `npm run preview -- _example`

用 **ego-browser（ego lite）** 開 `http://localhost:4173`，逐項確認並截圖：

1. **照片**：點「山寺 立石寺」開燈箱，照片載入、下方有「Japanexperterna.se・CC BY-SA 3.0」與 Wikimedia Commons 連結。
2. **地圖線型**：切到 Day 3（仙台站 → 松島是 `transit`、松島 → 民宿 B 是 `walk`），地圖上這兩段是**虛線與點線**，跟 Day 1 的自駕實線看得出差別。
3. **停車彙整**：切到 Day 1（山寺有 `parking`），頁尾出現「今天的停車」區塊，有費用與導航連結；Day 3 沒有任何 `parking`，**不該**出現這個區塊。
4. 手機寬度（390px）下三者都正常，主控台沒有錯誤。

看完 Ctrl+C 結束。

- [x] **Step 6: 更新 `status.md`、`CHANGELOG.md`、`README.md`、版本**

`trips/_example/docs/status.md`：把 photos 那行改成「✓ 3 張（Commons，CC BY-SA）」。

`CHANGELOG.md` 最上面加一節：

```markdown
## 0.3.0（2026-09-18）

- 新增 `npm run photos -- <slug>`：把 `photos.json` 列的 Commons 與官網照片抓進 `trips/<slug>/photos/`，預設只補缺的，`--force` 全部重抓。
- 地圖動線改為逐段繪製，線型依 `leg.mode`：自駕實線、大眾運輸虛線、步行點線、渡輪點劃線。
- 有 `parking` 的停留點會在每天的頁尾彙整成一張表，含費用、注意事項與導航到停車場的連結。
- `trips/_example` 附三張 CC BY-SA 授權的實際照片。
- 資料需要 migrate：否。

尚未實作：agent skills 與 `.ai/`。
```

`README.md`：把「目前是第 2 階段」改成第 3 階段、移除「`npm run photos` 尚未實作」、在指令表加一列：

```markdown
| `npm run photos -- <slug>` | 依 `photos.json` 把照片抓進行程資料夾 |
```

`package.json` 的 `version` 改成 `0.3.0`。

- [x] **Step 7: 全部測試與完整流程最後跑一次**

Run: `npm test && npm run check -- _example && npm run build -- _example`
Expected: 全部 PASS

- [x] **Step 8: Commit 並打 tag**

```bash
git add trips/_example package.json CHANGELOG.md README.md
git commit -m "feat: _example 加上真實照片，驗收線型與停車彙整

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git tag v0.3.0
```

---

## 完成後的狀態

- `npm run photos -- <slug>` 可用，純 Node、只補缺的、`--force` 全抓，失敗會逐張列出原因而不是整個中斷。
- 地圖上看得出哪一段是坐電車、哪一段是走路。
- 自駕行程每天頁尾有停車彙整，沒有停車資料的日子不會出現空區塊。
- `trips/_example` 有三張實際照片，燈箱、`img/` 複製、`_headers` 快取這條路徑都有真實資料走過一遍。

## 下一階段的接續點

- **第 4 階段（skills 與文件）**：`.ai/`、`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、七個 skill、issue 模板、tag v1.0.0 都還沒做。`tp-photos` skill 要寫明「授權不明就不要收」；`tp-basemap` skill 要寫明 Overpass 限流時等幾分鐘再試。agent-assets-kit setup 跑之前要先 `--dry-run` 並把要寫入的檔案列給人看。
- **第 5 階段（SENTAI2026 搬家）**：動 SENTAI2026 之前**必須先問人**，先建 `legacy-v4` 分支，搬完要逐頁比對線上版，比對結果給人看過才 ship。
