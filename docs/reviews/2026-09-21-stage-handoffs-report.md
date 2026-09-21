# 階段交接與隱私流程修正：Review 報告

## 範圍

Base：`dc55641`。Review：`git diff dc55641..HEAD`。

依使用者指定順序完成四項，沒有新增自動 push 程式、pre-push hook、狀態資料庫或自動去識別化服務。
修改的是 agent 必做流程、既有 status 模板與文件契約測試；不宣稱文字規則能機器保證任意 agent 的行為。

前三個 commits：
- `aca0767`：階段保存、每次推送前的 origin 私有檢查。
- `56d60ec`：由 agent 負責去識別化最小診斷摘要。
- `68b5306`：八個 skills 完成／暫停／阻礙時寫既有 status.md。
- 本報告所在 commit：noindex 精確措辭與驗證紀錄。

## 1. 階段備份

唯一流程來源：`.ai/rules/stage-backup.md`。

順序：內容驗證／人類閘門 → 本機 checkpoint → 核對 origin 真正 push URL／分支 →
本次 gh 私有查核 → 明確推送 origin → 核對遠端 commit → 才能回報階段完成。

- 必查 `git remote get-url --push --all origin`，不能只看 fetch URL；多 URL、目的地改變或不明就停止。
- 使用者要求的 `gh repo view --json visibility` 查核，實際明確指定 origin 的 owner/repo，避免 gh 默認查到 upstream。
- 只有本次成功得到 PRIVATE 才能 push；不沿用開工或上次重試結果。
- gh 未登入、離線、查不到、PUBLIC／INTERNAL／未知值，停止且不 push。
- push 失敗或遠端 commit 未核對，必須回報「目前只有本機備份，尚未異地備份」，不可說階段完成。
- 本機 commit 也失敗時，另說明工作檔尚未成功提交，不假稱有 checkpoint。
- 不夾帶其他工作的 staged 改動，不裸 push、不 force；補備份不重新部署。
- plan（閘門一後）、research、basemap、photos、maps-lists、首次 ship／維護、update 都有保存完成條件。
- setup／repo-ownership 的 `gh repo create --push` 改成先建 repo，再走相同檢查與首次推送流程。
- README／how-it-works 不再把「進 git」直接當成已異地備份。

本次只編寫並測試流程，沒有執行任何 gh 可見度查詢或 push。此 guard 是 agent 的必做步驟，不是技術上攔截所有 Git 呼叫的 hook。

## 2. 對外診斷

唯一流程來源：`.ai/rules/diagnostic-sharing.md`。

agent 先最小化並去識別化 → agent 複查正文／指令／網址／截圖／附件 →
顯示最終摘要、目的地與公開程度 → 等使用者明確同意 → 只送核准內容。

- 移除姓名、私人網址、訂單號、確認碼、憑證及本機路徑的使用者名稱，另涵蓋聯絡方式和可識別的 slug／檔名。
- 保留必要版本、最短假資料重現、錯誤類型／碼與少量引擎相對路徑／行號。
- 不確定是不是秘密就省略或用假資料重現，不把識別責任丟給人。
- 確認後新增附件或改內容／目的地，需要重新檢查與確認。
- HELPER 不再要求整段原始錯誤；bug 模板不再要求完整 log，但原本人類個資警告保留當第二道。
- 共同入口、contributing-upstream、README 均接上同一責任規則。

沒有實作宣稱能辨識所有個資的正則清洗器；沒有對外送出任何摘要或附件。

## 3. 既有 status.md

來源：`.ai/rules/progress-tracking.md`、八個 tp-* skills、`scripts/templates/docs/status.md`。

- 完成、等待人確認、受阻或中途交接時，回覆前更新目前階段／等待確認／阻礙／下一步。
- 先寫進度，再納入階段保存；不把內容驗證、部署成功或勾選當成備份成功。
- 尚無目錄／slug 不明／ownership 未通過時，不寫 trips/；回話交接四欄與未寫入原因。
- setup 交接在 tp-plan 的 new 成功後才補到既有 status，避免先建目錄讓 new 失敗。
- 「已是最新」與「Maps 未啟用」等早退也有交接要求。
- 單純離線仍保存已確認可寫行程的本機進度，但不能 push；已知公開或歸屬不明優先停止寫入。
- 保留既有內容勾選欄位；舊 status 缺四欄時保留私人內容並補欄位，不覆寫成空模板。
- 不新增備份成功自證欄位或反覆 commit/push 的循環，也沒有新增版本化同意系統。

沒有改任何真實行程的 status.md。未來由執行 skill 的 agent 按流程更新；不是引擎自動寫進度。

## 4. noindex

三處指定文案（privacy、README FAQ、README 技術隱私）統一為：
「要求搜尋引擎不要收錄，但那是請求不是保證；任何拿到網址的人都能開啟」。

另同步 tp-setup 的同類舊保證，避免 agent 在 setup 又講回不同說法。
保留「不是密碼保護」，不修改 src/、public/、robots.txt 或部署設定。

## TDD 與結果

基線隔離套件：327/327。

- 備份：先 10 個契約失敗，補使用者文件測試再 1 個失敗；修正後 338/338。
- 診斷摘要：6 個契約／變異測試先失敗；修正後 344/344。
- status：12 個先失敗；另外補不可寫入優先與早退交接兩個紅燈；修正後 358/358。
- noindex：5 個措辭／變異測試先失敗；修正後 **363/363**。

測試不只搜尋詞語：檢查限定段落中的動作順序、條件→動作表格、caller 的階段完成條件，
並以省略 gh、PRIVATE 改 PUBLIC、離線仍說完成、未同意就分享、等待當成點頭等變異確認會被拒絕。
它們是文件契約測試，不是跨模型實際行為測試。

新增測試：
- tests/stage-backup-docs.test.js
- tests/diagnostic-sharing-docs.test.js
- tests/progress-docs.test.js
- tests/privacy-wording.test.js
- 共用讀取／段落／表格 helpers：tests/helpers/doc-contracts.js

`npm run sync:agent-assets` 每項都跑過；AGENTS.md／CLAUDE.md 與四套工具 skills 為同步產物，未手改。
完整 npm test 在隔離副本執行，避免既有測試 fixtures 寫到工作目錄的 trips/。
未刪原斷言、未放寬 schema；工作目錄 trips/、src/、public/、部署程式未修改。
沒有部署、push、fork、PR 或對外傳送資料。

## 建議 reviewer 檢查

1. 每次私有查核是否綁定真正 push 目的地，且查核／推送／遠端驗證任一失敗不會被寫成完成。
2. 各 skill 是否都有保存與 status 的順序，早退／無 slug 例外是否仍安全。
3. status 的不可寫入前提是否優先，離線與已知公開是否被正確區分。
4. 去識別化是否由 agent 負責，原始 log／附件是否能繞過人的確認。
5. 文件測試的變異是否真的破壞條件→動作而被捕捉，而不是依賴無關段落裡的詞語。

Review 時也不要實際 push、部署或傳送診斷資料；需要全套測試時使用隔離副本。
