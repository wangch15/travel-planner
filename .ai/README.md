# 共用的 Agent 文件

這個資料夾是本專案 agent 文件的正本。

- `rules/`：給 coding agent 看的共用規則。加上 `paths` frontmatter 可以只對符合的檔案生效；沒有 `paths` 的規則每個 session 都會載入。
- `skills/`：本專案維護的 skill，一個 skill 一個資料夾，裡面要有 `SKILL.md`。
- `commands/`：共用的 command。Claude Code 拿到的是 command；Codex 拿到的是 `source-command-*` skill。
- `entrypoints/`：用來產生 `AGENTS.md`、`CLAUDE.md` 等入口檔的來源內容。
- `agent-assets.config.json`（選用）：`linkMode`（`copy` 或 `symlink`）與 `locale`（`en` 或 `zh-TW`）。

改了這個資料夾的檔案之後，執行 `AGENTS.md` 開頭寫的同步指令。沒有 package script 時，執行：

```bash
node scripts/sync-agent-assets.mjs
```
