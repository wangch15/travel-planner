## 這個 repo 是什麼

travel-planner 是一個**公開的旅程網頁模板**。使用者給你一份粗略的行程初稿，
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
| 「我想做一個行程網頁」（第一次，還沒拿到專案） | `tp-setup`，然後 `tp-plan` |
| 「我想規劃一趟新行程」 | `tp-plan` |
| 「幫我查景點／餐廳／路線／停車」 | `tp-research` |
| 「地圖怎麼來的」「重新產地圖」 | `tp-basemap` |
| 「加照片」「照片沒出來」 | `tp-photos` |
| 「可以了」「上線吧」「改一下某某」 | `tp-ship` |
| 「模板有更新」「升級一下」 | `tp-update` |
| 「我在 Google Maps 建了清單」 | `tp-maps-lists` |

不確定的時候，先問使用者現在做到哪了，再看 `trips/<slug>/docs/status.md`。
各 skill 完成、暫停等人或遇到阻礙時，回覆前更新該檔；目標未確定或目錄未建立時先用回話交接。
更新哪些欄位與如何避免把等待寫成完成，見 `.ai/rules/progress-tracking.md`。

## 開工先做

每次開始工作前：

```
npm run trips
npm run update-check
git remote -v
```

`npm run trips` 會列出這份 repo 裡有哪些行程、標題與日期、最後更新、
資料有沒有通過驗證、各自的網址。

**有兩趟以上的時候，行程級指令都要帶 `-- <slug>`**——帶錯的話最糟的情況是
`ship` 覆蓋掉另一趟的線上網站，而且不會有任何警告。
Repo 級的 `trips`、`update-check`、`contrib-check`、`sync:agent-assets`、`prepare`、`test` 不帶行程 slug；
`contrib-check` 的選填參數是 Git 比較基準，不是行程名稱。分類見 README 的指令表。

**更危險的是檔案編輯：它不經過任何指令，沒有東西會擋你。**
使用者指定的行程不唯一就**先問**，不要回退到前文；完全省略指定時的判斷順序見
`.ai/rules/which-trip.md`。

**做行程的人**：`origin` 必須是他自己的**私有** repo、`upstream` 才是
`wangch15/travel-planner`。`origin` 是公開的就停下來——行程資料與 `docs/` 裡的
私人筆記不能放在公開 repo（用 `gh repo view --json visibility` 確認）。

**`origin` 指向 `wangch15/travel-planner` 的時候要先分清楚**：使用者是要做自己的
行程（走錯路了，停下來），還是他就是模板作者在維護引擎（正常，但 `trips/` 只能有
`_example`）。判斷方式與修法見 `.ai/rules/repo-ownership.md`。

`npm run update-check` 會比對上游，告訴你落後幾版、每一版改了什麼、
**哪幾版需要 `npm run migrate`**。它只回報，不會自己更新。

**把重點講給使用者聽，問他要不要現在更新**（要的話走 `tp-update`）。
不要自己決定——更新有風險，而且他可能正在趕出發前的準備。

沒有 `upstream` remote 的話 `update-check` 會直接告訴你怎麼補，見 `tp-setup` 第 3 步。

## 硬規則

不管在做什麼都適用，先讀過再動手：

- `.ai/rules/repo-ownership.md` —— 行程在自己的私有 repo；pre-push 是最後一道，不能取代規則或保證所有工具都執行 hooks
- `.ai/rules/stage-backup.md` —— 階段完成前保存；每次 push 前重新驗 origin 私有，失敗停止且不得說完成
- `.ai/rules/progress-tracking.md` —— 完成、暫停與阻礙都更新既有 status.md，先更新再保存
- `.ai/rules/engine-content-boundary.md` —— 哪些檔案能改、哪些不能
- `.ai/rules/data-schema-reference.md` —— 改資料前先讀 `docs/schema/`
- `.ai/rules/research-integrity.md` —— 每個事實附來源與查核日期，查不到就標待確認
- `.ai/rules/which-trip.md` —— 有多趟時，動任何檔案之前先確定是哪一趟
- `.ai/rules/privacy.md` —— 什麼只能進 `trips/<slug>/docs/`
- `.ai/rules/diagnostic-sharing.md` —— 對外回報前由 agent 產生去識別化最小摘要，給人看過同意才送
- `.ai/rules/contributing-upstream.md` —— 要開 PR 或 issue 回模板之前

## 三道人類閘門

這三件事**一定要人點頭**，不要自己判斷：

1. **`docs/plan.md` 確認後才做深度查核**（`tp-plan`）
2. **preview 看過才 ship**——首次上線與 `tp-ship` 的**固定第三層條件優先**。
   換照片、改版面結構、地圖或全域設定等，都要人看過，不能以純呈現豁免。
   **未命中固定條件**，才按影響範圍判斷：純呈現可自檢後更新；事實更新須先查核，
   且整天仍可行才直接 ship。路線、順序或可行性變動就要 preview；混合採最高層，
   不確定當第三層。完整條件與例子見 `tp-ship`
3. **任何花錢或代表使用者的動作**——訂房、訂位、註冊帳號——**只給連結，不代做**

## 改引擎之前

先試兩個插槽（`theme.css`、`extra.js`）。真的非改引擎不可時：

- 把改了什麼、為什麼插槽做不到，記進 `trips/<slug>/docs/engine-changes.md`
- 考慮回饋給模板作者，讓它變成引擎的正式功能，你就不用一直自己維護

## 把改進回饋給模板

行程資料永遠不回流，但**引擎的改進可以**。判準只有一句：

**這件事能不能用「現在的行為是錯的」來描述？**可以 → 開 PR；
只能用「這樣比較好」描述 → 那是設計取捨，開 issue。

```
npm run contrib-check    # 擋掉夾帶的行程資料，開 PR 前不能跳
gh issue create -R wangch15/travel-planner
```

**模板的 fork 一定是公開的**，分支裡夾帶一個 `trips/` 檔案就等於公開
使用者的訂房資訊，而且 git 歷史刪不掉。完整流程與那道閘門見
`.ai/rules/contributing-upstream.md`。

**判斷完還是要問使用者一句再送**——那會掛他的名字。

**你在模板本身的工作目錄裡（`origin` 是模板、有寫入權）的話**：引擎改動就在這裡做，
開分支 → PR → merge，然後到行程 repo 跑 `tp-update` 用真實行程驗。不要在行程 repo
裡開發引擎。見 `contributing-upstream.md` 的「有寫入權的人」。

## 想搞懂整個機制

`docs/how-it-works.md`：一個公開模板怎麼扇出成很多份私有複本、
「進 git」與「進產物」差在哪、引擎更新怎麼流過去。
