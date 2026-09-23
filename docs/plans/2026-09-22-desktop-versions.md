# Desktop version history and selective rollback implementation plan

> Execute in the existing lamprey worktree using subagent-driven-development and independent spec/quality review. User approved the roadmap and version behavior. Do not commit/push or change the user's real trip during development.

**Goal:** Protect imported/saved itinerary arrangements with named local versions, readable change selection, historical rollback and durable pending proposals.

**Architecture:** Version history is per canonical project root/slug in App user-data. Version scope is the complete `data.js` itinerary content currently editable by this App; surrounding config/details/dining/maps/photos/theme remain untouched and are context-checked before historical restoration. Immutable records preserve source bytes and hash. Confirmed writes use a durable intent before atomic source replacement; re-open reconciles actual bytes, never infers approval from a draft. Rollback produces a previewable candidate and, upon confirmation, a new version. No history deletion or blind multi-file restore.

**Tech stack:** Existing Electron/Node, literal AST engine, bounded atomic local stores. No new dependencies.

## Tasks

1. Add VersionStore: initial/external observation, immutable numbered revisions, draft persistence, before-write intent and idempotent commit/reconciliation. Validate records, source hashes, limits and safe paths; reject corrupt stores without overwriting. Node tests for isolation, crashes, stale data and failure.
2. Generalize ProposalStore around a validated source candidate: readable field-level differences, selected subsets, preview receipt invalidation, multi-day historical field restore. Preserve full schema/private origin/source conflict gates and status/backup guards. Test no unselected changes and restoration creates new version through integration.
3. Wire main IPC: version list/restore/selection plus durable draft restore after preview; UI never supplies source paths/content for restore. Account changes cannot change pending save target. Saving records version intents first and reports a saved file separately from journal metadata failures.
4. UI: before/after checkboxes, history modal with timestamp/reason, full arrangement restore and day/field restore; explicit staged preview before save. Busy/error/empty states; preserve current conversation and unsent draft. Restore pending proposal with a new preview and no old approval receipt.
5. Native fake-project workflow: initial V1, selective AI edit -> V2, reopen pending proposal, whole rollback -> V3, partial historical restore, external conflict refusal. Source only changes after explicit confirmation; prior versions remain. Independent spec then quality reviews and relevant regression tests.

## Approved roadmap after version phase

- Private remote backup and accessible local restore/export (no push until explicit operation and fresh privacy checks).
- Cross-day AI changes, source-backed research/feasibility checks.
- Real new trip creation, references/attachments, managed publishing.
- Task recovery, quota waiting and handoff; richer chat rendering and progress.
- Windows native verification, distributable installers/signing and updates (requires platform/identity gates).

These are authorized product work, not a claim they already exist. Complete milestones and report remaining limits distinctly. Windows hardware verification and human account/preview/publishing confirmations remain real gates.

## 最新補充：日程版本與部分回復（2026-09-22）

- 目前階段：已實作初始 V1、本機保存版本、外部修改紀錄、修改前後對照與勾選、整體日程回復／跨日部分回復、回復後保留較新版本，以及未確認提案重開恢復。
- 邊界：版本是目前 App 可編輯的 data.js 日程；周邊資料不同即拒絕舊版套用，不還原照片／docs／部署。記錄不等同 GitHub 備份。最大100版本／32MiB，不會靜默刪歷史。Windows 尚未實機驗證，目錄 fsync 不宣稱 Windows 斷電保證。
- 驗證：fake native versions smoke 驗 V1→V6，含跨日部分還原、原位元完整還原、再找回後來版、重開提案與放棄操作重疊拒絕。Spec／quality review 修掉非同步放棄競態與未改日共享 const 引用的相容回歸。
- 等待確認：使用者查看實際操作。沒有要求對真實行程保存、部署或遠端推送；本輪用假資料測試。
- 下一步：依已授權 roadmap 繼續私人備份、研究查核／跨日AI、新旅程與發布，再到工作恢復與發行；它們尚未完成。完整計畫見 2026-09-22-desktop-versions.md。


## 驗證結果

- `npm test --workspaces --include-workspace-root`：root 501、engine 92、desktop 84，共 677 項全部通過。
- 原生 `smoke`、`smoke:workflow`、`smoke:versions` 通過；最後 versions smoke 包含放棄／選取／保存／回復操作互斥。
- Spec 與 quality review 的發現已修正並複查通過。測試視窗結束偶有 Chromium GPU teardown 訊息；assertions 與退出碼成功，不以此宣稱 Windows 已驗。
- 真實私人行程工作目錄仍乾淨，未保存真實提案、commit、push 或部署。
