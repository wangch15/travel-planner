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

## 全程執行模式

使用者要求一路做到完。**只有第 1 階段有計畫**，第 2–6 階段在 spec §10 只有一行敘述——每個階段開工前，先用 `superpowers:writing-plans` 把那一階段寫成 `docs/superpowers/plans/YYYY-MM-DD-<階段名>.md` 並 commit，再執行。不要跳過寫計畫這一步，也不要把六個階段合成一份計畫。

### 階段與完成定義

| 階段 | 完成定義 |
|---|---|
| 1. 引擎骨架 | `npm test` 全綠；`trips/_example` 可 check／build／preview；引擎原始碼不含行程專有名詞 |
| 2. 底圖 Node 化 | `npm run basemap -- _example` 產出可用底圖；幾何單元測試通過；用 SENTAI 的 bbox 跑一次，海岸線形狀、島數（46）、等高線層級與 `/Users/wangch/GitHub/SENTAI2026/src/basemap.json` 比對一致 |
| 3. 照片與 UI | `npm run photos` 可用；transit 的地圖線型與圖示、`parking` 的燈箱區塊與每日彙整都在畫面上看得到 |
| 4. Skills 與文件 | `.ai/` 建好並 sync 出 `AGENTS.md`／`CLAUDE.md`／`GEMINI.md`；七個 skill 寫完；README、CHANGELOG、issue 模板齊備；tag v1.0.0 |
| 5. SENTAI2026 搬家 | 見下方硬規則 |
| 6. 朋友試跑 | **不要自己做。** 這一步需要真人，做完第 5 階段就停下來回報 |

### 每個階段結束時

commit、把計畫裡的 checkbox 打勾、在回報裡寫清楚「完成了什麼／跳過了什麼／為什麼」。checkbox 是下一個 agent 接手的斷點——context 用完時，接手的人靠它知道做到哪裡。

### 必須停下來問人的事

1. **第 5 階段動 SENTAI2026 之前一定要先問。** 那是使用者 2026/10 要用的真實行程，線上版正在運作。動它之前先建 `legacy-v4` 分支；搬完之後要逐頁比對線上版（總覽、七天、燈箱、餐飲、地圖、手機寬度），比對結果給人看過才 `ship`。不要自己決定「看起來一樣」。
2. **任何 `wrangler` 部署**。首次部署需要 `wrangler login`（瀏覽器授權），那是人的動作；沒登入就別硬試，回報並停下。
3. **刪除或覆寫既有檔案**，尤其是 SENTAI2026 底下的任何東西。
4. **第 4 階段的 agent-assets-kit setup** 會跑 `pnpm dlx github:wangch15/agent-assets-kit setup`。這是唯一容許用到 pnpm 的地方（它是一次性 installer，不是專案相依）；跑之前先 `--dry-run` 並把要寫入的檔案列給人看。

### 第 2、3 階段的實際風險

- Overpass 公共 API 會限流與逾時。快取原始回應到 `trips/<slug>/.cache/`，失敗就等幾分鐘重試或換鏡像，**不要**改小 bbox 或降低精度來「讓它過」——那會讓比對失去意義。
- 抓 DEM 圖磚與照片都會下載大量檔案。照片只收 CC／Public domain，或官網照片並標註來源；授權不明就不要收。

### 做不完的時候

context 或額度快用完時，不要硬塞一個做到一半的任務。把當前任務做到一個可 commit 的點、更新 checkbox、在回報裡寫下一步是什麼。這份 HANDOFF.md 加上計畫的 checkbox 就是完整的交接。
