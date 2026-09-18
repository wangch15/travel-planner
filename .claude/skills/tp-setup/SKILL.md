---
name: tp-setup
description: 一次性環境準備。使用者第一次要用這個模板做行程時用，把工具、帳號、fork 都弄好。
---

# tp-setup

## 什麼時候用

使用者說「我想做一個行程網頁」但還沒有 fork、還沒裝好環境的時候。
**只需要做一次**，之後每趟新行程直接用 `tp-plan`。

## agent 不做的事

這個流程裡有些步驟**只有本人能做**，你不要代勞，也不要想辦法繞過：

- 不代替使用者註冊 GitHub 或 Cloudflare 帳號
- 不代填密碼、不碰兩步驟驗證
- 不代替使用者點瀏覽器裡的授權按鈕

遇到這些步驟，**停下來，把要做什麼講清楚，等使用者說做完了再繼續**。

## 步驟

### 1. 檢查工具

確認這些都在，缺的給安裝指令：

- **Node.js ≥ 20**（`node --version`）。這是硬需求，版本不夠就先裝。
- **git**（`git --version`）
- **gh**（GitHub CLI，`gh --version`）。fork 要用。
- wrangler 不用另外裝，它是專案的 devDependency，`npm install` 就有。

### 2. GitHub 帳號與登入

**人類必做：** 沒有 GitHub 帳號的話先去註冊。

然後跑 `gh auth login`，它會開瀏覽器請使用者授權。**這一步要等人。**

### 3. Fork 並 clone

```
gh repo fork wangch15/travel-planner --clone
```

跑完用 `git remote -v` 確認：`origin` 是使用者自己的 fork、`upstream` 是模板。
兩個都對才往下走——`upstream` 沒接好，以後就拿不到引擎更新。

### 4. 安裝與自我檢查

```
npm install
npm test
```

測試要全綠。沒綠就先處理，不要帶著壞掉的引擎往下做。

順便跑 `npm run preview -- _example` 讓使用者看一眼範例行程，
知道最後會做出什麼樣子的東西。

### 5. Cloudflare 帳號與登入

**人類必做：** 沒有 Cloudflare 帳號的話先去註冊（免費方案就夠）。

然後跑 `npx wrangler login`，一樣會開瀏覽器請使用者授權。**這一步要等人。**

這一步可以晚一點再做——要 `npm run ship` 的時候才真的需要。
但先做完的話，之後部署就不會卡住。

### 6. 說明部署會發生什麼

先讓使用者知道：

- 第一次 `npm run ship` 時，新帳號會被問要不要註冊 workers.dev 子網域，**選是**。
- 網址會是 `<deploy.name>.<你的帳號>.workers.dev`。
- 這個網站不會被搜尋引擎收錄，但**拿到網址的人就能打開**，不是密碼保護。

## 完成後

環境好了，接著用 `tp-plan` 開始規劃第一趟行程。
