# Desktop trip workbench

## 發布預覽核對

發布準備與最終確認都綁定行程資料及完整發布產物（HTML、照片、robots.txt、_headers）的摘要。引擎或頁面產物在看過預覽後變動，必須重新預覽並確認；寫入部署目錄的檔案就是核對過的位元組快照。

## 0.3.3：Claude 登入狀態修正

移除錯用的 `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST`。此旗標要求宿主提供憑證，會讓 Claude Code 略過自己保存的 OAuth；App 實際採官方 CLI 管理獨立 profile 的登入，因此不應設定它。仍保留 App 專屬設定／憑證命名空間、safe mode、工具限制與環境變數過濾。

同一 App profile 只讀比對已確認：舊設定回報未登入，修正後官方 CLI 與 App account adapter 均辨識 Claude Pro 已登入；全新空 profile 仍需登入。使用者既有授權可直接沿用，未複製憑證、未發送模型請求。

## 0.3.2：session 設定與登入結果核對

每趟旅程可有多段對話，各自保存 provider、model、effort。首次送出後 provider 固定；聊天更多選單提供「使用其他 AI 開新對話」，明確保存舊對話與草稿，再建立另一段。尚未送出的空對話可直接改 provider。這項限制同時在 IPC 後端執行，不只停用前端下拉。

修正 effort 還原次序及共用 trip 記憶體殘值：先完整還原 session，再依該模型重建選項；模型不支援原 effort 時改回預設。Codex「預設」會明確傳送 model/list 宣告的預設強度，避免 turn/start 的持續 override 沿用上一輪。不可用的舊模型會明示停用，不偷偷改用另一個模型。新 AI 回覆保存 generation metadata（provider、model、effort；可知時另存 resolvedEffort），滑鼠停在回覆上可看設定；舊回覆不補猜。改預設只用於新 session。重設／交接的原生 thread 清除後，不再把舊文字 history 自動傳入 Claude／Gemini；明確確認的 handoff 摘要仍會傳入。

Claude 登入結果現在會查官方 auth status，而非只看登入子程序的退出碼；有界重查後才判斷，並顯示無原始授權網址／token 的錯誤類型。已验证假程序成功、非零退出但已保存、延遲狀態、取消競態與錯誤分類。現有 App profile 只讀查核仍未登入，且沒有歷史 debug 記錄；使用者須在新版重試以取得原因，尚未宣稱真實 OAuth 問題已解決。

## 0.3.1：停止續聊與 macOS Claude 登入

主動停止會保存明確意圖；只有確認目前回合已結束（或尚未送出）才允許在原對話發新訊息。這時不顯示找回回覆操作，不會自動重送被停止的要求。停止未確認、連線失敗及舊版缺少來源的紀錄分開呈現。舊紀錄可透過只讀回合狀態確認後續聊；無回合紀錄時仍需明確重新開始。按鈕名稱調整為「停止回覆」、「找回上次回覆」、「重新開始（保留紀錄）」。停止指令立即綁定當下的工作，慢速保存不會誤停下一輪。重設／交接清除原活動工作的恢復入口；重設亦清除上一份交接上下文，畫面紀錄與草稿保留。

修正 macOS Claude 子程序 HOME 隔離導致找不到系統預設鑰匙圈的問題：保留 OS 家目錄，繼續以 App 專用 CLAUDE_CONFIG_DIR／ANTHROPIC_CONFIG_DIR 隔離帳號及設定。沒有建立、重置或修改系統鑰匙圈。只讀原生檢查確認預設鑰匙圈查找恢復正常，空 App profile 仍未登入；完整官方 OAuth 需使用者重新嘗試。詳細來源及驗證見 providers/PROTOCOL.md。

驗證：208桌面單元測試通過；原生 stop／workflow／batch-safety／settings 通過，使用假模型及臨時資料。未發出真實模型請求、完成 OAuth 或修改真實行程。

## 0.3.0：設定分層與暫停後草稿

暫停／中斷會阻止新的 AI 送出，但已恢復的對話仍能編輯並保存草稿。畫面提供核對或重新開始操作；重新開始先保存草稿，避免恢復時覆蓋剛輸入的內容。

專案取得統一為「本機資料夾／GitHub」入口；取得的專案包含可展開的旅程設定，不再重複顯示另一份旅程區塊。AI 頂部是新對話的預設服務與模型；下方固定列出 Codex、Claude Code、Gemini，各自登入、核對及管理。連接背景服務不會切換目前聊天。新對話使用預設值，舊對話記錄自己的 provider／model，切回時恢復。這代表三家服務可同時登入，但每家仍只有一個 App 帳號；原有各家支援限制不變。

私人備份与公開網站整合在「備份與發布」的兩個分頁；公開提醒、預覽及各次確認仍各自生效。本機工具的版本／狀態與名稱同列，重查位於區塊右上方，控制項統一32px、操作間距8px。

驗證：201桌面＋92引擎單元測試、原生 settings／workflow（暫停可打字與草稿保留）／batch／navigation／版面／versions／safety／updater通過。設定測試使用假帳號與臨時專案，沒有真實登入、模型請求、推送、發布或行程寫入。

## 0.2.2：中央對話區

助手回覆移除名稱標籤，固定對話標題與右上方更多操作；研究按鈕與調整範圍同列。暫停／中斷提示回到聊天紀錄區，以分隔事件呈現。navigation 原生測試涵蓋明暗／窄視窗、標題命名同步、提示位置與單列控制；workflow 回歸驗證中斷不重送及重新開始仍可操作。

## 0.2.1：共用選單開關修正

同一 trigger 再點會關閉選單；點其他 trigger 切換選單。共用 `menus.js` 保留原生 top-layer 顯示，由元件一致處理外點與 Escape，避免原生 light-dismiss 後又被 click 重開。`smoke:menus` 以真實滑鼠事件驗證重現與修正，並涵蓋切換 trigger、鍵盤、外點、焦點返回與右鍵。

## 0.2.0：導覽、登入與多 AI 服務（2026-09-23）

- 側欄以旅程為資料夾，展開後是對話。旅程／對話提供更多及右鍵選單；命名、封存、複製與交接等低頻操作已收合。品牌後方是收合按鈕，窄列底部保留設定。
- 初次顯示示範旅程，刪除偏好寫入 App 設定，重開不再加入。旅程清單更多選單可恢復示範。自訂示範內容仍只存本次視窗。
- 正式旅程經確認後移至原私人專案被 Git 忽略的 `.local/desktop-trash`，保留全部資料／照片／私人筆記。可重開後還原；同名目錄存在就拒絕覆蓋。沒有永久刪除、遠端 Git 或線上網站操作。
- App 啟動自動核對保存的登入，顯示檢查中／需登入／工具缺少等狀態。切換服務時隔離舊回覆，保留舊對話並建立新對話。設定頁依 Orca 參考整理為設定列、狀態與漸進展開的維護區。
- 工具與更新提供具體安裝引導。GH 可下載官方二進位檔並校驗至 App 工具目錄；其他固定安裝流程在使用者確認後開啟 Terminal／PowerShell，完成後重新檢查。Wrangler 內建，可直接進 Cloudflare 登入。測試沒有實際執行安裝。
- Codex、Claude Code、Gemini 可在聊天／設定切換。Claude2.1.278與Gemini0.46.0透過官方 CLI、獨立 OAuth/profile 運作，六種文字模式均有實作。來源、介面與限制見 [providers/PROTOCOL.md](providers/PROTOCOL.md)。Claude 僅 Pro／Max；Gemini 尚無 App 內換帳號；這兩個 provider 不支援圖片、effort、自動額度等待或不確定結果的原生恢復。模型選項是官方 CLI 別名，可用性仍由帳號決定。
- 這兩個新 provider 的自動驗證使用假程序，另驗了實際已安裝 CLI 的無登入啟動／狀態與未認證 ACP 初始化；没有發送真實模型請求或完成使用者授權。

驗證：root501 + engine92 + desktop198 =791項單元測試；原生 navigation、workflow、batch、版本、安全、版面、startup、preview、updater 回歸通過。navigation 驗證選單鍵盤與右鍵、示範刪除重開、旅程回收還原、切換／恢復 provider、安裝確認。Windows 真機仍待使用者後續安排。

以下為原有功能說明；與上方不同之處以0.2.0為準。


桌面工作台與共用引擎已納入 npm workspaces。保留 `desktop/prototype/` 名称，表示仍在本機驗證階段；介面已可連接既有專案、恢復選取、建立真實預覽，提供多日修改、日程版本／部分回復、正式新旅程規劃、來源查核、私人備份與網站發布。

## 安裝與啟動（由 coding agent 執行）

一般行程擁有者仍使用 root 的 `npm install`；`.npmrc` 預設不安裝桌面 workspace。根 CLI 維持 Node >=20。桌面開發需 Node >=22.12，建議測試使用 Node 24。

```sh
npm run desktop:setup
npm run desktop:prototype
```

全部套件共用 root lockfile。桌面依賴 Electron 44.4.3；首次啟動可能下載平台執行檔。引擎套件位於 `packages/engine/`，資料仍位於原私人 repo，匯入不會複製進公開模板。

## 可用流程

1. **設定 → 專案管理 → 選擇資料夾**：唯讀辨識現有行程，記住專案及選取旅程。重開會重新檢查，找不到目錄時請人重選，不自動建立替代專案。
2. **右側預覽**：靜態解析原資料、驗證後，用同一套引擎產生完整 HTML。可互動查看行程與照片；預覽沒有 Node／IPC，外部連結不自動開啟。
3. **設定 → AI 助手**：檢查 Codex 0.155.1；由使用者在官方頁面連接 ChatGPT。App 使用獨立 profile 與 OS keyring，沒有讀入其他工具的登入資料或 API key。「更換帳號」先登出目前 App 帳號、確認登出後重啟登入；一次只保留一個。官方頁面若自動使用舊帳號，可複製登入連結到無痕視窗。AI 工作或待確認提案期間不能更換。
4. **選定一天、送出修改**：本輪提供這一天和被引用地點的名稱／類別／備註，沿用同一旅程先前的 Codex 對話上下文。模型可在聊天輸入框直接切換，與設定頁同步，清單由已連接的帳號回傳；每次送出檢查設定及一般額度許可，未知不猜、不切付費 API、不自動重送。
5. **候選預覽 → 確認保存**：資料通過驗證後顯示提案；原始內容未變、來源仍確認為私人 repo，才保存選取的修改並建立版本。保留本機還原副本，並嘗試追加既有私人 status.md。沒有自動 commit、push 或部署，UI 分開回報本機保存與異地備份。

「不指定 · 整體討論」是預設範圍：傳送所有日程及引用地點的名稱／類別／備註，只回覆整體建議，不建立修改提案或寫入行程；要保存跨日修改可選「全部天數」。私人 docs 與個人 profile 不會整份送出；新旅程會使用本人填寫的規劃需求及明確選取的附件。

停留或備案變更會標成需查核：執行來源研究、核對公開頁面的引用、檢視待確認事項與可行性摘要，再由使用者確認。來源引用符合不等於所有事實自動正確；仍須查看摘要。查核綁定本次候選與完整周邊資料，內容變動須重做。

側欄提供旅程搜尋（⌘K／Ctrl K）、可收合的專案分組、獨立示範分組與底部 AI 連線／設定。收合窄列保留新增、搜尋、設定捷徑。設定導覽分成工作空間與應用程式，相關操作集中在同一區塊。設定記住當次視窗中最後分類與捲動位置；⌘,／Ctrl , 開啟、Escape 回到旅程，並恢復原操作焦點。

全寬 56px Header 整合原生視窗控制與旅程名稱。左側列表內的按鈕可收合為 52px 窄列；右側預覽可切換。兩側邊界可拖曳、方向鍵調寬或雙擊重設，原生最小視窗下中央聊天保留至少 320px。

真實預覽右上角的外開圖示會在預設瀏覽器開啟本機快照，不會上傳；頁面由 loopback 隨機網址提供，保留最多四份、30 分鐘到期，App 關閉後失效。候選版本也可外開，但保存閘門仍依 App 內預覽載入與人確認。示範預覽沒有外開功能。

新增旅程 Modal 在連接私人專案後預設建立正式草稿；日期等未定欄位可留空，不捏造地點座標。先討論並確認逐日草案，再查核來源與可行性，最後產生完整候選預覽並確認保存。明確選擇示範時才使用記憶體假資料。既有旅程的對話、草稿、模型與調整範圍保存在 App user-data 的 conversations 目錄，依專案根路徑及旅程隔離；Codex thread 由 App 獨立 profile 保存，重開會核對身分及上一輪，再原生續接。關窗會先保存草稿，切旅程或換專案遇儲存失敗時留在原處。專案連接、選取旅程與明暗偏好存於 App user-data 的版本化 registry；憑證不進 registry 或行程。

## 日程版本與回復

第一次完整驗證既有旅程時，記錄當時的日程為 V1。每次確認保存建立下一版；若偵測到外部修改，也記錄當時內容。上方「V… · 版本紀錄」可查看歷史，選擇舊版會先產生回復提案，不直接覆寫。

「查看修改對照」逐項列出目前／修改後內容，可取消不想要的部分。日程停留安排與備案視為同一組；天數、日期或順序變動則視為整體結構的一組，不拆成可能互相衝突的修改。回復到 V1 後仍會建立新版本，V2／V3 不刪除，之後可再選回。

版本範圍為 App 可編輯的每日安排（`data.js`）；照片、私人 docs、設定與其他內容檔不會跟著還原。這些周邊資料的摘要若與舊版不同，暫停套用而不猜測相容性。每次候選選取、重開恢復都產生新的預覽識別，不沿用舊的「已看過」。AI 新提案含停留／備案變動仍要查核；已記錄歷史內容的回復需完整驗證與人確認。

版本與提案位於本機 App user-data 的 `versions/`，不會進公開模板，也尚未同步到 GitHub。每趟最多 100 個版本／32MiB，達限會停止新增及保存，不靜默刪舊版。檔案保存前先落地意圖，重開比對實際原檔來核對結果；碰到不一致不自動覆寫。POSIX 同步資料與目錄，Windows 僅宣稱程序中斷恢復，不宣稱斷電持久性；整套仍不等同異地備份。

## 驗證

```sh
npm test
npm test --workspaces --workspace=@travel-planner/engine --workspace=@travel-planner/desktop
npm --prefix desktop/prototype run smoke
npm --prefix desktop/prototype run smoke:startup
npm --prefix desktop/prototype run smoke:preview
npm --prefix desktop/prototype run smoke:workflow
npm --prefix desktop/prototype run smoke:versions
npm --prefix desktop/prototype run smoke:batch
npm --prefix desktop/prototype run smoke:batch-safety
npm --prefix desktop/prototype run smoke:updater
npm --prefix desktop/prototype run smoke:navigation
```

- root：既有 CLI 與引擎回歸。
- engine：非執行式 parser、快照、路徑與單日修改。
- desktop：專案保存、提案保存、Codex stdio 假程序及事件／停止。
- smoke：明暗介面、四種面板收合組合、拖曳／鍵盤調寬、小視窗、Modal 與草稿保留。
- startup：真正 package entry；不再用直接呼叫 createWindow 代替啟動驗證。
- preview：假專案透過真實引擎、隔離 renderer 與重開恢復。
- versions：V1 → 選取部分修改保存 → 跨日部分回復 → 完整回復 → 找回後來版本，含重開提案、外部內容衝突、放棄提案與其他操作互斥。
- workflow：假模型、假專案，驗證更換帳號／快速登入事件、登入連結複製、整體討論不寫入、模型同步、瀏覽器預覽，以及提案不自動保存、候選 preview gate、明確保存與還原副本。

自動測試使用 temporary 假資料與 fake model，storage 與使用者 App state 分開。2026-09-22 另經使用者授權，用已連接的 ChatGPT 帳號與臨時範例做真實模型驗證：gpt-5.6-sol 第一輪討論、停止再啟動 transport、第二輪引用前文修改標題，候選通過資料驗證並建置預覽；來源未修改。這項手動驗證不加入 CI，也不讀寫真實旅程。初次 gpt-6-astra 第二輪超時已查核為 interrupted，沒有自動重送；不宣稱全部模型都已驗證。

`.github/workflows/desktop.yml` 準備 macOS 與 Windows 原生矩陣；尚未執行即不得宣稱 Windows 通過。Windows 手動驗證需在原生 Node/Electron 下重跑上述 desktop/engine 測試與 smoke，接著檢查 OS picker、登入、關閉重開；不以 WSL 代替。

## 執行範圍

資料 JS 只經 Acorn AST 的 allowlist 解讀。解析在有記憶體／時間限制的 worker；檔案與父目錄有 identity/canonical 檢查，這不是對同 UID 精密 ABA 路徑交換的完整 OS 保證。

一般模式停用 shell、patch、code mode、REPL、外掛與 MCP。研究／候選建置模式另啟用 Codex 官方 hosted web search 所需的 search/code-mode host；仍停用本機命令與寫檔工具，模型只回傳結構化結果，由 App 驗證。每次請求核對實際設定，同帳號切換模式保留原生對話。已用臨時範例驗證真實搜尋、引用核對、圖片辨識與多日提案；Windows 原生尚待實測。

中斷、停止或傳輸結果不明時不自動重送。畫面提示「重新開始 AI 對話」；這會保留舊訊息供查看，但開新的 AI 上下文。換帳號後，舊帳號 thread 不會自動交給新帳號。未確認提案會保存；重開時原內容與周邊資料仍一致才恢復，並要求新的候選預覽。資料已變時提案失效，恢復聊天不能重建保存許可。每趟可建立、命名、切換、封存與複製多段對話（最多50份保留紀錄）；每段有獨立草稿、模型與原生 thread。未知结果可核對原始 turn，找到已完成結果就取回而不重送。額度等待需本人開啟，只在 App 開著且同帳號、同旅程、同內容時依一般額度許可續做，最多3次自動嘗試；切帳號不轉移待處理工作。交接會先展示可編輯摘要，確認後才建立新的上下文。

瀏覽器視覺預覽：`npm --prefix desktop/prototype run preview:web`，開 `http://127.0.0.1:4174`。它沒有本機檔案或帳號 IPC，只能操作示範；不是完整離線 PWA。Logo 的原始檔、匯出方法與平台限制見 [品牌資產](assets/brand/README.md)。

## 本機資料限制

對話檔只存這台電腦，不隨行程 Git 備份；儲存空間不足或檔案損毀會保留原檔並阻止送出，不靜默清空。草稿防抖約 350ms 並於切換／正常關窗前寫入；強制終止可能遺失最後尚未送到主程序的輸入。每份對話上限 16MiB／2000 則，可封存與複製對話文字；完整旅程備份檔不包含 App 對話、帳號或版本庫。

## 備份、發布與首次設定

- 專案管理可下載已授權的 GitHub 私人專案，或確認後從公開模板建立自己的私人專案。下載不執行匯入專案腳本。建立後尚未推送；首次備份會列出完整未推送提交。GitHub 授權使用官方 gh 流程。
- 私人備份先列出確切專案、分支、所選旅程檔案與既有未推送提交。確認才 commit/push，重新確認 PRIVATE 與可信 pre-push，核對遠端 SHA 才顯示完成。未知 hook／既有其他暫存修改會擋下。
- 可匯出含私人 docs 與照片的完整旅程備份檔，再匯入為另一趟旅程；不覆蓋原旅程。備份檔**未加密**，需自行保管，分享前須去識別化。它不包含 App 的對話或日程版本庫。
- 網站發布使用受控的 Workers 流程，先選擇 Cloudflare 帳號、查看 App 內預覽、核對目標，再確認公開網站提醒。任何拿到網址的人均可開啟；noindex 不是密碼。既有網站要另行核對並確認接管。此處與原 CLI 共用官方 GitHub／Cloudflare 登入；ChatGPT profile 則獨立。
- 文字／Markdown／JSON 與 PNG／JPEG／WebP 附件明確勾選後才送出。公開網址只擷取有大小與時間限制的文字，拒絕本機與內部網路；PDF/OCR 未支援。
- 工具與更新列出缺少的本機工具與官方安裝連結。正式簽章安裝版提供明確檢查、下載、安裝流程；開發版及未簽章版只提供手動更新，不自動替換。發布配方與限制見 [distribution/README.md](distribution/README.md)。

關窗／更新前會等待已開始的保存、備份、發布操作收束並保存草稿；不要把強制結束程序視為正常關閉。遠端結果不明不會盲目重試。


## 本批驗證與本機產物

2026-09-22：root501、engine92、desktop164，共757項單元測試通過；原生 UI、startup、preview、workflow、versions、batch、batch-safety、updater 與隔離封裝啟動均通過。Windows CI 配方已包含對應步驟，但未宣稱已在原生 Windows 執行。

本機 Apple Silicon 產物位於 `.local/distribution/Travel Planner.app` 和 `TravelPlanner-0.1.0-mac-arm64-unsigned.dmg`。這是0.1.0未簽章測試版，沒有公證或公開發布。工具檢查與實際 GitHub／Cloudflare 授權仍由 App 引導；測試沒有推送或發布真實行程。
