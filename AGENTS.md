
# AGENTS.md

> 本檔由 `scripts/sync-agent-assets.mjs` 自動產生，不要直接編輯。
> 要改內容請編輯 `.ai/entrypoints/project-context.md` 與 `.ai/rules/*.md`，然後跑 `npm run sync:agent-assets`。

這份文件給在這個 repo 裡工作的 coding agent 看，說明專案的共同規則與流程。

## 這個 repo 是什麼

travel-planner 是一個**可 fork 的旅程網頁模板**。使用者給你一份粗略的行程初稿，
你照著這裡的 skills 把它做成一個互動網頁——有地形圖、逐段交通、餐食與備案、
行前清單——然後部署到他自己的免費 Cloudflare 帳號。

**主要使用者是非技術背景的行程擁有者。** 他們不會自己讀程式碼、不會自己跑指令，
他們透過你來操作這個 repo。所以：

- 用中文講人話，不要丟一堆檔名跟指令要他自己看
- 需要他動手的地方（註冊帳號、瀏覽器授權、訂位）要講清楚並停下來等
- 不要代替他做花錢或代表他身分的事

## 引擎與內容的邊界

這個 repo 分兩半：**引擎**（`src/`、`scripts/`、`tools/`、`.ai/`、`docs/schema/`、
`public/`）是模板作者維護的；**內容**（`trips/<slug>/`）是行程擁有者的。
兩邊檔案集合不相交，所以 `git merge upstream/main` 拿引擎更新不會衝突。

想改外觀先試 `trips/<slug>/theme.css`，想加區塊先試 `trips/<slug>/extra.js`。

→ 完整規則見 `.ai/rules/engine-content-boundary.md`

## 路由表：什麼請求讀哪個 skill

| 使用者說 | 讀 |
|---|---|
| 「我想做一個行程網頁」（第一次，還沒 fork） | `tp-setup`，然後 `tp-plan` |
| 「我想規劃一趟新行程」 | `tp-plan` |
| 「幫我查景點／餐廳／路線／停車」 | `tp-research` |
| 「地圖怎麼來的」「重新產地圖」 | `tp-basemap` |
| 「加照片」「照片沒出來」 | `tp-photos` |
| 「可以了」「上線吧」「改一下某某」 | `tp-ship` |
| 「模板有更新」「升級一下」 | `tp-update` |
| 「我在 Google Maps 建了清單」 | `tp-maps-lists` |

不確定的時候，先問使用者現在做到哪了，再看 `trips/<slug>/docs/status.md`。

## 開工先做

每次開始工作前：

```
git remote -v
git fetch upstream
git log --oneline HEAD..upstream/main
```

`origin` 必須是**使用者自己的** fork、`upstream` 才是 `wangch15/travel-planner`。
**`origin` 指向 `wangch15/travel-planner` 就立刻停下來**——那代表當初是 clone 不是
fork，之後每次 commit 都會推進模板作者的 repo，而且不會報錯。修法見
`.ai/rules/repo-ownership.md`。

**回報落後幾個 commit，並問使用者要不要先更新**（要更新的話走 `tp-update`）。
不要自己決定更新——更新有風險，而且他可能正在趕出發前的準備。

沒有 `upstream` remote 的話代表這不是 fork 或 remote 沒設好，見 `tp-setup` 第 3 步。

## 硬規則

不管在做什麼都適用，先讀過再動手：

- `.ai/rules/repo-ownership.md` —— 在自己的 fork 上工作，永遠不 push 到模板
- `.ai/rules/engine-content-boundary.md` —— 哪些檔案能改、哪些不能
- `.ai/rules/data-schema-reference.md` —— 改資料前先讀 `docs/schema/`
- `.ai/rules/research-integrity.md` —— 每個事實附來源與查核日期，查不到就標待確認
- `.ai/rules/privacy.md` —— 什麼只能進 `trips/<slug>/docs/`

## 三道人類閘門

這三件事**一定要人點頭**，不要自己判斷：

1. **`docs/plan.md` 確認後才做深度查核**（`tp-plan`）
2. **preview 看過才 ship**（`tp-ship`）
3. **任何花錢或代表使用者的動作**——訂房、訂位、註冊帳號——**只給連結，不代做**

## 改引擎之前

先試兩個插槽（`theme.css`、`extra.js`）。真的非改引擎不可時：

- 把改了什麼、為什麼插槽做不到，記進 `trips/<slug>/docs/engine-changes.md`
- 考慮用 `.github/ISSUE_TEMPLATE/feature.md` 回報給模板作者，
  讓它變成引擎的正式功能，你就不用一直自己維護

## 共用規則

這一段由 `.ai/rules/` 自動產生，不要直接改這裡。

## Agent 文件的管理規則

這個專案把「人維護的、跨工具共用的」內容放在 `.ai/`，那是唯一來源。

## 唯一來源

共用內容一律維護在這裡：

- `.ai/rules/`
- `.ai/skills/`
- `.ai/commands/`
- `.ai/workflows/`
- `.ai/entrypoints/`

**不要**在各工具自己的資料夾裡另外維護同一份內容：

- `.agent/`
- `.agents/`
- `.claude/`
- `.codex/`

那些資料夾要當成「同步產物」看待，不是來源。

## 正式進入點

各家工具掃描資料夾的行為不一致，所以要產生並維持這兩個進入點檔案：

- `AGENTS.md` —— 給 Codex 與其他通用 coding agent
- `CLAUDE.md` —— 給 Claude Code

另外 `GEMINI.md` 是手寫的指路檔（Gemini CLI 目前不會自動讀 `AGENTS.md`）。

**不要直接改產物裡的共用規則段落。** 改 `.ai/entrypoints/project-context.md`
或 `.ai/rules/*.md`，然後跑同步指令。

## 什麼放共用、什麼放工具目錄

放 `.ai/`：穩定的、人維護的內容。

留在工具自己的目錄：產生出來的或該工具專屬的東西，例如

- 工具自動產生的 command
- 本機設定
- 快取資料夾
- worktree 狀態
- 第三方工具產生的 skill

## 改了共用內容之後

改動規則、skill、command、workflow 或進入點的內容時：

1. 改 `.ai/` 底下那份來源檔。
2. 跑 `npm run sync:agent-assets`。
3. 檢查 `AGENTS.md`、`CLAUDE.md` 與各工具目錄有沒有跟上。

如果 `AGENTS.md` 或 `CLAUDE.md` 在產生的標題之前有工具自己加的前言，
同步腳本必須保留它。
## 改資料前先讀 schema 文件

**什麼時候適用：** 你要修改 `trips/<slug>/` 底下任何一個資料檔之前。

## 規則

**不要憑印象填欄位。** 每個資料檔都有一份對應的欄位文件，裡面有必填／選填、型別、
範例，以及 `npm run check` 會吐出什麼錯誤訊息。

| 你要改的檔案 | 先讀 |
|---|---|
| `trip.config.json` | `docs/schema/trip-config.md` |
| `data.js` | `docs/schema/data.md` |
| `details.js` | `docs/schema/details.md` |
| `dining.js` | `docs/schema/dining.md` |
| `map-lists.js` | `docs/schema/map-lists.md` |
| `photos.json` | `docs/schema/photos.md` |

這份 rule 刻意**不重複**欄位表——重複就會脫節。以 `docs/schema/` 為準。

## 改完一定要跑

```
npm run check -- <slug>
```

`check` 的錯誤訊息就是你的待辦清單。**不要為了讓它過而刪掉資料或放寬規則**——
那些規則存在的原因是它們對應到頁面上真的會出錯的地方（座標畫到海裡、
燈箱點開是空的、地圖清單少一個點）。
## 引擎與內容的邊界

**什麼時候適用：** 任何時候你要建立或修改這個 repo 裡的檔案。

## 這條邊界是什麼

這個 repo 有兩種東西：**引擎**（模板作者維護）與**內容**（行程擁有者的資料）。
兩邊的檔案集合**不相交**——同一個檔案不會既是引擎又是內容。

## 哪些是引擎、哪些是內容

| | 路徑 | 誰維護 |
|---|---|---|
| 引擎 | `src/`、`scripts/`、`tools/`、`.ai/`、`docs/schema/`、`public/`、`package.json` | 模板作者 |
| 內容 | `trips/<slug>/` 底下全部 | 行程擁有者 |
| 產物 | `dist/` | 誰都不維護，整個 gitignore |

`trips/<slug>/` 裡面：

- 引擎會讀：`trip.config.json`、五個資料檔、`photos/`、`basemap.json`、兩個插槽（`theme.css`、`extra.js`）
- 引擎**永遠不讀**：`docs/`（你的筆記）、`.cache/`（快取，gitignore）

## 為什麼重要

行程擁有者的 fork 要能長期 `git merge upstream/main` 拿到引擎更新。
只要雙方的 commit 只碰各自那一邊，merge 就不會衝突。
一旦你把行程資料寫進 `src/`，或把引擎邏輯寫進 `trips/`，這個保證就沒了。

## 想改引擎之前

**先試插槽，九成的需求插槽就能解決：**

1. 想換顏色、字型、間距 → 改 `trips/<slug>/theme.css`，覆寫 CSS 變數就好。
2. 想加一個引擎沒有的區塊 → 用 `trips/<slug>/extra.js`，可以掛在總覽頁尾或指定那一天的頁尾。

**真的非改引擎不可時：**

- 把改了什麼、為什麼插槽做不到，寫進 `trips/<slug>/docs/engine-changes.md`。
  下次 merge 衝突時，那份筆記就是你怎麼解的依據。
- 考慮用 `.github/ISSUE_TEMPLATE/feature.md` 回報給模板作者，讓它變成引擎的正式功能，
  你就不用一直自己維護那個修改。
## 隱私

**什麼時候適用：** 任何時候你要寫下使用者告訴你的資訊。

## 這些永遠不進資料檔

只能放 `trips/<slug>/docs/`：

- 飲食限制、過敏、身體狀況
- 訂房與訂位的確認碼、訂單編號
- 門鎖密碼、保險箱密碼、Wi-Fi 密碼
- 聯絡電話、電子郵件、通訊軟體帳號
- 護照、證件號碼
- 信用卡與任何付款資訊

`trips/<slug>/docs/` **不會進入 build 產物**（有測試把關）。那裡是你的工作區，
放 brief、plan、查核筆記、私人細節都可以。

**飲食限制的正確用法：** 拿它來挑餐廳，然後在資料檔裡只寫「這家店有什麼菜」，
不要寫「因為某人不吃牛」。挑選的理由留在 `docs/dining-research.md`。

## 網站的隱私程度要講清楚

產出的網站帶 `noindex` 與 `robots.txt` 的 `Disallow: /`，所以搜尋引擎不會收錄它。
**但是拿到網址的人就能打開——這不是密碼保護。**

第一次跟使用者講部署的時候就要說清楚這一點，不要讓他們以為那是私人頁面。

## 其他

- 勾選清單的狀態只存在那台裝置的瀏覽器 localStorage，不同步、不上傳、不會被別人看到。
- 住宿座標用街區層級就好，並標 `approximate: true`；不要把確切門牌寫進公開頁面。
  導航連結會自動改用名稱搜尋而不是座標。
## 這份 repo 是誰的

**什麼時候適用：** 開工前，以及任何你要執行 `git push` 的時候。

## 規則

**行程擁有者在自己的 fork 上工作，永遠不 push 到模板。**

模板 repo（`wangch15/travel-planner`）只進不出：引擎更新從它流向每個 fork，
沒有任何東西應該從 fork 流回去——除非是刻意開的 pull request。

## 開工前先確認

```
git remote -v
```

- `origin` 必須是**使用者自己的** fork。
- `upstream` 必須是 `wangch15/travel-planner`。

**如果 `origin` 是 `wangch15/travel-planner`，立刻停下來。**
這代表當初是 clone 而不是 fork，之後每一次 commit 都會推進模板作者的 repo。
被加為協作者的人**有寫入權限**，所以這件事不會報錯、會直接成功——正因為不會
報錯，你必須自己檢查。

修法：走 `tp-setup` 第 3 步重新 fork，或直接改 remote：

```
gh repo fork wangch15/travel-planner --remote=false --clone=false
git remote rename origin upstream
git remote add origin https://github.com/<使用者的帳號>/travel-planner.git
git remote -v
```

## 永遠不做的事

- `git push upstream <任何分支>`
- `git push --force` 到任何不是使用者自己 fork 的地方
- 直接修改模板 repo 的內容

要回報問題或提功能建議，開 issue：

```
gh issue create -R wangch15/travel-planner
```

`.github/ISSUE_TEMPLATE/` 有 bug 與功能建議兩個模板。

## 為什麼

模板作者維護引擎，每個行程擁有者維護自己的 `trips/<slug>/`。
一旦有人的行程資料進了模板 repo，別人 `git merge upstream/main` 就會拿到
陌生人的行程，邊界就破了。
## 研究誠信

**什麼時候適用：** 任何時候你要把一個「事實」寫進資料檔——營業時間、票價、
車程、距離、訂位方式、公休日。

## 規則

**每個事實都要有出處與查核日期。**

- 地點的出處放 `details.js` 的 `refs`（至少一筆官方來源）。
- 整趟行程的來源總表放 `trips/<slug>/docs/sources.md`，每一條寫：查了什麼、
  哪個網址、查核日期。
- 查核日期也要寫進 `OVERVIEW.checked`（景點）與 `dining.checked`（餐飲），
  頁面上的燈箱會顯示它。

**查不到就標「待確認」，不要編造。**

- 把待確認的項目推進 `CHECKLIST`（`data.js`）或 `dining.checklist`，
  行前清單會列出來讓人自己確認。
- 寧可頁面上寫「營業時間待確認，出發前查官網」，也不要寫一個你猜的時間。
  猜錯的代價是有人白跑一趟。

**衝突時以官網為準。**

官網與旅遊網站、搜尋摘要衝突時，用官網的值，並在 `docs/sources.md` 記下這個衝突，
免得下次有人又「修正」回錯的那個。

**不要把查核結果寫成保證。**

距離與交通時間是「規劃查核當下」查到的，不是旅遊當天的路況預報，也不含休息、
找車位、景區接駁、臨時管制。文案要反映這一點（`OVERVIEW.foot` 是放這種說明的地方）。

**沒有查核能力就要說。**

如果你這個 agent 沒有瀏覽器或搜尋工具，**停下來告訴使用者**，不要用記憶裡的內容填表。
模型記憶裡的營業時間與票價經常是舊的，而且你無法分辨哪些是舊的。

## 完成的定義

1. `npm run check -- <slug>` 通過，而且
2. `trips/<slug>/docs/sources.md` 列得出每一條資料的來源與查核日期。

兩個都達成才算研究做完。
