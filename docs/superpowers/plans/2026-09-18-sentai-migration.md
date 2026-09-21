# SENTAI2026 搬家 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 SENTAI2026 從「一個單一行程的專案」改造成「travel-planner 的一個 fork」——引擎來自模板、行程資料搬進 `trips/sendai-2026/`——並證明改造後產出的頁面與現行線上版一致。這是引擎的第一個真實使用者，也是它的驗收。

**Architecture:** 在 SENTAI2026 開一個 `dev` 分支做全部的事，`main` 原封不動。引擎檔案從 travel-planner v1.0.0 複製過來，舊的 `src/*.js` 與 `src/photos/` 搬進 `trips/sendai-2026/`，跑 `migrate` 升到 schemaVersion 1，把原本寫死在 `template.html` 的總覽文字抽進 `OVERVIEW`。比對用 `git worktree` 把 `main` 檢出到暫存目錄、用舊引擎 build 一份，與新引擎的產出逐頁對照。

**Tech Stack:** Node 20+、npm（SENTAI 舊版用 pnpm，改造後跟模板一致改用 npm）、`git worktree`、ego-browser。

**Spec:** `docs/superpowers/specs/2026-09-18-travel-planner-template-design.md`（§9 SENTAI2026 搬家）

**本計畫範圍：** spec §10 實作順序的第 5 階段。結束時 `dev` 分支上的 SENTAI2026 可以 check／build／preview，且比對報告證明與線上版一致。**不含** merge 到 main、不含部署（都由使用者自己做）。

## Global Constraints（這一階段的規則比前四階段嚴格）

- **所有改動都在 SENTAI2026 的 `dev` 分支。`main` 一個 commit 都不能動。**
- **絕對不跑任何部署指令**：`npm run ship`、`wrangler deploy`、`wrangler pages deploy` 都不行。
  使用者會自己 merge 到 main 並切換部署。
- **不 merge、不 rebase、不 force push、不刪除 `main` 上的任何東西。**
- `git push` 只能推 `dev` 分支，而且要先問過人。
- travel-planner repo **不動**——它只是引擎的來源，以及 `dev` 分支的 `upstream` remote。
- 使用者的真實行程資料（住宿名稱、航班、電話、飲食限制）**留在 SENTAI2026，不要複製回 travel-planner**。
- 比對用的舊版 build 一律在 `git worktree` 的暫存目錄做，不要在主工作區 `git stash` 或切分支。
- commit 訊息格式 `<type>: <描述>`，結尾加 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`。
- 要在瀏覽器看版面時用 **ego-browser（ego lite）**。

## 為什麼是分支而不是「先建 legacy-v4 再改 main」

spec §9 原本寫「舊內容留在 `legacy-v4` 分支，`main` 換成引擎」。使用者 2026-09-18 指示改成
**在 `dev` 分支實作、他自己 review 後 merge 到 main、自己切換部署**。

這個做法更安全：`main` 完全不動，回退成本是零，而且 merge 與部署的時機由使用者掌握。
`legacy-v4` 因此變成非必要——`main` 在 merge 之前本身就是舊內容的快照。
使用者若想要一個永久命名的快照，可以在 merge 前自己開 `legacy-v4`。

## 現況（2026-09-18 讀取，只讀未改）

| | |
|---|---|
| 分支 | 只有 `main`，工作區乾淨 |
| 追蹤檔案 | 165 個（含 126 張照片） |
| 部署 | Cloudflare **Pages** 專案 `sentai2026`，`pages_build_output_dir: dist` |
| 套件管理 | pnpm（改造後改用 npm，與模板一致） |
| 舊引擎 | `src/template.html`（1176 行）、`scripts/build.js`、`scripts/check-data.js` 與多個 test-*.js |
| 舊資料 | `src/{data,details,dining,map-lists}.js`、`src/photos.json`、`src/basemap.json`、`src/photos/` |
| 舊資料的接線 | `data.js` 尾端把 dining 併進 PLACES、把 meals／mapList 掛到 day、push 四條 CHECKLIST |

## File Structure（改造後的 `dev` 分支）

```
SENTAI2026/
├── src/ scripts/ tools/ .ai/ docs/schema/ public/ tests/   ← 從 travel-planner v1.0.0 複製
├── AGENTS.md CLAUDE.md GEMINI.md README.md CHANGELOG.md
├── .github/ISSUE_TEMPLATE/
├── package.json                                            ← 模板的，改 name/description
└── trips/sendai-2026/
    ├── trip.config.json          ← 新寫，deploy.target: pages
    ├── data.js details.js dining.js map-lists.js photos.json   ← 從舊 src/ 搬來 + migrate
    ├── photos/                   ← 126 張，從舊 src/photos/ 搬來
    ├── basemap.json              ← 重新產生（舊的沒有 meta.bbox）
    ├── theme.css extra.js        ← 空插槽
    └── docs/                     ← 舊 docs/ 的行程筆記搬來
```

被刪掉的（都還在 `main` 上，隨時取得回來）：`src/template.html`、舊的 `scripts/*.js`、`pnpm-lock.yaml`。

---

### Task 1: 開分支、搬引擎、搬資料

**Files:**
- SENTAI2026 `dev` 分支：幾乎全部

**Interfaces:**
- Consumes: travel-planner v1.0.0 的引擎檔案
- Produces: 一個結構正確但資料還沒 migrate 的 `dev` 分支

- [x] **Step 1: 確認 SENTAI2026 乾淨，然後開分支**

```bash
cd /Users/wangch/GitHub/SENTAI2026
git status --short          # 必須是空的
git switch -c dev
git branch                  # 確認在 dev 上
```

工作區不乾淨就**停下來問人**，不要自己 stash 或 commit 別人未完成的工作。

- [x] **Step 2: 把舊資料搬進 `trips/sendai-2026/`**

```bash
mkdir -p trips/sendai-2026/docs
git mv src/data.js src/details.js src/dining.js src/map-lists.js src/photos.json trips/sendai-2026/
git mv src/photos trips/sendai-2026/photos
git mv src/basemap.json trips/sendai-2026/basemap.json
```

用 `git mv` 而不是 `cp`+`rm`，git 才看得出是搬移、diff 才乾淨。

行程筆記也搬進去（這些是 agent 的工作區，不進 build）：

```bash
git mv docs/dining-research.md docs/plan-v4.md docs/plan-v4-route-check.md docs/google-maps-lists.md trips/sendai-2026/docs/
```

`docs/plan-v3.md`、`docs/changelog.md`、`docs/plans/` 是舊專案的歷史，一併搬進
`trips/sendai-2026/docs/` 或留在原地都可以，**但要一致，並在 commit 訊息說明**。

- [x] **Step 3: 刪掉舊引擎**

```bash
git rm src/template.html
git rm scripts/build.js scripts/check-data.js scripts/compress-photo.py scripts/fetch-photos.mjs
git rm scripts/test-dining.js scripts/test-map-lists.js scripts/test-overview.js
git rm scripts/test-header.browser.mjs scripts/test-map-lists.browser.mjs scripts/test-overview.browser.mjs
git rm pnpm-lock.yaml
```

這些全都還在 `main` 上。刪之前再確認一次 `git branch` 顯示在 `dev`。

- [x] **Step 4: 複製引擎進來**

從 travel-planner 複製（**不要用 symlink**，這是一份獨立的 fork）：

```bash
TP=/Users/wangch/GitHub/travel-planner
cp -R $TP/src $TP/scripts $TP/tools $TP/.ai $TP/public $TP/tests $TP/trips/_example .
mkdir -p docs && cp -R $TP/docs/schema docs/
cp -R $TP/.github .
cp $TP/AGENTS.md $TP/CLAUDE.md $TP/GEMINI.md $TP/CHANGELOG.md $TP/.gitignore .
cp $TP/package.json $TP/package-lock.json .
```

（`trips/_example` 要一起帶，引擎測試會用到它。放到 `trips/_example/`。）

注意 `cp -R $TP/src .` 會與剛剛清空的 `src/` 合併——確認 `src/` 底下最後只有引擎的
`index.html`、`styles.css`、`util.js`、`map-modes.js`、`render.js`、`app.js`，沒有殘留的行程檔。

- [x] **Step 5: 改 `package.json` 的識別欄位**

`name` 改回 `sentai2026`、`description` 改成這趟行程的描述、`version` 設 `1.0.0`。
**`scripts` 與 `dependencies` 一字不改**——那是引擎的一部分。
把舊的 `packageManager`、`engines.pnpm`、`pnpm` 三個欄位拿掉（改用 npm 了）。

- [x] **Step 6: 接上 upstream**

```bash
git remote add upstream https://github.com/wangch15/travel-planner.git
git remote -v        # origin = SENTAI2026、upstream = travel-planner
```

- [x] **Step 7: 安裝並確認引擎測試通過**

```bash
npm install
npm test
```

Expected: 145 個測試全過。這證明引擎完整搬過來了。

- [x] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: 改用 travel-planner 引擎，行程資料搬進 trips/sendai-2026/

引擎來自 travel-planner v1.0.0。舊的 template.html 與 scripts/ 已移除，
內容仍在 main 分支上。資料尚未 migrate。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 資料升版與補齊

**Files:**
- Create: `trips/sendai-2026/trip.config.json`、`theme.css`、`extra.js`、`docs/status.md`
- Modify: `trips/sendai-2026/{data,details,dining,map-lists}.js`

**Interfaces:**
- Consumes: `scripts/migrate.js`
- Produces: 一份 `npm run check -- sendai-2026` 通過的行程

- [x] **Step 1: 寫 `trip.config.json`**

從舊 `template.html` 與 `scripts/build.js` 抄出這些值（用
`git show main:src/template.html` 與 `git show main:scripts/build.js` 取得）：

| 欄位 | 值 | 來源 |
|---|---|---|
| `title` | `仙台山形自駕手帳` | 舊 `build.js` 的 `TITLE` |
| `heading` | `仙台・山形・鳴子・松島` | 舊 template 的 `<h1>` |
| `subtitle` | `2026/10/11–17　7天6夜自駕　V4` | 舊 template 的 `.sub` |
| `description` | 舊 `build.js` 的 `DESC` | 同左 |
| `dates` | `2026-10-11` → `2026-10-17` | |
| `region` | `JP`、bbox `[139.95, 37.85, 141.45, 39.0]` | spec §2 的範例 |
| `transport` | `["drive"]` | 這趟是自駕 |
| `party` | `5` | 舊 template 寫死的「五人」 |
| `currency` | `¥` | |
| `sections` | 四個全開（`mapLists` 這趟有做） | |
| `theme` | `accent: "#B0552D"`、`favicon: "🗾"` | 舊 build.js 的 favicon |
| `basemap` | `dem: "gsi"`、`detail: "normal"`、`contourLevels: [200,400,600,800,1000,1300,1600]` | 沿用舊的手選層級，讓地圖與線上版一致 |
| `deploy` | **`target: "pages"`、`name: "sentai2026"`** | 沿用原 Pages 專案，網址不變 |

`schemaVersion` 先**不要寫**（或寫 0），讓 migrate 自己補成 1。

- [x] **Step 2: 跑 migrate**

```bash
npm run migrate -- sendai-2026
```

它會：`jp` → `local`、`leg.drive` → `time`、`leg.road` → `via`、每個 leg 補 `mode`、
`STAYS` 補 `day`、拆掉 `data.js` 尾端的接線、建立空的 `OVERVIEW`、把 `schemaVersion` 升到 1。

**仔細讀它印出的人工待辦**，特別是「`details.info` 裡的停車資訊要不要轉成 `parking`」那幾條。
原檔會備份成 `<檔名>.bak`。

- [x] **Step 3: 把備份檔排除在 git 之外**

`.bak` 不要進 git。跑完確認 `git status` 沒有它們，有的話加進 `.gitignore`：

```
trips/*/*.bak
```

- [x] **Step 4: 填 `OVERVIEW`**

migrate 只會建一個空殼。從舊 `template.html` 的 `overviewHTML()` 把寫死的文字搬進來
（在 `main` 分支的 `src/template.html` 第 921–972 行，用
`git show main:src/template.html | sed -n '921,972p'` 取得）：

- `checked`：`2026/09/17`
- `dining.hint`／`dining.notes[]`／`dining.chips[]`：餐食與訂位那一段的文字與三個 chip
- `stays.title`（`六個晚上，三個落腳處`）／`stays.hint`／`stays.arrive`（`10/11 抵達`）／`stays.depart`（`10/17 返程`）
- `addonsHint`：加點建議的說明
- `foot[]`：三段頁尾文字（路線查核日期、地圖來源、航班與租車）

**航班那一段含真實航班資訊**——它本來就在線上版上，搬過來是對的（這是使用者自己的私人頁面）。
但**不要**把它複製回 travel-planner 的任何地方。

- [x] **Step 5: 補 `parking` 欄位**

migrate 會列出哪些地點的 `details.info` 有「停車」列。逐一判斷要不要轉成
`PLACES[key].parking`（需要停車場的**座標**，`info` 裡通常只有文字）。

查不到座標的就**留在 `info` 不要硬轉**，並在 `CHECKLIST` 加一條待確認。
這一步寧可少做也不要編座標——編錯的停車場座標會把人導到別的地方。

- [x] **Step 6: 補三個插槽檔與 status**

```bash
printf '/* 沿用引擎預設配色。 */\n' > trips/sendai-2026/theme.css
printf '// 沒有額外區塊。\nmodule.exports = { sections: [] };\n' > trips/sendai-2026/extra.js
```

`docs/status.md` 記錄：這是從 v4 搬過來的、搬移日期、目前狀態。

- [x] **Step 7: 重新產生底圖**

舊的 `basemap.json` 沒有 `meta.bbox`，`check` 會擋。重跑：

```bash
npm run basemap -- sendai-2026
```

`contourLevels` 已在 config 指定成舊的七個值，所以等高線會與線上版一致。
Overpass 失敗就等幾分鐘重試，**不要縮小 bbox**。

- [x] **Step 8: check 過關**

```bash
npm run check -- sendai-2026
```

反覆修到通過。錯誤訊息就是待辦清單。

- [x] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: 行程資料升到 schemaVersion 1 並補齊 OVERVIEW 與 parking

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 與線上版逐頁比對

**Files:**
- Create: `trips/sendai-2026/docs/migration-parity.md`

**Interfaces:**
- Consumes: Task 2 的產出
- Produces: 一份比對報告與截圖，給使用者驗收用

- [x] **Step 1: 用 worktree 把舊版 build 出來**

**不要 `git stash` 或切分支**，用 worktree 把 `main` 檢出到暫存目錄：

```bash
SCRATCH=<你的 scratchpad 目錄>
git worktree add $SCRATCH/sentai-main main
cd $SCRATCH/sentai-main && node scripts/build.js
```

舊 build 沒有執行期相依，`node scripts/build.js` 應該直接可跑。
產物在 `$SCRATCH/sentai-main/dist/index.html`。

- [x] **Step 2: 把新版 build 出來**

```bash
cd /Users/wangch/GitHub/SENTAI2026
npm run build -- sendai-2026
```

產物在 `dist/sendai-2026/site/index.html`。

- [x] **Step 3: 先用文字比對抓大差異**

不要一開始就用眼睛看。先比數字——停留點數、餐食區塊數、詳細按鈕數、照片數、
地圖清單連結數、檔案大小。數量對不上就先查原因，再進到肉眼比對。

- [x] **Step 4: 用 ego-browser 逐頁比對**

兩份都開起來，**逐項截圖對照**下面六個地方：

1. **總覽**：住宿色條（六晚三處）、七天主軸表、加點建議、行前清單筆數
2. **七天**：每一天都切過去看，交通段落的距離／車程／預留、餐食區塊
3. **燈箱**：至少三個地點——一個景點、一個住宿、一個餐廳，看照片、看點、參考資料、停車
4. **餐飲**：自煮那一天的預算文字（新版由 `money()` 算，舊版是寫死的字串）
5. **地圖**：海岸線、等高線、松島灣島嶼、當日動線與標記
6. **手機寬度**：390px，總覽表格的分隔式資訊卡、地圖 FAB

- [x] **Step 5: 寫比對報告**

`trips/sendai-2026/docs/migration-parity.md`，固定四節：
**怎麼比的** → **數字對照表** → **逐頁肉眼比對**（六項，每項寫結論與截圖檔名）→
**差異清單**（每一條寫：哪裡不同、為什麼、要不要修）。

預期會有的差異（不是 bug）：

- 餐飲金額的文字格式：舊版寫死「五人約 ¥…」，新版由 `money()` 依 `party` 算
- 地點的「地圖為街區概略位置」note：舊版是接線時統一塞的，新版要看 migrate 有沒有保留
- 燈箱底部的註記文字：新版改成中性的「照片來源標於各張下方」

- [x] **Step 6: 清掉 worktree**

```bash
git worktree remove $SCRATCH/sentai-main
git worktree list        # 確認乾淨
```

- [x] **Step 7: Commit**

```bash
git add trips/sendai-2026/docs/migration-parity.md
git commit -m "docs: 與線上版的逐頁比對報告

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 交給使用者

**這一階段到此為止。不要 merge、不要 push main、不要部署。**

- [x] **Step 1: 最後確認**

```bash
cd /Users/wangch/GitHub/SENTAI2026
git branch                    # 在 dev 上
git log --oneline main..dev   # 列出這次的 commit
git status --short            # 乾淨
npm test && npm run check -- sendai-2026 && npm run build -- sendai-2026
```

- [x] **Step 2: 問使用者要不要把 `dev` 推上 GitHub**

推分支是對外的動作，**要先問**。他說要的話：

```bash
git push -u origin dev
```

若 Pages 專案有接 GitHub 整合，推 `dev` 可能會觸發一個 preview 部署
（不會蓋掉 production）。先跟使用者說明這件事再推。

- [x] **Step 3: 回報**

給使用者：

- `dev` 分支上做了什麼（幾個 commit、改了什麼）
- 比對報告的結論與截圖
- **他接下來要做的事**：review `dev` → merge 到 `main` → 切換部署
- 差異清單裡還沒解決的項目（如果有）

---

## 完成後的狀態

- SENTAI2026 的 `dev` 分支是一個 travel-planner 的 fork，行程在 `trips/sendai-2026/`。
- `main` 一個 commit 都沒動，線上版完全不受影響。
- 比對報告證明新舊產出一致，差異都有解釋。
- merge 與部署的決定權在使用者手上。

## 下一階段的接續點

- **第 6 階段（朋友試跑）**：**不要自己做**，需要真人。找一位朋友實際跑一次
  `tp-setup` → `tp-plan`，記錄卡住的地方，回流成 issue 或 skill 的修正。
