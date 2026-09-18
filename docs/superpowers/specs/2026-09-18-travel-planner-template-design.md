# travel-planner：可 fork 的旅程網頁模板

日期：2026-09-18
狀態：設計已確認，待拆實作計畫
來源專案：`wangch15/SENTAI2026`（2026/10 仙台山形七天自駕行程頁面）

## 1. 目標與範圍

把 SENTAI2026 抽成一個模板 repo。非技術背景的朋友 fork 下來，用自己的 coding agent（Claude Code、Codex、Gemini CLI）照著 repo 內的 skills，從一份粗略的行程初稿做出同等品質的互動網頁，並部署到自己的免費 Cloudflare 帳號。

### 已定決策

| 決策 | 選擇 | 理由 |
|---|---|---|
| 託管 | 各自免費 Cloudflare 帳號，Workers 靜態資源；模板作者不建共用服務 | 網站本質是單一 HTML + 圖片，不需要後端；作者零維運；私人資料留在朋友自己帳號 |
| 分發 | 真正的 GitHub fork（`gh repo fork`），由 agent 執行 | 保留共同歷史，之後能 `git merge upstream/main`；「Use this template」會斷掉歷史，不用 |
| 公開／私有 | 待定；預設私有 + 加協作者 | 兩種情況 fork 流程相同 |
| 引擎更新流向 fork | 單一 repo fork + 嚴格的引擎／內容邊界 + schema 遷移（方案 A） | 一個 repo、一次 merge，agent 熟悉；引擎打包成 npm 套件（方案 B）留作未來選項，邊界切好了隨時可轉 |
| 交通模式 | v1 支援自駕 + 大眾運輸（含步行） | 朋友的旅行型態 |
| 底圖 | 移植成純 Node，去掉 Python | 等高線與海岸線是模板辨識度所在，不能是選配；Python 是非技術者最大的安裝坑 |
| 多趟行程 | 一個 clone 內 `trips/<slug>/` 各自獨立 | 引擎與內容不相交，`git pull` 不衝突 |
| Agent 文件 | 用 `agent-assets-kit`：`.ai/` 為唯一來源，同步到 `AGENTS.md`、`CLAUDE.md`、各工具目錄；另手放 `GEMINI.md` 指向 `AGENTS.md` | Gemini CLI 到 v0.49 仍不預設讀 `AGENTS.md`（[issue #28227](https://github.com/google-gemini/gemini-cli/issues/28227)） |
| 研究能力 | 寫成 skill 的方法論，由朋友的 agent 自己查 | 不把任何模型包成 API；每個事實附連結與查核日期 |
| SENTAI2026 | 保持獨立私有 repo，內容換成引擎 + `trips/sendai-2026/`，等同作者自己的 fork | 它是引擎的第一個真實使用者與驗收 |

### 不在 v1 範圍

- UI 字串 i18n（介面固定繁體中文；只把「七天」這類寫死天數的字改成動態）
- Cloudflare Access 之類的登入保護（維持「不被收錄、拿到網址就能看」）
- 引擎打包成 npm 套件
- 共用發布 Worker

## 2. 目錄結構與 trip.config

```
travel-planner/
├── AGENTS.md  CLAUDE.md               agent-assets-kit sync 產物
├── GEMINI.md                          手寫三行：請先讀 AGENTS.md
├── .ai/                               agent assets 唯一來源
│   ├── entrypoints/project-context.md
│   ├── rules/
│   │   ├── engine-content-boundary.md
│   │   ├── data-schema-reference.md   指路：改資料前先讀 docs/schema/
│   │   ├── research-integrity.md
│   │   └── privacy.md
│   └── skills/
│       ├── tp-setup/
│       ├── tp-plan/
│       ├── tp-research/  (SKILL.md + references/)
│       ├── tp-basemap/
│       ├── tp-photos/
│       ├── tp-ship/
│       ├── tp-update/
│       └── tp-maps-lists/
├── .github/ISSUE_TEMPLATE/            bug、feature 兩個模板
├── src/                               引擎前端
│   ├── index.html                     外殼與佔位符
│   ├── styles.css
│   ├── util.js                        esc/ico/連結產生等純函式
│   ├── render.js                      產 HTML 字串的純函式（可在 Node 測）
│   └── app.js                         地圖、燈箱、互動（碰 DOM）
├── scripts/
│   ├── new-trip.js  check.js  build.js  ship.js  preview.js  photos.js  migrate.js
│   ├── lib/load-trip.js               合併五個資料檔、驗證、掛接
│   ├── lib/schema.js                  SCHEMA_VERSION 與驗證規則
│   ├── migrate/0-to-1.js
│   └── templates/                     new-trip 用的最小骨架
├── tools/basemap/                     Node 版底圖產生（見 §4）
├── docs/
│   ├── schema/                        places、days、dining、details、photos、map-lists 各一檔
│   └── superpowers/specs/
├── trips/
│   ├── _example/                      去識別化三天範例，npm test 用
│   └── <slug>/
│       ├── trip.config.json
│       ├── data.js  details.js  dining.js  map-lists.js  photos.json
│       ├── photos/                    抓下來的 1024px JPEG，進 git
│       ├── basemap.json               進 git
│       ├── theme.css                  插槽：覆寫 CSS 變數
│       ├── extra.js                   插槽：自訂區塊
│       ├── .cache/                    Overpass、DEM 快取，gitignore
│       └── docs/                      agent 用，不進 build
│           ├── brief.md  plan.md  status.md
│           ├── route-check.md  dining-research.md  sources.md
│           └── engine-changes.md      若朋友的 agent 改了引擎
├── package.json                       引擎版本（semver）
├── CHANGELOG.md
└── README.md
```

### 硬邊界

- 引擎（`src/`、`scripts/`、`tools/`、`.ai/`、`docs/schema/`）只從 `trips/<slug>/` 讀 config、五個資料檔、兩個插槽、`photos/`、`basemap.json`。
- `trips/<slug>/docs/` 永遠不進 build。家人飲食限制、訂單細節、電話這類東西放這裡。
- 作者的 commit 只碰引擎；朋友的 commit 只碰 `trips/<slug>/`。兩邊檔案集合不相交，merge 不衝突。
- `dist/` 整個 gitignore。

### trip.config.json

```json
{
  "schemaVersion": 1,
  "title": "仙台山形自駕手帳",
  "heading": "仙台・山形・鳴子・松島",
  "subtitle": "2026/10/11–17　7天6夜",
  "description": "meta description 用的一句話",
  "lang": "zh-Hant",
  "dates": { "start": "2026-10-11", "end": "2026-10-17" },
  "region": { "country": "JP", "bbox": [139.95, 37.85, 141.45, 39.00] },
  "transport": ["drive", "transit"],
  "party": 5,
  "currency": "¥",
  "sections": { "overview": true, "dining": true, "mapLists": true, "checklist": true },
  "theme": { "accent": "#B0552D", "favicon": "🗾" },
  "basemap": { "dem": "auto", "detail": "normal", "contourLevels": null },
  "deploy": { "name": "sendai-2026", "target": "workers" }
}
```

- 天數從 `data.js` 的 `DAYS` 推，不放 config。
- `title` 進 `<title>` 與 meta；`heading` 是頁首 h1，省略時用 `title`。
- `party` 是同行人數，只用來算「N 人約 ¥…」的餐費乘數；`currency` 是金額前綴符號。
- `region.bbox` 是 `[lngMin, latMin, lngMax, latMax]`，同時給底圖範圍與座標驗證用。
- `sections` 關掉的區塊不渲染、不驗證。
- `basemap.dem`：`auto`（JP → 国土地理院，其他 → Terrarium）、`gsi`、`terrarium`。`detail`：`low | normal | high`。`contourLevels` 為 null 時自動選。
- `deploy.target`：`workers`（預設）或 `pages`（SENTAI2026 沿用原 Pages 專案，不換網址）。
- 只放引擎需要的欄位，不放個人資料。

### 插槽契約

- `theme.css`：build 時接在引擎 CSS 之後。覆寫 `:root` 變數即可換整套色與字型。
- `extra.js`：`module.exports = { sections: [{ id, title, where: 'overview' | 'day', day?: number, html: string }] }`。引擎在總覽頁尾或指定那天的頁尾渲染。`html` 是行程擁有者自己的內容，原樣插入。

### 選擇行程

所有指令吃 `<slug>` 參數。`trips/` 底下只有一個非 `_example` 的行程時可省略；多於一個且未指定則報錯列出可選 slug。

## 3. 資料模型

原則：資料檔是純資料。現在 SENTAI2026 `data.js` 尾端「把餐飲地點合併進 PLACES、把 meals 與 mapList 掛到 day、把餐飲待辦推進 CHECKLIST」的接線邏輯，搬進 `scripts/lib/load-trip.js`。

### 五個資料檔（皆為 CommonJS `module.exports`）

| 檔案 | 匯出 |
|---|---|
| `data.js` | `{ PLACES, DAYS, OVERVIEW_ROUTE, ADDONS, CHECKLIST, STAYS, OVERVIEW }` |
| `details.js` | `{ [placeKey]: { summary, highlights[], stay, info[][], refs[] } }` |
| `dining.js` | `{ checked, places, venues, cooking?, days: { [dayId]: meal[] } }` |
| `map-lists.js` | `{ [dayId]: { name, url, placeKeys[], extraPlaces?[] } }` |
| `photos.json` | `{ [placeKey]: ({ title, artist, license, page } \| { url, credit, page })[] }` |

build 時 `require()` 後 `JSON.stringify` 嵌進頁面，不再用字串切 source。agent 可在檔內寫註解標來源。

### 相對於 SENTAI2026 的變動

```js
// PLACES[key]
{ name, local,                 // jp → local：當地語言名稱，給地圖搜尋
  lat, lng, gq, gurl?, cat,    // cat: hub | stay | sight | food | shop
  note?, approximate?,
  parking?: { name?, lat, lng, gq?, fee?, note? } }   // 新增

// stop.leg
{ mode: 'drive' | 'transit' | 'walk' | 'taxi' | 'ferry',   // 新增，必填
  dist?, time, buffer?, via?, fare?, url }
// drive:   原 dist/drive/buffer/road/url → dist/time/buffer/via/url
// transit: via 寫路線名（「JR 仙山線 快速」），fare 選填，url 用 travelmode=transit
// walk:    dist/time/url，travelmode=walking

// STAYS[i] 新增 day：入住那天的 DAYS id，住宿色條與燈箱用它取當天顏色（原本寫死 DAYS[0/3/4]）
{ place, day, range, nights, meals, check, role }

// data.js 新增 OVERVIEW：原本寫死在 template 的總覽文字，每個欄位都選填，空的就不渲染
OVERVIEW = {
  checked: '2026/09/17',                       // 景點資料查核日期，燈箱註記用
  dining: { hint, notes: string[], chips: [{ detail: placeKey, label } | { day: dayId, label }] },
  stays: { title, hint, arrive, depart },      // arrive/depart 預設「Day 1 抵達」「Day N 返程」
  addonsHint,
  foot: string[],                               // 頁尾段落（路線查核日期、航班等）
}

// dining.js 新增（皆選填）
checklist: string[]                             // 併入 CHECKLIST（原本在 data.js 尾端 push）
cooking.total: [lo, hi]                         // 自煮食材總預算，渲染「自煮 N 人食材約 ¥lo–hi」
days[id][i].budget: [lo, hi]                    // 覆寫該餐每人預算（原本寫死的早餐採買 ¥300–700）
```

引擎依 `mode`：路線連結的 travelmode、地圖線型（drive 實線、transit 虛線、walk 點線）、燈箱該段的顯示欄位。有 `parking` 的地點，drive 模式的導航連結指向停車場座標；燈箱多一個「停車」區；每日頁尾自動列該日所有有 `parking` 的停留點（有資料才出現）。

### 驗證規則（`scripts/lib/schema.js`，`npm run check` 執行）

- 座標落在 `region.bbox` 內。
- 天數不限；`DAYS[i].id === i + 1`；每天 `stops.length >= 2`。
- `sections.dining` 開啟時每天 `meals.length >= 1`，slot 名稱自由；關閉時不檢查餐飲。
- 非 `hub` 地點一律要有 `details`；`hub` 有寫就驗、沒寫不擋。
- `refs` 每筆是 `https?://`；`summary` 至少 40 字；`highlights` 至少 2 點。
- `photos.json` 每筆有對應檔案；Commons 來源授權須符合 `/CC|Public domain/i`；直接網址須有 `credit`。
- `sections.mapLists` 開啟時，每天清單的 `placeKeys` 必須涵蓋該日所有 stop、meal、alt 引用的地點。
- `stop.leg.mode` 必填且在允許集合內；`transit` 至少有 `time` 與 `via`。
- `schemaVersion` 必須等於引擎 `SCHEMA_VERSION`，否則報錯並提示 `npm run migrate`。
- `basemap.json` 存在，且其記錄的 bbox 與 config 一致（basemap 產出時寫入 `meta.bbox`）。

### Schema 文件

`docs/schema/` 一檔對一個資料檔，每欄寫必填／選填／型別／範例／驗證規則。`.ai/rules/data-schema-reference.md` 只放「改資料前先讀 `docs/schema/`」。

### 從 SENTAI2026 遷移（`scripts/migrate/0-to-1.js`）

自動：`jp → local`、`leg.drive → time`、`leg.road → via`、每個 leg 補 `mode: 'drive'`、拆掉 `data.js` 尾端接線、`template.html` 裡的總覽文字搬成 `OVERVIEW`、bump `schemaVersion`。
人工（agent 做）：`details.info` 裡的「停車」列要不要轉成 `parking` 欄位。

## 4. 底圖 Node 化

`npm run basemap -- <slug>` → `tools/basemap/index.mjs` → `trips/<slug>/basemap.json`。輸出格式與現有完全相同（`sea, islands, contour, motorway, trunk, primary, river, lake, border, towns`），外加 `meta: { bbox, dem, generatedAt }`。前端不改。新依賴：`pngjs`。

| 模組 | 職責 |
|---|---|
| `overpass.mjs` | 單一查詢抓 coastline、river（有名）、lake、motorway、trunk、primary、admin_level=4 boundary、place=city/town；bbox = config bbox 每邊各外擴寬／高的 5%；429／504 換鏡像重試；原始回應快取於 `trips/<slug>/.cache/` |
| `geom.mjs` | `rdp`、`join`（共用端點串線）、`seglen` |
| `coast.mjs` | 海域多邊形：OSM 慣例「陸左海右」。每條海岸線裁到 bbox；開放線段端點落在 bbox 邊上，沿周界順時針走到下一條線起點接起來；閉合環為島（洞）。bbox 內無海岸線 → 無海 |
| `dem.mjs` | 依 bbox 算 z10 圖磚範圍、下載、解碼成高程網格。GSI `dem_png`：`v = R·65536 + G·256 + B`，`h = v < 2²³ ? v·0.01 : (v − 2²⁴)·0.01`，`(128,0,0)` 為無效。Terrarium：`h = R·256 + G + B/256 − 32768`。缺圖磚視為 0 公尺 |
| `contours.mjs` | box blur（k=3）、marching squares、stitch、以網格像素為單位 rdp、丟掉短於 14 點的碎片。層級：config 指定，或自動——在 `{100, 200, 250, 500, 1000}` 中選使層數落在 6–8 的間距 |
| `assemble.mjs` | 組裝；城鎮：`city` 全留，`town` 依 `population` 取前 20（無 `population` 標籤者排最後）；標籤名稱依 `lang` 取 fallback 鏈（`zh-Hant → name:zh-Hant, name:zh, name`）；`detail` 三檔縮放簡化容差；輸出 > 600 KB 警告 |
| `index.mjs` | CLI 入口 |

測試（`node --test`）：`rdp`／`join` 已知輸入輸出；marching squares 對合成網格（單峰、鞍點）；`coast.mjs` 合成案例——單次穿越、島、多段、無海岸線、海岸線恰好觸邊。

驗收：用 SENTAI2026 的 bbox 跑一次，比對海岸線形狀、島數（現有 46）、等高線層級，肉眼確認松島灣。

## 5. build、check、deploy

改用 npm，去掉 pnpm。

| 指令 | 行為 |
|---|---|
| `npm run new -- <slug>` | 從 `scripts/templates/` 生最小骨架（config + 五個只有註解與一筆示例的資料檔 + 空 `theme.css`、`extra.js` + `docs/status.md`） |
| `npm run check -- <slug>` | `load-trip` 合併並依 §3 驗證；schemaVersion；basemap 存在與 bbox；照片檔齊全 |
| `npm run migrate -- <slug>` | 從 trip 的 `schemaVersion` 依序套 `scripts/migrate/<n>-to-<n+1>.js` 到引擎版本 |
| `npm run basemap -- <slug>` | §4 |
| `npm run photos -- <slug>` | Commons：`https://commons.wikimedia.org/wiki/Special:FilePath/<檔名>?width=1024`；直接網址原樣下載。只補缺的；`--force` 全抓。純 Node |
| `npm run build -- <slug>` | check → `dist/<slug>/site/`（單檔 `index.html`、`img/`、`public/` 的 `_headers` 與 `robots.txt`）與 `dist/<slug>/wrangler.json`（由 config 生成，放在 site 外層，不會被當靜態檔發布） |
| `npm run preview -- <slug>` | build → Node 靜態伺服器 `localhost:4173`，不依賴 wrangler |
| `npm run ship -- <slug>` | build → `target: workers`：`wrangler deploy --config dist/<slug>/wrangler.json`；`target: pages`：`wrangler pages deploy dist/<slug>/site --project-name <name>` |
| `npm test` | 引擎測試：basemap 幾何、load-trip 驗證（合法／各種不合法）、對 `trips/_example` 完整 build 並斷言關鍵內容、migrate 對舊格式的合成樣本（不用真實行程資料） |

生成的 `wrangler.json`：

```json
{ "name": "<deploy.name>", "compatibility_date": "<build 當天>", "assets": { "directory": "./site" } }
```

Workers 靜態資源第一次 `wrangler deploy` 會自動建 Worker；新帳號會被問要不要註冊 workers.dev 子網域，`tp-setup` 涵蓋。網址 `<name>.<帳號>.workers.dev`。

`src/template.html`（1176 行）拆成 `index.html`、`styles.css`、`util.js`、`render.js`、`app.js`；`render.js` 只產 HTML 字串、不碰 DOM，測試用 `vm` 注入資料全域直接呼叫。build 仍內嵌成單一 HTML。漏在 template 裡的行程文字（title、h1、副標、總覽段落）抽到 config 與 `OVERVIEW`。

`_headers` 維持 `X-Robots-Tag: noindex…`、`Referrer-Policy: no-referrer`、`img/*` 一週快取。

## 6. Skills

核心原則：先盤點、再問、再查、最後才做；每個事實附連結與查核日期；查不到就標「待確認」進 `CHECKLIST`，不編造。

### `AGENTS.md`（`.ai/entrypoints/project-context.md`）

- 這個 repo 是什麼、引擎／內容邊界。
- 路由表：什麼請求讀哪個 skill。
- 開工先 `git fetch upstream` 並回報落後幾個 commit，問是否更新。
- 隱私規則、研究誠信規則的指路。
- 改引擎前先試插槽；真的改了要記 `trips/<slug>/docs/engine-changes.md`。

### `tp-setup`

一次性環境準備。agent 能跑的自己跑，人類必做的步驟明確標出並停下來等：

1. 檢查 Node ≥ 20、git、gh、wrangler（缺的給安裝指令）。
2. **人**：註冊 GitHub 帳號（若無）。`gh auth login` → 瀏覽器授權。
3. `gh repo fork wangch15/travel-planner --clone`；確認 `origin`＝自己、`upstream`＝模板。
4. `npm install`、`npm test`。
5. **人**：註冊 Cloudflare 帳號（若無）。`wrangler login` → 瀏覽器授權。
6. 首次 `wrangler deploy` 的 workers.dev 子網域註冊提示。

### `tp-plan`

1. 收初版（文字、檔案、口述）→ 寫 `docs/brief.md` 草稿。
2. 完整性盤點。必要區塊清單：日期與航班／抵達方式、目的地區域、每晚住宿（已訂哪間／要找）、交通方式（自駕→租車細節；大眾運輸→pass）、同行人數與體力、飲食限制、必去／不去、預算感、行程鬆緊。**清單是提示，問題由 agent 自己列**：只問缺的，一次問完。
3. 等回答，補齊 brief。brief 標明每個區塊是「使用者已定，只查核」或「請 agent 建議」。要找飯店就列候選附連結，**agent 不代訂任何東西**。
4. `npm run new -- <slug>`，填 `trip.config.json`。
5. 寫 `docs/plan.md`：逐日文字草案，含每天備案與待確認事項。
6. **閘門一**：人確認 plan.md。確認前不碰資料檔、不做深度查核。

### `tp-research`

SKILL.md 精簡，方法論放 `references/`：

| reference | 內容 |
|---|---|
| `places.md` | 每個地點：座標（Nominatim／Overpass 或 Google Maps）、當地語言名、官網查營業時間與費用、查旅行當天是否公休／假日、停留時間、為何值得去、`refs` |
| `routes.md` | 自駕：用實際停留點座標查 Google Maps 路線，記距離／時間／道路／收費／查核日期 → `route-check.md`。大眾運輸：官方時刻表或 Google 轉乘，記路線／時間／票價／班距。緩衝規則 |
| `parking.md` | 自駕行程每個景點：官方停車場或最近停車場、費用、容量、注意事項 → `parking` 欄位；查不到就 `note` 標待確認 |
| `dining.md` | 每個餐段：主選＋備案、那一天那個星期幾的營業時間、訂位方式、菜色與價位、超市熟食後備；使用者的飲食限制只用來挑店，不寫進資料檔 → `dining-research.md` |
| `alternatives.md` | 每天：下雨版、走累版、店休版；`ADDONS` 附時間成本 |
| `photos.md` | Commons 優先、只收 CC／PD；沒有就官網照片並標 credit 與「未經授權僅供私人參考」 |

完成條件：五個資料檔寫好、`npm run check` 通過、`docs/sources.md` 列出所有查核來源與日期。

### `tp-basemap`、`tp-photos`

跑對應指令、看輸出大小與警告、在 preview 裡確認。

### `tp-ship`

check → build → preview → **閘門二**：列出該看的幾個地方（總覽、每天一個、燈箱、手機寬度）給人看 → 確認後 ship → 回報網址。
維護模式：改動請求 → 對應到哪個檔 → 改 → 重跑。

### `tp-update`

`git fetch upstream` → 列落後 commit 與 CHANGELOG 摘要 → `git merge upstream/main` → `npm install` → `npm run migrate` → check → build → preview → ship。衝突策略：引擎檔取上游、`trips/` 取本地、其他對照 `engine-changes.md` 解。

### `tp-maps-lists`（選用）

人在 Google Maps 建每日私人清單並加入地點，agent 對帳填 `map-lists.js`；check 驗一致性。

### 規則（`.ai/rules/`）

- `engine-content-boundary.md`：§2 硬邊界。
- `data-schema-reference.md`：指路 `docs/schema/`。
- `research-integrity.md`：每個事實附 URL 與查核日期；查不到寫待確認並進 CHECKLIST；沒有瀏覽器或搜尋工具的 agent 要停下來說明；`npm run check` 通過才算完成。
- `privacy.md`：飲食限制、訂單號、門鎖密碼、電話只進 `docs/`，不進資料檔；網站不被收錄但拿到網址就能看。

### 進度追蹤

`trips/<slug>/docs/status.md`：brief ✓ / plan ✓ / research: places ✓ routes ✓ parking ☐ dining ☐ / basemap ☐ / photos ☐ / shipped: URL。換 agent 或隔週再開都知道做到哪。

### 三道人類閘門

1. plan.md 確認後才研究。
2. preview 看過才 ship。
3. 任何會花錢或代表他的動作（訂房、訂位、註冊）agent 只給連結，不做。

## 7. 版本與更新機制

- 引擎版本 = `package.json` semver，每次發布打 tag。`CHANGELOG.md` 每版固定有一行「資料需要 migrate：是／否」。
- `SCHEMA_VERSION` 常數；資料格式變動時附 `scripts/migrate/<n>-to-<n+1>.js` 並 bump。
- 需求回流：`.github/ISSUE_TEMPLATE/` bug 與 feature 兩個模板；agent 用 `gh issue create -R wangch15/travel-planner` 填引擎版本、slug、想要什麼、為何插槽做不到。PR 從 fork 來，作者 review。
- 朋友的 agent 改了引擎：記 `engine-changes.md`，merge 衝突自行解；作者不負責。

## 8. `trips/_example/`

從 SENTAI2026 抽三天做去識別化範例：住宿換虛構名稱、不放航班、不放電話、不放飲食限制。可完整 build；`npm test` 用它。

## 9. SENTAI2026 搬家

1. SENTAI2026 repo 保留。舊內容留在 `legacy-v4` 分支。
2. `main` 換成 travel-planner 引擎（加 `upstream` remote）+ `trips/sendai-2026/`。
3. 跑 `migrate`，補 `parking` 欄位，`deploy.target: 'pages'`、`deploy.name: 'sentai2026'`。
4. 與線上版逐頁比對（總覽、七天、燈箱、餐飲、地圖、手機寬度）一致才 ship。這是引擎的驗收。

## 10. 實作順序

1. 骨架：引擎目錄、npm scripts、template 拆檔與泛化（config 驅動、`OVERVIEW` 抽出、`STAYS.day`、天數動態）、`load-trip` + `schema.js` + `docs/schema/`、`migrate/0-to-1.js`（`_example` 要靠它從 SENTAI 資料轉出）、`_example`、check／build／preview／ship／new、`npm test` 綠。
2. 底圖 Node 化 + 測試；用 SENTAI bbox 比對。
3. 照片 Node 化、transit 地圖線型與圖示、parking 欄位進 UI。
4. agent-assets-kit setup、Skills、rules、`AGENTS.md`、`GEMINI.md`、issue 模板、README、CHANGELOG、tag v1.0.0。
5. SENTAI2026 搬家與比對，ship 到原 Pages。
6. 找一位朋友試跑 `tp-setup` → `tp-plan`，修摩擦。

## 11. 已知風險

- Overpass 公共 API 有速率限制與偶發逾時；靠快取與鏡像重試緩解，skill 要說明「跑失敗等幾分鐘再試」。
- Terrarium 圖磚在非日本區域的精度與 GSI 不同，等高線可能較粗；自動選層級會吸收部分差異。
- 朋友的 agent 若沒有瀏覽器或搜尋能力，研究品質無法保證；`research-integrity.md` 要求 agent 明講。
- 出發前三週搬 SENTAI2026 有風險；`legacy-v4` 分支與 Pages 原專案是回退路徑，比對通過才切。
