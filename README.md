# travel-planner

把一份粗略的旅程初稿，變成一個能在手機上用的互動行程網頁——有地形圖、逐段交通、餐食與備案、行前清單——然後部署到你自己的免費 Cloudflare 帳號。

**主要用法是：把你想做的事直接告訴你的 coding agent。** 這個 repo 裡有給 agent 看的操作說明，你不需要自己讀程式碼。

## 怎麼開始

把這個 repo 交給你的 coding agent（Claude Code、Codex、Gemini CLI 都可以），然後說：

> 請讀 AGENTS.md，我想做一個行程網頁。

agent 會照 `.ai/skills/` 裡的流程帶你走：準備環境 → 收集你的行程想法 → 查核資料 → 產生地圖與照片 → 預覽 → 部署。

過程中有三個地方**一定會停下來等你**：確認逐日草案、部署前的預覽、以及任何要花錢或代表你的動作（訂房、訂位、註冊帳號——agent 只給連結，不會替你做）。

## 需要什麼

- **Node.js 20 以上**（開發機為 v24）。套件管理器用 **npm**。
- **GitHub 帳號**，用來 fork 這個 repo、保存你的行程。
- **Cloudflare 免費帳號**，用來放網站。不需要付費方案。

註冊帳號、瀏覽器授權這類「只有本人能做」的步驟，agent 會停下來請你動手，不會替你做。

## 快速開始

```bash
npm install
npm test                      # 引擎自我檢查，應該全綠
npm run check -- _example     # 驗證附帶的範例行程
npm run preview -- _example   # 開 http://localhost:4173 看實際頁面
```

`trips/_example/` 是一份去識別化的三天兩夜範例：住宿是虛構名稱，沒有航班與聯絡資訊，但資料的形狀跟真實行程一模一樣。**要知道一份行程資料該長什麼樣，先看它。**

## 指令

所有指令都吃一個 `<slug>` 參數（你的行程資料夾名稱）。`trips/` 底下只有一個行程時可以省略。

| 指令 | 做什麼 |
|---|---|
| `npm run new -- <slug>` | 建立一個新行程的骨架 |
| `npm run check -- <slug>` | 驗證資料：座標、交通方式、詳細說明、照片授權、清單一致性 |
| `npm run build -- <slug>` | 產出 `dist/<slug>/site/index.html`（單一檔案）與 `wrangler.json` |
| `npm run preview -- <slug>` | build 後在 `localhost:4173` 開一個本機伺服器 |
| `npm run ship -- <slug>` | build 後用 wrangler 部署 |
| `npm run basemap -- <slug>` | 從 OpenStreetMap 與公開高程資料產生地形底圖 |
| `npm run photos -- <slug>` | 依 `photos.json` 把照片抓進行程資料夾 |
| `npm run migrate -- <slug>` | 引擎更新後，把舊格式的資料升版 |
| `npm run sync:agent-assets` | 改過 `.ai/` 之後，重新產生 `AGENTS.md` 與 `CLAUDE.md` |
| `npm test` | 引擎自己的測試 |

`ship` 第一次跑之前要先 `npx wrangler login`（會開瀏覽器請你授權）。

## 目錄結構：引擎與內容的邊界

這個 repo 有一條硬邊界，**merge 不衝突全靠它**：

```
travel-planner/
├── src/         引擎前端：頁面外殼、樣式、render、互動
├── scripts/     引擎指令：check、build、preview、ship、new、migrate
├── docs/schema/ 六個資料檔的欄位文件 ← 改資料前先讀這裡
├── public/      _headers 與 robots.txt
└── trips/
    ├── _example/     模板附的範例行程
    └── <你的行程>/
        ├── trip.config.json     標題、日期、範圍、人數、部署設定
        ├── data.js              地點、每天的行程、住宿、行前清單
        ├── details.js           每個地點的詳細說明
        ├── dining.js            餐飲規劃
        ├── map-lists.js         Google Maps 每日清單
        ├── photos.json          照片來源與授權
        ├── theme.css            插槽：覆寫配色
        ├── extra.js             插槽：自訂區塊
        └── docs/                你的筆記，不會進入網站
```

- **引擎是模板作者維護的**，`git merge upstream/main` 會更新它。
- **`trips/<你的行程>/` 是你的**，作者永遠不會碰。
- 兩邊的檔案集合不相交，所以更新引擎不會跟你的行程資料衝突。
- 想改外觀先試 `theme.css`，想加區塊先試 `extra.js`。真的改了引擎，記得在 `trips/<slug>/docs/engine-changes.md` 寫下來，下次 merge 才知道怎麼解。

## 隱私

- 網站帶 `noindex` 與 `robots.txt` 的 `Disallow: /`，不會被搜尋引擎收錄；但**拿到網址的人就能打開**，不是密碼保護。
- 飲食限制、訂位資訊、門鎖密碼、聯絡方式這類東西只放 `trips/<slug>/docs/`，那個資料夾不會進入網站產物。
- 勾選清單的狀態只存在瀏覽器的 localStorage，不會同步、不會上傳。

## 授權與資料來源

地圖使用 OpenStreetMap 圖資（© OpenStreetMap 貢獻者，ODbL）與公開高程資料（日本為国土地理院，其他地區為 Terrain Tiles）。照片只收 CC／Public domain 授權，或官網照片並標明來源——授權不明的一律不收，`npm run check` 會擋。

## 回報問題

用 GitHub issue：[bug 模板](.github/ISSUE_TEMPLATE/bug.md) 或 [功能建議模板](.github/ISSUE_TEMPLATE/feature.md)。

開功能建議之前，先試試看 `theme.css`（換配色）與 `extra.js`（加自訂區塊）這兩個插槽——九成的需求它們就能解決，而且不用等新版本。
