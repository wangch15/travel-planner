---
name: tp-update
description: 把模板的引擎更新合併進使用者的複本。開工時發現落後上游、或使用者說模板有更新時用。
---

# tp-update

## 什麼時候用

- 每次開工前的例行檢查（見 AGENTS.md 的「開工先做」）
- 使用者說模板有新功能想要

## 流程

### 1. 看落後多少

```
git fetch upstream
git log --oneline HEAD..upstream/main
```

如果沒有落後，先做下方的進度交接，再回報「已經是最新的」並結束；沒有已確認行程時只用回話交接，不猜一趟來寫。

### 2. 看更新內容再問要不要更

讀 upstream 的 `CHANGELOG.md`，把新版本的重點整理給使用者，
**特別注意每一版都有的那一行「資料需要 migrate：是／否」**。

問使用者要不要現在更新。更新有風險（merge 衝突、資料要升版），
如果他正在趕出發前的準備，可以先不更。

### 3. 合併

```
git merge upstream/main
npm install
```

`npm install` 不能跳過——引擎可能加了新的相依套件，prepare 也會設定新版本的 pre-push。
接著用 `git config --get core.hooksPath` 確認預設是 `.githooks`；hook 檔案由上游 merge 更新。
如果已有其他 hooksPath，不要覆蓋或停用，請人先處理整合並確認保護生效。
不是 Git repo／git 不可用時 installer 會跳過；修好後跑 `npm run prepare`，不能因 install 成功就假稱已受保護。

### 4. 需要的話升版資料

`CHANGELOG` 說「資料需要 migrate：是」的話：

```
npm run migrate -- <slug>
```

它會逐步升到引擎要的 `schemaVersion`，並印出改了什麼。
**仔細看它列出的人工待辦**——有些轉換（例如把 `details.info` 的停車資訊
轉成 `parking` 欄位）需要人判斷，migrate 只會提醒不會自己做。

原始檔會備份成 `<檔名>.bak`。改寫過程會丟掉註解，來源說明要自己搬回去。

### 5. 驗證

```
npm run check -- <slug>
npm run build -- <slug>
npm run preview -- <slug> --lan
```

然後走 `tp-ship` 的閘門二，確認過才 `npm run ship`。

**引擎更新一定算結構性變更**，所以「小修改自檢後直接 ship」那一條不適用——
一定要把網址給使用者、讓他在手機上看過。

## 進度交接（完成或暫停時）

完成、暫停等人或遇到阻礙時，回覆前更新 `trips/<slug>/docs/status.md` 的目前階段、等待確認、阻礙、下一步。
依 `.ai/rules/progress-tracking.md` 記錄更新選擇、merge／migrate 人工待辦、驗證與 preview 結果；先更新 status，再執行下節保存。

## 階段保存（完成條件）

更新合併、migrate 人工待辦及驗證通過後，依 `.ai/rules/stage-backup.md` 保存引擎與受影響行程的成果。
每次 push 前重新確認 origin 是使用者自己的私有 repo；備份核對成功，才回報更新階段完成。
失敗或離線就停下來，明說「目前只有本機備份，尚未異地備份」；不要因網站已更新就略過備份，也不要為補備份再部署。

## `refusing to merge unrelated histories`

`git merge upstream/main` 回這個錯的話，**那份複本跟模板沒有共同歷史**——
通常是當初用「Use this template」建的，或是把檔案複製進一個新開的 repo。
這種情況 merge 永遠不會成功，**不要加 `--allow-unrelated-histories` 硬上**：
實測一份 1.0.0 的複本這樣做會產生 69 個衝突，其中 68 個是引擎與同步產物。

**改走「換引擎」而不是「合併引擎」**，這件事之所以安全，正是因為引擎／內容
邊界讓行程資料是一個自我完備的資料夾（同一次實測中 `trips/<slug>/` 衝突數為 0）：

```
# 1. 在別的地方 clone 一份乾淨的最新引擎
git clone https://github.com/wangch15/travel-planner.git <新資料夾>
cd <新資料夾>
git remote rename origin upstream

# 2. 把行程整個搬過來（跨行程的 _profile.md 如果有也要搬）
cp -R <舊複本>/trips/<slug> trips/
cp <舊複本>/trips/_profile.md trips/     # 舊版可能沒有這個檔案

# 3. 接上他自己的私有 repo
gh repo create <名稱> --private --source=. --remote=origin

# 4. 驗證
npm install
npm test
npm run check -- <slug>
```

`schemaVersion` 沒變的話不需要 `migrate`；變了就照上面第 4 步的流程跑。

**舊的那份 repo 不要刪也不要改**——確認新的那份 `check` 通過、preview 看起來
對之前，它是唯一的退路。新舊歷史無關，所以推到同一個遠端會被 GitHub 擋
（non-fast-forward）；**這種情況要開一個新的私有 repo，不要 force push 蓋掉
舊歷史**，那會讓退路消失。

## 衝突策略

**發現衝突先停止更新流程**，不要接著 install、migrate 或 ship，也不要按路徑整份選邊覆蓋。
依下面順序處理：

1. 列出衝突檔案，判斷歸屬：
   - `trips/_example/` 是**引擎**，與 `src/`、`scripts/`、`tools/`、`.ai/`、根目錄 `docs/`、`public/` 等同類。
   - `trips/<使用者行程>/` 與 `trips/_profile.md` 是使用者內容。
   - 其他或歸屬不明的檔案，先問使用者，不推測。
2. 引擎衝突：先讀已確認行程的 `trips/<slug>/docs/engine-changes.md`。
   **有記錄**就依紀錄逐項判斷哪些本地修改要保留、哪些上游修正要合併；
   **沒有記錄**、記錄不足或與檔案不符，就停下來問使用者，不能一律取上游。
   若需讀另一趟的筆記，先依 `which-trip` 確認那一趟。
3. 使用者內容衝突：保護既有內容，逐項比對差異；無法判斷就請使用者選擇。
   不能一律取本地，否則可能丟掉已合併進來的必要資料修改。
4. 解完衝突，確認沒有遺失刻意的修改，更新相關 `engine-changes.md`，完成 merge。
   才回到第 3 步的 `npm install`，依序 migrate，並跑 `npm run check -- <slug>`、build 與 preview。

引擎／內容邊界讓正常更新不應衝突；一旦衝突，就是需要逐項判斷的例外，
不是略過使用者意圖的理由。
