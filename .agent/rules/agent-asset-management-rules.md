---
paths:
  - ".ai/**"
  - "AGENTS.md"
  - "CLAUDE.md"
  - ".agent/**"
  - ".agents/**"
  - ".claude/**"
  - ".codex/**"
  - "scripts/sync-agent-assets.mjs"
  - "scripts/sync-agent-assets-lib/**"
---

# Agent 文件的管理規則

這個專案把「人維護的、跨工具共用的」內容放在 `.ai/`，那是唯一來源。

## 唯一來源

共用內容只維護在：

- `.ai/rules/`
- `.ai/skills/`（一個 skill 一個資料夾，裡面要有 `SKILL.md`；其他東西不會被同步）
- `.ai/commands/`
- `.ai/workflows/`
- `.ai/entrypoints/`（`project-context.md`，以及選用的 `claude-preamble.md` / `agents-preamble.md`）

`.agent/`、`.agents/`、`.claude/`、`.codex/`、`AGENTS.md`、`CLAUDE.md` 都是同步產物。不要改同步出來的副本；改 `.ai/`，再執行 `AGENTS.md` 開頭寫的同步指令。

## 各工具怎麼拿到這些內容

每個工具都應該透過它實際會讀的機制，把每份內容讀到一次：

- Claude Code 從 `.claude/rules/` 載入規則全文。`CLAUDE.md` 只放專案說明和規則索引；在那裡重複全文，每條規則就會被載入兩次。
- Codex 只讀 `AGENTS.md`，不讀 `.codex/rules/`（那裡放的是 Starlark `.rules` 指令政策）。`AGENTS.md` 附上一律載入規則的全文、只列出有 `paths` 的規則，而且要維持在 Codex 預設的 32 KiB `project_doc_max_bytes` 以內；超過時同步會發出警告。
- Codex 沒有 command 機制，所以同步會把每個 `.ai/commands/<name>.md` 包成 `source-command-<name>` skill。不要手寫這些包裝。
- 同步沒有產生入口檔的工具（例如 `.cursorrules`），只放一段指向 `AGENTS.md` 和 `.ai/` 的短指標。不要把規則摘要抄進去，摘要一定會跟正本走樣。

## 用複製，不用 symlink

同步預設直接複製檔案（`.ai/agent-assets.config.json` 的 `linkMode: "copy"`）。

- 原因：commit 進 git 的 symlink，在 Windows 上 clone（`core.symlinks=false`）會變成純文字檔；也有好幾個 agent 解析不了相對路徑的資料夾 symlink。
- 只有確定不會在 Windows 上 clone 的 repo，才用 `"linkMode": "symlink"`。已經是複製模式的 repo 改成 symlink 時，既有的副本會留著，要先手動刪掉。
- 已經被 git 追蹤的目標資料夾會原地同步，git 看到的是內容變更，而不是整批刪除再新增。

## 規則的適用範圍

- 有 `paths` frontmatter 的規則只對特定路徑生效。Claude Code 在讀到符合的檔案時載入它；產生的索引會告訴 Codex 在碰那些檔案之前先讀它。
- 用 `paths:`，不要用 Cursor 風格的 `globs:`。Claude Code 不認 `globs`，這種規則會在每個 session 都被載入，而且不會有任何提示；同步會對此發出警告。
- 規則的 `paths` 要和內文裡「碰到以下範圍時」的清單一致，兩邊一起改。
- 沒有 `paths` 的規則一律載入，每個 session 都會讀到。一律載入的規則要少、要短。
- 有 `paths` 的規則在讀檔時才載入，不會提前。必須在打開任何檔案之前就影響規劃的規則，要維持一律載入。

## 共用內容與工具產生的內容

穩定、由人維護的內容放 `.ai/`。產生出來的或工具專屬的內容，留在擁有它的工具資料夾：

- 其他工具產生的 skill 和 command（例如 `spectra-*`、`openspec-*`）。搬進 `.ai/` 的話，會和重新產生它們的工具走樣，或被那個工具覆蓋。
- 本機設定、快取、worktree 狀態。

同步會把它建立過的東西記在 `.ai/.agent-assets-sync.json`，改名或刪除後只清掉自己留下的舊副本。其他工具或人放進工具資料夾的檔案一律不碰；但每個同步出去的 skill 資料夾會完整對應它的來源，不要在裡面另外加檔案。

專案專屬的 skill 和 command 用 `<project>-` 當前綴，避免和 plugin 或第三方 skill 撞名，也比較好搜尋。

## 入口檔的前言

- 必須放在產生標題之上的手寫內容，寫在 `.ai/entrypoints/claude-preamble.md` 或 `agents-preamble.md`。
- 其他工具插入的 `<!-- NAME:START -->` … `<!-- NAME:END -->` 區塊，每次同步都會保留下來，並移到產生標題之上。

## 改了共用內容之後

1. 改 `.ai/` 底下那份正本。
2. 執行 `AGENTS.md` 開頭寫的同步指令。
3. 檢查 `AGENTS.md`、`CLAUDE.md`、同步的警告訊息，以及各工具的目標資料夾。

選用：在編輯器搜尋中隱藏同步出來的副本，讓人去改正本。例如 VS Code 的 `files.exclude` / `search.exclude` 排除 `.claude/rules`、`.claude/skills`、`.agents/skills`、`.codex/skills`。不要排除整個工具資料夾，那裡也放著設定檔。
