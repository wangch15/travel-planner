# Desktop real workflow implementation plan

Goal: 以既有私人行程專案完成「開啟 → 檢查／真實預覽 → AI 提案 → 人確認保存」，並保留舊 CLI 使用方式。

Architecture: npm workspaces 管理桌面與共用引擎。root CLI 路徑保留；packages/engine 提供 schema、非執行式 CommonJS 資料解析與純 HTML rendering。桌面控制層持有選定 repo 身份、原子 registry 與預覽產物，renderer 只能傳固定意圖與不透明 ID。Codex 用 app-server stdio 與獨立設定／登入，不讀現有個人 auth cache。未經實測的隔離能力不開啟真實寫入。

Tech stack: Node >=20、npm workspaces、既有 Electron 44.4.3、Acorn 8.18.0（只解析 AST，不執行 JS）、Codex 0.155.1 protocol。

## Task 1 — monorepo 與安裝相容

Files: root package.json/package-lock.json/.npmrc, desktop/prototype/package.json, packages/engine/package.json, scripts/lib/schema.js, README.md, tests/agent-docs.test.js。

root `workspaces` 列 desktop/prototype 與 packages/*；`.npmrc` 預設 workspaces=false。一般 `npm install` 保留 CLI 安裝方式，不裝桌面工作區；桌面開發使用明示 `npm install --workspaces --include-workspace-root`。同一份 root lockfile 管版本，移除 desktop 的獨立 lockfile。以乾淨的假副本驗一般安裝不產生 Electron、workspace 安裝能連接本機引擎。schema 實作移入 engine，舊路徑保持相容 export。

## Task 2 — 不執行資料程式的 loader

Files: packages/engine/{index.cjs,literal-data.cjs,snapshot.cjs,schema.cjs}, packages/engine/tests/*.test.cjs。

解析支援純 literal、陣列／物件、const 引用與 module.exports；只在必要且安全時支援模板純文字、負數。拒絕 call/new/function/getter/spread/computed keys/prototype keys/外部 require 等，不用 eval、vm 或 require 去載入使用者 JS。固定允許檔案、JSON 和文字有大小上限；拒絕 link 與路徑逃逸；不讀 docs、_profile、Git 或憑證。

loader 組裝與既有 CLI 相同的 trip shape，通過 schema 後回傳可建置 snapshot 與內容 digest。不支援的舊寫法回報可理解的相容性問題，不偷偷执行或改檔。測例包含 _example 真實資料、惡意 JS 不執行、錯誤／缺檔、link、修改前後原始檔一致。

## Task 3 — 專案恢復與真實預覽

Files: desktop/prototype/{project-store.cjs,preview.cjs,main.cjs,preload.cjs,app.js,index.html}, scripts/build.js, packages/engine/render.cjs。

App user-data 保存版本化、原子寫入的專案路徑／選取 trip／介面偏好；重開必須重查路徑及 metadata，不從資料庫恢復「已確認」或遠端歸屬。測試用獨立 temp storage。刪失、損壞、不相容都保留可修復狀態。

純 render 由 CLI 與 desktop 共用，不執行 extra.js。preview 是獨立、不帶 preload／IPC／Node 的受限內容來源，與 trusted UI 使用不同 scheme／session；只提供指定 snapshot 的 HTML、白名單照片／靜態資產，禁止讀任意檔案和導航。保留 immutable digest，後續確認綁此版本。

## Task 4 — Codex transport 與安全驗證

Files: desktop/prototype/codex/*, desktop/prototype/tests/*, .github/workflows/desktop.yml。

先以 fake server 驗 initialize/initialized、request errors/timeouts、stream events、interrupt、程序結束、結果 unknown 不重送。固定 0.155.1 schema。真實 app-server 可以不登入完成 handshake；帳號登入由使用者在正式頁面操作，設定页呈現需要處理的狀態。模型清單由能力查詢取得，不硬編。

以兩 OS 的假工作副本與 canary 驗證跨 trip／engine／credential 讀寫拒絕；沒有證據就不開一般 shell 或真實資料寫入。準備 Windows/macOS CI 工作流程不等於已執行；不為 CI 自行 push。提供原生 Windows 測試途徑，不退回 WSL。

## Task 5 — 提案、確認與保存

模型只在通過隔離驗證後取得必要資料與受限工具；controller 保存提案與版本，preview 後由可信 UI 確認。匯回前重算原內容 digest，版本變動拒絕，不覆蓋他人編輯。檔案選取白名單、單一 writer、失敗可恢復；部署與 push 是獨立後續意圖。

## 驗證與現況

基線 488 tests；使用者已同意本輪方向。沿用 lamprey，未 commit/push。真實私人專案位置與原生 Windows 測試環境已詢問；目前只在 Orca 登記找到公開模板，不猜私人路徑。本機 Codex 0.155.1 可用，已重新產生 schema，尚未登入或發模型請求。

npm workspaces=false 與明示 workspace install/run 已在 temp 假套件驗證。參考：[npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/)、[Codex app-server](https://developers.openai.com/codex/app-server)，查核 2026-09-22。

## 本輪結果與交接

- 目前階段：npm workspaces、共用 schema／renderer／非執行式資料 reader、既有專案與選取／主題恢復、真實隔離預覽、ChatGPT 連接、受限單日 JSON 提案、確認預覽後本機保存已接線。真實私人專案已唯讀驗證與預覽；沒有修改它的行程檔案。工作台連接保存在 App user-data，私人的路徑不寫入公開文件。
- 等待確認：使用者在新版 App 的設定 → AI 助手，檢查 Codex 並親自連接 ChatGPT。尚未完成真實模型回覆驗證，沒有自動登入或使用現有其他工具的 auth。
- 阻礙：Windows 原生由使用者後續實機測試；CI matrix 已準備但未推送／觸發。完整乾淨安裝一度遇 ENOSPC；清理本輪暫存副本後，以略過平台 optional binaries 的 temp install 驗證 default CLI 不裝 Electron、明示 workspace 才安裝並連結引擎。不能把這當作乾淨機安裝驗收。
- 下一步：登入後先驗證實際模型產生文字提案；使用者看過候選 preview 才能保存。停留／交通／備案變更仍需研究查核，不會當成已核准行程直接保存。quota 自動續作、完整 durable run recovery、handoff、安裝器與部署另屬後续階段。

### 已有證據

- 引擎 renderer 抽取前後，範例 CLI 輸出逐位元相同。
- 字面值 parser／snapshot 及 day-edit 均經 spec review 與 code quality review；原型輸入兼容精確 browser/CommonJS export guard，沒有執行原資料 JS。
- Codex transport 經兩輪 review；初始化 backpressure、Stop／完成順序、未知結果與程序停止有 regression。Account 連線前取消及斷線 loginId 清理問題已修。
- 專案 registry 與確認保存經獨立暫存假資料攻擊測試：持續性 parent redirect、status symlink 換入、temp 名稱碰撞與被換檔均拒絕或安全略過；只清理本次擁有的暫存 identity。Node pathname 操作不宣稱能防住同 UID 每一步精準 ABA。
- macOS Codex 0.155.1 的真實 initialize/account-read/config-read 通過，狀態 needs-login；沒有模型請求。實際有效 profile 與全部停用功能核對成功。
- macOS 權限 canary：可讀工作區測試檔；拒絕工作區外讀取與區內寫入。這是初步 CLI policy 證據，不能代替 Windows 或完整 agent tool matrix。
- 原生 Electron startup、專案恢復／真實 preview、假模型完整提案 → preview → 明確保存／還原副本流程通過。真正輸入模型的資料只含選中日與被引用地點的名稱／類別／備註；不含其他地點或導航地址。
- 私人專案 git 工作目錄保持乾淨；未 commit／push／部署，未建立任何付費資源。

### 最終本機驗證

`npm test --workspaces --include-workspace-root`：root 499、engine 91、desktop 42，合計 632 項通過，0 失敗。真實入口 startup、假模型完整 workflow smoke 再次通過。原型整合 review 未發現阻擋問題；真正登入與模型請求仍未執行，不能以 fake model 結果冒充。部分 Electron 結束視窗時輸出 GPU teardown 訊息，流程 assertion 及退出碼仍成功，未據此宣稱跨平台圖形穩定性驗收。

現有私人專案的 git status 仍為乾淨。新版 App 已從已存連接恢復真實預覽；ChatGPT 登入問題保持等待使用者，未把經過時間當成授權或完成。全部改動仍留本機，未 commit/push。

## 最新補充：帳號與工作台操作（2026-09-22）

- 目前階段：使用者回報已親自登入。已增加單帳號更換流程、登入連結複製、全寬原生 Header、側欄收合窄列、左右拖曳及鍵盤調寬、聊天模型切換、本機瀏覽器預覽。「不指定」為整體討論，不建立修改提案、不寫行程。
- 等待確認：使用者查看新版版面，並在需要時自行選擇帳號。真實模型提案仍待驗證，不把假模型測試記成真實 AI 成功。
- 阻礙：Windows 原生留待使用者實機測試；安裝器、研究、部署、自動續作仍為後續階段。
- 下一步：以選定帳號驗證真實文字回覆與候選預覽；保存仍需人確認。全部程式改動留本機，未 commit／push／部署。
- 本輪驗證：55 項桌面單元／整合測試通過；原生 smoke 覆蓋四種面板組合、拖曳與鍵盤調寬、草稿及明暗；workflow smoke 覆蓋換帳號、快速登入事件、模型同步、討論不寫入、瀏覽器預覽與候選保存；真實入口 startup 通過。獨立 review 未發現阻擋問題。native workflow 結束仍偶有 Chromium GPU teardown 訊息，assertion 與退出碼成功。
