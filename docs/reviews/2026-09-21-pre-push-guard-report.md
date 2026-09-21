# pre-push 最後一道檢查：Review 報告

## 範圍

Base：`8cb7908`。Review：`git diff 8cb7908..HEAD`。

本輪新增真正的 Git pre-push hook，但保留 `.ai/rules/stage-backup.md` 的第一道規則。
沒有新增任何自訂環境變數或旗標豁免，沒有因 refs／diff 未碰到 trips 而跳過查核。

## 檔案與介面

- `.githooks/pre-push`：POSIX sh 薄入口，Git 追蹤為可執行檔；找不到 node 時也拒絕並給中文下一步。
- `scripts/pre-push.js`：讀 Git argv 的 remote 名稱／URL 與 stdin ref 更新，轉交模組，拒絕時非零退出。
- `scripts/lib/pre-push.js`：可注入 subprocess runner 的判斷邏輯。
- `scripts/install-hooks.js`：npm prepare installer，只設定 repo-local `core.hooksPath`。
- `package.json`：新增 `prepare: node scripts/install-hooks.js`，沒有新增相依套件。

## 目的地檢查

1. URL 只取 Git hook argv，不重新查 remote；remote 名稱不參與授權判断。
2. 可明確解析的 URL 限 github.com HTTPS、git@github.com scp 格式與 ssh://git@github.com（含標準 port）。
   不猜 SSH alias、其他主機、帶憑證／query／編碼路徑；無法識別就拒絕，不回顯可能含憑證的原始 URL。
3. `wangch15/travel-planner` 例外：工作目錄 trips/ 下沒有非底線開頭的資料夾才允許。
   非底線 symlink 指向目錄也檢查；無法讀取時拒絕。這不是歷史掃描或帳號所有權認證。
4. 其他目的地每次執行 `gh repo view <owner>/<repo> --json visibility`。
   固定 GH_HOST=github.com，防止環境中的其他 host 讓 owner/repo 查到另一個站；關閉互動 stdin。
5. 只接受退出碼 0、可判讀 JSON 且 visibility 精確等於 PRIVATE。
   PUBLIC／INTERNAL、未登入、缺 gh、無法查核、未知格式、逾時／中斷全部拒絕。
6. gh 有固定 10 秒上限，逾時殺掉子程序；沒有可見度快取。
7. README-only、新分支、force push、分支刪除（全零 local SHA）、甚至空 ref 輸入都不豁免。

拒絕均包含「目前只有本機備份，尚未異地備份」、原因及下一步。
PUBLIC 特別提醒：已在 repo 的內容已公開，可能含 docs/ 訂房確認碼或門鎖密碼；擋住這次不會撤回舊資料。

## 安裝

- npm install → prepare → `git config --local core.hooksPath .githooks`。
- 非 Git repo／找不到 git：靜默跳過，prepare 不讓 npm install 失敗。
- 讀有效 core.hooksPath（包含 global/worktree），不只查 local。
- 已設定其他路徑就保留並警告，要求人處理；空值、含前後空白的不同路徑也不能誤認成 .githooks。
- 專案在別的 repo 子目錄時不改外層設定；config 讀寫失敗明說未安裝。
- setup／update 加上安裝結果確認與衝突處理；merge 會更新被追蹤的 hook 檔案。
- 本工作目錄已執行 installer，確認 `.git/config` 的有效值是 `.githooks`。未改 global 設定。

## 文件與相容性

- 保留 stage-backup 的每次私有查核與遠端 commit 驗證；hook 放行不等於備份成功。
- 誠實說明 `--no-verify` 可繞過：防不小心，不防刻意。
- 未安裝、變更 hooksPath、工具不執行 Git hooks／直接走 API 都不保證被攔；不能宣稱每款桌面工具都受保護。
- 公開 contrib fork 也會被拒絕，沒有豁免。貢獻文件改成推送前停止並與人討論，不引導 agent 自動停用 hook。
- README／CHANGELOG／repo-ownership／setup／update／引擎邊界一起更新；`.ai/` 為來源，產物由同步腳本產生。
- `prepare` 加入 README repo 級指令分類與既有指令覆蓋測試，沒有刪除原断言。

## TDD 與本機整合驗證

- 起始既有套件：363 個測試。
- RED 1：hook／installer 新介面尚未實作時 39 個預期失敗；實作後轉綠。
- RED 2：文件新要求 4 個失敗，原指令文件覆蓋與分類另抓到 prepare 未列出的 2 個失敗；更新文件與分類後轉綠。
- RED 3：hooksPath 前後空白及無法判讀 Git root，3 個預期失敗；修正後轉綠。
- RED 4：CHANGELOG 缺安裝／公開 fork 相容性提醒，先 1 個失敗再補文案。
- 其他正向／防禦性覆蓋包括 Node 不在工具 PATH、換行 URL、巢狀 repo、模板目錄與刪除 refs。
- 最終完整套件：**415/415 通過**；完整 npm test 在隔離副本跑，未動工作目錄 trips/。

### 自動整合測試（tests/hooks-integration.test.js）

使用真實來源 hook／installer／模組及 prepare 定義建立最小無相依 fixture repo：

- 真正 git clone（證明 clone 沒複製 hooks 設定）。
- 真正 npm install（offline，沒有第三方 dependencies）啟動 prepare。
- `git config --get core.hooksPath` 讀到 `.githooks`。
- 真正 git push：GitHub SSH URL 經測試 SSH 替身只導向本機 bare repo，gh 替身回 PUBLIC，推送被 hook 擋且 refs 不變。
- 同一條傳輸在 PRIVATE 時成功，證明不是傳輸錯誤導致假通過。
- 再改 PUBLIC，刪除另一個分支也被擋；總共三次 gh 查核，沒有快取。
- fetch URL 與 push URL 不同，查核的是 push argv 的 GitHub repo。

### 額外完整專案快照實測

不只最小 fixture。以目前完整引擎來源（只有 trips/_example）建立暫存 repo，保留真實 package.json 與 lockfile：

- 真正 clone → npm install（包含專案相依套件）→ `.githooks` 設定確認。
- 同樣做 PUBLIC 拒絕、refs 不變及 PRIVATE 正向對照。
- 複本安裝後沒有 package-lock 變更；主工作目錄沒有安裝 node_modules 或改動 trips/。
- 執行證據：`/tmp/tp-full-hook-install-result.log`；完整測試結果：`/tmp/tp-hook-release-suite.log`（本機暫存檔，不進 git）。

**所有推送實驗都只到本機 bare repo。gh 為替身，SSH 只允許固定的本機 receive-pack，沒有對真實 GitHub 推送。**
因此驗證的是 Git/npm lifecycle 與 hook 阻擋，不是實際 GitHub API 可用性或各款桌面工具的 hook 支援情況。

## Review 建議

- 查核 URL 是否只取 argv，GH_HOST 是否固定到相同服務。
- PRIVATE 成功條件是否 fail closed，刪除／README-only 是否仍查核。
- 模板例外是否只按要求的目錄條件，不被 remote 名稱混淆。
- core.hooksPath 是否保留其他設定，是否會误改外層 repo。
- 本機整合的拒絕是否真由 hook 引起，正向對照與遠端 refs 是否都有驗證。
- 公開 contrib fork 被拒絕與 --no-verify／工具不執行 hooks 的限制是否說清楚。

未部署、未 fork／PR、未對真實 GitHub push；未放寬 schema、未改工作目錄 trips/。
