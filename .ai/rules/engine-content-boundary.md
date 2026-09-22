# 引擎與內容的邊界

**什麼時候適用：** 任何時候你要建立或修改這個 repo 裡的檔案。

## 這條邊界是什麼

這個 repo 有兩種東西：**引擎**（模板作者維護）與**內容**（行程擁有者的資料）。
兩邊的檔案集合**不相交**——同一個檔案不會既是引擎又是內容。

## 哪些是引擎、哪些是內容

| | 路徑 | 誰維護 |
|---|---|---|
| 引擎 | `src/`、`scripts/`、`tools/`、`.ai/`、`.githooks/`、`docs/`、`public/`、`package.json` | 模板作者 |
| 內容 | `trips/<slug>/` 底下全部 | 行程擁有者 |
| 產物 | `dist/` | 誰都不維護，整個 gitignore |

**注意 `docs/` 有兩個**：repo 根目錄的 `docs/`（schema 文件、機制說明）是引擎；
`trips/<slug>/docs/`（使用者的筆記）是內容。兩者路徑不同，不會混。

`trips/<slug>/` 裡面：

- 引擎會讀：`trip.config.json`、五個資料檔、`photos/`、`basemap.json`、兩個插槽（`theme.css`、`extra.js`）
- 引擎**永遠不讀**：`docs/`（你的筆記）、`.cache/`（快取，gitignore）

## `src/` 裡面也有一條線：`render.js` 與 `app.js`

**要測的邏輯一律放 `render.js`。**

| 檔案 | 是什麼 | 測得到嗎 |
|---|---|---|
| `src/util.js`、`src/render.js` | **純函式**：吃資料、回傳 HTML 字串。不碰 DOM、不碰 `window` | ✅ 測試用 `node:vm` 載入它們（見 `tests/helpers/render-ctx.js`） |
| `src/app.js` | 只接 DOM 與事件：抓元素、綁 listener、把 `render.js` 的輸出塞進頁面 | ❌ **在測試環境跑不起來**，沒有 DOM |
| `src/styles.css`、`src/index.html` | 外殼 | 只被當文字檢查 |

所以**寫在 `app.js` 裡的判斷邏輯等於沒有測試**。實際踩過：燈箱「沒照片時要不要隱藏圖片區」
的判斷原本在 `app.js`，所以那個行為完全沒有測試覆蓋——把它抽成 `render.js` 的
`lightboxSliderHTML(key)` 之後才寫得出測試。

**判準**：那段程式碼只是「把字串塞進某個元素」→ 留在 `app.js`。
只要涉及**判斷**（要不要顯示、顯示幾個、顯示哪一種）→ 搬進 `render.js` 回傳結構或字串，
`app.js` 只負責照著做。

### 這條線也是信任邊界

`app.js` 與 build 出來的 HTML 在使用者的瀏覽器裡執行，跟 `trips/<slug>/extra.js` 一樣
**視為不受信任的程式**——它們碰得到頁面，但碰不到憑證、部署或檔案系統。
`render.js` 只是產生字串，不執行任何來自行程資料的程式。
把判斷放在 `render.js` 不只是為了可測，也讓「哪些程式碼需要被信任」這件事界線清楚。

## 為什麼重要

行程擁有者的複本要能長期 `git merge upstream/main` 拿到引擎更新。
只要雙方的 commit 只碰各自那一邊，merge 就不會衝突。
一旦你把行程資料寫進 `src/`，或把引擎邏輯寫進 `trips/`，這個保證就沒了。

## 想改引擎之前

**先試插槽，九成的需求插槽就能解決：**

1. 想換顏色、字型、間距 → 改 `trips/<slug>/theme.css`，覆寫 CSS 變數就好。
2. 想加一個引擎沒有的區塊 → 用 `trips/<slug>/extra.js`，可以掛在總覽頁尾或指定那一天的頁尾。

**真的非改引擎不可時：**

- 把改了什麼、為什麼插槽做不到，寫進 `trips/<slug>/docs/engine-changes.md`。
  下次 merge 衝突時，那份筆記就是你怎麼解的依據。
- 考慮用 `.github/ISSUE_TEMPLATE/feature.md` 回報給模板作者，讓它變成引擎的正式功能，
  你就不用一直自己維護那個修改。
