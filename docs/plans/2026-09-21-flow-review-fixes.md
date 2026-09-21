# 流程 review 修正 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 只修使用者指定的三層問題，每層一個 commit，保留 RED → GREEN 證據。

**Architecture:** contrib-check 檢查 base..HEAD 全部新增 commit 的路徑（包含 merge 與改名前後），禁止路徑以非零退出。流程規則只改 .ai/ 來源，再同步；文件守門測試保留原意並加強。

**Tech Stack:** Node.js 原生 test/assert、Git 暫存 repo、Markdown、既有 agent-assets 同步腳本。

## 限制與驗證方式

- 不改工作目錄的 trips/，不部署、不執行 wrangler、不 push、不 fork、不開 PR。
- 完整 npm test 在隔離副本執行：既有測試會建立及清除 trips/ 測試 fixtures。
- 不改 schema、不新增照片資料欄位；照片許可證據存既有私人 sources.md。
- 不實作版本化同意、小修改重新分類、Cloudflare 真實目標預查。留待另案核准。
- contrib 的 fork → push → PR 路徑未端到端驗證；只驗本機 Git 檢查。

## 第一層：contrib-check

Files: scripts/contrib-check.js、tests/contrib-check.test.js、tests/helpers/git-sandbox.js、.ai/rules/contributing-upstream.md。

1. 先增加文件守門測試，要求舊檢查限制的警告；執行 node --test tests/agent-docs.test.js 確认紅燈後降級文件承諾並同步。
2. 在暫存 Git repo 增加 CLI 回歸：禁止路徑非零退出、新增後刪除、改名／搬移、合併歷史、合併當下新增、乾淨引擎與 _example 放行、無效 base 拒絕。執行 node --test tests/contrib-check.test.js，確認缺陷造成紅燈。
3. 實作 git log base..HEAD（兩點），掃描所有新增 commit 的路徑，使用 NUL 分隔避免路徑轉義漏檢，處理 merge diff 與 rename；禁止路徑退出碼 1。
4. 本機回歸綠燈後，把文件守門測試改為要求已修正的精確承諾、限制及未驗證的端到端路徑；先看紅燈，再修文件並同步。
5. 完整 npm test、git diff --check、檢查 trips/ 無改動，commit 說明缺陷／原因／修法。

## 第二層：流程矛盾

Files: .ai/skills/tp-plan/SKILL.md、.ai/rules/which-trip.md、.ai/skills/tp-update/SKILL.md、.ai/entrypoints/project-context.md、tests/agent-docs.test.js、tests/new-trip.test.js。

1. 新增文件步驟順序與實際 new-trip 行為的回歸：依 plan 文件先後執行建立骨架／寫 brief，舊文件應因既有目錄失敗。
2. 文件測試要求 profile 只在閘門一後建立；明確指定但零／多匹配先停止；僅省略指定才能沿用前文；最近修改只作詢問線索。
3. 文件測試要求衝突先停、依歸屬與紀錄判斷，_example 屬引擎，不能一律 ours/theirs。
4. 先跑上述測試看到預期紅燈，再調整來源文件、同步，逐項跑回綠燈。
5. 完整 npm test、diff 檢查後 commit。

## 第三層：不準確承諾

Files: README.md、docs/how-it-works.md、docs/schema/photos.md、.ai/entrypoints/project-context.md、.ai/rules/privacy.md、.ai/skills/tp-plan/SKILL.md、.ai/skills/tp-photos/SKILL.md、.ai/skills/tp-research/references/photos.md、tests/agent-docs.test.js。

1. 測試先要求：migrate 可能改寫資料；私人筆記 push 到私有 GitHub；行程級與 repo 級指令分列；sections 關閉仍內嵌 HTML；官網照片須有明確再利用許可而非只有 credit，check 只驗欄位不保證許可。
2. 看到文件守門測試紅燈，再修來源與面向使用者的文件；不放寬 schema，不把授權紀錄偽装成程式自動查核。
3. 同步產物，完整 npm test、diff 檢查後 commit。

## 驗證紀錄

- 基線：隔離副本執行 npm test，213/213 通過。
- 第一層：先加暫時警告的文件測試，19 通過／1 失敗；降級承諾後 20/20 通過。
- 第一層 CLI RED：17 個測試中 8 個預期失敗（退出碼、刪除、改名、搬回、側支、merge、Unicode）；沒有網路或遠端操作。
- 第一層 CLI GREEN：17/17 通過。恢復精確承諾的文件測試先 19 通過／1 失敗，再修文件。
- 第一層完整 npm test：225/225 通過；同步 AGENTS.md／CLAUDE.md，git diff --check 通過。
- 第二層 RED：完整 npm test 226 通過／5 失敗。文件順序的真實 CLI 測試報 trips/synthetic 已經存在；其餘為 profile 時點、歧義回退、最近修改推斷、衝突選邊的守門測試。
- 第二層 GREEN：231/231 通過；另保留只有 brief 的既有目錄不可覆蓋之測試。new-trip 程式與 schema 未改。

## 交付

列三個 commit、各層紅／綠測試數與原因、同步結果、未做範圍與理由。端到端貢獻路徑未測，不宣稱可用。
