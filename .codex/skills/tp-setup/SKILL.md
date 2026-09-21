---
name: tp-setup
description: 一次性環境準備。使用者第一次要用這個模板做行程時用，把工具、帳號、專案都弄好。
---

# tp-setup

## 什麼時候用

使用者說「我想做一個行程網頁」但還沒拿到專案、還沒裝好環境的時候。
**只需要做一次**，之後每趟新行程直接用 `tp-plan`。

## agent 不做的事

這個流程裡有些步驟**只有本人能做**，你不要代勞，也不要想辦法繞過：

- 不代替使用者註冊 GitHub 或 Cloudflare 帳號
- 不代填密碼、不碰兩步驟驗證
- 不代替使用者點瀏覽器裡的授權按鈕

遇到這些步驟，**停下來，把要做什麼講清楚，等使用者說做完了再繼續**。

## 前提：假設使用者的電腦上什麼都沒有

**不要假設 git、gh、Node 已經裝好，也不要假設使用者知道它們是什麼。**
他多半是照 README 複製一段 prompt 貼給你的，除此之外沒做過任何設定。

講話用白話，不要丟指令叫他自己跑——**能你跑的你自己跑**。
真的需要他本人的步驟（註冊帳號、在瀏覽器按授權），就停下來講清楚要點哪裡。

**任何一步卡住就直接說卡在哪、需要他做什麼。不要猜、不要跳過、不要假裝成功。**

## 步驟

### 1. 檢查並補齊工具

一個一個檢查，缺的**你幫他裝**（或給出他那個作業系統的安裝指令並帶他做完）：

| 工具 | 檢查 | 缺了怎麼辦 |
|---|---|---|
| **Node.js ≥ 20** | `node --version` | macOS 用 Homebrew、Windows 用官方安裝檔。版本不夠也要處理。 |
| **git** | `git --version` | macOS 裝 Xcode Command Line Tools 即可、Windows 用 Git for Windows。 |
| **gh**（GitHub CLI） | `gh --version` | 開私有 repo 與 GitHub 授權都要用它。 |

wrangler 不用另外裝，它是專案的 devDependency，`npm install` 就有。

**`cloudflared` 刻意不在這張表裡。** 它只有在要產生公開預覽網址
（`npm run preview -- <slug> --tunnel`）時才需要，多數人用 `--lan` 就夠了。
真的要用的時候再裝，流程見 `tp-ship`——不要在這裡先問他要不要裝，
那只會在他還沒看到任何東西的時候多丟一個決定給他。

### 2. GitHub 帳號與登入

**人類必做：** 沒有 GitHub 帳號的話先去 github.com 註冊。

然後跑 `gh auth login`，它會開瀏覽器請他授權。**這一步要等人**，講清楚畫面上要按什麼。

模板本身是公開的，讀它不需要登入。但**下一步要用他的帳號開一個私有 repo**，
所以這一步不能跳過。順便用 `gh auth status` 確認真的登入了。

### 3. 取得專案

模板是公開的，**使用者的複本必須是私有的**——他的行程、`docs/` 裡的訂房資訊與
私人筆記都會 commit 進去。先建立 repo，不在 create 時隱含推送：

```
git clone https://github.com/wangch15/travel-planner.git
cd travel-planner
git remote rename origin upstream
gh repo create travel-planner --private --source=. --remote=origin
```

跑完一定要驗：

```
git remote -v
```

- `origin` 是**使用者自己的** `<他的帳號>/travel-planner`，而且是**私有**的
- `upstream` 是 `wangch15/travel-planner`

兩個都對，再依 `.ai/rules/stage-backup.md` 的每次推送檢查：重新查真正 origin 的私有狀態，
通過才推送目前 HEAD，並核對遠端 commit。沒有新增檔案就不造空 commit。
失敗或離線明說「目前只有本機備份，尚未異地備份」，不能說 setup 已完成。
備份成功才往下走。`origin` 還指向 `wangch15` 就是取得私有 repo 沒成功，照
`.ai/rules/repo-ownership.md` 修好再繼續；`upstream` 沒接好，以後就拿不到引擎更新。

**不要用 `gh repo fork`。** 公開 repo 的 fork 一定是公開的，GitHub 不允許改成私有——
那會把使用者的行程與私人筆記放上公開的 GitHub。理由見
`.ai/rules/repo-ownership.md`。

**如果這一步失敗：**

- `gh repo create` 說名稱已存在 → 他的帳號底下已經有 `travel-planner` 了。
  問他那是不是舊的一份；要另開就換個名字（例如 `travel-planner-2`），
  `origin` 指向新的那個就好，不影響後面任何步驟。
- 訊息提到沒有權限或要求登入 → 第 2 步沒完成，回去跑 `gh auth login`。
- 訊息提到 git 沒設定 `user.name`／`user.email` → 你幫他設好。

### 4. 安裝與自我檢查

```
npm install
npm test
```

測試要全綠。沒綠就先處理，不要帶著壞掉的引擎往下做。

順便跑 `npm run preview -- _example --lan` 讓使用者看一眼範例行程，
知道最後會做出什麼樣子的東西。加 `--lan` 是為了讓他**用手機開**——
這個東西是給人在旅途中用手機看的，在電腦上看跟實際使用差很多。

### 5. Cloudflare 帳號：這個階段**不要**叫他去辦

`npm run ship` 要部署的時候才需要 Cloudflare。**`tp-setup` 階段不要提這件事，
更不要請他先去註冊。**

理由：他現在還沒看到任何成品，這時候要他辦第二個帳號，是在他還不知道值不值得
的時候先收他一筆成本。而確認階段用 `--lan` 或 `--tunnel` 的臨時網址就夠了，
那兩個都**不需要** Cloudflare 帳號。

真的要上線的時候才走這兩步（完整流程見 `tp-ship`）：

- **人類必做：** 去 https://dash.cloudflare.com/sign-up 註冊，方案選 Free
- 跑 `npx wrangler login`，會開瀏覽器請他授權——**這一步要等人**

下一節「網址會長什麼樣」要在**他註冊之前**講給他聽，不是等他按下去才講。

### 6. 說明部署會發生什麼

先讓使用者知道這幾件事，不要等到要上線才講：

- 第一次 `npm run ship` 時，新帳號會被問要不要註冊 workers.dev 子網域，**選是**。
- 網址會是 `<deploy.name>.<子網域>.workers.dev`——見下一節，那兩段要讓他自己決定。
- 這個網站**不會被搜尋引擎收錄**，但**拿到網址的人就能打開**，不是密碼保護。

## 網址會長什麼樣——這件事要讓使用者自己決定

第一次部署時，Cloudflare 會請使用者註冊一個 **workers.dev 子網域**。
最後的網址是：

```
<trip.config 的 deploy.name>.<這個子網域>.workers.dev
```

**兩段都會出現在他傳給家人朋友的網址裡，而且子網域之後要改的話舊網址就失效。**

所以：

- **不要直接採用 Cloudflare 建議的預設值。** 它通常是使用者 email 的前半段，
  可能是他不想公開的字串。
- **停下來把完整網址念給他聽再確認。** 例如：
  「你的網址會是 `japan-2026.mingwang1988.workers.dev`——中間那段是從你註冊
  Cloudflare 的 email 來的，會出現在你傳給家人的每個網址裡。要用這個嗎？」
  讓他自己決定，不要替他按下去。
- `deploy.name` 也一樣——那是行程名稱那一段，由你在 `trip.config.json` 填，
  填之前先問他想叫什麼。

（`deploy.target` 是 `pages` 的話網址是 `<deploy.name>.pages.dev`，
不含帳號子網域，但 `deploy.name` 一樣會公開。）

## 完成後

環境好了，接著用 `tp-plan` 開始規劃第一趟行程。
