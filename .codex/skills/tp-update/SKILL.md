---
name: tp-update
description: 把模板的引擎更新合併進使用者的 fork。開工時發現落後上游、或使用者說模板有更新時用。
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
npm run preview -- <slug>
```

然後走 `tp-ship` 的閘門二，確認過才 `npm run ship`。

## 衝突策略

| 衝突的檔案 | 怎麼解 |
|---|---|
| `src/`、`scripts/`、`tools/`、`docs/schema/`、`public/` | **取上游**（`git checkout --theirs`） |
| `trips/` | **取本地**（`git checkout --ours`） |
| 其他 | 對照 `trips/<slug>/docs/engine-changes.md` 逐一判斷 |

正常情況下引擎檔**不應該**衝突——作者只碰引擎、使用者只碰 `trips/`，
兩邊不相交（見 `.ai/rules/engine-content-boundary.md`）。

**如果引擎檔衝突了，代表有人改過引擎。**
看 `trips/<slug>/docs/engine-changes.md` 有沒有記錄：

- **有記錄**：照那份筆記判斷要保留哪些修改，解完更新筆記
- **沒有記錄**：有人改了引擎卻沒寫下來。**停下來問使用者**，
  不要自己猜哪些修改是刻意的、哪些是誤改
