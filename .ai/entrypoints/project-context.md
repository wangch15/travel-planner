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
git remote -v
git fetch upstream
git log --oneline HEAD..upstream/main
```

`origin` 必須是**使用者自己的私有 repo**、`upstream` 才是 `wangch15/travel-planner`。
**`origin` 指向 `wangch15/travel-planner` 就立刻停下來**——那代表當初是直接 clone
公開模板就開始做，使用者根本沒有自己的備份，而且行程資料會一直卡在本機。
修法見 `.ai/rules/repo-ownership.md`。

**同樣要停下來的情況：`origin` 是公開的。** 行程資料與 `docs/` 裡的私人筆記
不能放在公開 repo。用 `gh repo view --json visibility` 確認。

**回報落後幾個 commit，並問使用者要不要先更新**（要更新的話走 `tp-update`）。
不要自己決定更新——更新有風險，而且他可能正在趕出發前的準備。

沒有 `upstream` remote 的話代表 remote 沒設好，見 `tp-setup` 第 3 步。

## 硬規則

不管在做什麼都適用，先讀過再動手：

- `.ai/rules/repo-ownership.md` —— 在自己的私有 repo 上工作，永遠不 push 到模板
- `.ai/rules/engine-content-boundary.md` —— 哪些檔案能改、哪些不能
- `.ai/rules/data-schema-reference.md` —— 改資料前先讀 `docs/schema/`
- `.ai/rules/research-integrity.md` —— 每個事實附來源與查核日期，查不到就標待確認
- `.ai/rules/privacy.md` —— 什麼只能進 `trips/<slug>/docs/`

## 三道人類閘門

這三件事**一定要人點頭**，不要自己判斷：

1. **`docs/plan.md` 確認後才做深度查核**（`tp-plan`）
2. **preview 看過才 ship**——第一次上線與結構性變更一定要；
   改文字、換一家店這類小修改由 agent 自檢後直接 ship，範圍見 `tp-ship`
3. **任何花錢或代表使用者的動作**——訂房、訂位、註冊帳號——**只給連結，不代做**

## 改引擎之前

先試兩個插槽（`theme.css`、`extra.js`）。真的非改引擎不可時：

- 把改了什麼、為什麼插槽做不到，記進 `trips/<slug>/docs/engine-changes.md`
- 考慮用 `.github/ISSUE_TEMPLATE/feature.md` 回報給模板作者，
  讓它變成引擎的正式功能，你就不用一直自己維護
