# 把改進回饋給模板

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

它會比對分支與 `upstream/main`，只要有非 `_example` 的 `trips/` 改動就擋下來。
`trips/_example` 是模板附的範例，屬於引擎，可以改。

## 為什麼要另外 fork

使用者自己的私有 repo 是 `gh repo create` 開的，**跟模板沒有 fork 關係**，
GitHub 不接受從無關的 repo 開 PR。所以要另外 fork 一份**只拿來送 PR** 的複本：

```
gh repo fork wangch15/travel-planner --fork-name travel-planner-contrib --clone=false --remote=false
git remote add contrib https://github.com/<他的帳號>/travel-planner-contrib.git
```

那個 fork 是公開的，但它**只會收到乾淨的引擎分支**，不會收到他的 `main`。

## 完整流程

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
