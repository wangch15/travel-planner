# 這個專案是怎麼運作的

> 給想搞懂機制的人看的。**只想做一趟行程的話不用讀這頁**——回 [README](../README.md)
> 複製那段 prompt 給你的 AI 就好。

## 一句話

**一個公開模板，扇出成很多份私有複本，中間只有一條單向的 `git merge`。**

你（模板作者）維護引擎，每個使用者擁有自己的行程內容。引擎更新可以流向所有人，
而沒有人的行程資料會流向任何人。

## 拓撲

```
        wangch15/travel-planner（公開，模板作者維護）
                    │
                    │  git clone（匿名，不需要 GitHub 帳號）
        ┌───────────┼───────────┬───────────┐
        ▼           ▼           ▼           ▼
     朋友 A       朋友 B       朋友 C     作者自己的行程
   （私有 repo） （私有 repo） （只在本機）（另一個私有 repo）
        │           │           │
        ▼           ▼           ▼
   他的 Cloudflare  他的        他的
   workers.dev     workers.dev  workers.dev
```

每個人的 `upstream` 指回模板，`origin` 指向他自己的私有 repo。
**箭頭只有往下的**——使用者對模板沒有寫入權，所以行程資料在物理上不可能
流回模板。要回饋改進要走 [貢獻管道](#把改進回饋給模板)，那是另一條明確的路。

## 分岔發生在 repo 層級，不是 branch 層級

假設 A 要做冰島、B 要做濟州島，GitHub 上會有 **3 個 repo**：

| Repo | 誰的 | 公開／私有 | 裡面有什麼 |
|---|---|---|---|
| `wangch15/travel-planner` | 作者 | **公開** | 引擎 + `trips/_example` |
| `朋友A/travel-planner` | A | **私有** | 引擎 + `trips/iceland-2027/` |
| `朋友B/travel-planner` | B | **私有** | 引擎 + `trips/jeju-2027/` |

名字可以一樣，因為在不同帳號底下。

**三個 repo 各自只有一條 `main`，沒有任何 git 分支。**

```
模板的 main
  ●──●──●──●──●──●   ← 作者繼續改引擎
              │
              │ A 在這裡 clone
              ├──────────────────────────────
              │  A 的 main（他的私有 repo）
              │    └─●──●──●   feat: 冰島行程
              │        trips/iceland-2027/
              │
              │ B 在這裡 clone（時間點可能不同）
              └──────────────────────────────
                 B 的 main（他的私有 repo）
                   └─●──●   feat: 濟州島行程
                       trips/jeju-2027/
```

A 和 B 的 `main` 共用 clone 那一刻之前的全部歷史，之後各走各的。
他們彼此完全看不到對方，也不知道對方存在。

### 同一個人做第二趟不會變成新 repo

同一個 repo、同一條 `main`，多一個資料夾：

```
朋友A/travel-planner  (private)
└── trips/
    ├── iceland-2027/    ← 第一趟
    └── norway-2028/     ← 第二趟（npm run new -- norway-2028 --from iceland-2027）
```

**從這裡開始行程級指令都要帶 slug**（`npm run check -- norway-2028`）。
Repo 級的 `trips`、`update-check`、`contrib-check`、`sync:agent-assets`、`prepare`、`test` 不帶行程 slug；
`contrib-check` 可選的參數是 Git 比較基準。
帶錯的話最糟是 `ship` 把另一趟的線上網站覆蓋掉——`npm run trips` 就是拿來
先看一眼有哪些行程的。

## 使用者的成果最後存在三個地方

| 在哪 | 有什麼 | 誰看得到 |
|---|---|---|
| **他的電腦** | 整個 repo：引擎 + `trips/<slug>/` | 他 |
| **他的私有 GitHub repo** | 同上，**含 `docs/`**（訂房碼、門鎖密碼）與 `_profile.md` | 只有他 |
| **他的 workers.dev 網站** | 只有五個資料檔 + 照片 render 出來的單一 HTML | 拿到網址的任何人 |

### 「進 git」與「進產物」是兩件事

文件裡講的「產物」指的是**網站**，不是 git。這兩件事常被讀反：

| | 進 **git**（→ 他的私有 repo） | 進 **產物**（→ 網站 HTML） |
|---|---|---|
| 五個資料檔、`photos/`、`basemap.json` | ✅ | ✅ |
| `trips/<slug>/docs/`（brief、plan、查核筆記、訂房確認碼） | **✅ 會** | ❌ 不會 |
| `trips/_profile.md`（飲食限制、同行的人） | **✅ 會** | ❌ 不會 |
| `.cache/`、`dist/` | ❌ gitignore | — |

`.gitignore` 裡 `trips/` 底下唯一被排除的是 `.cache/`。**`docs/` 是被 git 追蹤的。**
擋住 `docs/` 的是 build，不是 git（`tests/build.test.js` 有測試把關）。

整條邏輯是這樣串的：

1. `docs/` 裡有訂房確認碼、門鎖密碼、飲食限制
2. 那些東西**會進 git**
3. 所以那個 repo **必須是私有的**（為什麼不能用 fork、為什麼要 `--private`）
4. commit 只保存在本機；必須 push 到已確認私有的 origin，並核對遠端 commit 成功，才**有異地備份**。
   每次 push 前都要重新確認 origin 私有，不沿用開工時的結果；流程見 `.ai/rules/stage-backup.md`。

**「要私有」跟「有備份」不是互斥的，是同一個設計的兩面。**

另外，npm install 的 prepare 會將本機 core.hooksPath 指向被追蹤的 `.githooks`。
pre-push 依 Git 提供的實際目的地 URL 做最後查核，不論是否改到行程檔。PRIVATE 允許備份行程；
PUBLIC 與 contrib-check 共用歷史掃描，只放行乾淨的實際 ref 範圍，缺基準／物件或 shallow 就拒絕。
沒有依 contrib 名稱放行的豁免，多 ref 任一不乾淨就整批擋；刪除仍查可見度但沒有新增歷史。
原本 stage-backup 規則保留作第一道。hook 可被 `--no-verify` 繞過，未安裝或不執行 Git hooks 的工具也不受保護；
它不是持續監控，不能撤回已公開的資料。

## 引擎更新怎麼流過去

**作者 push 不動任何人，只能等他們來拿。**

使用者的 agent 每次開工跑 `npm run update-check`，它會：

- `git fetch upstream`，比對本機與上游的版本
- 從上游的 `CHANGELOG.md` 抓出中間每一版的重點
- 特別標出**有沒有哪一版需要 `npm run migrate`**
- **只回報，不自己更新**——更新有風險，而且他可能正在趕出發前的準備

他說要更新才走 `tp-update`：

```
git merge upstream/main   →   npm install   →   （需要的話）npm run migrate
```

### 為什麼 merge 不會衝突

靠**引擎／內容邊界**：兩邊的檔案集合不相交。

| | 路徑 | 誰維護 |
|---|---|---|
| 引擎 | `src/`、`scripts/`、`tools/`、`.ai/`、`.githooks/`、`docs/`、`public/`、`package.json` | 模板作者 |
| 內容 | `trips/<slug>/` 底下全部 | 行程擁有者 |
| 產物 | `dist/` | 誰都不維護，整個 gitignore |

只要雙方的 commit 只碰各自那一邊，merge 就是乾淨的。
真的非改引擎不可時，要寫進 `trips/<slug>/docs/engine-changes.md`——
下次衝突時那份筆記就是解法的依據。

### 資料格式改版有版本號擋著

`trip.config.json` 有 `schemaVersion`，引擎有 `SCHEMA_VERSION`：

- 資料比引擎**舊** → `npm run check` 失敗，叫他跑 `npm run migrate`
- 資料比引擎**新** → `npm run migrate` 拒絕執行，叫他先 `git merge upstream/main`

所以不會有人帶著半新半舊的資料跑。

## 每個人需要自己的 Cloudflare 帳號

不是共用作者的。所以網址是 `<行程名>.<他自己的帳號代號>.workers.dev`。

`deploy.name` **只在同一個帳號內會撞**——朋友 A 跟朋友 B 都叫 `japan-2026` 沒問題。
會撞的是同一個人的兩趟行程。repo 內的撞名由 `npm run check` 與 `ship` 擋住；
跨 repo 則由 Workers 的 `ship` 唯讀查核遠端：已存在卻不符合本趟本機紀錄的帳號、名稱與版本就停止。
未登入、網路錯誤、權限不足或無法解析查核結果，也停止，不當成目標不存在。

成功部署才把輸出的真實網址與版本存到 `.local/deployments/<slug>.json`，gitignore，
不進 git、不進網站，也不保存登入憑證。首次部署前網址尚未知；後續印上次成功的真實網址，
不是即時子網域查詢，也不是人類確認。沒有紀錄的既有 Worker 不自動認領，換電腦時也一樣。
恢復方式是獨立的 `npm run adopt-deploy -- <slug>`：先取得唯讀查核同意，列出帳號、Worker 與最後部署事實，
由人判斷是不是這一趟網站。使用者明確確認後，才帶 `--confirm <查核編號>` 重新查核；
事實未变且沒有正式紀錄才建立 `url: null` 的認領紀錄。下一次正常 ship 補真網址，不留下繞過保護的旗標。
暫存收據在同一個 gitignore 目錄的 `pending/`，不是所有權憑證；既有合法或損壞紀錄都不覆蓋。
**Pages 不提供這道 Worker 遠端防撞保護**，只保存成功網址；查核到部署之間的併發競態仍可能發生。

## 把改進回饋給模板

行程資料永遠不回流，但**引擎的改進可以**。兩條路：

| 情況 | 走哪條 |
|---|---|
| 壞掉了、或想要一個沒有的功能 | **開 issue**：`gh issue create -R wangch15/travel-planner` |
| 已經在本機改好了，而且是純粹的改進（不是設計取捨） | **開 PR**，見 `.ai/rules/contributing-upstream.md` |

**模板作者自己改引擎**走另一條更短的路：在模板的工作目錄開分支 → PR（為了 review）
→ merge → 到行程 repo 跑 `tp-update` 用真實行程驗。**行程 repo 是引擎的測試場，
不是開發場。** 細節見 `.ai/rules/contributing-upstream.md` 的「有寫入權的人」。

**PR 的硬規則：分支裡不能有任何 `trips/` 底下的東西。**
模板的 fork 一定是公開的，行程資料與私人筆記推上去就是公開的，而且刪不掉。
`npm run contrib-check` 會在推之前擋下來。

## 作者這一端看得到什麼

**只有 issue 與 PR，而且要使用者主動開。** 沒有遙測、沒有回報、沒有錯誤蒐集。

這是設計上的取捨，代價是真的：

- **不知道有幾個人在用、有沒有人卡住。** 一個人裝不起來就默默放棄了。
- **修好的 bug 推不出去。** 每個人都要自己 merge，有人可能永遠停在舊版。
- **版本會無限期分岔。** 兩個人問同一個問題，答案可能不一樣。

`.github/ISSUE_TEMPLATE/` 的兩個模板都要求填引擎版本，就是在補最後這一條。
