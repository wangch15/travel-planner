
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

這個 repo 分兩半：**引擎**（`src/`、`scripts/`、`packages/`、`desktop/`、`tools/`、`.ai/`、`docs/schema/`、
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
Repo 級的 `trips`、`update-check`、`contrib-check`、`sync:agent-assets`、`prepare`、`test`、`desktop:setup`、`desktop:prototype` 不帶行程 slug；
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

## 對外內容先由 agent 處理

回報錯誤或附診斷資料時，先讀 `.ai/rules/diagnostic-sharing.md`：由 agent 產出去識別化的
最小診斷摘要，不叫非技術使用者自己從 stack trace 找秘密。把最終文字、附件與公開目的地
交給使用者看過並確認，才執行後面的 issue／PR 對外動作。人類模板中的個資警告仍是第二道。
`contrib-check` 只檢查檔案路徑，不能替代這份摘要的內容審查。

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

## pre-push 會再驗一次歷史

公開目的地不是一律禁止：**乾淨的引擎分支**在目的地與本次推送範圍查核通過後，兩道都會放行。
夾帶 `trips/`（`_example` 除外）的分支，`contrib-check` 與 pre-push **兩道都會擋**，新增後刪除或改名也一樣。
這不是 contrib fork 豁免；remote／repo 取任何名字都套用同一份路徑政策與掃描程式。

`contrib-check` 預先查 base..HEAD；hook 依 Git stdin 的每個 remote-sha..local-sha 再查，
所以推送其他 ref 或檢查後新增 commit，不能沿用先前許可。新分支優先用完整且乾淨的 `upstream/main`，
否則只考慮本次 stdin 已知屬於目的地的既有 ref；缺物件、shallow 或沒有可信基準就拒絕。
禁止路徑會列出路徑與至少一個涉入 commit。詳細邊界見 repo-ownership。

**agent 不得自行加 `--no-verify`、改 hooksPath 或停用 hook** 來開 PR。
測試與歷史查核通過仍不是對外送出的授權，還是要使用者看過並同意。

## 為什麼要另外 fork

使用者自己的私有 repo 是 `gh repo create` 開的，**跟模板沒有 fork 關係**，
GitHub 不接受從無關的 repo 開 PR。所以要另外 fork 一份**只拿來送 PR** 的複本：

```
gh repo fork wangch15/travel-planner --fork-name travel-planner-contrib --clone=false
git remote add contrib https://github.com/<他的帳號>/travel-planner-contrib.git
```

**不要加 `--remote=false`。** `gh` 會直接拒絕：
`the --remote flag is unsupported when a repository argument is provided`。
帶 repo 參數的時候 `gh` 本來就不會動你的 remote，所以第二行要自己補。

那個 fork 是公開的，但它**只會收到乾淨的引擎分支**，不會收到他的 `main`。

## 完整流程

**驗證範圍**（2026-09-22 實測）：

- **已驗**：`contrib-check` → pre-push hook → `git push`（新分支）→ `gh pr create`
  → PR 模板，整段在真實 GitHub 上跑通過。
- **未驗**：`gh repo fork` 與跨帳號的 `git push contrib`。

**未驗的原因是 GitHub 的硬限制，不是沒人去做**：

```
A single user account cannot own both a parent and fork.
```

模板作者的帳號擁有模板本身，所以**他永遠 fork 不了自己的 repo**，`--fork-name`
也沒用。要驗這一段必須有第二個 GitHub 帳號。

**對行程擁有者來說這不是問題**——他的帳號不擁有模板，fork 正常。
但下面兩行是照 `gh` 的說明文字寫的，作者無法實測，**第一次走這條路的人
如果卡住，請開 issue 回報**。

```
# 1. 從上游開一條乾淨的分支——不要從他自己的 main 開
git fetch upstream
git switch -c contrib-<主題> upstream/main

# 2. 只把動到引擎的 commit 挑過來
git cherry-pick <commit>

# 3. 閘門
npm run contrib-check
npm test

# 4. 使用者確認後推到公開 fork；pre-push 會再驗實際 refs 的歷史
git push contrib contrib-<主題>

# 5. 成功後建立 PR（內容仍須經使用者確認）
gh pr create -R wangch15/travel-planner --head <他的帳號>:contrib-<主題>
```

`.github/PULL_REQUEST_TEMPLATE.md` 會問你四件事，照實填。

## 永遠不做的事

- `git push upstream <任何分支>`——使用者沒有寫入權，而且那不是流程
- `git push contrib main`——他的 `main` 有 `trips/`，那個 fork 是公開的
- 在 PR 裡夾帶 `trips/`（`_example` 除外）、`dist/`、`.cache/`
- **代替使用者決定要不要送**。這是他的東西，也會掛他的名字。
  你判斷「這是純粹的改進、可以送」之後，**還是要問他一句**再送。

## 有寫入權的人：模板作者與協作者

上面整套 fork 流程是給**沒有模板寫入權**的人用的。模板作者（與他加的協作者）
有寫入權，**不需要 fork**，流程更短——但判準與閘門一樣不能省。

### 改引擎 → 在模板自己的工作目錄做，不要在行程 repo 做

```
模板的工作目錄（origin 就是 wangch15/travel-planner）
  git switch -c <主題>
  ...改、寫測試、npm test...
  git push origin <主題>            ← 推分支，不推 main
  gh pr create                      ← 開 PR
  ...review、merge...

行程 repo（origin 是自己的私有 repo）
  npm run update-check              ← 應該回報落後
  走 tp-update                      ← 用真實行程驗這個改動
```

**行程 repo 是引擎的測試場，不是開發場。** 在那裡開發引擎，每個引擎 commit
都會混進行程歷史，之後每次要往模板送都得 cherry-pick 篩一遍。改完模板之後
在行程 repo 跑 `tp-update`，用真實資料驗——那才是它的角色。

**PR 的價值是 review，不是權限。** 你本來就推得上去。開 PR 是為了有一個可以
review 的 diff——自己看一次、或交給另一個 agent 看一次——再合併。
小改動不想 review 直接推 `main` 也行，那是作者的決定。

### 做行程時撞到引擎 bug，順手修了

這才會用到上面的 cherry-pick 流程，差別只在**不用 fork**：

```
行程 repo
  ...修引擎解自己的燃眉之急，commit...
  記進 trips/<slug>/docs/engine-changes.md      ← 一定要，下次 merge 靠它
  git switch -c contrib-<主題> upstream/main    ← 從乾淨的上游開
  git cherry-pick <只動引擎的 commit>
  npm run contrib-check                         ← 閘門，擋夾帶
  git push upstream contrib-<主題>              ← 直接推模板，不用 contrib fork
  gh pr create -R wangch15/travel-planner --head contrib-<主題>
```

pre-push hook 仍然會跑：目的地是模板、而 `trips/` 有真實行程，它會檢查**這條分支
的歷史**乾不乾淨。乾淨就放行，夾帶就擋——跟朋友的路徑同一道閘門。

### 判準與朋友一樣

「現在的行為是錯的」還是「這樣比較好」的判斷、`contrib-check`、`npm test`、
改了 `.ai/` 要 `sync:agent-assets`——**一樣都要**。有寫入權省掉的只有 fork，
不是閘門。

### 兩個方向、兩條路，沒有第三條

```
模板 ──(tp-update)──▶ 行程 repo
模板 ◀──(PR)───────── 行程 repo（或模板的分支）
```

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
## 對外診斷摘要由 agent 去識別化

**適用：** 要把錯誤、log、截圖、重現資料、issue／PR 文字或附件送給其他人時。
公開 GitHub 與私下傳給邀請者都適用。非技術使用者不負責從 stack trace 辨識秘密；
bug 模板的人類警告保留作第二道，不能取代 agent 的責任。

## 對外分享順序

1. 由 agent 從原始資訊產生**去識別化的最小診斷摘要**，不是請使用者自己從原始 log 辨認敏感內容。
   只保留重現與判斷問題必要的技術資訊，不是將整份 log 遮幾個字後全部貼上。
2. 逐項檢查下面的移除清單，連同標題、網址、指令參數、截圖與附件一起檢查。
   無法判斷就省略或改用假資料重現，不能賭那串字不是訂房碼。
3. 把最終摘要、實際收件對象與公開程度給使用者看，停下來等他決定是否送出。
   「幫我回報」不是對尚未看過的原始資料外傳的授權。
4. 使用者明確同意後，只送那份核准的摘要；不附回原始 log、私人筆記或未審核附件。
   確認後若補內容、換目的地或加附件，就重新去識別化並請人確認。

## agent 必須移除的內容

- 姓名、電子郵件、電話與其他可識別人的資訊。
- 私人網址：私有 repo、行程網站、Maps 清單、訂單連結與含權杖的 query；用 `https://example.invalid/` 等假網址取代。
- 訂單號、確認碼與訂房／訂位識別資訊；用一致的假代號取代，不保留可回推的部分。
- 憑證：token、API key、cookie、密碼與授權標頭；整個值移除，不只是遮末幾碼。
- 本機路徑中的使用者名稱；例如把家目錄改成 `<HOME>`，保留必要的引擎相對路徑與行號即可。
- 行程 slug、檔名或敘述若帶可識別的旅程／住宿細節，改成 `sample-trip` 與假資料。

截圖要裁成必要區域或用假資料重做；附件也要檢查內容與檔名。不要假設純文字遮罩涵蓋圖片中的秘密。
最小化與複查都是 agent 的責任；單一正則或遮罩不能保證去識別化完整。

## 摘要只保留這些

- 引擎版本、Node 版本、作業系統。
- 用假 slug／假網址重現的最短操作。
- 預期與實際結果、必要的錯誤類型／錯誤碼。
- 少量已去識別化的關鍵 stack frames（引擎檔名、行號）；不要整段原始 stack trace。
- 已試過哪些方法；必要時附最小假資料，不附整份行程。

原始診斷留在本機或該趟私人 docs/，不要搬到公開 issue 或根目錄 docs/。

## 條件 → 動作

| 條件 | agent 必做 | 分享判定 |
|---|---|---|
| 尚未由 agent 去識別化的原始 stack trace | agent 先產生去識別化的最小診斷摘要 | 不可送出 |
| 無法判斷字串是否為私人資訊 | 省略或用假資料重現，不交給人猜 | 不可送原文 |
| 摘要已去識別化，但使用者尚未看過同意 | 顯示最終摘要、收件對象及公開程度，停下來等 | 不可送出 |
| 使用者已同意該份最終摘要與目的地 | 只送核准的摘要，不附回原始 log | 可送出 |
| 確認後又新增內容或附件 | 重新去識別化並請人確認 | 尚不可送出 |
## 引擎與內容的邊界

**什麼時候適用：** 任何時候你要建立或修改這個 repo 裡的檔案。

## 這條邊界是什麼

這個 repo 有兩種東西：**引擎**（模板作者維護）與**內容**（行程擁有者的資料）。
兩邊的檔案集合**不相交**——同一個檔案不會既是引擎又是內容。

## 哪些是引擎、哪些是內容

| | 路徑 | 誰維護 |
|---|---|---|
| 引擎 | `src/`、`scripts/`、`packages/`、`desktop/`、`tools/`、`.ai/`、`.githooks/`、`docs/`、`public/`、套件與 workspace 設定 | 模板作者 |
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

產出的網站帶 `noindex` 與 `robots.txt` 的 `Disallow: /`，要求搜尋引擎不要收錄，但那是請求不是保證；任何拿到網址的人都能開啟。
**這不是密碼保護。**

第一次跟使用者講部署的時候就要說清楚這一點，不要讓他們以為那是私人頁面。

## 旅程結束之後可以把網站下線

`npm run unship -- <slug>` 會把 Cloudflare 上那份公開網頁移除，**行程資料留在
他自己的私有 repo**。旅程結束之後那個網址的內容（每天住哪、幾號到幾號不在家）
價值歸零但風險不變，所以**要主動提這件事**，流程見 `tp-ship`。

## 其他

- 勾選清單的狀態只存在那台裝置的瀏覽器 localStorage，不同步、不上傳、不會被別人看到。
- 住宿座標用街區層級就好，並標 `approximate: true`；不要把確切門牌寫進公開頁面。
  導航連結會自動改用名稱搜尋而不是座標。
## 更新既有 status.md 做交接

**適用：** 每個 tp-* skill 完成、停下來等人、遇到阻礙或中途交接時。
使用既有 `trips/<slug>/docs/status.md`，不新增狀態系統、資料庫或另一份進度檔。
它是工作交接，不是人類同意或備份成功的證明。

## 更新順序

1. 先確認目標行程與 repo ownership。只有 slug 明確、資料夾已存在且允許寫入時才改該趟 status。
   尚無行程目錄、slug 未確定或 ownership 未通過，就只在回話交接下面四欄與未寫入原因；
   不要先建 trips/ 目錄，否則會讓 `npm run new` 因目錄已存在而失敗，也不能寫到 `_example` 代替。
2. 更新四欄，寫已發生的事，不填預期成功：
   - **目前階段**：skill／子步驟與實際完成的內容，例如「研究：地點查核通過，路線仍在查」。
   - **等待確認**：正在等使用者回答哪個問題或看哪份草案／preview；沒有就寫「無」，不是暗示已同意。
   - **阻礙**：未通過的驗證、工具／網路／權限失敗與尚未解決事項；沒有就寫「無」。
   - **下一步**：誰要做什麼、必要的條件；例如「等人確認草案」「備份核對成功後進入研究」。
   同時更新最後更新時間與原有內容進度。既有檔只有舊勾選欄位時，保留內容並補四欄，不覆寫私人筆記。
3. 保存進度：先更新 status，再依 `.ai/rules/stage-backup.md` 保存本階段成果。
   完成時將本次 status 一起納入 checkpoint；暫停時如實保存目前工作，不把半成品勾成完成。
   若 push 失敗，更新阻礙與下一步，只保存本機並回報尚未異地備份。
   單純離線仍保存已確認可寫行程的本機進度，但不得 push；若發現 origin 已公開或歸屬不明，
   則套用第 1 步的不可寫入前提，改在回話交接。
   不預填「備份成功」。四欄記內容進度與下一步，備份證據以實際遠端核對為準，
   不為了反覆把 status 改成「已備份」而製造 commit/push 迴圈。
4. 回覆使用者目前階段、要等他做什麼、阻礙與下一步；若檔案未能寫入，也說明原因。
   網站上線、內容驗證成功、備份成功要分開說。重新接手時先讀 status，再核對檔案、對話與遠端結果，
   不能只因有勾選就跳過人類閘門或每次推送的私有檢查。

## 條件 → 動作

不能寫入的前提優先（下表首列）；其餘更新動作只適用已確認可寫的行程。

| 條件 | agent 必做 | 回報判定 |
|---|---|---|
| 尚無行程目錄、slug 未確定或 ownership 未通過 | 不寫 trips/；先在回話交接四欄與未寫入原因 | 不得猜行程或提前建目錄 |
| 內容驗證通過，準備結束 skill | 先更新四欄，再依階段保存規則備份 | 備份核對成功才回報階段完成 |
| 等待 plan、preview 或其他人類決定 | 更新等待確認的具體問題與下一步，停下來等 | 不可當作已同意 |
| 工具失敗、查核未通過或工作暫停 | 記錄實際階段、阻礙與可執行下一步，不勾完成 | 回報未完成與原因 |
| push 失敗或離線 | 更新阻礙與下一步，只保存本機 | 目前只有本機備份，尚未異地備份 |

setup 尚無行程時的交接，在 tp-plan 的 new 成功後補到新建的既有 status.md。
如果只是略過選用 Maps 清單，就記「未啟用／略過」，不是假稱已對帳。
私人的進度只留該趟 docs/；部署網址若尚未知或只存在 `.local/`，記狀態及紀錄位置，不自行補假網址。
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

## 每次備份 push 前都要重新查

開工時檢查過不算下一次推送的許可。**每次 push 前**都要依 `.ai/rules/stage-backup.md`
重新核對 origin 的實際 push URL，並對那個 repo 執行 `gh repo view --json visibility` 查核
（顯式指定 origin 的 owner/repo，不能誤查 upstream）。
只有本次成功得到 PRIVATE 才能 push；查不到、gh 未登入、非私有或離線都停下來，不推送。
回報「目前只有本機備份，尚未異地備份」，直到推送與遠端 commit 核對都成功才算階段完成。

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
gh repo create travel-planner --private --source=. --remote=origin
```

建立 repo 與推送分開，不用 create 的隱含 push。跑完驗一次 `git remote -v`，
再依 `.ai/rules/stage-backup.md` 重新核對真正的 origin 私有狀態，通過才推送並核對遠端 commit。
任一步失敗就停止，不能把建立 repo 當成已備份；成功才往下走。

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

## 最後一道 pre-push

`.githooks/pre-push` 由 `npm install` 的 prepare 安裝：設定本 repo 的 `core.hooksPath` 為 `.githooks`。
引擎更新時 hook 檔案會隨 merge 流入複本；既有使用者也要跑 npm install 並確認安裝結果。

hook 直接使用 Git argv 給的 remote URL，不會重新查 remote 設定。只有明確可解析的 github.com
HTTPS／git SSH URL 才能查核；不支援的 SSH alias、其他主機或含憑證的 URL 會拒絕，不猜目的地。
它每次都查可見度，不管只改 README、新增／強推分支，或刪除分支的全零 refs；不快取許可。
PUBLIC 才依 stdin 掃描完整新增歷史，PRIVATE 不掃，因為私人行程本來就應備份到私有 repo。

- 目的地是 `wangch15/travel-planner`：只有工作目錄 trips/ 沒有非底線開頭的資料夾才允許。
  這個例外只判斷目錄，不是歷史資料掃描，也不是模板帳號所有權驗證；模板仍只能放 `_example`。
- 其他目的地：對 URL 指定的 owner/repo 執行 gh 可見度查核，10 秒逾時即拒絕。
  PUBLIC 時仍提醒既有 repo 內容已公開，可能含訂房資訊；本次放行不代表舊資料乾淨，也不會撤回外洩資料。

PUBLIC 對每個更新使用 `remote-sha..local-sha`，不是工作目錄 HEAD 或最終 diff；多 ref 任一失敗就整批拒絕。
新分支的 remote-sha 全零時，優先使用 `refs/remotes/upstream/main`，先驗其完整歷史沒有禁止路徑，
避免誤把私人基準排除；沒有該 ref 時，只考慮本次 stdin 已知的目的地既有非零 remote SHA。
不猜其他 remote-tracking ref，也不因名稱像 contrib 就放行。基準／tip 物件缺漏、shallow 或無法讀取完整範圍就拒絕。
刪除分支沒有新增歷史，但仍查目的地：PUBLIC／PRIVATE 查核成功可刪，INTERNAL／未知／查核失敗仍拒絕。

歷史掃描與禁止路徑政策直接共用 contrib-check：非 `_example` 的 trips/、trips/_profile.md、dist/、各層 .cache/ 都擋，
包含新增後刪除、改名搬走及合併歷史。訊息列違規路徑與至少一個涉入 commit，不是只說「PUBLIC 不行」。

| 條件 | hook 動作 | 結果 |
|---|---|---|
| 其他目的地為 INTERNAL、未知或查核失敗 | 拒絕，說明原因及下一步 | 目前只有本機備份，尚未異地備份 |
| 其他目的地本次查核為 PRIVATE | 允許這次推送，之後仍須核對備份結果 | 不快取許可 |
| PUBLIC 且推送範圍可信、歷史乾淨 | 允許乾淨引擎歷史，不依 repo 名稱豁免 | 提醒舊資料仍可能已公開 |
| PUBLIC 且含禁止路徑 | 整批拒絕，列出路徑與 commit | 目前只有本機備份，尚未異地備份 |
| PUBLIC 但範圍或完整歷史無法確認 | 拒絕，不把掃不到當成乾淨 | 取得可信基準後再查核 |

`.ai/rules/stage-backup.md` 仍是第一道，不能因有 hook 就省略 agent 的每次查核。
**hook 不是萬無一失，`--no-verify` 就能繞過；它防不小心，不防刻意。** agent 不得自行繞過或停用。
若工具不執行 Git hooks、直接走 API，或尚未安裝／被改掉 hooksPath，也沒有這道保護；不能保證每款桌面工具都會攔。
查核後 repo 可見度仍可能被人更改，hook 不是持續監控或能撤回資料的機制。

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
2. `trips/<slug>/docs/sources.md` 列得出每一條資料的來源與查核日期，而且
3. 依 `.ai/rules/stage-backup.md` 保存成果並驗證異地備份成功。

三個都達成才算研究階段完成；資料查核通過不能代替備份。
## 階段保存與異地備份

**適用：** 行程擁有者在自己的私有 repo 規劃、維護或更新行程。這是階段完成條件，
不是「有空再做」。至少在閘門一通過後、研究完成後、第一次部署後與引擎更新驗證後執行；
底圖、照片、Maps 對帳與日常維護有新增成果也要保存。

模板作者維護公開引擎、或送公開貢獻分支，不能套用這份私有行程備份流程；
前者遵守 repo-ownership 的模板限制，後者另走 contributing-upstream 的人類閘門。

## 執行順序

以下是**有停止條件的步驟**，不能把指令整段無條件串接執行。

### 1. 保存本機 checkpoint

先完成該 skill 的內容驗證與必要的人類確認，再盤點 `git status --short`、diff 與 staged 檔案。
若有本階段進度更新，先寫完再保存；只加入這趟與本次已確認的改動，含必要的 docs/、profile、照片。
更新引擎時也保留本次 merge／migrate 的成果。不要 `git add -A` 夾帶不相關改動、秘密或忽略檔。

```
git add -- <逐一確認的檔案>
git commit -m "<本階段改動摘要>"
```

如果本次沒有檔案差異，不造空 commit，但仍要確認目前成果的異地備份狀態。
commit 失敗就保留工作檔、回報阻礙，不能稱已完成保存，更不能丟棄改動來讓它過。

### 2. 每次 push 前重新核對真正的 origin

**每次嘗試 push 都必須重新查，不能沿用開工時、上一階段或上次重試的結果。**
先核對 GitHub 帳號／repo 與本次分支是不是使用者已確認的備份目的地：

```
git remote get-url --push --all origin
git branch --show-current
```

有多個 push URL、找不到 origin、無法唯一對應到已確認的 GitHub repo、分支不明，
或發現目的地改了，就停止並問使用者，不猜、不改投 upstream／contrib。
fetch URL 不一定等於 push URL，所以不能只看 fetch remote 或 gh 的預設 repo。

接著執行 `gh repo view --json visibility` 的私有狀態查核；**實際呼叫要顯式指定剛核對的 origin repo**：

```
gh repo view <origin-owner>/<repo> --json visibility
```

只有這次查詢成功且 visibility 為 PRIVATE，目的地與分支仍未改變，才可執行下一步。
查詢失敗、gh 未登入、離線、輸出無法判讀、PUBLIC（public repo）、INTERNAL 或未知值都停止，**不要 push**。
不要為了讓檢查過而自行改 repo 的可見度。這是每次推送的前置條件，不是一次性 setup 檢查。

### 3. 僅推送到這次已驗證的 origin

```
git push origin HEAD:<已確認的分支>
```

禁止裸 `git push` 依賴預設 remote，也禁止 force。

**force 是規則層的禁止，`pre-push` hook 不會擋它。** hook 管的是「私人資料有沒有
推到公開的地方」，而 force 推到自己的私有 repo 不是那個問題——它的風險是蓋掉
遠端已有的歷史，那只有規則擋得住。所以**不要因為 hook 放行就以為 force 是允許的**。若中途切換目的地、分支或重試，回到第 2 步重查。
push 失敗就停止，保留本機成果；不為了「完成」而換 remote、強推或跳過權限檢查。

### 4. 驗證遠端，再回報完成

```
git ls-remote origin refs/heads/<已確認的分支>
```

核對遠端分支的 commit 與本次要保存的 commit 相符（可用 `git rev-parse HEAD` 取得本次提交）。
查不到或不相符就不能宣稱備份成功；也不要覆蓋別人的新提交來追求相同。
只有 push 成功且遠端核對成功，才能回報本階段完成。網站已上線、check 通過或本機 commit 成功，
都不能代替這個條件。只補備份時不要再 ship 一次。

## 條件 → 動作

下表的失敗措辭針對**本輪成果**，即使舊版曾有異地備份，也不能把舊版當成本輪已備份。

| 條件 | agent 必做 | 完成判定 |
|---|---|---|
| 查不到 visibility、gh 未登入或離線 | 停止，不 push；回報「目前只有本機備份，尚未異地備份」 | 不可回報階段完成 |
| visibility 是 PUBLIC、INTERNAL 或未知值 | 停止，不 push；回報「目前只有本機備份，尚未異地備份」 | 不可回報階段完成 |
| 之前查過 PRIVATE，但這次尚未查 | 重新查核 origin 私有狀態，尚不可 push | 不可回報階段完成 |
| push 失敗或遠端 commit 無法核對 | 停止；回報「目前只有本機備份，尚未異地備份」；重試前重查私有狀態 | 不可回報階段完成 |
| 這次 PRIVATE、push 成功且遠端 commit 核對成功 | 回報本階段與異地備份已完成 | 可回報階段完成 |

本機 commit 若也失敗，另明說「工作檔尚未成功提交」，不要假稱有可還原的 checkpoint。
這份流程仍是 agent 的**第一道**查核；另有 `.githooks/pre-push` 當 Git 推送的**最後一道**，見 repo-ownership。
兩者都要保留：規則擋不住非 agent 的推送，hook 又可被 `--no-verify` 或不執行 hooks 的工具繞過。
它們都不保證 repo 在查核後永遠保持私有；hook 放行也不等於遠端已成功備份。
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
`ship` 之前尤其要說——那是唯一會改到線上內容的一步。
先核對 slug、`deploy.name` 與目標類型；若 `.local/deployments/<slug>.json` 有相符的
**上次成功**部署紀錄，把其中的真實網址唸給使用者聽，並說明這是本機保存的歷史網址。
首次部署前網址尚未知，或帳號／目標改變，就明說未知，不唸 `<你的帳號>` 佔位符冒充真網址。

`ship` 會唯讀核對帳號及 Worker 的上次版本，再顯示目標資訊；這段輸出**不是人類確認**，
腳本不會停下來等 stdin。preview 閘門仍由 agent 在執行 ship 之前完成。
既有 Worker 沒有相符紀錄會拒絕，不能手填紀錄、繞過腳本或刪除遠端來讓它過。
沒有正式紀錄時，依 `tp-ship` 的 `adopt-deploy` 兩段式流程查核、請使用者確認歸屬；
只有明確確認後才寫入認領紀錄。已認領但 `url: null` 仍表示網址未知，不能唸 null 或自行拼接網址。
