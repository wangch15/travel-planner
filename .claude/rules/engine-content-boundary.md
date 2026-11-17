# 引擎與內容的邊界

**什麼時候適用：** 任何時候你要建立或修改這個 repo 裡的檔案。

## 這條邊界是什麼

這個 repo 有兩種東西：**引擎**（模板作者維護）與**內容**（行程擁有者的資料）。
兩邊的檔案集合**不相交**——同一個檔案不會既是引擎又是內容。

## 哪些是引擎、哪些是內容

| | 路徑 | 誰維護 |
|---|---|---|
| 引擎 | `src/`、`scripts/`、`packages/`、`desktop/`、`tools/`、`.ai/`、`.githooks/`、`docs/`、`public/`、套件與 workspace 設定 | 模板作者 |
| 內容 | `trips/<slug>/` 底下全部 | 行程擁有者 |
| 產物 | `dist/` | 誰都不維護，整個 gitignore |

**注意 `docs/` 有兩個**：repo 根目錄的 `docs/`（schema 文件、機制說明）是引擎；
`trips/<slug>/docs/`（使用者的筆記）是內容。兩者路徑不同，不會混。

`trips/<slug>/` 裡面：

- 引擎會讀：`trip.config.json`、五個資料檔、`photos/`、`basemap.json`、兩個插槽（`theme.css`、`extra.js`）
- 引擎**永遠不讀**：`docs/`（你的筆記）、`.cache/`（快取，gitignore）

## 呈現邏輯與互動狀態

**決定 HTML 內容的純邏輯放 `src/render.js`；DOM 與互動狀態留在 `src/app.js`。**

| 檔案 | 責任 | 驗證方式 |
|---|---|---|
| `src/util.js`、`src/render.js` | 純函式：依資料決定文字、HTML 與顯示結構，不操作 DOM 或 `window` | `tests/helpers/render-ctx.js` 用 `node:vm` 載入 |
| `src/app.js` | DOM 更新、事件、目前分頁／燈箱等互動狀態 | 瀏覽器或 Electron 整合測試；上述 VM harness 沒有 DOM |
| `src/styles.css`、`src/index.html` | 頁面外殼與樣式 | 結構檢查與實際頁面驗證 |

例如「照片資料為空時輸出哪種結構」可抽成 `lightboxSliderHTML(key)`，
「點擊下一張後更新目前索引」仍是互動層的責任。
`desktop/prototype/app.js` 是桌面工作台的 UI，另由原生 Electron smoke tests 驗證；
此分工不要求把桌面的狀態判斷搬進旅程網頁的 `src/render.js`。

### 執行環境與信任邊界

- CLI 建置會透過 Node 載入行程模組，包括 `extra.js`，因此只能對可信任的專案執行；
  這些模組在建置時具有該 Node 程序的權限，並非只在瀏覽器執行。
- 桌面匯入由 `packages/engine` 靜態解析允許的資料與 `extra.js`，不執行匯入專案的程式。
  `packages/engine/render.cjs` 使用 App 自帶的模板，把已解析資料組成 HTML。
- 產出的 HTML、`src/app.js` 及自訂 HTML 在桌面預覽中均視為不受信任，
  由隔離 frame 執行，沒有宿主 IPC、Node、憑證或部署權限；宿主才處理檔案與發布。
- 純函式分工改善可測性；實際權限隔離由靜態解析、Electron 與預覽限制維持，
  不會因為把函式搬到 `render.js` 就自動取得安全隔離。

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
