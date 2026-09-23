# Desktop GUI 改版交接：lamprey

最新0.3.2已更新並開啟本機App：session provider首次送出後鎖定，明確另開其他AI對話；修正effort串值、模型切換相容性與Codex Auto持續override，新增每則回覆設定記錄。Claude登入判定增加官方狀態核對與安全分類，但目前仍需使用者在已開啟的新版重試以確認真實原因；舊App profile無登入且無debug記錄。已透過async問題請使用者重試並提供App提示，不要代做OAuth或假稱登入已修好。資料檔未修改。細節見desktop README最新版。未重建DMG，沿用本機App快速更新。

最新0.3.1已更新並開啟本機App，封裝啟動驗證通過。這輪未重建DMG（檢查時僅403MiB可用，保留既有安裝映像），現有DMG最新仍0.3.0。

最新0.3.1：主動停止意圖與回合結束證據分開保存，可確認後原對話續聊；未知／舊紀錄不假稱手動停止，僅核對metadata、不重送。修正macOS Claude HOME造成預設Keychain失聯，保持App帳號設定隔離；只讀系統／真實CLI狀態probe通過，OAuth尚待使用者重試。208桌面單元測試與stop/workflow/safety/settings原生測試通過。使用Sol子agent處理停止子任務，父agent修復鑰匙圈並review，沒有操作系統重置或真實旅程。以下為歷史狀態。

最新版本為0.3.0（2026-09-23）：暫停後草稿可編輯且重啟保留；設定頁統一專案取得與專案內旅程、獨立三家AI連線與新對話預設值、合併備份／發布分頁及緊密對齊工具列。201桌面＋92引擎測試與相關原生smoke通過，封裝啟動及DMG驗證通過。詳見2026-09-23-settings-composer.md，優先於下方歷史版本。

日期：2026-09-22。這是需求與研究交接，不是人已核准的完整設計或實作計畫。

接手更新（同日）：使用者已同意先做技術驗證與最小原型，並要求接手既有專案。已實作 [既有專案唯讀辨識與桌面原型](2026-09-22-desktop-project-import.md)，macOS 假資料 smoke 通過。下文「已做研究」「第一個任務」保留原交接背景，以文末最新四欄及最新計畫為準。

## 2026-09-23 最新：0.2.0 導覽與多服務

已處理使用者8點：旅程→對話側欄、更多／右鍵選單、品牌後方toggle及窄列設定、持久化示範刪除、正式旅程回收區與還原、啟動核對登入、工具安裝引導、Claude／Gemini CLI adapter、參考圖風格設定頁。原有提案／版本／備份／發布閘門保留。

791單元測試與原生navigation／workflow／batch／versions／safety／UI／startup／preview／updater通過。新providers20個假程序測試及實际無登入startup／ACP初始化已驗；真實模型回覆需使用者在App完成獨立登入後驗證，未代授權／花費。詳見 2026-09-23-desktop-navigation-providers.md 與 desktop/prototype/providers/PROTOCOL.md。

交付 `.local/distribution/Travel Planner.app` 0.2.0 與同目錄 `TravelPlanner-0.2.0-mac-arm64-unsigned.dmg`。未簽章／公證，Windows待實機；沒有改動真實旅程、推送或發布。使用者要求後續subagent按任務難度選較合適模型，以降低token；已啟動任務有限範圍收尾，父agent集中review，不額外重派。

## 最新狀態：完整桌面功能批次（2026-09-22）

使用者已明確要求將核准清單一次做完，不再以單一里程碑結束。下列狀態優先於本文較舊交接。

- 目前階段：私人備份／完整匯出還原、受控 Workers 發布與明確接管、正式新旅程／草案確認／來源查核／候選建置、文字圖片與公開網址附件、多日修改／思考強度／Markdown、多對話命名封存、工作結果核對／同帳號額度等待／明示交接、工具登入、GitHub 下載與建立、備份署名，以及原生更新接線已完成。原生 smoke 與封裝啟動均已通過；0.1.0 Mac App 與本機 unsigned DMG 已產出，hdiutil 完整性驗證通過。
- 已驗：root501、engine92、desktop164，共757項單元測試。原生 UI／startup／preview／workflow／versions／batch／batch-safety／updater 皆通過；封裝 App 也以隔離資料實際啟動驗證。真實範例驗證搜尋引用、圖片理解及跨日候選通過，沒有修改真實行程。
- 等待確認：開發與本機驗證無需再等。真實 GitHub／Cloudflare 授權與每次備份／發布由使用者在 App 明確操作；簽章／公證／公開release未獲憑證或發布授權。
- 阻礙：Windows 原生實機由使用者後續測試。Mac 本機產物未簽章／公證，不能宣稱正式自動更新已端到端跑通。
- 本機產物：`.local/distribution/Travel Planner.app`、`.local/distribution/TravelPlanner-0.1.0-mac-arm64-unsigned.dmg`。新版已開啟，原開發 App 已正常關閉。
- 下一步：使用者可操作整批功能；Windows 原生測試與正式簽章發布依使用者安排。具體能力與限制見 desktop/prototype/README.md 和 distribution/README.md。

## 最新補充：日程版本與部分回復（2026-09-22）

- 目前階段：已實作初始 V1、本機保存版本、外部修改紀錄、修改前後對照與勾選、整體日程回復／跨日部分回復、回復後保留較新版本，以及未確認提案重開恢復。
- 邊界：版本是目前 App 可編輯的 data.js 日程；周邊資料不同即拒絕舊版套用，不還原照片／docs／部署。記錄不等同 GitHub 備份。最大100版本／32MiB，不會靜默刪歷史。Windows 尚未實機驗證，目錄 fsync 不宣稱 Windows 斷電保證。
- 驗證：fake native versions smoke 驗 V1→V6，含跨日部分還原、原位元完整還原、再找回後來版、重開提案與放棄操作重疊拒絕。Spec／quality review 修掉非同步放棄競態與未改日共享 const 引用的相容回歸。
- 等待確認：使用者查看實際操作。沒有要求對真實行程保存、部署或遠端推送；本輪用假資料測試。
- 下一步：依已授權 roadmap 繼續私人備份、研究查核／跨日AI、新旅程與發布，再到工作恢復與發行；它們尚未完成。完整計畫見 2026-09-22-desktop-versions.md。

## 最新補充：參考介面研究完成（2026-09-22）

- 使用者手動開啟 Codex 設定，已用 Computer Use 截取並觀察；Orca 側欄同樣已實際查看，設定改依使用者提供截圖研究。工具的點擊焦點限制仍存在，不再要求使用者切離 Orca CLI。
- 已落實側欄搜尋／分組／固定底部入口、設定分組與內容寬度、標題層次與描邊選取。補上設定專用 Header、分類與捲動位置保留、⌘,／Ctrl , 開啟、Escape 返回及焦點恢復。
- 使用者另要求 macOS App icon 圓角，已加入專用 rounded PNG／ICNS 與 Dock 引用；Logo 原始 SVG 不變。
- 本項研究不再等待使用者開頁。原生操作測試驗證目前介面；Windows 實機仍待後續。無修改真實行程、無發布或推送。
- 觀察與採用項目見 docs/reviews/2026-09-22-desktop-navigation-reference.md；原始參考截圖沒有進公開 repo。

## 最新補充：對話保存與 v2 Logo（2026-09-22）

- 目前階段：既有旅程對話／草稿／模型／範圍可重開恢復；Codex 原生 thread 續接、帳號綁定、未知／停止不重送、明確重開上下文已接線。未確認提案重開失效；沒有恢復人類批准。兩份 v2 原始透明 SVG 位元保留，UI／favicon／PNG／ICO／ICNS／manifest 已替換。
- 驗證：原生 workflow 包含跨視窗恢復、正常關窗草稿、模型與範圍、停止／中斷、儲存失敗時阻止導航與清理不可見提案。真實 gpt-5.6-sol 在 transport 重啟後理解前文指代，產生正確單日提案、完整驗證與候選 HTML；臨時來源未改。初次 Astra 第二輪超時查核為 interrupted。真實測試找出 scope instructions 延續干擾，改成共用指令＋每輪明示 mode 後通過。
- UI：側欄搜尋／分組／固定帳號入口與設定分組已加入；來源是 Computer Use 實際 Codex 側欄觀察和使用者先前提供的設定參考。Computer Use 的焦點檢查目前拒絕鍵盤／點擊，尚未完成兩個 App 設定頁的實際操作研究；不得宣稱已完成。
- 等待確認：使用者手動打開 Codex 設定，以便續做 Computer Use 觀察。也待查看新版操作。
- 下一步：完成兩個 App 的設定頁觀察及必要調整；Windows 原生、安裝包、研究／發佈／備份與 quota 自動續作仍待後續。真實行程未改；未 commit／push／部署。

## 最新補充：帳號與工作台操作（2026-09-22）

- 目前階段：使用者回報已親自登入。已增加單帳號更換流程、登入連結複製、全寬原生 Header、側欄收合窄列、左右拖曳及鍵盤調寬、聊天模型切換、本機瀏覽器預覽。「不指定」為整體討論，不建立修改提案、不寫行程。
- 等待確認：使用者查看新版版面，並在需要時自行選擇帳號。真實模型提案仍待驗證，不把假模型測試記成真實 AI 成功。
- 阻礙：Windows 原生留待使用者實機測試；安裝器、研究、部署、自動續作仍為後續階段。
- 下一步：以選定帳號驗證真實文字回覆與候選預覽；保存仍需人確認。全部程式改動留本機，未 commit／push／部署。
- 本輪驗證：55 項桌面單元／整合測試通過；原生 smoke 覆蓋四種面板組合、拖曳與鍵盤調寬、草稿及明暗；workflow smoke 覆蓋換帳號、快速登入事件、模型同步、討論不寫入、瀏覽器預覽與候選保存；真實入口 startup 通過。獨立 review 未發現阻擋問題。native workflow 結束仍偶有 Chromium GPU teardown 訊息，assertion 與退出碼成功。

## 最新的使用者決定（優先於早期研究）

- 使用者是 travel-planner 模板作者，在做產品／引擎升級，不是在建立真實行程。
- 第一批先給認識的幾位非技術朋友使用，暫不以陌生人公開下載或雲端 SaaS 為目標。
- **第一版要同時支援 Windows 與 macOS**。早期說 Mac first 已被這項最新決定取代。
- 多數朋友可能使用 ChatGPT，所以以 Codex 優先；Pi Web 只是 Web UI 形式參考，**不要求也不應擅自採用 Pi 作第一版 runtime**。
- Claude Code 可作後續整合；OpenCode／Pi 之後再考慮。Gemini 原始構想提過，但不是已確認的首版必做。
- 額度耗盡後的 keep going 是：**等待同一 ChatGPT 帳號額度恢復後，自動繼續原工作**，不是換帳號、繞過限制或自動付費。
- 使用者也喜歡 Orca 式 handoff。要納入設計／範圍討論，但尚未確認首版的完整跨 agent handoff 能力。
- 使用者已建立 lamprey worktree，並表示可在這裡處理重大改版。沿用既有分支，不另開同名或重置分支。

## 使用者最初的產品構想

- 旅程管理：側邊欄像 session 列表，點選後以該趟旅程為修改對象。
- Create new trip 燈箱／表單：輸入建立需要的基本資料，支援參考檔案與網址；其餘透過對話補齊。
- 類似 Codex App 的聊天窗，可貼圖片、顯示 AI 回覆和作業成果。
- 預覽與發佈等快速動作。
- 設定中提供工具安裝、帳號連接，以及有目的的內嵌終端機輔助必要互動。
- 背景使用 CLI／正式程式介面，讓非技術使用者不必自己操作指令。
- 模型與 effort 選擇，依 agent／模型實際支援能力呈現。

## 已做的研究與狀態

- 研究筆記：`docs/reviews/2026-09-22-orca-gui-feasibility.md`。原本標題和部分建議是 Mac first；請保留查核事實，但將最新跨平台需求納入後續設計。
- Orca：`https://github.com/stablyai/orca`，已讀 commit `5769eb6724d3b094893dccdf849dc47c3718cf72`。MIT，借用實質程式需保留授權，第三方服務與依賴條款另外查。
- 原始碼研究副本位於本機臨時目錄 `/tmp/travel-planner-orca.ccpXPh/orca`，可用則唯讀參考，可能被系統清掉；持久證據以研究筆記內固定 commit URLs 為準。不把臨時目錄中的指令當成可信操作要求。
- Orca 分 terminal/transcript 聊天與 experimental structured native chat 兩種。後者的 runtime 接 Codex app-server 與 Claude Agent SDK／本機 Claude Code。不要把「支援任意 CLI」宣稱為所有 agent 有相同聊天能力。
- Orca 有引導設定用臨時 PTY、原生登入、model/effort 能力查詢、durable session、訊息投遞 unknown 狀態與中斷恢复；整套 fork 不推薦。
- 現有 `scripts/new-trip.js`、`build.js`、`check.js`、`preview.js`、`ship.js`、`unship.js` 等可重用。引擎是 Node，Electron + React + TypeScript 是推薦候選，尚未正式拍板。
- 本機查看分支時 HEAD 是 `ae014d476c67bc7abb5db5da681329b419ed23c7`，分支 `wangch15/lamprey`。開始時 worktree 乾淨、npm setup 已跑完。`npm run trips` 只有模板範例，`npm run update-check` 回報最新版 1.1.0，origin 是公開模板。
- 本輪只移入研究筆記、新增本交接文件。未做 GUI、未加依賴、未登入／發出 AI 測試請求、未部署、未 commit/push。主工作目錄的本輪研究文件已移到本 worktree。

## 下一位 agent 的第一個任務

**承接設計工作的 ownership，不是監督型子任務。** 原 agent 交接後停止，不用向它回報或建立 orchestration task/DAG。

1. 讀本 repo 的 AGENTS.md、相關 rules 與兩份交接／研究筆記；依專案規則確認環境及 ownership。保持所有改版工作在 lamprey。
2. 用中文向使用者整理跨平台首版範圍，提出推薦架構與實作階段；先完成設計／分階段計畫，關鍵尚未決定的取捨請人確認，不把前任建議寫成人已同意。
3. 補查 Orca keep-going／quota-recovery／handoff 實作，以及 OpenAI 官方 app-server、登入、rate-limit、續接文件。研究筆記目前**沒有**查完 keep-going 與 handoff，不能聲稱照搬即可。明確區分 quota exhaustion、短暫限流、auth 失效、網路錯誤與 context overflow。
4. 規劃 Windows 原生與 macOS 的 Codex 技術 spike，先測試登入、文字／圖片、串流工具事件、permission、停止、重啟續接、model/effort；不要把 macOS 上的測試稱為 Windows 已驗證，也不要擅自把 Windows 支援退化成「請使用者安裝 WSL」。有費用、代表身份或真實登入操作先取得同意。
5. 設計經使用者確認後，才依適用 skills 制定可測試的實作計畫並進入開發。不要一次性重写整個引擎。

## keep going 的設計約束（待形成正式規格）

- 每個子步驟平常就持久化成果／執行證據，不依赖額度已耗盡後才呼叫模型產生交接摘要。
- 暫停狀態綁定 trip、conversation、run、provider session、帳號與內容版本。
- 恢復時間只採服務可信回報；未知就顯示未知。有限頻率／退避／重試上限，允許使用者取消自動續作。
- 「自動繼續」不自動切帳號、不購買額度、不改用計費 API、不規避提供者限額。
- 恢復前檢查既有程序／任務與資料，採單一寫入者；不能盲目重發結果不明的工作。
- 草案、preview、發佈、費用與其他身份動作的人類確認閘門仍然有效；自動續作不是無限授權。
- 發佈或備份結果不明時先查核副作用，不直接重跑。
- App 關閉、OS 睡眠、離線、重新開啟後的語義需要明確：前任只建議首版 App 開著時等候，下次開啟再核對；**尚未決定**是否做常駐背景服務或自動喚醒。
- handoff 區分「同 provider 原生 session 續接」與「跨 provider 用成果及摘要交接」；不要承諾 session 格式或隱藏上下文可以無損互通。

## 不可省略的產品／安全約束

- GUI 選中旅程、cwd、prompt 約束、Git worktree，都不等於檔案系統安全隔離。跨旅程與引擎寫入限制要有可測試的執行層保護；任意 shell 能繞過的方案不能說安全。
- 旅程與對話不同：同一旅程可有多次對話，切側邊欄不能改變既有任務的對象。
- 現有行程內容交接仍用 `trips/<slug>/docs/status.md`；系統任務與確認證據另有職責，不讓模型自行改狀態冒充人同意。
- 預覽／網站內容與具有系統權限的桌面 UI 隔離；生成 HTML 不拿到 Node／IPC／登入憑證。
- GitHub／Cloudflare 憑證不給任意 agent shell；發佈由可信控制層核對目標與人已確認的內容版本。
- 私人參考資料、訂房碼、過敏等不進公開網站；public template 只放假資料／_example。
- 既有 CLI 路徑與引擎更新邊界要保留。修改 `.ai/` 共用文件後須同步產物。
- 不因圖形化就假定能做可靠旅遊研究；搜尋／瀏覽工具與來源查核要明確設計。
- 安裝程式、簽章／公證、乾淨機安裝、平台差異、更新相容性都在跨平台首版規劃內。
- 不自行 push、開 PR、合併 main、操作真實旅程／部署或購買服務；依 repo 規則與使用者授權處理。

## 最新進度：真實工作流程

使用者已同意 monorepo 與真實 AI 修改／預覽流程。已落實 workspaces、共用引擎、安全讀取、專案恢復、真實預覽與確認保存接線。最新證據、限制及待辦以 [真實工作流程計畫](2026-09-22-desktop-real-workflow.md) 的交接四欄為準。目前 root／engine／desktop 合計 632 項測試與原生假模型保存流程通過。正在等使用者於 App 連接 ChatGPT，再驗真實模型；Windows 實機由使用者安排後續，未聲稱已通過。

## 最新 UI 與品牌更新

2026-09-22 使用者提供正式 SVG，並要求 Codex 式可收合 sidebar／中央聊天／可切換右側 preview、Orca 式獨立設定、新旅程 modal、右側 user bubble。已依此實作，見 [工作台 UI 計畫](2026-09-22-desktop-workbench-ui.md) 與 `desktop/prototype/DESIGN.md`。

- 目前階段：三欄工作台與品牌已整合；原 SVG 位元保留，亮／暗 PNG、ICO、ICNS 與 web manifest 已產生。根測試 488 通過，startup 與更新後的 macOS 桌面 smoke 通過；瀏覽器 favicon／manifest／adaptive SVG 已實測。
- 等待確認：使用者可試用更新介面；另外詢問 monorepo，已建議 npm workspaces，尚未實施目錄遷移。
- 阻礙：真實 AI／Windows 原生／OS 執行隔離仍未完成；Windows shell 與已安裝 PWA 圖示快取未實測。桌面資料仍在記憶體，不承諾關閉後恢復。
- 下一步：依使用者回饋及 monorepo 方向決定下一階段，再接安全 AI 修改與實際引擎預覽。未登入／模型請求／部署／commit/push。

## 交接四欄

同日後續：已修正使用者回報的「App 程序存在但沒有視窗」啟動問題，package main 改為 `desktop/prototype/boot.cjs`。新增真實入口 startup smoke，修正前失敗、修正後通過；已以 OS 視窗觀察及截圖確認實際畫面。詳見接手計畫的啟動問題修正段落。

- 目前階段：既有專案接手列為首版必要功能；已完成本機唯讀檢查與 Electron 操作原型。7 個匯入測試、整套 484 項回歸及 macOS arm64 原型 smoke 通過。真實專案只預留唯讀入口，修改／預覽目前用記憶體假資料；未登入、請求模型、部署、commit/push。
- 等待確認：可試用原型並提供既有專案的本機位置（已詢問，尚未收到）；不把同意最小原型延伸成已批准所有退出語義／handoff／平台下限。分支仍為 `wangch15/desktop-gui-redesign-handoff`。
- 阻礙：Windows 原生、Codex 真實執行與 OS 隔離仍未驗；GitHub-only 下載未實作。先前服務條款 HTTP 403 與 quota／帳號證據缺口仍在，不能據此宣稱完整產品可交付。
- 下一步：取得既有專案位置後唯讀檢查相容性，再推進 S1/S3/S4，讓選定旅程可安全修改與實際建置。沿用 lamprey，實際登入、安裝提權、部署、對外 push/PR 與付費仍依授權處理。詳見最新接手計畫的證據與剩餘工作。
