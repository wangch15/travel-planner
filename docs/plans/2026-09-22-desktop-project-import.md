# Desktop existing-project import implementation plan

> 執行採 superpowers:executing-plans 的逐項驗證原則；本輪沿用 lamprey，不另建工作樹。

**Goal:** 既有使用者可以選取現有 travel-planner 專案、辨認原本的行程，再逐步接手修改與預覽，不必從零建立。

**Architecture:** 原型以 Electron 原生資料夾選擇器授權單一目錄，主程序只讀固定 JSON 中繼資料。檢查結果與操作狀態留在記憶體，原始專案不被修改。真實資料與假行程示範清楚分開，AI、寫入、Git 與部署能力尚未接線。

**Tech Stack:** Node 既有測試工具、Electron 的獨立原型套件、原生 HTML/CSS/JS 技術介面；正式產品的 React/TypeScript 組裝等技術驗證後再進行。

---

## 已確認與範圍

2026-09-22 使用者同意先做技術驗證、最小可操作介面、再打通完整案例，並新增既有專案匯入需求。未授權操作真實登入、部署或推送。此公開引擎文件只用假 repo 與假行程，不記使用者私人 repo 名稱、路徑或內容。

「匯入」對已下載專案代表連接現有資料夾；對 GitHub-only 專案代表先下載私人副本，再走同一檢查。兩者共用相容性結果。優先完成本機入口，因本機可能另有未提交內容與不進 Git 的部署成功紀錄；只重新 clone 不能取代它。

## 首次體驗與不變條件

1. 選「連接既有專案」，透過 OS 選擇資料夾。
2. 唯讀讀取固定位置的 package.json、trip.config.json；列出全部行程讓人選。不得載入 data.js、extra.js、repo scripts、Git hooks 或任意專案程式。
3. 顯示「辨識到的版本」「設定可讀／格式待處理」「部署設定存在，但遠端歸屬未核對」；設定可讀不等於資料驗證通過。
4. 本階段允許查看基本資料；版本不符或資料破損仍列出具體問題，不偷偷升級、修復、刪除或隱藏整趟。
5. 本機未提交檔、私人 docs、photos、basemap、theme/extra、Git 歷史和 .local 部署紀錄原樣保留。切旅程只換 UI 的選取，不能改變已啟動工作的目標。
6. 連接不授權 AI 讀取整個 repo；選定旅程、私有歸屬通過、執行隔離通過後才建立受限工作副本。
7. 既有 status.md 是內容交接，不把勾選當成本次 GUI 發佈／草案確認。先前 agent session 不會因匯入 repo 就自動復原。
8. 既有部署缺少本機成功紀錄時，後續走既有 adopt-deploy 核對流程；不猜網址、不重建同名站點。Pages 設定保留並清楚顯示能力限制，不自動改成 Workers。

## Task 1：可重用的唯讀專案檢查

Files: `desktop/spikes/inspect-project.cjs`, `tests/desktop-import.test.js`。

先寫並執行失敗測試：既有多趟專案、部分設定破損、未來 schema、缺欄位、非專案目錄、符號連結、過大 JSON、惡意 JS 不執行、檢查前後檔案逐位元不變。不讀私人 docs 或憑證；回傳白名單欄位及錯誤代碼，不把原始 JSON／例外內容傳 renderer。

用 bounded read 與固定路徑實作檢查。所有結果維持 `readOnly: true`、`contentValidation: 'not-run'`、`ownership: 'unverified'`。這是前置檢查，不是 OS 沙箱證據；競態與整個 agent 執行限制仍在 S3。

驗證：`node --test tests/desktop-import.test.js`。

## Task 2：桌面技術原型

Files: `desktop/prototype/package.json`, `main.cjs`, `preload.cjs`, `index.html`, `app.js`, `style.css`, `README.md`; root `package.json` 加啟動入口。

Electron 獨立鎖版與 lockfile，不影響旅程 build。原生選取資料夾 → 檢查摘要 → 選旅程 → 查看基本資訊。取消、非專案目錄、破損行程與重選專案都可恢復。

IPC 只提供選資料夾；renderer 不傳任意路徑、指令或 channel。驗證 sender 主 frame；禁 Node、開 contextIsolation 與 sandbox，拒絕導航、彈窗和額外權限。顯示文字用 textContent。預覽先只提供記憶體假資料，不能載入被選 repo 的 HTML／JS。

假行程可新增、選取、以明示的固定模擬回覆更新一天文字並預覽；不能稱為真實 Codex 或既有引擎建置。清楚標示退出後不保存原型狀態。畫面顯示目前選取行程、資料來源與可用操作，不做正式視覺定稿。

驗證：macOS Electron 啟動與實際 DOM 流程、最小視窗尺寸、惡意字串顯示為文字；既有 `npm test` 回歸。Windows 僅在原生環境跑過才能記通過。

## Task 3：後續接手能力（本切片未完成）

- GitHub-only 入口：使用者登入後列 repo／輸入網址，先驗 private 與歸屬，再下載到非模板的私人目錄；安全 Git 環境、取消與重複匯入要測。
- 本機 origin 的真實 fetch/push URL、remote include 規則、分支、未提交檔與版本差異唯讀核對；未驗私有不開寫入／備份。
- 相容性：受限 literal parser 讀 JS 資料，診斷客製引擎與舊版 schema；修復／遷移是獨立明示操作。
- Codex S1、OS 隔離 S3、受限建置 S4：兩 OS 都留下證據，再開真實資料修改與預覽。
- 本機 registry 保存連接身份，重新開啟需重新核對；journal 保存新 GUI 任務的證據，既有私人 status.md 保留。

## 首次切片的驗收與證據

2026-09-22 實際完成 Task 1、Task 2 的第一個本機切片：

- 既有專案唯讀檢查的 7 個測試通過；整套 `npm test` 484 通過、0 失敗。
- 真正 Electron 44.4.3／macOS arm64 視窗 smoke 通過 10 組案例：取消、既有專案檢查、私人筆記不回傳、真實專案唯讀 UI、選錯目錄恢復、示範修改與預覽、HTML escaping 與預覽隔離、新建示範、跨旅程版本／草稿分離、小視窗無水平溢出。
- smoke 的來源是 temporary 假專案，OS picker 用注入的結果；原生對話框本身未做人工點選驗收，未讀取使用者私人 repo。
- 初次 smoke 發現預覽與導航限制需協調，改為僅允許主框架直接子框架的 about:srcdoc；禁止腳本的框架也會拒絕測試 executeJavaScript，所以改用 DevTools DOM 讀取渲染結果，沒有放寬 sandbox。失敗 smoke 明確以非零退出。
- 獨立 review 找出的 deploy.target 預設與名稱格式差異已改為共用現有引擎規則，regression 及複查通過。
- 已查看本機截圖；畫面是功能技術原型，未作正式視覺定稿。截圖與測試 log 留在 gitignored `.local/desktop-prototype/`。
- Electron 自動下載停滯，本機改從官方 release 分段下載同版 arm64 archive，依 npm 套件 checksums.json 驗 SHA-256 後解壓。此為本機環境處理，未更動安裝器／套件來源；乾淨機下載體驗尚待 S6 驗證。

目前階段：既有本機專案的唯讀辨識＋假行程操作原型已可試用，並非完整匯入後編輯功能。

等待確認：使用者可試用原型；已詢問既有專案的本機路徑，以便後續唯讀相容性檢查，未收到時不猜位置。

阻礙／未驗：未有 Windows 原生實測、Codex 真實執行、OS agent 沙箱或真實專案相容性證據；GitHub-only 下載入口未實作。

下一步：取得既有專案位置後唯讀核對；繼續 S1／S3／S4，通過後開啟選定旅程的安全修改与引擎預覽。未 commit/push、未登入、未發模型請求、未部署。

### 同日啟動問題修正

使用者回報打開 App 沒有畫面。由實際 `npm run desktop:prototype` 重現：Electron 程序存在，但 OS 回報視窗數為 0。先前 smoke 直接呼叫 createWindow，漏過 package entry 的 `require.main === module` 判斷；此 Electron 載入路徑不滿足該判斷，啟動被略過。

改以無條件執行的 `boot.cjs` 為 package main，`main.cjs` 只匯出視窗建立函式。新增 `startup-smoke.cjs` 從真實 package entry 啟動，以 loopback DevTools target 的 URL／標題確認頁面出現；同一測試修正前失敗、修正後通過。另以 computer-use 觀察實際使用者視窗與截圖，確認畫面可見。原型改由 lamprey 的 Orca「桌面原型」終端維持執行，交接不再依賴 agent 暫時 exec session。

技術依據（查核 2026-09-22）：[Electron security](https://www.electronjs.org/docs/latest/tutorial/security)、[native dialog](https://www.electronjs.org/docs/latest/api/dialog)。
