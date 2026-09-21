# PUBLIC 推送歷史查核：Review 報告

## 範圍

Base：`c08ce08`。Review：`git diff c08ce08..HEAD`。

修正公開目的地一律拒絕、導致貢獻流程走不到底的問題。不是 contrib fork 白名單，也沒有新增任何 --no-verify／環境變數／repo 命名豁免。

## 實作

### 共用唯一掃描與政策

新增 `scripts/lib/contribution-history.js`：
- 從 contrib-check 抽出 BLOCKED、classifyPaths、完整歷史掃描。
- 保留 `git log --format= --name-only -z --no-renames -m --root` 的核心語意：包含 merge parents、改名前後及新增後刪除。
- 先解析不可變 commit IDs，再用兩點 base..tip；不是最終 diff。
- 禁止路徑找到後，以 literal pathspec 定位至少一個涉入 commit；診斷不會把檔名當 glob。
- 根目錄 `.cache/` 原本漏掉，現在與巢狀 .cache 一起被同一政策禁止。
- shallow、缺 commit 或 Git 失敗一律停止，不接受部分結果。
- 固定無顏色、無 pager、關閉 log.showSignature，並停用 replace objects 的歷史替換。
  實測簽章說明確實會污染舊 name-only 輸出而使私人路徑被漏判，已先紅後綠修正。

`scripts/contrib-check.js` 保留 CLI 與原公開 exports，但掃描／分類改用共用模組，訊息也補 commit。
測試驗 CLI 與 hook 使用同一個分類函式與政策物件；在 sandbox 修改共用政策時，兩邊一起生效。

### Hook 的 PUBLIC 分支

新增 `scripts/lib/push-history.js`：只負責解析 stdin、選基準及彙整 refs，沒有另一份路徑分類器。

- 現有 ref：直接查 remote-sha..local-sha，使用 stdin 的 local SHA，與工作目錄 HEAD 無關。
- 新 ref（remote SHA 全零）：先找明確的 `refs/remotes/upstream/main`。
  該基準先用同一掃描器驗整段歷史沒有禁止路徑，防止私人基準把私人 commit 排除掉。
- 沒有 upstream/main：只考慮**本次 stdin 已提供、可解析且屬於該目的地**的既有非零 remote SHA。
  不猜 origin/main，不信任 remote 名稱，不主動 ls-remote／fetch；若只有未提供的遠端 ref 而沒有可信本機基準，仍會拒絕。
- upstream 基準不乾淨時拒絕並列出其禁止路徑／commit；文案說明是推送或基準歷史，不誤稱每個 commit 都在 local 的祖先。
- 每個非刪除 ref 都要能解析到 commit，含 annotated tag；指向 blob 的 tag 沒有可驗的 commit 歷史，拒絕。
- 多 ref 任一不乾淨或無法查核，整批拒絕。
- 刪除 local SHA 全零不傳新增歷史，但仍先做 gh 可見度查核；PUBLIC／PRIVATE 可刪，INTERNAL／未知／gh 失敗仍拒絕。
- PUBLIC 空／壞 ref 輸入，或缺少指定 remote SHA 的物件，拒絕；不偷偷換別的範圍。

`scripts/lib/pre-push.js` 的目的地驗證仍只用 argv URL，保留 gh 每次查核、10 秒逾時與非互動；PUBLIC 才呼叫 inspectPublicPush。
PRIVATE 不掃歷史，私有備份可以含 trips/。模板目的地的既有目錄條件例外維持原狀。

## 訊息與限制

- 含禁止路徑：非零退出，列出路徑與至少一個範圍內涉入 commit；若是不可信基準，也明列基準問題。
- 範圍不明／Git 失敗：非零退出，要求先取得完整歷史與可信基準，不把掃不到視為乾淨。
- PUBLIC 放行仍印出公開提醒；本次範圍乾淨**不代表遠端舊歷史乾淨，也不會撤回先前外洩資料**。
- 檢查的是新增範圍的路徑，不是所有敏感內容；放在 src/、commit／tag 訊息等的私人資訊仍需人工審查。
- stage-backup 的私人行程 origin 規則未放寬；公開的是刻意準備的乾淨引擎分支，不是一般行程備份。
- --no-verify、改 hooksPath 或不執行 hooks 的工具仍是既有邊界，agent 不得自行繞過。

## 文件

- `.ai/rules/contributing-upstream.md` 恢復正常推送／PR 步驟，說明 pre-push 再驗一次歷史。
- 移除「公開 fork 一律被擋／到此停止」的現行規則，保留人類同意要求。
- 保留 `--fork-name` 的 fork → push → PR 路徑尚未端到端驗證。
- repo-ownership、README、how-it-works、CHANGELOG 一起改為 PUBLIC 依歷史判斷；產物從 .ai/ 同步。

## TDD 與驗證

- 第一輪 RED：新 PUBLIC 契約及 contrib-check 診斷／root .cache 回歸，43 個 targeted 中 33 個預期失敗。
- 之後增加基準診斷、Git showSignature 的實際紅燈，再修正。
- 文件契約先 4 個紅燈，再改三處流程及政策表。
- 實際程式變異：在暫存 repo 修改 pre-push 模組（不是只 mock 結果），將範圍失敗改為放行／移除 PUBLIC 掃描。
  兩個 mutant 都能正常載入，但被同一套範圍／私人歷史行為契約抓到 AssertionError。
- 特殊字元、換行檔名、Git notes／顏色、merge、force push、非 HEAD ref、shallow 與多 ref 都有測試。
- 既有 PRIVATE／INTERNAL／未登入／逾時／輸出錯誤案例保留；舊 PUBLIC 一律拒絕測試改成範圍條件，不是刪掉保護斷言。
- 完整隔離 npm test：**446/446 通過**。

整合測試保留真正 Git/npm lifecycle，但 GH／SSH 都是替身，只操作暫存本機 bare repo：
乾淨 PUBLIC push 可通過、私人檔新增後刪除仍被擋且遠端 refs 不變、同分支 PRIVATE 可備份，
刪除在 INTERNAL 被拒絕、PUBLIC 經查核後可進行。這不等於實際 GitHub fork／PR 已驗證。

未部署、未對真實 GitHub push、未 fork 或開 PR；工作目錄 trips/、src/、public/ 與資料 schema 未修改。

## Review 建議

1. 新分支是否確實找不到可信 base 就拒絕，是否有錯用任意 origin tracking ref 的路徑。
2. PUBLIC 是否逐 stdin local SHA 掃，而不是 HEAD；多 ref、刪除、tag 是否符合定義。
3. 共用分類與 Git log flags 是否仍涵蓋新增後刪除、改名與 merge；root .cache 是否兩邊一致。
4. Git 個人顯示設定能否污染機器輸出；診斷的 pathspec 是否按字面處理。
5. 兩個實際程式 mutant 是否真的讓不安全推送通過，且測試確實拒絕該行為。
6. PUBLIC 放行只代表本次範圍乾淨，不要誤解成已公開舊資料安全或所有內容都被去識別化。
