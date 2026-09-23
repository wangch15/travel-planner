# Travel-planner 桌面 GUI：跨平台首版設計提案與分階段計畫

日期：2026-09-22。狀態：**使用者已同意先做最小原型與技術驗證，並要求首版接手既有專案。**本文其餘細節仍是提案，不能把這次同意延伸成已核准所有產品取捨。

最新執行範圍見 [既有專案接手與原型計畫](2026-09-22-desktop-project-import.md)。先做本機專案唯讀檢查與操作原型，再接 AI 寫入及實際建置；不需要使用者重建既有旅程。

需求依據：[完整交接](2026-09-22-desktop-gui-handoff.md)。技術證據與來源：[Codex／Orca 補查](../reviews/2026-09-22-codex-quota-handoff.md)。以下「建議」「首版」除明列已確認者外，都是待批准的產品取捨。

## 1. 已確認，不再重問

- 為熟識的幾位非技術朋友製作本機桌面 App；**首版 Windows 原生與 macOS 都要有**。
- ChatGPT／Codex 優先。Pi Web 僅參考 UI，不採 Pi runtime；Claude 等留待後續。
- 旅程列表、建立旅程、對話與圖片／參考資料、預覽／發佈、工具與帳號設定是目標流程。
- 額度耗盡後等待**同一帳號自然恢復**，自動安全續作；不是切帳號、兌換 reset、買 credits 或切計費 API。
- 参考 Orca handoff；具體深度尚未決定。保留既有 CLI，不能以 cwd／prompt／worktree 冒充旅程隔離。
- 草案、必要 preview、身份與費用閘門不因 GUI 或自動續作而失效；不明結果不能盲重送。
- 沿用目前 lamprey worktree，不改 main、不另建 worktree。Git／Orca 現在都回報分支 `wangch15/desktop-gui-redesign-handoff`；與原交接名稱不同，未自行切換或改名。
- 使用者已同意「技術驗證 → 最小介面 → 完整案例」的下一步；**匯入／連接既有 travel-planner 專案是首版必要功能**，不能只有從零建立。

## 2. 三種路線與建議

| 路線 | 優點 | 代價／判斷 |
|---|---|---|
| **A. Electron + React + TypeScript，Codex app-server，本機旅程控制層** | 沿用 Node 引擎；結構化聊天、權限與任務恢復可明確建模；同一套桌面程式跨兩 OS | 安裝包較大，必須自己做好 IPC、子程序與沙箱；**推薦** |
| B. 輕量桌面殼／Tauri + Node sidecar + Codex | 殼可更小，系統整合可由 Rust 承擔 | Node 仍需要；多一套語言、sidecar／原生權限／打包整合成本，首批小量使用者不優先 |
| C. 直接 fork Orca 或把 CLI 終端機包成主介面 | 快速展示聊天或終端機；可借現成 IDE 能力 | IDE、daemon、多帳號、remote 等維護量過大；仍未解我們的旅程與發佈安全；不推薦作產品基底 |

A 不代表先畫完整 UI 再補安全。**先證明雙平台 Codex 與旅程執行限制，再逐段做完整流程。**不為第二家 provider 先造通用插件平台；只保留 Codex adapter 與測試用 fake adapter 的小型 seam。

## 3. 首版建議邊界

### 做

- App 管理一份使用者自己的私有內容 repo，多趟旅程、多個對話；一次一個有寫入的 AI 工作。
- 首次進入並列「連接既有專案」與「建立新專案」。既有本機目錄優先原地連接；僅有 GitHub 複本時下載到獨立私人目錄，不併入模板、不初始化或覆蓋既有 repo。檢查版本、行程、私人備份歸屬與部署紀錄後再開啟對應能力。
- ChatGPT 一個連接帳號；顯示實際模型／effort 能力，不固定模型清單。App 不收密碼。
- 基本資料表單＋對話補齊，支援圖片、網址、常見文字參考資料；附件預設私人。
- 草案確認 → 查核／資料整理 → 檢查 → 本機預覽 → 人點發佈 → 私有備份。
- 額度等待、取消等待、重新開啟後核對再接續、清楚的「需你處理」提示。
- 同 Codex session 續接；人點選後把成果與交接摘要交給**同一旅程的新 Codex 對話**。
- 任務導向設定：缺什麼工具、要人授權什麼、如何取消與重新偵測；進階診斷可展開，不先丟 shell 給朋友。

### 先不做

- 跨 provider 無縫 session 轉換、多帳號切換、parallel agents／DAG、完整 IDE、遠端 daemon、手機控制、SaaS。
- 關閉 App 後繼續跑的常駐服務、自動開機啟動、喚醒睡眠中的電腦。
- 自動購買／兌換額度、外部 token 匯入、任意 plugin/MCP 安裝、任意 shell 的「全部允許」。
- 首版 GUI 建议先支援 Cloudflare Workers 發佈；既有 Pages CLI 不刪除。Pages 不具現有 Worker 的遠端防撞保障，未补同等安全前不包成等價按鈕。
- PDF/OCR 全格式理解與自動操作已登入網站不先承諾；無法讀的附件要明確說，請人提供可讀版本。

## 4. 產品操作設計（非視覺定稿）

這是工作工具，不是 IDE 換皮。首要問題永遠是「正在處理哪趟、做到哪、下一步需要我做什麼」。

- 左側按旅程標題／日期列出，額度等待、等確認、失敗用文字＋圖示，不單靠顏色。對話屬於旅程，不把一趟旅程等同一個 session。
- 主區域為對話，工具事件收合成有意義的進度；顯示草案、資料來源、變更摘要及確認卡。側邊切到 B 不會把 A 的執行目標改掉。
- 頂部固定當前旅程與任務狀態；預覽／發佈顯示所用內容版本。發佈不可只是一個永遠可按的火箭圖示。
- 建立旅程只問名稱／目的地、日期或未定、參考資料；其餘對話補齊。匯入前清楚說明哪些資料會送給 AI，私人資訊不會因匯入而自動變公開。
- 「等額度恢復」卡顯示來源最後查詢時間、可信的下次查詢時間或「恢復時間未知」、同帳號自動接續的開關與取消按鈕；不畫虛假的工作進度百分比。
- 設定按「AI」「私人備份」「公開網站」「診斷」呈現，不用 repo、OAuth、PTY 當主要標籤。
- 發佈前顯示旅程、真實帳號／目標、已看過的預覽版本與公開提醒：有網址就能看，noindex 不是密碼。
- 鍵盤可到達所有操作、確認對話可取消且焦點回原處、支援中文輸入法；串流不搶捲動／焦點，狀態朗讀節流。兩 OS 原生視窗快捷鍵與路徑選擇分別驗。

視覺風格、尺寸與高保真畫面等範圍確認後再設計；本輪不建立假稱已確認的 DESIGN.md／PRODUCT.md。

## 5. 架構與資料流

```text
桌面 UI（無 Node，有限 preload／IPC）
       │ 型別化意圖 + 不可變目標 ID，不接受任意指令／路徑
       ▼
本機可信控制層
 ├─ Trip Workspace：trip/repo 身份、工作副本、版本與單寫入者
 ├─ Run Controller：journal、閘門、等待／核對、handoff
 ├─ Codex Adapter：受控設定、stdio、官方事件／schema
 ├─ Content Pipeline：受限資料匯入／驗證／建置，輸出不可變產物
 └─ Release/Backup Broker：人類確認、目標核對、私有備份與憑證
       │
       ├─ Codex + 受控工具／OS 執行限制：只看本趟授權內容
       ├─ 建置執行區：無帳號憑證，不取得主程序權限
       └─ 預覽：獨立 sandbox renderer，無 preload／IPC／憑證
```

### 5.1 三種持久資料，不互相冒充

1. **行程事實與私人筆記**：仍以 `trips/<slug>/` 為準；內容交接仍用既有 `docs/status.md`，不另造第二份內容進度檔。
2. **系統執行證據**：App user-data 的交易式 journal（建議 SQLite，套件待驗）；保存 send attempt、provider thread/turn、operation、lease/fence、確認證據與排程。不進公開模板、不內嵌網站，也不讓 agent shell 讀寫。
3. **登入資訊**：Codex 官方管理的獨立 credential store；GitHub／Cloudflare 由可信 broker 使用。原始 token 不進 journal、行程、renderer、附件或 agent environment。

內容 repo 的備份不等於跨電腦自動搬移執行權；換機沒有原 journal／確認證據，就當需重新核對，不從 status.md 的勾選重建「人已同意」。

### 5.2 不可變身份

每個工作绑定 `repoId + tripId + conversationId + runId + providerThreadId + accountBinding + contentRevision + policyVersion`。tripId 為穩定識別，slug 是可驗證的路徑映射，不讓模型直接提供 repo-root 路徑。

每個寫入／發佈 operation 都另有 `operationId`、送出前基準、預期副作用、receipt 與結果狀態。controller 的 runtime fence 讓舊程序／過期 UI 回覆無法提交到新的 owner。

### 5.3 旅程隔離是首版 Go/No-Go

建議使用**單趟 staging 工作副本＋實際 OS／工具限制＋受控匯入**，而非把整份 repo 當 agent cwd。

- 工作副本只含本趟所需檔案與唯讀引擎資源；不帶 repo `.git`、兄弟旅程、全量 profile、部署／Git credential、任意 `.codex` 設定或 hooks。共享偏好由 host 挑必要欄位提供。
- 模型寫入先留 staging，再由 controller 依原 contentRevision、允許路徑與 schema 匯入內容 repo。不可寫引擎、確認資料庫、credential store 或他趟資料。
- **副本本身不是隔離**。Codex shell、內建檔案工具、MCP、自訂工具、所有子程序，都必須實際受限。讀取限制與寫入限制分別測，不能只測 diff。
- 禁止一般 agent 的提權與擴大根目錄，拒絕未允許的網路／tool；不繼承使用者全域插件與 shell credentials。內容中的提示不可以改此政策。
- 主程序與 agent executor 的讀寫／網路／憑證能力分離。優先驗官方 sandbox 是否足够；不足就採額外受限 executor，不能把 `workspace-write` 改名後宣稱安全。
- Windows 路徑 traversal、磁碟代號、UNC、junction／reparse point、大小寫與 symlink；macOS symlink／hardlink／Unicode 路徑；先拒絕不需要的 link，再用安全開檔與提交時核對抵擋 TOCTOU。
- App 暫存、OS temp、剪貼簿、process env、localhost broker endpoints 都在攻擊測試內；憑證不在 environment 並不代表子程序不能去讀 OS keyring。
- broker 可接 `requestPreview` 等固定意圖，不可接 `exec(command)`。部署與備份能力不暴露给模型，即使 UI 上有人答「全部允許」也不能越界。

若任一 OS 無法執行這條邊界，**該雙平台首版還不能交付**；回來重新討論方案，不偷偷退回 Mac-only／WSL／full access。

### 5.4 舊引擎相容與 JavaScript 資料載入

現有 loader 用 `require()` 讀行程資料，這是本次最容易忽略的提權通道。首版 GUI 的 importer 優先以受限 literal-data parser 讀取既有 CommonJS 資料形狀，不執行任意函式、require、getter 或運算；不支援的舊寫法要清楚拒絕，不偷偷 fallback 到 main process 的 require。

是否既有 `_example` 與資料 schema 都能用此子集合表示，由 spike 驗證。需要執行舊引擎的建置時，放到無憑證、限制檔案與網路的獨立 executor，**一般 child_process 或 Node vm 不等於 OS sandbox**。

`extra.js` 與產出 HTML 仍視為不可信程式，只能在無權限預覽／網站執行。可信 broker 只取得驗證後的結構化 config、manifest 與靜態產物，不能在部署階段再次執行旅程 JS。

保留 CLI 名稱、參數、退出碼與現有資料格式。逐步抽出可注入根目錄的函式（舊 CLI 預設不變），不假定改 cwd 就能改 `paths.js` 的 ROOT。不在首輪重寫 data schema 或全部 scripts。

## 6. Keep-going：等額度，不是無限「繼續」

### 6.1 狀態模型

工作狀態：`queued → running → waiting_quota / waiting_user / needs_reconciliation / completed / failed / cancelled`。

quota 探測、auth、網路、context 和 operation 結果是分開的原因／子狀態，不用同一個 retry 布林表示。

- 每個子步驟平時就寫 journal、成果版本與下一步，內容進度更新原 status.md；不等 quota 耗盡才請模型寫摘要。
- 只有 provider 證明 turn 因額度終止，才將執行權交給等待排程器。100% 額度或 `willRetry: true` 都不代表應立即重啟。
- timer 到點先查官方 limits，**不送一個模型 prompt 測試額度**。同帳號／workspace 核對，以及新鮮 `ordinaryUsageAllowed === true` 是必要條件；未知就繼續等待／需人處理。
- 確認沒有既有 active turn、未停止的程序、未核對的 send／deploy／backup、過期確認、內容冲突，才對原 thread 送一個基於 checkpoint 的下一步 turn。
- 無一般 exactly-once 保證：追求單寫入者、持久 operation intent、冪等的本機寫入與可核對外部副作用；不可用 request id 自稱已解決重送。

### 6.2 排程策略（提案數值，需 spike 校準）

- 已有可信 reset 時間：等待該時間＋小幅 jitter，再查最新狀態；遇多個相關窗口不能只看最早一個。
- 無可信時間：顯示「未知」，以 1、2、5、15、30 分鐘退避，之後最多每 30 分鐘一次**狀態讀取**；有 Retry-After 就不早於它。這是查詢排程，不是假稱恢復時間。
- 連續 10 次技術性查詢失敗後暫停探測、通知人；有效「仍耗盡」不算傳輸失敗。額度反覆恢復／拒絕的自動續作嘗試另設上限（建議同一工作 24 小時最多 3 次），避免無限消耗。
- 同帳號各旅程共用探測、一次只讓排隊中的一個寫入工作續作；不為每個聊天建立各自 timer。
- OS 睡眠／離線：不發請求、不為離線補發累積的 timer；醒來／回網後只做一次核對。使用可信時間、紀錄 clock jump，不靠睡前 countdown 推斷恢復。
- 「停止」撤銷本工作自動續作意圖；過期 timer／通知／舊 fence 不得復活它。

### 6.3 關閉 App 的明確語義（建議）

- 最小化／不在前景但程序還在：仍可等待與安全續作，不依 renderer focus。
- 按關窗按鈕或 Quit：首版兩 OS 都視為退出；有工作時提示會暫停，先 interrupt／保存／核對子程序停止，不留無聲 daemon。
- 睡眠時不運行，也不自動喚醒。重開 App 後先 reconciliation；原 auto-resume 開關仍開、身份與版本等條件均沒變，才恢復等待／續作。
- App crash／強制結束可能留孤兒程序；必須證明已停止或可安全接管，不能因 lease 時間過了就創建第二 writer。
- UI 明說「App 開著且電腦醒著才會自動繼續；重新開啟會先核對進度」。

### 6.4 人類閘門與未知結果

| 情況 | 必須停在哪裡 |
|---|---|
| 未確認的 plan，或確認後內容變了 | `waiting_user`；不能深度研究下一階段。 |
| 需要 preview 的變更／首次發佈 | 等人看該版本並確認；resume/handoff 摘要不能代簽。 |
| 已看 preview A，又產出 B | A 的發佈許可失效，重新預覽 B。 |
| provider approval 舊 request 已結束 | 不重播舊 request id；重新核對當前問題。 |
| turn/start 寫入後掉線，不知是否接受 | 查 provider history／turn；查不清楚保留 unknown，不能另送「繼續」。 |
| 發佈超時／成功但本機沒存到網址 | 唯讀查遠端版本與 operation 證據；無法唯一對應就需人工核對，不重 deploy。 |
| push 超時 | 查已確認 remote/ref 的 commit；若已有預期 commit 則補結果，若不同則不覆蓋。 |
| 帳號／workspace 改變、需重新登入、版本／政策不相容 | 等人處理；不得自動換帳號、fallback API 或擴大權限。 |

## 7. Handoff 深度

**第一層（首版必要）：**同 provider 原生 session 續接。保存 thread id，讀 history 核對後 resume；不是從 UI transcript 猜 session。

**第二層（首版建議）：**人點「交接到新對話」。用已存的成果、原 status.md、來源、未決事項、內容版本及 operation 核對證據產生交接包；讓人看交接摘要後，同一旅程開新的 Codex 對話。

交接順序：凍結派工 → 停舊 writer 並證明 → 保存交接包 → 新 owner 取得 fence → 投遞一次 → 分別記錄 accepted／turn_started。失敗时保留舊對話可讀，但不讓兩方同時寫；送出不明先核對，不重新交兩次。交接包不能帶 token、無需的私人資料或讓新模型自行認定人已批准的文字。

**第三層（後續）：**Codex → Claude 等成果式交接。需新 provider 的正式整合／條款、資料分享同意、權限與能力測試；不承諾隱藏上下文、tool state、原生 session 無損互通。GUI ↔ 任意外部 TUI 的雙向接管也延後，因外部 CLI 可能繞過 controller 的單寫入與權限約束。

## 8. 發佈、備份與預覽

- GUI 首版建議每次發佈都由人按確認；這是 GUI 的保守流程提案，**不擅改既有 CLI 的 tp-ship 分層规则**。
- 確認綁 `tripId + sourceRevision + artifactDigest + targetType + accountId + deployName + policyVersion`，由可信 UI/controller 保存，模型不能改「approved」欄位取得許可。
- build 在受限環境完成，產物 freeze 後顯示 preview；部署同一份不可變產物，不在點確認後無聲重建另一版。
- broker 自己核對 config／manifest、來源文件与成功紀錄；不信任任意 path、wrangler config、symlink、worker code 或 agent 提供的 deploy name。部署憑證只在此層短時可用。
- 預覽用專用無 preload renderer／隔離 session、無 Node、禁止任意導航／popup／檔案讀取；IPC 驗 caller origin，不把生成網頁掛進 trusted App UI。地圖、圖片、連結按允許的網路政策工作；外部連結明確交系統瀏覽器。
- 首次設定私有 repo、登入、Cloudflare 授權由使用者操作；安裝或註冊支出另等同意。首次備份目的地／分支由人確認，以後每次按既有規則重查實際 push URL 私有可見度。
- 本機保存、內容驗證、網站已上線、異地備份成功是四種結果。部署成功但 backup 失敗只重試備份，不再 ship；重試前重新驗私有。
- Git 操作由 broker 選明確檔案，拒絕不受信任的 hooks／filters／credential helper；不能執行匯入 repo 任意設定，也不能為此繞過既有 pre-push 安全政策。具體 managed Git 環境在 spike 驗。

## 9. 技術 spikes 與 Go/No-Go（目前都未執行）

使用假行程、fake provider／fake cloud 優先；真的登入、模型請求、管理員安裝、部署、備份 push，各自另請同意。quota 以錄製／合成事件與 fake clock 測試，不故意耗盡使用者額度。

| Spike | 要證明什麼 | 通過門檻／失敗處置 |
|---|---|---|
| S1 雙平台 app-server | 鎖定版本在 Windows 原生與 macOS 的 initialize、登入取消／成功查核、文字／圖片、串流事件、模型／effort、approval、interrupt、重啟 read/resume | 每平台記 OS/arch、CLI、案例和原始去識別化證據；只有 Mac 過不算完成。若新版本缺欄位先適配或停用該能力，不猜。 |
| S2 身份與 quota | account/workspace binding、ordinaryUsageAllowed true/false/null、所有相關窗口、willRetry、known/unknown reset、退出／睡眠／offline | fake clock 證明沒有重複 turn、切帳號不續作、未知不猜；真實限額恢復樣本若沒有就標未驗，不能用模擬冒充。 |
| S3 執行隔離（阻擋發版） | 跨旅程讀寫、改引擎、碰 journal/keyring、shell 子程序、MCP、symlink/junction、越權網路、偽造 IPC、修改 config 提權 | 兩 OS 都在副作用前拒絕；確認不能只靠 prompt/diff/刪憑證 env。做不到就停下重新設計。 |
| S4 內容／build／發布隔離 | CommonJS literal-data 匯入、惡意 require/getter、extra.js、惡意 preview、artifact hash 與目標綁定 | main／broker 不執行不可信 JS；被修改的產物不能沿用許可；credential canary 永不出現在 agent、preview、產物。 |
| S5 崩潰與 handoff | send 各階段掉線、controller 重啟、舊 PID 重用、子程序未死、新 owner 啟動失敗 | 永遠至多一個可寫 owner；unknown 不重播；取消後不會由 timer 復活；副作用未定只能核對。 |
| S6 打包與乾淨機 | Windows/macOS 無 Node/Git/Codex/gh 的機器、含空白中文路徑、標準帳號、UAC 拒絕、簽章／公證、版本升降與離線 | 不要求朋友自行跑 CLI、不暗裝 WSL；安裝前說明權限。依賴取得／更新失敗可恢復，不能破壞現有內容 repo。 |
| S7 研究閉環 | 官方 web search／讀頁工具的真實可用性、来源 URL＋日期、網站無法讀取、prompt injection、附件隱私 | 來源可追溯；查不到標待確認，不以 model memory 填事實；外頁不能觸發內部操作或授權。 |

S1、S2、S3 的結果決定架構能否成立。**先安全與相容性，再視覺投入。**

## 10. 分階段實作路線（待批准後拆成 TDD 任務）

此處是分階段計畫，不先虛構通過 spikes 後才知道的套件版本、逐行實作或工期。

### P0：決策與證據

- 本輪完成研究／提案，先確認 A/B/C、App 退出語義及 handoff 深度。
- 補完服務條款與額度／額外 credits 的約束；確認可取得兩平台測試環境。
- 再寫經批准的 design 和每階段可執行、先測試後實作的計畫。未批准不加依賴／GUI code。

### P1：雙平台薄型 vertical spike

- 提議 `desktop/spikes/` 放可丟棄的 fake/real adapter harness；固定 schema、合成 events、假行程，不掛到現有 build。
- 先做 S1–S4 關鍵最小案例；native Windows 與 macOS 都跑。不登入的 schema／protocol 測試可先，真實 auth 同意後才跑。
- 出口：可行性證據表＋安全剩餘缺口。隔離或身份恢復不成立就回 P0，不往下鋪 UI。

### P2：本機 controller 與 CLI seam

- 提議 `desktop/main/` 的 trip-workspace、run-controller、codex-adapter、journal；`desktop/shared/` 定義小型 IPC／事件契約，renderer 不操作檔案。
- 逐步在 `scripts/lib/` 抽可傳 root／受控輸入的共用函式；保留 `scripts/*.js` wrappers，必要時每支分開改，不一次性搬檔。
- 先寫「兩趟隔離、過期版本提交、unknown dispatch、等待 plan」失敗測試，再實作。新增 `tests/desktop/`（確切配置依選定測試工具），沿用 root `npm test` 驗 CLI 回歸。
- 出口：假 provider 完成新建 → 草案 → 人確認 → 資料 → check，S3–S5 過；journal 與 status.md 角色分清。

### P3：可用的旅程工作台

- 提議 `desktop/renderer/`：旅程導航、建立表單、聊天／圖片、工具事件、等待／確認卡、預覽與必要設定。
- 先確認互動原型，再實作視覺；不改旅程網站 theme 作為桌面殼。
- 接 Codex 與研究工具，完成 S7；權限與人類閘門以 controller 狀態驅動，不由聊天文字猜。
- 出口：兩 OS 真實帳號（人同意後）能產生假行程與安全 preview；錯誤可恢復，沒有把未知說成完成。

### P4：安全續作、交接與發布／備份閉環

- 在已能安全執行的 controller 上加入 quota scheduler、reconciler、handoff，跑完整故障注入。
- release/backup broker 接不可變產物與既有 Worker 查核；真實測試用專用假資料目標，需人逐項同意。
- 出口：草案／預覽／發佈確認不會被等待或交接繞過；遠端結果不明不重送；status 保存與私有備份可核對。

### P5：雙平台封測交付

- CI 跑 Windows 原生與 macOS 矩陣、CLI 回歸、安裝器與 smoke；另做兩平台乾淨機人工驗收，不用 cross-build 成功代替。
- 建議驗收基線：Windows 11 x64；macOS 14+ arm64/x64。**這些 OS／架構下限尚待確認與依賴驗證**；Windows ARM、舊 OS 不默認承諾。
- Mac 簽章／公證、Windows 簽章／SmartScreen 行為、依賴授權、runtime binary hashes、更新／回退、資料 migration 備份與診斷脫敏一起驗。需要購買簽章／帳號先問，不代付。
- 首批採人工確認更新，不背景無聲升級 Codex／資料格式。App 更新與旅程引擎更新分離，有活動 writer 時不升級。
- 出口：兩 OS 的朋友在不開終端機情況下走完流程；不能因「只有幾個朋友」省掉資料與發佈安全。

### P6：需求成立後再扩充

Claude adapter、跨 provider handoff、常駐 daemon、更多附件格式與平台架構；每項重新做條款／權限／資料遷移評估，不當作首版順便附送。

## 11. 主要風險與驗證標準

| 風險 | 嚴重性 | 不可省的處理 |
|---|---|---|
| app-server/schema 漂移 | 高 | 固定版本＋schema fixtures＋相容性清單；未知欄位／能力 fail closed，升级前雙平台重驗。 |
| 跨旅程讀取／shell 逃逸／憑證讀取 | 阻擋發版 | OS/工具層拒絕，非 prompt；MCP、build、keyring 同測。 |
| 把 quota 百分比當許可／另耗 credits | 阻擋 auto-resume | ordinaryUsageAllowed、身份與帳號計費政策證據；無法證明不自動送模型请求。 |
| 原 JS loader 提權 | 阻擋 GUI 整合 | literal-data 匯入＋隔離建置；main／broker 不 require 行程 JS。 |
| 不明發佈或 push 重送 | 高 | operation journal＋遠端核對，未知停住；hash-bound preview／發佈。 |
| Windows 特性未驗或安裝需要管理员 | 阻擋雙平台交付 | 早期原生 Windows spike、拒絕 UAC 的正常失敗路徑，不暗退到 WSL。 |
| 來源不可靠／附件含秘密 | 高 | 源 URL＋查核日期、公開字段審查、最小提供給模型、私人附件不進 dist。 |
| 服務條款／散佈授權未完成 | 阻擋對外封測 | 補查官方文本與依賴 notices；開源授權不等於帳號服務使用許可。 |

## 12. 前一輪研究驗證紀錄（新原型見最新計畫）

- 本機 macOS 執行 `npm test`：477 tests passed，0 failed／skipped。這是既有 CLI／引擎測試，不是 GUI 或 Windows 驗證。
- 四份研究／計畫文件的相對連結、程式碼圍欄與空白檢查通過；`git diff --check` 通過。
- 本機產生的 ErrorNotification、GetAccountRateLimitsResponse、TurnStartParams schema 與官方 `rust-v0.155.1` 對應檔逐位元一致。
- 僅修改／新增文件；未加套件、未做 GUI、未 commit／push，未登入或發出模型請求、未部署。

## 13. 待確認與交接

本次建議的第一個決策：**採 A 路線，首版不做常駐 daemon；handoff 做到同 Codex 的新對話交接，跨 provider 延後。**這不降低已確認的 Windows＋macOS 或自然額度恢復要求，而是先縮小週邊維護面。

後續決策：最低 OS／CPU 架構與簽章資源、第一批檔案格式、GUI Worker-only 的範圍。這些未回答前不可偷偷寫成已核准。

- **目前階段：**本機唯讀專案接手與 Electron 假行程原型已實作；484 項回歸與 macOS 原型 smoke 通過，詳見最新接手計畫。未跑真實登入或 Windows spike。
- **等待確認：**最小原型與技術驗證已獲同意；退出語義、handoff、平台下限等尚未被這次同意逐項定案。既有專案接手已列為首版必要功能。
- **阻礙：**服務條款頁本輪 HTTP 403；安全、身份、額度與雙平台行為均待 spike，不把文件支援當測試通過。
- **下一步：**取得既有專案位置後檢查相容性；推進 Codex 與雙平台隔離及實際引擎建置，另記實測結果。實際登入／付費／部署／push／PR 另等明確同意。不自動切分支、不另建 worktree。
