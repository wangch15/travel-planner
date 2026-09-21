# Stage handoffs and privacy wording Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 補齊階段保存、每次 push 前私有檢查、agent 負責對外診斷去識別化、既有 status.md 寫入流程及 noindex 精確措辭。

**Architecture:** 僅增加／整理 .ai/ 共用規則與 skill 的必要步驟，不加自動 push 指令或新狀態系統。每階段引用唯一保存規則；每次推送查真正 origin push 目的地並顯式 gh 查詢，非 PRIVATE 或查詢失敗一律停止。進度先寫、再保存；備份結果不靠預填 status 或網站上線推定。

**Tech Stack:** Markdown、Node.js 文件契約與變異測試、既有 sync:agent-assets。

## 依序四個 commit

1. tests/stage-backup-docs.test.js 先紅，新增 stage-backup 規則與 plan／research／basemap／photos／maps／ship／update 的完成條件；repo-ownership 每次推送檢查，setup 與 ownership 移除 create --push 的隱含推送，改走同一檢查。失敗回報必須包含「目前只有本機備份，尚未異地備份」。同步、全套測試後 commit。
2. tests/diagnostic-sharing-docs.test.js 先紅，新增 agent 去識別化責任、最小摘要格式、使用者確認後才送；修 HELPER 與 bug 模板矛盾，保留給人的第二道警告。同步、全套測試後 commit。
3. tests/progress-docs.test.js 先紅，新增既有 status.md 更新規則，八個 skills 在完成／等待／阻礙時更新四欄。沒有 slug／資料夾時只回話，不能提前建立 trips/ 破壞 new 流程。調整 scripts/templates/docs/status.md，不動真實行程。同步、全套測試後 commit。
4. tests/privacy-wording.test.js 先紅，再統一 privacy、README 兩處與 setup 同類保證為請求而非保證；保留公開網址與非密碼保護說明，不修改網站 robots 行為。同步、全套測試後 commit。

## 驗證與限制

- 起始隔離副本 npm test 327/327 通過。
- 文件測試驗順序、條件→動作、明確情境，另用刪除必要步驟／放寬 PRIVATE 條件等變異驗證守門。
- 此輪規則不是 pre-push hook，不宣稱能技術上阻止不遵守流程的 agent；不實際呼叫 gh 查私人 repo 或 push。
- 不部署、不 push、不 fork、不開 PR，不改 trips/ 或行程 schema。
- npm test 在隔離副本執行，避免既有 fixtures 寫入工作目錄 trips/。
