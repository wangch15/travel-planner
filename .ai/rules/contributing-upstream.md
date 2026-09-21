# 把改進回饋給模板

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

## pre-push 對公開貢獻的限制

公開的 contrib fork 也會被新 hook 拒絕，即使 `contrib-check` 全綠；本次沒有新增公開貢獻豁免。
到這裡先停止，與使用者討論回報方式，優先用已去識別化的 issue；不要把下面的歷史參考流程整段執行。
**agent 不得自行加 `--no-verify`、改 hooksPath 或停用 hook** 來開 PR。
刻意公開引擎分支需要人另行決定操作安排，不是「測試通過」就自動獲准。

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

# 4. 到此停止：pre-push 會拒絕這個公開 fork，先向使用者說明並討論。
# 下列只保留作歷史參考，不是 agent 可以自動執行的步驟：
# git push contrib contrib-<主題>
# gh pr create -R wangch15/travel-planner --head <他的帳號>:contrib-<主題>
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
