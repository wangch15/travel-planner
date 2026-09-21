
# CLAUDE.md

> 本檔由 `scripts/sync-agent-assets.mjs` 自動產生，不要直接編輯。
> 要改內容請編輯 `.ai/entrypoints/project-context.md` 與 `.ai/rules/*.md`，然後跑 `npm run sync:agent-assets`。

這份文件給在這個 repo 裡工作的 Claude Code 看，說明專案的共同規則與流程。

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
Repo 級的 `trips`、`update-check`、`contrib-check`、`sync:agent-assets`、`test` 不帶行程 slug；
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

- `.ai/rules/repo-ownership.md` —— 在自己的私有 repo 上工作，永遠不 push 到模板
- `.ai/rules/engine-content-boundary.md` —— 哪些檔案能改、哪些不能
- `.ai/rules/data-schema-reference.md` —— 改資料前先讀 `docs/schema/`
- `.ai/rules/research-integrity.md` —— 每個事實附來源與查核日期，查不到就標待確認
- `.ai/rules/which-trip.md` —— 有多趟時，動任何檔案之前先確定是哪一趟
- `.ai/rules/privacy.md` —— 什麼只能進 `trips/<slug>/docs/`
- `.ai/rules/contributing-upstream.md` —— 要開 PR 或 issue 回模板之前

## 三道人類閘門

這三件事**一定要人點頭**，不要自己判斷：

1. **`docs/plan.md` 確認後才做深度查核**（`tp-plan`）
2. **preview 看過才 ship**——**看影響範圍，不是看改了什麼東西**。
   動到路線、順序或「那天還走不走得通」就要人看過；只改呈現或只更新查得到
   的事實（且不影響可行性）由 agent 自檢後直接 ship。
   三層判準與升級條件見 `tp-ship`，不確定一律當成要人看過
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

## 想搞懂整個機制

`docs/how-it-works.md`：一個公開模板怎麼扇出成很多份私有複本、
「進 git」與「進產物」差在哪、引擎更新怎麼流過去。

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
## 把改進回饋給模板

**什麼時候適用：** 使用者提出一個建議、或你在用的過程中發現引擎有問題，
而你在考慮要不要把它送回模板。

## 先決定：issue 還是 PR

| 你手上有什麼 | 走哪條 |
|---|---|
| 一個想法、一個抱怨、一個還沒修的 bug | **issue** |
| 已經在本機改好、測試也過了，而且是**純粹的改進** | **PR** |
| 改好了，但那是設計取捨 | **issue**，附上你的 patch 當參考 |

**分不出來就開 issue。** issue 的成本對雙方都低，被退回的 PR 才貴。

## 「純粹的改進」與「設計取捨」怎麼分

**判準只有一個：這件事能不能用「現在的行為是錯的」來描述？**

- 可以 → 純粹的改進，開 PR
- 只能用「這樣比較好」來描述 → 設計取捨，開 issue

### 純粹的改進（可以直接開 PR）

- 某個輸入會讓 `check` 或 `build` 崩潰
- 錯誤訊息沒講清楚該做什麼，改成講清楚
- 文件寫的跟程式碼實際行為不一致
- 某個分支沒有測試覆蓋，補上
- 同樣的輸出但更快、或不再重複抓同一份資料
- 在某個作業系統／Node 版本上壞掉

### 設計取捨（先開 issue 問）

- 新增一個資料欄位、一個頁面區塊
- 改變任何預設值（`sections` 的開關、`basemap` 的等高線間距）
- 改變三道人類閘門的範圍
- 加一個新的相依套件
- 改檔案結構或命名
- 任何以「我覺得這樣比較好」開頭的理由

**改外觀之前先試兩個插槽**（`theme.css`、`extra.js`）。九成的需求插槽就能解決，
那些不需要動引擎，也就不需要 PR。

## PR 的硬規則：分支裡不能有任何 `trips/` 的東西

**模板的 fork 一定是公開的**，GitHub 不允許把公開 repo 的 fork 改成私有。
分支裡只要夾帶一個 `trips/` 底下的檔案，使用者的行程、訂房確認碼與私人筆記
就公開了，而且**事後刪檔案沒有用**——git 歷史還在。

推之前一定要跑：

```
npm run contrib-check
```

它檢查 `base..HEAD` 的完整新增歷史（base 預設為 `upstream/main`），不是最終 diff。
新增後刪除、改名／搬移，以及合併進來的側支與 merge commit 都會檢查。
只要歷史中有非 `_example` 的 `trips/`、`dist/` 或 `.cache/` 禁止路徑，就以**非零退出碼**拒絕；
讀不到比較基準也拒絕。檢查或測試失敗就**停止**，不得繼續 push。
`trips/_example` 是模板附的範例，屬於引擎，可以改。

**這是路徑檢查，不檢查檔案內容。** 放在引擎檔、commit 訊息或 PR 文字中的私人資訊，
仍須人工審查；也不要換成包含私人歷史的 base 來讓檢查過關。
檢查後若新增 commit、合併或改寫歷史，推送前必須重跑。

## 為什麼要另外 fork

使用者自己的私有 repo 是 `gh repo create` 開的，**跟模板沒有 fork 關係**，
GitHub 不接受從無關的 repo 開 PR。所以要另外 fork 一份**只拿來送 PR** 的複本：

```
gh repo fork wangch15/travel-planner --fork-name travel-planner-contrib --clone=false --remote=false
git remote add contrib https://github.com/<他的帳號>/travel-planner-contrib.git
```

那個 fork 是公開的，但它**只會收到乾淨的引擎分支**，不會收到他的 `main`。

## 完整流程

**驗證範圍：本機歷史檢查有回歸測試；`--fork-name` 的 fork → push → PR 路徑尚未做過端到端驗證。**
下面是預定操作流程，不代表遠端權限、fork 命名與 PR 建立已實測可用。

```
# 1. 從上游開一條乾淨的分支——不要從他自己的 main 開
git fetch upstream
git switch -c contrib-<主題> upstream/main

# 2. 只把動到引擎的 commit 挑過來
git cherry-pick <commit>

# 3. 閘門
npm run contrib-check
npm test

# 4. 推到那個公開的 fork，不是推到 upstream
git push contrib contrib-<主題>

# 5. 開 PR
gh pr create -R wangch15/travel-planner --head <他的帳號>:contrib-<主題>
```

`.github/PULL_REQUEST_TEMPLATE.md` 會問你四件事，照實填。

## 永遠不做的事

- `git push upstream <任何分支>`——使用者沒有寫入權，而且那不是流程
- `git push contrib main`——他的 `main` 有 `trips/`，那個 fork 是公開的
- 在 PR 裡夾帶 `trips/`（`_example` 除外）、`dist/`、`.cache/`
- **代替使用者決定要不要送**。這是他的東西，也會掛他的名字。
  你判斷「這是純粹的改進、可以送」之後，**還是要問他一句**再送。

## 只想回報不想修

```
gh issue create -R wangch15/travel-planner
```

`.github/ISSUE_TEMPLATE/` 有 bug 與功能建議兩個模板，兩個都要求填引擎版本
（`npm run update-check` 看得到）。模板是公開的，任何 GitHub 帳號都能開 issue。
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
| 引擎 | `src/`、`scripts/`、`tools/`、`.ai/`、`docs/`、`public/`、`package.json` | 模板作者 |
| 內容 | `trips/<slug>/` 底下全部 | 行程擁有者 |
| 產物 | `dist/` | 誰都不維護，整個 gitignore |

**注意 `docs/` 有兩個**：repo 根目錄的 `docs/`（schema 文件、機制說明）是引擎；
`trips/<slug>/docs/`（使用者的筆記）是內容。兩者路徑不同，不會混。

`trips/<slug>/` 裡面：

- 引擎會讀：`trip.config.json`、五個資料檔、`photos/`、`basemap.json`、兩個插槽（`theme.css`、`extra.js`）
- 引擎**永遠不讀**：`docs/`（你的筆記）、`.cache/`（快取，gitignore）

## 為什麼重要

行程擁有者的複本要能長期 `git merge upstream/main` 拿到引擎更新。
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

## 這些東西放哪裡

| 檔案 | 放什麼 | 進產物嗎 |
|---|---|---|
| `trips/<slug>/` 的五個資料檔 | 會顯示在網頁上的內容 | 會 |
| `trips/<slug>/docs/` | 這一趟的 brief、plan、查核筆記、私人細節 | **不會** |
| `trips/_profile.md` | **跨行程**不變的條件：同行的人、體力、飲食限制、節奏偏好 | **不會** |

後兩者都有測試把關，確認它們不會出現在 build 產物裡。那裡是你的工作區。

`_profile.md` 是唯一一個跨行程共用的私人檔案——它存在的目的就是讓飲食限制
這類資訊只講一次。它跟 `docs/` 一樣會 commit 進使用者自己的**私有** repo，
所以換電腦也還在；**前提是那個 repo 真的是私有的**（見 `repo-ownership.md`）。

**飲食限制的正確用法：** 拿它來挑餐廳，然後在資料檔裡只寫「這家店有什麼菜」，
不要寫「因為某人不吃牛」。挑選的理由留在 `docs/dining-research.md`。

## 關閉區塊不是隱私保護

`sections` 關閉只停用該區塊的顯示與對應檢查；build 仍會把全部資料物件內嵌進 HTML。
不能把私人資訊留在關閉的區塊、`trip.config.json` 或插槽裡，以為畫面看不到就安全。
私人筆記留在 `docs/`／`_profile.md`，不會因為關掉區塊而改變這條邊界。

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

**模板是公開唯讀的，行程擁有者在自己的私有 repo 上工作。**

- 模板 repo（`wangch15/travel-planner`）是**公開**的，任何人都能讀、都能拿。
  引擎更新從它流向每一份複本，沒有任何東西應該流回去——除非是刻意開的 pull request。
- 行程擁有者的複本是**私有**的。`trips/<slug>/docs/` 會進 git，裡面放訂房確認碼、
  飲食限制、門鎖密碼這些東西（見 `privacy.md`），所以那個 repo 一定要是私有的。

## 開工前先確認

```
git remote -v
```

- `origin` 必須是**使用者自己的私有 repo**。
- `upstream` 必須是 `wangch15/travel-planner`。

`upstream` 沒接好，以後就拿不到引擎更新；照下面「取得專案的正確方式」補上。

### `origin` 是 `wangch15/travel-planner` 的時候

這有兩種可能，**先分清楚是哪一種再動手**：

**(a) 使用者要做自己的行程** → 走錯路了，停下來。
那代表當初是直接 clone 就開始做，行程資料會 commit 進一份公開模板的工作目錄裡。
推不上去（沒有寫入權），但那些 commit 會一直卡在本機，而且使用者的私有備份
根本不存在。照下面「取得專案的正確方式」補建自己的 repo，再把現有的 commit 推上去。

**(b) 使用者就是模板作者，正在維護引擎本身**（改 `src/`、`scripts/`、`.ai/`、文件）
→ 這是正常的，繼續做。但 `trips/` 底下只能有 `_example`（見下一節）。

分不出來是哪一種就問使用者一句。**有一個情況不用問：`origin` 是模板、
而 `trips/` 底下有非底線開頭的行程——那一定是 (a)，停下來。**

## 取得專案的正確方式

```
git clone https://github.com/wangch15/travel-planner.git
cd travel-planner
git remote rename origin upstream
gh repo create travel-planner --private --source=. --remote=origin --push
```

跑完驗一次 `git remote -v`，兩個 remote 都對才往下走。

**不要用 fork。** 公開 repo 的 fork **一定是公開的**，GitHub 不允許把它改成私有。
用 fork 等於把使用者的行程、`docs/` 裡的訂房資訊與私人筆記放上公開的 GitHub。

**不要用「Use this template」。** 它可以選私有，但會開一條全新的 git 歷史，
之後 `git merge upstream/main` 要 `--allow-unrelated-histories`，每個檔案都衝突——
這個 repo 的引擎／內容邊界就是為了讓那個 merge 乾淨才設計的。

## 模板 repo 裡不放任何真實行程

**如果你現在就在模板 repo（`origin` 是 `wangch15/travel-planner`）裡工作——
包含模板作者本人——`trips/` 底下只能有 `_example`。**

模板作者自己的行程也走上面那條路：另一個私有 repo。模板 repo 是公開的，
任何 commit 進去的行程資料都會公開，而且 git 歷史刪不掉。

## 永遠不做的事

- `git push upstream <任何分支>`
- 把任何真實行程 commit 進模板 repo
- 把行程擁有者的 repo 設成公開

要回報問題或提功能建議，開 issue（模板是公開的，任何 GitHub 帳號都能開）：

```
gh issue create -R wangch15/travel-planner
```

`.github/ISSUE_TEMPLATE/` 有 bug 與功能建議兩個模板。

## 為什麼

模板作者維護引擎，每個行程擁有者維護自己的 `trips/<slug>/`。
公開的模板加上私有的複本，讓兩件事同時成立：引擎更新可以流向所有人，
而沒有人的行程資料會流向任何人。
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
## 先確定是哪一趟

**什麼時候適用：** 有兩趟以上行程的時候，你要**讀或改** `trips/` 底下任何檔案、
或要跑任何帶 slug 的指令之前。

## 規則

**指定有歧義就停下來問，不要猜。** 完全省略指定時，才依下面的順序判斷能否沿用。

## 為什麼這條單獨列一條規則

`npm run check` 這類指令沒帶 slug 會直接報錯，所以**指令這一層是安全的**。

**危險的是檔案編輯。** 使用者說「第三天的午餐換一家」，你可以直接打開
`trips/<某一趟>/dining.js` 改下去——不經過任何指令，沒有任何東西會擋你。
改完跑 `npm run check -- <同一個猜錯的 slug>` 還會過，因為你前後一致地錯。
接著 `npm run ship -- <那個 slug>`，**另一趟已經上線的網站就被換掉了**。

他傳給家人的連結還在，內容卻變成別趟的。而他多半要等到人在旅途中才發現。

## 判斷順序

**由上往下，第一個成立的就是答案。不要跳過，也不要合併判斷。**

1. **明確指定**（slug、地名、國家、年份、「大阪那個」）→ 只在唯一匹配時使用。
   零匹配或多重匹配都要**停下來問**，不得往下沿用前文或唯一現有行程。
   例如有兩趟日本行時，「日本那個」必須請人選，即使剛才正在做大阪也一樣。
2. **「上次那個」這類相對指稱** → 用最後更新等線索提出候選，等使用者確認，不能直接編輯。
3. **完全沒有指定** → 只有一趟就用它；有多趟且這一輪已確認正在處理某一趟，才沿用那一趟。
   **回話時複述一次**：「大阪那趟的第三天午餐改成 ⋯⋯」。
4. **仍無法確定** → **跑 `npm run trips`，把候選唸給他選。**

## 第 4 步怎麼問

不要丟一句「你是指哪一趟？」——他可能也不記得 slug 長什麼樣。
**把 `npm run trips` 的結果翻成人話**，用他認得出來的東西：

> 你有三趟行程，是哪一趟？
> 1. 冰島（2027/03/10–03/18）—— 最後更新 9/20
> 2. 大阪（2028/04/02–04/07）—— 最後更新 9/21
> 3. 濟州島（2029/05/01–05/05）—— 最後更新 8/14

標題、日期、最後更新都在 `npm run trips` 的輸出裡。
「我上次在弄的那個」用最後更新提出候選，等待使用者確認，不直接編輯。

## 絕對不要

- **不要用「最近改過的那個」當預設**去動檔案。那是用來**問**他的線索，不是答案。
- **不要因為只有一趟資料完整就假設是它。** 他很可能正是要改那趟還沒做完的。
- **不要在同一輪裡動兩趟。** 使用者要同時改兩趟的話，一趟做完、回報、再做下一趟。
- **不要靠 `npm run check` 幫你發現搞錯了。** 它只驗你指定的那一趟，
  你指錯它就跟著錯。

## 確認過之後

**在回話裡說出是哪一趟**，每一次都說，不要只有第一次說。
`ship` 之前尤其要說——那是唯一會改到線上內容的一步，而
`npm run ship` 也會把即將覆蓋的網址印出來，把那一行唸給他聽。
