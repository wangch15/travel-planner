# 桌面 GUI 補查：Codex、額度恢復與 Orca handoff

查核日期：2026-09-22。**文件／原始碼研究，不是登入、端到端或 Windows 驗證。**

最新需求：首版 Windows 原生與 macOS、少量熟識的非技術朋友、ChatGPT/Codex 優先；Pi Web 僅供 UI 參考。額度不足時等待同帳號自然恢復，不兌換 reset、不切帳號、不買額度、不切 API。這取代早期研究的 Mac-first。

## 1. 證據範圍

- Orca：唯讀檢視交接的固定 commit `5769eb6724d3b094893dccdf849dc47c3718cf72`（1.4.197）。下列 [O*] 都固定在此版本。沒有執行研究副本或其測試。
- 本機正在運行的 Orca 回報 1.4.206；只查 `status`、目前 worktree 及內建 CLI guide。**不可把 1.4.197 的源碼結論宣稱為 1.4.206 全功能驗證。**
- OpenAI：讀官方 app-server、auth、pricing、sandboxing、Windows、config 文件 [A1–A6]；網站是滾動文件。
- 本機 `codex-cli 0.155.1`：只執行版本／help，以及在臨時空 `CODEX_HOME` 產生 JSON Schema，沒有啟動對話、登入、讀取真實 auth cache 或發出模型請求。[A7]
- 產出的 `GetAccountRateLimitsResponse.json` 與官方 `rust-v0.155.1` 同檔 SHA-256 相同：`76bc91758269a89f57cd16c618b91c1fba76aca3e9d2b6186205e6f107d6b28c`。[A7a]
- 本機 Git 與 Orca 都確認目前是 lamprey checkout、HEAD `ae014d476c67bc7abb5db5da681329b419ed23c7`，實際分支名為 `wangch15/desktop-gui-redesign-handoff`，不同於交接的 `wangch15/lamprey`；本輪沒有切換、建立或改名分支。

## 2. Orca 哪些可借鏡，哪些不能說已有

| 主題 | 源碼／文件確認 | 本產品的採用判斷 |
|---|---|---|
| 額度查詢 | Codex fetcher 優先 app-server RPC，另含 backend 補值、PTY fallback、account home lock、逾時與 auth error 分類。[O1–O2] | 先用官方 RPC；不搬讀 token 打私有 backend、PTY 抓 `/status` 等退路。查不到即未知。 |
| 額度 polling | `service-polling.ts` 說明用途是 in-app UI；隱藏、最小化或未聚焦時不背景 poll；失敗退避，遵守 Retry-After。[O3] | 額度條不是工作排程器；我們等待中的任務需獨立排程，不能綁畫面 focus。 |
| reset credit | fetcher 有 `consumeCodexRateLimitResetCredit`；官方也有兌換 endpoint。[O1][A1] | 明確排除。這不是等待自然恢復；GUI／控制層都不提供自動呼叫。 |
| keep-going | Codex goal 事件會將 `usageLimited`、`budgetLimited` 顯示成停止原因。[O4] | goal 狀態呈現不證明 quota 恢復後會重啟工作。 |
| 送出不明 | adapter 區分 accepted、admitted、rejected、unknown；unknown 註解要求不可代人重送。[O5] | journal 記錄送出階段、provider 身份與核對結果，不靠「一段時間沒回覆」推斷失败。 |
| 同 session 換 UI | native → TUI handoff 先準備、停舊 owner、證明退出、推進 fence，再保留／證明新 owner；未證明停止就拒絕。[O6] | 借 ownership 與 fencing，不把它誤認為 Codex → Claude 的 session 格式轉換。 |
| 重啟中的 handoff | restart adjudication 可 readopt、settlement-pending、free、manual-recovery；根據 owner 證據而非過期時間搶接。[O7] | 舊程序不明時先停，不啟第二個寫入者。 |
| 完整工作交接 | CLI guide 的 full handoff 是交接 brief 後原 agent 停止，不建立監督 task/DAG；`accepted` 不等於 turn 已開始。[O8] | 首版可做明確「交接至新對話」，顯示已準備／已投遞／已開始，不混為工作完成。 |
| 關 App | session-restore 文件說 daemon 可讓 PTY agent 跨 App quit 繼續；主機重啟後程序不存活。[O9] | 這是另外一層 daemon 成本，不是 Electron 自動附送；首版建議不搬。 |

**查核結論：**在該固定版的 rate-limit、Codex adapter／goal、session recovery、handoff 及 CLI 文件中，尚未找到符合本需求的「同帳號 quota 恢復 → 核對內容與副作用 → 自動安全續作」完整閉環。這是有範圍的未找到，不是宣稱所有 Orca 版本都沒有。需要我們自行設計與驗證。

## 3. OpenAI 官方整合面

### 3.1 app-server 是合理候選，但要鎖版本

官方明確將 app-server 定位為嵌入自有產品的 rich-client 介面，提供 auth、history、approvals、streamed events；stdio 使用雙向 JSON-RPC／JSONL，先 `initialize` 再 `initialized`。[A1]

文件同時有 app-server command／WebSocket 的 experimental 警語；本機 help 也標 experimental。選 **本機 stdio**，不開網路 listener，不能承諾長期穩定 ABI 或正式支援保證。固定 CLI 版本、產生該版本 schema、驗證 capability 與升級相容性；不要照 main 的新文件對舊 binary 送猜測欄位。[A1][A7]

最低整合能力：[A1]

- `thread/start`、`thread/read`、`thread/resume`；`turn/start`、`turn/interrupt`。
- `item/*` 與 `turn/completed`：工具、檔案、文字串流與最終 turn 狀態分開。
- `model/list` 回報模型、effort 與輸入能力；圖片使用相容的 image/localImage input，不硬寫模型名稱或 effort。
- command/file/permissions approval 與 requestUserInput 是 server 回問。Provider 的「允許工具」與產品的「人已確認草案／發佈」是兩件事；後者不可交給模型自動回答。
- `dynamicTools` 是 experimental；MCP 是另一條受控工具路徑。**加自訂工具不等於已關閉所有內建 shell／其他工具**，須另做拒絕測試。
- `thread/resume` 是恢復對話，之後由新 `turn/start` 延續工作，不是復活已退出的任意 shell 程序。
- 0.155.1 有 `clientUserMessageId`，但本輪讀到的 schema 沒有一般 turn exactly-once／去重承諾。JSON-RPC request id 也不能當業務冪等鍵。[A7c]

### 3.2 登入、帳號與計費

ChatGPT managed auth 由 Codex 處理 OAuth／token refresh；使用 `account/login/start` 的 chatgpt 模式，瀏覽器由人完成，等完成通知再 `account/read` 驗證。device-code 可作環境不支援 callback 時的退路，不自建 OAuth、不搬 external tokens。[A1–A2]

官方区分 ChatGPT 訂閱登入與 API key usage-based billing；首版只接受前者。Codex auth 可用 OS keyring，`keyring` 不可用時會失敗，而 `auto` 可能回落成明文檔案。建議先驗證獨立 App-managed CODEX_HOME + keyring；失敗不得悄悄降級。[A2]

**同帳號核對仍是 spike：**`account/read` 的一般 ChatGPT 結果包含 nullable email／plan；不是可靠的唯一身份。0.155.1 額度結果增加 nullable `accountId`，但不能只凭「同路徑」或「同 email」推論同一登入者與 workspace。須釐清服務 accountId 的 scope、登入世代與 workspace 切換；可靠身份證據不足時停用無人 auto-resume。[A1][A7a]

額度與 credits 可共存，計費規則因方案而異；不買 credits 不等於一定不會耗用帳號原有的額外 credits。不能保證「任何 ChatGPT 帳號都是固定月費內免費用」。首版續作只等 ordinary included usage 的可信許可；無法確認則暫停，不用真實 turn 試探可不可跑。[A3][A7a]

### 3.3 額度恢復最重要的新證據

官方文件有 `account/rateLimits/read`／`account/rateLimits/updated`；窗口包含 usedPercent、nullable resetsAt，多 bucket 必須正確歸因。`resetsAt` 是 Unix 秒，不是毫秒；到點只能觸發**重新查詢**，不是許可執行。[A1][A7a]

尤其本機 0.155.1 與同版官方 schema 的 `ordinaryUsageAllowed` 說明為：

> Backend permission for ordinary included usage, validated against the active account. Null means unavailable; clients must not infer recovery from percentages or reset times.

所以首版設計應是：**新鮮且對帳號有效的 `ordinaryUsageAllowed === true` 是恢復的必要條件，不是充分條件**；還要通過本機身份、單寫入者、內容版本、人類閘門與副作用核對。`null` 不能拿百分比補猜。這個欄位未完整出現在本輪讀到的網站範例裡，正好說明要對齊版本。[A7a]

### 3.4 錯誤分類不能只看字串「limit」

0.155.1 wire schema 使用 camelCase，不能直接拿網頁說明的 PascalCase 名稱比對；`error` notification 有 `willRetry`。[A7b]

| 證據／狀況 | 應採策略（本產品提案） |
|---|---|
| `usageLimitExceeded`，且相關 turn 已終止 | 保存既有進度，進入額度等待；同帳號可信許可回來後先 reconciliation。 |
| `rateLimitExceeded`／`serverOverloaded`／HTTP 429 | 短暫限流；尊重提供者重試與 Retry-After，有上限退避；不自動歸為每日額度耗尽。 |
| `unauthorized`／已確認登入失效 | 停止，等本人重新登入；不可無限 retry 或換帳號。 |
| stream disconnect／網路／逾時 | 先查 turn 是否仍執行；結果不明就 unknown，不重送。 |
| `contextWindowExceeded` | 上下文問題；核對後壓縮或交接新對話，等待 quota 不能解決。 |
| `sessionBudgetExceeded`／goal budgetLimited | 工作預算限制；不當 quota，不自行提高預算。 |
| `willRetry: true` 或 turn 尚在跑 | Provider 仍持有處理權；host 不另送繼續。 |
| 未知錯誤／資料缺欄位 | 顯示待核對，保留證據，預設不自動送出。 |

官方 pricing 另說用量碰限時，正在進行的 turn 可能仍可繼續（有 fair-use 限制）。因此看到 100% 不該立刻 kill 或產生第二個 turn；以執行事件為準。[A3]

### 3.5 Windows 與 macOS

官方目前文件描述 Windows 原生 CLI／sandbox；不必以 WSL 當首版必裝條件。Windows elevated 模式涉及低權限使用者、ACL、防火牆與管理員同意；unelevated 網路隔離較弱。Windows 11 是官方建議基線，Windows 10 為 best effort。[A4]

macOS 使用 Seatbelt；sandbox 適用於衍生指令而非僅內建改檔工具。**workspace-write 的名稱不代表讀取隔離**，也不代表 MCP server／我們自己的 build 程序已受保護。config 文件另有檔案權限設定，但具體版本／所有工具覆蓋仍須雙平台實測。[A5–A6]

本輪沒有 Windows 機器的執行證據，也沒有 Codex 登入／串流 smoke test。文件支援不能冒充本產品支援已驗。

## 4. 現有引擎會影響設計的事實

- `scripts/lib/paths.js` 的 ROOT 綁定程式所在目錄，不是任意 cwd；不能只 spawn 改 cwd 就假定操作 App 資料 repo。
- `scripts/lib/load-trip.js` 用 Node `require()` 執行 `data.js`／`details.js` 等。惡意資料能在讀入時執行 JS；**不能在持憑證的 Electron main／部署程序載入**。
- `scripts/ship.js` 會再 build，`deployBuiltTrip` 有目標核對，但現有 CLI 的 preview 人類確認是 agent 規則，不是 GUI 可直接沿用的版本確認 token。
- GUI 若批准了 preview A、之後 `ship` 重建 B，不能稱發佈了同一版。需可信控制層持有不可變產物與摘要，保留目標查核，再部署該產物。
- 這些是 GUI 整合的新增安全工作，不代表本輪已修改或修好 CLI。[L1–L4]

## 5. 授權與剩餘風險

- Orca MIT 借用實質程式需保留 notice；Codex 根授權是 Apache-2.0。散佈 binary／依賴還要盤點 NOTICE、第三方資產與安裝器條款。[O10][A8]
- 官方 app-server 說明支持自有產品深度整合的方向，但不是服務條款的完整合規保證。Terms of Use 本輪直接 HTTP 讀取被 403 阻擋，**未完成條款查核**；不推論已獲 OpenAI 商業／訂閱／無人排程授權。封測散佈前重新查核，必要時請官方釐清。
- 未查證有適合本需求的一般「禁止額外 credits 消費」每 turn 硬上限；ordinaryUsageAllowed 不是零消費交易鎖。須驗證 account policy／時間競爭下的行為，不向朋友保證不可能產生費用。
- 研究只取得介面與源碼證據；實際登入、研究來源品質、cancel 子程序、Windows native sandbox、乾淨機安裝、簽章與公證全都待驗。

## 來源

以下均於 2026-09-22 查核；[O*] 固定 commit、[A7] 固定 release schema，其餘官網為滾動文件。

- [A1 App-server](https://developers.openai.com/codex/app-server)
- [A2 Authentication](https://developers.openai.com/codex/auth)
- [A3 Pricing／usage limits](https://developers.openai.com/codex/pricing)
- [A4 Native Windows sandbox](https://developers.openai.com/codex/windows)
- [A5 Sandboxing](https://developers.openai.com/codex/sandboxing)
- [A6 Configuration reference](https://developers.openai.com/codex/config-reference)
- [A7 同版官方 JSON Schema 目錄](https://github.com/openai/codex/tree/rust-v0.155.1/codex-rs/app-server-protocol/schema/json/v2)，本機以 `codex app-server generate-json-schema --out <temp-dir>` 產生對照。
- [A7a GetAccountRateLimitsResponse](https://github.com/openai/codex/blob/rust-v0.155.1/codex-rs/app-server-protocol/schema/json/v2/GetAccountRateLimitsResponse.json)
- [A7b ErrorNotification](https://github.com/openai/codex/blob/rust-v0.155.1/codex-rs/app-server-protocol/schema/json/v2/ErrorNotification.json)
- [A7c TurnStartParams](https://github.com/openai/codex/blob/rust-v0.155.1/codex-rs/app-server-protocol/schema/json/v2/TurnStartParams.json)
- [A8 Codex LICENSE](https://github.com/openai/codex/blob/b781733f958ed55282c5ed343e3a6fef7139498c/LICENSE)
- [O1 Codex rate-limit fetcher](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/rate-limits/codex-fetcher.ts)
- [O2 RPC probe](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/rate-limits/codex-rpc-rate-limit-probe.ts)
- [O3 Polling lifecycle](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/rate-limits/service/service-polling.ts)
- [O4 Goal status](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/codex/codex-goal-journal-rows.ts)
- [O5 Dispatch contract](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/native-chat/agent-session-wire/structured-agent-session-adapter.ts)
- [O6 Native → TUI ownership transfer](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/native-chat/agent-session-wire/structured-agent-session-handoff-forward.ts)
- [O7 Restart adjudication](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/runtime/agent-session-restart-handoff-adjudication.ts)
- [O8 Full handoff guide](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/skill-guides/orca-cli.md)
- [O9 Session restore](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/docs/site/content/docs/model/session-restore.mdx)
- [O10 Orca LICENSE](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/LICENSE)
- [L1 Paths](../../scripts/lib/paths.js)、[L2 Trip loader](../../scripts/lib/load-trip.js)、[L3 Ship](../../scripts/ship.js)、[L4 Deployment state](../../scripts/lib/deployment-state.js)（本 repo 上述 HEAD）。
