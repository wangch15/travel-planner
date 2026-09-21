# Local deployment guard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 成功部署後保存真實網址；Worker 已存在且不符合本趟上次成功部署的本機紀錄時阻擋。

**Architecture:** ship 可注入 wrangler runner。先做 repo 內撞名與資料驗證；whoami JSON 決定唯一帳號，將帳號綁定至後續只讀 deployments list 與 deploy。記錄存根目錄 `.local/deployments/<slug>.json`（gitignore、非產物、無 token/email）。上次版本 ID 要與最新部署的單一 100% version 相符，避免覆蓋他人後續部署。

**Tech Stack:** Node.js test/assert/fs/child_process、wrangler 4.135.0、既有 build 與 docs 同步。

## 已核對的介面

以使用者實測的能力範圍為準，未執行任何真實 wrangler 指令。
為避免猜輸出格式，下載 npm 的 wrangler@4.135.0 原始套件靜態閱讀：
`src/user/commands.ts` whoami --json、`src/versions/deployments/list.ts` --json、
`src/user/whoami.ts` 的 loggedIn/accounts、deploy 的 Current Version ID。
套件中 WORKER_NOT_FOUND_ERR_CODE=10007；只認此精確錯誤碼搭配本次查詢 endpoint，
不把任意非零／404／空列表視為不存在。其他錯誤一律停止。

## 步驟與測試

1. 先寫 tests/ship.test.js：用注入 runner 依命令回傳 whoami/list/deploy 假輸出；
   舊 ship 無注入入口應先紅。測新 Worker、同目標更新、跨 repo 無紀錄、帳號／名稱／版本不符、
   未登入／網路／權限／未知錯誤、格式錯誤、空列表、部署失敗、成功但網址解析／記錄失敗。
2. 寫 tests 的本機檔案與 gitignore 測試：只保存必要欄位、隔離 slug、損壞紀錄拒絕、
   cache 不進 git，不碰工作目錄 trips/。所有測試中的 wrangler 都是替身。
3. 實作 scripts/lib/deployment-state.js 與 scripts/ship.js，保留現有 repo 內撞名阻擋。
   `whoami --json` 可用唯一帳號，或明確 CLOUDFLARE_ACCOUNT_ID；多帳號不猜。
   首次網址未知就明說，既有紀錄顯示上次真實網址。部署成功後只從 stdout/stderr 的精確目標 URL 與版本 ID 建立紀錄。
4. Pages 保留既有部署功能，只記網址；不聲稱 deployments list 的 Worker 防撞適用 Pages。
5. 文件守門測試先紅，再改 which-trip、tp-ship、README；同步 .ai/ 產物。
6. 完整 npm test 在隔離副本執行、diff --check、同步冪等性檢查；單独 commit。

## 驗證紀錄

- 起始隔離副本 npm test：245/245 通過。
- 第一輪 RED：26 個新測試失敗；部署模組尚未有可注入入口、本機路徑尚未被 gitignore。
  建立實作後 26/26 通過；測試實際比對命令順序、版本與 cache 內容，不只是驗詞語。
- CLI／版本 RED：新增 ship 安全匯入與 CLI 非零回傳、wrangler 4.135.0 固定版本的測試，29 中 2 失敗；接線後 29/29 通過。
- 錯誤與文件 RED：混合 10007+權限/網路失敗、部署部分失敗訊息、cache 清理掩蓋錯誤，以及 3 個文件測試，共 6 個預期失敗；修復後轉綠。
- 解析 RED：whoami null／損壞帳號、時間相同而版本不同、損壞 version 列，3 個預期失敗；修復後转綠。
- 完整測試曾抓到 README 新部署段落放在 Repo 級指令分類內；新增獨立部署標題，未移除或放寬原守門斷言。
- 最後完整 npm test：284/284 通過。完整套件在隔離副本；新測試用 OS 暫存目錄与注入 runner，無真實 Cloudflare 呼叫。
- 正式 runner 另以假的本機 wrangler 套件與 spawn 替身驗證：關閉 stdin、telemetry，帳號明確傳遞。
- package.json 固定 wrangler 4.135.0；lock 原本已解析至此版本，只更新根相依宣告，未新增套件。
- `.ai/` 已同步；工作目錄 trips/、schema 與 ed36553 的分類規則未改。

## 邊界

- 不取得首次部署前未知的 workers.dev 子網域，不做 stdin 確認、不加結構化問答流程。
- 成功碼但缺 URL／版本資訊：明說已部署但紀錄未完成，非零退出，不偽裝成功保存。
- 換電腦或本機紀錄遺失，既有 Worker 會被阻擋；沒有自動認領或 force 參數。
- 檢查到部署間仍有競態；不是 Cloudflare 的原子條件式部署保證。
- 本次不做 status.md 或版本化同意。其後方向依使用者更正：先讓既有 status.md 被 skills 更新。
- 不部署、不 push、不 fork、不開 PR；未對真實 Cloudflare 做端到端測試。
