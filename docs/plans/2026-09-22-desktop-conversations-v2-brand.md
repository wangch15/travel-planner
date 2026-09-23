# Desktop conversations and v2 brand implementation plan

> Execute in the existing lamprey worktree; user authorized implementation. Use subagent-driven-development for the independent brand task and staged review. Do not commit, push or modify real trip content without the existing confirmation flow.

**Goal:** Persist each trip's local chat and drafts, continue its actual Codex thread, and replace all app brand surfaces with user-selected v2 marks.

**Architecture:** App user-data owns versioned per-trip conversation files, keyed by canonical project root and slug. Main process records requests before sending and outcomes before returning; renderer only receives display state. Codex resumes the recorded thread under the same account binding and revalidates policy, model and current trip snapshot each turn. Unknown interrupted requests do not auto-retry. Pending proposal approval does not survive restart.

**Tech stack:** Existing Electron/Node/CommonJS and Codex 0.155.1 app-server. No new dependencies.

## Task 1: Conversation store

Create desktop/prototype/conversation-store.cjs and tests/conversation-store.test.cjs. Atomically persist messages, draft, selected scope/model, thread binding and request state. Bound size, reject malformed/linked files and directory replacement, serialize writes. Preserve corrupt files; never silently reset. Test restart recovery, trip isolation, concurrent mutations, refused corrupt/link targets and interrupted run markers.

## Task 2: Actual thread continuity

Modify codex/editor.cjs and tests/editor.test.cjs. Add optional recorded thread and asynchronous thread checkpoint callback. For resumed threads use official thread/read and thread/resume, reject active/missing/mismatched threads; never silently fork. Persist thread id before turn/start. Apply current scope instructions on resume and current model on each turn. Include host proposal outcome and fresh snapshot so old proposed content isn't treated as saved. Test start/resume, model/scope change, permission checks and no resend on failures.

## Task 3: Main/UI integration

Modify main.cjs, preload.cjs, app.js, index.html and workflow smoke. Main owns durable message lifecycle and binds threads to account. Fixed read/preferences/reset IPC, target validation. Restore transcript/draft/model/scope, debounce drafts with explicit flush on selection/send and close. Display save/recovery failures. Explicit new AI context keeps visible history with a separator. Reopening a pending candidate restores chat with a warning; it cannot recreate approval or auto-save. Test two real fake-model turns + app recreation and draft/model restore; no real user content mutation.

## Task 4: v2 brand

Copy original v2 on-light/on-dark transparent SVGs byte-for-byte. Direct UI mark references follow effective selected theme. Derive favicon and PNG/ICO/ICNS with platform background/padding preserving aspect ratio. Update allowlists/checksums/manifests and visual tests. Retire old references. Owned by logo_v2 worker.

## Task 5: Review and validation

Run targeted tests and native workflow/startup/UI smoke. Inspect rendered light/dark and small/large marks. Independent spec then quality review. Real AI verification uses user's connected app profile with ordinary included usage check and a temporary sample itinerary; test follow-up references and candidate preview, without saving real trip files. If auth/quota prevents it, record exact blocker without automatic account switching or paid fallback. Update README/design/handoff with evidence and remaining limits.

Official reference (2026-09-22): https://developers.openai.com/codex/app-server (Threads); local 0.155.1 generated JSON schema is the protocol contract.

## 最新補充：對話保存與 v2 Logo（2026-09-22）

- 目前階段：既有旅程對話／草稿／模型／範圍可重開恢復；Codex 原生 thread 續接、帳號綁定、未知／停止不重送、明確重開上下文已接線。未確認提案重開失效；沒有恢復人類批准。兩份 v2 原始透明 SVG 位元保留，UI／favicon／PNG／ICO／ICNS／manifest 已替換。
- 驗證：原生 workflow 包含跨視窗恢復、正常關窗草稿、模型與範圍、停止／中斷、儲存失敗時阻止導航與清理不可見提案。真實 gpt-5.6-sol 在 transport 重啟後理解前文指代，產生正確單日提案、完整驗證與候選 HTML；臨時來源未改。初次 Astra 第二輪超時查核為 interrupted。真實測試找出 scope instructions 延續干擾，改成共用指令＋每輪明示 mode 後通過。
- UI：側欄搜尋／分組／固定帳號入口與設定分組已加入；來源是 Computer Use 實際 Codex 側欄觀察和使用者先前提供的設定參考。Computer Use 的焦點檢查目前拒絕鍵盤／點擊，尚未完成兩個 App 設定頁的實際操作研究；不得宣稱已完成。
- 等待確認：使用者手動打開 Codex 設定，以便續做 Computer Use 觀察。也待查看新版操作。
- 下一步：完成兩個 App 的設定頁觀察及必要調整；Windows 原生、安裝包、研究／發佈／備份與 quota 自動續作仍待後續。真實行程未改；未 commit／push／部署。
