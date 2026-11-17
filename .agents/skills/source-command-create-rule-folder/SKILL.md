---
name: source-command-create-rule-folder
description: "Create persistent rule documentation for a large module, page, calculator, workflow, or domain area"
---

<!-- Generated from .ai/commands/create-rule-folder.md by scripts/sync-agent-assets.mjs. Edit the source, not this file. -->

Use this skill when the user asks to run the `create-rule-folder` command.

Use the `create-rule-folder` skill.

Treat input after `/create-rule-folder` as the target domain and any initial rule decisions.

Required targets depend on the domain:

- co-located canonical docs under the module/page/workflow owner
- optional global agent reference at `.ai/rules/<domain>-rules-reference.md` when future agents must read the rules before working there
- optional domain-specific command only when the area will be updated frequently

The created docs should classify rules as:

- `Invariant`
- `Decision`
- `Open Question`

If `.ai/rules`, `.ai/skills`, or `.ai/commands` changes:

- run the agent asset sync command

If the target domain or owner path is unclear:

- ask one concise question before creating files
