---
trigger: always_on
---

# Agent 文件的管理規則

這個專案把「人維護的、跨工具共用的」內容放在 `.ai/`，那是唯一來源。

## 唯一來源

共用內容一律維護在這裡：

- `.ai/rules/`
- `.ai/skills/`
- `.ai/commands/`
- `.ai/workflows/`
- `.ai/entrypoints/`

**不要**在各工具自己的資料夾裡另外維護同一份內容：

- `.agent/`
- `.agents/`
- `.claude/`
- `.codex/`

那些資料夾要當成「同步產物」看待，不是來源。

## 正式進入點

各家工具掃描資料夾的行為不一致，所以要產生並維持這兩個進入點檔案：

- `AGENTS.md` —— 給 Codex 與其他通用 coding agent
- `CLAUDE.md` —— 給 Claude Code

另外 `GEMINI.md` 是手寫的指路檔（Gemini CLI 目前不會自動讀 `AGENTS.md`）。

**不要直接改產物裡的共用規則段落。** 改 `.ai/entrypoints/project-context.md`
或 `.ai/rules/*.md`，然後跑同步指令。

## 什麼放共用、什麼放工具目錄

放 `.ai/`：穩定的、人維護的內容。

留在工具自己的目錄：產生出來的或該工具專屬的東西，例如

- 工具自動產生的 command
- 本機設定
- 快取資料夾
- worktree 狀態
- 第三方工具產生的 skill

## 改了共用內容之後

改動規則、skill、command、workflow 或進入點的內容時：

1. 改 `.ai/` 底下那份來源檔。
2. 跑 `npm run sync:agent-assets`。
3. 檢查 `AGENTS.md`、`CLAUDE.md` 與各工具目錄有沒有跟上。

如果 `AGENTS.md` 或 `CLAUDE.md` 在產生的標題之前有工具自己加的前言，
同步腳本必須保留它。
