# Skills 與文件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 travel-planner 變成一個「朋友 fork 下來、對自己的 coding agent 說一句話就能開始做」的模板。建立 `.ai/` 作為 agent 文件的唯一來源、寫八個 `tp-*` skill 與四份 rules、同步出 `AGENTS.md`／`CLAUDE.md`、手寫 `GEMINI.md`、補上 issue 模板，然後發佈 v1.0.0。

**Architecture:** `.ai/` 是唯一來源，`scripts/sync-agent-assets.mjs`（由 agent-assets-kit 安裝）把它同步成各工具讀得到的檔案。skills 是純 Markdown 的方法論，不含任何可執行程式；`tp-research` 的細節放 `references/`，讓 SKILL.md 本身保持精簡。四份 rules 是「不管在做什麼都適用」的硬規則。測試守住「文件與程式碼不脫節」：每個 npm 指令、每個 skill、每個人類閘門都要有測試確認它真的被寫進文件。

**Tech Stack:** Markdown、`node:test`。安裝 `.ai/` 骨架時一次性使用 `pnpm dlx`（**唯一容許用到 pnpm 的地方**，它是 installer 不是專案相依）。

**Spec:** `docs/superpowers/specs/2026-09-18-travel-planner-template-design.md`（§6 Skills、§7 版本與更新機制）

**本計畫範圍：** spec §10 實作順序的第 4 階段。結束時 `.ai/` 建好並 sync 出 `AGENTS.md`／`CLAUDE.md`／`GEMINI.md`、八個 skill 寫完、README／CHANGELOG／issue 模板齊備、tag v1.0.0。**不含** SENTAI2026 搬家（第 5 階段）。

## Global Constraints

- Node.js ≥ 20；套件管理器為 **npm**。**唯一的例外**是 Task 1 的 `pnpm dlx github:wangch15/agent-assets-kit setup`，那是一次性 installer，不會變成專案相依。
- **不得新增任何執行期相依套件**（`pngjs` 仍是唯一一個）。
- 所有 skill 與 rules 一律繁體中文。
- skills 是方法論文件，**不得包含要 agent 複製貼上的程式碼**；要跑的指令一律指向既有的 `npm run …`。
- **不得在 skill 或 rules 裡寫任何特定行程的專有名詞**（地名、店名、航班、人名）。
- 三道人類閘門必須寫進文件並有測試把關：plan.md 確認後才研究、preview 看過才 ship、任何花錢或代表使用者的動作只給連結。
- 檔案上限 800 行。
- commit 訊息格式 `<type>: <描述>`，結尾加 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`。
- 工作目錄一律 `/Users/wangch/GitHub/travel-planner`。**不得修改 `/Users/wangch/GitHub/SENTAI2026` 的任何檔案。**
- 要在瀏覽器看版面時用 **ego-browser（ego lite）**。

## 已經取得的人類授權

agent-assets-kit 的 `--dry-run` 已經跑過，結果給使用者看過並**已核准**（2026-09-18）。它會寫入這 6 個檔（全部是新建，無覆寫）與 `package.json` 的一行：

```
.ai/README.md
.ai/commands/create-rule-folder.md
.ai/entrypoints/project-context.md
.ai/rules/agent-asset-management-rules.md
.ai/skills/create-rule-folder/SKILL.md
scripts/sync-agent-assets.mjs
+ package.json: scripts.sync:agent-assets
```

**不要加 `--force`。** 若實際寫入的檔案與上面這份清單不符，停下來問人。

## File Structure

| 檔案 | 責任 |
|---|---|
| `.ai/entrypoints/project-context.md` | AGENTS.md 的本體：這個 repo 是什麼、引擎／內容邊界、路由表、開工檢查 |
| `.ai/rules/engine-content-boundary.md` | spec §2 的硬邊界 |
| `.ai/rules/data-schema-reference.md` | 指路 `docs/schema/` |
| `.ai/rules/research-integrity.md` | 每個事實附連結與查核日期；查不到標待確認 |
| `.ai/rules/privacy.md` | 什麼只能進 `trips/<slug>/docs/` |
| `.ai/skills/tp-setup/SKILL.md` | 一次性環境準備，標出人類必做的步驟 |
| `.ai/skills/tp-plan/SKILL.md` | 收初版 → 盤點 → 問 → `npm run new` → plan.md → **閘門一** |
| `.ai/skills/tp-research/SKILL.md` + `references/` | 查核方法論，六份 reference |
| `.ai/skills/tp-basemap/SKILL.md` | 跑底圖、看警告、Overpass 限流怎麼辦 |
| `.ai/skills/tp-photos/SKILL.md` | 找圖、授權規則、抓圖 |
| `.ai/skills/tp-ship/SKILL.md` | check → build → preview → **閘門二** → ship |
| `.ai/skills/tp-update/SKILL.md` | `git fetch upstream` → merge → migrate → 重跑 |
| `.ai/skills/tp-maps-lists/SKILL.md` | 人建 Maps 清單、agent 對帳 |
| `GEMINI.md` | 手寫三行，指向 AGENTS.md |
| `.github/ISSUE_TEMPLATE/` | bug 與 feature 兩個模板 |
| `tests/agent-docs.test.js` | 文件與程式碼不脫節的守門測試 |

---

### Task 1: 安裝 `.ai/` 骨架

**Files:**
- Create（由 installer 產生）：上面那 6 個檔
- Modify: `package.json`（installer 加一行）

**Interfaces:**
- Consumes: 無
- Produces: `.ai/` 目錄與 `scripts/sync-agent-assets.mjs`；`npm run sync:agent-assets` 可用

- [ ] **Step 1: 執行 setup（已獲授權，不要加 --force）**

Run: `pnpm dlx github:wangch15/agent-assets-kit setup`
Expected: 寫入那 6 個檔，並把 `sync:agent-assets` 加進 `package.json`

- [ ] **Step 2: 確認實際寫入的檔案與 dry-run 一致**

Run: `git status --short && node -e "console.log(Object.keys(require('./package.json').scripts).join(', '))"`
Expected: 只有那 6 個檔是新增、`package.json` 被改；scripts 多了 `sync:agent-assets`，原本的 9 個都還在。
**若有任何預期外的檔案被改動或刪除，停下來問人，不要自己判斷。**

- [ ] **Step 3: 跑一次 sync，看它產出什麼**

Run: `npm run sync:agent-assets && git status --short`
Expected: 產出 `AGENTS.md` 與 `CLAUDE.md`（可能還有工具專屬目錄）。把實際產出的清單記下來，Task 6 要用。

- [ ] **Step 4: 確認 `.gitignore` 沒有把 `.ai/` 或產物擋掉**

Run: `git check-ignore -v .ai/README.md AGENTS.md CLAUDE.md || echo "都沒有被 ignore"`
Expected: 印出「都沒有被 ignore」

- [ ] **Step 5: 全部測試仍然通過**

Run: `npm test`
Expected: PASS（134 個）

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: 以 agent-assets-kit 建立 .ai 骨架

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 四份 rules

**Files:**
- Create: `.ai/rules/engine-content-boundary.md`、`data-schema-reference.md`、`research-integrity.md`、`privacy.md`

**Interfaces:**
- Consumes: 無
- Produces: 四份 Markdown。每份都以一句話的「什麼時候適用」開頭，再列規則。

- [ ] **Step 1: 寫 `.ai/rules/engine-content-boundary.md`**

固定四節：**這條邊界是什麼** → **哪些是引擎、哪些是內容**（照 spec §2 的目錄表）→ **為什麼重要**（作者與行程擁有者的 commit 檔案集合不相交，`git merge upstream/main` 才不會衝突）→ **想改引擎之前**（先試 `theme.css` 換配色、`extra.js` 加區塊；真的改了要記進 `trips/<slug>/docs/engine-changes.md`，並說明為什麼插槽做不到）。

明列：引擎是 `src/`、`scripts/`、`tools/`、`.ai/`、`docs/schema/`、`public/`；內容是 `trips/<slug>/`。`dist/` 整個 gitignore。

- [ ] **Step 2: 寫 `.ai/rules/data-schema-reference.md`**

**只放指路，不要把欄位表複製過來**（複製就會脫節）。內容：改任何一個資料檔之前先讀 `docs/schema/` 對應那一份；六個檔對六份文件的對照表；改完一定要跑 `npm run check -- <slug>`；`check` 的錯誤訊息就是待辦清單，不要為了讓它過而刪資料。

- [ ] **Step 3: 寫 `.ai/rules/research-integrity.md`**

規則：

- 每個寫進資料檔的事實都要有出處 URL 與查核日期，放進 `refs` 或 `docs/sources.md`。
- 查不到就寫「待確認」並推進 `CHECKLIST`，**不要編造**營業時間、票價、車程。
- 官網與第三方摘要衝突時以官網為準，並在 `docs/sources.md` 記下衝突。
- 距離與時間是「規劃查核當下」的結果，不是旅遊當天的預報——文案不要寫成保證。
- **沒有瀏覽器或搜尋工具的 agent 要停下來說明**，不要用記憶裡的內容填表。
- 完成的定義是 `npm run check -- <slug>` 通過**且** `docs/sources.md` 列得出每一條的來源。

- [ ] **Step 4: 寫 `.ai/rules/privacy.md`**

規則：

- 這些只進 `trips/<slug>/docs/`，**永遠不進資料檔**：飲食限制與過敏、訂房確認碼、門鎖密碼、聯絡電話、護照與證件、付款資訊。
- `trips/<slug>/docs/` 不會進入 build 產物（有測試把關）。
- 網站帶 `noindex` 與 `robots.txt` 的 `Disallow: /`，但**拿到網址就能看**，不是密碼保護——要跟使用者講清楚這一點。
- 勾選狀態只存在瀏覽器 localStorage，不同步、不上傳。
- 住宿座標用街區層級並標 `approximate: true`，不要把確切門牌寫進公開頁面。

- [ ] **Step 5: Commit**

```bash
git add .ai/rules
git commit -m "docs: 四份 agent rules

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `tp-setup`、`tp-plan`、`tp-maps-lists`

這三個是「開工到資料進來之前」的 skill。

**Files:**
- Create: `.ai/skills/tp-setup/SKILL.md`、`.ai/skills/tp-plan/SKILL.md`、`.ai/skills/tp-maps-lists/SKILL.md`

**Interfaces:**
- Consumes: Task 2 的 rules
- Produces: 三份 SKILL.md。每份開頭一段 YAML frontmatter：`name`、`description`（一句話說明何時用），其餘為步驟。

- [ ] **Step 1: 寫 `.ai/skills/tp-setup/SKILL.md`**

照 spec §6 的六步，**把人類必做的步驟用粗體標出來並明確停下來等**：

1. 檢查 Node ≥ 20、git、gh、wrangler（缺的給安裝指令；wrangler 是 devDependency，`npm install` 就有）。
2. **人類必做**：註冊 GitHub 帳號（若無）。`gh auth login` → 瀏覽器授權。
3. `gh repo fork wangch15/travel-planner --clone`；確認 `origin` 是自己、`upstream` 是模板（`git remote -v`）。
4. `npm install`、`npm test`（全綠才往下走）。
5. **人類必做**：註冊 Cloudflare 帳號（若無）。`npx wrangler login` → 瀏覽器授權。
6. 說明首次 `npm run ship` 會被問要不要註冊 workers.dev 子網域，選是；網址會是 `<deploy.name>.<帳號>.workers.dev`。

結尾加一節「agent 不做的事」：不代替使用者註冊帳號、不代填密碼、不代授權。

- [ ] **Step 2: 寫 `.ai/skills/tp-plan/SKILL.md`**

照 spec §6 的六步：

1. 收初版（文字、檔案、口述）→ 寫 `trips/<slug>/docs/brief.md` 草稿。
2. 完整性盤點。**必要區塊清單是提示，問題由 agent 自己列**：日期與抵達方式／目的地區域／每晚住宿（已訂哪間、要找哪間）／交通方式（自駕→租車細節；大眾運輸→pass）／同行人數與體力／飲食限制／必去與不去／預算感／行程鬆緊。**只問缺的，一次問完**，不要一題一題來回。
3. 等回答，補齊 brief。每個區塊標明是「使用者已定，只查核」或「請 agent 建議」。要找住宿就列候選附連結——**agent 不代訂任何東西**。
4. `npm run new -- <slug>`，填 `trip.config.json`（bbox 怎麼抓：把所有目的地包進去再留一點邊）。
5. 寫 `docs/plan.md`：逐日文字草案，每天含備案與待確認事項。
6. **閘門一**：請人確認 `plan.md`。**確認前不要碰五個資料檔、不要做深度查核。**

- [ ] **Step 3: 寫 `.ai/skills/tp-maps-lists/SKILL.md`**

選用的 skill。內容：`trip.config` 的 `sections.mapLists` 為 `false` 時整個跳過；**順序很重要**——人先在 Google Maps 建每日私人清單並把地點加進去，agent 再對帳填 `map-lists.js`，反過來做會讓檔案通過驗證但手機上的清單少東西；`npm run check` 會驗證清單涵蓋當天所有 stop／meal／alt。

- [ ] **Step 4: Commit**

```bash
git add .ai/skills/tp-setup .ai/skills/tp-plan .ai/skills/tp-maps-lists
git commit -m "docs: tp-setup、tp-plan、tp-maps-lists skills

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `tp-research` 與六份 reference

**Files:**
- Create: `.ai/skills/tp-research/SKILL.md`、`.ai/skills/tp-research/references/{places,routes,parking,dining,alternatives,photos}.md`

**Interfaces:**
- Consumes: Task 2 的 `research-integrity.md`
- Produces: 一份精簡的 SKILL.md 與六份 reference。

- [ ] **Step 1: 寫 `.ai/skills/tp-research/SKILL.md`（保持精簡）**

只寫：什麼時候用（閘門一通過之後）、六份 reference 的路由表（要查地點讀 `places.md`、要查路線讀 `routes.md`…）、完成條件（五個資料檔寫好、`npm run check` 通過、`docs/sources.md` 列出所有來源與日期）、以及「不確定就標待確認」這條底線。**細節一律放 references/，不要寫進 SKILL.md。**

- [ ] **Step 2: 寫 `references/places.md`**

每個地點要查：座標（Nominatim／Overpass 或 Google Maps，注意連鎖店會配到別的分店）、當地語言名稱（填 `local`，地圖搜尋用）、官網的營業時間與費用、**旅行當天是否公休或有活動管制**、建議停留時間、為何值得去（寫進 `summary`，至少 40 字）、`refs` 至少一筆官方來源。

- [ ] **Step 3: 寫 `references/routes.md`**

自駕：用**實際停留點的座標**（不是參考地標）查 Google Maps 路線，記距離／時間／主要道路／是否收費／查核日期 → `docs/route-check.md`，再寫進 `leg`（`mode: 'drive'`，`dist` 必填）。
大眾運輸：官方時刻表或 Google 轉乘，記路線名／時間／票價／班距 → `leg`（`mode: 'transit'`，`via` 必填寫路線名）。
緩衝規則：市區與轉乘多的日子抓 1.3 倍，山路與旺季抓 1.5 倍，並寫進 `buffer`；車程不含休息、找車位、景區接駁。

- [ ] **Step 4: 寫 `references/parking.md`**

自駕行程**每個景點都要查**：官方停車場或最近的合法停車場、費用、容量、注意事項（旺季客滿、單行道、禁止進入）→ 填 `PLACES[key].parking`（`lat`／`lng` 必填，其餘選填）。查不到就在 `note` 標待確認並推進 `CHECKLIST`，不要猜。有 `parking` 的地點，導航連結會指向停車場座標，而且會出現在每日頁尾的停車彙整。

- [ ] **Step 5: 寫 `references/dining.md`**

每個餐段：主選＋備案、**那一天那個星期幾**的營業時間（公休日常常是週幾而不是日期）、訂位方式與是否接受、菜色與每人價位（填 `venues[key].budget`）、超市熟食後備。**使用者的飲食限制只用來挑店，不要寫進資料檔**（那屬於 `docs/`）→ 過程記 `docs/dining-research.md`。

- [ ] **Step 6: 寫 `references/alternatives.md`**

每天至少想三種替代：下雨版、走累版、店休版，寫進 `day.alts`；被引用的地點要有 `details`。`ADDONS` 要附時間成本（`cost`），讓人知道砍掉會省多少。

- [ ] **Step 7: 寫 `references/photos.md`**

Commons 優先，`license` 必須符合 `CC` 或 `Public domain`，並附 `page`（檔案頁面）。沒有 Commons 就用官網照片，填 `url` 與 `credit`。**授權不明一律不要收**——`npm run check` 會擋。怎麼找：Commons 搜尋、看檔案頁的授權欄位、確認不是「僅供編輯使用」。填好 `photos.json` 後跑 `npm run photos -- <slug>`。

- [ ] **Step 8: Commit**

```bash
git add .ai/skills/tp-research
git commit -m "docs: tp-research skill 與六份 reference

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `tp-basemap`、`tp-photos`、`tp-ship`、`tp-update`

**Files:**
- Create: `.ai/skills/tp-basemap/SKILL.md`、`tp-photos/SKILL.md`、`tp-ship/SKILL.md`、`tp-update/SKILL.md`

**Interfaces:**
- Consumes: Task 2 的 rules
- Produces: 四份 SKILL.md

- [ ] **Step 1: 寫 `.ai/skills/tp-basemap/SKILL.md`**

內容：先確認 `trip.config` 的 `region.bbox` 已經填好且涵蓋所有地點 → `npm run basemap -- <slug>` → 看輸出的島數、等高線層級、檔案大小 → 超過 600 KB 就把 `basemap.detail` 改成 `low` 重跑 → `npm run preview` 肉眼確認海陸沒有畫反、山勢有浮現。

**必寫的一節「Overpass 失敗怎麼辦」**：公共 API 有速率限制與偶發逾時，失敗時等幾分鐘再跑（快取還在，不會重抓已經成功的部分）；指令本身會自動換鏡像重試。**不要為了讓它過而縮小 bbox 或把 `detail` 降到 `low`**——那會讓地圖失真而不是解決問題。

`basemap.dem`：日本用 `gsi`，其他地區用 `terrarium`，`auto` 會自己選。

- [ ] **Step 2: 寫 `.ai/skills/tp-photos/SKILL.md`**

內容：填 `photos.json`（格式指向 `docs/schema/photos.md`）→ `npm run photos -- <slug>` → 預設只補缺的、`--force` 全部重抓 → 檔名是 `<placeKey>-<n>.jpg`，`n` 對應陣列順序 → `npm run build` 只會收實際存在的檔案，所以少抓幾張不會壞掉 → 在 preview 的燈箱確認照片與 credit 都正確。

**必寫**：授權不明就不要收；官網照片要標 credit 與來源頁；單張失敗會列出原因，把那一筆從 `photos.json` 拿掉或換一張，不要硬塞。

- [ ] **Step 3: 寫 `.ai/skills/tp-ship/SKILL.md`**

流程：`npm run check` → `npm run build` → `npm run preview` → **閘門二** → `npm run ship` → 回報網址。

閘門二要**明確列出請人看哪幾個地方**：總覽（住宿色條、天數表）、任選一天的詳細行程（交通段落、餐食）、任一個燈箱（照片、參考資料）、手機寬度。**不要自己判斷「看起來沒問題」就 ship。**

首次部署：要先 `npx wrangler login`（瀏覽器授權，**人類必做**）；新帳號會被問要不要註冊 workers.dev 子網域，選是。**沒登入就不要硬試，回報並停下。**

維護模式：收到改動請求 → 對應到哪個資料檔（用 `docs/schema/` 的對照表）→ 改 → 重跑 check／build／preview → 再走一次閘門二。

- [ ] **Step 4: 寫 `.ai/skills/tp-update/SKILL.md`**

流程：`git fetch upstream` → 列出落後幾個 commit 與 `CHANGELOG.md` 的摘要（特別是「資料需要 migrate：是／否」那一行）→ 問使用者要不要更新 → `git merge upstream/main` → `npm install` → 需要的話 `npm run migrate -- <slug>` → `npm run check` → `npm run build` → `npm run preview` → 閘門二 → `npm run ship`。

**衝突策略**：引擎檔（`src/`、`scripts/`、`tools/`、`docs/schema/`、`public/`）取上游；`trips/` 取本地；其他對照 `trips/<slug>/docs/engine-changes.md` 逐一解。若 `engine-changes.md` 不存在而引擎檔仍衝突，代表有人改過引擎卻沒記錄——停下來問人。

- [ ] **Step 5: Commit**

```bash
git add .ai/skills/tp-basemap .ai/skills/tp-photos .ai/skills/tp-ship .ai/skills/tp-update
git commit -m "docs: tp-basemap、tp-photos、tp-ship、tp-update skills

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `project-context.md`、同步、`GEMINI.md`

**Files:**
- Modify: `.ai/entrypoints/project-context.md`
- Create: `GEMINI.md`
- Generated: `AGENTS.md`、`CLAUDE.md`（由 sync 產生，進 git）

**Interfaces:**
- Consumes: Task 1 的 sync 腳本、Task 2–5 的 rules 與 skills
- Produces: `AGENTS.md` 與 `CLAUDE.md` 同步產物；`GEMINI.md` 手寫

- [ ] **Step 1: 改寫 `.ai/entrypoints/project-context.md`**

把 installer 給的預設內容換成 travel-planner 的。固定六節：

1. **這個 repo 是什麼**：一句話，加「主要使用者是非技術背景的行程擁有者，他們透過你來操作這個 repo」。
2. **引擎／內容邊界**：一段摘要 + 指向 `.ai/rules/engine-content-boundary.md`。
3. **路由表**：什麼請求讀哪個 skill。至少涵蓋——「我要開始做一個行程」→ `tp-setup` 然後 `tp-plan`；「幫我查景點／餐廳／路線」→ `tp-research`；「地圖怎麼產」→ `tp-basemap`；「要加照片」→ `tp-photos`；「可以上線了」→ `tp-ship`；「模板有更新」→ `tp-update`；「我建了 Google Maps 清單」→ `tp-maps-lists`。
4. **開工先做**：`git fetch upstream` 並回報落後幾個 commit，問使用者要不要先更新（指向 `tp-update`）。
5. **硬規則指路**：四份 rules 各一行。
6. **改引擎之前**：先試 `theme.css` 與 `extra.js`；真的改了要記 `trips/<slug>/docs/engine-changes.md`，並考慮用 `.github/ISSUE_TEMPLATE/` 回報給模板作者。

- [ ] **Step 2: 執行同步**

Run: `npm run sync:agent-assets && git status --short`
Expected: `AGENTS.md`、`CLAUDE.md` 更新成新的內容

- [ ] **Step 3: 確認同步產物真的包含新內容**

Run: `grep -c "tp-research\|tp-ship" AGENTS.md CLAUDE.md`
Expected: 兩個檔都 > 0。若產物沒有跟上，先確認 sync 腳本的來源路徑，**不要手動編輯產物**（下次 sync 會被蓋掉）。

- [ ] **Step 4: 手寫 `GEMINI.md`**

Gemini CLI 到 v0.49 仍不預設讀 `AGENTS.md`（[issue #28227](https://github.com/google-gemini/gemini-cli/issues/28227)），所以這一份要手寫且**不由 sync 管理**：

```markdown
# GEMINI.md

這個專案的 agent 說明統一放在 [AGENTS.md](./AGENTS.md)，請先讀那一份。

（Gemini CLI 目前不會自動讀 AGENTS.md，所以這裡放一個指路檔。內容不要寫在這裡，
改 `.ai/entrypoints/project-context.md` 再跑 `npm run sync:agent-assets`。）
```

- [ ] **Step 5: Commit**

```bash
git add .ai/entrypoints AGENTS.md CLAUDE.md GEMINI.md
git commit -m "docs: project-context、AGENTS/CLAUDE 同步產物與 GEMINI 指路檔

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: issue 模板、守門測試、README、v1.0.0

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug.md`、`feature.md`、`tests/agent-docs.test.js`
- Modify: `README.md`、`CHANGELOG.md`、`package.json`

**Interfaces:**
- Consumes: Task 2–6 的所有文件
- Produces: 兩個 issue 模板；一組確保文件與程式碼不脫節的測試

- [ ] **Step 1: 寫兩個 issue 模板**

`.github/ISSUE_TEMPLATE/bug.md`：frontmatter 有 `name`、`about`、`labels: bug`。欄位：引擎版本（`package.json` 的 `version`）、行程 slug、跑了什麼指令、預期什麼、實際發生什麼（附完整錯誤訊息）、Node 版本與作業系統。加一句「請不要貼上任何個人資料（訂單號、聯絡方式、門鎖密碼）」。

`.github/ISSUE_TEMPLATE/feature.md`：frontmatter `labels: enhancement`。欄位：引擎版本、想做到什麼、**為什麼 `theme.css` 與 `extra.js` 兩個插槽做不到**（這一題是重點，逼提案先試過插槽）、如果自己改了引擎請附 `engine-changes.md` 的摘要。

- [ ] **Step 2: 寫守門測試 `tests/agent-docs.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const SKILLS = ['tp-setup', 'tp-plan', 'tp-research', 'tp-basemap', 'tp-photos', 'tp-ship', 'tp-update', 'tp-maps-lists'];
const RULES = ['engine-content-boundary', 'data-schema-reference', 'research-integrity', 'privacy'];
const REFS = ['places', 'routes', 'parking', 'dining', 'alternatives', 'photos'];

test('八個 tp-* skill 都在', () => {
  for (const s of SKILLS) assert.ok(exists(`.ai/skills/${s}/SKILL.md`), `缺 ${s}`);
});

test('四份 rules 都在', () => {
  for (const r of RULES) assert.ok(exists(`.ai/rules/${r}.md`), `缺 ${r}`);
});

test('tp-research 的六份 reference 都在', () => {
  for (const r of REFS) assert.ok(exists(`.ai/skills/tp-research/references/${r}.md`), `缺 ${r}`);
});

test('每個 npm 指令都有 skill 或 README 提到', () => {
  const cmds = Object.keys(JSON.parse(read('package.json')).scripts)
    .filter((c) => !['test', 'sync:agent-assets'].includes(c));
  const docs = SKILLS.map((s) => read(`.ai/skills/${s}/SKILL.md`)).join('\n') + read('README.md');
  for (const c of cmds) assert.ok(docs.includes(`npm run ${c}`), `沒有任何文件提到 npm run ${c}`);
});

test('AGENTS.md 的路由表涵蓋每一個 skill', () => {
  const agents = read('AGENTS.md');
  for (const s of SKILLS) assert.ok(agents.includes(s), `AGENTS.md 沒有提到 ${s}`);
});

test('GEMINI.md 指向 AGENTS.md', () => {
  assert.ok(read('GEMINI.md').includes('AGENTS.md'));
});

test('三道人類閘門都寫進 skills', () => {
  assert.ok(read('.ai/skills/tp-plan/SKILL.md').includes('閘門一'), 'tp-plan 缺閘門一');
  assert.ok(read('.ai/skills/tp-ship/SKILL.md').includes('閘門二'), 'tp-ship 缺閘門二');
  const all = SKILLS.map((s) => read(`.ai/skills/${s}/SKILL.md`)).join('\n');
  assert.ok(/不代訂|不代替|只給連結/.test(all), '沒有寫明 agent 不代替使用者花錢或註冊');
});

test('privacy 規則列出不得進資料檔的項目', () => {
  const p = read('.ai/rules/privacy.md');
  for (const w of ['飲食限制', '密碼', 'docs/']) assert.ok(p.includes(w), `privacy.md 缺 ${w}`);
});

test('research-integrity 要求附來源與查核日期', () => {
  const r = read('.ai/rules/research-integrity.md');
  assert.ok(r.includes('待確認'));
  assert.ok(/查核日期|查閱日期/.test(r));
});

test('兩個 issue 模板都在，且要求填引擎版本', () => {
  for (const f of ['bug.md', 'feature.md']) {
    assert.ok(exists(`.github/ISSUE_TEMPLATE/${f}`), `缺 ${f}`);
    assert.ok(read(`.github/ISSUE_TEMPLATE/${f}`).includes('版本'), `${f} 沒有要求填版本`);
  }
});

test('skills 與 rules 不含特定行程的專有名詞', () => {
  const all = SKILLS.map((s) => read(`.ai/skills/${s}/SKILL.md`)).join('\n')
    + REFS.map((r) => read(`.ai/skills/tp-research/references/${r}.md`)).join('\n')
    + RULES.map((r) => read(`.ai/rules/${r}.md`)).join('\n');
  for (const w of ['仙台', '山形', '鳴子', '松島', '星宇', 'sendai-2026']) {
    assert.ok(!all.includes(w), `skills/rules 不該出現行程專屬字眼：${w}`);
  }
});
```

- [ ] **Step 3: 執行測試，缺什麼補什麼**

Run: `node --test tests/agent-docs.test.js`
Expected: PASS。失敗時**補文件，不要放寬測試**。

- [ ] **Step 4: 更新 `README.md`**

把「目前是第 3 階段」那段拿掉（v1.0.0 就是完整版了）。新增一節「怎麼開始」：把 repo 網址給你的 coding agent，說「請讀 AGENTS.md，我想做一個行程」，其餘照 skill 走。指令表加一列 `npm run sync:agent-assets`。加一節「回報問題」指向 issue 模板。

- [ ] **Step 5: 更新 `CHANGELOG.md` 與版本**

`package.json` 的 `version` 改成 `1.0.0`。`CHANGELOG.md` 最上面加：

```markdown
## 1.0.0（2026-09-18）

- 加入 `.ai/`：agent 文件的唯一來源，`npm run sync:agent-assets` 同步出 `AGENTS.md` 與 `CLAUDE.md`；`GEMINI.md` 為手寫指路檔。
- 八個 skill：tp-setup、tp-plan、tp-research（含六份 reference）、tp-basemap、tp-photos、tp-ship、tp-update、tp-maps-lists。
- 四份 rules：引擎／內容邊界、schema 指路、研究誠信、隱私。
- 加入 bug 與 feature 兩個 issue 模板。
- 資料需要 migrate：否。
```

- [ ] **Step 6: 全部測試與完整流程最後跑一次**

Run: `npm test && npm run check -- _example && npm run build -- _example`
Expected: 全部 PASS

- [ ] **Step 7: Commit 並打 tag**

```bash
git add .github README.md CHANGELOG.md package.json tests/agent-docs.test.js
git commit -m "docs: issue 模板、文件守門測試與 README

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git tag v1.0.0
```

---

## 完成後的狀態

- `.ai/` 是唯一來源，`AGENTS.md`／`CLAUDE.md` 由 sync 產生、`GEMINI.md` 手寫指路。
- 八個 skill、四份 rules、六份 reference 寫完，並有測試確保它們與 npm 指令、三道人類閘門不脫節。
- issue 模板逼提案人先試過插槽再開 feature request。
- tag v1.0.0，朋友可以 fork 了。

## 下一階段的接續點

- **第 5 階段（SENTAI2026 搬家）**：**動 SENTAI2026 之前必須先問人。** 先建 `legacy-v4` 分支保留舊內容，`main` 換成引擎 + `trips/sendai-2026/`，跑 `migrate`、補 `parking`、`deploy.target` 設 `pages`、`deploy.name` 沿用原 Pages 專案名稱（不換網址）。搬完要與線上版**逐頁比對**（總覽、七天、燈箱、餐飲、地圖、手機寬度），比對結果給人看過才 `ship`。
- **第 6 階段（朋友試跑）**：**不要自己做**，需要真人。做完第 5 階段就停下來回報。
