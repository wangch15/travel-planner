# 旅程工作台：Orca 原始碼參考與早期可行性評估

> 本文保留第一輪研究。**Mac-first 已被最新「首版 Windows 原生＋macOS」需求取代**；下文 Mac 建議不是現行範圍。
> 新的查核見 [Codex／quota／handoff 補查](2026-09-22-codex-quota-handoff.md)，待審方案見 [跨平台首版提案](../plans/2026-09-22-desktop-gui-proposal.md)。

- 查核日期：2026-09-22。
- 第一輪需求（歷史）：Pi Web 只作為 Web UI 形式參考，不要求使用 Pi runtime；當時以 Mac 為起點，現已改為首版跨平台。OpenCode／Pi 可留待後續。
- 研究對象：`stablyai/orca`，commit `5769eb6724d3b094893dccdf849dc47c3718cf72`，該版本 package.json 為 `1.4.197`。[S1]
- 方法：唯讀檢視公開原始碼與文件；未安裝依賴、未啟動研究副本、未操作帳號登入或真實 AI 請求。
- 以下「建議」不是已確認的產品規格，也不代表已實作。

## 結論

建議建立旅程專用的本機 Mac App，參考 Orca 的 provider adapter、結構化聊天、引導設定與任務生命週期；不要直接 fork 整個 IDE，也不要把 Pi 當成必要依賴。

建議先驗證 Codex 的完整使用流程，再接 Claude Code；實際優先順序仍取決於首批使用者的帳號。第一版每個 provider 一個帳號即可，多帳號熱切換、SSH、手機 companion、平行 agent 與完整 IDE 不在建議範圍。

## 原始碼中確認的事實

### 1. 桌面技術棧與終端機是可借鏡的，不是非得從零做

Orca 使用 Electron、React、TypeScript，依賴包含 `node-pty`、xterm 及 `electron-updater`。[S1]
Mac 打包設定包含 arm64／x64 的 DMG 與 ZIP，正式發佈路徑啟用 hardened runtime 與 notarization。[S2]

**對本專案的建議：** 優先評估 Electron + React + TypeScript，保留現有 Node 引擎。不因為 Mac first 就同時重寫成 Swift；也不承諾 Electron 自帶的 Node 可以直接滿足所有外部 CLI 的執行需求。需在沒有 Homebrew、Node 或 agent 的乾淨 Mac 上驗證安裝流程。

### 2. Orca 有兩種不同的聊天路線，不能混為一談

Orca 的 Chat UI 文件描述以 terminal 為來源的 transcript + composer，且標為 experimental；文件列出的 transcript 支援是 Claude、Codex、Grok、OMP。[S3]

同一個 commit 的程式另外有 structured native chat：啟動路由受 `experimentalStructuredNativeChat` 等條件控制。Runtime 實際建立 Codex 與 Claude adapter，再交給共同的 session host。[S4][S5]

因此，不能用「Orca 支援任何 CLI」推論「每家 CLI 都有完整的原生聊天、權限問答、模型切換與恢復支援」。上述文件描述的是 PTY 路徑，不是結構化路徑的完整規格。[S3][S4][S5]

**對本專案的建議：** 一般聊天優先使用結構化事件，不以擷取終端機畫面／模擬按鍵作為主要通訊方式。PTY 留給互動安裝、診斷與必要的登入退路。

### 3. Codex：由 App 啟動 app-server

`codex-app-server-connection.ts` 啟動 `codex app-server`、做 initialize handshake，處理請求、通知、伺服器回問與連線關閉。[S6]

Codex adapter 處理 dispatch、取消、回答問題、選項變更與 session 關閉。模型清單由 `model/list` 取得，解析 `supportedReasoningEfforts`；選模型／effort 時會檢查實際能力，不是只有 UI 下拉選單。[S7]

**對本專案的建議：** 這是 Codex-first 技術驗證的合理起點。固定並驗證相容 CLI 版本，測試文字／圖片、工具事件、permission、停止、重啟續接、模型與 effort。

### 4. Claude：SDK 管理本機 Claude Code 程序

Orca 的 `claude-stream-json-connection.ts` 載入 `@anthropic-ai/claude-agent-sdk`，透過 `query()` 建立對話，明確傳入所解析到的本機 `pathToClaudeCodeExecutable`，並接入工具授權及 user dialog callback。它不是把 Claude 模型直接當成另一個 Pi provider。[S8]

**重要限制：** 開源程式碼展示的是實作方式，不是 Anthropic 對我們產品的訂閱／OAuth／SDK 使用授權。是否可以用使用者既有訂閱、適用何種計費與散佈條件，實作前必須另查當時官方文件；不能由 Orca 的 MIT 授權推論第三方服務條款。

### 5. 登入是呼叫工具自身流程，並且有大量生命週期處理

Codex 登入程式使用 `codex login` 與指定的 `CODEX_HOME`，擷取登入網址、處理取消與逾時。[S9]

Claude 登入程式呼叫 `auth login --claudeai`，再呼叫 `auth status --json`，包含暫存設定目錄與 macOS Keychain 捕捉／恢復處理。[S10]

**對本專案的建議：** 第一版不複製多帳號憑證搬移或熱切換。優先透過官方登入流程連接一個帳號，App 不收密碼、不把 token 放入行程 repo、不讓 agent 自行讀取憑證。登入成功必須由實際狀態查核判定，不能由瀏覽器開啟或子程序啟動判定。

### 6. 引導設定中真的有內嵌終端機

`OnboardingInlineCommandTerminal.tsx` 為設定建立臨時 terminal tab，等待 PTY 就緒後插入指令，能接收指令完成事件；設定面板卸載時清理底層 tab，避免隱藏 shell 持續執行。程式是插入指令草稿，不應把它概括為所有命令都會自動執行。[S11]

**對本專案的建議：** 可借鏡這種局部、任務導向的終端機。一般使用者先看到「安裝所需工具」「開啟授權」「重試」，不是空白 shell。安裝或授權需由人同意；完成後重新偵測能力。

### 7. 對話身份獨立於畫面，送出未知不等於失敗

Orca 的 durable session record 分別記錄 workspace、provider、account home、provider handle、options 與 lease；它不以 terminal tab 當作全部身份。[S12]
共同 adapter 的 dispatch 結果區分 `accepted`、`admitted`、`rejected`、`unknown`；未知結果明確禁止替使用者盲目重送。[S13]

**對本專案的建議：** 保存旅程、對話、執行任務的獨立識別。切換側邊欄不能改變背景任務的旅程。遇到中斷先核對檔案／部署實況，不自動重跑發佈或其他有副作用的動作。

### 8. 授權允許借用，但不代表應整套 fork

Orca 的根目錄 LICENSE 為 MIT，要求在副本或實質部分保留著作權與授權聲明。[S14]
其 README 亦包含 SSH、手機、worktree、程式碼 review 等完整 IDE 能力。[S15]

**對本專案的建議：** 借鏡架構、必要時有選擇地重用代碼；重用時另檢查第三方依賴與素材授權，不照搬品牌、遙測或遠端服務。整套 fork 會把與旅程無關的產品維護責任一起帶進來。

## 建議的旅程專用架構（待討論）

```text
Mac App
├── 旅程列表、新增旅程、附件／網址收集
├── 對話、問題／確認卡、預覽、發佈結果
└── 設定：AI、GitHub、Cloudflare、工具診斷
        ↓ 受限的 IPC
本機旅程控制層
├── 綁定 tripId / conversationId / runId
├── 背景任務、真實狀態、取消與恢復
├── 內容版本確認、部署與私有備份檢查
├── Codex adapter；後續 Claude adapter
└── 現有 travel-planner 指令／函式
```

### 必須和 Orca 不同的地方

- 工作區以旅程為單位，不要求使用者理解 repo、branch、worktree。
- 不預設一趟旅程等於一個 Git worktree；同一份 repo 的 worktree 仍可能包含其他旅程，也不是檔案權限沙箱。
- 第一版先將有寫入的 AI 任務排隊；Git 操作、引擎更新與共享偏好操作另做 repo 級互斥。
- 只限制 cwd 或在 prompt 寫 tripId 不足以防止跨旅程改檔。需要 provider 支援的執行限制、受控工具或隔離工作副本；其他旅程／引擎的寫入必須在執行層拒絕，不能只在 diff 中事後發現。
- 發佈與 GitHub／Cloudflare 憑證由可信控制層管理；一般 agent 不應拿到可繞過確認的部署能力。
- 確認必須綁定內容版本及目標；預覽後又修改內容，不自動沿用舊確認。
- 對話紀錄不代替既有 `docs/status.md` 的內容交接；系統任務紀錄則負責執行與確認證據，不能由模型自行勾選冒充人同意。
- 預覽是生成內容，應和具有 IPC／系統能力的 App UI 隔離。
- 網頁搜尋與來源查核能力要額外驗證；能啟動 coding agent 不代表具備可靠的旅遊資料研究能力。

## 建議驗證順序

1. 技術 spike：Mac 上以 Codex 跑通登入、結構化對話、圖片、選模型／effort、permission、取消與續接；只使用假行程。
2. 安全 spike：嘗試修改另一趟行程、繞過發佈確認、切頁後回傳舊任務、重送不明結果，確認控制層拒絕或要求核對。
3. 旅程閉環：建立旅程 → 草案確認 → 研究 → 預覽 → 指定版本發佈 → 私有備份，所有失敗能用人話處理。
4. 乾淨 Mac 驗證：安裝、首次登入、缺失依賴、睡眠／離線、重開 App、更新相容性；發佈前處理簽章、公證。
5. 加第二家 provider。跨 provider 不承諾原生 session 無縫續接；用同一旅程資料＋經確認的交接摘要建立新對話。

## 尚未完成的查核

- OpenAI／Anthropic 對本產品的官方整合、訂閱授權、計費與散佈條件。
- Gemini 原生聊天整合：本次 structured runtime 查到的是 Codex／Claude，沒有因此驗證 Gemini 同等能力。[S5]
- Orca 實際運行或登入驗證、其目前 release 與本次 main commit 的差異。
- 全新 Mac 的安裝流程、支援的 macOS 最低版本、是否首版同時支援 Intel。
- 任意 shell 下的旅程隔離方案與研究工具選擇。

## 來源（固定 commit，均於上述查核日期檢視）

- [S1 package.json](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/package.json)
- [S2 macOS packaging](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/config/electron-builder.config.cjs)
- [S3 Chat UI 文件](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/docs/site/content/docs/agents/native-chat.mdx)
- [S4 structured launch route](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/shared/structured-native-chat-launch-route.ts)
- [S5 structured runtime](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/runtime/structured-agent-session-runtime.ts)
- [S6 Codex connection](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/codex/codex-app-server-connection.ts)
- [S7a Codex adapter](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/codex/codex-structured-session-adapter.ts)、[S7b model catalog](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/codex/codex-structured-model-catalog.ts)、[S7c options](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/codex/codex-structured-session-options.ts)
- [S8 Claude SDK connection](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/claude/claude-stream-json-connection.ts)
- [S9 Codex login](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/codex-accounts/codex-login-session.ts)
- [S10 Claude login](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/claude-accounts/claude-login-session.ts)
- [S11 inline setup terminal](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/renderer/src/components/onboarding/OnboardingInlineCommandTerminal.tsx)
- [S12 session record](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/shared/agent-session-record.ts)
- [S13 adapter contract](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/src/main/native-chat/agent-session-wire/structured-agent-session-adapter.ts)
- [S14 LICENSE](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/LICENSE)
- [S15 README](https://github.com/stablyai/orca/blob/5769eb6724d3b094893dccdf849dc47c3718cf72/README.md)
