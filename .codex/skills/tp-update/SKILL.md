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

如果沒有落後，回報「已經是最新的」就結束。

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

`npm install` 不能跳過——引擎可能加了新的相依套件。

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
