# 交接說明

寫給接手這個專案的 coding agent。最後更新：2026-09-18。

## 現在的狀態

只有兩份文件，**一行程式碼都還沒寫**：

- `docs/superpowers/specs/2026-09-18-travel-planner-template-design.md` — 設計，已定稿核准
- `docs/superpowers/plans/2026-09-18-engine-skeleton.md` — 第 1 階段實作計畫，10 個任務 80 個步驟

## 第一件事

**照順序讀完這兩份檔案再動手。** 計畫的每個任務都寫明要改哪些檔、測試程式碼長什麼樣、預期的失敗訊息、以及 commit 指令。不要憑印象重新設計。

## 這是什麼專案

把 `/Users/wangch/GitHub/SENTAI2026`（一份七天日本自駕行程的互動網頁）抽成可 fork 的模板，讓非技術背景的朋友用自己的 coding agent 做出自己的行程網頁，部署到各自的免費 Cloudflare 帳號。

架構是「引擎 + `trips/<slug>/` 內容」：引擎歸模板作者維護，行程資料歸使用者，兩邊檔案集合不相交，所以 `git merge upstream/main` 不會衝突。已定的決策全在 spec §1 的表格，**不要重新討論**。

## 執行方式

計畫是用 superpowers 的 writing-plans 寫的，建議用 `superpowers:subagent-driven-development`（每個任務派一個全新 subagent，任務之間讓使用者 review）。沒有這個 plugin 的話，照計畫逐任務逐步驟執行也完全可行——步驟本身不依賴任何 plugin。

任務之間**停下來讓使用者確認**，不要一口氣跑完十個任務。

## 環境

- Node ≥ 20（開發機是 v24），套件管理器用 **npm**（不是 pnpm）
- 工作目錄 `/Users/wangch/GitHub/travel-planner`
- Task 4 會從 `/Users/wangch/GitHub/SENTAI2026/src/template.html` 複製既有頁面程式碼

## 別做的事

- **不要動 `/Users/wangch/GitHub/SENTAI2026`。** 它是使用者 2026/10 要用的真實行程，目前線上版正常運作。它的搬家是第 5 階段，另有計畫。
- 不要把真實行程資料（住宿名稱、航班、電話、家人飲食限制）放進這個 repo。`trips/_example` 必須是去識別化的，有測試把關。
- 不要幫使用者訂房、訂位或註冊帳號。

## 還沒決定的事

- travel-planner 要公開還是私有（目前私有；傾向加協作者讓朋友 fork）。這不影響第 1 階段的任何任務。

## 之後的階段

第 1 階段完成後依序是：底圖 Node 化、照片與 transit／parking UI、skills 與 agent 文件、SENTAI2026 搬家、朋友試跑。每個階段開始前先用 writing-plans 寫成計畫，不要直接開工。詳見 spec §10。
